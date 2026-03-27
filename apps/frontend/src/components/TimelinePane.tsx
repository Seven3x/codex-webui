import { useMemo, useState } from "react";
import type { ApprovalRecord, ItemRecord } from "@codex-web/shared";
import { ComposerBar } from "./ComposerBar";
import { useRuntimeStore } from "../store/useRuntimeStore";
import { deriveWorkbenchGroups, extractItemBody, threadStats, threadTitle, type WorkbenchEntry, type WorkbenchGroup } from "../lib/workbench";
import { navigateToRoute } from "../lib/routes";

const typeTone: Record<string, string> = {
  agentMessage: "border-emerald-500/30 bg-emerald-500/8",
  commandExecution: "border-amber-500/30 bg-amber-500/8",
  fileChange: "border-blue-500/30 bg-blue-500/8",
  enteredReviewMode: "border-fuchsia-500/30 bg-fuchsia-500/8",
  exitedReviewMode: "border-fuchsia-500/30 bg-fuchsia-500/8",
};

const isDialogueItem = (item: ItemRecord): boolean => item.type === "userMessage" || item.type === "agentMessage";

const commandText = (item: ItemRecord): string => {
  if (!item.rawItem || typeof item.rawItem.command !== "string") {
    return "command";
  }
  return item.rawItem.command;
};

const itemSummary = (item: ItemRecord): string => {
  if (item.type === "commandExecution") {
    const exitCode = item.rawItem?.exitCode;
    return typeof exitCode === "number" ? `exit ${exitCode}` : item.finalStatus;
  }
  if (item.type === "fileChange" && Array.isArray(item.rawItem?.changes)) {
    return `${item.rawItem.changes.length} changes`;
  }
  return item.finalStatus;
};

const ApprovalCard = ({ approval }: { approval: ApprovalRecord }) => {
  const { callAction } = useRuntimeStore();
  return (
    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 p-3">
      <div className="flex items-center justify-between">
        <strong className="min-w-0 break-words pr-2 text-sm text-rose-100">{approval.method}</strong>
        <span className="rounded-full bg-rose-950/50 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-rose-200">{approval.status}</span>
      </div>
      <pre className="mono-panel mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl p-3 text-xs text-slate-100">{JSON.stringify(approval.params, null, 2)}</pre>
      {approval.status === "pending" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {["accept", "acceptForSession", "decline", "cancel"].map((decision) => (
            <button
              key={decision}
              className="ghost-btn rounded-full px-3 py-1 text-[11px]"
              onClick={() =>
                void callAction("approval.respond", {
                  requestId: approval.requestId,
                  decision,
                })
              }
            >
              {decision}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const CommandEntry = ({ item }: { item: ItemRecord }) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-2xl border border-slate-800 bg-slate-950/70"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-slate-100">{commandText(item)}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{itemSummary(item)}</div>
        </div>
        <div className="text-xs text-slate-500">{open ? "Hide" : "Show"}</div>
      </summary>
      <div className="border-t border-slate-800 px-4 py-3">
        <pre className="mono-panel scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs text-slate-100">
          {extractItemBody(item) || "No command output."}
        </pre>
      </div>
    </details>
  );
};

const FileChangeEntry = ({ item }: { item: ItemRecord }) => {
  const [showRaw, setShowRaw] = useState(false);
  const changeCount = Array.isArray(item.rawItem?.changes) ? item.rawItem.changes.length : 0;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/8 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">File Changes</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{changeCount} changes</div>
        </div>
        <button className="ghost-btn rounded-full px-3 py-1 text-[11px]" onClick={() => setShowRaw((value) => !value)}>
          {showRaw ? "Hide Diff" : "Show Diff"}
        </button>
      </div>
      {showRaw && (
        <pre className="mono-panel scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs text-slate-100">
          {item.aggregatedDeltas.fileChangeOutput || JSON.stringify(item.rawItem, null, 2)}
        </pre>
      )}
    </div>
  );
};

const GenericItemEntry = ({ item, approvals }: { item: ItemRecord; approvals: ApprovalRecord[] }) => {
  const { selectItem } = useRuntimeStore();
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className={`rounded-2xl border p-3 ${typeTone[item.type] ?? "surface-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => selectItem(item.id)}>
          <div className="text-sm font-semibold text-slate-100">{item.type}</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{item.finalStatus}</div>
        </button>
        <button className="ghost-btn rounded-full px-2 py-1 text-[11px]" onClick={() => setShowRaw((value) => !value)}>
          Raw
        </button>
      </div>
      <pre className="mono-panel scrollbar mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl p-3 font-mono text-xs text-slate-100">
        {extractItemBody(item)}
      </pre>
      {showRaw && (
        <pre className="mono-panel scrollbar mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl p-3 font-mono text-xs text-slate-100">
          {JSON.stringify(item.rawItem, null, 2)}
        </pre>
      )}
      {approvals.length > 0 && <div className="mt-3 space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
    </div>
  );
};

const ItemCard = ({
  item,
  approvals,
}: {
  item: ItemRecord;
  approvals: ApprovalRecord[];
}) => {
  const { selectItem } = useRuntimeStore();
  const [showRaw, setShowRaw] = useState(false);
  const body = extractItemBody(item);

  if (isDialogueItem(item)) {
    const isUser = item.type === "userMessage";
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`${
            isUser
              ? "max-w-[85%] rounded-[26px] border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-sm"
              : "w-full border-l-4 border-emerald-400/70 bg-transparent px-4 py-1"
          }`}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-70">
            <span>{isUser ? "You" : "Codex"}</span>
            <span>{item.finalStatus}</span>
          </div>
          <pre className={`whitespace-pre-wrap break-words font-sans text-sm ${isUser ? "text-stone-50" : "text-slate-100"}`}>
            {body}
          </pre>
          <div className="mt-3 flex gap-2 text-[11px]">
            <button
              className={`rounded-full border px-2 py-1 ${
                isUser ? "border-slate-700 text-slate-300" : "border-slate-700 text-slate-400"
              }`}
              onClick={() => setShowRaw((value) => !value)}
            >
              Raw
            </button>
          </div>
          {showRaw && (
            <pre className="mono-panel scrollbar mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl p-3 font-mono text-xs text-stone-50">
              {JSON.stringify(item.rawItem, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (item.type === "commandExecution") {
    return (
      <div className="space-y-3">
        <CommandEntry item={item} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
      </div>
    );
  }

  if (item.type === "fileChange") {
    return (
      <div className="space-y-3">
        <FileChangeEntry item={item} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
      </div>
    );
  }

  return <GenericItemEntry item={item} approvals={approvals} />;
};

const CodexGroup = ({ group }: { group: WorkbenchGroup }) => {
  const firstMessage = group.entries.find((entry) => entry.kind === "item" && entry.item?.type === "agentMessage");
  const commandEntries = group.entries.filter((entry) => entry.kind === "item" && entry.item?.type === "commandExecution");
  const fileEntries = group.entries.filter((entry) => entry.kind === "item" && entry.item?.type === "fileChange");
  const otherEntries = group.entries.filter(
    (entry) =>
      (entry.kind === "approval" && entry.approval) ||
      (entry.kind === "item" &&
        entry.item &&
        entry.item.type !== "agentMessage" &&
        entry.item.type !== "commandExecution" &&
        entry.item.type !== "fileChange"),
  );

  return (
    <section className="space-y-4">
      {firstMessage?.item && (
        <div className="px-2 py-1">
          <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-slate-100">
            {extractItemBody(firstMessage.item)}
          </pre>
        </div>
      )}

      {commandEntries.length > 0 && (
        <div className="space-y-3 rounded-3xl border border-slate-800/90 bg-slate-950/50 px-4 py-3">
          <div className="text-sm font-semibold text-slate-200">{commandEntries.length} commands</div>
          <div className="space-y-2">
            {commandEntries.map((entry) =>
              entry.item ? <CommandEntry key={entry.item.id} item={entry.item} /> : null,
            )}
          </div>
        </div>
      )}

      {fileEntries.map((entry) => (entry.item ? <FileChangeEntry key={entry.item.id} item={entry.item} /> : null))}

      {otherEntries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} />;
        }
        if (!entry.item) {
          return null;
        }
        return <GenericItemEntry key={entry.item.id} item={entry.item} approvals={entry.approvals} />;
      })}
    </section>
  );
};

const WorkbenchGroupView = ({ group }: { group: WorkbenchGroup }) => {
  if (group.lane === "codex") {
    return <CodexGroup group={group} />;
  }

  if (group.lane === "user") {
    const firstEntry = group.entries[0];
    if (!firstEntry?.item) {
      return null;
    }
    return <ItemCard item={firstEntry.item} approvals={firstEntry.approvals} />;
  }

  return (
    <section className="space-y-3 rounded-3xl border border-slate-800/80 bg-slate-900/35 p-3">
      {group.entries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} />;
        }
        if (!entry.item) {
          return null;
        }
        return <ItemCard key={entry.item.id} item={entry.item} approvals={entry.approvals} />;
      })}
    </section>
  );
};

const TerminalPanel = () => {
  const { snapshot, callAction } = useRuntimeStore();
  const [command, setCommand] = useState("bash");
  const [stdin, setStdin] = useState("");
  const [rows, setRows] = useState("26");
  const [cols, setCols] = useState("100");

  const currentTerminal = useMemo(() => {
    const terminals = Object.values(snapshot.terminals);
    return terminals.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }, [snapshot.terminals]);

  return (
    <div className="surface-card min-w-0 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">PTY Terminal</h3>
          <p className="text-xs text-slate-500">`command/exec` + `tty: true` + outputDelta</p>
        </div>
        {currentTerminal && (
          <button
            className="ghost-btn rounded-full px-3 py-1 text-xs"
            onClick={() =>
              void callAction("command.exec.terminate", {
                processId: currentTerminal.processId,
              })
            }
          >
            Terminate
          </button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          className="surface-soft rounded-2xl px-3 py-2 text-sm"
          placeholder="Command argv, split by spaces"
        />
        <input value={rows} onChange={(event) => setRows(event.target.value)} className="surface-soft rounded-2xl px-3 py-2 text-sm" />
        <input value={cols} onChange={(event) => setCols(event.target.value)} className="surface-soft rounded-2xl px-3 py-2 text-sm" />
        <button
          className="primary-btn rounded-2xl px-3 py-2 text-sm font-medium"
          onClick={() =>
            void callAction<{ processId: string }>("command.exec.start", {
              command: command.split(" ").filter(Boolean),
              size: { rows: Number(rows), cols: Number(cols) },
            })
          }
        >
          Start
        </button>
      </div>
      <pre className="mono-panel scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-3xl p-4 font-mono text-xs text-stone-100">
        {currentTerminal ? `${currentTerminal.stdout}${currentTerminal.stderr}` : "No PTY session yet."}
      </pre>
      {currentTerminal && (
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void callAction("command.exec.write", {
                  processId: currentTerminal.processId,
                  deltaBase64: btoa(`${stdin}\n`),
                }).then(() => setStdin(""));
              }
            }}
            className="surface-soft rounded-2xl px-3 py-2 text-sm"
            placeholder="Write stdin; Enter sends"
          />
          <button
            className="ghost-btn rounded-2xl px-3 py-2 text-xs"
            onClick={() =>
              void callAction("command.exec.write", {
                processId: currentTerminal.processId,
                deltaBase64: btoa(stdin),
              }).then(() => setStdin(""))
            }
          >
            Send
          </button>
          <button
            className="ghost-btn rounded-2xl px-3 py-2 text-xs"
            onClick={() =>
              void callAction("command.exec.resize", {
                processId: currentTerminal.processId,
                size: { rows: Number(rows), cols: Number(cols) },
              })
            }
          >
            Resize
          </button>
        </div>
      )}
    </div>
  );
};

export const TimelinePane = ({ routeThreadId }: { routeThreadId?: string | null }) => {
  const { snapshot, callAction } = useRuntimeStore();
  const thread = snapshot.selectedThreadId ? snapshot.threads[snapshot.selectedThreadId] : null;
  const [showTerminal, setShowTerminal] = useState(false);
  const stats = threadStats(thread);

  if (!thread) {
    return (
      <section className="panel min-w-0 rounded-3xl p-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div className="note-panel rounded-3xl p-8 text-sm">
          {routeThreadId
            ? `Route points to thread ${routeThreadId}, but it is not loaded in the local projection yet. Use thread/read or thread/resume from the left pane.`
            : "Select a thread from the left column. Thread pages render a workbench projection over `thread / turn / item`, not synthetic assistant bubbles."}
        </div>
        <div className="mt-4 note-panel rounded-3xl p-4 text-sm">
          输入框已经移到 thread 工作区里。先从左侧打开一个线程，或者新建 thread 后再开始 turn。
        </div>
      </section>
    );
  }

  return (
    <section className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="surface-soft mb-4 flex flex-col gap-3 rounded-3xl px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-slate-50">{threadTitle(thread)}</h2>
          <p className="text-xs text-slate-500">{thread.cwd}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-right">
          <div className="rounded-full bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">{thread.status}</div>
          <div className="rounded-full bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">{stats.turns} turns</div>
          <div className="rounded-full bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">{stats.items} items</div>
          <button
            className="ghost-btn rounded-full px-3 py-1 text-[11px]"
            onClick={() =>
              void callAction("thread.resume", {
                threadId: thread.id,
                persistExtendedHistory: true,
              })
            }
          >
            Resume
          </button>
          <button
            className="ghost-btn rounded-full px-3 py-1 text-[11px]"
            onClick={() =>
              void callAction<{ thread?: { id?: string } }>("thread.fork", {
                threadId: thread.id,
                persistExtendedHistory: true,
              }).then((response) => {
                const nextThreadId = String(response.thread?.id ?? "");
                if (nextThreadId) {
                  navigateToRoute({ name: "thread", threadId: nextThreadId });
                }
              })
            }
          >
            Fork
          </button>
        </div>
      </div>

      <div className="scrollbar space-y-4 pr-1 lg:flex-1 lg:overflow-y-auto">
        {thread.turnOrder.length === 0 && (
          <div className="note-panel rounded-3xl p-6 text-sm">
            History not loaded. Use `thread/read` or `thread/resume`.
          </div>
        )}
        {thread.turnOrder.map((turnId) => {
          const turn = thread.turns[turnId];
          const approvals = turn.pendingApprovals.map((requestId) => snapshot.approvals[requestId]).filter(Boolean);
          const groups = deriveWorkbenchGroups(turn, snapshot.approvals);
          return (
            <article key={turnId} className="surface-card rounded-3xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Turn</div>
                  <strong className="font-mono text-sm text-slate-200">{turn.id}</strong>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">{turn.status}</span>
              </div>
              <div className="space-y-5">
                {groups.map((group) => (
                  <WorkbenchGroupView key={group.id} group={group} />
                ))}
                {approvals.length === 0 && turn.itemOrder.length === 0 && (
                  <div className="note-panel rounded-2xl p-4 text-sm">No items recorded for this turn.</div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        <ComposerBar embedded />
        <div className="surface-soft rounded-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-400">PTY Terminal</div>
            <button
              className="ghost-btn rounded-full px-3 py-1 text-xs"
              onClick={() => setShowTerminal((value) => !value)}
            >
              {showTerminal ? "Hide Terminal" : "Open Terminal"}
            </button>
          </div>
          {showTerminal && <div className="mt-4"><TerminalPanel /></div>}
        </div>
      </div>
    </section>
  );
};
