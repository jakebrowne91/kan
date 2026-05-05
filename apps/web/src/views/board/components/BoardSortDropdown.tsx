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

export function BoardSortDropdown({
  sortBy,
  direction,
  isLoading,
  onChange,
}: {
  sortBy: BoardSortBy | null;
  direction: BoardSortDirection;
  isLoading: boolean;
  onChange: (sortBy: BoardSortBy | null, direction: BoardSortDirection) => void;
}) {
  const activeKey = sortBy ? `${sortBy}-${direction}` : null;
  const sortOptions = [
    {
      key: "labels-asc",
      label: "Labels A-Z",
      sortBy: "labels" as const,
      direction: "asc" as const,
      icon: <HiOutlineTag className="h-4 w-4" />,
    },
    {
      key: "labels-desc",
      label: "Labels Z-A",
      sortBy: "labels" as const,
      direction: "desc" as const,
      icon: <HiOutlineTag className="h-4 w-4" />,
    },
    {
      key: "createdAt-desc",
      label: "Newest first",
      sortBy: "createdAt" as const,
      direction: "desc" as const,
      icon: <HiOutlineClock className="h-4 w-4" />,
    },
    {
      key: "createdAt-asc",
      label: "Oldest first",
      sortBy: "createdAt" as const,
      direction: "asc" as const,
      icon: <HiOutlineClock className="h-4 w-4" />,
    },
    {
      key: "priority-desc",
      label: "Priority high to low",
      sortBy: "priority" as const,
      direction: "desc" as const,
      icon: <HiOutlineFlag className="h-4 w-4" />,
    },
    {
      key: "priority-asc",
      label: "Priority low to high",
      sortBy: "priority" as const,
      direction: "asc" as const,
      icon: <HiOutlineFlag className="h-4 w-4" />,
    },
  ];

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
        <Menu.Items className="absolute left-0 z-[100] mt-2 w-60 origin-top-left rounded-md border border-light-200 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-dark-400 dark:bg-dark-300">
          <div className="flex flex-col">
            {sortOptions.map((option) => {
              const isActive = option.key === activeKey;

              return (
                <Menu.Item key={option.key}>
                  <button
                    type="button"
                    onClick={() => onChange(option.sortBy, option.direction)}
                    className={twMerge(
                      "flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-light-200 dark:text-dark-950 dark:hover:bg-dark-400",
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
            })}

            <div className="my-1 border-t border-light-200 dark:border-dark-500" />

            <Menu.Item>
              <button
                type="button"
                disabled={!sortBy}
                onClick={() => onChange(null, "asc")}
                className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-light-200 disabled:cursor-not-allowed disabled:opacity-60 dark:text-dark-950 dark:hover:bg-dark-400"
              >
                <HiMiniXMark className="h-4 w-4 text-dark-900" />
                Clear sort
              </button>
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
