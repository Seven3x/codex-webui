import { useEffect, useMemo, useState } from "react";
import { InspectorPane } from "./components/InspectorPane";
import { SettingsPane } from "./components/SettingsPane";
import { ThreadsPane } from "./components/ThreadsPane";
import { TimelinePane } from "./components/TimelinePane";
import { WorkspaceOverviewPane } from "./components/WorkspaceOverviewPane";
import { resolveDebugPreferences } from "./lib/debugPreferences";
import { navigateToRoute, parseAppRoute } from "./lib/routes";
import { useRuntimeStore } from "./store/useRuntimeStore";

type MobilePane = "threads" | "conversation" | "settings";
const desktopMediaQuery = "(min-width: 1024px)";

const App = () => {
  const { connect, socketState, snapshot, selectThread, debugPreferences } = useRuntimeStore();
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => !window.matchMedia(desktopMediaQuery).matches);
  const [lastVisitedThreadId, setLastVisitedThreadId] = useState<string | null>(() => (route.name === "thread" ? route.threadId : null));
  const [mobilePane, setMobilePane] = useState<MobilePane>(() => {
    const initialRoute = parseAppRoute(window.location.pathname);
    if (initialRoute.name === "settings") {
      return "settings";
    }
    if (initialRoute.name === "thread") {
      return "conversation";
    }
    return "threads";
  });
  const debug = useMemo(() => resolveDebugPreferences(debugPreferences), [debugPreferences]);

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopMediaQuery);
    const syncViewport = () => setIsMobileViewport(!mediaQuery.matches);
    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

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
    if (route.name === "thread") {
      setLastVisitedThreadId(route.threadId);
      return;
    }
    if (snapshot.selectedThreadId) {
      setLastVisitedThreadId(snapshot.selectedThreadId);
    }
  }, [route, snapshot.selectedThreadId]);

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

  useEffect(() => {
    if (!isMobileViewport) {
      return;
    }
    if (route.name === "settings") {
      setMobilePane("settings");
      return;
    }
    if (route.name === "thread") {
      setMobilePane("conversation");
      return;
    }
    setMobilePane("threads");
  }, [isMobileViewport, route.name, route.name === "thread" ? route.threadId : null]);

  useEffect(() => {
    if (isMobileViewport && mobilePane !== "conversation") {
      setInspectorOpen(false);
    }
  }, [isMobileViewport, mobilePane]);

  const pageTitle = useMemo(() => {
    if (isMobileViewport) {
      if (mobilePane === "conversation") {
        return "Conversation";
      }
      if (mobilePane === "settings") {
        return "Settings";
      }
      return "Threads";
    }
    if (route.name === "settings") {
      return "Settings";
    }
    if (route.name === "thread") {
      return "Thread Workbench";
    }
    return "Workspace Overview";
  }, [isMobileViewport, mobilePane, route]);

  const pageEyebrow = isMobileViewport
    ? "Mobile workbench"
    : debug.debugMode
      ? "Codex protocol-faithful client"
      : "Conversation workspace";

  const headerBadges = useMemo(() => {
    if (debug.debugMode) {
      return [
        { label: "WS", value: socketState },
        { label: "Runtime", value: snapshot.runtime.connectionState },
        { label: "RPC", value: String(snapshot.runtime.pendingRequests.length) },
        { label: "Approvals", value: String(snapshot.runtime.pendingServerRequests.length) },
      ];
    }

    const badges: Array<{ label: string; value: string }> = [];
    if (snapshot.runtime.connectionState !== "ready") {
      badges.push({ label: "Status", value: snapshot.runtime.connectionState });
    }
    if (snapshot.runtime.pendingServerRequests.length > 0) {
      badges.push({ label: "Approvals", value: String(snapshot.runtime.pendingServerRequests.length) });
    }
    return badges;
  }, [debug.debugMode, snapshot.runtime.connectionState, snapshot.runtime.pendingRequests.length, snapshot.runtime.pendingServerRequests.length, socketState]);

  const showThreadWorkbench = route.name === "thread";
  const showInspectorRail = !isMobileViewport && showThreadWorkbench && debug.debugMode;
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

  const openMobileThreads = () => {
    setMobilePane("threads");
    if (route.name === "settings") {
      navigateToRoute({ name: "workspace" });
    }
  };

  const openMobileConversation = () => {
    const threadId = snapshot.selectedThreadId ?? lastVisitedThreadId;
    if (route.name === "thread") {
      setMobilePane("conversation");
      return;
    }
    if (threadId) {
      navigateToRoute({ name: "thread", threadId });
      return;
    }
    setMobilePane("threads");
  };

  const openMobileSettings = () => {
    navigateToRoute({ name: "settings" });
  };

  const mobileBadges = headerBadges.slice(0, debug.debugMode ? 3 : 2);

  return (
    <main className="flex h-[100dvh] min-h-screen flex-col gap-3 overflow-hidden px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] lg:h-screen lg:p-4">
      {isMobileViewport ? (
        <>
          <header className="panel flex-none rounded-[24px] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">{pageEyebrow}</div>
                <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-50">{pageTitle}</h1>
              </div>
              <div className="flex items-center gap-2">
                {mobilePane === "conversation" && (
                  <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={openMobileThreads}>
                    Threads
                  </button>
                )}
                {mobilePane === "conversation" && showThreadWorkbench && debug.debugMode && (
                  <button className="ghost-btn rounded-full px-3 py-1.5 text-xs" onClick={openInspector}>
                    Debug
                  </button>
                )}
              </div>
            </div>

            {mobileBadges.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {mobileBadges.map((badge) => (
                  <div key={badge.label} className="status-chip">
                    <span className="text-slate-500">{badge.label}</span>
                    <span className="text-slate-200">{badge.value}</span>
                  </div>
                ))}
              </div>
            )}
          </header>

          <section className="min-h-0 flex-1 overflow-hidden">
            {mobilePane === "threads" && <ThreadsPane isMobile />}
            {mobilePane === "conversation" && (
              <TimelinePane
                routeThreadId={route.name === "thread" ? route.threadId : null}
                debug={debug}
                inspectorOpen={inspectorOpen}
                onOpenInspector={openInspector}
                onCloseInspector={() => setInspectorOpen(false)}
                isMobile
                onBackToThreads={openMobileThreads}
              />
            )}
            {mobilePane === "settings" && <SettingsPane isMobile />}
          </section>

          <nav className="panel flex flex-none items-center gap-2 rounded-[24px] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              className={`flex-1 rounded-[18px] px-3 py-2 text-sm font-medium ${mobilePane === "threads" ? "primary-btn" : "ghost-btn"}`}
              onClick={openMobileThreads}
            >
              Threads
            </button>
            <button
              className={`flex-1 rounded-[18px] px-3 py-2 text-sm font-medium ${mobilePane === "conversation" ? "primary-btn" : "ghost-btn"}`}
              disabled={!lastVisitedThreadId && !snapshot.selectedThreadId && route.name !== "thread"}
              onClick={openMobileConversation}
            >
              Conversation
            </button>
            <button
              className={`flex-1 rounded-[18px] px-3 py-2 text-sm font-medium ${mobilePane === "settings" ? "primary-btn" : "ghost-btn"}`}
              onClick={openMobileSettings}
            >
              Settings
            </button>
          </nav>

          {showThreadWorkbench && debug.debugMode && (
            <InspectorPane
              open={inspectorOpen}
              enabled={debug.debugMode}
              onOpen={openInspector}
              onClose={() => setInspectorOpen(false)}
              isMobile
            />
          )}
        </>
      ) : (
        <>
          <header className="panel rounded-[30px] px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-medium tracking-[0.22em] text-slate-500">{pageEyebrow}</div>
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
                </div>

                {headerBadges.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {headerBadges.map((badge) => (
                      <div key={badge.label} className="status-chip">
                        <span className="text-slate-500">{badge.label}</span>
                        <span className="text-slate-200">{badge.value}</span>
                      </div>
                    ))}
                  </div>
                )}
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
        </>
      )}
    </main>
  );
};

export default App;
