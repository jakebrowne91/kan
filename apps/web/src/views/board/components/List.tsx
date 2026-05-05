import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Draggable } from "react-beautiful-dnd";
import { useForm } from "react-hook-form";
import {
  HiEllipsisHorizontal,
  HiOutlinePlusSmall,
  HiOutlineSquaresPlus,
  HiOutlineTrash,
} from "react-icons/hi2";

import { authClient } from "@kan/auth/client";

import Dropdown from "~/components/Dropdown";
import { Tooltip } from "~/components/Tooltip";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { api } from "~/utils/api";

interface ListProps {
  children: ReactNode;
  index: number;
  list: List;
  cardCount: number;
  setSelectedPublicListId: (publicListId: PublicListId) => void;
}

interface List {
  publicId: string;
  name: string;
  createdBy?: string | null;
}

interface FormValues {
  listPublicId: string;
  name: string;
}

type PublicListId = string;

export default function List({
  children,
  index,
  list,
  cardCount,
  setSelectedPublicListId,
}: ListProps) {
  const { openModal } = useModal();
  const { canCreateCard, canEditList, canDeleteList } = usePermissions();
  const { data: session } = authClient.useSession();
  const isCreator = list.createdBy && session?.user.id === list.createdBy;
  const canEdit = canEditList || isCreator;
  const canDrag = canEditList || isCreator;

  const openNewCardForm = (publicListId: PublicListId) => {
    if (!canCreateCard) return;
    openModal("NEW_CARD");
    setSelectedPublicListId(publicListId);
  };

  const updateList = api.list.update.useMutation();

  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      listPublicId: list.publicId,
      name: list.name,
    },
    values: {
      listPublicId: list.publicId,
      name: list.name,
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!canEdit) return;
    updateList.mutate({
      listPublicId: values.listPublicId,
      name: values.name,
    });
  };

  const handleOpenDeleteListConfirmation = () => {
    setSelectedPublicListId(list.publicId);
    openModal("DELETE_LIST");
  };

  return (
    <Draggable
      key={list.publicId}
      draggableId={list.publicId}
      index={index}
      isDragDisabled={!canDrag}
    >
      {(provided) => (
        <div
          key={list.publicId}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="dark-text-dark-1000 mr-3 h-fit min-w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] snap-center rounded-md border border-light-400 bg-light-300 py-2 pl-2 pr-1 text-neutral-900 dark:border-dark-300 dark:bg-dark-100 sm:min-w-[22rem] sm:max-w-[22rem] md:mr-5 md:min-w-[18rem] md:max-w-[18rem]"
        >
          <div className="mb-2 flex min-h-10 justify-between">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="min-w-0 flex-1 focus-visible:outline-none"
            >
              <div className="flex min-w-0 items-center gap-2 px-3 pt-1 md:px-4">
                <input
                  id="name"
                  type="text"
                  {...register("name")}
                  onBlur={handleSubmit(onSubmit)}
                  readOnly={!canEdit}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-neutral-900 focus:ring-0 focus-visible:outline-none dark:text-dark-1000"
                />
                <span className="inline-flex min-w-5 justify-center rounded-full border border-light-600 bg-light-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-light-950 dark:border-dark-500 dark:bg-dark-300 dark:text-dark-950">
                  {cardCount}
                </span>
              </div>
            </form>
            <div className="flex items-center">
              <Tooltip
                content={
                  !canCreateCard ? t`You don't have permission` : undefined
                }
              >
                <button
                  className="mx-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold text-dark-50 hover:bg-light-400 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-dark-200 md:h-fit md:w-auto md:p-1 md:px-1"
                  onClick={() => openNewCardForm(list.publicId)}
                  disabled={!canCreateCard}
                >
                  <HiOutlinePlusSmall
                    className="h-5 w-5 text-dark-900"
                    aria-hidden="true"
                  />
                </button>
              </Tooltip>
              {(() => {
                const dropdownItems = [
                  ...(canCreateCard
                    ? [
                        {
                          label: t`Add a card`,
                          action: () => openNewCardForm(list.publicId),
                          icon: (
                            <HiOutlineSquaresPlus className="h-[18px] w-[18px] text-dark-900" />
                          ),
                        },
                      ]
                    : []),
                  ...(canDeleteList || isCreator
                    ? [
                        {
                          label: t`Delete list`,
                          action: handleOpenDeleteListConfirmation,
                          icon: (
                            <HiOutlineTrash className="h-[18px] w-[18px] text-dark-900" />
                          ),
                        },
                      ]
                    : []),
                ];

                if (dropdownItems.length === 0) {
                  return null;
                }

                return (
                  <div className="relative mr-1 inline-block">
                    <Dropdown items={dropdownItems}>
                      <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
                    </Dropdown>
                  </div>
                );
              })()}
            </div>
          </div>
          {children}
        </div>
      )}
    </Draggable>
  );
}
