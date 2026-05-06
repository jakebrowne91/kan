import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { generateUID } from "@kan/shared/utils";

import { notes, users } from "../schema";

export const getAllByWorkspaceId = async (
  db: dbClient,
  workspaceId: number,
) => {
  const result = await db
    .select({
      publicId: notes.publicId,
      title: notes.title,
      content: notes.content,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(notes)
    .leftJoin(users, eq(notes.createdBy, users.id))
    .where(and(eq(notes.workspaceId, workspaceId), isNull(notes.deletedAt)))
    .orderBy(
      desc(sql`COALESCE(${notes.updatedAt}, ${notes.createdAt})`),
      desc(notes.createdAt),
    );

  return result.map((note) => ({
    ...note,
    user: note.user?.id ? note.user : null,
  }));
};

export const getByPublicId = async (db: dbClient, notePublicId: string) => {
  const [note] = await db
    .select({
      id: notes.id,
      publicId: notes.publicId,
      title: notes.title,
      content: notes.content,
      workspaceId: notes.workspaceId,
      createdBy: notes.createdBy,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(notes)
    .leftJoin(users, eq(notes.createdBy, users.id))
    .where(and(eq(notes.publicId, notePublicId), isNull(notes.deletedAt)));

  if (!note) return undefined;

  return {
    ...note,
    user: note.user?.id ? note.user : null,
  };
};

export const getByWorkspaceIdAndTitle = async (
  db: dbClient,
  workspaceId: number,
  title: string,
) => {
  const [note] = await db
    .select({
      id: notes.id,
      publicId: notes.publicId,
      title: notes.title,
      content: notes.content,
      workspaceId: notes.workspaceId,
      createdBy: notes.createdBy,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, workspaceId),
        eq(notes.title, title),
        isNull(notes.deletedAt),
      ),
    );

  return note;
};

export const create = async (
  db: dbClient,
  noteInput: {
    title: string;
    content: string;
    workspaceId: number;
    createdBy: string;
  },
) => {
  const [note] = await db
    .insert(notes)
    .values({
      publicId: generateUID(),
      title: noteInput.title,
      content: noteInput.content,
      workspaceId: noteInput.workspaceId,
      createdBy: noteInput.createdBy,
    })
    .returning({
      publicId: notes.publicId,
      title: notes.title,
      content: notes.content,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    });

  return note;
};

export const update = async (
  db: dbClient,
  notePublicId: string,
  noteInput: {
    title?: string;
    content?: string;
  },
) => {
  const [note] = await db
    .update(notes)
    .set({
      ...noteInput,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.publicId, notePublicId), isNull(notes.deletedAt)))
    .returning({
      publicId: notes.publicId,
      title: notes.title,
      content: notes.content,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    });

  return note;
};

export const softDelete = async (
  db: dbClient,
  notePublicId: string,
  deletedBy: string,
) => {
  const [note] = await db
    .update(notes)
    .set({
      deletedAt: new Date(),
      deletedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.publicId, notePublicId), isNull(notes.deletedAt)))
    .returning({
      publicId: notes.publicId,
    });

  return note;
};
