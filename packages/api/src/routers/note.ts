import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as noteRepo from "@kan/db/repository/note.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { noteDeleteResponseSchema, noteSchema } from "../schemas";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  assertCanDelete,
  assertCanEdit,
  assertPermission,
} from "../utils/permissions";

const markdownNoteInput = z.object({
  title: z.string().trim().min(1).max(2000),
  content: z.string().max(50000),
});

const getWorkspace = async (
  db: Parameters<typeof workspaceRepo.getByPublicId>[0],
  workspacePublicId: string,
) => {
  const workspace = await workspaceRepo.getByPublicId(db, workspacePublicId);

  if (!workspace)
    throw new TRPCError({
      message: "Workspace not found",
      code: "NOT_FOUND",
    });

  return workspace;
};

const getNote = async (
  db: Parameters<typeof noteRepo.getByPublicId>[0],
  notePublicId: string,
) => {
  const note = await noteRepo.getByPublicId(db, notePublicId);

  if (!note)
    throw new TRPCError({
      message: "Note not found",
      code: "NOT_FOUND",
    });

  return note;
};

export const noteRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "Get notes",
        method: "GET",
        path: "/notes",
        description: "Retrieves markdown notes for a workspace",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.array(noteSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const workspace = await getWorkspace(ctx.db, input.workspacePublicId);
      await assertPermission(ctx.db, userId, workspace.id, "workspace:view");

      return noteRepo.getAllByWorkspaceId(ctx.db, workspace.id);
    }),
  byId: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a note",
        method: "GET",
        path: "/notes/{notePublicId}",
        description: "Retrieves a markdown note by public ID",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(z.object({ notePublicId: z.string().min(12) }))
    .output(noteSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const note = await getNote(ctx.db, input.notePublicId);
      await assertPermission(ctx.db, userId, note.workspaceId, "workspace:view");

      return note;
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a note",
        method: "POST",
        path: "/notes",
        description: "Creates a markdown note in a workspace",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(
      markdownNoteInput.extend({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(noteSchema.omit({ user: true }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const workspace = await getWorkspace(ctx.db, input.workspacePublicId);
      await assertPermission(ctx.db, userId, workspace.id, "card:create");

      const note = await noteRepo.create(ctx.db, {
        title: input.title,
        content: input.content,
        workspaceId: workspace.id,
        createdBy: userId,
      });

      if (!note)
        throw new TRPCError({
          message: "Failed to create note",
          code: "INTERNAL_SERVER_ERROR",
        });

      return note;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a note",
        method: "PATCH",
        path: "/notes/{notePublicId}",
        description: "Updates a markdown note",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(
      z
        .object({
          notePublicId: z.string().min(12),
          title: z.string().trim().min(1).max(2000).optional(),
          content: z.string().max(50000).optional(),
        })
        .refine((input) => input.title !== undefined || input.content !== undefined, {
          message: "Nothing to update",
        }),
    )
    .output(noteSchema.omit({ user: true }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const note = await getNote(ctx.db, input.notePublicId);
      await assertCanEdit(
        ctx.db,
        userId,
        note.workspaceId,
        "card:edit",
        note.createdBy,
      );

      const updatedNote = await noteRepo.update(ctx.db, input.notePublicId, {
        title: input.title,
        content: input.content,
      });

      if (!updatedNote)
        throw new TRPCError({
          message: "Failed to update note",
          code: "INTERNAL_SERVER_ERROR",
        });

      return updatedNote;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a note",
        method: "DELETE",
        path: "/notes/{notePublicId}",
        description: "Deletes a markdown note",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(z.object({ notePublicId: z.string().min(12) }))
    .output(noteDeleteResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const note = await getNote(ctx.db, input.notePublicId);
      await assertCanDelete(
        ctx.db,
        userId,
        note.workspaceId,
        "card:delete",
        note.createdBy,
      );

      const deletedNote = await noteRepo.softDelete(
        ctx.db,
        input.notePublicId,
        userId,
      );

      if (!deletedNote)
        throw new TRPCError({
          message: "Failed to delete note",
          code: "INTERNAL_SERVER_ERROR",
        });

      return { success: true };
    }),
});
