import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AskForApproval,
  ConfigReadResponse,
  ModelListResponse,
  Personality,
  ReasoningEffort,
  TurnStartResponse,
} from "@codex-web/shared";
import { resolveDebugPreferences } from "../lib/debugPreferences";
import { navigateToRoute } from "../lib/routes";
import { useRuntimeStore } from "../store/useRuntimeStore";

const approvalOptions: Array<{ value: AskForApproval | "on-request"; label: string }> = [
  { value: "untrusted", label: "Untrusted" },
  { value: "on-failure", label: "On Failure" },
  { value: "on-request", label: "Ask On Request" },
  { value: "never", label: "Never Ask" },
];

const personalityOptions: Array<{ value: Personality | "pragmatic"; label: string }> = [
  { value: "none", label: "Neutral" },
  { value: "friendly", label: "Friendly" },
  { value: "pragmatic", label: "Pragmatic" },
];

const isThreadNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("thread not found") || normalized.includes("no rollout found for thread id");
};

export const ComposerBar = ({ embedded = false }: { embedded?: boolean }) => {
  const {
    snapshot,
    callAction,
    selectThread,
    selectedCwd,
    setSelectedCwd,
    debugPreferences,
    availableModels,
    setAvailableModels,
    composerDefaults,
    setComposerDefaults,
    threadProfiles,
    beginOptimisticTurn,
    updateOptimisticTurn,
    failOptimisticTurn,
  } = useRuntimeStore();
  const debug = useMemo(() => resolveDebugPreferences(debugPreferences), [debugPreferences]);
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<ReasoningEffort | "">("");
  const [approvalPolicy, setApprovalPolicy] = useState<AskForApproval | "on-request">("on-request");
  const [personality, setPersonality] = useState<Personality | "pragmatic">("pragmatic");
  const [showControls, setShowControls] = useState(false);
  const [activeControl, setActiveControl] = useState<"model" | "effort" | "cwd" | "approval" | "personality" | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const modelRef = useRef<HTMLSelectElement | null>(null);
  const effortRef = useRef<HTMLSelectElement | null>(null);
  const cwdRef = useRef<HTMLInputElement | null>(null);
  const approvalRef = useRef<HTMLSelectElement | null>(null);
  const personalityRef = useRef<HTMLSelectElement | null>(null);

  const selectedThreadProfile = snapshot.selectedThreadId ? threadProfiles[snapshot.selectedThreadId] : null;
  const activeProfile = selectedThreadProfile ?? composerDefaults;
  const selectedThread = snapshot.selectedThreadId ? snapshot.threads[snapshot.selectedThreadId] : null;

  const cwdOptions = Array.from(
    new Set(
      snapshot.threadOrder
        .map((id) => snapshot.threads[id]?.cwd)
        .filter((cwd): cwd is string => Boolean(cwd)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const selectedModelMeta = useMemo(
    () => availableModels.find((entry) => entry.model === model || entry.id === model) ?? null,
    [availableModels, model],
  );

  const effortOptions = useMemo(() => {
    if (!selectedModelMeta) {
      return ["none", "minimal", "low", "medium", "high", "xhigh"] as Array<ReasoningEffort>;
    }
    return selectedModelMeta.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
  }, [selectedModelMeta]);

  useEffect(() => {
    setModel(activeProfile.model);
    setEffort(activeProfile.effort);
    setApprovalPolicy(activeProfile.approvalPolicy);
    setPersonality(activeProfile.personality);
  }, [activeProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      try {
        const [modelsResponse, configResponse] = await Promise.all([
          callAction<ModelListResponse>("model.list", {
            limit: 100,
            includeHidden: false,
          }),
          callAction<ConfigReadResponse>("config.read", {
            includeLayers: false,
            cwd: selectedCwd || null,
          }),
        ]);
        if (cancelled) {
          return;
        }
        setAvailableModels(modelsResponse.data);
        const defaultModel = configResponse.config.model ?? modelsResponse.data.find((entry) => entry.isDefault)?.model ?? "";
        const defaultEffort = configResponse.config.model_reasoning_effort ?? "";
        const defaultApproval = configResponse.config.approval_policy ?? "on-request";
        setComposerDefaults({
          model: defaultModel,
          effort: defaultEffort,
          approvalPolicy: defaultApproval,
        });
      } catch {
        // Keep the composer usable even if metadata discovery fails.
      }
    };

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [callAction, selectedCwd, setAvailableModels, setComposerDefaults]);

  useEffect(() => {
    if (!effort) {
      return;
    }
    if (!effortOptions.includes(effort)) {
      setEffort(effortOptions[0] ?? "");
    }
  }, [effort, effortOptions]);

  const focusControl = (control: "model" | "effort" | "cwd" | "approval" | "personality") => {
    setShowControls(true);
    setActiveControl(control);
    window.requestAnimationFrame(() => {
      const target =
        control === "model"
          ? modelRef.current
          : control === "effort"
            ? effortRef.current
            : control === "cwd"
              ? cwdRef.current
              : control === "approval"
                ? approvalRef.current
                : personalityRef.current;
      target?.focus();
      if (target instanceof HTMLSelectElement) {
        target.click();
      }
    });
  };

  const sendTurn = async (): Promise<void> => {
    const outgoingText = text.trim();
    if (!outgoingText) {
      return;
    }
    setComposerError(null);
    setText("");
    const optimisticTurnId = beginOptimisticTurn({
      threadId: snapshot.selectedThreadId,
      userText: outgoingText,
    });

    const startFreshThread = async (): Promise<string> => {
      const response = await callAction<{ thread: { id: string } }>("thread.start", {
        cwd: selectedCwd || null,
        model: model || null,
        approvalPolicy,
        personality,
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      });
      const nextThreadId = response.thread.id;
      updateOptimisticTurn(optimisticTurnId, { threadId: nextThreadId });
      selectThread(nextThreadId);
      navigateToRoute({ name: "thread", threadId: nextThreadId });
      return nextThreadId;
    };

    const startTurn = async (threadId: string): Promise<void> => {
      const response = await callAction<TurnStartResponse>("turn.start", {
        threadId,
        cwd: selectedCwd || null,
        approvalPolicy,
        model: model || null,
        effort: effort || null,
        personality,
        input: [
          {
            type: "text",
            text: outgoingText,
            text_elements: [],
          },
        ],
      });
      updateOptimisticTurn(optimisticTurnId, {
        threadId,
        turnId: response.turn.id,
      });
    };

    const ensureWritableThread = async (threadId: string): Promise<string> => {
      const thread = snapshot.threads[threadId];
      if (!thread || thread.historyState === "resumed") {
        return threadId;
      }
      const response = await callAction<{ thread: { id: string } }>("thread.resume", {
        threadId,
        persistExtendedHistory: true,
        cwd: selectedCwd || null,
        model: model || null,
        approvalPolicy,
        personality,
      });
      const resumedThreadId = response.thread.id;
      selectThread(resumedThreadId);
      navigateToRoute({ name: "thread", threadId: resumedThreadId });
      return resumedThreadId;
    };

    try {
      let threadId = snapshot.selectedThreadId;
      if (!threadId) {
        threadId = await startFreshThread();
      } else {
        threadId = await ensureWritableThread(threadId);
      }
      await startTurn(threadId);
      setComposerError(null);
    } catch (error) {
      if (!isThreadNotFoundError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        setComposerError(message);
        failOptimisticTurn(optimisticTurnId, message);
        setText(outgoingText);
        return;
      }

      try {
        const nextThreadId = await startFreshThread();
        await startTurn(nextThreadId);
        setComposerError(null);
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        setComposerError(message);
        failOptimisticTurn(optimisticTurnId, message);
        setText(outgoingText);
      }
    }
  };

  const steerTurn = async (): Promise<void> => {
    const threadId = snapshot.selectedThreadId;
    const activeTurnId = threadId ? snapshot.threads[threadId]?.activeTurnId : null;
    const outgoingText = text.trim();
    if (!threadId || !activeTurnId || !outgoingText) {
      return;
    }
    setText("");
    setComposerError(null);
    try {
      await callAction("turn.steer", {
        threadId,
        expectedTurnId: activeTurnId,
        input: [
          {
            type: "text",
            text: outgoingText,
            text_elements: [],
          },
        ],
      });
    } catch (error) {
      setText(outgoingText);
      setComposerError(error instanceof Error ? error.message : String(error));
    }
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

  const canSend = Boolean(text.trim());
  const activeTurnId = selectedThread?.activeTurnId ?? null;

  return (
    <footer className={`${embedded ? "surface-soft ring-1 ring-white/6" : "panel min-w-0"} rounded-[24px] p-4`}>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendTurn();
                }
              }}
              placeholder="Build something..."
              className="min-h-[74px] w-full rounded-[20px] border border-white/8 bg-white/[0.025] px-4 py-3 text-[15px] leading-6"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{selectedThread ? (selectedThread.historyState === "resumed" ? "Replying in this thread" : "Send will resume this thread") : "Send starts a new thread"}</span>
              {activeTurnId && <span>{debug.debugMode ? `Active turn ${activeTurnId.slice(0, 8)}` : "Generation in progress"}</span>}
            </div>
          </div>

          <button
            className="primary-btn rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSend}
            onClick={() => void sendTurn()}
          >
            Send
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => focusControl("model")}>
              {selectedModelMeta?.displayName || model || "Auto model"}
            </button>
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => focusControl("effort")}>
              {effort || selectedModelMeta?.defaultReasoningEffort || "Auto effort"}
            </button>
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => focusControl("approval")}>
              {approvalOptions.find((option) => option.value === approvalPolicy)?.label || "Approval"}
            </button>
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => focusControl("personality")}>
              {personalityOptions.find((option) => option.value === personality)?.label || "Style"}
            </button>
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={() => setShowControls((value) => !value)}>
              {showControls ? "Less" : "More"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(showControls || debug.debugMode) && (
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" disabled={!canSend || !activeTurnId} onClick={() => void steerTurn()}>
                Steer
              </button>
            )}
            <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" disabled={!activeTurnId} onClick={() => void interruptTurn()}>
              Stop
            </button>
            {(showControls || debug.debugMode) && (
              <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" disabled={!snapshot.selectedThreadId} onClick={() => void startReview()}>
                Review
              </button>
            )}
          </div>
        </div>

        {showControls && (
          <div className="grid gap-2 rounded-[20px] bg-white/[0.025] p-3 ring-1 ring-white/6 xl:grid-cols-[minmax(0,1.15fr)_120px_minmax(0,1fr)_150px_140px]">
            <div className="min-w-0">
              <select
                ref={modelRef}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className={`surface-soft w-full rounded-[18px] px-3 py-2 text-sm ${activeControl === "model" ? "ring-1 ring-[#ff7b72]" : ""}`}
                title="Model"
              >
                <option value="">Auto model</option>
                {availableModels.map((entry) => (
                  <option key={entry.id} value={entry.model}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </div>
            <select
              ref={effortRef}
              value={effort}
              onChange={(event) => setEffort(event.target.value as ReasoningEffort | "")}
              className={`surface-soft rounded-[18px] px-3 py-2 text-sm ${activeControl === "effort" ? "ring-1 ring-[#ff7b72]" : ""}`}
              title="Reasoning effort"
            >
              <option value="">Auto effort</option>
              {effortOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div>
              <input
                ref={cwdRef}
                list="cwd-options"
                value={selectedCwd}
                onChange={(event) => setSelectedCwd(event.target.value)}
                placeholder="Working directory"
                className={`surface-soft w-full rounded-[18px] px-3 py-2 text-sm ${activeControl === "cwd" ? "ring-1 ring-[#ff7b72]" : ""}`}
                title="Working directory"
              />
              <datalist id="cwd-options">
                {cwdOptions.map((cwd) => (
                  <option key={cwd} value={cwd} />
                ))}
              </datalist>
            </div>
            <select
              ref={approvalRef}
              value={approvalPolicy as string}
              onChange={(event) => setApprovalPolicy(event.target.value as AskForApproval | "on-request")}
              className={`surface-soft rounded-[18px] px-3 py-2 text-sm ${activeControl === "approval" ? "ring-1 ring-[#ff7b72]" : ""}`}
              title="Approval policy"
            >
              {approvalOptions.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              ref={personalityRef}
              value={personality}
              onChange={(event) => setPersonality(event.target.value as Personality | "pragmatic")}
              className={`surface-soft rounded-[18px] px-3 py-2 text-sm ${activeControl === "personality" ? "ring-1 ring-[#ff7b72]" : ""}`}
              title="Personality"
            >
              {personalityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {composerError && (
          <div className="rounded-[18px] bg-rose-500/10 px-3 py-2 text-sm text-rose-100 ring-1 ring-rose-500/20">
            {composerError}
          </div>
        )}
      </div>
    </footer>
  );
};
