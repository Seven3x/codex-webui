import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalRecord, ItemRecord, TurnRecord } from "@codex-web/shared";
import { ComposerBar } from "./ComposerBar";
import type { ResolvedDebugPreferences } from "../lib/debugPreferences";
import { deriveWorkbenchGroups, extractItemBody, threadStats, threadTitle, type WorkbenchGroup } from "../lib/workbench";
import { navigateToRoute } from "../lib/routes";
import { exportThreadEvents } from "../lib/api";
import { useRuntimeStore, type OptimisticTurn } from "../store/useRuntimeStore";

const typeTone: Record<string, string> = {
  enteredReviewMode: "bg-fuchsia-500/[0.06] ring-1 ring-fuchsia-400/15",
  exitedReviewMode: "bg-fuchsia-500/[0.06] ring-1 ring-fuchsia-400/15",
  plan: "bg-emerald-500/[0.06] ring-1 ring-emerald-400/15",
  reasoning: "bg-amber-500/[0.06] ring-1 ring-amber-400/15",
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

const humanizeType = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200 ring-1 ring-emerald-400/20">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
    {label}
  </span>
);

const MetaBadge = ({ children }: { children: string }) => (
  <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-slate-300 ring-1 ring-white/6">
    {children}
  </span>
);

const StreamingCursor = () => <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-emerald-300 align-middle" />;

const DebugActionButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button className="ghost-btn rounded-full px-2.5 py-1 text-[11px]" onClick={onClick}>
    {label}
  </button>
);

const DebugBadges = ({
  item,
  debug,
}: {
  item: ItemRecord;
  debug: ResolvedDebugPreferences;
}) => {
  if (!debug.showItemTypeBadges) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MetaBadge>{item.type}</MetaBadge>
      <MetaBadge>{item.finalStatus}</MetaBadge>
    </div>
  );
};

const TurnDivider = ({
  turn,
  turnIndex,
}: {
  turn: TurnRecord;
  turnIndex: number;
}) => (
  <div className="flex items-center gap-3 py-1">
    <div className="h-px flex-1 bg-white/[0.08]" />
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      <span>{`Turn ${turnIndex + 1}`}</span>
      <MetaBadge>{turn.id}</MetaBadge>
      <MetaBadge>{turn.status}</MetaBadge>
      {isTurnRunning(turn) && <RunningBadge />}
    </div>
    <div className="h-px flex-1 bg-white/[0.08]" />
  </div>
);

const ApprovalCard = ({ approval, debug }: { approval: ApprovalRecord; debug: ResolvedDebugPreferences }) => {
  const { callAction } = useRuntimeStore();
  const [showParams, setShowParams] = useState(false);

  return (
    <div className="rounded-[18px] bg-rose-500/[0.06] px-3.5 py-3 ring-1 ring-rose-400/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-rose-100">{approval.method}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            <MetaBadge>{approval.status}</MetaBadge>
            {debug.showItemTypeBadges && approval.itemId && <MetaBadge>{approval.itemId.slice(0, 8)}</MetaBadge>}
          </div>
        </div>
        {debug.showRawEventControls && (
          <DebugActionButton onClick={() => setShowParams((value) => !value)} label={showParams ? "Hide Raw" : "Show Raw"} />
        )}
      </div>

      {showParams && debug.showRawEventControls && (
        <pre className="mono-panel scrollbar mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-[16px] p-3 text-xs text-slate-100">
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

const UserMessage = ({
  item,
  debug,
  onInspectItem,
}: {
  item: ItemRecord;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => (
  <div className="flex justify-end">
    <article className="max-w-[82%] rounded-[20px] bg-white/[0.045] px-3.5 py-3 ring-1 ring-white/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">You</span>
        <div className="flex items-center gap-2">
          <DebugBadges item={item} debug={debug} />
          {debug.showInspectControls && <DebugActionButton onClick={() => onInspectItem(item.id)} label="Inspect" />}
        </div>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-slate-50">{extractItemBody(item)}</pre>
    </article>
  </div>
);

const AssistantMessage = ({
  item,
  debug,
  onInspectItem,
}: {
  item: ItemRecord;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const running = isStreamingItem(item);

  return (
    <article className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <span className="font-medium text-slate-300">Codex</span>
          {running && <RunningBadge label="Generating" />}
        </div>
        <div className="flex items-center gap-2">
          <DebugBadges item={item} debug={debug} />
          {debug.showInspectControls && <DebugActionButton onClick={() => onInspectItem(item.id)} label="Inspect" />}
        </div>
      </div>
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-100">
        {extractItemBody(item)}
        {running && <StreamingCursor />}
      </div>
    </article>
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
      <div className="rounded-[18px] bg-rose-500/[0.08] px-3.5 py-3 text-sm text-rose-100 ring-1 ring-rose-500/20">
        <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-rose-300">Send failed</div>
        <div>{error || "Request failed before a real turn could start."}</div>
      </div>
    );
  }

  return (
    <article className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        <span className="font-medium text-slate-300">Codex</span>
        <RunningBadge label={status === "streaming" ? "Generating" : "Thinking"} />
      </div>
      <div className="text-[15px] leading-7 text-slate-300">
        {message}
        <StreamingCursor />
      </div>
    </article>
  );
};

const CommandCluster = ({
  items,
  debug,
  onInspectItem,
}: {
  items: ItemRecord[];
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const running = items.some((item) => isStreamingItem(item));
  const summary = compactText(items.map((item) => commandText(item)).join("  •  "), 180);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[18px] bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/6"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
            <span>{`Ran ${items.length} command${items.length === 1 ? "" : "s"}`}</span>
            {running && <RunningBadge label="Live output" />}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400">{summary}</div>
          {!open && (
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {compactText(items.map((item) => bodyPreview(item, 80)).join(" "), 180)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {debug.showItemTypeBadges && <MetaBadge>commandExecution</MetaBadge>}
          {debug.showInspectControls && items.length === 1 && (
            <DebugActionButton onClick={() => onInspectItem(items[0].id)} label="Inspect" />
          )}
          <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        </div>
      </summary>

      {open && (
        <div className="mt-3 space-y-3 border-t border-white/6 pt-3">
          {items.map((item) => (
            <div key={item.id} className="space-y-2 rounded-[16px] bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-sm text-slate-100">{commandText(item)}</div>
                <div className="flex items-center gap-2">
                  <MetaBadge>{itemSummary(item)}</MetaBadge>
                  {debug.showInspectControls && <DebugActionButton onClick={() => onInspectItem(item.id)} label="Inspect" />}
                </div>
              </div>
              <pre className="mono-panel scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[16px] p-3 font-mono text-xs text-slate-100">
                {extractItemBody(item) || "No command output."}
                {isStreamingItem(item) && <StreamingCursor />}
              </pre>
              {debug.showRawEventControls && (
                <details className="rounded-[14px] bg-white/[0.025] px-3 py-2">
                  <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.16em] text-slate-500">Raw payload</summary>
                  <pre className="mono-panel scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[14px] p-3 font-mono text-xs text-slate-100">
                    {JSON.stringify(item.rawItem, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
};

const FileChangeEntry = ({
  item,
  debug,
  onInspectItem,
}: {
  item: ItemRecord;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const changeCount = Array.isArray(item.rawItem?.changes) ? item.rawItem.changes.length : 0;

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[18px] bg-blue-500/[0.06] px-3.5 py-3 ring-1 ring-blue-400/15"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
            <span>{`Applied ${changeCount || 1} file change${changeCount === 1 ? "" : "s"}`}</span>
            {isStreamingItem(item) && <RunningBadge label="Updating" />}
          </div>
          {!open && <p className="mt-2 text-sm leading-6 text-slate-300">{bodyPreview(item, 180)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {debug.showItemTypeBadges && <MetaBadge>{item.type}</MetaBadge>}
          {debug.showInspectControls && <DebugActionButton onClick={() => onInspectItem(item.id)} label="Inspect" />}
          <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        </div>
      </summary>

      {open && (
        <div className="mt-3 space-y-3 border-t border-blue-400/10 pt-3">
          <pre className="mono-panel scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[16px] p-3 font-mono text-xs text-slate-100">
            {item.aggregatedDeltas.fileChangeOutput || JSON.stringify(item.rawItem, null, 2)}
            {isStreamingItem(item) && <StreamingCursor />}
          </pre>
          {debug.showRawEventControls && (
            <details className="rounded-[14px] bg-white/[0.03] px-3 py-2">
              <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.16em] text-slate-500">Raw payload</summary>
              <pre className="mono-panel scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[14px] p-3 font-mono text-xs text-slate-100">
                {JSON.stringify(item.rawItem, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </details>
  );
};

const GenericItemEntry = ({
  item,
  approvals,
  debug,
  onInspectItem,
}: {
  item: ItemRecord;
  approvals: ApprovalRecord[];
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const running = isStreamingItem(item);
  const isReasoningItem = isReasoningLikeItem(item);
  const subduedTone = typeTone[item.type] ?? "bg-white/[0.025] ring-1 ring-white/6";
  const [open, setOpen] = useState(debug.showReasoningBlocks && isReasoningItem);

  return (
    <div className="space-y-3">
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className={`rounded-[18px] px-3.5 py-3 ${subduedTone}`}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100">
              {isReasoningItem && !debug.showReasoningBlocks ? "Reasoning available" : humanizeType(item.type)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>{item.finalStatus}</span>
              {running && <RunningBadge label="Running" />}
            </div>
            {!open && (
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {isReasoningItem && !debug.showReasoningBlocks ? "Hidden by default in conversation mode." : bodyPreview(item, isReasoningItem ? 180 : 140)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DebugBadges item={item} debug={debug} />
            {debug.showInspectControls && <DebugActionButton onClick={() => onInspectItem(item.id)} label="Inspect" />}
            <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
          </div>
        </summary>

        {open && (
          <div className="mt-3 space-y-3">
            <pre className="mono-panel scrollbar max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[16px] p-3 font-mono text-xs text-slate-100">
              {extractItemBody(item)}
              {running && <StreamingCursor />}
            </pre>
            {debug.showRawEventControls && (
              <details className="rounded-[14px] bg-white/[0.03] px-3 py-2">
                <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.16em] text-slate-500">Raw payload</summary>
                <pre className="mono-panel scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[14px] p-3 font-mono text-xs text-slate-100">
                  {JSON.stringify(item.rawItem, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </details>

      {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} debug={debug} />)}</div>}
    </div>
  );
};

const ItemCard = ({
  item,
  approvals,
  debug,
  onInspectItem,
}: {
  item: ItemRecord;
  approvals: ApprovalRecord[];
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  if (item.type === "userMessage") {
    return (
      <div className="space-y-3">
        <UserMessage item={item} debug={debug} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} debug={debug} />)}</div>}
      </div>
    );
  }

  if (item.type === "agentMessage") {
    return (
      <div className="space-y-3">
        <AssistantMessage item={item} debug={debug} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} debug={debug} />)}</div>}
      </div>
    );
  }

  if (item.type === "commandExecution") {
    return (
      <div className="space-y-3">
        <CommandCluster items={[item]} debug={debug} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} debug={debug} />)}</div>}
      </div>
    );
  }

  if (item.type === "fileChange") {
    return (
      <div className="space-y-3">
        <FileChangeEntry item={item} debug={debug} onInspectItem={onInspectItem} />
        {approvals.length > 0 && <div className="space-y-3">{approvals.map((approval) => <ApprovalCard key={approval.requestId} approval={approval} debug={debug} />)}</div>}
      </div>
    );
  }

  return <GenericItemEntry item={item} approvals={approvals} debug={debug} onInspectItem={onInspectItem} />;
};

const CodexGroup = ({
  group,
  debug,
  onInspectItem,
}: {
  group: WorkbenchGroup;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const firstMessage = group.entries.find((entry) => entry.kind === "item" && entry.item?.type === "agentMessage")?.item ?? null;
  const commandEntries = group.entries
    .filter((entry) => entry.kind === "item" && entry.item?.type === "commandExecution")
    .map((entry) => entry.item)
    .filter((item): item is ItemRecord => Boolean(item));
  const fileEntries = group.entries
    .filter((entry) => entry.kind === "item" && entry.item?.type === "fileChange")
    .map((entry) => entry.item)
    .filter((item): item is ItemRecord => Boolean(item));
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
      {firstMessage && <AssistantMessage item={firstMessage} debug={debug} onInspectItem={onInspectItem} />}
      {commandEntries.length > 0 && <CommandCluster items={commandEntries} debug={debug} onInspectItem={onInspectItem} />}
      {fileEntries.map((item) => <FileChangeEntry key={item.id} item={item} debug={debug} onInspectItem={onInspectItem} />)}
      {otherEntries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} debug={debug} />;
        }
        if (!entry.item) {
          return null;
        }
        return <GenericItemEntry key={entry.item.id} item={entry.item} approvals={entry.approvals} debug={debug} onInspectItem={onInspectItem} />;
      })}
    </section>
  );
};

const WorkbenchGroupView = ({
  group,
  debug,
  onInspectItem,
}: {
  group: WorkbenchGroup;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  if (group.lane === "codex") {
    return <CodexGroup group={group} debug={debug} onInspectItem={onInspectItem} />;
  }

  if (group.lane === "user") {
    const firstEntry = group.entries[0];
    if (!firstEntry?.item) {
      return null;
    }
    return <ItemCard item={firstEntry.item} approvals={firstEntry.approvals} debug={debug} onInspectItem={onInspectItem} />;
  }

  return (
    <section className="space-y-3">
      {group.entries.map((entry, index) => {
        if (entry.kind === "approval" && entry.approval) {
          return <ApprovalCard key={`${group.id}:approval:${index}`} approval={entry.approval} debug={debug} />;
        }
        if (!entry.item) {
          return null;
        }
        return <ItemCard key={entry.item.id} item={entry.item} approvals={entry.approvals} debug={debug} onInspectItem={onInspectItem} />;
      })}
    </section>
  );
};

const OptimisticTurnEntry = ({ optimisticTurn }: { optimisticTurn: OptimisticTurn }) => (
  <section className="space-y-4">
    <div className="flex justify-end">
      <article className="max-w-[82%] rounded-[20px] bg-white/[0.045] px-3.5 py-3 ring-1 ring-white/[0.06]">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">You</div>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-slate-50">{optimisticTurn.userText}</pre>
      </article>
    </div>
    <AssistantPlaceholder status={optimisticTurn.status} error={optimisticTurn.error} message={optimisticTurn.assistantPlaceholder} />
  </section>
);

const TurnStream = ({
  turn,
  groups,
  optimisticTurn,
  turnIndex,
  debug,
  onInspectItem,
}: {
  turn: TurnRecord;
  groups: WorkbenchGroup[];
  optimisticTurn?: OptimisticTurn;
  turnIndex: number;
  debug: ResolvedDebugPreferences;
  onInspectItem: (itemId: string) => void;
}) => {
  const showOptimisticUser = Boolean(optimisticTurn) && !turnHasUserMessage(turn) && optimisticTurn?.status !== "failed";
  const showOptimisticAssistant =
    Boolean(optimisticTurn) &&
    optimisticTurn?.status !== "failed" &&
    !turnHasAssistantWork(turn) &&
    isTurnRunning(turn);

  return (
    <section className="space-y-4">
      {debug.showTurnBoundaries && <TurnDivider turn={turn} turnIndex={turnIndex} />}
      {showOptimisticUser && (
        <div className="flex justify-end">
          <article className="max-w-[82%] rounded-[20px] bg-white/[0.045] px-3.5 py-3 ring-1 ring-white/[0.06]">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">You</div>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-slate-50">{optimisticTurn?.userText}</pre>
          </article>
        </div>
      )}
      {groups.map((group) => (
        <WorkbenchGroupView key={group.id} group={group} debug={debug} onInspectItem={onInspectItem} />
      ))}
      {showOptimisticAssistant && <AssistantPlaceholder status={optimisticTurn?.status ?? "sending"} message={optimisticTurn?.assistantPlaceholder} />}
      {turn.itemOrder.length === 0 && !showOptimisticAssistant && (
        <div className="note-panel rounded-[18px] p-4 text-sm">No items recorded for this turn yet.</div>
      )}
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
    <div className="rounded-[18px] bg-white/[0.025] p-4 ring-1 ring-white/6">
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
  debug,
  inspectorOpen,
  onOpenInspector,
  onCloseInspector,
}: {
  routeThreadId?: string | null;
  debug: ResolvedDebugPreferences;
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

  useEffect(() => {
    if (!debug.debugMode) {
      setShowTerminal(false);
    }
  }, [debug.debugMode]);

  const inspectItem = (itemId: string) => {
    selectItem(itemId);
    onOpenInspector();
  };

  if (!thread) {
    return (
      <section className="panel min-w-0 rounded-[30px] p-6 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div className="mx-auto w-full max-w-[860px] space-y-4">
          <div className="note-panel rounded-[22px] p-6 text-sm">
            {routeThreadId
              ? `Route points to thread ${routeThreadId}, but it is not loaded in the local projection yet. Use thread/read or resume it before relying on local history.`
              : "Select a thread from the left column to enter the conversation. Debug controls stay hidden until Debug Mode is enabled in Settings."}
          </div>
          {routeThreadId && <ComposerBar embedded />}
        </div>
      </section>
    );
  }

  return (
    <section className="panel min-w-0 rounded-[30px] p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="mx-auto w-full max-w-[920px] border-b border-white/6 px-1 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Conversation</div>
            <h2 className="mt-1 break-words text-[28px] font-semibold tracking-tight text-slate-50">{threadTitle(thread)}</h2>
            <p className="mt-2 truncate text-sm text-slate-500">{thread.cwd || "No working directory"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span>{`${stats.turns} turns`}</span>
              <span className="text-slate-600">/</span>
              <span>{`${stats.items} items`}</span>
              {stats.approvals > 0 && (
                <>
                  <span className="text-slate-600">/</span>
                  <span>{`${stats.approvals} approvals`}</span>
                </>
              )}
              {thread.activeTurnId && <RunningBadge label="Generating" />}
              {debug.showTurnBoundaries && <MetaBadge>{thread.status}</MetaBadge>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {debug.debugMode && (
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={inspectorOpen ? onCloseInspector : onOpenInspector}>
                {inspectorOpen ? "Hide Debug" : "Open Debug"}
              </button>
            )}
            {debug.showRawEventControls && (
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => void exportThreadEvents(thread.id)}>
                Export
              </button>
            )}
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
            <button
              className="ghost-btn rounded-full px-3 py-1.5 text-xs"
              onClick={() =>
                void callAction("thread.archive", {
                  threadId: thread.id,
                })
              }
            >
              Archive
            </button>
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
        className="scrollbar min-h-0 pr-1 pt-4 lg:flex-1 lg:overflow-y-auto"
      >
        <div className="mx-auto flex max-w-[920px] flex-col gap-6 pb-2">
          {thread.turnOrder.length === 0 && standaloneOptimisticTurns.length === 0 && (
            <div className="note-panel rounded-[18px] p-5 text-sm">History not loaded. Use `thread/read` or `thread/resume`.</div>
          )}

          {thread.turnOrder.map((turnId, index) => {
            const turn = thread.turns[turnId];
            const groups = deriveWorkbenchGroups(turn, snapshot.approvals);
            return (
              <TurnStream
                key={turnId}
                turn={turn}
                groups={groups}
                optimisticTurn={optimisticTurnsByTurnId.get(turnId)}
                turnIndex={index}
                debug={debug}
                onInspectItem={inspectItem}
              />
            );
          })}

          {standaloneOptimisticTurns.map((optimisticTurn) => (
            <OptimisticTurnEntry key={optimisticTurn.localId} optimisticTurn={optimisticTurn} />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[920px] space-y-3 border-t border-white/6 pt-4">
        <ComposerBar embedded />
        {debug.debugMode && (
          <div className="rounded-[18px] bg-white/[0.02] px-4 py-3 ring-1 ring-white/6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-400">Protocol terminal</div>
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => setShowTerminal((value) => !value)}>
                {showTerminal ? "Hide terminal" : "Open terminal"}
              </button>
            </div>
            {showTerminal && <div className="mt-4"><TerminalPanel /></div>}
          </div>
        )}
      </div>
    </section>
  );
};
