import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ConfigReadResponse, ModelListResponse } from "@codex-web/shared";
import { resolveDebugPreferences } from "../lib/debugPreferences";
import { useRuntimeStore } from "../store/useRuntimeStore";

const formatTimestamp = (value: number | null | undefined): string => {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(value);
};

const compactIdentifier = (value: string | null | undefined): string => {
  if (!value) {
    return "n/a";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const statusTone = (value: string): string => {
  if (value === "open" || value === "ready") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }
  if (value === "connecting" || value === "initializing" || value === "starting" || value === "reconnecting") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }
  return "border-rose-400/30 bg-rose-500/10 text-rose-100";
};

const protocolFacts = [
  "truth source 仍然是 app-server；前端 snapshot 只是协议投影。",
  "optimistic UI 只存在于 view state，不回写 thread / turn / item 真相。",
  "未知 method 与未知 item.type 继续保留在 raw/unknown 轨道，不静默吞掉。",
  "`command/exec` 已接通；未暴露的方法不能靠 UI 文案伪造能力。",
];

const StatCard = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) => (
  <div className="surface-card rounded-3xl p-4">
    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-slate-50">{value}</div>
    {detail ? <div className="mt-2 text-xs text-slate-500">{detail}</div> : null}
  </div>
);

const KeyValueList = ({ rows }: { rows: Array<{ label: string; value: string | number }> }) => (
  <div className="space-y-2 text-sm text-slate-300">
    {rows.map((row) => (
      <div key={row.label} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-2">
        <span className="text-slate-500">{row.label}</span>
        <span className="min-w-0 break-words text-right text-slate-100">{row.value}</span>
      </div>
    ))}
  </div>
);

const CompactMetricGrid = ({ rows }: { rows: Array<{ label: string; value: string | number }> }) => (
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
    {rows.map((row) => (
      <div key={row.label} className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{row.label}</div>
        <div className="mt-2 break-words text-sm font-semibold text-slate-100">{row.value}</div>
      </div>
    ))}
  </div>
);

const CollapsiblePanel = ({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}) => (
  <details open={defaultOpen} className="surface-card rounded-3xl">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
      <div>
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        {badge !== undefined ? (
          <div className="rounded-full bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
            {badge}
          </div>
        ) : null}
        <div className="text-xs text-slate-500">Toggle</div>
      </div>
    </summary>
    <div className="border-t border-slate-800/80 px-4 py-4">{children}</div>
  </details>
);

const ToggleRow = ({
  label,
  description,
  checked,
  disabled = false,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) => (
  <div className={`flex items-start justify-between gap-4 rounded-2xl border px-3 py-3 ${disabled ? "border-slate-800/60 bg-slate-950/20" : "border-slate-800/80 bg-slate-950/35"}`}>
    <div className="min-w-0">
      <div className="text-sm font-medium text-slate-100">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </div>
    <button
      type="button"
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-xs ${checked ? "primary-btn" : "ghost-btn"} ${disabled ? "opacity-50" : ""}`}
      onClick={onToggle}
    >
      {checked ? "On" : "Off"}
    </button>
  </div>
);

export const SettingsPane = () => {
  const { snapshot, socketState, selectedCwd, callAction, hydrate, debugPreferences, setDebugPreferences } = useRuntimeStore();
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const resolvedDebug = useMemo(() => resolveDebugPreferences(debugPreferences), [debugPreferences]);

  const threads = useMemo(() => snapshot.threadOrder.map((threadId) => snapshot.threads[threadId]).filter(Boolean), [snapshot.threadOrder, snapshot.threads]);

  const totals = useMemo(() => {
    let loaded = 0;
    let resumed = 0;
    let unloaded = 0;
    let activeTurns = 0;
    let items = 0;
    for (const thread of threads) {
      if (thread.historyState === "loaded") {
        loaded += 1;
      } else if (thread.historyState === "resumed") {
        resumed += 1;
      } else {
        unloaded += 1;
      }
      if (thread.activeTurnId) {
        activeTurns += 1;
      }
      for (const turnId of thread.turnOrder) {
        items += thread.turns[turnId]?.itemOrder.length ?? 0;
      }
    }
    return {
      loaded,
      resumed,
      unloaded,
      activeTurns,
      items,
    };
  }, [threads]);

  const recentEvents = useMemo(() => snapshot.eventLog.slice(-12).reverse(), [snapshot.eventLog]);
  const recentNotes = useMemo(() => snapshot.notes.slice(-8).reverse(), [snapshot.notes]);
  const unknownMethodSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of snapshot.unknownEvents) {
      counts.set(record.method, (counts.get(record.method) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((left, right) => right.count - left.count || left.method.localeCompare(right.method))
      .slice(0, 8);
  }, [snapshot.unknownEvents]);

  const runtimeSummary = useMemo(
    () => [
      { label: "Frontend WS", value: socketState },
      { label: "Bridge State", value: snapshot.runtime.connectionState },
      { label: "Pending RPC", value: snapshot.runtime.pendingRequests.length },
      { label: "Pending server requests", value: snapshot.runtime.pendingServerRequests.length },
      { label: "Last started", value: formatTimestamp(snapshot.runtime.lastStartedAt) },
      { label: "Last ready", value: formatTimestamp(snapshot.runtime.lastReadyAt) },
      { label: "CLI version", value: snapshot.runtime.serverInfo?.version || "unknown" },
      { label: "Platform", value: snapshot.runtime.serverInfo?.platform || "unknown" },
      { label: "codexHome", value: snapshot.runtime.serverInfo?.codexHome || "unknown" },
      { label: "Selected cwd", value: selectedCwd || "all workspaces" },
    ],
    [selectedCwd, snapshot.runtime, socketState],
  );

  const runtimePrimarySummary = useMemo(
    () => [
      { label: "Frontend WS", value: socketState },
      { label: "Bridge", value: snapshot.runtime.connectionState },
      { label: "Pending RPC", value: snapshot.runtime.pendingRequests.length },
      { label: "Server Requests", value: snapshot.runtime.pendingServerRequests.length },
      { label: "Last Ready", value: formatTimestamp(snapshot.runtime.lastReadyAt) },
      { label: "Selected cwd", value: selectedCwd || "all workspaces" },
    ],
    [selectedCwd, snapshot.runtime.connectionState, snapshot.runtime.lastReadyAt, snapshot.runtime.pendingRequests.length, snapshot.runtime.pendingServerRequests.length, socketState],
  );

  const projectionSummary = useMemo(
    () => [
      { label: "Threads in snapshot", value: threads.length },
      { label: "Loaded", value: totals.loaded },
      { label: "Resumed", value: totals.resumed },
      { label: "Unloaded", value: totals.unloaded },
      { label: "Active turns", value: totals.activeTurns },
      { label: "Items projected", value: totals.items },
      { label: "Approvals tracked", value: Object.keys(snapshot.approvals).length },
      { label: "PTY sessions", value: Object.keys(snapshot.terminals).length },
      { label: "Recent raw events", value: snapshot.eventLog.length },
      { label: "Unknown records", value: snapshot.unknownEvents.length },
      { label: "Skills version", value: snapshot.skillsVersion },
      { label: "Last snapshot update", value: formatTimestamp(snapshot.lastUpdatedAt) },
    ],
    [snapshot.approvals, snapshot.eventLog.length, snapshot.lastUpdatedAt, snapshot.skillsVersion, snapshot.terminals, snapshot.unknownEvents.length, threads.length, totals],
  );

  const runTool = async (name: string, task: () => Promise<string>) => {
    setToolBusy(name);
    setToolMessage(null);
    try {
      const message = await task();
      setToolMessage(message);
    } catch (error) {
      setToolMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setToolBusy(null);
    }
  };

  return (
    <section className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="surface-soft rounded-3xl px-4 py-4">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Settings / Dev Console</div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">Runtime and Protocol Console</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              这里不是“聊天偏好设置”，而是 runtime 运行态、协议边界、诊断入口和最近 wire activity 的工作台。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${statusTone(socketState)}`}>WS {socketState}</span>
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${statusTone(snapshot.runtime.connectionState)}`}>
              Bridge {snapshot.runtime.connectionState}
            </span>
          </div>
        </div>
      </div>

      <div className="scrollbar mt-4 space-y-4 pr-1 lg:flex-1 lg:overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Threads" value={threads.length} detail={`${totals.loaded} loaded / ${totals.resumed} resumed / ${totals.unloaded} unloaded`} />
          <StatCard label="Active Turns" value={totals.activeTurns} detail={snapshot.selectedThreadId ? `selected ${compactIdentifier(snapshot.selectedThreadId)}` : "no selected thread"} />
          <StatCard label="Unknown Methods" value={snapshot.unknownEvents.length} detail={`${unknownMethodSummary.length} distinct recent methods`} />
          <StatCard label="Pending Work" value={snapshot.runtime.pendingRequests.length + snapshot.runtime.pendingServerRequests.length} detail={`${snapshot.runtime.pendingRequests.length} rpc + ${snapshot.runtime.pendingServerRequests.length} approvals`} />
        </div>

        <section className="surface-card rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Connection Snapshot</div>
              <div className="text-xs text-slate-500">当前 runtime 连接与 bridge 元数据</div>
            </div>
          </div>
          <CompactMetricGrid rows={runtimePrimarySummary} />
          <details className="mt-3 rounded-2xl border border-slate-800/80 bg-slate-950/25">
            <summary className="cursor-pointer list-none px-3 py-3 text-sm text-slate-300">
              Show full connection metadata
            </summary>
            <div className="border-t border-slate-800/80 px-3 py-3">
              <KeyValueList rows={runtimeSummary} />
            </div>
          </details>
        </section>

        <section className="surface-card rounded-3xl p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Conversation UI / Debug</div>
              <div className="mt-1 text-xs text-slate-500">默认保持 conversation-first；打开 Debug Mode 后再逐项恢复 turn、inspect 和 raw 相关能力。</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${resolvedDebug.debugMode ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : "border-slate-700/80 bg-slate-900/60 text-slate-300"}`}>
              {resolvedDebug.debugMode ? "debug on" : "conversation"}
            </span>
          </div>

          <div className="space-y-2">
            <ToggleRow
              label="Debug Mode"
              description="显示调试轨道入口，并允许下面这些协议细节开关生效。"
              checked={debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ debugMode: !debugPreferences.debugMode })}
            />
            <ToggleRow
              label="Show Turn Boundaries"
              description="显示 turn 分隔线、turn 状态与 turn id。"
              checked={debugPreferences.showTurnBoundaries}
              disabled={!debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ showTurnBoundaries: !debugPreferences.showTurnBoundaries })}
            />
            <ToggleRow
              label="Show Item Type Badges"
              description="显示 userMessage、agentMessage、completed 这类类型和状态徽标。"
              checked={debugPreferences.showItemTypeBadges}
              disabled={!debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ showItemTypeBadges: !debugPreferences.showItemTypeBadges })}
            />
            <ToggleRow
              label="Show Inspect Controls"
              description="显示 item 级 Inspect 按钮和选中调试入口。"
              checked={debugPreferences.showInspectControls}
              disabled={!debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ showInspectControls: !debugPreferences.showInspectControls })}
            />
            <ToggleRow
              label="Show Raw Event Controls"
              description="显示 raw payload / export 相关入口，而不是只保留面向对话的摘要。"
              checked={debugPreferences.showRawEventControls}
              disabled={!debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ showRawEventControls: !debugPreferences.showRawEventControls })}
            />
            <ToggleRow
              label="Show Reasoning Blocks"
              description="把 reasoning 从折叠提示恢复成可直接查看的内容块。"
              checked={debugPreferences.showReasoningBlocks}
              disabled={!debugPreferences.debugMode}
              onToggle={() => setDebugPreferences({ showReasoningBlocks: !debugPreferences.showReasoningBlocks })}
            />
          </div>
        </section>

        <CollapsiblePanel
          title="Projection Health"
          subtitle="本地 snapshot 当前承载了多少协议状态"
        >
          <KeyValueList rows={projectionSummary} />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Quick Diagnostics"
          subtitle="轻量探活，不引入新的状态模型"
          badge={toolBusy ?? "ready"}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <button
              className="ghost-btn rounded-2xl px-3 py-2 text-sm"
              onClick={() =>
                void runTool("reload snapshot", async () => {
                  await hydrate();
                  return "Reloaded runtime snapshot from backend.";
                })
              }
            >
              Reload Snapshot
            </button>
            <button
              className="ghost-btn rounded-2xl px-3 py-2 text-sm"
              onClick={() =>
                void runTool("thread list", async () => {
                  const response = await callAction<{ data: Array<{ id: string }>; nextCursor: string | null }>("thread.list", {
                    limit: 20,
                    archived: false,
                    sortKey: "updated_at",
                  });
                  return `thread/list ok: received ${response.data.length} threads${response.nextCursor ? ", more available" : ""}.`;
                })
              }
            >
              Probe Thread List
            </button>
            <button
              className="ghost-btn rounded-2xl px-3 py-2 text-sm"
              onClick={() =>
                void runTool("model list", async () => {
                  const response = await callAction<ModelListResponse>("model.list", {
                    limit: 50,
                    includeHidden: false,
                  });
                  const defaultModel = response.data.find((entry) => entry.isDefault)?.model ?? "none";
                  return `model/list ok: ${response.data.length} models, default ${defaultModel}.`;
                })
              }
            >
              Probe Models
            </button>
            <button
              className="ghost-btn rounded-2xl px-3 py-2 text-sm"
              onClick={() =>
                void runTool("config read", async () => {
                  const response = await callAction<ConfigReadResponse>("config.read", {
                    includeLayers: false,
                    cwd: selectedCwd || null,
                  });
                  return `config/read ok: model ${response.config.model ?? "auto"}, approval ${response.config.approval_policy ?? "default"}.`;
                })
              }
            >
              Probe Config
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3 text-sm text-slate-300">
            {toolMessage || "Run a probe to verify the bridge path without leaving this page."}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Protocol Fidelity"
          subtitle="这页只展示事实和边界，不发明新的会话模型"
        >
          <div className="space-y-2">
            {protocolFacts.map((fact) => (
              <div key={fact} className="note-panel rounded-2xl px-3 py-2 text-sm">
                {fact}
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Unknown Method Summary"
          subtitle="优先看重复出现的 unknown notification / request"
          badge={`${snapshot.unknownEvents.length} records`}
        >
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 scrollbar">
            {unknownMethodSummary.length > 0 ? (
              unknownMethodSummary.map((entry) => (
                <div key={entry.method} className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <code className="min-w-0 break-all text-sm text-slate-100">{entry.method}</code>
                    <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">{entry.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="note-panel rounded-2xl p-4 text-sm">No unknown protocol methods captured in the current snapshot.</div>
            )}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Recent Wire Activity"
          subtitle="来自 event log 的最近协议事件"
          badge={`${snapshot.eventLog.length} total`}
        >
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 scrollbar">
            {recentEvents.length > 0 ? (
              recentEvents.map((record) => (
                <div key={`${record.seq}-${record.timestamp}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    <span>{formatTimestamp(record.timestamp)}</span>
                    <span>{record.direction}</span>
                    <span>{record.kind}</span>
                  </div>
                  <div className="mt-2 break-all font-mono text-sm text-slate-100">{record.method}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>thread {compactIdentifier(record.threadId ?? null)}</span>
                    <span>turn {compactIdentifier(record.turnId ?? null)}</span>
                    <span>item {compactIdentifier(record.itemId ?? null)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="note-panel rounded-2xl p-4 text-sm">No protocol events recorded yet.</div>
            )}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Recent Notes"
          subtitle="保留 runtime notes，但不再让它独占整个 settings 页面"
          badge={snapshot.notes.length}
        >
          <div className="space-y-2 text-sm text-slate-400">
            {recentNotes.length > 0 ? (
              recentNotes.map((note, index) => (
                <div key={`${note}-${index}`} className="note-panel rounded-2xl px-3 py-2">
                  {note}
                </div>
              ))
            ) : (
              <div className="note-panel rounded-2xl px-3 py-2">No notes yet.</div>
            )}
          </div>
        </CollapsiblePanel>
      </div>
    </section>
  );
};
