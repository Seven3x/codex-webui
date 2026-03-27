import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRecord, ItemRecord, TurnRecord } from "@codex-web/shared";
import { ComposerBar } from "./ComposerBar";
import { useRuntimeStore, type OptimisticTurn } from "../store/useRuntimeStore";
import { deriveWorkbenchGroups, extractItemBody, threadStats, threadTitle, type WorkbenchGroup } from "../lib/workbench";
import { navigateToRoute } from "../lib/routes";

type WorkbenchViewMode = "focus" | "inspect";

const typeTone: Record<string, string> = {
  agentMessage: "bg-emerald-500/[0.08] ring-1 ring-emerald-400/15",
  commandExecution: "bg-amber-500/[0.08] ring-1 ring-amber-400/15",
  fileChange: "bg-blue-500/[0.08] ring-1 ring-blue-400/15",
  enteredReviewMode: "bg-fuchsia-500/[0.08] ring-1 ring-fuchsia-400/15",
  exitedReviewMode: "bg-fuchsia-500/[0.08] ring-1 ring-fuchsia-400/15",
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

const isReasoningLikeItem = (item: ItemRecord): boolean => {
  const type = item.type.toLowerCase();
  return type.includes("reasoning") || type.includes("summary") || type.includes("plan");
};

const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
};

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

const bodyPreview = (item: ItemRecord, maxLength = 140): string => {
  const body = extractItemBody(item);
  if (!body) {
    return "No rendered details.";
  }
  return compactText(body, maxLength);
};

const RunningBadge = ({ label = "Running" }: { label?: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200 ring-1 ring-emerald-400/20">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
    {label}
  </span>
);

const MetaBadge = ({ children }: { children: string }) => (
  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-slate-300 ring-1 ring-white/6">
    {children}
  </span>
);

const StreamingCursor = () => <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-emerald-300 align-middle" />;

const InspectButton = ({ onClick, label = "Inspect" }: { onClick: () => void; label?: string }) => (
  <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]" onClick={onClick}>
    {label}
  </button>
);

const ApprovalCard = ({ approval }: { approval: ApprovalRecord }) => {
  const { callAction } = useRuntimeStore();
  const [showParams, setShowParams] = useState(false);

  return (
    <div className="rounded-[22px] bg-rose-500/[0.08] p-3 ring-1 ring-rose-400/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-rose-100">{approval.method}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <MetaBadge>{approval.status}</MetaBadge>
            {approval.itemId && <MetaBadge>{approval.itemId.slice(0, 8)}</MetaBadge>}
          </div>
        </div>
        <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]" onClick={() => setShowParams((value) => !value)}>
          {showParams ? "Hide" : "Params"}
        </button>
      </div>

      {showParams && (
        <pre className="mono-panel scrollbar mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-[18px] p-3 text-xs text-slate-100">
          {JSON.stringify(approval.params, null, 2)}
        </pre>
      )}

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
      <div className="rounded-[26px] bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-100 ring-1 ring-rose-500/20">
        <div className="mb-1 text-[11px] text-rose-300">Send failed</div>
        <div>{error || "Request failed before a real turn could start."}</div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] bg-emerald-500/[0.06] px-4 py-3 text-slate-100 ring-1 ring-emerald-400/15">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-100">Codex</span>
        <RunningBadge label={status === "streaming" ? "Streaming" : "Thinking"} />
      </div>
      <div className="text-sm text-slate-300">
        {message}
        <StreamingCursor />
      </div>
    </div>
  );
};

const DialogueBubble = ({
  item,
  mode,
  onInspectItem,
}: {
  item: ItemRecord;
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  const isUser = item.type === "userMessage";
  const running = !isUser && isStreamingItem(item);

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[86%] rounded-[28px] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${
          isUser
            ? "bg-slate-100/[0.09] text-slate-50 ring-1 ring-white/8"
            : "bg-emerald-500/[0.06] text-slate-50 ring-1 ring-emerald-400/15"
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-medium text-slate-200">{isUser ? "You" : "Codex"}</span>
          {!isUser && running && <RunningBadge label="Streaming" />}
          {mode === "inspect" && <MetaBadge>{item.type}</MetaBadge>}
          {mode === "inspect" && <MetaBadge>{item.finalStatus}</MetaBadge>}
        </div>

        <pre className={`whitespace-pre-wrap break-words font-sans text-[15px] leading-7 ${isUser ? "text-slate-50" : "text-slate-100"}`}>
          {extractItemBody(item)}
          {running && <StreamingCursor />}
        </pre>

        <div className={`mt-3 flex justify-end transition ${mode === "focus" ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : ""}`}>
          <InspectButton onClick={() => onInspectItem(item.id)} />
        </div>
      </div>
    </div>
  );
};

const CommandEntry = ({
  item,
  mode,
  onInspectItem,
}: {
  item: ItemRecord;
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  const [open, setOpen] = useState(mode === "inspect");
  const running = isStreamingItem(item);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[20px] bg-white/[0.03] ring-1 ring-white/6"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-slate-100">{commandText(item)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>{itemSummary(item)}</span>
            {running && <RunningBadge label="Live output" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InspectButton onClick={() => onInspectItem(item.id)} />
          <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        </div>
      </summary>
      <div className="border-t border-white/6 px-3 py-3">
        <pre className="mono-panel scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[18px] p-3 font-mono text-xs text-slate-100">
          {extractItemBody(item) || "No command output."}
          {running && <StreamingCursor />}
        </pre>
      </div>
    </details>
  );
};

const FileChangeEntry = ({
  item,
  mode,
  onInspectItem,
}: {
  item: ItemRecord;
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  const [showRaw, setShowRaw] = useState(mode === "inspect");
  const changeCount = Array.isArray(item.rawItem?.changes) ? item.rawItem.changes.length : 0;
  const running = isStreamingItem(item);

  return (
    <div className="rounded-[22px] bg-blue-500/[0.07] p-3 ring-1 ring-blue-400/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-100">File changes</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <MetaBadge>{`${changeCount} changes`}</MetaBadge>
            {running && <RunningBadge label="Running" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InspectButton onClick={() => onInspectItem(item.id)} />
          <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]" onClick={() => setShowRaw((value) => !value)}>
            {showRaw ? "Hide diff" : "Show diff"}
          </button>
        </div>
      </div>

      {showRaw && (
        <pre className="mono-panel scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[18px] p-3 font-mono text-xs text-slate-100">
          {item.aggregatedDeltas.fileChangeOutput || JSON.stringify(item.rawItem, null, 2)}
          {running && <StreamingCursor />}
        </pre>
      )}
    </div>
  );
};

const GenericItemEntry = ({
  item,
  approvals,
  mode,
  onInspectItem,
}: {
  item: ItemRecord;
  approvals: ApprovalRecord[];
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  const running = isStreamingItem(item);
  const focusCollapsed = mode === "focus";
  const [open, setOpen] = useState(!focusCollapsed);
  const subduedTone = typeTone[item.type] ?? "bg-white/[0.03] ring-1 ring-white/6";

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className={`rounded-[22px] p-3 ${subduedTone}`}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100">{isReasoningLikeItem(item) ? "Reasoning" : item.type}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>{item.finalStatus}</span>
            {running && <RunningBadge label="Running" />}
          </div>
          {focusCollapsed && <p className="mt-2 text-sm leading-6 text-slate-300">{bodyPreview(item, isReasoningLikeItem(item) ? 180 : 130)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <InspectButton onClick={() => onInspectItem(item.id)} />
          <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        </div>
      </summary>

      {(!focusCollapsed || open) && (
        <div className="mt-3">
          <pre className="mono-panel scrollbar max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[18px] p-3 font-mono text-xs text-slate-100">
            {extractItemBody(item)}
            {running && <StreamingCursor />}
          </pre>
        </div>
      )}

      {approvals.length > 0 && <div className="mt-3 space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
    </details>
  );
};

const ItemCard = ({
  item,
  approvals,
  mode,
  onInspectItem,
}: {
  item: ItemRecord;
  approvals: ApprovalRecord[];
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  if (isDialogueItem(item)) {
    return (
      <div className="space-y-3">
        <DialogueBubble item={item} mode={mode} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
      </div>
    );
  }

  if (item.type === "commandExecution") {
    return (
      <div className="space-y-3">
        <CommandEntry item={item} mode={mode} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
      </div>
    );
  }

  if (item.type === "fileChange") {
    return (
      <div className="space-y-3">
        <FileChangeEntry item={item} mode={mode} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} />)}</div>}
      </div>
    );
  }

  return <GenericItemEntry item={item} approvals={approvals} mode={mode} onInspectItem={onInspectItem} />;
};

const CodexGroup = ({
  group,
  mode,
  onInspectItem,
}: {
  group: WorkbenchGroup;
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
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
      {firstMessage?.item && <DialogueBubble item={firstMessage.item} mode={mode} onInspectItem={onInspectItem} />}

      {commandEntries.length > 0 && (
        <div className="space-y-3 rounded-[24px] bg-white/[0.03] p-3 ring-1 ring-white/6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{`${commandEntries.length} command${commandEntries.length === 1 ? "" : "s"}`}</span>
            {commandEntries.some((entry) => entry.item && isStreamingItem(entry.item)) && <RunningBadge label="Live output" />}
          </div>
          <div className="space-y-2">
            {commandEntries.map((entry) => (entry.item ? <CommandEntry key={entry.item.id} item={entry.item} mode={mode} onInspectItem={onInspectItem} /> : null))}
          </div>
        </div>
      )}

      {fileEntries.map((entry) => (entry.item ? <FileChangeEntry key={entry.item.id} item={entry.item} mode={mode} onInspectItem={onInspectItem} /> : null))}

      {otherEntries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} />;
        }
        if (!entry.item) {
          return null;
        }
        return <GenericItemEntry key={entry.item.id} item={entry.item} approvals={entry.approvals} mode={mode} onInspectItem={onInspectItem} />;
      })}
    </section>
  );
};

const WorkbenchGroupView = ({
  group,
  mode,
  onInspectItem,
}: {
  group: WorkbenchGroup;
  mode: WorkbenchViewMode;
  onInspectItem: (itemId: string) => void;
}) => {
  if (group.lane === "codex") {
    return <CodexGroup group={group} mode={mode} onInspectItem={onInspectItem} />;
  }

  if (group.lane === "user") {
    const firstEntry = group.entries[0];
    if (!firstEntry?.item) {
      return null;
    }
    return <ItemCard item={firstEntry.item} approvals={firstEntry.approvals} mode={mode} onInspectItem={onInspectItem} />;
  }

  return (
    <section className="space-y-3">
      {group.entries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} />;
        }
        if (!entry.item) {
          return null;
        }
        return <ItemCard key={entry.item.id} item={entry.item} approvals={entry.approvals} mode={mode} onInspectItem={onInspectItem} />;
      })}
    </section>
  );
};

const OptimisticTurnCard = ({ optimisticTurn }: { optimisticTurn: OptimisticTurn }) => (
  <article className="space-y-4 rounded-[28px] bg-white/[0.03] p-4 ring-1 ring-white/6">
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-slate-400">Pending turn</div>
      {optimisticTurn.status !== "failed" ? <RunningBadge label="Waiting" /> : null}
    </div>
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-[28px] bg-slate-100/[0.09] px-4 py-3 text-slate-50 ring-1 ring-white/8">
          <div className="mb-2 text-[11px] text-slate-400">You</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-50">{optimisticTurn.userText}</pre>
        </div>
      </div>
      <AssistantPlaceholder status={optimisticTurn.status} error={optimisticTurn.error} message={optimisticTurn.assistantPlaceholder} />
    </div>
  </article>
);

const TurnCard = ({
  turn,
  groups,
  optimisticTurn,
  mode,
  turnIndex,
  onInspectItem,
}: {
  turn: TurnRecord;
  groups: WorkbenchGroup[];
  optimisticTurn?: OptimisticTurn;
  mode: WorkbenchViewMode;
  turnIndex: number;
  onInspectItem: (itemId: string) => void;
}) => {
  const showOptimisticUser = Boolean(optimisticTurn) && !turnHasUserMessage(turn) && optimisticTurn?.status !== "failed";
  const showOptimisticAssistant =
    Boolean(optimisticTurn) &&
    optimisticTurn?.status !== "failed" &&
    !turnHasAssistantWork(turn) &&
    isTurnRunning(turn);

  return (
    <article className={`relative pl-5 ${mode === "inspect" ? "rounded-[28px] bg-white/[0.025] px-5 py-5 ring-1 ring-white/6" : ""}`}>
      <div className="absolute bottom-2 left-0 top-2 w-px bg-white/[0.08]" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>{`Turn ${turnIndex + 1}`}</span>
            {mode === "inspect" && <MetaBadge>{turn.id}</MetaBadge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaBadge>{turn.status}</MetaBadge>
            {isTurnRunning(turn) && <RunningBadge />}
          </div>
        </div>

        <div className="space-y-4">
          {showOptimisticUser && (
            <div className="flex justify-end">
              <div className="max-w-[86%] rounded-[28px] bg-slate-100/[0.09] px-4 py-3 text-slate-50 ring-1 ring-white/8">
                <div className="mb-2 text-[11px] text-slate-400">You</div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-50">{optimisticTurn?.userText}</pre>
              </div>
            </div>
          )}

          {groups.map((group) => (
            <WorkbenchGroupView key={group.id} group={group} mode={mode} onInspectItem={onInspectItem} />
          ))}

          {showOptimisticAssistant && (
            <AssistantPlaceholder status={optimisticTurn?.status ?? "sending"} message={optimisticTurn?.assistantPlaceholder} />
          )}

          {turn.itemOrder.length === 0 && !showOptimisticAssistant && (
            <div className="note-panel rounded-[22px] p-4 text-sm">No items recorded for this turn yet.</div>
          )}
        </div>
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
    <div className="rounded-[24px] bg-white/[0.03] p-4 ring-1 ring-white/6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-100">PTY terminal</h3>
          <p className="mt-1 text-xs text-slate-500">`command/exec` + `tty: true` + outputDelta</p>
        </div>
        {currentTerminal?.status === "running" && <RunningBadge label="TTY live" />}
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_96px_96px_auto]">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          className="surface-soft rounded-[18px] px-3 py-2 text-sm"
          placeholder="Command argv, split by spaces"
        />
        <input value={rows} onChange={(event) => setRows(event.target.value)} className="surface-soft rounded-[18px] px-3 py-2 text-sm" />
        <input value={cols} onChange={(event) => setCols(event.target.value)} className="surface-soft rounded-[18px] px-3 py-2 text-sm" />
        <button
          className="primary-btn rounded-[18px] px-3 py-2 text-sm font-medium"
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

      <pre className="mono-panel scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[20px] p-4 font-mono text-xs text-stone-100">
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
            className="surface-soft rounded-[18px] px-3 py-2 text-sm"
            placeholder="Write stdin; Enter sends"
          />
          <button
            className="ghost-btn rounded-[18px] px-3 py-2 text-xs"
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
            className="ghost-btn rounded-[18px] px-3 py-2 text-xs"
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

export const TimelinePane = ({
  routeThreadId,
  viewMode,
  onViewModeChange,
  inspectorOpen,
  onOpenInspector,
  onCloseInspector,
}: {
  routeThreadId?: string | null;
  viewMode: WorkbenchViewMode;
  onViewModeChange: (mode: WorkbenchViewMode) => void;
  inspectorOpen: boolean;
  onOpenInspector: () => void;
  onCloseInspector: () => void;
}) => {
  const { snapshot, callAction, optimisticTurns, selectItem } = useRuntimeStore();
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

  const inspectItem = (itemId: string) => {
    selectItem(itemId);
    onOpenInspector();
  };

  if (!thread) {
    return (
      <section className="panel min-w-0 rounded-[30px] p-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div className="mx-auto w-full max-w-[860px] space-y-4">
          <div className="note-panel rounded-[28px] p-8 text-sm">
            {routeThreadId
              ? `Route points to thread ${routeThreadId}, but it is not loaded in the local projection yet. Use thread/read or resume it before relying on local history.`
              : "Select a thread from the left column. Default mode now reads as a conversation first, while protocol details stay available in Inspect mode."}
          </div>
          {routeThreadId && <ComposerBar embedded />}
        </div>
      </section>
    );
  }

  return (
    <section className="panel min-w-0 rounded-[30px] p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="mb-4 rounded-[28px] bg-white/[0.03] px-4 py-4 ring-1 ring-white/6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Thread</div>
            <h2 className="mt-1 break-words text-[28px] font-semibold tracking-tight text-slate-50">{threadTitle(thread)}</h2>
            <p className="mt-2 truncate text-sm text-slate-500">{thread.cwd || "No working directory"}</p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`rounded-full px-3 py-1.5 text-xs transition ${viewMode === "focus" ? "primary-btn" : "ghost-btn"}`}
                onClick={() => onViewModeChange("focus")}
              >
                Focus
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-xs transition ${viewMode === "inspect" ? "primary-btn" : "ghost-btn"}`}
                onClick={() => onViewModeChange("inspect")}
              >
                Inspect
              </button>
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={inspectorOpen ? onCloseInspector : onOpenInspector}>
                {inspectorOpen ? "Hide Inspector" : "Open Inspector"}
              </button>
              <button
                className="ghost-btn rounded-full px-3 py-1.5 text-xs"
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
                className="ghost-btn rounded-full px-3 py-1.5 text-xs"
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

            <div className="flex flex-wrap items-center gap-2">
              <MetaBadge>{thread.status}</MetaBadge>
              {thread.activeTurnId && <RunningBadge />}
              <MetaBadge>{`${stats.turns} turns`}</MetaBadge>
              <MetaBadge>{`${stats.items} items`}</MetaBadge>
              {stats.approvals > 0 && <MetaBadge>{`${stats.approvals} approvals`}</MetaBadge>}
              {viewMode === "inspect" && <MetaBadge>{thread.id}</MetaBadge>}
            </div>
          </div>
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
        className="scrollbar min-h-0 pr-1 lg:flex-1 lg:overflow-y-auto"
      >
        <div className="mx-auto flex max-w-[920px] flex-col gap-8 pb-2">
          {thread.turnOrder.length === 0 && standaloneOptimisticTurns.length === 0 && (
            <div className="note-panel rounded-[26px] p-6 text-sm">History not loaded. Use `thread/read` or `thread/resume`.</div>
          )}

          {thread.turnOrder.map((turnId, index) => {
            const turn = thread.turns[turnId];
            const groups = deriveWorkbenchGroups(turn, snapshot.approvals);
            return (
              <TurnCard
                key={turnId}
                turn={turn}
                groups={groups}
                optimisticTurn={optimisticTurnsByTurnId.get(turnId)}
                mode={viewMode}
                turnIndex={index}
                onInspectItem={inspectItem}
              />
            );
          })}

          {standaloneOptimisticTurns.map((optimisticTurn) => (
            <OptimisticTurnCard key={optimisticTurn.localId} optimisticTurn={optimisticTurn} />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[920px] space-y-3">
        <ComposerBar embedded />
        <div className="rounded-[24px] bg-white/[0.03] px-4 py-3 ring-1 ring-white/6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-400">PTY terminal</div>
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => setShowTerminal((value) => !value)}>
              {showTerminal ? "Hide terminal" : "Open terminal"}
            </button>
          </div>
          {showTerminal && <div className="mt-4"><TerminalPanel /></div>}
        </div>
      </div>
    </section>
  );
};
