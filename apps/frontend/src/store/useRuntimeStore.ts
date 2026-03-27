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
} from "@codex-web/shared";
import { createEmptySnapshot, reduceRuntimeEvents } from "@codex-web/shared";
import { fetchRuntime, postAction } from "../lib/api";

type SocketState = "connecting" | "open" | "closed";
const cwdStorageKey = "codex-web:selected-cwd";

export type ComposerProfile = {
  model: string;
  effort: ReasoningEffort | "";
  approvalPolicy: AskForApproval | "on-request";
  personality: Personality | "pragmatic";
};

const readStoredCwd = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(cwdStorageKey) ?? "";
};

type RuntimeStore = {
  snapshot: RuntimeSnapshot;
  socketState: SocketState;
  selectedItemId: string | null;
  selectedCwd: string;
  availableModels: Model[];
  composerDefaults: ComposerProfile;
  threadProfiles: Record<string, ComposerProfile>;
  connect: () => void;
  hydrate: () => Promise<void>;
  applyEvents: (events: RuntimeEvent[]) => void;
  callAction: <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  selectThread: (threadId: string | null) => void;
  selectItem: (itemId: string | null) => void;
  setSelectedCwd: (cwd: string) => void;
  setAvailableModels: (models: Model[]) => void;
  setComposerDefaults: (profile: Partial<ComposerProfile>) => void;
  setThreadProfile: (threadId: string, profile: Partial<ComposerProfile>) => void;
};

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  snapshot: createEmptySnapshot(),
  socketState: "closed",
  selectedItemId: null,
  selectedCwd: readStoredCwd(),
  availableModels: [],
  composerDefaults: {
    model: "",
    effort: "",
    approvalPolicy: "on-request",
    personality: "pragmatic",
  },
  threadProfiles: {},
  hydrate: async () => {
    const snapshot = await fetchRuntime<RuntimeSnapshot>();
    set({
      snapshot,
    });
  },
  applyEvents: (events) => {
    set((state) => ({
      snapshot: reduceRuntimeEvents(state.snapshot, events),
    }));
  },
  connect: () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
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
        set({ snapshot: parsed.snapshot });
      } else {
        get().applyEvents(parsed.events);
      }
    };
    socket.onclose = () => {
      set({ socketState: "closed" });
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        get().connect();
      }, 1200);
    };
  },
  callAction: async (action, payload = {}) => {
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
