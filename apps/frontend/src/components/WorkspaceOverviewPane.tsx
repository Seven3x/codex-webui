import { useMemo } from "react";
import { useRuntimeStore } from "../store/useRuntimeStore";
import { navigateToRoute } from "../lib/routes";
import { threadStats, threadTitle } from "../lib/workbench";

export const WorkspaceOverviewPane = () => {
  const { snapshot, selectedCwd, callAction } = useRuntimeStore();

  const filteredThreads = useMemo(
    () =>
      snapshot.threadOrder
        .map((threadId) => snapshot.threads[threadId])
        .filter(Boolean)
        .filter((thread) => !selectedCwd || thread.cwd === selectedCwd),
    [selectedCwd, snapshot.threadOrder, snapshot.threads],
  );

  const latestThreads = filteredThreads.slice(0, 5);
  const totals = useMemo(() => {
    return filteredThreads.reduce(
      (acc, thread) => {
        const stats = threadStats(thread);
        acc.threads += 1;
        acc.turns += stats.turns;
        acc.items += stats.items;
        acc.approvals += stats.approvals;
        return acc;
      },
      { threads: 0, turns: 0, items: 0, approvals: 0 },
    );
  }, [filteredThreads]);

  return (
    <section className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="surface-soft rounded-3xl px-4 py-4">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Workspace Overview</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">{selectedCwd || "All Workspaces"}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          中栏现在是工作台首页，不是假聊天页。这里优先看 thread 活跃度、最近上下文和协议能力入口；真正输入和 turn 控制只放在线程页里。
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <div className="surface-card rounded-3xl p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Threads</div>
          <div className="mt-2 text-2xl font-semibold text-slate-50">{totals.threads}</div>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Turns</div>
          <div className="mt-2 text-2xl font-semibold text-slate-50">{totals.turns}</div>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Items</div>
          <div className="mt-2 text-2xl font-semibold text-slate-50">{totals.items}</div>
        </div>
        <div className="surface-card rounded-3xl p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Pending Approvals</div>
          <div className="mt-2 text-2xl font-semibold text-slate-50">{snapshot.runtime.pendingServerRequests.length}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="surface-card rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Recent Threads</div>
              <div className="text-xs text-slate-500">按当前工作目录过滤后的最近线程</div>
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
                navigateToRoute({ name: "thread", threadId: response.thread.id });
              }}
            >
              New Thread
            </button>
          </div>
          <div className="space-y-3">
            {latestThreads.map((thread) => (
              <button
                key={thread.id}
                className="surface-soft w-full rounded-2xl px-4 py-3 text-left transition hover:bg-slate-800/70"
                onClick={() => navigateToRoute({ name: "thread", threadId: thread.id })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{thread.historyState}</div>
                    <div className="mt-1 break-words text-sm font-semibold text-slate-100">{threadTitle(thread)}</div>
                  </div>
                  <div className="rounded-full bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                    {thread.status}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>{thread.cwd || "no cwd"}</span>
                  <span>{thread.activeTurnId ? "active turn" : "idle"}</span>
                </div>
              </button>
            ))}
            {latestThreads.length === 0 && <div className="note-panel rounded-2xl p-4 text-sm">No threads available for the current workspace filter.</div>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card rounded-3xl p-4">
            <div className="text-sm font-semibold text-slate-100">Protocol Surface</div>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              <div>`thread/list`, `thread/read`, `thread/resume`, `thread/fork`, `thread/archive`</div>
              <div>`turn/start`, `turn/steer`, `turn/interrupt`, `review/start`</div>
              <div>`item/*` streaming, approvals, raw unknown events</div>
              <div>`command/exec` PTY terminal; `thread/shellCommand` 取决于本机生成 schema</div>
            </div>
          </div>
          <div className="surface-card rounded-3xl p-4">
            <div className="text-sm font-semibold text-slate-100">Runtime Notes</div>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              {(snapshot.notes.length > 0 ? snapshot.notes.slice(-5) : ["No runtime notes yet."]).map((note, index) => (
                <div key={`${note}-${index}`} className="note-panel rounded-2xl px-3 py-2">
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

