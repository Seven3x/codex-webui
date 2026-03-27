import { useRuntimeStore } from "../store/useRuntimeStore";

export const SettingsPane = () => {
  const { snapshot, socketState } = useRuntimeStore();

  return (
    <section className="panel min-w-0 rounded-3xl p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="surface-soft rounded-3xl px-4 py-4">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Settings / Dev</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">Runtime and Protocol Notes</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          这里不伪造“聊天应用设置”。重点展示 runtime 连接状态、协议限制和当前实现边界。
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="surface-card rounded-3xl p-4">
          <div className="text-sm font-semibold text-slate-100">Connection</div>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <div>Frontend WS: {socketState}</div>
            <div>App-server bridge: {snapshot.runtime.connectionState}</div>
            <div>Pending RPC: {snapshot.runtime.pendingRequests.length}</div>
            <div>Pending server requests: {snapshot.runtime.pendingServerRequests.length}</div>
            <div>Version: {snapshot.runtime.serverInfo?.version || "unknown"}</div>
            <div>Platform: {snapshot.runtime.serverInfo?.platform || "unknown"}</div>
            <div>codexHome: {snapshot.runtime.serverInfo?.codexHome || "unknown"}</div>
          </div>
        </section>

        <section className="surface-card rounded-3xl p-4">
          <div className="text-sm font-semibold text-slate-100">Protocol Fidelity</div>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <div>原生 truth source 仍然是 app-server，不是前端本地消息历史。</div>
            <div>中栏只做 view-model 投影，不覆盖 `thread / turn / item / approval` 语义。</div>
            <div>未知 method 和未知 item.type 继续进 Raw / Unknown inspector。</div>
            <div>`command/exec` 已接通；`thread/shellCommand` 是否可用取决于 generate-ts 结果。</div>
          </div>
        </section>
      </div>

      <section className="surface-card mt-4 rounded-3xl p-4">
        <div className="text-sm font-semibold text-slate-100">Recent Notes</div>
        <div className="mt-3 space-y-2 text-sm text-slate-400">
          {(snapshot.notes.length > 0 ? snapshot.notes.slice(-10) : ["No notes yet."]).map((note, index) => (
            <div key={`${note}-${index}`} className="note-panel rounded-2xl px-3 py-2">
              {note}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
};
