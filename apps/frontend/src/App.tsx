import { useEffect, useMemo, useState } from "react";
import { InspectorPane } from "./components/InspectorPane";
import { SettingsPane } from "./components/SettingsPane";
import { ThreadsPane } from "./components/ThreadsPane";
import { TimelinePane } from "./components/TimelinePane";
import { WorkspaceOverviewPane } from "./components/WorkspaceOverviewPane";
import { navigateToRoute, parseAppRoute } from "./lib/routes";
import { useRuntimeStore } from "./store/useRuntimeStore";

const App = () => {
  const { connect, socketState, snapshot, selectThread } = useRuntimeStore();
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname));

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

  const pageTitle = useMemo(() => {
    if (route.name === "settings") {
      return "Settings";
    }
    if (route.name === "thread") {
      return "Thread Workbench";
    }
    return "Workspace Overview";
  }, [route]);

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4 lg:h-screen lg:overflow-hidden">
      <header className="panel rounded-3xl px-5 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-slate-500">Codex protocol-faithful client</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">{pageTitle}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <button className={`rounded-full px-3 py-1 text-xs ${route.name === "workspace" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "workspace" })}>
              Workspace
            </button>
            {snapshot.selectedThreadId && (
              <button className={`rounded-full px-3 py-1 text-xs ${route.name === "thread" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "thread", threadId: snapshot.selectedThreadId! })}>
                Thread
              </button>
            )}
            <button className={`rounded-full px-3 py-1 text-xs ${route.name === "settings" ? "primary-btn" : "ghost-btn"}`} onClick={() => navigateToRoute({ name: "settings" })}>
              Settings
            </button>
            <span>WS: {socketState}</span>
            <span>Connection: {snapshot.runtime.connectionState}</span>
            <span>Pending RPC: {snapshot.runtime.pendingRequests.length}</span>
            <span>Pending approvals: {snapshot.runtime.pendingServerRequests.length}</span>
          </div>
        </div>
      </header>

      <section className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <ThreadsPane />
        {route.name === "workspace" && <WorkspaceOverviewPane />}
        {route.name === "thread" && <TimelinePane routeThreadId={route.threadId} />}
        {route.name === "settings" && <SettingsPane />}
        <InspectorPane />
      </section>
    </main>
  );
};

export default App;
