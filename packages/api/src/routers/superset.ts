import { TRPCError } from "@trpc/server";
import { env } from "next-runtime-env";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardAgentRunRepo from "@kan/db/repository/cardAgentRun.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertCanEdit } from "../utils/permissions";
import {
  buildSupersetPrompt,
  launchSupersetAgent,
  toSupersetBranchName,
} from "../utils/superset";

const responseSchema = z.object({
  publicId: z.string(),
  agent: z.string(),
  status: z.enum(["requested", "running", "failed"]),
  supersetWorkspaceId: z.string().nullable(),
  supersetSessionId: z.string().nullable(),
  supersetUrl: z.string().nullable(),
  error: z.string().nullable(),
});

export const supersetRouter = createTRPCRouter({
  launchAgentFromCard: protectedProcedure
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(responseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const cardSummary = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!cardSummary) {
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });
      }

      await assertCanEdit(
        ctx.db,
        userId,
        cardSummary.workspaceId,
        "card:edit",
        cardSummary.createdBy,
      );

      const card = await cardRepo.getWithListAndMembersByPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card) {
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });
      }

      const ticketNumber =
        card.cardNumber != null && card.list.board.workspace.cardPrefix
          ? `${card.list.board.workspace.cardPrefix}-${card.cardNumber}`
          : null;
      const baseUrl = env("NEXT_PUBLIC_BASE_URL");
      const cardUrl = baseUrl ? `${baseUrl}/cards/${card.publicId}` : null;
      const agent = process.env.SUPERSET_AGENT?.trim() || "codex";
      const prompt = buildSupersetPrompt({
        title: card.title,
        description: card.description,
        labels: card.labels.map((label) => label.name),
        priority: card.priority,
        boardName: card.list.board.name,
        listName: card.list.name,
        ticketNumber,
        cardUrl,
      });

      const run = await cardAgentRunRepo.create(ctx.db, {
        cardId: card.id,
        createdBy: userId,
        agent,
        prompt,
      });

      try {
        const result = await launchSupersetAgent({
          cardPublicId: card.publicId,
          cardTitle: card.title,
          boardName: card.list.board.name,
          listName: card.list.name,
          branch: toSupersetBranchName(card.publicId, card.title),
          workspaceName: ticketNumber
            ? `${ticketNumber} ${card.title}`
            : `Kan ${card.publicId} ${card.title}`,
          prompt,
        });

        const updatedRun = await cardAgentRunRepo.markRunning(ctx.db, {
          publicId: run.publicId,
          supersetWorkspaceId: result.workspaceId,
          supersetSessionId: result.sessionId,
          supersetUrl: result.url,
          response: result.response,
        });

        return {
          publicId: updatedRun.publicId,
          agent: updatedRun.agent,
          status: updatedRun.status,
          supersetWorkspaceId: updatedRun.supersetWorkspaceId,
          supersetSessionId: updatedRun.supersetSessionId,
          supersetUrl: updatedRun.supersetUrl,
          error: updatedRun.error,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to start Superset";
        const failedRun = await cardAgentRunRepo.markFailed(ctx.db, {
          publicId: run.publicId,
          error: message,
        });

        throw new TRPCError({
          message: failedRun.error ?? message,
          code: "BAD_REQUEST",
        });
      }
    }),
});
