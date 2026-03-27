import { create } from "zustand";
import type {
  AskForApproval,
  Model,
  Personality,
  ReasoningEffort,
  RuntimeEvent,
  RuntimeSnapshot,
  ThreadForkResponse,
  ThreadResumeResponse,
  ThreadStartResponse,
  TurnRecord,
} from "@codex-web/shared";
import { createEmptySnapshot, reduceRuntimeEvents } from "@codex-web/shared";
import { fetchRuntime, postAction } from "../lib/api";
import type { DebugPreferences } from "../lib/debugPreferences";
import { defaultDebugPreferences } from "../lib/debugPreferences";

type SocketState = "connecting" | "open" | "closed";
const cwdStorageKey = "codex-web:selected-cwd";
const debugPreferencesStorageKey = "codex-web:debug-preferences";
const optimisticAssistantPlaceholder = "Codex is thinking...";

export type ComposerProfile = {
  model: string;
  effort: ReasoningEffort | "";
  approvalPolicy: AskForApproval | "on-request";
  personality: Personality | "pragmatic";
};

export type OptimisticTurnStatus = "sending" | "streaming" | "failed";

export interface OptimisticTurn {
  localId: string;
  threadId: string | null;
  turnId: string | null;
  userText: string;
  assistantPlaceholder: string;
  status: OptimisticTurnStatus;
  createdAt: number;
  error: string | null;
}

const readStoredCwd = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(cwdStorageKey) ?? "";
};

const readStoredDebugPreferences = (): DebugPreferences => {
  if (typeof window === "undefined") {
    return defaultDebugPreferences;
  }

  try {
    const raw = window.localStorage.getItem(debugPreferencesStorageKey);
    if (!raw) {
      return defaultDebugPreferences;
    }
    const parsed = JSON.parse(raw) as Partial<DebugPreferences>;
    return {
      ...defaultDebugPreferences,
      ...parsed,
    };
  } catch {
    return defaultDebugPreferences;
  }
};

const persistDebugPreferences = (preferences: DebugPreferences): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(debugPreferencesStorageKey, JSON.stringify(preferences));
};

type RuntimeStore = {
  snapshot: RuntimeSnapshot;
  socketState: SocketState;
  selectedItemId: string | null;
  selectedCwd: string;
  debugPreferences: DebugPreferences;
  availableModels: Model[];
  composerDefaults: ComposerProfile;
  threadProfiles: Record<string, ComposerProfile>;
  optimisticTurns: OptimisticTurn[];
  connect: () => void;
  hydrate: () => Promise<void>;
  applyEvents: (events: RuntimeEvent[]) => void;
  enqueueEvents: (events: RuntimeEvent[]) => void;
  flushPendingEvents: () => void;
  callAction: <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  beginOptimisticTurn: (draft: { threadId: string | null; userText: string; assistantPlaceholder?: string }) => string;
  updateOptimisticTurn: (localId: string, patch: Partial<Omit<OptimisticTurn, "localId" | "createdAt">>) => void;
  failOptimisticTurn: (localId: string, error: string) => void;
  clearOptimisticTurn: (localId: string) => void;
  selectThread: (threadId: string | null) => void;
  selectItem: (itemId: string | null) => void;
  setSelectedCwd: (cwd: string) => void;
  setDebugPreferences: (patch: Partial<DebugPreferences>) => void;
  setAvailableModels: (models: Model[]) => void;
  setComposerDefaults: (profile: Partial<ComposerProfile>) => void;
  setThreadProfile: (threadId: string, profile: Partial<ComposerProfile>) => void;
};

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let pendingSocketEvents: RuntimeEvent[] = [];
let pendingEventsFrame: number | null = null;
let pendingEventsTimeout: number | null = null;

const clearPendingEventFlush = (): void => {
  if (typeof window === "undefined") {
    pendingSocketEvents = [];
    pendingEventsFrame = null;
    pendingEventsTimeout = null;
    return;
  }
  if (pendingEventsFrame !== null) {
    window.cancelAnimationFrame(pendingEventsFrame);
    pendingEventsFrame = null;
  }
  if (pendingEventsTimeout !== null) {
    window.clearTimeout(pendingEventsTimeout);
    pendingEventsTimeout = null;
  }
};

const schedulePendingEventFlush = (flush: () => void): void => {
  if (typeof window === "undefined") {
    flush();
    return;
  }
  if (pendingEventsFrame !== null || pendingEventsTimeout !== null) {
    return;
  }
  pendingEventsFrame = window.requestAnimationFrame(() => {
    pendingEventsFrame = null;
    flush();
  });
  pendingEventsTimeout = window.setTimeout(() => {
    if (pendingEventsFrame !== null) {
      window.cancelAnimationFrame(pendingEventsFrame);
      pendingEventsFrame = null;
    }
    pendingEventsTimeout = null;
    flush();
  }, 24);
};

const cloneOptimisticTurn = (entry: OptimisticTurn): OptimisticTurn => ({
  ...entry,
});

const findLatestOptimisticTurnIndex = (
  optimisticTurns: OptimisticTurn[],
  predicate: (entry: OptimisticTurn) => boolean,
): number => {
  for (let index = optimisticTurns.length - 1; index >= 0; index -= 1) {
    if (predicate(optimisticTurns[index])) {
      return index;
    }
  }
  return -1;
};

const isAssistantWorkItemType = (type: string): boolean =>
  type === "agentMessage" || type === "commandExecution" || type === "fileChange";

const isFinalTurnStatus = (status: string, turn: TurnRecord): boolean =>
  Boolean(turn.completedAt) || ["completed", "failed", "cancelled", "interrupted"].includes(status);

const getTurnForOptimistic = (snapshot: RuntimeSnapshot, entry: OptimisticTurn): TurnRecord | null => {
  if (!entry.threadId || !entry.turnId) {
    return null;
  }
  return snapshot.threads[entry.threadId]?.turns[entry.turnId] ?? null;
};

const turnHasAssistantActivity = (turn: TurnRecord): boolean =>
  turn.itemOrder.some((itemId) => {
    const item = turn.items[itemId];
    return Boolean(item) && isAssistantWorkItemType(item.type);
  });

const finalizeOptimisticTurns = (optimisticTurns: OptimisticTurn[], snapshot: RuntimeSnapshot): OptimisticTurn[] =>
  optimisticTurns.filter((entry) => {
    if (entry.status === "failed") {
      return true;
    }
    const turn = getTurnForOptimistic(snapshot, entry);
    if (!turn) {
      return true;
    }
    if (isFinalTurnStatus(turn.status, turn)) {
      return false;
    }
    if (turnHasAssistantActivity(turn)) {
      return false;
    }
    return true;
  });

const reconcileOptimisticTurns = (
  optimisticTurns: OptimisticTurn[],
  nextSnapshot: RuntimeSnapshot,
  events: RuntimeEvent[],
): OptimisticTurn[] => {
  const next = optimisticTurns.map(cloneOptimisticTurn);

  for (const event of events) {
    switch (event.type) {
      case "thread/merged": {
        const optimisticIndex = findLatestOptimisticTurnIndex(
          next,
          (entry) => entry.threadId === null && entry.status !== "failed",
        );
        if (optimisticIndex >= 0) {
          next[optimisticIndex].threadId = event.thread.id;
        }
        break;
      }
      case "thread/removed": {
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (next[index].threadId === event.threadId && next[index].status !== "failed") {
            next.splice(index, 1);
          }
        }
        break;
      }
      case "turn/merged": {
        const optimisticIndex = findLatestOptimisticTurnIndex(
          next,
          (entry) => entry.threadId === event.threadId && entry.turnId === null && entry.status !== "failed",
        );
        if (optimisticIndex >= 0) {
          next[optimisticIndex].turnId = event.turn.id;
        }
        break;
      }
      case "item/started":
      case "item/completed": {
        const itemType = String(event.item.type ?? "unknown");
        if (!isAssistantWorkItemType(itemType)) {
          break;
        }
        const optimisticIndex = findLatestOptimisticTurnIndex(
          next,
          (entry) =>
            entry.threadId === event.threadId &&
            (entry.turnId === null || entry.turnId === event.turnId) &&
            entry.status !== "failed",
        );
        if (optimisticIndex >= 0) {
          next[optimisticIndex].turnId = event.turnId;
          next[optimisticIndex].status = "streaming";
        }
        break;
      }
      case "item/delta": {
        const optimisticIndex = findLatestOptimisticTurnIndex(
          next,
          (entry) =>
            entry.threadId === event.threadId &&
            (entry.turnId === null || entry.turnId === event.turnId) &&
            entry.status !== "failed",
        );
        if (optimisticIndex >= 0) {
          next[optimisticIndex].turnId = event.turnId;
          next[optimisticIndex].status = "streaming";
        }
        break;
      }
      default:
        break;
    }
  }

  return finalizeOptimisticTurns(next, nextSnapshot);
};

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  snapshot: createEmptySnapshot(),
  socketState: "closed",
  selectedItemId: null,
  selectedCwd: readStoredCwd(),
  debugPreferences: readStoredDebugPreferences(),
  availableModels: [],
  composerDefaults: {
    model: "",
    effort: "",
    approvalPolicy: "on-request",
    personality: "pragmatic",
  },
  threadProfiles: {},
  optimisticTurns: [],
  hydrate: async () => {
    const snapshot = await fetchRuntime<RuntimeSnapshot>();
    set((state) => ({
      snapshot,
      optimisticTurns: finalizeOptimisticTurns(state.optimisticTurns, snapshot),
    }));
  },
  applyEvents: (events) => {
    if (events.length === 0) {
      return;
    }
    set((state) => {
      const snapshot = reduceRuntimeEvents(state.snapshot, events);
      return {
        snapshot,
        optimisticTurns: reconcileOptimisticTurns(state.optimisticTurns, snapshot, events),
      };
    });
  },
  enqueueEvents: (events) => {
    if (events.length === 0) {
      return;
    }
    pendingSocketEvents.push(...events);
    schedulePendingEventFlush(() => {
      get().flushPendingEvents();
    });
  },
  flushPendingEvents: () => {
    clearPendingEventFlush();
    if (pendingSocketEvents.length === 0) {
      return;
    }
    const events = pendingSocketEvents;
    pendingSocketEvents = [];
    get().applyEvents(events);
  },
  beginOptimisticTurn: ({ threadId, userText, assistantPlaceholder }) => {
    const localId = `optimistic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set((state) => ({
      optimisticTurns: [
        ...state.optimisticTurns,
        {
          localId,
          threadId,
          turnId: null,
          userText,
          assistantPlaceholder: assistantPlaceholder ?? optimisticAssistantPlaceholder,
          status: "sending",
          createdAt: Date.now(),
          error: null,
        },
      ],
    }));
    return localId;
  },
  updateOptimisticTurn: (localId, patch) =>
    set((state) => ({
      optimisticTurns: state.optimisticTurns.map((entry) =>
        entry.localId === localId
          ? {
              ...entry,
              ...patch,
            }
          : entry,
      ),
    })),
  failOptimisticTurn: (localId, error) =>
    set((state) => ({
      optimisticTurns: state.optimisticTurns.map((entry) =>
        entry.localId === localId
          ? {
              ...entry,
              status: "failed",
              error,
            }
          : entry,
      ),
    })),
  clearOptimisticTurn: (localId) =>
    set((state) => ({
      optimisticTurns: state.optimisticTurns.filter((entry) => entry.localId !== localId),
    })),
  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    clearPendingEventFlush();
    pendingSocketEvents = [];
    set({ socketState: "connecting" });
    socket = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`);
    socket.onopen = () => {
      set({ socketState: "open" });
    };
    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as
        | { type: "runtime/snapshot"; snapshot: RuntimeSnapshot }
        | { type: "runtime/events"; events: RuntimeEvent[] };
      if (parsed.type === "runtime/snapshot") {
        clearPendingEventFlush();
        pendingSocketEvents = [];
        set((state) => ({
          snapshot: parsed.snapshot,
          optimisticTurns: finalizeOptimisticTurns(state.optimisticTurns, parsed.snapshot),
        }));
      } else {
        get().enqueueEvents(parsed.events);
      }
    };
    socket.onclose = () => {
      clearPendingEventFlush();
      pendingSocketEvents = [];
      set({ socketState: "closed" });
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        get().connect();
      }, 1200);
    };
  },
  callAction: async (action: string, payload: Record<string, unknown> = {}) => {
    const response = await postAction<unknown>(action, payload);
    if (action === "thread.start" || action === "thread.resume" || action === "thread.fork") {
      const threadResponse = response as ThreadStartResponse | ThreadResumeResponse | ThreadForkResponse;
      const threadId = String(threadResponse.thread?.id ?? "");
      if (threadId) {
        get().setThreadProfile(threadId, {
          model: threadResponse.model ?? "",
          effort: threadResponse.reasoningEffort ?? "",
          approvalPolicy: threadResponse.approvalPolicy ?? "on-request",
          personality:
            (typeof (payload as { personality?: unknown }).personality === "string"
              ? ((payload as { personality?: Personality }).personality ?? "pragmatic")
              : "pragmatic"),
        });
      }
    }
    if (action === "turn.start") {
      const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
      if (threadId) {
        get().setThreadProfile(threadId, {
          model: typeof payload.model === "string" ? payload.model : undefined,
          effort: typeof payload.effort === "string" ? (payload.effort as ReasoningEffort) : undefined,
          approvalPolicy:
            typeof payload.approvalPolicy === "string" || typeof payload.approvalPolicy === "object"
              ? (payload.approvalPolicy as AskForApproval)
              : undefined,
          personality: typeof payload.personality === "string" ? (payload.personality as Personality) : undefined,
        });
      }
    }
    return response as never;
  },
  selectThread: (threadId) => {
    set((state) => ({
      snapshot: {
        ...state.snapshot,
        selectedThreadId: threadId,
      },
      selectedItemId: null,
      selectedCwd: threadId ? state.snapshot.threads[threadId]?.cwd ?? state.selectedCwd : state.selectedCwd,
    }));
    if (threadId) {
      const cwd = get().snapshot.threads[threadId]?.cwd ?? "";
      if (cwd && typeof window !== "undefined") {
        window.localStorage.setItem(cwdStorageKey, cwd);
      }
    }
  },
  selectItem: (itemId) => set({ selectedItemId: itemId }),
  setSelectedCwd: (cwd) => {
    set({ selectedCwd: cwd });
    if (typeof window !== "undefined") {
      if (cwd) {
        window.localStorage.setItem(cwdStorageKey, cwd);
      } else {
        window.localStorage.removeItem(cwdStorageKey);
      }
    }
  },
  setDebugPreferences: (patch) =>
    set((state) => {
      const debugPreferences = {
        ...state.debugPreferences,
        ...patch,
      };
      persistDebugPreferences(debugPreferences);
      return { debugPreferences };
    }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setComposerDefaults: (profile) =>
    set((state) => ({
      composerDefaults: {
        ...state.composerDefaults,
        ...profile,
      },
    })),
  setThreadProfile: (threadId, profile) =>
    set((state) => ({
      threadProfiles: {
        ...state.threadProfiles,
        [threadId]: {
          ...(state.threadProfiles[threadId] ?? state.composerDefaults),
          ...profile,
        },
      },
    })),
}));
