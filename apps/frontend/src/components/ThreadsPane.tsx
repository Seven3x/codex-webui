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
    return "No preview";
  }
  return compactText(thread.summary.preview, 180);
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

export const ThreadsPane = () => {
  const { snapshot, selectThread, callAction, selectedCwd, setSelectedCwd } = useRuntimeStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          if (searchTerm && !JSON.stringify(thread.summary).toLowerCase().includes(searchTerm.toLowerCase())) {
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

  return (
    <aside className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Workspaces</h2>
          <p className="text-xs text-slate-500">按工作目录组织对话线程</p>
        </div>
        <button
          className="primary-btn rounded-full px-3 py-1 text-xs font-medium"
          onClick={async () => {
            const response = await callAction<{ thread: { id: string } }>("thread.start", {
              cwd: selectedCwd || null,
              approvalPolicy: "on-request",
              personality: "pragmatic",
              experimentalRawEvents: true,
              persistExtendedHistory: true,
            });
            selectThread(response.thread.id);
            navigateToRoute({ name: "thread", threadId: response.thread.id });
          }}
        >
          New Thread
        </button>
      </div>

      <div className="space-y-2">
        <select
          value={selectedCwd}
          onChange={(event) => setSelectedCwd(event.target.value)}
          className="surface-card w-full rounded-2xl px-3 py-2 text-sm"
        >
          <option value="">All workspaces</option>
          {cwdOptions.map((cwd) => (
            <option key={cwd} value={cwd}>
              {cwd}
            </option>
          ))}
        </select>
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search title / preview"
          className="surface-card w-full rounded-2xl px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            className="ghost-btn flex-1 rounded-2xl px-3 py-2 text-xs"
            onClick={() => void fetchThreads()}
          >
            Apply
          </button>
          <button
            className={`flex-1 rounded-2xl px-3 py-2 text-xs ${showArchived ? "border border-rose-400/50 bg-rose-500/10 text-rose-200" : "ghost-btn"}`}
            onClick={() => setShowArchived((value) => !value)}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="scrollbar mt-4 space-y-3 pr-1 lg:flex-1 lg:overflow-y-auto">
        {groupedThreads.map(([cwdLabel, items]) => (
          <section key={cwdLabel} className="space-y-3">
            {!selectedCwd && (
              <div className="sticky top-0 z-10 rounded-2xl border border-slate-800/80 bg-[rgba(23,25,29,0.96)] px-3 py-2 backdrop-blur">
                <div className="surface-soft rounded-xl px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace</div>
                  <div className="truncate text-sm text-slate-200">{cwdLabel}</div>
                </div>
              </div>
            )}
            {items.map((thread) => (
              <div
                key={thread.id}
                className={`rounded-3xl border p-3 transition ${snapshot.selectedThreadId === thread.id ? "border-rose-400/50 bg-rose-500/10 shadow-[0_0_0_1px_rgba(251,113,133,0.08)]" : "surface-card"}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => {
                    selectThread(thread.id);
                    navigateToRoute({ name: "thread", threadId: thread.id });
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">{thread.historyState} thread</div>
                      <strong className="block min-w-0 break-words text-sm text-slate-100">{threadTitle(thread)}</strong>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                      {statusLabel(thread.summary?.status)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-xs text-slate-400 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                    {threadPreview(thread)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>{thread.cwd || "no cwd"}</span>
                    {thread.metadata.agentNickname != null && <span>{String(thread.metadata.agentNickname)}</span>}
                    {thread.metadata.agentRole != null && <span>{String(thread.metadata.agentRole)}</span>}
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                    onClick={() =>
                      void callAction("thread.read", {
                        threadId: thread.id,
                        includeTurns: true,
                      }).then(() => {
                        selectThread(thread.id);
                        navigateToRoute({ name: "thread", threadId: thread.id });
                      })
                    }
                  >
                    Read
                  </button>
                  <button
                    className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                    onClick={() =>
                      void callAction("thread.resume", {
                        threadId: thread.id,
                        persistExtendedHistory: true,
                      }).then(() => {
                        selectThread(thread.id);
                        navigateToRoute({ name: "thread", threadId: thread.id });
                      })
                    }
                  >
                    Resume
                  </button>
                  <button
                    className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                    onClick={() =>
                      void callAction("thread.fork", {
                        threadId: thread.id,
                        persistExtendedHistory: true,
                      }).then((response) => {
                        const nextThreadId = typeof response === "object" && response && "thread" in response
                          ? String((response as { thread?: { id?: string } }).thread?.id ?? "")
                          : "";
                        if (nextThreadId) {
                          selectThread(nextThreadId);
                          navigateToRoute({ name: "thread", threadId: nextThreadId });
                        }
                      })
                    }
                  >
                    Fork
                  </button>
                  <button
                    className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                    onClick={() =>
                      void callAction("thread.archive", {
                        threadId: thread.id,
                      })
                    }
                  >
                    Archive
                  </button>
                  <button
                    className="ghost-btn rounded-full px-2 py-1 text-[11px]"
                    onClick={() => void exportThreadEvents(thread.id)}
                  >
                    Export
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))}
        {threads.length === 0 && <div className="note-panel rounded-3xl p-4 text-sm">No threads loaded.</div>}
      </div>

      <button
        disabled={!cursor || loading}
        className="ghost-btn mt-4 rounded-2xl px-3 py-2 text-xs disabled:opacity-50"
        onClick={() => void fetchThreads(cursor)}
      >
        {loading ? "Loading..." : cursor ? "Load more" : "No more"}
      </button>
    </aside>
  );
};
