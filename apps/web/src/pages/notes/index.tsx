import type { Editor as TiptapEditor } from "@tiptap/react";
import type { MarkdownStorage } from "tiptap-markdown";
import { t } from "@lingui/core/macro";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { addDays, format, isValid, parse } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiChevronLeft,
  HiChevronRight,
  HiH1,
  HiH2,
  HiMagnifyingGlass,
  HiOutlineBold,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftEllipsis,
  HiOutlineCodeBracket,
  HiOutlineCodeBracketSquare,
  HiOutlineDocumentText,
  HiOutlineItalic,
  HiOutlineLink,
  HiOutlineListBullet,
  HiOutlineMinus,
  HiOutlineNumberedList,
  HiOutlinePlusSmall,
  HiOutlineStrikethrough,
  HiOutlineTrash,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";
import { Markdown } from "tiptap-markdown";

import type { NextPageWithLayout } from "../_app";
import type { RouterOutputs } from "~/utils/api";
import Button from "~/components/Button";
import { getDashboardLayout } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";
import Popup from "~/components/Popup";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

type Note = RouterOutputs["note"]["list"][number];
type CodeNoteMode = "env" | "json" | "yaml";

const untitledNote = t`Untitled note`;
const dailyNoteDateFormat = "EEE, do MMMM, yyyy";

const codeModeLabels = {
  env: "ENV",
  json: "JSON",
  yaml: "YAML",
} satisfies Record<CodeNoteMode, string>;

const getCodeNoteMode = (title: string): CodeNoteMode | null => {
  const titleParts = title
    .trim()
    .toLowerCase()
    .split(/[\s/\\]+/);

  if (
    titleParts.some(
      (part) =>
        part === ".env" ||
        part.startsWith(".env.") ||
        part.endsWith(".env") ||
        part.includes(".env."),
    )
  ) {
    return "env";
  }

  if (
    titleParts.some(
      (part) =>
        part.endsWith(".json") ||
        part.includes(".json.") ||
        part.includes(".json-") ||
        part.includes(".json_"),
    )
  ) {
    return "json";
  }

  if (
    titleParts.some(
      (part) =>
        part.endsWith(".yaml") ||
        part.endsWith(".yml") ||
        part.includes(".yaml.") ||
        part.includes(".yml.") ||
        part.includes(".yaml-") ||
        part.includes(".yml-") ||
        part.includes(".yaml_") ||
        part.includes(".yml_"),
    )
  ) {
    return "yaml";
  }

  return null;
};

const formatDailyNoteTitle = (date: Date) => format(date, dailyNoteDateFormat);

const parseDailyNoteTitle = (title: string) => {
  const parsedDate = parse(title.trim(), dailyNoteDateFormat, new Date());

  return isValid(parsedDate) ? parsedDate : null;
};

const formatUpdatedAt = (note: Note) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(note.updatedAt ?? note.createdAt);

const getPreview = (content: string) => {
  const preview = content
    .replaceAll("#", "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return preview || t`No content yet`;
};

const toolbarButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-light-900 transition-colors hover:bg-light-200 hover:text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-1000 dark:focus:ring-dark-600";

const activeToolbarButtonClass =
  "bg-light-200 text-light-1000 dark:bg-dark-200 dark:text-dark-1000";

const getEditorMarkdown = (editor: TiptapEditor) => {
  const storage = editor.storage as Record<string, unknown>;
  const markdownStorage = storage.markdown as MarkdownStorage | undefined;

  return markdownStorage?.getMarkdown() ?? "";
};

function NoteToolbarButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={twMerge(
        toolbarButtonClass,
        active && activeToolbarButtonClass,
      )}
    >
      {icon}
    </button>
  );
}

function NotesMarkdownToolbar({ editor }: { editor: TiptapEditor | null }) {
  const disabled = !editor;

  const insertLink = () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t`Link URL`, previousUrl ?? "https://");

    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  const controls = [
    {
      label: t`Bold`,
      icon: <HiOutlineBold className="h-4 w-4" />,
      active: editor?.isActive("bold"),
      onClick: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: t`Italic`,
      icon: <HiOutlineItalic className="h-4 w-4" />,
      active: editor?.isActive("italic"),
      onClick: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: t`Strikethrough`,
      icon: <HiOutlineStrikethrough className="h-4 w-4" />,
      active: editor?.isActive("strike"),
      onClick: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      label: t`Code`,
      icon: <HiOutlineCodeBracket className="h-4 w-4" />,
      active: editor?.isActive("code"),
      onClick: () => editor?.chain().focus().toggleCode().run(),
    },
    {
      label: t`Link`,
      icon: <HiOutlineLink className="h-4 w-4" />,
      active: editor?.isActive("link"),
      onClick: insertLink,
    },
    {
      label: t`Heading 1`,
      icon: <HiH1 className="h-4 w-4" />,
      active: editor?.isActive("heading", { level: 1 }),
      onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: t`Heading 2`,
      icon: <HiH2 className="h-4 w-4" />,
      active: editor?.isActive("heading", { level: 2 }),
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: t`Bullet list`,
      icon: <HiOutlineListBullet className="h-4 w-4" />,
      active: editor?.isActive("bulletList"),
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: t`Numbered list`,
      icon: <HiOutlineNumberedList className="h-4 w-4" />,
      active: editor?.isActive("orderedList"),
      onClick: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t`Quote`,
      icon: <HiOutlineChatBubbleLeftEllipsis className="h-4 w-4" />,
      active: editor?.isActive("blockquote"),
      onClick: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: t`Code block`,
      icon: <HiOutlineCodeBracketSquare className="h-4 w-4" />,
      active: editor?.isActive("codeBlock"),
      onClick: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: t`Divider`,
      icon: <HiOutlineMinus className="h-4 w-4" />,
      onClick: () => editor?.chain().focus().setHorizontalRule().run(),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {controls.map((control) => (
        <NoteToolbarButton
          key={control.label}
          label={control.label}
          icon={control.icon}
          active={control.active}
          disabled={disabled}
          onClick={control.onClick}
        />
      ))}
    </div>
  );
}

function NotesBubbleMenu({ editor }: { editor: TiptapEditor | null }) {
  if (!editor) return null;

  return (
    <BubbleMenu editor={editor}>
      <div className="flex items-center gap-1 rounded-md border border-light-300 bg-light-50 p-1 shadow-sm dark:border-dark-300 dark:bg-dark-50">
        <NoteToolbarButton
          label={t`Bold`}
          icon={<HiOutlineBold className="h-4 w-4" />}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <NoteToolbarButton
          label={t`Italic`}
          icon={<HiOutlineItalic className="h-4 w-4" />}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <NoteToolbarButton
          label={t`Link`}
          icon={<HiOutlineLink className="h-4 w-4" />}
          active={editor.isActive("link")}
          onClick={() => {
            const previousUrl = editor.getAttributes("link").href as
              | string
              | undefined;
            const url = window.prompt(t`Link URL`, previousUrl ?? "https://");
            if (url === null) return;
            if (url.trim() === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url.trim() })
              .run();
          }}
        />
        <NoteToolbarButton
          label={t`Code`}
          icon={<HiOutlineCodeBracket className="h-4 w-4" />}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
      </div>
    </BubbleMenu>
  );
}

function NotesMarkdownEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const lastSyncedValue = useRef(value);
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Link.configure({
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          HTMLAttributes: {
            class:
              "text-blue-600 underline underline-offset-2 dark:text-blue-400",
            target: "_blank",
            rel: "noopener noreferrer",
          },
        }),
        Markdown.configure({
          breaks: false,
          bulletListMarker: "-",
          transformCopiedText: true,
          transformPastedText: true,
        }),
        Placeholder.configure({
          placeholder,
        }),
      ],
      content: value,
      onUpdate: ({ editor }) => {
        const nextMarkdown = getEditorMarkdown(editor);
        lastSyncedValue.current = nextMarkdown;
        onChange(nextMarkdown);
      },
      editorProps: {
        attributes: {
          class:
            "min-h-[460px] max-w-3xl px-5 py-6 outline-none focus:outline-none md:px-8",
        },
      },
      injectCSS: false,
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    if (value === lastSyncedValue.current) return;

    const currentMarkdown = getEditorMarkdown(editor);
    if (value === currentMarkdown) {
      lastSyncedValue.current = value;
      return;
    }

    lastSyncedValue.current = value;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  return (
    <div className="flex flex-col">
      <div className="shrink-0 border-b border-light-300 px-5 py-2 dark:border-dark-300 md:px-6">
        <NotesMarkdownToolbar editor={editor} />
      </div>
      <div className="bg-light-50 dark:bg-dark-50">
        <style jsx global>{`
          .notes-markdown-editor .tiptap {
            color: inherit;
          }

          .notes-markdown-editor .tiptap p.is-editor-empty:first-child::before {
            color: oklch(0.55 0 0);
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }

          .dark
            .notes-markdown-editor
            .tiptap
            p.is-editor-empty:first-child::before {
            color: oklch(0.76 0 0);
          }

          .notes-markdown-editor .tiptap > * + * {
            margin-top: 0.85rem;
          }

          .notes-markdown-editor .tiptap h1 {
            font-size: 1.875rem;
            font-weight: 700;
            line-height: 1.2;
          }

          .notes-markdown-editor .tiptap h2 {
            font-size: 1.375rem;
            font-weight: 700;
            line-height: 1.3;
          }

          .notes-markdown-editor .tiptap h3 {
            font-size: 1.125rem;
            font-weight: 700;
            line-height: 1.4;
          }

          .notes-markdown-editor .tiptap ul,
          .notes-markdown-editor .tiptap ol {
            padding-left: 1.5rem;
          }

          .notes-markdown-editor .tiptap ul {
            list-style: disc;
          }

          .notes-markdown-editor .tiptap ol {
            list-style: decimal;
          }

          .notes-markdown-editor .tiptap blockquote {
            border-left: 3px solid oklch(0.895 0 0);
            color: oklch(0.55 0 0);
            padding-left: 1rem;
          }

          .dark .notes-markdown-editor .tiptap blockquote {
            border-left-color: oklch(0.47 0 0);
            color: oklch(0.76 0 0);
          }

          .notes-markdown-editor .tiptap code {
            border-radius: 0.25rem;
            background: oklch(0.925 0 0);
            padding: 0.1rem 0.25rem;
            font-family:
              var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo,
              Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.9em;
          }

          .dark .notes-markdown-editor .tiptap code {
            background: oklch(0.415 0 0);
          }

          .notes-markdown-editor .tiptap pre {
            overflow-x: auto;
            border-radius: 0.5rem;
            background: oklch(0.925 0 0);
            padding: 1rem;
          }

          .dark .notes-markdown-editor .tiptap pre {
            background: oklch(0.415 0 0);
          }

          .notes-markdown-editor .tiptap pre code {
            background: transparent;
            padding: 0;
          }

          .notes-markdown-editor .tiptap hr {
            border: 0;
            border-top: 1px solid oklch(0.91 0 0);
            margin: 1.5rem 0;
          }

          .dark .notes-markdown-editor .tiptap hr {
            border-top-color: oklch(0.435 0 0);
          }
        `}</style>
        <EditorContent
          editor={editor}
          className="notes-markdown-editor prose prose-sm dark:prose-invert max-w-none text-light-1000 dark:text-dark-1000"
        />
        <NotesBubbleMenu editor={editor} />
      </div>
    </div>
  );
}

const codeEditorLineClass = "h-6 whitespace-pre text-sm leading-6";

const renderCodePrimitive = (value: string, keyPrefix: string) => {
  if (!value) return null;

  const trimmed = value.trim();
  const className =
    trimmed.startsWith('"') || trimmed.startsWith("'")
      ? "text-emerald-700 dark:text-emerald-300"
      : /^(true|false|null|undefined)$/i.test(trimmed) ||
          /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)
        ? "text-violet-700 dark:text-violet-300"
        : "text-amber-700 dark:text-amber-300";

  return (
    <span key={keyPrefix} className={className}>
      {value}
    </span>
  );
};

const renderEnvLine = (line: string, lineIndex: number) => {
  if (!line) return <span>{"\u00a0"}</span>;
  if (line.trimStart().startsWith("#")) {
    return <span className="text-light-800 dark:text-dark-800">{line}</span>;
  }

  const match = /^(\s*)(export\s+)?([A-Za-z_][\w.-]*)(\s*=\s*)(.*)$/.exec(line);
  if (!match) return <span>{line}</span>;

  return (
    <>
      <span>{match[1]}</span>
      {match[2] ? (
        <span className="text-violet-700 dark:text-violet-300">{match[2]}</span>
      ) : null}
      <span className="text-blue-700 dark:text-blue-300">{match[3]}</span>
      <span className="text-light-900 dark:text-dark-900">{match[4]}</span>
      {renderCodePrimitive(match[5] ?? "", `env-value-${lineIndex}`)}
    </>
  );
};

const renderJsonLine = (line: string, lineIndex: number) => {
  if (!line) return <span>{"\u00a0"}</span>;

  const tokens =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}:,]|\[|\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokens.exec(line))) {
    const token = tokenMatch[0];
    const index = tokenMatch.index;

    if (index > lastIndex) {
      parts.push(
        <span key={`json-plain-${lineIndex}-${lastIndex}`}>
          {line.slice(lastIndex, index)}
        </span>,
      );
    }

    const isKey =
      token.startsWith('"') && /^\s*:/.test(line.slice(index + token.length));
    const className = isKey
      ? "text-blue-700 dark:text-blue-300"
      : token.startsWith('"')
        ? "text-emerald-700 dark:text-emerald-300"
        : /^(true|false|null|-?\d)/.test(token)
          ? "text-violet-700 dark:text-violet-300"
          : "text-light-900 dark:text-dark-900";

    parts.push(
      <span key={`json-token-${lineIndex}-${index}`} className={className}>
        {token}
      </span>,
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(
      <span key={`json-plain-${lineIndex}-${lastIndex}`}>
        {line.slice(lastIndex)}
      </span>,
    );
  }

  return parts;
};

const renderYamlLine = (line: string, lineIndex: number) => {
  if (!line) return <span>{"\u00a0"}</span>;
  if (line.trimStart().startsWith("#")) {
    return <span className="text-light-800 dark:text-dark-800">{line}</span>;
  }

  const commentIndex = line.indexOf(" #");
  const body = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const keyMatch = /^(\s*(?:-\s*)?)([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/.exec(body);

  if (!keyMatch) {
    return (
      <>
        <span>{body}</span>
        {comment ? (
          <span className="text-light-800 dark:text-dark-800">{comment}</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <span>{keyMatch[1]}</span>
      <span className="text-blue-700 dark:text-blue-300">{keyMatch[2]}</span>
      <span className="text-light-900 dark:text-dark-900">{keyMatch[3]}</span>
      {renderCodePrimitive(keyMatch[4] ?? "", `yaml-value-${lineIndex}`)}
      {comment ? (
        <span className="text-light-800 dark:text-dark-800">{comment}</span>
      ) : null}
    </>
  );
};

const renderCodeLine = (
  line: string,
  mode: CodeNoteMode,
  lineIndex: number,
) => {
  if (mode === "env") return renderEnvLine(line, lineIndex);
  if (mode === "json") return renderJsonLine(line, lineIndex);
  return renderYamlLine(line, lineIndex);
};

function NotesCodeEditor({
  mode,
  value,
  onChange,
}: {
  mode: CodeNoteMode;
  value: string;
  onChange: (value: string) => void;
}) {
  const lines = value.split("\n");
  const visibleLineCount = Math.max(lines.length, 20);
  const editorHeight = visibleLineCount * 24 + 40;
  const editorWidth =
    Math.max(...lines.map((line) => line.length), 80) * 8 + 56;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;

    onChange(nextValue);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  };

  return (
    <div className="flex flex-col bg-light-50 dark:bg-dark-50">
      <div className="overflow-x-auto">
        <div
          className="relative min-w-full font-mono text-sm text-light-1000 dark:text-dark-1000"
          style={{ height: editorHeight, width: editorWidth }}
        >
          <div
            aria-hidden="true"
            className="grid grid-cols-[3.5rem_minmax(0,1fr)]"
            style={{ height: editorHeight }}
          >
            <div className="select-none border-r border-light-300 bg-light-100 px-3 py-5 text-right text-light-800 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-800">
              {Array.from({ length: visibleLineCount }, (_, index) => (
                <div key={index} className={codeEditorLineClass}>
                  {index + 1}
                </div>
              ))}
            </div>
            <pre className="m-0 overflow-hidden px-5 py-5">
              {Array.from({ length: visibleLineCount }, (_, index) => (
                <div key={index} className={codeEditorLineClass}>
                  {renderCodeLine(lines[index] ?? "", mode, index)}
                </div>
              ))}
            </pre>
          </div>
          {!value ? (
            <div className="pointer-events-none absolute left-[3.5rem] top-0 px-5 py-5 font-mono text-sm leading-6 text-light-800 dark:text-dark-800">
              {mode === "env"
                ? "API_KEY=..."
                : mode === "json"
                  ? '{ "key": "value" }'
                  : "key: value"}
            </div>
          ) : null}
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off"
            aria-label={t`Note content`}
            className="absolute left-[3.5rem] right-0 top-0 resize-none overflow-hidden border-0 bg-transparent px-5 py-5 font-mono text-sm leading-6 text-transparent caret-light-1000 outline-none selection:bg-blue-500/20 focus:outline-none dark:caret-dark-1000 dark:selection:bg-blue-300/20"
            style={{ height: editorHeight }}
          />
        </div>
      </div>
    </div>
  );
}

const NotesView = () => {
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [selectedNotePublicId, setSelectedNotePublicId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const loadedNotePublicId = useRef<string | null>(null);

  const notesQuery = api.note.list.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: workspace.publicId.length >= 12 },
  );

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const selectedNote = notes.find(
    (note) => note.publicId === selectedNotePublicId,
  );
  const codeMode = getCodeNoteMode(title);
  const selectedDailyNoteDate = useMemo(
    () => parseDailyNoteTitle(title),
    [title],
  );

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return notes;

    return notes.filter((note) =>
      `${note.title} ${note.content}`.toLowerCase().includes(query),
    );
  }, [notes, search]);

  const createNote = api.note.create.useMutation({
    onSuccess: async (note) => {
      setSelectedNotePublicId(note.publicId);
      await utils.note.list.invalidate();
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to create note`,
        message: error.message,
        icon: "error",
      });
    },
  });
  const createNoteMutate = createNote.mutate;
  const isCreatingNote = createNote.isPending;

  const updateNote = api.note.update.useMutation({
    onSuccess: async () => {
      await utils.note.list.invalidate();
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to save note`,
        message: error.message,
        icon: "error",
      });
    },
  });
  const updateNoteMutate = updateNote.mutate;

  const deleteNote = api.note.delete.useMutation({
    onSuccess: async () => {
      setSelectedNotePublicId(null);
      await utils.note.list.invalidate();
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to delete note`,
        message: error.message,
        icon: "error",
      });
    },
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktopViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isDesktopViewport || selectedNotePublicId || notes.length === 0)
      return;
    setSelectedNotePublicId(notes[0]?.publicId ?? null);
  }, [isDesktopViewport, notes, selectedNotePublicId]);

  useEffect(() => {
    if (!selectedNote) {
      loadedNotePublicId.current = null;
      setTitle("");
      setContent("");
      return;
    }

    if (loadedNotePublicId.current === selectedNote.publicId) return;
    loadedNotePublicId.current = selectedNote.publicId;
    setTitle(selectedNote.title);
    setContent(selectedNote.content);
  }, [selectedNote]);

  useEffect(() => {
    if (!selectedNote) return;

    const nextTitle = title.trim() || untitledNote;
    if (nextTitle === selectedNote.title && content === selectedNote.content) {
      return;
    }

    const timeout = window.setTimeout(() => {
      updateNoteMutate({
        notePublicId: selectedNote.publicId,
        title: nextTitle,
        content,
      });
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [content, selectedNote, title, updateNoteMutate]);

  const handleCreateNote = () => {
    if (workspace.publicId.length < 12) return;

    createNoteMutate({
      workspacePublicId: workspace.publicId,
      title: untitledNote,
      content: "",
    });
  };

  const handleOpenDailyNote = useCallback(
    (date: Date) => {
      if (workspace.publicId.length < 12 || isCreatingNote) return;

      const dailyTitle = formatDailyNoteTitle(date);
      const existingNote = notes.find((note) => note.title === dailyTitle);

      if (existingNote) {
        setSelectedNotePublicId(existingNote.publicId);
        return;
      }

      createNoteMutate({
        workspacePublicId: workspace.publicId,
        title: dailyTitle,
        content: "",
      });
    },
    [createNoteMutate, isCreatingNote, notes, workspace.publicId],
  );

  const handleOpenToday = useCallback(() => {
    handleOpenDailyNote(new Date());
  }, [handleOpenDailyNote]);

  const handleDeleteNote = () => {
    if (!selectedNote) return;
    if (!window.confirm(t`Delete this note?`)) return;

    deleteNote.mutate({ notePublicId: selectedNote.publicId });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "d") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;

      event.preventDefault();
      handleOpenToday();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenToday]);

  return (
    <>
      <PageHead title={t`Notes | ${workspace.name || t`Workspace`}`} />
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-light-300 px-5 py-4 dark:border-dark-300 md:px-6">
          <div>
            <h1 className="text-base font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              {t`Notes`}
            </h1>
            <p className="mt-1 text-sm text-light-900 dark:text-dark-900">
              {t`Simple markdown notes for this workspace.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleOpenToday}
              isLoading={isCreatingNote}
              iconLeft={<HiOutlineCalendarDays className="h-4 w-4" />}
            >
              {t`Today`}
            </Button>
            <Button
              type="button"
              onClick={handleCreateNote}
              isLoading={isCreatingNote}
              iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
            >
              {t`New`}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[290px_minmax(0,1fr)]">
          <aside
            className={twMerge(
              "min-h-0 flex-col border-b border-light-300 dark:border-dark-300 md:flex md:border-b-0 md:border-r",
              selectedNote ? "hidden" : "flex",
            )}
          >
            <div className="p-3">
              <div className="relative">
                <HiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-light-900 dark:text-dark-900" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t`Search notes`}
                  className="block h-9 w-full rounded-md border-0 bg-light-200 pl-9 pr-3 text-sm text-light-1000 ring-1 ring-inset ring-light-300 placeholder:text-light-900 focus:ring-2 focus:ring-light-900 dark:bg-dark-200 dark:text-dark-1000 dark:ring-dark-300 dark:placeholder:text-dark-900 dark:focus:ring-dark-900"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {notesQuery.isLoading ? (
                <div className="px-3 py-8 text-center text-sm text-light-900 dark:text-dark-900">
                  {t`Loading notes...`}
                </div>
              ) : filteredNotes.length ? (
                <ul className="space-y-1">
                  {filteredNotes.map((note) => {
                    const isSelected = note.publicId === selectedNotePublicId;

                    return (
                      <li key={note.publicId}>
                        <button
                          type="button"
                          onClick={() => setSelectedNotePublicId(note.publicId)}
                          className={twMerge(
                            "w-full rounded-md px-3 py-2 text-left transition-colors",
                            isSelected
                              ? "bg-light-200 dark:bg-dark-200"
                              : "hover:bg-light-200 dark:hover:bg-dark-200",
                          )}
                        >
                          <div className="line-clamp-1 text-sm font-semibold text-light-1000 dark:text-dark-1000">
                            {note.title}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-light-900 dark:text-dark-900">
                            {getPreview(note.content)}
                          </div>
                          <div className="mt-2 text-[11px] text-light-800 dark:text-dark-800">
                            {formatUpdatedAt(note)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-3 py-8 text-center text-sm text-light-900 dark:text-dark-900">
                  {search ? t`No notes found` : t`No notes yet`}
                </div>
              )}
            </div>
          </aside>

          <main
            className={twMerge(
              "h-full min-h-0 overflow-y-auto md:block",
              selectedNote ? "block" : "hidden",
            )}
          >
            {selectedNote ? (
              <div className="flex min-h-full flex-col">
                <section className="flex min-h-full flex-col">
                  <div className="flex shrink-0 items-center gap-2 border-b border-light-300 px-5 py-3 dark:border-dark-300">
                    <button
                      type="button"
                      onClick={() => setSelectedNotePublicId(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-light-900 transition-colors hover:bg-light-200 hover:text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-1000 dark:focus:ring-dark-600 md:hidden"
                      aria-label={t`Back to notes`}
                    >
                      <HiChevronLeft className="h-5 w-5" />
                    </button>
                    <HiOutlineDocumentText className="h-5 w-5 text-light-900 dark:text-dark-900" />
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-light-1000 outline-none placeholder:text-light-900 dark:text-dark-1000 dark:placeholder:text-dark-900"
                      placeholder={untitledNote}
                    />
                    {selectedDailyNoteDate ? (
                      <div className="hidden items-center gap-1 md:flex">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDailyNote(
                              addDays(selectedDailyNoteDate, -1),
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-light-900 transition-colors hover:bg-light-200 hover:text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-1000 dark:focus:ring-dark-600"
                          aria-label={t`Previous daily note`}
                        >
                          <HiChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenDailyNote(
                              addDays(selectedDailyNoteDate, 1),
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-light-900 transition-colors hover:bg-light-200 hover:text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-1000 dark:focus:ring-dark-600"
                          aria-label={t`Next daily note`}
                        >
                          <HiChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    {codeMode ? (
                      <span className="rounded border border-light-300 px-2 py-1 font-mono text-[11px] font-semibold text-light-900 dark:border-dark-300 dark:text-dark-900">
                        {codeModeLabels[codeMode]}
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={handleDeleteNote}
                      isLoading={deleteNote.isPending}
                      iconLeft={<HiOutlineTrash className="h-4 w-4" />}
                      aria-label={t`Delete note`}
                    />
                  </div>
                  {codeMode ? (
                    <NotesCodeEditor
                      mode={codeMode}
                      value={content}
                      onChange={setContent}
                    />
                  ) : (
                    <NotesMarkdownEditor
                      value={content}
                      onChange={setContent}
                      placeholder={t`Write markdown...`}
                    />
                  )}
                </section>
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center p-6 text-center">
                <div>
                  <HiOutlineDocumentText className="mx-auto h-10 w-10 text-light-800 dark:text-dark-800" />
                  <h2 className="mt-4 text-sm font-semibold text-light-1000 dark:text-dark-1000">
                    {t`No note selected`}
                  </h2>
                  <p className="mt-2 text-sm text-light-900 dark:text-dark-900">
                    {t`Create a note to start writing markdown.`}
                  </p>
                  <div className="mt-4">
                    <Button
                      type="button"
                      onClick={handleCreateNote}
                      isLoading={createNote.isPending}
                      iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
                    >
                      {t`New note`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

const NotesPage: NextPageWithLayout = () => {
  return (
    <>
      <NotesView />
      <Popup />
    </>
  );
};

NotesPage.getLayout = (page) => getDashboardLayout(page);

export default NotesPage;
