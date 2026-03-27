import { useEffect, useMemo, useState } from "react";
import { exportThreadEvents } from "../lib/api";
import { resolveDebugPreferences } from "../lib/debugPreferences";
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

export const ThreadsPane = ({ isMobile = false }: { isMobile?: boolean }) => {
  const { snapshot, selectThread, callAction, selectedCwd, setSelectedCwd, debugPreferences } = useRuntimeStore();
  const debug = useMemo(() => resolveDebugPreferences(debugPreferences), [debugPreferences]);
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

  const openThread = async (threadId: string, options?: { preferReadOnly?: boolean }) => {
    const existingThread = snapshot.threads[threadId];
    const hasProjectedItems = existingThread
      ? existingThread.turnOrder.some((turnId) => (existingThread.turns[turnId]?.itemOrder.length ?? 0) > 0)
      : false;

    if (!options?.preferReadOnly && existingThread && existingThread.historyState !== "resumed" && !hasProjectedItems) {
      setActionMessage("Opening a resumed copy so full command, file, and tool history stays visible...");
      await resumeThread(threadId);
      return;
    }

    selectThread(threadId);
    navigateToRoute({ name: "thread", threadId });
    try {
      const response = await callAction<{ thread: { turns: Array<{ items: Array<unknown> }> } }>("thread.read", {
        threadId,
        includeTurns: true,
      });
      const turnCount = response.thread.turns.length;
      const itemCount = response.thread.turns.reduce((count, turn) => count + turn.items.length, 0);

      if (turnCount > 0 && itemCount === 0) {
        setActionMessage("Loaded turn summaries. Resuming a writable copy to recover full item history...");
        const resumed = await callAction<{ thread: { id: string } }>("thread.resume", {
          threadId,
          persistExtendedHistory: true,
        });
        const resumedThreadId = resumed.thread.id;
        selectThread(resumedThreadId);
        navigateToRoute({ name: "thread", threadId: resumedThreadId });
        setActionMessage("Loaded a resumed copy with full item history.");
        return;
      }

      setActionMessage("Loaded thread history.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const resumeThread = async (threadId: string) => {
    await runThreadAction<{ thread: { id: string } }>(
      "thread.resume",
      {
        threadId,
        persistExtendedHistory: true,
      },
      (response) => {
        const nextThreadId = response.thread.id;
        selectThread(nextThreadId);
        navigateToRoute({ name: "thread", threadId: nextThreadId });
      },
      "Resumed thread.",
    );
  };

  const forkThread = async (threadId: string) => {
    await runThreadAction<{ thread: { id: string } }>(
      "thread.fork",
      {
        threadId,
        persistExtendedHistory: true,
      },
      (response) => {
        const nextThreadId = response.thread.id;
        selectThread(nextThreadId);
        navigateToRoute({ name: "thread", threadId: nextThreadId });
      },
      "Forked thread.",
    );
  };

  const archiveThread = async (threadId: string) => {
    await runThreadAction(
      "thread.archive",
      {
        threadId,
      },
      undefined,
      "Archived thread.",
    );
  };

  return (
    <aside className={`panel flex h-full min-w-0 min-h-0 flex-col ${isMobile ? "rounded-[24px] p-3.5" : "rounded-[30px] p-4 lg:h-full lg:min-h-0"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-slate-500">Threads</div>
          <h2 className={`mt-1 font-semibold text-slate-50 ${isMobile ? "text-xl" : "text-lg"}`}>Conversation list</h2>
          <p className="mt-1 text-xs text-slate-500">{isMobile ? "Search, filter and jump back into a conversation." : "Compact threads grouped by workspace"}</p>
        </div>
        <button
          className={`primary-btn rounded-full font-medium ${isMobile ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"}`}
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
          className={`surface-soft w-full rounded-[18px] ${isMobile ? "px-3.5 py-3 text-[15px]" : "px-3 py-2 text-sm"}`}
        />
        <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "md:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto]"}`}>
          <div>
            <input
              list="thread-cwd-options"
              value={selectedCwd}
              onChange={(event) => setSelectedCwd(event.target.value)}
              placeholder="Workspace / cwd"
              className={`surface-soft w-full rounded-[18px] ${isMobile ? "px-3.5 py-3 text-[15px]" : "px-3 py-2 text-sm"}`}
            />
            <datalist id="thread-cwd-options">
              {cwdOptions.map((cwd) => (
                <option key={cwd} value={cwd} />
              ))}
            </datalist>
          </div>
          <button className={`ghost-btn rounded-[18px] ${isMobile ? "px-3 py-3 text-sm" : "px-3 py-2 text-xs"}`} onClick={() => void fetchThreads()}>
            Refresh
          </button>
          <button
            className={`rounded-[18px] ${isMobile ? "px-3 py-3 text-sm" : "px-3 py-2 text-xs"} ${showArchived ? "bg-rose-500/12 text-rose-200 ring-1 ring-rose-400/20" : "ghost-btn"}`}
            onClick={() => setShowArchived((value) => !value)}
          >
            Archived
          </button>
        </div>
        {actionMessage && (
          <div className="rounded-[16px] bg-white/[0.025] px-3 py-2 text-xs text-slate-400 ring-1 ring-white/6">
            {actionMessage}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{threads.length} visible</span>
        <span>{showArchived ? "Archive view" : "Active view"}</span>
      </div>

      <div className="scrollbar mt-3 min-h-0 flex-1 space-y-4 pr-1 overflow-y-auto">
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
                  className={`group relative rounded-[18px] transition ${
                    selected ? "bg-rose-500/[0.10] shadow-[0_0_0_1px_rgba(251,113,133,0.14)]" : "bg-white/[0.018] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      className={`block min-w-0 flex-1 rounded-[18px] text-left ${isMobile ? "px-3.5 py-3.5" : "px-3 py-2.5"}`}
                      title={thread.id}
                      onClick={() => void openThread(thread.id)}
                    >
                      <div className="min-w-0">
                        <div className={`truncate font-medium text-slate-100 ${isMobile ? "text-[14px]" : "text-[13px]"}`}>{threadTitle(thread)}</div>
                        <p className={`mt-0.5 truncate text-slate-400 ${isMobile ? "text-[12px]" : "text-[11px]"}`}>{threadPreview(thread)}</p>
                        <div className="mt-1 truncate text-[10px] text-slate-500">{metaBits.join(" • ") || (thread.cwd ?? "No workspace")}</div>
                      </div>
                    </button>

                    <details className={`relative shrink-0 ${isMobile ? "mr-2 mt-2.5" : "mr-2 mt-2"}`}>
                      <summary
                        className={`flex cursor-pointer list-none items-center justify-center rounded-full text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 ${isMobile ? "h-9 w-9 text-base" : "h-7 w-7 text-sm"}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        ...
                      </summary>
                      <div className="absolute right-0 top-8 z-20 flex min-w-[138px] flex-col gap-1 rounded-[16px] bg-[#171b21] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.28)] ring-1 ring-white/10">
                        <button className={`ghost-btn rounded-[12px] text-left ${isMobile ? "px-3 py-2 text-sm" : "px-3 py-1.5 text-xs"}`} onClick={() => void openThread(thread.id, { preferReadOnly: true })}>
                          Read
                        </button>
                        <button className={`ghost-btn rounded-[12px] text-left ${isMobile ? "px-3 py-2 text-sm" : "px-3 py-1.5 text-xs"}`} onClick={() => void resumeThread(thread.id)}>
                          Resume
                        </button>
                        <button className={`ghost-btn rounded-[12px] text-left ${isMobile ? "px-3 py-2 text-sm" : "px-3 py-1.5 text-xs"}`} onClick={() => void forkThread(thread.id)}>
                          Fork
                        </button>
                        <button className={`ghost-btn rounded-[12px] text-left ${isMobile ? "px-3 py-2 text-sm" : "px-3 py-1.5 text-xs"}`} onClick={() => void archiveThread(thread.id)}>
                          Archive
                        </button>
                        {debug.showRawEventControls && (
                          <button className={`ghost-btn rounded-[12px] text-left ${isMobile ? "px-3 py-2 text-sm" : "px-3 py-1.5 text-xs"}`} onClick={() => void exportThreadEvents(thread.id)}>
                            Export
                          </button>
                        )}
                      </div>
                    </details>
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
        className={`ghost-btn mt-4 rounded-[18px] disabled:opacity-50 ${isMobile ? "px-3 py-3 text-sm" : "px-3 py-2 text-xs"}`}
        onClick={() => void fetchThreads(cursor)}
      >
        {loading ? "Loading..." : cursor ? "Load more" : "No more threads"}
      </button>
    </aside>
  );
};
