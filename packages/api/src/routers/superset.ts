import { TRPCError } from "@trpc/server";
import { env } from "next-runtime-env";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardAgentRunRepo from "@kan/db/repository/cardAgentRun.repo";
import * as listRepo from "@kan/db/repository/list.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  buildAriGoldSupportPrompt,
  getAriGoldRepo,
  launchAriGoldAgent,
} from "../utils/ariGold";
import { assertCanEdit } from "../utils/permissions";
import {
  buildSupersetPrompt,
  launchSupersetAgent,
  listSupersetProjects,
  toSupersetBranchName,
} from "../utils/superset";

const responseSchema = z.object({
  publicId: z.string(),
  agent: z.string(),
  status: z.enum([
    "requested",
    "running",
    "needs_input",
    "ready_for_review",
    "failed",
  ]),
  supersetWorkspaceId: z.string().nullable(),
  supersetSessionId: z.string().nullable(),
  supersetUrl: z.string().nullable(),
  error: z.string().nullable(),
});

const normaliseListName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const isRetrogradeSupportCard = (description: string | null) =>
  Boolean(description?.includes("retrograde-support-ticket:"));

const extractRepoFromDescription = (description: string | null) => {
  const match = description?.match(/^\s*[-*]\s+Repo:\s*(.+?)\s*$/im);
  const repo = match?.[1]?.trim();
  return repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : null;
};

async function moveCardToNamedList(args: {
  db: Parameters<typeof cardRepo.reorder>[0];
  userId: string;
  cardId: number;
  cardPublicId: string;
  currentListPublicId: string;
  lists: { publicId: string; name: string }[];
  targetNames: string[];
}) {
  const normalisedTargets = new Set(args.targetNames.map(normaliseListName));
  const targetList = args.lists.find((list) =>
    normalisedTargets.has(normaliseListName(list.name)),
  );

  if (!targetList || targetList.publicId === args.currentListPublicId) return;

  const target = await listRepo.getByPublicId(args.db, targetList.publicId);
  if (!target) return;

  const currentCard = await cardRepo.getByPublicId(args.db, args.cardPublicId);

  await cardRepo.reorder(args.db, {
    cardId: args.cardId,
    newListId: target.id,
    newIndex: undefined,
  });

  await cardActivityRepo.create(args.db, {
    type: "card.updated.list",
    cardId: args.cardId,
    createdBy: args.userId,
    fromListId: currentCard?.listId,
    toListId: target.id,
  });
}

export const supersetRouter = createTRPCRouter({
  listProjects: protectedProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          defaultBranch: z.string().nullable(),
          mainRepoPath: z.string().nullable(),
        }),
      ),
    )
    .query(async () => {
      try {
        return await listSupersetProjects();
      } catch (error) {
        throw new TRPCError({
          message:
            error instanceof Error
              ? error.message
              : "Unable to list Superset projects",
          code: "BAD_REQUEST",
        });
      }
    }),
  launchAgentFromCard: protectedProcedure
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        projectId: z.string().min(1).optional(),
      }),
    )
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
      const isSupportCard = isRetrogradeSupportCard(card.description);
      const agent = isSupportCard
        ? "ari-gold"
        : process.env.SUPERSET_AGENT?.trim() || "codex";
      const prompt = isSupportCard
        ? buildAriGoldSupportPrompt({
            title: card.title,
            description: card.description,
            boardName: card.list.board.name,
            listName: card.list.name,
            ticketNumber,
            cardUrl,
          })
        : buildSupersetPrompt({
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
        if (!isSupportCard && !input.projectId) {
          throw new Error("Project is required for Superset card agents");
        }

        const callbackUrl =
          isSupportCard && baseUrl?.startsWith("https://")
            ? `${baseUrl}/api/retrograde-support/agent-callback`
            : undefined;
        const result = isSupportCard
          ? await launchAriGoldAgent({
              eventId: `gsd-card:${card.publicId}:${run.publicId}`,
              title: ticketNumber
                ? `${ticketNumber} ${card.title}`
                : `GSD ${card.publicId} ${card.title}`,
              repo: getAriGoldRepo(
                extractRepoFromDescription(card.description),
              ),
              prompt,
              callbackUrl,
              supportContext: {
                cardPublicId: card.publicId,
                cardAgentRunPublicId: run.publicId,
                cardUrl,
                ticketNumber,
                boardName: card.list.board.name,
                listName: card.list.name,
              },
            })
          : await launchSupersetAgent({
              cardPublicId: card.publicId,
              cardTitle: card.title,
              boardName: card.list.board.name,
              listName: card.list.name,
              projectId: input.projectId!,
              branch: toSupersetBranchName(card.publicId, card.title),
              workspaceName: ticketNumber
                ? `${ticketNumber} ${card.title}`
                : `Kan ${card.publicId} ${card.title}`,
              prompt,
            });

        const updatedRun = await cardAgentRunRepo.markRunning(ctx.db, {
          publicId: run.publicId,
          supersetWorkspaceId:
            "workspaceId" in result ? result.workspaceId : null,
          supersetSessionId: result.sessionId,
          supersetUrl: result.url,
          response: result.response,
        });

        await moveCardToNamedList({
          db: ctx.db,
          userId,
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          currentListPublicId: cardSummary.listPublicId,
          lists: card.list.board.lists,
          targetNames: isSupportCard ? ["Investigating"] : ["In Progress"],
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
