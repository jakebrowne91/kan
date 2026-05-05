import type { DropResult } from "react-beautiful-dnd";
import { useParams } from "next/navigation";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { keepPreviousData } from "@tanstack/react-query";
import { env } from "next-runtime-env";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable } from "react-beautiful-dnd";
import { useForm } from "react-hook-form";
import {
  HiOutlinePlusSmall,
  HiOutlineRectangleStack,
  HiOutlineSquare3Stack3D,
} from "react-icons/hi2";

import type { UpdateBoardInput } from "@kan/api/types";

import type {
  BoardSortBy,
  BoardSortDirection,
  BoardSortLevel,
} from "./components/BoardSortDropdown";
import type { CardPriority } from "./components/Card";
import type { CardContextMenuAction } from "./components/CardContextMenu";
import Button from "~/components/Button";
import { DeleteLabelConfirmation } from "~/components/DeleteLabelConfirmation";
import { LabelForm } from "~/components/LabelForm";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { Tooltip } from "~/components/Tooltip";
import { EditYouTubeModal } from "~/components/YouTubeEmbed/EditYouTubeModal";
import { useDragToScroll } from "~/hooks/useDragToScroll";
import { usePermissions } from "~/hooks/usePermissions";
import { useScrollRestore } from "~/hooks/useScrollRestore";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { formatToArray } from "~/utils/helpers";
import { DeleteCardConfirmation } from "~/views/card/components/DeleteCardConfirmation";
import BoardDropdown from "./components/BoardDropdown";
import { BoardSortDropdown } from "./components/BoardSortDropdown";
import Card from "./components/Card";
import { CardContextDueDateModal } from "./components/CardContextDueDateModal";
import { CardContextDuplicateModal } from "./components/CardContextDuplicateModal";
import { CardContextLabelsModal } from "./components/CardContextLabelsModal";
import { CardContextMembersModal } from "./components/CardContextMembersModal";
import { CardContextMenu } from "./components/CardContextMenu";
import { CardContextMoveListModal } from "./components/CardContextMoveListModal";
import { DeleteBoardConfirmation } from "./components/DeleteBoardConfirmation";
import { DeleteListConfirmation } from "./components/DeleteListConfirmation";
import Filters from "./components/Filters";
import List from "./components/List";
import { NewCardForm } from "./components/NewCardForm";
import { NewListForm } from "./components/NewListForm";
import { NewTemplateForm } from "./components/NewTemplateForm";
import VisibilityButton from "./components/VisibilityButton";

type PublicListId = string;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]',
    ),
  );
};

const priorityCycle = [null, "urgent", "high", "medium", "low"] as const;
const sortablePriorityRank: Record<CardPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const getNextPriority = (priority: CardPriority | null) => {
  const currentIndex = priorityCycle.indexOf(priority);
  return priorityCycle[(currentIndex + 1) % priorityCycle.length] ?? null;
};

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getBoardSortBy = (
  value: string | string[] | undefined,
): BoardSortBy | null => {
  const sortBy = getSingleQueryValue(value);
  if (sortBy === "labels" || sortBy === "createdAt" || sortBy === "priority") {
    return sortBy;
  }

  return null;
};

const getBoardSortDirection = (
  value: string | string[] | undefined,
): BoardSortDirection => {
  return getSingleQueryValue(value) === "desc" ? "desc" : "asc";
};

export default function BoardPage({ isTemplate }: { isTemplate?: boolean }) {
  const params = useParams() as { boardId: string | string[] } | null;
  const router = useRouter();
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const { openModal, modalContentType, entityId, isOpen, setModalState } =
    useModal();
  const [selectedPublicListId, setSelectedPublicListId] =
    useState<PublicListId>("");
  const [selectedCardPublicId, setSelectedCardPublicId] = useState<
    string | null
  >(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cardPublicId: string;
  } | null>(null);

  const { ref: scrollRef, onMouseDown } = useDragToScroll({
    enabled: true,
    direction: "horizontal",
  });

  const {
    canCreateCard,
    canDeleteCard,
    canCreateList,
    canEditList,
    canEditCard,
    canEditBoard,
  } = usePermissions();

  const boardId = params?.boardId
    ? Array.isArray(params.boardId)
      ? params.boardId[0]
      : params.boardId
    : null;

  const updateBoard = api.board.update.useMutation();

  const { register, handleSubmit, setValue } = useForm<UpdateBoardInput>({
    values: {
      boardPublicId: boardId ?? "",
      name: "",
    },
  });

  const onSubmit = (values: UpdateBoardInput) => {
    updateBoard.mutate({
      boardPublicId: values.boardPublicId,
      name: values.name,
    });
  };

  const semanticFilters = formatToArray(router.query.dueDate) as (
    | "overdue"
    | "today"
    | "tomorrow"
    | "next-week"
    | "next-month"
    | "no-due-date"
  )[];

  const boardType: "regular" | "template" = isTemplate ? "template" : "regular";

  const queryParams = {
    boardPublicId: boardId ?? "",
    members: formatToArray(router.query.members),
    labels: formatToArray(router.query.labels),
    lists: formatToArray(router.query.lists),
    ...(semanticFilters.length > 0 && {
      dueDateFilters: semanticFilters,
    }),
    type: boardType,
  };

  const sortBy = getBoardSortBy(router.query.sortBy);
  const sortDirection = getBoardSortDirection(router.query.sortDirection);
  const rawSecondarySortBy = getBoardSortBy(router.query.secondarySortBy);
  const secondarySortBy =
    sortBy && rawSecondarySortBy !== sortBy ? rawSecondarySortBy : null;
  const secondarySortDirection = getBoardSortDirection(
    router.query.secondarySortDirection,
  );

  const {
    data: boardData,
    isSuccess,
    isLoading: isQueryLoading,
    error,
  } = api.board.byId.useQuery(queryParams, {
    enabled: !!boardId,
    placeholderData: keepPreviousData,
  });

  // Redirect to 404 if board doesn't exist
  useEffect(() => {
    if (router.isReady && boardId && !isQueryLoading) {
      if (
        error?.data?.code === "NOT_FOUND" ||
        (!boardData && !isQueryLoading)
      ) {
        void router.replace("/404");
      }
    }
  }, [router, boardId, isQueryLoading, error, boardData]);

  const refetchBoard = async () => {
    if (boardId) await utils.board.byId.refetch({ boardPublicId: boardId });
  };

  useEffect(() => {
    if (boardId) {
      setIsInitialLoading(false);
    }
  }, [boardId]);

  const isLoading = isInitialLoading || isQueryLoading;

  const sortedBoardData = useMemo(() => {
    if (!boardData || !sortBy) return boardData;

    type BoardCard = (typeof boardData.lists)[number]["cards"][number];
    type SortCriterion = {
      sortBy: BoardSortBy;
      direction: BoardSortDirection;
    };

    const sortCriteria: SortCriterion[] = [
      { sortBy, direction: sortDirection },
      ...(secondarySortBy && secondarySortBy !== sortBy
        ? [{ sortBy: secondarySortBy, direction: secondarySortDirection }]
        : []),
    ];

    const getLabelsValue = (card: BoardCard) =>
      card.labels
        .map((label) => label.name.toLowerCase())
        .sort((a, b) => a.localeCompare(b))
        .join(" ");

    const compareByCriterion = (
      cardA: BoardCard,
      cardB: BoardCard,
      criterion: SortCriterion,
    ) => {
      const direction = criterion.direction === "asc" ? 1 : -1;

      if (criterion.sortBy === "labels") {
        const hasLabelsA = cardA.labels.length > 0;
        const hasLabelsB = cardB.labels.length > 0;

        if (hasLabelsA !== hasLabelsB) return hasLabelsA ? -1 : 1;

        const comparison = getLabelsValue(cardA).localeCompare(
          getLabelsValue(cardB),
        );
        if (comparison !== 0) return comparison * direction;
      }

      if (criterion.sortBy === "createdAt") {
        const comparison =
          new Date(cardA.createdAt).getTime() -
          new Date(cardB.createdAt).getTime();
        if (comparison !== 0) return comparison * direction;
      }

      if (criterion.sortBy === "priority") {
        const hasPriorityA = cardA.priority !== null;
        const hasPriorityB = cardB.priority !== null;

        if (hasPriorityA !== hasPriorityB) return hasPriorityA ? -1 : 1;

        const comparison =
          (cardA.priority ? sortablePriorityRank[cardA.priority] : 0) -
          (cardB.priority ? sortablePriorityRank[cardB.priority] : 0);
        if (comparison !== 0) return comparison * direction;
      }

      return 0;
    };

    const compareBySort = (cardA: BoardCard, cardB: BoardCard) => {
      for (const criterion of sortCriteria) {
        const comparison = compareByCriterion(cardA, cardB, criterion);
        if (comparison !== 0) return comparison;
      }

      return cardA.index - cardB.index;
    };

    return {
      ...boardData,
      lists: boardData.lists.map((list) => ({
        ...list,
        cards: [...list.cards].sort(compareBySort),
      })),
    };
  }, [
    boardData,
    secondarySortBy,
    secondarySortDirection,
    sortBy,
    sortDirection,
  ]);

  useScrollRestore(
    boardId,
    scrollRef,
    router,
    !isLoading && (boardData?.lists.length ?? 0) > 0,
  );

  const updateListMutation = api.list.update.useMutation({
    onMutate: async (args) => {
      await utils.board.byId.cancel();

      const currentState = utils.board.byId.getData(queryParams);

      utils.board.byId.setData(queryParams, (oldBoard) => {
        if (!oldBoard) return oldBoard;

        const updatedLists = Array.from(oldBoard.lists);

        const sourceList = updatedLists.find(
          (list) => list.publicId === args.listPublicId,
        );

        const currentIndex = sourceList?.index;

        if (currentIndex === undefined) return oldBoard;

        const removedList = updatedLists.splice(currentIndex, 1)[0];

        if (removedList && args.index !== undefined) {
          updatedLists.splice(args.index, 0, removedList);

          return {
            ...oldBoard,
            lists: updatedLists,
          };
        }
      });

      return { previousState: currentState };
    },
    onError: (_error, _newList, context) => {
      utils.board.byId.setData(queryParams, context?.previousState);
      showPopup({
        header: t`Unable to update list`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.board.byId.invalidate(queryParams);
    },
  });

  const updateCardMutation = api.card.update.useMutation({
    onMutate: async (args) => {
      await utils.board.byId.cancel();

      const currentState = utils.board.byId.getData(queryParams);

      utils.board.byId.setData(queryParams, (oldBoard) => {
        if (!oldBoard) return oldBoard;

        const sourceList = oldBoard.lists.find((list) =>
          list.cards.some((card) => card.publicId === args.cardPublicId),
        );
        const sourceCard = sourceList?.cards.find(
          (card) => card.publicId === args.cardPublicId,
        );

        if (!sourceList || !sourceCard) return oldBoard;

        const updatedCard = {
          ...sourceCard,
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.description !== undefined
            ? { description: args.description }
            : {}),
          ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
        };

        const shouldMove =
          args.listPublicId !== undefined && args.index !== undefined;

        if (!shouldMove) {
          return {
            ...oldBoard,
            lists: oldBoard.lists.map((list) => {
              if (list.publicId !== sourceList.publicId) return list;

              return {
                ...list,
                cards: list.cards.map((card) =>
                  card.publicId === args.cardPublicId ? updatedCard : card,
                ),
              };
            }),
          };
        }

        const destinationList = oldBoard.lists.find(
          (list) => list.publicId === args.listPublicId,
        );

        if (!destinationList) return oldBoard;

        return {
          ...oldBoard,
          lists: oldBoard.lists.map((list) => {
            const withoutCard = list.cards.filter(
              (card) => card.publicId !== args.cardPublicId,
            );

            if (list.publicId !== destinationList.publicId) {
              return { ...list, cards: withoutCard };
            }

            const nextCards = [...withoutCard];
            nextCards.splice(args.index ?? nextCards.length, 0, {
              ...updatedCard,
              index: args.index ?? updatedCard.index,
            });

            return { ...list, cards: nextCards };
          }),
        };
      });

      return { previousState: currentState };
    },
    onError: (_error, _newList, context) => {
      utils.board.byId.setData(queryParams, context?.previousState);
      showPopup({
        header: t`Unable to update card`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.board.byId.invalidate(queryParams);
    },
  });

  const deleteCardMutation = api.card.delete.useMutation({
    onMutate: async (args) => {
      await utils.board.byId.cancel();

      const currentState = utils.board.byId.getData(queryParams);

      utils.board.byId.setData(queryParams, (oldBoard) => {
        if (!oldBoard) return oldBoard;

        return {
          ...oldBoard,
          lists: oldBoard.lists.map((list) => ({
            ...list,
            cards: list.cards.filter(
              (card) => card.publicId !== args.cardPublicId,
            ),
          })),
        };
      });

      return { previousState: currentState };
    },
    onError: (_error, _newList, context) => {
      utils.board.byId.setData(queryParams, context?.previousState);
      showPopup({
        header: t`Unable to delete card`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      setSelectedCardPublicId(null);
      await utils.board.byId.invalidate(queryParams);
    },
  });

  const boardCards = useMemo(
    () =>
      sortedBoardData?.lists.flatMap((list, listIndex) =>
        list.cards.map((card, cardIndex) => ({
          card,
          list,
          listIndex,
          cardIndex,
        })),
      ) ?? [],
    [sortedBoardData],
  );

  const selectedCardInfo =
    boardCards.find(({ card }) => card.publicId === selectedCardPublicId) ??
    null;

  const openNewCardForm = useCallback(
    (preferredListPublicId?: string) => {
      if (!canCreateCard) return;

      const listPublicId =
        preferredListPublicId ??
        selectedCardInfo?.list.publicId ??
        (selectedPublicListId || boardData?.lists[0]?.publicId);

      if (!listPublicId) return;
      setSelectedPublicListId(listPublicId);
      openModal("NEW_CARD");
    },
    [
      boardData?.lists,
      canCreateCard,
      openModal,
      selectedCardInfo?.list.publicId,
      selectedPublicListId,
    ],
  );

  const updateSort = useCallback(
    async (
      level: BoardSortLevel,
      nextSortBy: BoardSortBy | null,
      nextDirection: BoardSortDirection,
    ) => {
      const nextQuery = { ...router.query };

      if (level === "primary") {
        if (nextSortBy) {
          nextQuery.sortBy = nextSortBy;
          nextQuery.sortDirection = nextDirection;

          if (nextQuery.secondarySortBy === nextSortBy) {
            delete nextQuery.secondarySortBy;
            delete nextQuery.secondarySortDirection;
          }
        } else {
          delete nextQuery.sortBy;
          delete nextQuery.sortDirection;
          delete nextQuery.secondarySortBy;
          delete nextQuery.secondarySortDirection;
        }
      } else if (nextSortBy) {
        nextQuery.secondarySortBy = nextSortBy;
        nextQuery.secondarySortDirection = nextDirection;
      } else {
        delete nextQuery.secondarySortBy;
        delete nextQuery.secondarySortDirection;
      }

      try {
        await router.push({
          pathname: router.pathname,
          query: nextQuery,
        });
      } catch (error) {
        console.error(error);
      }
    },
    [router],
  );

  useEffect(() => {
    if (
      selectedCardPublicId &&
      !boardCards.some(({ card }) => card.publicId === selectedCardPublicId)
    ) {
      setSelectedCardPublicId(null);
    }
  }, [boardCards, selectedCardPublicId]);

  const openCard = useCallback(
    (cardPublicId: string) => {
      if (cardPublicId.startsWith("PLACEHOLDER")) return;
      void router.push(
        isTemplate
          ? `/templates/${boardId}/cards/${cardPublicId}`
          : `/cards/${cardPublicId}`,
      );
    },
    [boardId, isTemplate, router],
  );

  const moveSelectedCardAcrossLists = useCallback(
    (direction: -1 | 1) => {
      if (!canEditCard || !selectedCardInfo) return;

      const targetList =
        boardData?.lists[selectedCardInfo.listIndex + direction];
      if (!targetList) return;

      updateCardMutation.mutate({
        cardPublicId: selectedCardInfo.card.publicId,
        listPublicId: targetList.publicId,
        index: Math.min(selectedCardInfo.cardIndex, targetList.cards.length),
      });
      setSelectedPublicListId(targetList.publicId);
    },
    [boardData?.lists, canEditCard, selectedCardInfo, updateCardMutation],
  );

  const moveSelectedCardToDone = useCallback(() => {
    if (!canEditCard || !selectedCardInfo) return;

    if (selectedCardInfo.card.publicId.startsWith("PLACEHOLDER")) return;

    const doneList = boardData?.lists.find(
      (list) => list.name.trim().toLowerCase() === "done",
    );

    if (!doneList) {
      showPopup({
        header: t`Done list not found`,
        message: t`Create a list named Done first.`,
        icon: "error",
      });
      return;
    }

    if (doneList.publicId === selectedCardInfo.list.publicId) return;

    updateCardMutation.mutate({
      cardPublicId: selectedCardInfo.card.publicId,
      listPublicId: doneList.publicId,
      index: doneList.cards.length,
    });
    setSelectedPublicListId(doneList.publicId);
  }, [
    boardData?.lists,
    canEditCard,
    selectedCardInfo,
    showPopup,
    updateCardMutation,
  ]);

  const moveSelection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (!boardData?.lists.length) return;

      if (!selectedCardInfo) {
        const firstCard = boardCards[0]?.card;
        if (firstCard) setSelectedCardPublicId(firstCard.publicId);
        return;
      }

      let nextCard = selectedCardInfo.card;

      if (direction === "up") {
        nextCard =
          selectedCardInfo.list.cards[selectedCardInfo.cardIndex - 1] ??
          selectedCardInfo.card;
      }

      if (direction === "down") {
        nextCard =
          selectedCardInfo.list.cards[selectedCardInfo.cardIndex + 1] ??
          selectedCardInfo.card;
      }

      if (direction === "left" || direction === "right") {
        const listOffset = direction === "left" ? -1 : 1;
        const nextList =
          boardData.lists[selectedCardInfo.listIndex + listOffset];
        nextCard =
          nextList?.cards[
            Math.min(selectedCardInfo.cardIndex, nextList.cards.length - 1)
          ] ?? selectedCardInfo.card;
      }

      setSelectedCardPublicId(nextCard.publicId);
      setSelectedPublicListId(
        boardCards.find(({ card }) => card.publicId === nextCard.publicId)?.list
          .publicId ?? selectedCardInfo.list.publicId,
      );
    },
    [boardCards, boardData, selectedCardInfo],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isOpen || isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (key === "c") {
        event.preventDefault();
        openNewCardForm();
        return;
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        moveSelection(
          event.key === "ArrowUp"
            ? "up"
            : event.key === "ArrowDown"
              ? "down"
              : event.key === "ArrowLeft"
                ? "left"
                : "right",
        );
        return;
      }

      if (!selectedCardInfo) return;

      if (event.key === "Tab") {
        event.preventDefault();
        moveSelectedCardAcrossLists(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openCard(selectedCardInfo.card.publicId);
        return;
      }

      if (key === "l") {
        event.preventDefault();
        openModal("CARD_CONTEXT_LABELS", selectedCardInfo.card.publicId);
        return;
      }

      if (
        key === "p" &&
        canEditCard &&
        !selectedCardInfo.card.publicId.startsWith("PLACEHOLDER")
      ) {
        event.preventDefault();
        updateCardMutation.mutate({
          cardPublicId: selectedCardInfo.card.publicId,
          priority: getNextPriority(selectedCardInfo.card.priority),
        });
        return;
      }

      if (key === "e") {
        event.preventDefault();
        moveSelectedCardToDone();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        canDeleteCard &&
        !selectedCardInfo.card.publicId.startsWith("PLACEHOLDER")
      ) {
        event.preventDefault();
        deleteCardMutation.mutate({
          cardPublicId: selectedCardInfo.card.publicId,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canDeleteCard,
    canEditCard,
    deleteCardMutation,
    isOpen,
    moveSelectedCardAcrossLists,
    moveSelectedCardToDone,
    moveSelection,
    openCard,
    openModal,
    openNewCardForm,
    selectedCardInfo,
    updateCardMutation,
  ]);

  useEffect(() => {
    if (boardData) {
      setValue("name", boardData.name || "");
    }
  }, [isSuccess, boardData, setValue]);

  const openNewListForm = (publicBoardId: string) => {
    openModal("NEW_LIST");
    setSelectedPublicListId(publicBoardId);
  };

  const handleCardContextMenuAction = (action: CardContextMenuAction) => {
    const cardPublicId = contextMenu?.cardPublicId;
    if (!cardPublicId) return;
    setContextMenu(null);
    if (action === "copyLink") {
      const path = isTemplate
        ? `/templates/${boardId}/cards/${cardPublicId}`
        : `/cards/${cardPublicId}`;
      const url = `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
      void navigator.clipboard.writeText(url).then(
        () => {
          showPopup({
            header: t`Link copied`,
            icon: "success",
            message: t`Card URL copied to clipboard`,
          });
        },
        () => {
          showPopup({
            header: t`Unable to copy link`,
            icon: "error",
            message: t`Please try again.`,
          });
        },
      );
      return;
    }
    if (action === "duplicate") {
      setModalState("CARD_CONTEXT_DUPLICATE", {
        boardPublicId: boardId ?? "",
        isTemplate: !!isTemplate,
      });
      openModal("CARD_CONTEXT_DUPLICATE", cardPublicId);
      return;
    }
    if (action === "delete") {
      openModal("DELETE_CARD", cardPublicId);
      return;
    }
    const modalType =
      action === "members"
        ? "CARD_CONTEXT_MEMBERS"
        : action === "move"
          ? "CARD_CONTEXT_MOVE_LIST"
          : action === "labels"
            ? "CARD_CONTEXT_LABELS"
            : "CARD_CONTEXT_DUE_DATE";
    openModal(modalType, cardPublicId);
  };

  const onDragEnd = ({
    source: _source,
    destination,
    draggableId,
    type,
  }: DropResult): void => {
    if (!destination) {
      return;
    }

    if (type === "LIST" && canEditList) {
      updateListMutation.mutate({
        listPublicId: draggableId,
        index: destination.index,
      });
    }

    if (type === "CARD" && canEditCard) {
      updateCardMutation.mutate({
        cardPublicId: draggableId,

        listPublicId: destination.droppableId,
        index: destination.index,
      });
    }
  };

  const renderModalContent = () => {
    return (
      <>
        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "DELETE_BOARD"}
        >
          <DeleteBoardConfirmation
            isTemplate={!!isTemplate}
            boardPublicId={boardId ?? ""}
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "DELETE_LIST"}
        >
          <DeleteListConfirmation
            listPublicId={selectedPublicListId}
            queryParams={queryParams}
          />
        </Modal>

        <Modal
          modalSize="md"
          isVisible={isOpen && modalContentType === "NEW_CARD"}
        >
          <NewCardForm
            isTemplate={!!isTemplate}
            boardPublicId={boardId ?? ""}
            listPublicId={selectedPublicListId}
            queryParams={queryParams}
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "NEW_LIST"}
        >
          <NewListForm
            boardPublicId={boardId ?? ""}
            queryParams={queryParams}
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
        >
          <NewWorkspaceForm />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "NEW_LABEL"}
        >
          <LabelForm boardPublicId={boardId ?? ""} refetch={refetchBoard} />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "EDIT_LABEL"}
        >
          <LabelForm
            boardPublicId={boardId ?? ""}
            refetch={refetchBoard}
            isEdit
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "DELETE_LABEL"}
        >
          <DeleteLabelConfirmation
            refetch={refetchBoard}
            labelPublicId={entityId}
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "CREATE_TEMPLATE"}
        >
          <NewTemplateForm
            workspacePublicId={workspace.publicId}
            sourceBoardPublicId={boardId ?? ""}
            sourceBoardName={boardData?.name ?? ""}
          />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "EDIT_YOUTUBE"}
        >
          <EditYouTubeModal />
        </Modal>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "CARD_CONTEXT_MEMBERS"}
        >
          <CardContextMembersModal />
        </Modal>
        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "CARD_CONTEXT_MOVE_LIST"}
        >
          <CardContextMoveListModal />
        </Modal>
        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "CARD_CONTEXT_LABELS"}
        >
          <CardContextLabelsModal />
        </Modal>
        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "CARD_CONTEXT_DUE_DATE"}
        >
          <CardContextDueDateModal />
        </Modal>
        <Modal
          modalSize="md"
          isVisible={isOpen && modalContentType === "CARD_CONTEXT_DUPLICATE"}
        >
          <CardContextDuplicateModal
            boardPublicId={boardId ?? ""}
            isTemplate={!!isTemplate}
          />
        </Modal>
        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "DELETE_CARD"}
        >
          <DeleteCardConfirmation
            cardPublicId={entityId}
            boardPublicId={boardId ?? ""}
          />
        </Modal>
      </>
    );
  };

  return (
    <>
      <PageHead
        title={`${boardData?.name ?? (isTemplate ? t`Board` : t`Template`)} | ${workspace.name ?? t`Workspace`}`}
      />
      <div className="relative flex h-full flex-col">
        <PatternedBackground />
        <div className="z-10 flex w-full flex-col justify-between p-6 md:flex-row md:p-8">
          {isLoading && !boardData && (
            <div className="flex space-x-2">
              <div className="h-[2.3rem] w-[150px] animate-pulse rounded-[5px] bg-light-200 dark:bg-dark-100" />
            </div>
          )}
          {boardData && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="order-2 focus-visible:outline-none md:order-1"
            >
              <input
                id="name"
                type="text"
                {...register("name")}
                onBlur={canEditBoard ? handleSubmit(onSubmit) : undefined}
                readOnly={!canEditBoard}
                className="block border-0 bg-transparent p-0 py-0 font-bold leading-[2.3rem] tracking-tight text-neutral-900 focus:ring-0 focus-visible:outline-none disabled:cursor-not-allowed dark:text-dark-1000 sm:text-[1.2rem]"
              />
            </form>
          )}
          {!boardData && !isLoading && (
            <p className="order-2 block p-0 py-0 font-bold leading-[2.3rem] tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem] md:order-1">
              {t`${isTemplate ? "Template" : "Board"} not found`}
            </p>
          )}
          <div className="order-1 mb-4 flex items-center justify-end space-x-2 md:order-2 md:mb-0">
            {isTemplate && (
              <div className="inline-flex cursor-default items-center justify-center whitespace-nowrap rounded-md border-[1px] border-light-300 bg-light-50 px-3 py-2 text-sm font-semibold text-light-950 shadow-sm dark:border-dark-300 dark:bg-dark-50 dark:text-dark-950">
                <span className="mr-2">
                  <HiOutlineRectangleStack />
                </span>
                {t`Template`}
              </div>
            )}
            {!isTemplate && (
              <>
                <VisibilityButton
                  visibility={boardData?.visibility ?? "private"}
                  boardPublicId={boardId ?? ""}
                  boardSlug={boardData?.slug ?? ""}
                  queryParams={queryParams}
                  isLoading={!boardData}
                  isAdmin={workspace.role === "admin"}
                />
                {boardData && (
                  <Filters
                    labels={boardData.labels}
                    members={boardData.workspace.members.filter(
                      (member) => member.user !== null,
                    )}
                    lists={boardData.allLists}
                    position="left"
                    isLoading={!boardData}
                  />
                )}
                <BoardSortDropdown
                  sortBy={sortBy}
                  direction={sortDirection}
                  secondarySortBy={secondarySortBy}
                  secondaryDirection={secondarySortDirection}
                  isLoading={!boardData}
                  onChange={updateSort}
                />
              </>
            )}
            <Tooltip
              content={
                !canCreateList ? t`You don't have permission` : undefined
              }
            >
              <Button
                iconLeft={
                  <HiOutlinePlusSmall
                    className="-mr-0.5 h-5 w-5"
                    aria-hidden="true"
                  />
                }
                onClick={() => {
                  if (boardId && canCreateList) openNewListForm(boardId);
                }}
                disabled={!boardData || !canCreateList}
              >
                {t`New list`}
              </Button>
            </Tooltip>
            <BoardDropdown
              isTemplate={!!isTemplate}
              isLoading={!boardData}
              boardPublicId={boardId ?? ""}
              isArchived={boardData?.isArchived ?? false}
              isFavorite={boardData?.favorite}
              boardName={boardData?.name}
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          className={`scrollbar-w-none scrollbar-track-rounded-[4px] scrollbar-thumb-rounded-[4px] scrollbar-h-[8px] z-0 flex-1 overflow-y-hidden overflow-x-scroll overscroll-contain scrollbar scrollbar-track-light-200 scrollbar-thumb-light-400 dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-300`}
        >
          {isLoading ? (
            <div className="ml-[2rem] flex">
              <div className="0 mr-5 h-[500px] w-[18rem] animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
              <div className="0 mr-5 h-[275px] w-[18rem] animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
              <div className="0 mr-5 h-[375px] w-[18rem] animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
            </div>
          ) : sortedBoardData ? (
            <>
              {sortedBoardData.lists.length === 0 ? (
                <div className="z-10 flex h-full w-full flex-col items-center justify-center space-y-8 pb-[150px]">
                  <div className="flex flex-col items-center">
                    <HiOutlineSquare3Stack3D className="h-10 w-10 text-light-800 dark:text-dark-800" />
                    <p className="mb-2 mt-4 text-[14px] font-bold text-light-1000 dark:text-dark-950">
                      {t`No lists`}
                    </p>
                    <p className="text-[14px] text-light-900 dark:text-dark-900">
                      {canCreateList
                        ? t`Get started by creating a new list`
                        : t`No lists have been created yet`}
                    </p>
                  </div>
                  <Tooltip
                    content={
                      !canCreateList ? t`You don't have permission` : undefined
                    }
                  >
                    <Button
                      onClick={() => {
                        if (boardId && canCreateList) openNewListForm(boardId);
                      }}
                      disabled={!canCreateList}
                    >
                      {t`Create new list`}
                    </Button>
                  </Tooltip>
                </div>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable
                    droppableId="all-lists"
                    direction="horizontal"
                    type="LIST"
                  >
                    {(provided) => (
                      <div
                        className="flex"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        <div className="min-w-[2rem]" />
                        {sortedBoardData.lists.map((list, index) => (
                          <List
                            index={index}
                            key={list.publicId}
                            list={list}
                            cardCount={list.cards.length}
                            setSelectedPublicListId={(publicListId) =>
                              setSelectedPublicListId(publicListId)
                            }
                          >
                            <Droppable
                              droppableId={`${list.publicId}`}
                              type="CARD"
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className="scrollbar-track-rounded-[4px] scrollbar-thumb-rounded-[4px] scrollbar-w-[8px] z-10 h-full max-h-[calc(100vh-225px)] min-h-[2rem] overflow-y-auto pr-1 scrollbar dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-600"
                                >
                                  {list.cards.map((card, index) => (
                                    <Draggable
                                      key={card.publicId}
                                      draggableId={card.publicId}
                                      index={index}
                                      isDragDisabled={
                                        !canEditCard ||
                                        !!sortBy ||
                                        !!secondarySortBy
                                      }
                                    >
                                      {(provided) => (
                                        <div
                                          role="link"
                                          tabIndex={
                                            card.publicId.startsWith(
                                              "PLACEHOLDER",
                                            )
                                              ? -1
                                              : 0
                                          }
                                          onClick={(e) => {
                                            if (
                                              card.publicId.startsWith(
                                                "PLACEHOLDER",
                                              )
                                            )
                                              return;
                                            if (
                                              canEditCard &&
                                              isEditableTarget(e.target)
                                            )
                                              return;
                                            openCard(card.publicId);
                                          }}
                                          onFocus={() => {
                                            setSelectedCardPublicId(
                                              card.publicId,
                                            );
                                            setSelectedPublicListId(
                                              list.publicId,
                                            );
                                          }}
                                          onContextMenu={(e) => {
                                            if (
                                              card.publicId.startsWith(
                                                "PLACEHOLDER",
                                              ) ||
                                              env("NEXT_PUBLIC_KAN_ENV") ===
                                                "cloud"
                                            )
                                              return;
                                            e.preventDefault();
                                            setContextMenu({
                                              x: e.clientX,
                                              y: e.clientY,
                                              cardPublicId: card.publicId,
                                            });
                                          }}
                                          key={card.publicId}
                                          className={`mb-2 flex !cursor-pointer flex-col ${
                                            card.publicId.startsWith(
                                              "PLACEHOLDER",
                                            )
                                              ? "pointer-events-none"
                                              : ""
                                          }`}
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                        >
                                          <Card
                                            title={card.title}
                                            ticketNumber={
                                              card.cardNumber != null
                                                ? `${sortedBoardData.workspace.cardPrefix}-${card.cardNumber}`
                                                : null
                                            }
                                            labels={card.labels}
                                            members={card.members}
                                            checklists={card.checklists}
                                            description={
                                              card.description ?? null
                                            }
                                            comments={card.comments}
                                            attachments={card.attachments}
                                            dueDate={card.dueDate}
                                            priority={card.priority}
                                            isSelected={
                                              selectedCardPublicId ===
                                              card.publicId
                                            }
                                            canEdit={canEditCard}
                                            onSelect={() => {
                                              setSelectedCardPublicId(
                                                card.publicId,
                                              );
                                              setSelectedPublicListId(
                                                list.publicId,
                                              );
                                            }}
                                            onUpdate={(values) => {
                                              if (!canEditCard) return;
                                              updateCardMutation.mutate({
                                                cardPublicId: card.publicId,
                                                ...values,
                                              });
                                            }}
                                          />
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </List>
                        ))}
                        <div className="min-w-[0.75rem]" />
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </>
          ) : null}
        </div>
        {contextMenu && (
          <CardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onAction={handleCardContextMenuAction}
            canEdit={!!canEditCard}
          />
        )}
        {renderModalContent()}
      </div>
    </>
  );
}
