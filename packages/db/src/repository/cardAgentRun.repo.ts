import { desc, eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardAgentRuns } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  args: {
    cardId: number;
    createdBy: string;
    agent: string;
    prompt: string;
  },
) => {
  const [run] = await db
    .insert(cardAgentRuns)
    .values({
      publicId: generateUID(),
      cardId: args.cardId,
      createdBy: args.createdBy,
      agent: args.agent,
      prompt: args.prompt,
      status: "requested",
    })
    .returning();

  if (!run) throw new Error("Unable to create card agent run");

  return run;
};

export const markRunning = async (
  db: dbClient,
  args: {
    publicId: string;
    supersetWorkspaceId: string | null;
    supersetSessionId: string | null;
    supersetUrl: string | null;
    response: unknown;
  },
) => {
  const [run] = await db
    .update(cardAgentRuns)
    .set({
      status: "running",
      supersetWorkspaceId: args.supersetWorkspaceId,
      supersetSessionId: args.supersetSessionId,
      supersetUrl: args.supersetUrl,
      response: args.response,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(cardAgentRuns.publicId, args.publicId))
    .returning();

  if (!run) throw new Error("Unable to update card agent run");

  return run;
};

export const markFailed = async (
  db: dbClient,
  args: { publicId: string; error: string; response?: unknown },
) => {
  const [run] = await db
    .update(cardAgentRuns)
    .set({
      status: "failed",
      error: args.error,
      response: args.response,
      updatedAt: new Date(),
    })
    .where(eq(cardAgentRuns.publicId, args.publicId))
    .returning();

  if (!run) throw new Error("Unable to update card agent run");

  return run;
};

export const listByCardId = (db: dbClient, cardId: number) => {
  return db.query.cardAgentRuns.findMany({
    where: eq(cardAgentRuns.cardId, cardId),
    orderBy: desc(cardAgentRuns.createdAt),
  });
};
