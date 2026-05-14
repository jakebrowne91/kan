import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { createDrizzleClient } from "@kan/db/client";
import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { boards, cards, lists, users, workspaces } from "@kan/db/schema";

import { env } from "~/env";

export const config = {
  api: {
    bodyParser: false,
  },
};

const DEFAULT_WORKSPACE_SLUG = "retrograde-support";
const DEFAULT_WORKSPACE_NAME = "Creator Compute Company Support";
const DEFAULT_BOARD_SLUG = "customer-support";
const DEFAULT_BOARD_NAME = "Customer Support";
const DEFAULT_LIST_NAMES = [
  "New",
  "Investigating",
  "Bug Raised",
  "Ready for Review",
  "Resolved",
];
const SUPPORT_BOT_EMAIL = "support-agent@getretrograde.ai";
const SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

const statusToListName = {
  new: "New",
  investigating: "Investigating",
  bug_raised: "Bug Raised",
  ready_for_review: "Ready for Review",
  resolved: "Resolved",
} as const;

const ticketDateRangeSchema = z
  .object({
    from: z.string().trim().max(80).optional(),
    to: z.string().trim().max(80).optional(),
    timezone: z.string().trim().max(80).optional(),
  })
  .passthrough();

const ticketParametersSchema = z
  .object({
    eventId: z.string().trim().max(200).optional(),
    userId: z.string().trim().max(200).optional(),
    emmaUserId: z.string().trim().max(200).optional(),
    email: z.string().trim().max(320).optional(),
    customerName: z.string().trim().max(200).optional(),
    issueCategory: z.string().trim().max(80).optional(),
    dateRange: ticketDateRangeSchema.optional(),
    reportedAt: z.string().trim().max(120).optional(),
    sourceChannel: z.string().trim().max(80).optional(),
    ariSessionId: z.string().trim().max(200).optional(),
    ariSessionUrl: z.string().trim().url().max(2048).optional(),
    repoFullName: z.string().trim().max(300).optional(),
  })
  .passthrough();

const ticketRequestSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(80).default("ari_gold"),
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().max(4000).optional(),
  details: z.string().trim().max(12000).optional(),
  sanitizedAnswer: z.string().trim().max(4000).optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]).nullable().optional(),
  status: z
    .enum([
      "new",
      "investigating",
      "bug_raised",
      "ready_for_review",
      "resolved",
    ])
    .default("new"),
  customer: z
    .object({
      userId: z.string().trim().max(200).optional(),
      emmaUserId: z.string().trim().max(200).optional(),
      email: z.string().trim().max(320).optional(),
      name: z.string().trim().max(200).optional(),
    })
    .optional(),
  parameters: ticketParametersSchema.optional(),
  ari: z
    .object({
      sessionId: z.string().trim().max(200).optional(),
      sessionUrl: z.string().trim().url().max(2048).optional(),
      repo: z.string().trim().max(300).optional(),
      mode: z.string().trim().max(80).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

type TicketRequest = z.infer<typeof ticketRequestSchema>;
type DbClient = ReturnType<typeof createDrizzleClient>;

let dbSingleton: DbClient | null = null;

function getDb() {
  dbSingleton ??= createDrizzleClient();
  return dbSingleton;
}

function getHeader(req: NextApiRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function verifySignature(req: NextApiRequest, rawBody: string): boolean {
  const secret = env.RETROGRADE_GSD_API_SECRET;
  if (!secret) return false;

  const timestamp = getHeader(req, "x-retrograde-gsd-timestamp");
  const signature = getHeader(req, "x-retrograde-gsd-signature");

  if (!timestamp || !signature?.startsWith("sha256=")) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  const timestampMs =
    timestampNumber > 1_000_000_000_000
      ? timestampNumber
      : timestampNumber * 1000;

  if (Math.abs(Date.now() - timestampMs) > SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const actualHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;

  const expectedHex = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  const words = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  return words.length
    ? words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : email;
}

async function ensureSupportUser(db: DbClient) {
  const email = normalizeEmail(SUPPORT_BOT_EMAIL);
  const existingUser = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
    },
    where: eq(users.email, email),
  });

  if (existingUser) return existingUser;

  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      name: getDisplayName(email),
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

  const user =
    createdUser ??
    (await db.query.users.findFirst({
      columns: {
        id: true,
        email: true,
        name: true,
      },
      where: eq(users.email, email),
    }));

  if (!user) throw new Error("Failed to create support ticket user");

  return user;
}

async function findWorkspaceBySlug(db: DbClient, slug: string) {
  return db.query.workspaces.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      slug: true,
    },
    where: and(eq(workspaces.slug, slug), isNull(workspaces.deletedAt)),
  });
}

async function ensureSupportWorkspace(
  db: DbClient,
  user: { id: string; email: string },
) {
  const slug = env.RETROGRADE_SUPPORT_WORKSPACE_SLUG ?? DEFAULT_WORKSPACE_SLUG;
  const name = env.RETROGRADE_SUPPORT_WORKSPACE_NAME ?? DEFAULT_WORKSPACE_NAME;
  const existingWorkspace = await findWorkspaceBySlug(db, slug);

  if (existingWorkspace) return existingWorkspace;

  await workspaceRepo
    .create(db, {
      name,
      slug,
      createdBy: user.id,
      createdByEmail: user.email,
      description: "Retrograde customer support workspace",
      plan: "team",
    })
    .catch(async (error) => {
      const workspace = await findWorkspaceBySlug(db, slug);
      if (workspace) return;
      throw error;
    });

  const workspace = await findWorkspaceBySlug(db, slug);
  if (!workspace) throw new Error(`Failed to create workspace ${slug}`);

  return workspace;
}

async function findBoardBySlug(
  db: DbClient,
  workspaceId: number,
  slug: string,
) {
  return db.query.boards.findFirst({
    columns: {
      id: true,
      publicId: true,
      name: true,
      slug: true,
    },
    where: and(
      eq(boards.workspaceId, workspaceId),
      eq(boards.slug, slug),
      isNull(boards.deletedAt),
    ),
  });
}

async function ensureSupportBoard(
  db: DbClient,
  userId: string,
  workspace: { id: number },
) {
  const slug = env.RETROGRADE_SUPPORT_BOARD_SLUG ?? DEFAULT_BOARD_SLUG;
  const name = env.RETROGRADE_SUPPORT_BOARD_NAME ?? DEFAULT_BOARD_NAME;
  const existingBoard = await findBoardBySlug(db, workspace.id, slug);

  if (existingBoard) return existingBoard;

  await boardRepo
    .create(db, {
      name,
      slug,
      createdBy: userId,
      workspaceId: workspace.id,
    })
    .catch(async (error) => {
      const board = await findBoardBySlug(db, workspace.id, slug);
      if (board) return;
      throw error;
    });

  const board = await findBoardBySlug(db, workspace.id, slug);
  if (!board) throw new Error(`Failed to create board ${slug}`);

  return board;
}

async function ensureSupportLists(
  db: DbClient,
  userId: string,
  board: { id: number },
) {
  const existingLists = await db.query.lists.findMany({
    columns: {
      id: true,
      publicId: true,
      name: true,
    },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });
  const byName = new Map(existingLists.map((list) => [list.name, list]));

  for (const name of DEFAULT_LIST_NAMES) {
    if (!byName.has(name)) {
      await listRepo.create(db, {
        name,
        createdBy: userId,
        boardId: board.id,
      });
    }
  }

  return db.query.lists.findMany({
    columns: {
      id: true,
      publicId: true,
      name: true,
    },
    where: and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
  });
}

function compact(value: string | undefined, maxLength: number) {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 15).trimEnd()}\n[truncated]`;
}

function renderMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return "";

  return `\n## Metadata\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n`;
}

function stringOrUnknown(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Unknown";
}

function renderDateRange(range: unknown) {
  if (!range || typeof range !== "object") return "Unknown";
  const record = range as Record<string, unknown>;
  const from = stringOrUnknown(record.from);
  const to = stringOrUnknown(record.to);
  const timezone = stringOrUnknown(record.timezone);
  const window =
    from !== "Unknown" && to !== "Unknown"
      ? `${from} to ${to}`
      : from !== "Unknown"
        ? from
        : to !== "Unknown"
          ? to
          : "Unknown";

  return timezone !== "Unknown" ? `${window} (${timezone})` : window;
}

function getHardParameters(input: TicketRequest) {
  return {
    eventId: input.parameters?.eventId ?? input.externalId,
    userId: input.parameters?.userId ?? input.customer?.userId,
    emmaUserId: input.parameters?.emmaUserId ?? input.customer?.emmaUserId,
    email: input.parameters?.email ?? input.customer?.email,
    issueCategory: input.parameters?.issueCategory,
    dateRange: input.parameters?.dateRange,
    reportedAt: input.parameters?.reportedAt,
    sourceChannel: input.parameters?.sourceChannel,
    ariSessionId: input.parameters?.ariSessionId ?? input.ari?.sessionId,
    ariSessionUrl: input.parameters?.ariSessionUrl ?? input.ari?.sessionUrl,
    repoFullName: input.parameters?.repoFullName ?? input.ari?.repo,
  };
}

function renderHardParameters(input: TicketRequest) {
  const params = getHardParameters(input);

  return [
    "## Hard Parameters",
    "",
    `- Event ID: ${stringOrUnknown(params.eventId)}`,
    `- User ID: ${stringOrUnknown(params.userId)}`,
    `- Emma user ID: ${stringOrUnknown(params.emmaUserId)}`,
    `- Email: ${stringOrUnknown(params.email)}`,
    `- Issue category: ${stringOrUnknown(params.issueCategory)}`,
    `- Date range: ${renderDateRange(params.dateRange)}`,
    `- Reported at: ${stringOrUnknown(params.reportedAt)}`,
    `- Source channel: ${stringOrUnknown(params.sourceChannel)}`,
    `- Ari session ID: ${stringOrUnknown(params.ariSessionId)}`,
    `- Ari session URL: ${stringOrUnknown(params.ariSessionUrl)}`,
    `- Repo: ${stringOrUnknown(params.repoFullName)}`,
  ];
}

function renderDescription(input: TicketRequest, marker: string) {
  const lines = [
    ...renderHardParameters(input),
    "",
    "## Summary",
    "",
    compact(input.summary ?? input.details ?? "No summary provided.", 4000),
    "",
    "## Customer",
    "",
    `- Name: ${input.customer?.name ?? "Unknown"}`,
    `- Email: ${input.customer?.email ?? "Unknown"}`,
    `- Emma user ID: ${
      input.customer?.emmaUserId ?? input.customer?.userId ?? "Unknown"
    }`,
    "",
    "## Ari",
    "",
    `- Session: ${input.ari?.sessionUrl ?? input.ari?.sessionId ?? "Not linked"}`,
    `- Repo: ${input.ari?.repo ?? "Not supplied"}`,
    `- Mode: ${input.ari?.mode ?? "Not supplied"}`,
  ];

  if (input.sanitizedAnswer) {
    lines.push(
      "",
      "## Safe User Answer",
      "",
      compact(input.sanitizedAnswer, 4000),
    );
  }

  if (input.details && input.details !== input.summary) {
    lines.push("", "## Details", "", compact(input.details, 8000));
  }

  const metadata = renderMetadata(input.metadata);
  if (metadata) lines.push(metadata.trimEnd());

  lines.push(
    "",
    "---",
    `Source: ${input.source}`,
    `External ID: ${input.externalId}`,
    `<!-- ${marker} -->`,
  );

  return lines.join("\n");
}

function getBaseUrl(req: NextApiRequest) {
  if (env.NEXT_PUBLIC_BASE_URL) return env.NEXT_PUBLIC_BASE_URL;

  const proto = getHeader(req, "x-forwarded-proto") ?? "http";
  const host = getHeader(req, "host");

  return host ? `${proto}://${host}` : "";
}

async function findExistingTicket(
  db: DbClient,
  boardId: number,
  marker: string,
) {
  const boardLists = await db.query.lists.findMany({
    columns: {
      id: true,
    },
    where: and(eq(lists.boardId, boardId), isNull(lists.deletedAt)),
  });
  const listIds = boardLists.map((list) => list.id);

  if (listIds.length === 0) return null;

  return db.query.cards.findFirst({
    columns: {
      publicId: true,
      cardNumber: true,
    },
    where: and(
      inArray(cards.listId, listIds),
      isNull(cards.deletedAt),
      sql`position(${marker} in coalesce(${cards.description}, '')) > 0`,
    ),
  });
}

function jsonError(res: NextApiResponse, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    jsonError(res, 405, "Method not allowed");
    return;
  }

  const rawBody = await readRawBody(req);
  if (!verifySignature(req, rawBody)) {
    jsonError(res, 401, "Invalid signature");
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    jsonError(res, 400, "Invalid JSON payload");
    return;
  }

  const parsed = ticketRequestSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, parsed.error.issues[0]?.message ?? "Invalid payload");
    return;
  }

  try {
    const input = parsed.data;
    const db = getDb();
    const user = await ensureSupportUser(db);
    const workspace = await ensureSupportWorkspace(db, user);
    const board = await ensureSupportBoard(db, user.id, workspace);
    const supportLists = await ensureSupportLists(db, user.id, board);
    const marker = `retrograde-support-ticket:${input.source}:${input.externalId}`;
    const existingTicket = await findExistingTicket(db, board.id, marker);
    const baseUrl = getBaseUrl(req);

    if (existingTicket) {
      res.status(200).json({
        ok: true,
        duplicate: true,
        cardPublicId: existingTicket.publicId,
        cardNumber: existingTicket.cardNumber,
        cardUrl: baseUrl ? `${baseUrl}/cards/${existingTicket.publicId}` : null,
        boardPublicId: board.publicId,
        workspacePublicId: workspace.publicId,
      });
      return;
    }

    const listName = statusToListName[input.status];
    const targetList = supportLists.find((list) => list.name === listName);

    if (!targetList) {
      jsonError(res, 500, `Support list ${listName} was not created`);
      return;
    }

    const card = await cardRepo.create(db, {
      title: input.title,
      description: renderDescription(input, marker),
      createdBy: user.id,
      listId: targetList.id,
      workspaceId: workspace.id,
      position: "end",
      priority: input.priority ?? null,
    });

    res.status(200).json({
      ok: true,
      duplicate: false,
      cardPublicId: card.publicId,
      cardNumber: card.cardNumber,
      cardUrl: baseUrl ? `${baseUrl}/cards/${card.publicId}` : null,
      boardPublicId: board.publicId,
      workspacePublicId: workspace.publicId,
      listPublicId: targetList.publicId,
    });
  } catch (error) {
    console.error("Failed to create Retrograde support ticket", error);
    jsonError(res, 500, "Unable to create support ticket");
  }
}
