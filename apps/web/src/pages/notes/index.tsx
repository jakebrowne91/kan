import type { NextPageWithLayout } from "../_app";
import type { RouterOutputs } from "~/utils/api";
import { t } from "@lingui/core/macro";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  HiMagnifyingGlass,
  HiOutlineDocumentText,
  HiOutlinePlusSmall,
  HiOutlineTrash,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

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
  const deferredContent = useDeferredValue(content);

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

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[290px_minmax(0,1fr)]">
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

          <main className="min-h-0 overflow-y-auto">
            {selectedNote ? (
              <div className="grid min-h-full grid-cols-1 lg:grid-cols-2">
                <section className="flex min-h-[520px] flex-col border-b border-light-300 dark:border-dark-300 lg:border-b-0 lg:border-r">
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
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={t`Write markdown...`}
                    className="min-h-0 flex-1 resize-none border-0 bg-light-50 p-5 font-mono text-sm leading-6 text-light-1000 outline-none placeholder:text-light-900 dark:bg-dark-50 dark:text-dark-1000 dark:placeholder:text-dark-900"
                    spellCheck
                  />
                </section>

                <section className="min-h-[520px] bg-light-100 p-5 dark:bg-dark-100">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-light-900 dark:text-dark-900">
                      {t`Preview`}
                    </h2>
                    <span className="text-xs text-light-800 dark:text-dark-800">
                      {updateNote.isPending ? t`Saving...` : t`Saved`}
                    </span>
                  </div>
                  <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-light-1000 prose-p:text-light-1000 prose-li:text-light-1000 prose-code:text-light-1000 dark:prose-headings:text-dark-1000 dark:prose-p:text-dark-1000 dark:prose-li:text-dark-1000 dark:prose-code:text-dark-1000">
                    {deferredContent.trim() ? (
                      <ReactMarkdown>{deferredContent}</ReactMarkdown>
                    ) : (
                      <p className="text-light-900 dark:text-dark-900">
                        {t`Nothing to preview yet.`}
                      </p>
                    )}
                  </article>
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
