import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

export const notes = pgTable(
  "note",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
    deletedBy: uuid("deletedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("note_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
  ],
).enableRLS();

export const notesRelations = relations(notes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [notes.workspaceId],
    references: [workspaces.id],
    relationName: "notesWorkspace",
  }),
  user: one(users, {
    fields: [notes.createdBy],
    references: [users.id],
    relationName: "notesCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [notes.deletedBy],
    references: [users.id],
    relationName: "notesDeletedByUser",
  }),
}));
