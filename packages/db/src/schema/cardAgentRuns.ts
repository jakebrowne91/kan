import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { cards } from "./cards";
import { users } from "./users";

export const cardAgentRunStatusEnum = pgEnum("card_agent_run_status", [
  "requested",
  "running",
  "needs_input",
  "ready_for_review",
  "failed",
]);

export const cardAgentRuns = pgTable(
  "card_agent_run",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    cardId: bigint("cardId", { mode: "number" })
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    agent: varchar("agent", { length: 64 }).notNull(),
    status: cardAgentRunStatusEnum("status").default("requested").notNull(),
    supersetWorkspaceId: text("supersetWorkspaceId"),
    supersetSessionId: text("supersetSessionId"),
    supersetUrl: text("supersetUrl"),
    prompt: text("prompt").notNull(),
    response: jsonb("response"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => [
    index("card_agent_run_card_created_idx").on(table.cardId, table.createdAt),
  ],
).enableRLS();

export const cardAgentRunsRelations = relations(cardAgentRuns, ({ one }) => ({
  card: one(cards, {
    fields: [cardAgentRuns.cardId],
    references: [cards.id],
  }),
  user: one(users, {
    fields: [cardAgentRuns.createdBy],
    references: [users.id],
  }),
}));
