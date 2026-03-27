import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRecord, ItemRecord, TurnRecord } from "@codex-web/shared";
import { ComposerBar } from "./ComposerBar";
import { useRuntimeStore, type OptimisticTurn } from "../store/useRuntimeStore";
import { deriveWorkbenchGroups, extractItemBody, threadStats, threadTitle, type WorkbenchGroup } from "../lib/workbench";
import { navigateToRoute } from "../lib/routes";

const typeTone: Record<string, string> = {
  agentMessage: "border-emerald-500/30 bg-emerald-500/8",
  commandExecution: "border-amber-500/30 bg-amber-500/8",
  fileChange: "border-blue-500/30 bg-blue-500/8",
  enteredReviewMode: "border-fuchsia-500/30 bg-fuchsia-500/8",
  exitedReviewMode: "border-fuchsia-500/30 bg-fuchsia-500/8",
};

const isDialogueItem = (item: ItemRecord): boolean => item.type === "userMessage" || item.type === "agentMessage";
const isStreamingItem = (item: ItemRecord): boolean => item.completedAt === null || item.finalStatus !== "completed";
const isAssistantWorkItem = (item: ItemRecord): boolean =>
  item.type === "agentMessage" || item.type === "commandExecution" || item.type === "fileChange";

const isTurnRunning = (turn: TurnRecord): boolean =>
  turn.completedAt === null && ["pending", "inProgress", "running", "started"].includes(turn.status);

const turnHasUserMessage = (turn: TurnRecord): boolean =>
  turn.itemOrder.some((itemId) => turn.items[itemId]?.type === "userMessage");

const turnHasAssistantWork = (turn: TurnRecord): boolean =>
  turn.itemOrder.some((itemId) => {
    const item = turn.items[itemId];
    return Boolean(item) && isAssistantWorkItem(item);
  });

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

const RunningBadge = ({ label = "Running" }: { label?: string }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
    {label}
  </span>
);

const StreamingCursor = () => <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-emerald-300 align-middle" />;

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

const AssistantPlaceholder = ({
  status,
  error,
  message = "Codex is thinking...",
}: {
  status: OptimisticTurn["status"];
  error?: string | null;
  message?: string;
}) => {
  if (status === "failed") {
    return (
      <div className="rounded-3xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-100">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-rose-200">
          <span>Send Failed</span>
        </div>
        <div>{error || "Request failed before a real turn could start."}</div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-slate-100">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-200/90">
        <span>Codex</span>
        <RunningBadge label={status === "streaming" ? "Streaming" : "Thinking"} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span>{message}</span>
        <StreamingCursor />
      </div>
    </div>
  );
};

const CommandEntry = ({ item }: { item: ItemRecord }) => {
  const [open, setOpen] = useState(false);
  const running = isStreamingItem(item);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-2xl border border-slate-800 bg-slate-950/70"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-slate-100">{commandText(item)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <span>{itemSummary(item)}</span>
            {running && <RunningBadge label="Output Live" />}
          </div>
        </div>
        <div className="text-xs text-slate-500">{open ? "Hide" : "Show"}</div>
      </summary>
      <div className="border-t border-slate-800 px-4 py-3">
        <pre className="mono-panel scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs text-slate-100">
          {extractItemBody(item) || "No command output."}
          {running && <StreamingCursor />}
        </pre>
      </div>
    </details>
  );
};

const FileChangeEntry = ({ item }: { item: ItemRecord }) => {
  const [showRaw, setShowRaw] = useState(false);
  const changeCount = Array.isArray(item.rawItem?.changes) ? item.rawItem.changes.length : 0;
  const running = isStreamingItem(item);

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/8 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">File Changes</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <span>{changeCount} changes</span>
            {running && <RunningBadge label="Running" />}
          </div>
        </div>
        <button className="ghost-btn rounded-full px-3 py-1 text-[11px]" onClick={() => setShowRaw((value) => !value)}>
          {showRaw ? "Hide Diff" : "Show Diff"}
        </button>
      </div>
      {showRaw && (
        <pre className="mono-panel scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs text-slate-100">
          {item.aggregatedDeltas.fileChangeOutput || JSON.stringify(item.rawItem, null, 2)}
          {running && <StreamingCursor />}
        </pre>
      )}
    </div>
  );
};

const GenericItemEntry = ({ item, approvals }: { item: ItemRecord; approvals: ApprovalRecord[] }) => {
  const { selectItem } = useRuntimeStore();
  const [showRaw, setShowRaw] = useState(false);
  const running = isStreamingItem(item);

  return (
    <div className={`rounded-2xl border p-3 ${typeTone[item.type] ?? "surface-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => selectItem(item.id)}>
          <div className="text-sm font-semibold text-slate-100">{item.type}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span>{item.finalStatus}</span>
            {running && <RunningBadge label="Running" />}
          </div>
        </button>
        <button className="ghost-btn rounded-full px-2 py-1 text-[11px]" onClick={() => setShowRaw((value) => !value)}>
          Raw
        </button>
      </div>
      <pre className="mono-panel scrollbar mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl p-3 font-mono text-xs text-slate-100">
        {extractItemBody(item)}
        {running && <StreamingCursor />}
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
    const running = !isUser && isStreamingItem(item);
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`${
            isUser
              ? "max-w-[85%] rounded-[26px] border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-sm"
              : "w-full border-l-4 border-emerald-400/70 bg-transparent px-4 py-1"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-70">
            <span>{isUser ? "You" : "Codex"}</span>
            <span>{item.finalStatus}</span>
            {running && <RunningBadge label="Streaming" />}
          </div>
          <pre className={`whitespace-pre-wrap break-words font-sans text-sm ${isUser ? "text-stone-50" : "text-slate-100"}`}>
            {body}
            {running && <StreamingCursor />}
          </pre>
          <div className="mt-3 flex gap-2 text-[11px]">
            <button
              className={`rounded-full border px-2 py-1 ${
                isUser ? "border-slate-700 text-slate-300" : "border-slate-700 text-slate-400"
              }`}
              onClick={() => {
                selectItem(item.id);
                setShowRaw((value) => !value);
              }}
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
  const firstMessageStreaming = firstMessage?.item ? isStreamingItem(firstMessage.item) : false;

  return (
    <section className="space-y-4">
      {firstMessage?.item && (
        <div className="rounded-3xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-200/80">
            <span>Codex</span>
            {firstMessageStreaming && <RunningBadge label="Streaming" />}
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-slate-100">
            {extractItemBody(firstMessage.item)}
            {firstMessageStreaming && <StreamingCursor />}
          </pre>
        </div>
      )}

      {commandEntries.length > 0 && (
        <div className="space-y-3 rounded-3xl border border-slate-800/90 bg-slate-950/50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-200">
            <span>{commandEntries.length} commands</span>
            {commandEntries.some((entry) => entry.item && isStreamingItem(entry.item)) && <RunningBadge label="Live Output" />}
          </div>
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

const OptimisticTurnCard = ({ optimisticTurn }: { optimisticTurn: OptimisticTurn }) => (
  <article className="surface-card rounded-3xl p-4">
    <div className="mb-3 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Pending Turn</div>
        <strong className="font-mono text-sm text-slate-200">{optimisticTurn.localId}</strong>
      </div>
      {optimisticTurn.status !== "failed" ? <RunningBadge label="Waiting" /> : null}
    </div>
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[26px] border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-sm">
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] opacity-70">You</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-stone-50">{optimisticTurn.userText}</pre>
        </div>
      </div>
      <AssistantPlaceholder status={optimisticTurn.status} error={optimisticTurn.error} message={optimisticTurn.assistantPlaceholder} />
    </div>
  </article>
);

const TurnCard = ({
  turn,
  approvals,
  groups,
  optimisticTurn,
}: {
  turn: TurnRecord;
  approvals: ApprovalRecord[];
  groups: WorkbenchGroup[];
  optimisticTurn?: OptimisticTurn;
}) => {
  const showOptimisticUser = Boolean(optimisticTurn) && !turnHasUserMessage(turn) && optimisticTurn?.status !== "failed";
  const showOptimisticAssistant =
    Boolean(optimisticTurn) &&
    optimisticTurn?.status !== "failed" &&
    !turnHasAssistantWork(turn) &&
    isTurnRunning(turn);

  return (
    <article className="surface-card rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Turn</div>
          <strong className="font-mono text-sm text-slate-200">{turn.id}</strong>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">{turn.status}</span>
          {isTurnRunning(turn) && <RunningBadge />}
        </div>
      </div>
      <div className="space-y-5">
        {showOptimisticUser && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[26px] border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-sm">
              <div className="mb-2 text-[11px] uppercase tracking-[0.2em] opacity-70">You</div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-stone-50">{optimisticTurn?.userText}</pre>
            </div>
          </div>
        )}
        {groups.map((group) => (
          <WorkbenchGroupView key={group.id} group={group} />
        ))}
        {showOptimisticAssistant && (
          <AssistantPlaceholder status={optimisticTurn?.status ?? "sending"} message={optimisticTurn?.assistantPlaceholder} />
        )}
        {approvals.length === 0 && turn.itemOrder.length === 0 && !showOptimisticAssistant && (
          <div className="note-panel rounded-2xl p-4 text-sm">No items recorded for this turn yet.</div>
        )}
      </div>
    </article>
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
          <div className="flex items-center gap-2">
            {currentTerminal.status === "running" && <RunningBadge label="TTY Live" />}
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
          </div>
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
        {currentTerminal?.status === "running" && <StreamingCursor />}
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
  const { snapshot, callAction, optimisticTurns } = useRuntimeStore();
  const thread = snapshot.selectedThreadId ? snapshot.threads[snapshot.selectedThreadId] : null;
  const [showTerminal, setShowTerminal] = useState(false);
  const [followOutput, setFollowOutput] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stats = threadStats(thread);

  const optimisticThreadTurns = useMemo(() => {
    if (!thread) {
      return [];
    }
    return optimisticTurns.filter((entry) => entry.threadId === thread.id);
  }, [optimisticTurns, thread]);

  const optimisticTurnsByTurnId = useMemo(
    () =>
      new Map(
        optimisticThreadTurns
          .filter((entry) => entry.turnId && thread?.turns[entry.turnId])
          .map((entry) => [entry.turnId as string, entry]),
      ),
    [optimisticThreadTurns, thread],
  );

  const standaloneOptimisticTurns = useMemo(() => {
    if (!thread) {
      return [];
    }
    return optimisticThreadTurns.filter((entry) => !entry.turnId || !thread.turns[entry.turnId]);
  }, [optimisticThreadTurns, thread]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !followOutput) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [followOutput, optimisticThreadTurns, snapshot.lastUpdatedAt]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    setFollowOutput(element.scrollHeight - element.scrollTop - element.clientHeight < 120);
  }, [thread?.id]);

  if (!thread) {
    return (
      <section className="panel min-w-0 rounded-3xl p-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div className="note-panel rounded-3xl p-8 text-sm">
          {routeThreadId
            ? `Route points to thread ${routeThreadId}, but it is not loaded in the local projection yet. Use thread/read or resume it before relying on local history.`
            : "Select a thread from the left column. Thread pages render a workbench projection over `thread / turn / item`, not synthetic assistant bubbles."}
        </div>
        {routeThreadId && (
          <div className="mt-4">
            <ComposerBar embedded />
          </div>
        )}
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
          {thread.activeTurnId && <RunningBadge />}
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

      <div
        ref={scrollRef}
        onScroll={() => {
          const element = scrollRef.current;
          if (!element) {
            return;
          }
          setFollowOutput(element.scrollHeight - element.scrollTop - element.clientHeight < 120);
        }}
        className="scrollbar space-y-4 pr-1 lg:flex-1 lg:overflow-y-auto"
      >
        {thread.turnOrder.length === 0 && standaloneOptimisticTurns.length === 0 && (
          <div className="note-panel rounded-3xl p-6 text-sm">
            History not loaded. Use `thread/read` or `thread/resume`.
          </div>
        )}
        {thread.turnOrder.map((turnId) => {
          const turn = thread.turns[turnId];
          const approvals = turn.pendingApprovals.map((requestId) => snapshot.approvals[requestId]).filter(Boolean);
          const groups = deriveWorkbenchGroups(turn, snapshot.approvals);
          return (
            <TurnCard
              key={turnId}
              turn={turn}
              approvals={approvals}
              groups={groups}
              optimisticTurn={optimisticTurnsByTurnId.get(turnId)}
            />
          );
        })}
        {standaloneOptimisticTurns.map((optimisticTurn) => (
          <OptimisticTurnCard key={optimisticTurn.localId} optimisticTurn={optimisticTurn} />
        ))}
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
