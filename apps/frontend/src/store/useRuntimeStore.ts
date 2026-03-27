import { create } from "zustand";
import type { RuntimeEvent, RuntimeSnapshot } from "@codex-web/shared";
import { createEmptySnapshot, reduceRuntimeEvents } from "@codex-web/shared";
import { fetchRuntime, postAction } from "../lib/api";

type SocketState = "connecting" | "open" | "closed";
const cwdStorageKey = "codex-web:selected-cwd";

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
  connect: () => void;
  hydrate: () => Promise<void>;
  applyEvents: (events: RuntimeEvent[]) => void;
  callAction: <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  selectThread: (threadId: string | null) => void;
  selectItem: (itemId: string | null) => void;
  setSelectedCwd: (cwd: string) => void;
};

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  snapshot: createEmptySnapshot(),
  socketState: "closed",
  selectedItemId: null,
  selectedCwd: readStoredCwd(),
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
    return postAction(action, payload);
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
}));
