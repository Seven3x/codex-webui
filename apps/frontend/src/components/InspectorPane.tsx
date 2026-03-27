import { useMemo, useState } from "react";
import { useRuntimeStore } from "../store/useRuntimeStore";

const JsonBlock = ({ value }: { value: unknown }) => (
  <pre className="mono-panel scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-3 font-mono text-xs text-slate-100">
    {JSON.stringify(value, null, 2)}
  </pre>
);

export const InspectorPane = () => {
  const { snapshot, selectedItemId } = useRuntimeStore();
  const [tab, setTab] = useState<"runtime" | "item" | "thread" | "events" | "unknown">("runtime");

  const selectedThread = snapshot.selectedThreadId ? snapshot.threads[snapshot.selectedThreadId] : null;
  const selectedItem = useMemo(() => {
    if (!selectedThread || !selectedItemId) {
      return null;
    }
    for (const turnId of selectedThread.turnOrder) {
      const item = selectedThread.turns[turnId]?.items[selectedItemId];
      if (item) {
        return item;
      }
    }
    return null;
  }, [selectedItemId, selectedThread]);

  return (
    <aside className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-50">Inspector</h2>
        <div className="rounded-full bg-slate-900 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
          {tab}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["runtime", "item", "thread", "events", "unknown"] as const).map((nextTab) => (
          <button
            key={nextTab}
            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${tab === nextTab ? "primary-btn" : "ghost-btn"}`}
            onClick={() => setTab(nextTab)}
          >
            {nextTab}
          </button>
        ))}
      </div>
      <div className="scrollbar mt-4 pr-1 lg:flex-1 lg:overflow-y-auto">
        {tab === "runtime" && (
          <section className="surface-card rounded-3xl p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Runtime</div>
            <JsonBlock value={snapshot.runtime} />
          </section>
        )}
        {tab === "item" && (
          <section className="surface-card rounded-3xl p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Selected Item</div>
            <JsonBlock value={selectedItem?.rawItem ?? null} />
          </section>
        )}
        {tab === "thread" && (
          <section className="surface-card rounded-3xl p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Thread Metadata</div>
            <JsonBlock value={selectedThread ?? null} />
          </section>
        )}
        {tab === "events" && (
          <section className="surface-card rounded-3xl p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Recent Raw Events</div>
            <JsonBlock value={snapshot.eventLog} />
          </section>
        )}
        {tab === "unknown" && (
          <section className="rounded-3xl border border-rose-500/20 bg-rose-500/8 p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.24em] text-rose-300">Unknown Methods / Item Types</div>
            <JsonBlock value={snapshot.unknownEvents} />
          </section>
        )}
      </div>
    </aside>
  );
};
