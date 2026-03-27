import { useMemo, useState } from "react";
import { useRuntimeStore } from "../store/useRuntimeStore";

const JsonBlock = ({ value }: { value: unknown }) => (
  <pre className="mono-panel scrollbar max-h-full overflow-auto whitespace-pre-wrap break-words rounded-[20px] p-3 font-mono text-[12px] leading-6 text-slate-100">
    {JSON.stringify(value, null, 2)}
  </pre>
);

export const InspectorPane = ({
  open,
  enabled,
  onOpen,
  onClose,
  isMobile = false,
}: {
  open: boolean;
  enabled: boolean;
  onOpen: () => void;
  onClose: () => void;
  isMobile?: boolean;
}) => {
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

  if (!enabled) {
    return null;
  }

  if (!open) {
    return (
      <>
        <aside className="panel hidden min-w-0 rounded-[28px] lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:items-center lg:justify-between lg:px-2 lg:py-3">
          <div className="flex flex-col items-center gap-3">
            <button className="ghost-btn rounded-full px-3 py-2 text-xs" onClick={onOpen}>
              Debug
            </button>
            <div className="rounded-full bg-white/[0.04] px-3 py-1 text-[10px] tracking-[0.18em] text-slate-400 [writing-mode:vertical-rl]">DEBUG</div>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400">
              {selectedItem ? "item" : "thread"}
            </div>
            <div className="max-w-[24px] text-[10px] text-slate-500 [writing-mode:vertical-rl]">
              {selectedItemId ? selectedItemId.slice(0, 10) : snapshot.selectedThreadId?.slice(0, 10) ?? "inspect"}
            </div>
          </div>
        </aside>
      </>
    );
  }

  const paneBody = (
    <div className={`panel flex min-h-0 min-w-0 flex-col ${isMobile ? "h-full rounded-[24px] p-4" : "rounded-[28px] p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-slate-500">Protocol Inspector</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Debug Inspector</h2>
          <p className="mt-1 text-xs text-slate-500">
            {selectedItem ? `Selected item: ${selectedItem.type}` : selectedThread ? "Inspect current thread state" : "No active thread"}
          </p>
        </div>
        <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {(["runtime", "item", "thread", "events", "unknown"] as const).map((nextTab) => (
          <button
            key={nextTab}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${tab === nextTab ? "primary-btn" : "ghost-btn"}`}
            onClick={() => setTab(nextTab)}
          >
            {nextTab}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="surface-soft rounded-[20px] px-3 py-2">
          <div className="text-[10px] tracking-[0.16em] text-slate-500">Thread</div>
          <div className="mt-1 truncate text-sm text-slate-200">{snapshot.selectedThreadId ?? "None selected"}</div>
        </div>
        <div className="surface-soft rounded-[20px] px-3 py-2">
          <div className="text-[10px] tracking-[0.16em] text-slate-500">Item</div>
          <div className="mt-1 truncate text-sm text-slate-200">{selectedItemId ?? "No item selected"}</div>
        </div>
      </div>

      <div className="scrollbar mt-4 min-h-0 pr-1 lg:flex-1 lg:overflow-y-auto">
        {tab === "runtime" && (
          <section className="space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Runtime snapshot</div>
            <JsonBlock value={snapshot.runtime} />
          </section>
        )}
        {tab === "item" && (
          <section className="space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Selected item raw payload</div>
            <JsonBlock value={selectedItem?.rawItem ?? null} />
          </section>
        )}
        {tab === "thread" && (
          <section className="space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Thread metadata</div>
            <JsonBlock value={selectedThread ?? null} />
          </section>
        )}
        {tab === "events" && (
          <section className="space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">Recent raw events</div>
            <JsonBlock value={snapshot.eventLog} />
          </section>
        )}
        {tab === "unknown" && (
          <section className="space-y-2">
            <div className="text-[11px] tracking-[0.18em] text-rose-300">Unknown methods / item types</div>
            <JsonBlock value={snapshot.unknownEvents} />
          </section>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden min-w-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">{paneBody}</aside>
      <div className="fixed inset-0 z-40 bg-slate-950/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm lg:hidden">
        <div className="h-full">{paneBody}</div>
      </div>
    </>
  );
};
