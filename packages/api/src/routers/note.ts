import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as noteRepo from "@kan/db/repository/note.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import {
  noteAppendDailyResponseSchema,
  noteDeleteResponseSchema,
  noteSchema,
} from "../schemas";
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

const dailyNoteDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format");

const isValidTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const appendDailyNoteInput = z.object({
  workspacePublicId: z.string().min(12),
  content: z.string().min(1).max(20000),
  date: dailyNoteDateSchema.optional(),
  timezone: z.string().min(1).max(100).default("UTC").refine(isValidTimeZone, {
    message: "Invalid timezone",
  }),
  separator: z.string().max(10).default("\n\n"),
});

const dailyNoteWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dailyNoteMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getOrdinalDay = (day: number) => {
  if (day >= 11 && day <= 13) return `${day}th`;

  const lastDigit = day % 10;
  if (lastDigit === 1) return `${day}st`;
  if (lastDigit === 2) return `${day}nd`;
  if (lastDigit === 3) return `${day}rd`;

  return `${day}th`;
};

const getTodayInTimeZone = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
};

const parseDailyNoteDate = (date: string) => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateMatch)
    throw new TRPCError({
      message: "Date must use YYYY-MM-DD format",
      code: "BAD_REQUEST",
    });

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new TRPCError({
      message: "Invalid date",
      code: "BAD_REQUEST",
    });
  }

  return { year, month, day };
};

const formatDailyNoteTitle = (input: {
  year: number;
  month: number;
  day: number;
}) => {
  const date = new Date(Date.UTC(input.year, input.month - 1, input.day));
  const weekday = dailyNoteWeekdays[date.getUTCDay()] ?? "Sun";
  const month = dailyNoteMonths[input.month - 1] ?? "January";

  return `${weekday}, ${getOrdinalDay(input.day)} ${month}, ${input.year}`;
};

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
      await assertPermission(
        ctx.db,
        userId,
        note.workspaceId,
        "workspace:view",
      );

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
        .refine(
          (input) => input.title !== undefined || input.content !== undefined,
          {
            message: "Nothing to update",
          },
        ),
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
  appendDaily: protectedProcedure
    .meta({
      openapi: {
        summary: "Append to a daily note",
        method: "POST",
        path: "/notes/daily/append",
        description:
          "Appends markdown to a workspace daily note, creating the note if it does not exist",
        tags: ["Notes"],
        protect: true,
      },
    })
    .input(appendDailyNoteInput)
    .output(noteAppendDailyResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const workspace = await getWorkspace(ctx.db, input.workspacePublicId);
      const dailyDate = input.date
        ? parseDailyNoteDate(input.date)
        : getTodayInTimeZone(input.timezone);
      const title = formatDailyNoteTitle(dailyDate);
      const existingNote = await noteRepo.getByWorkspaceIdAndTitle(
        ctx.db,
        workspace.id,
        title,
      );

      if (!existingNote) {
        await assertPermission(ctx.db, userId, workspace.id, "card:create");

        const note = await noteRepo.create(ctx.db, {
          title,
          content: input.content,
          workspaceId: workspace.id,
          createdBy: userId,
        });

        if (!note)
          throw new TRPCError({
            message: "Failed to create daily note",
            code: "INTERNAL_SERVER_ERROR",
          });

        return { note, created: true };
      }

      await assertCanEdit(
        ctx.db,
        userId,
        existingNote.workspaceId,
        "card:edit",
        existingNote.createdBy,
      );

      const content = existingNote.content
        ? `${existingNote.content}${input.separator}${input.content}`
        : input.content;

      if (content.length > 50000)
        throw new TRPCError({
          message: "Daily note content would exceed 50000 characters",
          code: "PAYLOAD_TOO_LARGE",
        });

      const updatedNote = await noteRepo.update(ctx.db, existingNote.publicId, {
        content,
      });

      if (!updatedNote)
        throw new TRPCError({
          message: "Failed to update daily note",
          code: "INTERNAL_SERVER_ERROR",
        });

      return { note: updatedNote, created: false };
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
