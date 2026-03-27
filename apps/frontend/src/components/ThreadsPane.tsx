import { useEffect, useMemo, useState } from "react";
import { exportThreadEvents } from "../lib/api";
import { navigateToRoute } from "../lib/routes";
import { useRuntimeStore } from "../store/useRuntimeStore";

const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
};

const threadTitle = (thread: { metadata: Record<string, unknown>; summary: { preview: string } | null; id: string }): string => {
  const explicitName = typeof thread.metadata.name === "string" ? thread.metadata.name.trim() : "";
  if (explicitName) {
    return compactText(explicitName, 80);
  }
  if (thread.summary?.preview) {
    const firstLine = thread.summary.preview.split(/\r?\n/, 1)[0] ?? thread.summary.preview;
    return compactText(firstLine, 80);
  }
  return thread.id;
};

const threadPreview = (thread: { summary: { preview: string } | null }): string => {
  if (!thread.summary?.preview) {
    return "No preview yet";
  }
  return compactText(thread.summary.preview, 120);
};

const statusLabel = (status: unknown): string => {
  if (!status) {
    return "unknown";
  }
  if (typeof status === "string") {
    return status;
  }
  if (typeof status === "object" && "type" in (status as Record<string, unknown>)) {
    return String((status as Record<string, unknown>).type);
  }
  return JSON.stringify(status);
};

const matchesSearch = (
  thread: {
    metadata: Record<string, unknown>;
    summary: { preview: string } | null;
    id: string;
  },
  searchTerm: string,
): boolean => {
  if (!searchTerm) {
    return true;
  }
  const haystack = [threadTitle(thread), thread.summary?.preview ?? "", thread.id].join(" ").toLowerCase();
  return haystack.includes(searchTerm.toLowerCase());
};

export const ThreadsPane = () => {
  const { snapshot, selectThread, callAction, selectedCwd, setSelectedCwd } = useRuntimeStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const cwdOptions = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.threadOrder
            .map((id) => snapshot.threads[id]?.cwd)
            .filter((cwd): cwd is string => Boolean(cwd)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [snapshot.threadOrder, snapshot.threads],
  );

  const threads = useMemo(
    () =>
      snapshot.threadOrder
        .map((id) => snapshot.threads[id])
        .filter(Boolean)
        .filter((thread) => {
          if (showArchived && !thread.archived) {
            return false;
          }
          if (!showArchived && thread.archived) {
            return false;
          }
          if (!matchesSearch(thread, searchTerm)) {
            return false;
          }
          if (selectedCwd && thread.cwd !== selectedCwd) {
            return false;
          }
          return true;
        }),
    [searchTerm, selectedCwd, showArchived, snapshot.threadOrder, snapshot.threads],
  );

  const groupedThreads = useMemo(() => {
    const groups = new Map<string, typeof threads>();
    for (const thread of threads) {
      const key = thread.cwd || "No working directory";
      const items = groups.get(key) ?? [];
      items.push(thread);
      groups.set(key, items);
    }
    return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [threads]);

  const fetchThreads = async (nextCursor?: string | null): Promise<void> => {
    setLoading(true);
    try {
      const response = await callAction<{ nextCursor: string | null }>("thread.list", {
        cursor: nextCursor ?? null,
        limit: 30,
        searchTerm: searchTerm || null,
        cwd: selectedCwd || null,
        archived: showArchived,
        sortKey: "updated_at",
      });
      setCursor(response.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runThreadAction = async <T,>(
    action: string,
    payload: Record<string, unknown>,
    onSuccess?: (result: T) => void,
    successMessage?: string,
  ): Promise<void> => {
    try {
      const result = await callAction<T>(action, payload);
      if (successMessage) {
        setActionMessage(successMessage);
      }
      onSuccess?.(result);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="panel min-w-0 rounded-[30px] p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-slate-500">Threads</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Conversation list</h2>
          <p className="mt-1 text-xs text-slate-500">Compact threads grouped by workspace</p>
        </div>
        <button
          className="primary-btn rounded-full px-3 py-1.5 text-xs font-medium"
          onClick={() =>
            void runThreadAction<{ thread: { id: string } }>(
              "thread.start",
              {
                cwd: selectedCwd || null,
                approvalPolicy: "on-request",
                personality: "pragmatic",
                experimentalRawEvents: true,
                persistExtendedHistory: true,
              },
              (response) => {
                selectThread(response.thread.id);
                navigateToRoute({ name: "thread", threadId: response.thread.id });
              },
              "Started a new thread.",
            )
          }
        >
          New
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search threads"
          className="surface-soft w-full rounded-[18px] px-3 py-2 text-sm"
        />
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <select
            value={selectedCwd}
            onChange={(event) => setSelectedCwd(event.target.value)}
            className="surface-soft w-full rounded-[18px] px-3 py-2 text-sm"
          >
            <option value="">All workspaces</option>
            {cwdOptions.map((cwd) => (
              <option key={cwd} value={cwd}>
                {cwd}
              </option>
            ))}
          </select>
          <button className="ghost-btn rounded-[18px] px-3 py-2 text-xs" onClick={() => void fetchThreads()}>
            Refresh
          </button>
          <button
            className={`rounded-[18px] px-3 py-2 text-xs ${showArchived ? "bg-rose-500/12 text-rose-200 ring-1 ring-rose-400/20" : "ghost-btn"}`}
            onClick={() => setShowArchived((value) => !value)}
          >
            Archived
          </button>
        </div>
        {actionMessage && (
          <div className="rounded-[18px] bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
            {actionMessage}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{threads.length} visible</span>
        <span>{showArchived ? "Archive view" : "Active view"}</span>
      </div>

      <div className="scrollbar mt-3 space-y-4 pr-1 lg:flex-1 lg:overflow-y-auto">
        {groupedThreads.map(([cwdLabel, items]) => (
          <section key={cwdLabel} className="space-y-2">
            {!selectedCwd && (
              <div className="sticky top-0 z-10 bg-[rgba(23,25,29,0.92)] py-1 backdrop-blur">
                <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
                  <span className="truncate">{cwdLabel}</span>
                  <span>{items.length}</span>
                </div>
              </div>
            )}

            {items.map((thread) => {
              const selected = snapshot.selectedThreadId === thread.id;
              const metaBits = [thread.historyState, statusLabel(thread.summary?.status), thread.metadata.agentRole, thread.metadata.agentNickname]
                .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                .slice(0, 3);

              return (
                <div
                  key={thread.id}
                  className={`group relative rounded-[24px] transition ${
                    selected ? "bg-rose-500/[0.11] shadow-[0_0_0_1px_rgba(251,113,133,0.15)]" : "bg-white/[0.025] hover:bg-white/[0.045]"
                  }`}
                >
                  <button
                    className="block w-full rounded-[24px] px-3 py-3 pr-20 text-left"
                    title={thread.id}
                    onClick={() => {
                      selectThread(thread.id);
                      navigateToRoute({ name: "thread", threadId: thread.id });
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-100">{threadTitle(thread)}</div>
                        <p className="mt-1 truncate text-xs text-slate-400">{threadPreview(thread)}</p>
                        <div className="mt-2 truncate text-[11px] text-slate-500">{metaBits.join(" • ") || (thread.cwd ?? "No workspace")}</div>
                      </div>
                      <div className="status-chip shrink-0">
                        <span className="text-slate-200">{statusLabel(thread.summary?.status)}</span>
                      </div>
                    </div>
                  </button>

                  <div
                    className={`absolute right-2 top-2 flex flex-wrap gap-1 rounded-full bg-[rgba(12,14,18,0.86)] p-1 shadow-lg transition ${
                      selected ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                    }`}
                  >
                    <button
                      className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runThreadAction(
                          "thread.read",
                          {
                            threadId: thread.id,
                            includeTurns: true,
                          },
                          () => {
                            selectThread(thread.id);
                            navigateToRoute({ name: "thread", threadId: thread.id });
                          },
                          "Loaded thread history.",
                        );
                      }}
                    >
                      Read
                    </button>
                    <button
                      className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runThreadAction<{ thread: { id: string } }>(
                          "thread.resume",
                          {
                            threadId: thread.id,
                            persistExtendedHistory: true,
                          },
                          (response) => {
                            selectThread(response.thread.id);
                            navigateToRoute({ name: "thread", threadId: response.thread.id });
                          },
                          "Thread resumed and ready for new turns.",
                        );
                      }}
                    >
                      Resume
                    </button>
                    <button
                      className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runThreadAction<{ thread?: { id?: string } }>(
                          "thread.fork",
                          {
                            threadId: thread.id,
                            persistExtendedHistory: true,
                          },
                          (response) => {
                            const nextThreadId = String(response.thread?.id ?? "");
                            if (nextThreadId) {
                              selectThread(nextThreadId);
                              navigateToRoute({ name: "thread", threadId: nextThreadId });
                            }
                          },
                          "Forked thread into a new working copy.",
                        );
                      }}
                    >
                      Fork
                    </button>
                    <button
                      className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runThreadAction(
                          "thread.archive",
                          {
                            threadId: thread.id,
                          },
                          undefined,
                          "Archived thread.",
                        );
                      }}
                    >
                      Archive
                    </button>
                    <button
                      className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void exportThreadEvents(thread.id);
                      }}
                    >
                      Export
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}

        {threads.length === 0 && <div className="note-panel rounded-[24px] p-4 text-sm">No threads loaded.</div>}
      </div>

      <button
        disabled={!cursor || loading}
        className="ghost-btn mt-4 rounded-[18px] px-3 py-2 text-xs disabled:opacity-50"
        onClick={() => void fetchThreads(cursor)}
      >
        {loading ? "Loading..." : cursor ? "Load more" : "No more threads"}
      </button>
    </aside>
  );
};
