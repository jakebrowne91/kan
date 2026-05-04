import { format, isBefore, isSameYear, startOfDay } from "date-fns";
import { useState } from "react";
import { HiOutlinePaperClip } from "react-icons/hi";
import {
  HiBars3BottomLeft,
  HiChatBubbleLeft,
  HiOutlineClock,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Avatar from "~/components/Avatar";
import Badge from "~/components/Badge";
import CircularProgress from "~/components/CircularProgress";
import LabelIcon from "~/components/LabelIcon";
import { useLocalisation } from "~/hooks/useLocalisation";
import { getAvatarUrl } from "~/utils/helpers";

export type CardPriority = "urgent" | "high" | "medium" | "low";

const priorityStyles: Record<CardPriority, string> = {
  urgent:
    "border-red-500/40 bg-red-100 text-red-700 dark:border-red-400/40 dark:bg-red-400/15 dark:text-red-200",
  high: "border-orange-500/40 bg-orange-100 text-orange-700 dark:border-orange-300/40 dark:bg-orange-300/15 dark:text-orange-100",
  medium:
    "border-blue-500/40 bg-blue-100 text-blue-700 dark:border-blue-300/40 dark:bg-blue-300/15 dark:text-blue-100",
  low: "border-emerald-500/40 bg-emerald-100 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-300/15 dark:text-emerald-100",
};

const stripHtml = (value: string | null) =>
  (value ?? "").replace(/<[^>]*>/g, "").trim();

const Card = ({
  title,
  ticketNumber,
  labels,
  members,
  checklists,
  description,
  comments,
  attachments,
  dueDate,
  priority,
  isSelected,
  canEdit,
  onSelect,
  onUpdate,
}: {
  title: string;
  ticketNumber?: string | null;
  labels: { publicId?: string; name: string; colourCode: string | null }[];
  members: {
    publicId: string;
    email: string;
    user: { name: string | null; email: string; image: string | null } | null;
  }[];
  checklists: {
    publicId: string;
    name: string;
    items: {
      publicId: string;
      title: string;
      completed: boolean;
      index: number;
    }[];
  }[];
  description: string | null;
  comments: { publicId: string }[];
  attachments?: { publicId: string }[];
  dueDate?: Date | null;
  priority: CardPriority;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onUpdate: (values: {
    title?: string;
    description?: string;
    priority?: CardPriority;
  }) => void;
}) => {
  const { dateLocale } = useLocalisation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState(
    stripHtml(description),
  );
  const showYear = dueDate ? !isSameYear(dueDate, new Date()) : false;
  const isOverdue = dueDate ? isBefore(dueDate, startOfDay(new Date())) : false;
  const completedItems = checklists.reduce((acc, checklist) => {
    return acc + checklist.items.filter((item) => item.completed).length;
  }, 0);

  const totalItems = checklists.reduce((acc, checklist) => {
    return acc + checklist.items.length;
  }, 0);

  const progress =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const descriptionText = stripHtml(description);
  const hasDescription = descriptionText.length > 0;
  const hasAttachments = attachments && attachments.length > 0;
  const hasDueDate = !!dueDate;

  const commitTitle = () => {
    const nextTitle = draftTitle.trim();
    setIsEditingTitle(false);
    if (!nextTitle || nextTitle === title) {
      setDraftTitle(title);
      return;
    }
    onUpdate({ title: nextTitle });
  };

  const commitDescription = () => {
    const nextDescription = draftDescription.trim();
    setIsEditingDescription(false);
    if (nextDescription === descriptionText) return;
    onUpdate({ description: nextDescription });
  };

  return (
    <div
      onMouseEnter={onSelect}
      className={twMerge(
        "flex flex-col overflow-hidden rounded-md border border-light-500 bg-light-50 px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors dark:border-dark-400 dark:bg-dark-200 dark:text-dark-1000 dark:hover:bg-dark-300",
        isSelected &&
          "border-[var(--retrograde-ring)] bg-white ring-2 ring-[var(--retrograde-ring)] ring-offset-1 ring-offset-[var(--retrograde-background)] dark:border-[var(--retrograde-ring)] dark:bg-dark-300",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        {ticketNumber ? (
          <span className="min-w-0 truncate text-xs text-light-800 dark:text-dark-800">
            {ticketNumber}
          </span>
        ) : (
          <span />
        )}
        <select
          value={priority}
          aria-label="Priority"
          disabled={!canEdit}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onUpdate({ priority: event.target.value as CardPriority })
          }
          className={twMerge(
            "h-6 max-w-[6.5rem] rounded border px-1.5 text-[11px] font-medium capitalize focus:outline-none",
            priorityStyles[priority],
          )}
        >
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {isEditingTitle && canEdit ? (
        <input
          value={draftTitle}
          autoFocus
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") commitTitle();
            if (event.key === "Escape") {
              setDraftTitle(title);
              setIsEditingTitle(false);
            }
          }}
          className="w-full rounded border border-light-600 bg-white px-1 py-0.5 text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--retrograde-ring)] dark:border-dark-600 dark:bg-dark-100 dark:text-dark-1000"
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            if (!canEdit) return;
            event.stopPropagation();
            setDraftTitle(title);
            setIsEditingTitle(true);
          }}
          className="break-words text-left font-medium focus:outline-none"
        >
          {title}
        </button>
      )}

      {(isSelected || hasDescription) && (
        <div className="mt-1">
          {isEditingDescription && canEdit ? (
            <textarea
              value={draftDescription}
              autoFocus
              rows={3}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => setDraftDescription(event.target.value)}
              onBlur={commitDescription}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  setDraftDescription(descriptionText);
                  setIsEditingDescription(false);
                }
              }}
              className="w-full resize-none rounded border border-light-600 bg-white px-2 py-1 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--retrograde-ring)] dark:border-dark-600 dark:bg-dark-100 dark:text-dark-1000"
            />
          ) : (
            <button
              type="button"
              onClick={(event) => {
                if (!canEdit) return;
                event.stopPropagation();
                setDraftDescription(descriptionText);
                setIsEditingDescription(true);
              }}
              className="line-clamp-3 w-full text-left text-xs text-light-950 focus:outline-none dark:text-dark-900"
            >
              {hasDescription ? descriptionText : "Add description"}
            </button>
          )}
        </div>
      )}

      {labels.length ||
      members.length ||
      checklists.length > 0 ||
      hasDescription ||
      comments.length > 0 ||
      hasDueDate ||
      hasAttachments ? (
        <div className="mt-2 flex flex-col justify-end">
          <div className="space-x-0.5">
            {labels.map((label) => (
              <Badge
                key={label.publicId ?? label.name}
                value={label.name}
                iconLeft={<LabelIcon colourCode={label.colourCode} />}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              {hasDescription && (
                <div className="flex items-center gap-1 text-light-700 dark:text-dark-800">
                  <HiBars3BottomLeft className="h-4 w-4" />
                </div>
              )}
              {dueDate && (
                <div
                  className={twMerge(
                    "flex items-center gap-1",
                    isOverdue
                      ? "text-red-600 dark:text-red-400"
                      : "text-light-800 dark:text-dark-800",
                  )}
                >
                  <HiOutlineClock className="h-4 w-4" />
                  <span className="text-[11px]">
                    {format(dueDate, showYear ? "do MMM yyyy" : "do MMM", {
                      locale: dateLocale,
                    })}
                  </span>
                </div>
              )}
              {comments.length > 0 && (
                <div className="flex items-center gap-1 text-light-700 dark:text-dark-800">
                  <HiChatBubbleLeft className="h-4 w-4" />
                </div>
              )}
              {hasAttachments && (
                <div className="flex items-center gap-1 text-light-700 dark:text-dark-800">
                  <HiOutlinePaperClip className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-1">
              {checklists.length > 0 && (
                <div className="flex items-center gap-1 rounded-full border-[1px] border-light-500 px-2 py-1 dark:border-dark-600">
                  <CircularProgress
                    progress={progress || 2}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <span className="text-[10px] text-light-900 dark:text-dark-950">
                    {completedItems}/{totalItems}
                  </span>
                </div>
              )}
              {members.length > 0 && (
                <div className="isolate flex justify-end -space-x-1 overflow-hidden">
                  {members.map(({ publicId, user, email }) => {
                    const avatarUrl = user?.image
                      ? getAvatarUrl(user.image)
                      : undefined;

                    return (
                      <Avatar
                        key={publicId}
                        name={user?.name ?? ""}
                        email={user?.email ?? email}
                        imageUrl={avatarUrl}
                        size="sm"
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Card;
