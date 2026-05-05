import type { Editor as TiptapEditor } from "@tiptap/react";
import type { MarkdownStorage } from "tiptap-markdown";
import { t } from "@lingui/core/macro";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiH1,
  HiH2,
  HiMagnifyingGlass,
  HiOutlineBold,
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

const untitledNote = t`Untitled note`;

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
  const loadedNotePublicId = useRef<string | null>(null);

  const notesQuery = api.note.list.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: workspace.publicId.length >= 12 },
  );

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const selectedNote = notes.find(
    (note) => note.publicId === selectedNotePublicId,
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
    if (selectedNotePublicId || notes.length === 0) return;
    setSelectedNotePublicId(notes[0]?.publicId ?? null);
  }, [notes, selectedNotePublicId]);

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

    createNote.mutate({
      workspacePublicId: workspace.publicId,
      title: untitledNote,
      content: "",
    });
  };

  const handleDeleteNote = () => {
    if (!selectedNote) return;
    if (!window.confirm(t`Delete this note?`)) return;

    deleteNote.mutate({ notePublicId: selectedNote.publicId });
  };

  return (
    <>
      <PageHead title={t`Notes | ${workspace.name || t`Workspace`}`} />
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-light-300 px-5 py-4 dark:border-dark-300 md:px-6">
          <div>
            <h1 className="text-base font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              {t`Notes`}
            </h1>
            <p className="mt-1 text-sm text-light-900 dark:text-dark-900">
              {t`Simple markdown notes for this workspace.`}
            </p>
          </div>
          <Button
            type="button"
            onClick={handleCreateNote}
            isLoading={createNote.isPending}
            iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
          >
            {t`New`}
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-light-300 dark:border-dark-300 md:border-b-0 md:border-r">
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

          <main className="h-full min-h-0 overflow-y-auto">
            {selectedNote ? (
              <div className="flex min-h-full flex-col">
                <section className="flex min-h-full flex-col">
                  <div className="flex shrink-0 items-center gap-2 border-b border-light-300 px-5 py-3 dark:border-dark-300">
                    <HiOutlineDocumentText className="h-5 w-5 text-light-900 dark:text-dark-900" />
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-light-1000 outline-none placeholder:text-light-900 dark:text-dark-1000 dark:placeholder:text-dark-900"
                      placeholder={untitledNote}
                    />
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
                  <NotesMarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder={t`Write markdown...`}
                  />
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
