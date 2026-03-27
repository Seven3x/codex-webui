import { useState } from "react";
import { useRuntimeStore } from "../store/useRuntimeStore";

const approvalOptions = ["untrusted", "on-failure", "on-request", "never"] as const;
const personalityOptions = ["none", "friendly", "pragmatic"] as const;

export const ComposerBar = ({ embedded = false }: { embedded?: boolean }) => {
  const { snapshot, callAction, selectThread, selectedCwd, setSelectedCwd } = useRuntimeStore();
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState<(typeof approvalOptions)[number]>("on-request");
  const [personality, setPersonality] = useState<(typeof personalityOptions)[number]>("pragmatic");

  const cwdOptions = Array.from(
    new Set(
      snapshot.threadOrder
        .map((id) => snapshot.threads[id]?.cwd)
        .filter((cwd): cwd is string => Boolean(cwd)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const sendTurn = async (): Promise<void> => {
    if (!text.trim()) {
      return;
    }
    let threadId = snapshot.selectedThreadId;
    if (!threadId) {
      const response = await callAction<{ thread: { id: string } }>("thread.start", {
        cwd: selectedCwd || null,
        model: model || null,
        approvalPolicy,
        personality,
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      });
      threadId = response.thread.id;
      selectThread(threadId);
    }
    await callAction("turn.start", {
      threadId,
      cwd: selectedCwd || null,
      approvalPolicy,
      model: model || null,
      personality,
      input: [
        {
          type: "text",
          text,
          text_elements: [],
        },
      ],
    });
    setText("");
  };

  const steerTurn = async (): Promise<void> => {
    const threadId = snapshot.selectedThreadId;
    const activeTurnId = threadId ? snapshot.threads[threadId]?.activeTurnId : null;
    if (!threadId || !activeTurnId || !text.trim()) {
      return;
    }
    await callAction("turn.steer", {
      threadId,
      expectedTurnId: activeTurnId,
      input: [
        {
          type: "text",
          text,
          text_elements: [],
        },
      ],
    });
    setText("");
  };

  const interruptTurn = async (): Promise<void> => {
    const threadId = snapshot.selectedThreadId;
    const activeTurnId = threadId ? snapshot.threads[threadId]?.activeTurnId : null;
    if (!threadId || !activeTurnId) {
      return;
    }
    await callAction("turn.interrupt", {
      threadId,
      turnId: activeTurnId,
    });
  };

  const startReview = async (): Promise<void> => {
    if (!snapshot.selectedThreadId) {
      return;
    }
    await callAction("review.start", {
      threadId: snapshot.selectedThreadId,
      target: { type: "uncommittedChanges" },
      delivery: "inline",
    });
  };

  return (
    <footer className={`${embedded ? "surface-card rounded-3xl p-4" : "panel min-w-0 rounded-3xl p-4"}`}>
      <div className="surface-soft mb-3 flex items-center justify-between gap-4 rounded-3xl px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Conversation Input</div>
          <div className="truncate text-sm text-slate-200">{selectedCwd || "Choose a workspace or type a new cwd below"}</div>
        </div>
        {snapshot.selectedThreadId && (
          <div className="rounded-full bg-slate-800 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
            thread {snapshot.selectedThreadId.slice(0, 8)}
          </div>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="像 VS Code Codex 插件那样在这里直接输入对话内容..."
          className="surface-card min-h-28 rounded-3xl px-4 py-3 text-sm"
        />
        <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model" className="surface-card rounded-3xl px-3 py-2 text-sm" />
        <div className="flex flex-col gap-2">
          <input
            list="cwd-options"
            value={selectedCwd}
            onChange={(event) => setSelectedCwd(event.target.value)}
            placeholder="cwd"
            className="surface-card rounded-3xl px-3 py-2 text-sm"
          />
          <datalist id="cwd-options">
            {cwdOptions.map((cwd) => (
              <option key={cwd} value={cwd} />
            ))}
          </datalist>
          <div className="text-[11px] text-slate-500">选择目录后，会优先看到该目录下的对话</div>
        </div>
        <select value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value as (typeof approvalOptions)[number])} className="surface-card rounded-3xl px-3 py-2 text-sm">
          {approvalOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={personality} onChange={(event) => setPersonality(event.target.value as (typeof personalityOptions)[number])} className="surface-card rounded-3xl px-3 py-2 text-sm">
          {personalityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="primary-btn rounded-full px-4 py-2 text-sm font-semibold" onClick={() => void sendTurn()}>
          Send
        </button>
        <button className="ghost-btn rounded-full px-4 py-2 text-sm" onClick={() => void steerTurn()}>
          Steer
        </button>
        <button className="ghost-btn rounded-full px-4 py-2 text-sm" onClick={() => void interruptTurn()}>
          Stop
        </button>
        <button className="ghost-btn rounded-full px-4 py-2 text-sm" onClick={() => void startReview()}>
          Code Review
        </button>
      </div>
    </footer>
  );
};
