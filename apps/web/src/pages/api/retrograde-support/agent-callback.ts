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
const ticketUpdateStatusSchema = z.enum([
  "ready_for_review",
  "resolved",
  "needs_input",
  "failed",
]);
const callbackStatusSchema = z.enum([
  "completed",
  "failed",
  "needs_input",
  "ready_for_review",
  "resolved",
]);

const ticketUpdateSchema = z
  .object({
    status: ticketUpdateStatusSchema.optional(),
    summary: z.string().trim().max(12000).optional(),
    rootCause: z.string().trim().max(4000).optional(),
    userImpact: z.string().trim().max(4000).optional(),
    fix: z.string().trim().max(4000).optional(),
    verification: z.string().trim().max(4000).optional(),
    reviewNotes: z.string().trim().max(4000).optional(),
    prUrl: z.string().trim().url().max(2048).optional(),
    branch: z.string().trim().max(300).optional(),
    question: z.string().trim().max(2000).optional(),
    needsInputQuestion: z.string().trim().max(2000).optional(),
  })
  .passthrough();

const callbackSchema = z.object({
  eventId: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().max(200).optional(),
  status: callbackStatusSchema,
  sessionUrl: z.string().trim().url().max(2048).optional(),
  answer: z.string().trim().max(12000).optional(),
  question: z.string().trim().max(2000).optional(),
  summary: z.string().trim().max(12000).optional(),
  artifacts: z.array(z.unknown()).optional(),
  ticketUpdate: ticketUpdateSchema.nullable().optional(),
  ticket: z.record(z.unknown()).nullable().optional(),
  ticketParameters: z.record(z.unknown()).optional(),
  supportContext: z.record(z.unknown()).optional(),
  gsdTicket: z.record(z.unknown()).optional(),
});

type CallbackPayload = z.infer<typeof callbackSchema>;
type TicketUpdate = z.infer<typeof ticketUpdateSchema>;
type TicketStatus = z.infer<typeof ticketUpdateStatusSchema>;
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

function extractTicketUpdateFromText(text: string | undefined): TicketUpdate {
  const match =
    /<gsd_ticket_update>\s*([\s\S]*?)\s*<\/gsd_ticket_update>/i.exec(
      text ?? "",
    );
  if (!match?.[1]) return {};

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    const result = ticketUpdateSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

function stripMachineBlocks(text: string | undefined) {
  return (text ?? "")
    .replace(/<gsd_ticket_update>[\s\S]*?<\/gsd_ticket_update>/gi, "")
    .replace(
      /<customer_support_result>[\s\S]*?<\/customer_support_result>/gi,
      "",
    )
    .trim();
}

function findPrUrl(payload: CallbackPayload, update: TicketUpdate) {
  if (update.prUrl) return update.prUrl;

  const text = [payload.summary, payload.answer]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const match = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/i.exec(text);
  return match?.[0];
}

function inferCompletedStatus(
  payload: CallbackPayload,
  update: TicketUpdate,
): TicketStatus {
  if (findPrUrl(payload, update)) return "ready_for_review";

  const text =
    `${payload.summary ?? ""}\n${payload.answer ?? ""}`.toLowerCase();
  if (
    /\b(no code change|no code changes|no implementation bug|no bug|smoke succeeded|smoke test only|not a bug|working as designed)\b/.test(
      text,
    )
  ) {
    return "resolved";
  }

  return "ready_for_review";
}

function resolveTicketStatus(
  payload: CallbackPayload,
  update: TicketUpdate,
): TicketStatus {
  if (payload.status === "failed") return "failed";
  if (update.status) return update.status;
  if (payload.status === "needs_input") return "needs_input";
  if (payload.status === "ready_for_review") return "ready_for_review";
  if (payload.status === "resolved") return "resolved";
  return inferCompletedStatus(payload, update);
}

function getReviewListName(status: TicketStatus) {
  if (status === "ready_for_review") return "Ready for Review";
  if (status === "resolved") return "Resolved";
  if (status === "needs_input") return "Investigating";
  return "Bug Raised";
}

function statusLabel(status: TicketStatus) {
  switch (status) {
    case "ready_for_review":
      return "Ready for Review";
    case "resolved":
      return "Resolved";
    case "needs_input":
      return "Needs Input";
    case "failed":
      return "Failed";
  }
}

function renderAgentReview(
  payload: CallbackPayload,
  update: TicketUpdate,
  runPublicId: string,
  ticketStatus: TicketStatus,
) {
  const summary = update.summary ?? stripMachineBlocks(payload.summary);
  const question =
    update.needsInputQuestion ?? update.question ?? payload.question ?? "";
  const prUrl = findPrUrl(payload, update);
  const lines = [
    "## Agent Review",
    "",
    `- Status: ${statusLabel(ticketStatus)}`,
    `- Run ID: ${runPublicId}`,
    `- Ari session: ${payload.sessionUrl ?? payload.sessionId ?? "Not linked"}`,
    `- Updated at: ${new Date().toISOString()}`,
  ];

  if (prUrl) lines.push(`- Pull request: ${prUrl}`);
  if (update.branch) lines.push(`- Branch: ${update.branch}`);

  if (summary) lines.push("", "### Summary", "", compact(summary, 6000));
  if (update.rootCause) {
    lines.push("", "### Root Cause", "", compact(update.rootCause, 4000));
  }
  if (update.userImpact) {
    lines.push("", "### User Impact", "", compact(update.userImpact, 4000));
  }
  if (update.fix)
    lines.push("", "### Fix / Action", "", compact(update.fix, 4000));
  if (update.verification) {
    lines.push("", "### Verification", "", compact(update.verification, 4000));
  }
  if (update.reviewNotes) {
    lines.push("", "### Review Notes", "", compact(update.reviewNotes, 4000));
  }
  if (payload.answer && payload.answer !== payload.summary) {
    lines.push(
      "",
      "### Answer",
      "",
      compact(stripMachineBlocks(payload.answer), 4000),
    );
  }
  if (question) lines.push("", "### Question", "", compact(question, 2000));

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
    status: TicketStatus;
  },
) {
  const targetListName = getReviewListName(args.status);
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
  const update =
    response.ticketUpdate ?? extractTicketUpdateFromText(response.summary);
  const ticketStatus = resolveTicketStatus(response, update);

  if (ticketStatus === "ready_for_review") {
    await cardAgentRunRepo.markReadyForReview(db, {
      publicId: event.runPublicId,
      response: { ...response, ticketUpdate: update, ticketStatus },
    });
  } else if (ticketStatus === "resolved") {
    await cardAgentRunRepo.markCompleted(db, {
      publicId: event.runPublicId,
      response: { ...response, ticketUpdate: update, ticketStatus },
    });
  } else if (ticketStatus === "needs_input") {
    await cardAgentRunRepo.markNeedsInput(db, {
      publicId: event.runPublicId,
      response: { ...response, ticketUpdate: update, ticketStatus },
    });
  } else {
    await cardAgentRunRepo.markFailed(db, {
      publicId: event.runPublicId,
      error:
        update.summary ??
        response.summary ??
        response.answer ??
        "Ari Gold run failed",
      response: { ...response, ticketUpdate: update, ticketStatus },
    });
  }

  await cardRepo.update(
    db,
    {
      description: upsertAgentReviewSection(
        run.card.description,
        renderAgentReview(response, update, event.runPublicId, ticketStatus),
      ),
    },
    { cardPublicId: run.card.publicId },
  );

  const movedTo = await moveCardForStatus(db, {
    cardId: run.card.id,
    currentListId: run.card.listId,
    boardId: run.card.list.boardId,
    createdBy: run.createdBy,
    status: ticketStatus,
  });

  res.status(200).json({
    ok: true,
    cardPublicId: run.card.publicId,
    runPublicId: event.runPublicId,
    status: ticketStatus,
    movedTo: movedTo?.name ?? null,
  });
}
