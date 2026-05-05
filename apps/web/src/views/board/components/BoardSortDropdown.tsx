import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import {
  HiArrowDown,
  HiArrowsUpDown,
  HiArrowUp,
  HiCheck,
  HiMiniXMark,
  HiOutlineClock,
  HiOutlineFlag,
  HiOutlineTag,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";

export type BoardSortBy = "labels" | "createdAt" | "priority";
export type BoardSortDirection = "asc" | "desc";
export type BoardSortLevel = "primary" | "secondary";

type SortOption = {
  key: string;
  label: string;
  sortBy: BoardSortBy;
  direction: BoardSortDirection;
  icon: JSX.Element;
};

const sortOptions: SortOption[] = [
  {
    key: "labels-asc",
    label: "Labels A-Z",
    sortBy: "labels",
    direction: "asc",
    icon: <HiOutlineTag className="h-4 w-4" />,
  },
  {
    key: "labels-desc",
    label: "Labels Z-A",
    sortBy: "labels",
    direction: "desc",
    icon: <HiOutlineTag className="h-4 w-4" />,
  },
  {
    key: "createdAt-desc",
    label: "Newest first",
    sortBy: "createdAt",
    direction: "desc",
    icon: <HiOutlineClock className="h-4 w-4" />,
  },
  {
    key: "createdAt-asc",
    label: "Oldest first",
    sortBy: "createdAt",
    direction: "asc",
    icon: <HiOutlineClock className="h-4 w-4" />,
  },
  {
    key: "priority-desc",
    label: "Priority high to low",
    sortBy: "priority",
    direction: "desc",
    icon: <HiOutlineFlag className="h-4 w-4" />,
  },
  {
    key: "priority-asc",
    label: "Priority low to high",
    sortBy: "priority",
    direction: "asc",
    icon: <HiOutlineFlag className="h-4 w-4" />,
  },
];

function SortOptionButton({
  option,
  isActive,
  isDisabled = false,
  onClick,
}: {
  option: SortOption;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Menu.Item disabled={isDisabled}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        className={twMerge(
          "flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-light-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-dark-950 dark:hover:bg-dark-400",
          isActive && "bg-light-200 dark:bg-dark-400",
        )}
      >
        <span className="text-dark-900">{option.icon}</span>
        <span className="min-w-0 flex-1">{option.label}</span>
        {option.direction === "asc" ? (
          <HiArrowUp className="h-3.5 w-3.5 text-dark-800" />
        ) : (
          <HiArrowDown className="h-3.5 w-3.5 text-dark-800" />
        )}
        {isActive && <HiCheck className="h-4 w-4 text-dark-900" />}
      </button>
    </Menu.Item>
  );
}

export function BoardSortDropdown({
  sortBy,
  direction,
  secondarySortBy,
  secondaryDirection,
  isLoading,
  onChange,
}: {
  sortBy: BoardSortBy | null;
  direction: BoardSortDirection;
  secondarySortBy: BoardSortBy | null;
  secondaryDirection: BoardSortDirection;
  isLoading: boolean;
  onChange: (
    level: BoardSortLevel,
    sortBy: BoardSortBy | null,
    direction: BoardSortDirection,
  ) => void;
}) {
  const activeKey = sortBy ? `${sortBy}-${direction}` : null;
  const secondaryActiveKey = secondarySortBy
    ? `${secondarySortBy}-${secondaryDirection}`
    : null;
  const hasActiveSort = Boolean(sortBy || secondarySortBy);

  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button as="div" className="cursor-pointer">
        <Button
          type="button"
          variant="secondary"
          disabled={isLoading}
          iconLeft={<HiArrowsUpDown />}
        >
          Sort
        </Button>
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute left-0 z-[100] mt-2 w-64 origin-top-left rounded-md border border-light-200 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-dark-400 dark:bg-dark-300">
          <div className="flex flex-col gap-1">
            <div className="px-2.5 pb-0.5 pt-1.5 text-xs font-semibold uppercase text-dark-800">
              Primary
            </div>
            {sortOptions.map((option) => {
              const isActive = option.key === activeKey;

              return (
                <SortOptionButton
                  key={`primary-${option.key}`}
                  option={option}
                  isActive={isActive}
                  onClick={() =>
                    onChange("primary", option.sortBy, option.direction)
                  }
                />
              );
            })}

            <div className="my-1 border-t border-light-200 dark:border-dark-500" />

            <div className="px-2.5 pb-0.5 pt-1 text-xs font-semibold uppercase text-dark-800">
              Secondary
            </div>
            {!sortBy && (
              <div className="px-2.5 pb-1 text-xs text-dark-800">
                Choose a primary sort first
              </div>
            )}
            {sortOptions.map((option) => {
              const isActive = option.key === secondaryActiveKey;
              const isDisabled = !sortBy || option.sortBy === sortBy;

              return (
                <SortOptionButton
                  key={`secondary-${option.key}`}
                  option={option}
                  isActive={isActive}
                  isDisabled={isDisabled}
                  onClick={() =>
                    onChange("secondary", option.sortBy, option.direction)
                  }
                />
              );
            })}

            <Menu.Item>
              <button
                type="button"
                disabled={!secondarySortBy}
                onClick={() => onChange("secondary", null, "asc")}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-light-200 disabled:cursor-not-allowed disabled:opacity-60 dark:text-dark-950 dark:hover:bg-dark-400"
              >
                <HiMiniXMark className="h-4 w-4 text-dark-900" />
                Clear secondary
              </button>
            </Menu.Item>

            <div className="my-1 border-t border-light-200 dark:border-dark-500" />

            <Menu.Item>
              <button
                type="button"
                disabled={!hasActiveSort}
                onClick={() => onChange("primary", null, "asc")}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-light-200 disabled:cursor-not-allowed disabled:opacity-60 dark:text-dark-950 dark:hover:bg-dark-400"
              >
                <HiMiniXMark className="h-4 w-4 text-dark-900" />
                Clear all sorting
              </button>
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
