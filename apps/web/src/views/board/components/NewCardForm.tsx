import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  HiOutlineBarsArrowDown,
  HiOutlineBarsArrowUp,
  HiXMark,
} from "react-icons/hi2";

import type { NewCardInput } from "@kan/api/types";
import { generateUID } from "@kan/shared/utils";

import type { WorkspaceMember } from "~/components/Editor";
import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import DateSelector from "~/components/DateSelector";
import Editor from "~/components/Editor";
import Input from "~/components/Input";
import LabelIcon from "~/components/LabelIcon";
import Toggle from "~/components/Toggle";
import { useModalFormState } from "~/hooks/useModalFormState";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { formatMemberDisplayName, getAvatarUrl } from "~/utils/helpers";

type NewCardFormInput = Omit<NewCardInput, "priority"> & {
  isCreateAnotherEnabled: boolean;
  dueDate?: Date | null;
  priority?: NewCardInput["priority"] | null;
};

interface QueryParams {
  boardPublicId: string;
  members: string[];
  labels: string[];
  lists: string[];
}

interface NewCardFormProps {
  isTemplate: boolean;
  isBoardSorted: boolean;
  boardPublicId: string;
  listPublicId: string;
  queryParams: QueryParams;
}

export function NewCardForm({
  isTemplate,
  isBoardSorted,
  boardPublicId,
  listPublicId,
  queryParams,
}: NewCardFormProps) {
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const { closeModal, openModal, modalStates, clearModalState } = useModal();

  const utils = api.useUtils();

  // persists the form values
  const { formState, saveFormState } = useModalFormState<NewCardFormInput>({
    modalType: "NEW_CARD",
    initialValues: {
      title: "",
      description: "",
      listPublicId,
      labelPublicIds: [],
      memberPublicIds: [],
      isCreateAnotherEnabled: false,
      position: "start",
      dueDate: null,
      priority: null,
    },
    resetOnClose: true,
  });

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<NewCardFormInput>({
      values: formState,
    });

  const labelPublicIds = watch("labelPublicIds");
  const memberPublicIds = watch("memberPublicIds");
  const isCreateAnotherEnabled = watch("isCreateAnotherEnabled");
  const position = watch("position");
  const title = watch("title");
  const description = watch("description");
  const dueDate = watch("dueDate");
  const priority = watch("priority");
  const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  // saving form state whenever form values change
  useEffect(() => {
    const subscription = watch((data) => {
      saveFormState(data as NewCardFormInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, saveFormState]);

  const { data: boardData } = api.board.byId.useQuery(queryParams, {
    enabled: !!boardPublicId,
  });
  const newLabelCreatedPublicId =
    typeof modalStates.NEW_LABEL_CREATED === "string"
      ? modalStates.NEW_LABEL_CREATED
      : undefined;

  // this adds the new created label to selected labels
  useEffect(() => {
    if (
      newLabelCreatedPublicId !== undefined &&
      !labelPublicIds.includes(newLabelCreatedPublicId)
    ) {
      setValue("labelPublicIds", [...labelPublicIds, newLabelCreatedPublicId]);
    }
  }, [labelPublicIds, newLabelCreatedPublicId, setValue]);

  // this removes the deleted label from selected labels if it is selected
  useEffect(() => {
    if (boardData?.labels) {
      const availableLabelIds = boardData.labels.map((label) => label.publicId);

      if (
        newLabelCreatedPublicId &&
        availableLabelIds.includes(newLabelCreatedPublicId)
      ) {
        clearModalState("NEW_LABEL_CREATED");
      }

      const validLabelIds = labelPublicIds.filter(
        (id) =>
          availableLabelIds.includes(id) || id === newLabelCreatedPublicId,
      );

      if (validLabelIds.length !== labelPublicIds.length) {
        setValue("labelPublicIds", validLabelIds);
      }
    }
  }, [
    boardData?.labels,
    clearModalState,
    labelPublicIds,
    newLabelCreatedPublicId,
    setValue,
  ]);

  const createCard = api.card.create.useMutation({
    onMutate: async (args) => {
      await utils.board.byId.cancel();

      const currentState = utils.board.byId.getData(queryParams);

      utils.board.byId.setData(queryParams, (oldBoard) => {
        if (!oldBoard) return oldBoard;

        const updatedLists = oldBoard.lists.map((list) => {
          if (list.publicId === args.listPublicId) {
            const index =
              args.position === "start"
                ? 0
                : list.cards.reduce(
                    (maxIndex, card) => Math.max(maxIndex, card.index),
                    -1,
                  ) + 1;
            const newCard = {
              publicId: `PLACEHOLDER_${generateUID()}`,
              title: args.title,
              listId: 2,
              description: "",
              createdAt: new Date(),
              dueDate: args.dueDate ?? null,
              priority: args.priority ?? null,
              cardNumber: null,
              comments: [],
              checklists: [],
              attachments: [],
              labels: oldBoard.labels.filter((label) =>
                args.labelPublicIds.includes(label.publicId),
              ),
              members: oldBoard.workspace.members
                .filter((member) =>
                  args.memberPublicIds.includes(member.publicId),
                )
                .map((member) => ({
                  ...member,
                  deletedAt: null,
                })),
              _filteredLabels: labelPublicIds.map((id) => ({ publicId: id })),
              _filteredMembers: memberPublicIds.map((id) => ({ publicId: id })),
              index,
            };

            const updatedCards =
              args.position === "start"
                ? [newCard, ...list.cards]
                : [...list.cards, newCard];
            return { ...list, cards: updatedCards };
          }
          return list;
        });

        return { ...oldBoard, lists: updatedLists };
      });

      return { previousState: currentState };
    },
    onError: (error, _newList, context) => {
      utils.board.byId.setData(queryParams, context?.previousState);
      showPopup({
        header: t`Unable to create card`,
        message: error.data?.zodError?.fieldErrors.title?.[0]
          ? `${error.data.zodError.fieldErrors.title[0].replace("String", "Title")}`
          : t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSuccess: async () => {
      const isCreateAnotherEnabled = watch("isCreateAnotherEnabled");
      if (!isCreateAnotherEnabled) {
        // close modal (state will auto-clear due to resetOnClose: true)
        setShowMobileDetails(false);
        closeModal();
      } else {
        // reset form for creating another card
        const newFormState = {
          title: "",
          description: "",
          listPublicId: watch("listPublicId"),
          labelPublicIds: [],
          memberPublicIds: [],
          isCreateAnotherEnabled,
          position,
          dueDate: null,
          priority: null,
        };
        reset(newFormState);
        saveFormState(newFormState);
        setShowMobileDetails(false);
      }
      await utils.board.byId.invalidate(queryParams);
    },
  });

  useEffect(() => {
    const titleElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#title");
    if (titleElement) titleElement.focus();
  }, []);

  const formattedLabels =
    boardData?.labels.map((label) => ({
      key: label.publicId,
      value: label.name,
      leftIcon: <LabelIcon colourCode={label.colourCode} />,
      selected: labelPublicIds.includes(label.publicId),
    })) ?? [];

  const formattedLists =
    boardData?.lists.map((list) => ({
      key: list.publicId,
      value: list.name,
      selected: list.publicId === watch("listPublicId"),
    })) ?? [];

  const formattedMembers =
    boardData?.workspace.members.map((member) => ({
      key: member.publicId,
      value: formatMemberDisplayName(
        member.user?.name ?? null,
        member.user?.email ?? member.email,
      ),
      selected: memberPublicIds.includes(member.publicId),
      leftIcon: (
        <Avatar
          size="xs"
          name={member.user?.name ?? ""}
          imageUrl={
            member.user?.image ? getAvatarUrl(member.user.image) : undefined
          }
          email={member.user?.email ?? member.email}
        />
      ),
    })) ?? [];

  const onSubmit = (data: NewCardFormInput) => {
    createCard.mutate({
      title: data.title,
      description: data.description,
      listPublicId: data.listPublicId,
      labelPublicIds: data.labelPublicIds,
      memberPublicIds: data.memberPublicIds,
      position: isBoardSorted ? "end" : data.position,
      dueDate: data.dueDate ?? null,
      priority: data.priority ?? null,
    });
  };

  const handleToggleCreateAnother = (): void => {
    setValue("isCreateAnotherEnabled", !isCreateAnotherEnabled);
  };

  const handleSelectList = (listPublicId: string): void => {
    setValue("listPublicId", listPublicId);
  };

  const handleSelectMembers = (memberPublicId: string): void => {
    const currentIndex = memberPublicIds.indexOf(memberPublicId);
    if (currentIndex === -1) {
      setValue("memberPublicIds", [...memberPublicIds, memberPublicId]);
    } else {
      const newMemberPublicIds = [...memberPublicIds];
      newMemberPublicIds.splice(currentIndex, 1);
      setValue("memberPublicIds", newMemberPublicIds);
    }
  };

  const handleSelectLabels = (labelPublicId: string): void => {
    const currentIndex = labelPublicIds.indexOf(labelPublicId);
    if (currentIndex === -1) {
      setValue("labelPublicIds", [...labelPublicIds, labelPublicId]);
    } else {
      const newLabelPublicIds = [...labelPublicIds];
      newLabelPublicIds.splice(currentIndex, 1);
      setValue("labelPublicIds", newLabelPublicIds);
    }
  };

  const selectedList = formattedLists.find((item) => item.selected);
  const priorityOptions: {
    key: NonNullable<NewCardFormInput["priority"]>;
    label: string;
  }[] = [
    { key: "urgent", label: t`Urgent` },
    { key: "high", label: t`High` },
    { key: "medium", label: t`Medium` },
    { key: "low", label: t`Low` },
  ];
  const detailButtonClasses =
    "flex min-h-11 w-full items-center justify-center rounded-[5px] border-[1px] border-light-600 bg-light-200 px-3 py-2 text-center text-sm font-medium text-light-900 hover:bg-light-300 dark:border-dark-600 dark:bg-dark-400 dark:text-dark-1000 dark:hover:bg-dark-500 md:h-full md:min-h-0 md:justify-start md:px-2 md:py-1 md:text-left md:text-xs md:font-normal";
  const detailControlWrapperClasses = "w-full md:w-fit";
  const mobileSectionLabelClasses =
    "mb-1 text-[10px] font-semibold uppercase text-light-900 dark:text-dark-900 md:hidden";
  const mobileChoiceClasses =
    "min-h-9 rounded-[5px] border-[1px] px-2 py-1.5 text-center text-xs font-semibold transition-colors focus-visible:outline-none";
  const getMobileChoiceClasses = (isSelected: boolean) =>
    `${mobileChoiceClasses} ${
      isSelected
        ? "border-light-900 bg-light-1000 text-light-50 dark:border-dark-1000 dark:bg-dark-1000 dark:text-dark-50"
        : "border-light-600 bg-light-200 text-light-900 hover:bg-light-300 dark:border-dark-600 dark:bg-dark-400 dark:text-dark-1000 dark:hover:bg-dark-500"
    }`;

  return (
    <form
      className="flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden md:block md:max-h-none md:overflow-visible"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 md:overflow-visible">
        <div className="flex w-full items-center justify-between pb-5">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            <span className="md:hidden">{t`New task`}</span>
            <span className="hidden md:inline">{t`New card`}</span>
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              setShowMobileDetails(false);
              closeModal();
              e.preventDefault();
            }}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        <div>
          <Input
            id="title"
            placeholder={t`Task title`}
            className="min-h-12 px-3 text-base font-medium placeholder:font-medium md:min-h-0"
            {...register("title")}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                await handleSubmit(onSubmit)();
              }
            }}
          />
        </div>
        <div
          className={
            showMobileDetails
              ? "mt-4 rounded-md border border-light-400 bg-light-100 p-3 dark:border-dark-400 dark:bg-dark-200 md:mt-2 md:border-0 md:bg-transparent md:p-0 md:dark:bg-transparent"
              : "hidden md:block"
          }
        >
          <div className="md:mt-2">
            <div className={mobileSectionLabelClasses}>{t`Description`}</div>
            <div className="block max-h-36 min-h-24 w-full overflow-y-auto rounded-md border-0 bg-light-50 px-3 py-2 text-sm text-light-1000 shadow-sm ring-1 ring-inset ring-light-700 focus-within:ring-2 focus-within:ring-inset focus-within:ring-light-900 dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:focus-within:ring-dark-900 sm:leading-6 md:max-h-48">
              <Editor
                content={description}
                onChange={(value) => {
                  setValue("description", value);
                  saveFormState({ ...formState, description: value });
                }}
                workspaceMembers={
                  boardData?.workspace.members.map(
                    (member): WorkspaceMember => ({
                      publicId: member.publicId,
                      email: member.email,
                      user: member.user
                        ? {
                            id: member.publicId,
                            name: member.user.name,
                            image: member.user.image ?? null,
                          }
                        : null,
                    }),
                  ) ?? []
                }
                enableYouTubeEmbed={false}
              />
            </div>
          </div>
          <div className="mt-3">
            <div className={mobileSectionLabelClasses}>{t`Priority`}</div>
            <div className="grid grid-cols-4 gap-1 md:mt-2 md:flex md:w-fit md:gap-1">
              {priorityOptions.map((option) => {
                const isSelected = priority === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setValue("priority", isSelected ? null : option.key);
                    }}
                    className={`${getMobileChoiceClasses(isSelected)} md:min-h-0 md:px-2 md:py-1 md:text-left md:text-xs md:font-normal`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:mt-2 md:flex md:flex-wrap md:gap-0 md:space-x-1">
            <div className="col-span-2 md:w-fit">
              <div className={mobileSectionLabelClasses}>{t`List`}</div>
              <div className="flex gap-1 overflow-x-auto pb-1 md:hidden">
                {formattedLists.map((list) => (
                  <button
                    key={list.key}
                    type="button"
                    onClick={() => handleSelectList(list.key)}
                    className={`${getMobileChoiceClasses(list.selected)} shrink-0`}
                  >
                    {list.value}
                  </button>
                ))}
              </div>
              <div className="hidden md:block">
                <CheckboxDropdown
                  items={formattedLists}
                  handleSelect={(_groupKey, item) => handleSelectList(item.key)}
                >
                  <div className={detailButtonClasses}>
                    {selectedList?.value}
                  </div>
                </CheckboxDropdown>
              </div>
            </div>
            {!isTemplate && (
              <div className={detailControlWrapperClasses}>
                <CheckboxDropdown
                  items={formattedMembers}
                  handleSelect={(_groupKey, item) =>
                    handleSelectMembers(item.key)
                  }
                >
                  <div className={detailButtonClasses}>
                    {!memberPublicIds.length ? (
                      t`Members`
                    ) : (
                      <div className="flex -space-x-1 overflow-hidden">
                        {memberPublicIds.map((memberPublicId) => {
                          const member = formattedMembers.find(
                            (member) => member.key === memberPublicId,
                          );

                          return (
                            <span
                              key={member?.key}
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-400 ring-1 ring-light-200 dark:ring-dark-500"
                            >
                              <span className="text-[8px] font-medium leading-none text-white">
                                {member?.value
                                  .split(" ")
                                  .map((namePart) =>
                                    namePart.charAt(0).toUpperCase(),
                                  )
                                  .join("")}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CheckboxDropdown>
              </div>
            )}
            <div className="col-span-2 md:w-fit">
              <div className={mobileSectionLabelClasses}>{t`Labels`}</div>
              <div className="grid grid-cols-3 gap-1 md:hidden">
                {boardData?.labels.length ? (
                  boardData.labels.map((label) => {
                    const isSelected = labelPublicIds.includes(label.publicId);

                    return (
                      <button
                        key={label.publicId}
                        type="button"
                        onClick={() => handleSelectLabels(label.publicId)}
                        className={`flex items-center justify-center ${getMobileChoiceClasses(isSelected)}`}
                      >
                        <span
                          className="mr-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: label.colourCode }}
                        />
                        <span className="truncate">{label.name}</span>
                      </button>
                    );
                  })
                ) : (
                  <button
                    type="button"
                    onClick={() => openModal("NEW_LABEL")}
                    className={`${getMobileChoiceClasses(false)} col-span-3`}
                  >
                    {t`Create new label`}
                  </button>
                )}
              </div>
              <div className="hidden md:block">
                <CheckboxDropdown
                  items={formattedLabels}
                  handleSelect={(_groupKey, item) =>
                    handleSelectLabels(item.key)
                  }
                  handleEdit={(labelPublicId) =>
                    openModal("EDIT_LABEL", labelPublicId)
                  }
                  handleCreate={() => openModal("NEW_LABEL")}
                  createNewItemLabel={t`Create new label`}
                >
                  <div className={detailButtonClasses}>
                    {!labelPublicIds.length ? (
                      t`Labels`
                    ) : (
                      <>
                        <div
                          className={
                            labelPublicIds.length > 1
                              ? "flex -space-x-[2px] overflow-hidden"
                              : "flex items-center"
                          }
                        >
                          {labelPublicIds.map((labelPublicId) => {
                            const label = boardData?.labels.find(
                              (label) => label.publicId === labelPublicId,
                            );

                            return (
                              <span
                                key={labelPublicId}
                                className="inline-flex items-center"
                              >
                                <svg
                                  fill={label?.colourCode ?? "#3730a3"}
                                  className="h-2 w-2"
                                  viewBox="0 0 6 6"
                                  aria-hidden="true"
                                >
                                  <circle cx={3} cy={3} r={3} />
                                </svg>
                                {labelPublicIds.length === 1 && (
                                  <div className="ml-1">{label?.name}</div>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {labelPublicIds.length > 1 && (
                          <div className="ml-1">
                            <Trans>{`${labelPublicIds.length} labels`}</Trans>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CheckboxDropdown>
              </div>
            </div>
            <div className="relative w-full md:w-fit">
              <button
                type="button"
                onClick={() => setIsDateSelectorOpen(!isDateSelectorOpen)}
                className={detailButtonClasses}
              >
                {dueDate ? (
                  <span>{format(dueDate, "MMM d, yyyy")}</span>
                ) : (
                  <>{t`Due date`}</>
                )}
              </button>
              {isDateSelectorOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDateSelectorOpen(false)}
                  />
                  <div
                    className="absolute left-0 top-full z-20 mt-2 rounded-md border border-light-200 bg-light-50 shadow-lg dark:border-dark-200 dark:bg-dark-100"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <DateSelector
                      selectedDate={dueDate ?? undefined}
                      onDateSelect={(date) => {
                        setValue("dueDate", date ?? null);
                        setIsDateSelectorOpen(false);
                      }}
                      weekStartsOn={workspace.weekStartDay}
                    />
                  </div>
                </>
              )}
            </div>
            {!isBoardSorted && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setValue("position", position === "start" ? "end" : "start");
                }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[5px] border-[1px] border-light-600 bg-light-200 px-3 py-2 text-sm font-medium text-light-900 hover:bg-light-300 focus-visible:outline-none dark:border-dark-600 dark:bg-dark-400 dark:text-dark-1000 dark:hover:bg-dark-500 md:h-auto md:min-h-0 md:w-auto md:px-1.5 md:py-1 md:text-xs md:font-normal"
              >
                {position === "start" ? (
                  <>
                    <HiOutlineBarsArrowUp size={14} />
                    <span className="md:hidden">{t`Top`}</span>
                  </>
                ) : (
                  <>
                    <HiOutlineBarsArrowDown size={14} />
                    <span className="md:hidden">{t`Bottom`}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 shrink-0 border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => setShowMobileDetails((value) => !value)}
          >
            {showMobileDetails ? t`Hide details` : t`Add details`}
          </Button>
          <Button
            type="submit"
            fullWidth
            disabled={title.length === 0 || createCard.isPending}
          >
            {t`Save`}
          </Button>
        </div>

        <div className="hidden items-center justify-end space-x-4 md:flex">
          <Toggle
            label={t`Create another`}
            isChecked={isCreateAnotherEnabled}
            onChange={handleToggleCreateAnother}
          />

          <div>
            <Button
              type="submit"
              disabled={title.length === 0 || createCard.isPending}
            >
              {t`Create card`}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
