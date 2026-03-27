import { useEffect, useMemo, useState } from "react";
import { InspectorPane } from "./components/InspectorPane";
import { SettingsPane } from "./components/SettingsPane";
import { ThreadsPane } from "./components/ThreadsPane";
import { TimelinePane } from "./components/TimelinePane";
import { WorkspaceOverviewPane } from "./components/WorkspaceOverviewPane";
import { resolveDebugPreferences } from "./lib/debugPreferences";
import { navigateToRoute, parseAppRoute } from "./lib/routes";
import { useRuntimeStore } from "./store/useRuntimeStore";

const App = () => {
  const { connect, socketState, snapshot, selectThread, debugPreferences } = useRuntimeStore();
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const debug = useMemo(() => resolveDebugPreferences(debugPreferences), [debugPreferences]);

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(parseAppRoute(window.location.pathname));
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (route.name === "thread") {
      selectThread(route.threadId);
      return;
    }
    selectThread(null);
  }, [route, selectThread]);

  useEffect(() => {
    if (route.name !== "thread") {
      setInspectorOpen(false);
    }
  }, [route.name]);

  useEffect(() => {
    if (!debug.debugMode) {
      setInspectorOpen(false);
    }
  }, [debug.debugMode]);

  const pageTitle = useMemo(() => {
    if (route.name === "settings") {
      return "Settings";
    }
    if (route.name === "thread") {
      return "Thread Workbench";
    }
    return "Workspace Overview";
  }, [route]);

  const headerBadges = useMemo(() => {
    if (debug.debugMode) {
      return [
        { label: "WS", value: socketState },
        { label: "Runtime", value: snapshot.runtime.connectionState },
        { label: "RPC", value: String(snapshot.runtime.pendingRequests.length) },
        { label: "Approvals", value: String(snapshot.runtime.pendingServerRequests.length) },
      ];
    }

    const badges: Array<{ label: string; value: string }> = [{ label: "Status", value: snapshot.runtime.connectionState }];
    if (snapshot.runtime.pendingServerRequests.length > 0) {
      badges.push({ label: "Approvals", value: String(snapshot.runtime.pendingServerRequests.length) });
    }
    return badges;
  }, [debug.debugMode, snapshot.runtime.connectionState, snapshot.runtime.pendingRequests.length, snapshot.runtime.pendingServerRequests.length, socketState]);

  const showThreadWorkbench = route.name === "thread";
  const showInspectorRail = showThreadWorkbench && debug.debugMode;
  const workbenchLayoutClass = showThreadWorkbench
    ? showInspectorRail && inspectorOpen
      ? "lg:grid-cols-[260px_minmax(0,1fr)_340px] xl:grid-cols-[272px_minmax(0,1fr)_380px]"
      : showInspectorRail
        ? "lg:grid-cols-[260px_minmax(0,1fr)_52px] xl:grid-cols-[272px_minmax(0,1fr)_52px]"
        : "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]"
    : "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]";

  const openInspector = () => {
    if (debug.debugMode) {
      setInspectorOpen(true);
    }
  };

  return (
    <main className="flex min-h-screen flex-col gap-3 p-3 lg:h-screen lg:overflow-hidden lg:p-4">
      <header className="panel rounded-[30px] px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-[0.22em] text-slate-500">Codex protocol-faithful client</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-tight text-slate-50">{pageTitle}</h1>
              {showThreadWorkbench && debug.debugMode && <div className="status-chip text-slate-200">Debug Mode</div>}
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <button className={`rounded-full px-3 py-1.5 text-xs ${route.name === "workspace" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "workspace" })}>
                Workspace
              </button>
              {snapshot.selectedThreadId && (
                <button className={`rounded-full px-3 py-1.5 text-xs ${route.name === "thread" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "thread", threadId: snapshot.selectedThreadId! })}>
                  Thread
                </button>
              )}
              <button className={`rounded-full px-3 py-1.5 text-xs ${route.name === "settings" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "settings" })}>
                Settings
              </button>
              {showThreadWorkbench && debug.debugMode && (
                <button className="ghost-btn rounded-full px-3 py-1.5 text-xs lg:hidden" onClick={openInspector}>
                  Inspector
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {headerBadges.map((badge) => (
                <div key={badge.label} className="status-chip">
                  <span className="text-slate-500">{badge.label}</span>
                  <span className="text-slate-200">{badge.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className={`grid flex-1 gap-3 lg:min-h-0 ${workbenchLayoutClass}`}>
        <ThreadsPane />
        {route.name === "workspace" && <WorkspaceOverviewPane />}
        {route.name === "thread" && (
          <TimelinePane
            routeThreadId={route.threadId}
            debug={debug}
            inspectorOpen={inspectorOpen}
            onOpenInspector={openInspector}
            onCloseInspector={() => setInspectorOpen(false)}
          />
        )}
        {route.name === "settings" && <SettingsPane />}
        {showThreadWorkbench && debug.debugMode && (
          <InspectorPane
            open={inspectorOpen}
            enabled={debug.debugMode}
            onOpen={openInspector}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </section>
    </main>
  );
};

export default App;
