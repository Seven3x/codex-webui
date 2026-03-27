import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
  Thread,
  Turn,
} from "./codex";
import { KNOWN_ITEM_TYPES } from "./codex";

export type ConnectionState =
  | "disconnected"
  | "starting"
  | "initializing"
  | "ready"
  | "reconnecting"
  | "error";

export type EventDirection = "client->server" | "server->client";
export type EventKind =
  | "request"
  | "response"
  | "notification"
  | "serverRequest"
  | "serverResponse"
  | "process"
  | "parseError";

export type ApprovalState = "pending" | "accepted" | "acceptedForSession" | "declined" | "cancelled" | "resolved";

export interface RuntimeConnection {
  connectionState: ConnectionState;
  clientInfo: Record<string, unknown> | null;
  serverInfo: {
    userAgent?: string;
    version?: string;
    platform?: string;
    codexHome?: string;
  } | null;
  pendingRequests: string[];
  pendingServerRequests: string[];
  lastError: string | null;
  lastStartedAt: number | null;
  lastReadyAt: number | null;
}

export interface EventLogRecord {
  seq: number;
  timestamp: number;
  direction: EventDirection;
  kind: EventKind;
  method: string;
  payload: unknown;
  threadId?: string | null;
  turnId?: string | null;
  itemId?: string | null;
  unknown?: boolean;
}

export interface ApprovalRecord {
  requestId: string;
  method: string;
  threadId: string;
  turnId: string;
  itemId: string;
  status: ApprovalState;
  params: CommandExecutionRequestApprovalParams | FileChangeRequestApprovalParams | Record<string, unknown>;
  createdAt: number;
  resolvedAt: number | null;
  response: unknown | null;
}

export interface ItemRecord {
  id: string;
  type: string;
  rawItem: Record<string, unknown> | null;
  aggregatedDeltas: {
    agentText: string;
    commandOutput: string;
    fileChangeOutput: string;
  };
  renderedText: string;
  finalStatus: string;
  startedAt: number | null;
  completedAt: number | null;
  isUnknownType: boolean;
}

export interface TurnRecord {
  id: string;
  status: string;
  items: Record<string, ItemRecord>;
  itemOrder: string[];
  startedAt: number | null;
  completedAt: number | null;
  tokenUsage: Record<string, unknown> | null;
  pendingApprovals: string[];
  rawTurn: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

export interface ThreadRecord {
  id: string;
  summary: Thread | null;
  fullThread: Thread | null;
  activeTurnId: string | null;
  status: string;
  cwd: string | null;
  metadata: Record<string, unknown>;
  turns: Record<string, TurnRecord>;
  turnOrder: string[];
  archived: boolean;
  historyState: "unloaded" | "loaded" | "resumed";
  systemError: string | null;
  eventTrail: EventLogRecord[];
}

export interface TerminalSessionRecord {
  processId: string;
  command: string[];
  cwd: string | null;
  tty: boolean;
  status: "starting" | "running" | "completed" | "terminated" | "failed";
  stdout: string;
  stderr: string;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  truncated: boolean;
  disconnected: boolean;
}

export interface RuntimeSnapshot {
  runtime: RuntimeConnection;
  threads: Record<string, ThreadRecord>;
  threadOrder: string[];
  selectedThreadId: string | null;
  selectedItemId: string | null;
  approvals: Record<string, ApprovalRecord>;
  eventLog: EventLogRecord[];
  unknownEvents: EventLogRecord[];
  terminals: Record<string, TerminalSessionRecord>;
  skillsVersion: number;
  lastUpdatedAt: number;
  notes: string[];
}

export interface RuntimeErrorEvent {
  type: "runtime/error";
  message: string;
  timestamp: number;
}

export interface SnapshotHydratedEvent {
  type: "snapshot/hydrated";
  snapshot: RuntimeSnapshot;
}

export interface ConnectionStateEvent {
  type: "connection/state";
  connectionState: ConnectionState;
  lastError?: string | null;
  serverInfo?: RuntimeConnection["serverInfo"];
  clientInfo?: RuntimeConnection["clientInfo"];
  timestamp: number;
}

export interface PendingRequestEvent {
  type: "request/pending";
  requestId: string;
  active: boolean;
}

export interface EventLogAppendEvent {
  type: "eventLog/append";
  record: EventLogRecord;
}

export interface ThreadMergedEvent {
  type: "thread/merged";
  thread: Thread;
  mode: ThreadRecord["historyState"];
}

export interface ThreadSelectedEvent {
  type: "thread/selected";
  threadId: string | null;
}

export interface ThreadStatusEvent {
  type: "thread/status";
  threadId: string;
  status: string;
}

export interface ThreadRemovedEvent {
  type: "thread/removed";
  threadId: string;
}

export interface TurnMergedEvent {
  type: "turn/merged";
  threadId: string;
  turn: Turn;
  kind: "started" | "completed" | "response";
  timestamp: number;
}

export interface ItemStartedEventShape {
  type: "item/started";
  threadId: string;
  turnId: string;
  item: Record<string, unknown>;
  timestamp: number;
}

export interface ItemCompletedEventShape {
  type: "item/completed";
  threadId: string;
  turnId: string;
  item: Record<string, unknown>;
  timestamp: number;
}

export interface ItemDeltaEvent {
  type: "item/delta";
  threadId: string;
  turnId: string;
  itemId: string;
  stream: "agentText" | "commandOutput" | "fileChangeOutput";
  delta: string;
}

export interface ApprovalPendingEvent {
  type: "approval/pending";
  request: ApprovalRecord;
}

export interface ApprovalResolvedEvent {
  type: "approval/resolved";
  requestId: string;
  status: ApprovalState;
  response: unknown | null;
  resolvedAt: number;
}

export interface TerminalUpsertEvent {
  type: "terminal/upsert";
  terminal: TerminalSessionRecord;
}

export interface TerminalOutputEvent {
  type: "terminal/output";
  processId: string;
  stream: "stdout" | "stderr";
  chunk: string;
  truncated?: boolean;
}

export interface TerminalCompletedEvent {
  type: "terminal/completed";
  processId: string;
  exitCode: number;
  status: TerminalSessionRecord["status"];
  completedAt: number;
  stdout?: string;
  stderr?: string;
}

export interface SkillsChangedEvent {
  type: "skills/changed";
}

export interface NoteEvent {
  type: "note";
  message: string;
}

export type RuntimeEvent =
  | RuntimeErrorEvent
  | SnapshotHydratedEvent
  | ConnectionStateEvent
  | PendingRequestEvent
  | EventLogAppendEvent
  | ThreadMergedEvent
  | ThreadSelectedEvent
  | ThreadStatusEvent
  | ThreadRemovedEvent
  | TurnMergedEvent
  | ItemStartedEventShape
  | ItemCompletedEventShape
  | ItemDeltaEvent
  | ApprovalPendingEvent
  | ApprovalResolvedEvent
  | TerminalUpsertEvent
  | TerminalOutputEvent
  | TerminalCompletedEvent
  | SkillsChangedEvent
  | NoteEvent;

const MAX_EVENT_LOG = 200;
const MAX_THREAD_EVENT_TRAIL = 500;
const MAX_TERMINAL_OUTPUT = 200_000;

const statusToLabel = (status: unknown): string => {
  if (status === null || status === undefined) {
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

export const createEmptySnapshot = (): RuntimeSnapshot => ({
  runtime: {
    connectionState: "disconnected",
    clientInfo: null,
    serverInfo: null,
    pendingRequests: [],
    pendingServerRequests: [],
    lastError: null,
    lastStartedAt: null,
    lastReadyAt: null,
  },
  threads: {},
  threadOrder: [],
  selectedThreadId: null,
  selectedItemId: null,
  approvals: {},
  eventLog: [],
  unknownEvents: [],
  terminals: {},
  skillsVersion: 0,
  lastUpdatedAt: Date.now(),
  notes: [],
});

const upsertThread = (snapshot: RuntimeSnapshot, thread: Thread, mode: ThreadRecord["historyState"]): RuntimeSnapshot => {
  const existing = snapshot.threads[thread.id];
  const archived = existing?.archived ?? false;
  const record: ThreadRecord = existing
    ? {
        ...existing,
        summary: { ...existing.summary, ...thread },
        fullThread: mode === "loaded" || mode === "resumed" ? thread : existing.fullThread,
        status: statusToLabel(thread.status),
        cwd: thread.cwd,
        archived,
        historyState: mode === "unloaded" ? existing.historyState : mode,
        metadata: {
          ...existing.metadata,
          agentNickname: thread.agentNickname,
          agentRole: thread.agentRole,
          gitInfo: thread.gitInfo,
          name: thread.name,
          path: thread.path,
          source: thread.source,
          cliVersion: thread.cliVersion,
        },
      }
    : {
        id: thread.id,
        summary: thread,
        fullThread: mode === "loaded" || mode === "resumed" ? thread : null,
        activeTurnId: null,
        status: statusToLabel(thread.status),
        cwd: thread.cwd,
        metadata: {
          agentNickname: thread.agentNickname,
          agentRole: thread.agentRole,
          gitInfo: thread.gitInfo,
          name: thread.name,
          path: thread.path,
          source: thread.source,
          cliVersion: thread.cliVersion,
        },
        turns: {},
        turnOrder: [],
        archived,
        historyState: mode,
        systemError: null,
        eventTrail: [],
      };

  if (thread.turns.length > 0) {
    for (const turn of thread.turns) {
      const turnRecord = ensureTurnRecord(record, turn.id);
      turnRecord.rawTurn = turn as unknown as Record<string, unknown>;
      turnRecord.status = turn.status;
      turnRecord.error = (turn.error ?? null) as Record<string, unknown> | null;
      for (const item of turn.items) {
        upsertItem(turnRecord, item as unknown as Record<string, unknown>, null, false);
      }
      if (!record.turnOrder.includes(turn.id)) {
        record.turnOrder.push(turn.id);
      }
      if (turn.status === "inProgress") {
        record.activeTurnId = turn.id;
      }
    }
  }

  snapshot.threads[thread.id] = record;
  snapshot.threadOrder = Array.from(new Set([thread.id, ...snapshot.threadOrder])).sort((a, b) => {
    const left = snapshot.threads[a]?.summary?.updatedAt ?? 0;
    const right = snapshot.threads[b]?.summary?.updatedAt ?? 0;
    return right - left;
  });
  return snapshot;
};

const ensureTurnRecord = (thread: ThreadRecord, turnId: string): TurnRecord => {
  const existing = thread.turns[turnId];
  if (existing) {
    return existing;
  }
  const created: TurnRecord = {
    id: turnId,
    status: "pending",
    items: {},
    itemOrder: [],
    startedAt: null,
    completedAt: null,
    tokenUsage: null,
    pendingApprovals: [],
    rawTurn: null,
    error: null,
  };
  thread.turns[turnId] = created;
  thread.turnOrder = Array.from(new Set([...thread.turnOrder, turnId]));
  return created;
};

const preferFinalContent = (finalValue: unknown, streamedValue: string): string => {
  if (typeof finalValue === "string" && finalValue.length > 0) {
    return finalValue;
  }
  return streamedValue;
};

const deriveRenderedText = (item: Record<string, unknown>, aggregated: ItemRecord["aggregatedDeltas"]): string => {
  const itemType = item.type;
  if (itemType === "agentMessage") {
    return preferFinalContent(item.text, aggregated.agentText);
  }
  if (itemType === "commandExecution") {
    return preferFinalContent(item.aggregatedOutput, aggregated.commandOutput);
  }
  if (itemType === "fileChange") {
    return preferFinalContent(item.output, aggregated.fileChangeOutput);
  }
  if (itemType === "plan") {
    return String(item.text ?? "");
  }
  if (itemType === "reasoning") {
    return JSON.stringify(item.summary ?? []);
  }
  return JSON.stringify(item, null, 2);
};

const itemIdentitySignature = (rawItem: Record<string, unknown>): string => {
  const type = String(rawItem.type ?? "unknown");

  if (type === "userMessage") {
    return `${type}:${JSON.stringify(rawItem.content ?? null)}`;
  }
  if (type === "agentMessage") {
    return `${type}:${String(rawItem.text ?? "")}`;
  }
  if (type === "commandExecution") {
    return `${type}:${String(rawItem.command ?? "")}`;
  }
  if (type === "fileChange") {
    return `${type}:${String(rawItem.output ?? "")}:${JSON.stringify(rawItem.changes ?? null)}`;
  }

  return `${type}:${JSON.stringify(rawItem)}`;
};

const isProvisionalItemId = (value: string): boolean => /^item-\d+$/.test(value) || value.startsWith("generated-");

const resolveAnonymousItemId = (turn: TurnRecord, rawItem: Record<string, unknown>): string | null => {
  const incomingType = String(rawItem.type ?? "unknown");
  const incomingSignature = itemIdentitySignature(rawItem);

  for (const itemId of turn.itemOrder) {
    const existing = turn.items[itemId];
    if (!existing || existing.type !== incomingType || existing.rawItem?.id !== undefined) {
      continue;
    }
    if (existing.rawItem && itemIdentitySignature(existing.rawItem) === incomingSignature) {
      return existing.id;
    }
  }

  return null;
};

const resolveExistingItemId = (turn: TurnRecord, rawItem: Record<string, unknown>): string | null => {
  const incomingId = rawItem.id !== undefined ? String(rawItem.id) : null;
  if (incomingId && turn.items[incomingId]) {
    return incomingId;
  }

  const incomingType = String(rawItem.type ?? "unknown");
  const incomingSignature = itemIdentitySignature(rawItem);

  for (const itemId of turn.itemOrder) {
    const existing = turn.items[itemId];
    if (!existing || existing.type !== incomingType || !existing.rawItem) {
      continue;
    }
    if (itemIdentitySignature(existing.rawItem) !== incomingSignature) {
      continue;
    }

    const existingRawId = existing.rawItem.id !== undefined ? String(existing.rawItem.id) : null;
    if (!incomingId || !existingRawId) {
      return existing.id;
    }
    if (existingRawId === incomingId) {
      return existing.id;
    }
    if (isProvisionalItemId(existingRawId) || isProvisionalItemId(incomingId)) {
      return existing.id;
    }
  }

  return incomingId;
};

const upsertItem = (
  turn: TurnRecord,
  rawItem: Record<string, unknown>,
  timestamp: number | null,
  completed: boolean,
): ItemRecord => {
  const id =
    resolveExistingItemId(turn, rawItem) ??
    resolveAnonymousItemId(turn, rawItem) ??
    `generated-${Date.now()}-${turn.itemOrder.length + 1}`;
  const existing = turn.items[id];
  const type = String(rawItem.type ?? "unknown");
  const next: ItemRecord = existing
    ? {
        ...existing,
        rawItem,
        type,
      }
    : {
        id,
        type,
        rawItem,
        aggregatedDeltas: {
          agentText: "",
          commandOutput: "",
          fileChangeOutput: "",
        },
        renderedText: "",
        finalStatus: completed ? "completed" : "started",
        startedAt: timestamp,
        completedAt: completed ? timestamp : null,
        isUnknownType: !KNOWN_ITEM_TYPES.has(type),
      };
  if (timestamp && !next.startedAt) {
    next.startedAt = timestamp;
  }
  if (completed) {
    next.completedAt = timestamp;
    next.finalStatus = "completed";
  }
  next.renderedText = deriveRenderedText(rawItem, next.aggregatedDeltas);
  turn.items[id] = next;
  if (!turn.itemOrder.includes(id)) {
    turn.itemOrder.push(id);
  }
  return next;
};

const appendThreadEvent = (thread: ThreadRecord, record: EventLogRecord): void => {
  thread.eventTrail = [...thread.eventTrail, record].slice(-MAX_THREAD_EVENT_TRAIL);
};

const appendCapped = (value: string, chunk: string): { output: string; truncated: boolean } => {
  const merged = value + chunk;
  if (merged.length <= MAX_TERMINAL_OUTPUT) {
    return { output: merged, truncated: false };
  }
  return {
    output: merged.slice(merged.length - MAX_TERMINAL_OUTPUT),
    truncated: true,
  };
};

export const reduceRuntimeEvent = (snapshot: RuntimeSnapshot, event: RuntimeEvent): RuntimeSnapshot => {
  if (event.type === "snapshot/hydrated") {
    return {
      ...event.snapshot,
      lastUpdatedAt: Date.now(),
    };
  }

  const next = {
    ...snapshot,
    threads: { ...snapshot.threads },
    approvals: { ...snapshot.approvals },
    terminals: { ...snapshot.terminals },
    eventLog: [...snapshot.eventLog],
    unknownEvents: [...snapshot.unknownEvents],
    notes: [...snapshot.notes],
    runtime: { ...snapshot.runtime },
    lastUpdatedAt: Date.now(),
  };

  switch (event.type) {
    case "runtime/error":
      next.runtime.lastError = event.message;
      next.notes.push(event.message);
      return next;
    case "connection/state":
      next.runtime.connectionState = event.connectionState;
      if (event.lastError !== undefined) {
        next.runtime.lastError = event.lastError;
      }
      if (event.serverInfo) {
        next.runtime.serverInfo = event.serverInfo;
      }
      if (event.clientInfo) {
        next.runtime.clientInfo = event.clientInfo;
      }
      if (event.connectionState === "starting" || event.connectionState === "reconnecting") {
        next.runtime.lastStartedAt = event.timestamp;
      }
      if (event.connectionState === "ready") {
        next.runtime.lastReadyAt = event.timestamp;
      }
      return next;
    case "request/pending":
      next.runtime.pendingRequests = event.active
        ? Array.from(new Set([...next.runtime.pendingRequests, event.requestId]))
        : next.runtime.pendingRequests.filter((id) => id !== event.requestId);
      return next;
    case "eventLog/append":
      next.eventLog = [...next.eventLog, event.record].slice(-MAX_EVENT_LOG);
      if (event.record.unknown) {
        next.unknownEvents = [...next.unknownEvents, event.record].slice(-MAX_EVENT_LOG);
      }
      if (event.record.threadId && next.threads[event.record.threadId]) {
        appendThreadEvent(next.threads[event.record.threadId], event.record);
      }
      return next;
    case "thread/merged":
      return upsertThread(next, event.thread, event.mode);
    case "thread/selected":
      next.selectedThreadId = event.threadId;
      return next;
    case "thread/status": {
      const thread = next.threads[event.threadId];
      if (thread) {
        thread.status = event.status;
        thread.archived = event.status === "archived" ? true : thread.archived;
      }
      return next;
    }
    case "thread/removed": {
      if (next.threads[event.threadId]) {
        delete next.threads[event.threadId];
      }
      next.threadOrder = next.threadOrder.filter((threadId) => threadId !== event.threadId);
      if (next.selectedThreadId === event.threadId) {
        next.selectedThreadId = null;
        next.selectedItemId = null;
      }
      return next;
    }
    case "turn/merged": {
      const thread = next.threads[event.threadId];
      if (!thread) {
        return next;
      }
      const turn = ensureTurnRecord(thread, event.turn.id);
      turn.rawTurn = event.turn as unknown as Record<string, unknown>;
      turn.status = event.turn.status;
      turn.error = (event.turn.error ?? null) as Record<string, unknown> | null;
      if (event.kind === "started" && !turn.startedAt) {
        turn.startedAt = event.timestamp;
        thread.activeTurnId = event.turn.id;
      }
      if (event.kind === "completed") {
        turn.completedAt = event.timestamp;
        if (thread.activeTurnId === event.turn.id) {
          thread.activeTurnId = null;
        }
      }
      for (const item of event.turn.items) {
        upsertItem(turn, item as unknown as Record<string, unknown>, null, event.kind === "completed");
      }
      return next;
    }
    case "item/started": {
      const thread = next.threads[event.threadId];
      if (!thread) {
        return next;
      }
      const turn = ensureTurnRecord(thread, event.turnId);
      upsertItem(turn, event.item, event.timestamp, false);
      next.selectedItemId = String(event.item.id ?? next.selectedItemId ?? "");
      return next;
    }
    case "item/completed": {
      const thread = next.threads[event.threadId];
      if (!thread) {
        return next;
      }
      const turn = ensureTurnRecord(thread, event.turnId);
      upsertItem(turn, event.item, event.timestamp, true);
      return next;
    }
    case "item/delta": {
      const thread = next.threads[event.threadId];
      if (!thread) {
        return next;
      }
      const turn = ensureTurnRecord(thread, event.turnId);
      const item = turn.items[event.itemId];
      if (!item) {
        return next;
      }
      item.aggregatedDeltas[event.stream] += event.delta;
      item.renderedText = deriveRenderedText(item.rawItem ?? { type: item.type }, item.aggregatedDeltas);
      return next;
    }
    case "approval/pending":
      next.approvals[event.request.requestId] = event.request;
      next.runtime.pendingServerRequests = Array.from(
        new Set([...next.runtime.pendingServerRequests, event.request.requestId]),
      );
      if (next.threads[event.request.threadId]) {
        const turn = ensureTurnRecord(next.threads[event.request.threadId], event.request.turnId);
        turn.pendingApprovals = Array.from(new Set([...turn.pendingApprovals, event.request.requestId]));
      }
      return next;
    case "approval/resolved": {
      const approval = next.approvals[event.requestId];
      if (approval) {
        approval.status = event.status;
        approval.response = event.response;
        approval.resolvedAt = event.resolvedAt;
      }
      next.runtime.pendingServerRequests = next.runtime.pendingServerRequests.filter((id) => id !== event.requestId);
      return next;
    }
    case "terminal/upsert":
      next.terminals[event.terminal.processId] = event.terminal;
      return next;
    case "terminal/output": {
      const terminal = next.terminals[event.processId];
      if (!terminal) {
        return next;
      }
      const target = event.stream === "stdout" ? terminal.stdout : terminal.stderr;
      const { output, truncated } = appendCapped(target, event.chunk);
      if (event.stream === "stdout") {
        terminal.stdout = output;
      } else {
        terminal.stderr = output;
      }
      terminal.truncated = terminal.truncated || truncated || Boolean(event.truncated);
      terminal.status = "running";
      return next;
    }
    case "terminal/completed": {
      const terminal = next.terminals[event.processId];
      if (!terminal) {
        return next;
      }
      terminal.exitCode = event.exitCode;
      terminal.status = event.status;
      terminal.completedAt = event.completedAt;
      if (event.stdout !== undefined) {
        terminal.stdout = event.stdout;
      }
      if (event.stderr !== undefined) {
        terminal.stderr = event.stderr;
      }
      return next;
    }
    case "skills/changed":
      next.skillsVersion += 1;
      return next;
    case "note":
      next.notes.push(event.message);
      return next;
  }
};

export const reduceRuntimeEvents = (snapshot: RuntimeSnapshot, events: RuntimeEvent[]): RuntimeSnapshot =>
  events.reduce((acc, event) => reduceRuntimeEvent(acc, event), snapshot);

export const getSelectedThread = (snapshot: RuntimeSnapshot): ThreadRecord | null =>
  snapshot.selectedThreadId ? snapshot.threads[snapshot.selectedThreadId] ?? null : null;

export const getSelectedItem = (snapshot: RuntimeSnapshot): ItemRecord | null => {
  const thread = getSelectedThread(snapshot);
  if (!thread || !snapshot.selectedItemId) {
    return null;
  }
  for (const turnId of thread.turnOrder) {
    const item = thread.turns[turnId]?.items[snapshot.selectedItemId];
    if (item) {
      return item;
    }
  }
  return null;
};
