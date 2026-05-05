import React, { forwardRef, useState } from "react";
import ContentEditable from "react-contenteditable";
import { HiOutlineEye, HiOutlineEyeSlash } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  contentEditable?: boolean;
  prefix?: string;
  iconRight?: React.ReactNode;
  minHeight?: number;
  value?: string;
  errorMessage?: string;
  className?: string;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  type?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      contentEditable,
      errorMessage,
      prefix,
      value,
      onChange,
      onKeyDown,
      iconRight,
      className,
      type = "text",
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    if (contentEditable) {
      return (
        <ContentEditable
          placeholder={props.placeholder}
          html={value ?? ""}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className={twMerge(
            "block min-h-[70px] w-full cursor-text overflow-y-auto rounded-md border-0 bg-light-50 px-3 py-1.5 text-light-1000 shadow-sm ring-1 ring-inset ring-light-700 placeholder:text-light-950 focus:ring-2 focus:ring-inset focus:ring-light-900 focus-visible:outline-none dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:placeholder:text-dark-900 dark:focus:ring-dark-900 sm:text-sm sm:leading-6",
            className && className,
          )}
        />
      );
    }

    return (
      <div className="flex w-full flex-col gap-1">
        <div className="relative flex">
          {prefix && (
            <div className="flex shrink-0 items-center rounded-l-md border border-r-0 border-light-600 px-3 text-sm dark:border-dark-700 dark:text-dark-1000 sm:text-sm/6">
              {prefix}
            </div>
          )}
          <input
            ref={ref}
            value={value}
            onChange={onChange}
            type={type === "password" && showPassword ? "text" : type}
            className={twMerge(
              "block w-full rounded-md border-0 bg-light-50 py-1.5 text-sm text-light-1000 shadow-sm ring-1 ring-inset ring-light-700 placeholder:text-light-950 focus:ring-2 focus:ring-inset focus:ring-light-900 dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:placeholder:text-dark-900 dark:focus:ring-dark-900 sm:leading-6",
              prefix && "rounded-l-none",
              type === "password" && "pr-8",
              className && className,
            )}
            onKeyDown={onKeyDown}
            {...props}
          />
          {type === "password" && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-light-900 dark:text-dark-900"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <HiOutlineEyeSlash className="h-4 w-4" />
              ) : (
                <HiOutlineEye className="h-4 w-4" />
              )}
            </button>
          )}
          {iconRight && type !== "password" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 leading-[0]">
              {iconRight}
            </div>
          )}
        </div>
        {errorMessage && (
          <div className="text-xs text-red-500">{errorMessage}</div>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
