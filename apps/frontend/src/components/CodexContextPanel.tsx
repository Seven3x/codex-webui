import { useEffect, useMemo, useState } from "react";
import type { CodexContextResponse, CodexSkillRecord, ConfigReadResponse } from "@codex-web/shared";
import { fetchCodexContext } from "../lib/api";
import { useRuntimeStore } from "../store/useRuntimeStore";

const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
};

type ConfigOrigin = ConfigReadResponse["origins"][string];

const originLabel = (origin: ConfigOrigin): string =>
  origin ? `${String(origin.name)}@${origin.version}` : "not set";

const scopeTone: Record<CodexSkillRecord["scope"], string> = {
  system: "bg-sky-500/10 text-sky-100 ring-sky-400/20",
  user: "bg-emerald-500/10 text-emerald-100 ring-emerald-400/20",
  workspace: "bg-amber-500/10 text-amber-100 ring-amber-400/20",
};

const MetaPill = ({ children, tone = "bg-white/[0.04] text-slate-300 ring-white/8" }: { children: string; tone?: string }) => (
  <span className={`rounded-full px-2 py-1 text-[10px] ring-1 ${tone}`}>{children}</span>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div>
    <div className="text-sm font-semibold text-slate-100">{title}</div>
    <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
  </div>
);

const InstructionCard = ({
  label,
  value,
  origin,
}: {
  label: string;
  value: string | null | undefined;
  origin: ConfigOrigin;
}) => {
  if (!value?.trim()) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-100">{label}</div>
          <MetaPill>{originLabel(origin)}</MetaPill>
        </div>
        <div className="mt-2 text-sm text-slate-500">No active content.</div>
      </div>
    );
  }

  return (
    <details className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100">{label}</div>
          <div className="mt-2 text-sm leading-6 text-slate-400">{compactText(value, 220)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MetaPill>{originLabel(origin)}</MetaPill>
          <span className="text-xs text-slate-500">Show</span>
        </div>
      </summary>
      <pre className="mono-panel scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[16px] p-3 text-xs text-slate-100">
        {value}
      </pre>
    </details>
  );
};

const SkillCard = ({ skill }: { skill: CodexSkillRecord }) => (
  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-100">{skill.name}</div>
        <div className="mt-1 break-all text-xs text-slate-500">{skill.path}</div>
      </div>
      <MetaPill tone={scopeTone[skill.scope]}>{skill.scope}</MetaPill>
    </div>
    <div className="mt-3 text-sm leading-6 text-slate-400">{skill.summary || "No summary extracted from SKILL.md."}</div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <MetaPill>{skill.source}</MetaPill>
      {skill.hasScripts && <MetaPill>scripts</MetaPill>}
      {skill.hasAssets && <MetaPill>assets</MetaPill>}
      {skill.hasReferences && <MetaPill>references</MetaPill>}
    </div>
  </div>
);

export const CodexContextPanel = () => {
  const { selectedCwd, snapshot, callAction } = useRuntimeStore();
  const [configResponse, setConfigResponse] = useState<ConfigReadResponse | null>(null);
  const [contextResponse, setContextResponse] = useState<CodexContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [config, context] = await Promise.all([
          callAction<ConfigReadResponse>("config.read", {
            includeLayers: true,
            cwd: selectedCwd || null,
          }),
          fetchCodexContext<CodexContextResponse>(selectedCwd || null),
        ]);

        if (cancelled) {
          return;
        }
        setConfigResponse(config);
        setContextResponse(context);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [callAction, selectedCwd, snapshot.runtime.lastReadyAt, snapshot.skillsVersion]);

  const skillGroups = useMemo(() => {
    const skills = contextResponse?.skills ?? [];
    return {
      system: skills.filter((skill) => skill.scope === "system"),
      user: skills.filter((skill) => skill.scope === "user"),
      workspace: skills.filter((skill) => skill.scope === "workspace"),
    };
  }, [contextResponse?.skills]);

  const config = configResponse?.config;
  const origins = configResponse?.origins ?? {};
  const summaryMetrics = [
    { label: "Profile", value: String(config?.profile || "default") },
    { label: "Model", value: String(config?.model || "auto") },
    { label: "Approval", value: String(config?.approval_policy || "default") },
    { label: "Effort", value: String(config?.model_reasoning_effort || "default") },
    { label: "Skills", value: String(contextResponse?.skills.length ?? 0) },
    { label: "Skills Version", value: String(snapshot.skillsVersion) },
  ];

  return (
    <div className="space-y-4">
      <div className="surface-card rounded-3xl p-4">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle title="Codex Context" subtitle="把当前生效的 instructions 和本机 skills 直接投影到页面，不再只看 thread 日志。" />
          {loading && <MetaPill>loading</MetaPill>}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {summaryMetrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{metric.label}</div>
              <div className="mt-2 break-words text-sm font-semibold text-slate-100">{metric.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="mt-4 rounded-2xl bg-rose-500/[0.08] px-3 py-3 text-sm text-rose-100 ring-1 ring-rose-400/20">{error}</div>}

        <div className="mt-4 space-y-3">
          <InstructionCard label="Instructions" value={config?.instructions} origin={origins.instructions} />
          <InstructionCard label="Developer Instructions" value={config?.developer_instructions} origin={origins.developer_instructions} />
          <InstructionCard label="Compact Prompt" value={config?.compact_prompt} origin={origins.compact_prompt} />
        </div>
      </div>

      <div className="surface-card rounded-3xl p-4">
        <SectionTitle title="Installed Skills" subtitle="扫描 `CODEX_HOME/skills`、`~/.agents/skills`，以及当前 workspace 的 `.codex/skills`。" />

        <div className="mt-4 flex flex-wrap gap-2">
          {(contextResponse?.roots ?? []).map((root) => (
            <MetaPill key={`${root.source}:${root.path}`}>{`${root.source}: ${root.exists ? root.skillCount : 0}`}</MetaPill>
          ))}
          {selectedCwd && <MetaPill>{`cwd: ${selectedCwd}`}</MetaPill>}
        </div>

        <div className="mt-4 space-y-4">
          {([
            { label: "System Skills", skills: skillGroups.system },
            { label: "User Skills", skills: skillGroups.user },
            { label: "Workspace Skills", skills: skillGroups.workspace },
          ] as const).map((group) => (
            <div key={group.label}>
              <div className="mb-2 text-sm font-medium text-slate-200">{group.label}</div>
              {group.skills.length > 0 ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {group.skills.map((skill) => (
                    <SkillCard key={`${skill.scope}:${skill.path}`} skill={skill} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 px-3 py-3 text-sm text-slate-500">No skills discovered in this scope.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
