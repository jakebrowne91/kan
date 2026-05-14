import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { createDrizzleClient } from "@kan/db/client";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardAgentRunRepo from "@kan/db/repository/cardAgentRun.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import { cardAgentRuns, lists } from "@kan/db/schema";

import { env } from "~/env";

export const config = {
  api: {
    bodyParser: false,
  },
};

const SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

const callbackSchema = z.object({
  eventId: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().max(200).optional(),
  status: z.enum(["completed", "failed", "needs_input"]),
  sessionUrl: z.string().trim().url().max(2048).optional(),
  answer: z.string().trim().max(8000).optional(),
  question: z.string().trim().max(2000).optional(),
  summary: z.string().trim().max(12000).optional(),
  artifacts: z.array(z.unknown()).optional(),
  ticket: z.record(z.unknown()).nullable().optional(),
  ticketParameters: z.record(z.unknown()).optional(),
});

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
  const secret = env.ARI_GOLD_EXTERNAL_AGENT_WEBHOOK_SECRET;
  if (!secret) return false;

  const timestamp = getHeader(req, "x-ari-callback-timestamp");
  const signature = getHeader(req, "x-ari-callback-signature");

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

function jsonError(res: NextApiResponse, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

function compact(value: string | undefined, maxLength: number) {
  if (!value) return "";
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 15).trimEnd()}\n[truncated]`;
}

function parseEventId(eventId: string) {
  const match = /^gsd-card:([^:]+):([^:]+)$/.exec(eventId);
  if (!match?.[1] || !match[2]) return null;
  return {
    cardPublicId: match[1],
    runPublicId: match[2],
  };
}

function normaliseListName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getReviewListName(status: z.infer<typeof callbackSchema>["status"]) {
  if (status === "completed") return "Ready for Review";
  if (status === "needs_input") return "Investigating";
  return null;
}

function renderAgentReview(
  payload: z.infer<typeof callbackSchema>,
  runPublicId: string,
) {
  const statusLabel =
    payload.status === "completed"
      ? "Ready for Review"
      : payload.status === "needs_input"
        ? "Needs Input"
        : "Failed";
  const lines = [
    "## Agent Review",
    "",
    `- Status: ${statusLabel}`,
    `- Run ID: ${runPublicId}`,
    `- Ari session: ${payload.sessionUrl ?? payload.sessionId ?? "Not linked"}`,
    `- Updated at: ${new Date().toISOString()}`,
  ];

  if (payload.summary) {
    lines.push("", "### Summary", "", compact(payload.summary, 6000));
  }

  if (payload.answer && payload.answer !== payload.summary) {
    lines.push("", "### Answer", "", compact(payload.answer, 4000));
  }

  if (payload.question) {
    lines.push("", "### Question", "", compact(payload.question, 2000));
  }

  return lines.join("\n");
}

function upsertAgentReviewSection(description: string | null, section: string) {
  const current = description ?? "";
  const sourceMarker = current.match(/\n---\nSource:[\s\S]*$/);
  const beforeMarker = sourceMarker
    ? current.slice(0, sourceMarker.index).trimEnd()
    : current.trimEnd();
  const withoutOldSection = beforeMarker
    .replace(/\n## Agent Review[\s\S]*$/m, "")
    .trimEnd();

  return [
    withoutOldSection,
    withoutOldSection ? "" : undefined,
    section,
    sourceMarker?.[0]?.trimStart(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function getRunWithCard(db: DbClient, runPublicId: string) {
  return db.query.cardAgentRuns.findFirst({
    where: eq(cardAgentRuns.publicId, runPublicId),
    with: {
      card: {
        columns: {
          id: true,
          publicId: true,
          description: true,
          listId: true,
        },
        with: {
          list: {
            columns: {
              id: true,
              boardId: true,
            },
          },
        },
      },
    },
  });
}

async function moveCardForStatus(
  db: DbClient,
  args: {
    cardId: number;
    currentListId: number;
    boardId: number;
    createdBy: string | null;
    status: z.infer<typeof callbackSchema>["status"];
  },
) {
  const targetListName = getReviewListName(args.status);
  if (!targetListName) return null;

  const boardLists = await db.query.lists.findMany({
    columns: {
      id: true,
      name: true,
    },
    where: and(eq(lists.boardId, args.boardId), isNull(lists.deletedAt)),
  });
  let targetList = boardLists.find(
    (list) =>
      normaliseListName(list.name) === normaliseListName(targetListName),
  );

  if (!targetList && args.createdBy) {
    await listRepo.create(db, {
      name: targetListName,
      createdBy: args.createdBy,
      boardId: args.boardId,
    });
    targetList = await db.query.lists.findFirst({
      columns: {
        id: true,
        name: true,
      },
      where: and(
        eq(lists.boardId, args.boardId),
        eq(lists.name, targetListName),
        isNull(lists.deletedAt),
      ),
    });
  }

  if (!targetList || targetList.id === args.currentListId) return targetList;

  await cardRepo.reorder(db, {
    cardId: args.cardId,
    newListId: targetList.id,
    newIndex: undefined,
  });

  if (args.createdBy) {
    await cardActivityRepo.create(db, {
      type: "card.updated.list",
      cardId: args.cardId,
      createdBy: args.createdBy,
      fromListId: args.currentListId,
      toListId: targetList.id,
    });
  }

  return targetList;
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

  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    jsonError(res, 400, parsed.error.issues[0]?.message ?? "Invalid payload");
    return;
  }

  const event = parseEventId(parsed.data.eventId);
  if (!event) {
    jsonError(res, 400, "Unsupported eventId");
    return;
  }

  const db = getDb();
  const run = await getRunWithCard(db, event.runPublicId);

  if (!run?.card || run.card.publicId !== event.cardPublicId) {
    jsonError(res, 404, "Agent run not found");
    return;
  }

  const response = parsed.data;
  if (response.status === "completed") {
    await cardAgentRunRepo.markReadyForReview(db, {
      publicId: event.runPublicId,
      response,
    });
  } else if (response.status === "needs_input") {
    await cardAgentRunRepo.markNeedsInput(db, {
      publicId: event.runPublicId,
      response,
    });
  } else {
    await cardAgentRunRepo.markFailed(db, {
      publicId: event.runPublicId,
      error: response.summary ?? response.answer ?? "Ari Gold run failed",
      response,
    });
  }

  await cardRepo.update(
    db,
    {
      description: upsertAgentReviewSection(
        run.card.description,
        renderAgentReview(response, event.runPublicId),
      ),
    },
    { cardPublicId: run.card.publicId },
  );

  const movedTo = await moveCardForStatus(db, {
    cardId: run.card.id,
    currentListId: run.card.listId,
    boardId: run.card.list.boardId,
    createdBy: run.createdBy,
    status: response.status,
  });

  res.status(200).json({
    ok: true,
    cardPublicId: run.card.publicId,
    runPublicId: event.runPublicId,
    movedTo: movedTo?.name ?? null,
  });
}
