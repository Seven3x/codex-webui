# Codex Protocol-Faithful Web Client

本项目是一个本地自托管的 Codex App Server Web Client。目标不是模仿聊天应用，而是尽量忠实保留 Codex 原生 `thread / turn / item / approval / streaming` 语义。

## 当前状态

这是一个从零搭出的 MVP+第一轮迭代版本，包含：

- monorepo：`apps/backend` + `apps/frontend` + `packages/shared`
- backend：Node.js + TypeScript + Fastify + ws
- frontend：React + TypeScript + Vite + Zustand + Tailwind
- backend 本地 spawn `codex app-server --listen stdio://`
- backend 启动时自动执行 `codex app-server generate-ts --experimental --out ./generated/codex-schema`
- JSON-RPC request / response / notification / server-initiated request 桥接
- 原生 thread list/read/start/resume/fork/archive
- turn start/steer/interrupt/review.start
- item 流式渲染：
  - `turn/started`
  - `turn/completed`
  - `item/started`
  - `item/completed`
  - `item/agentMessage/delta`
  - `item/commandExecution/outputDelta`
  - `item/fileChange/outputDelta`
  - `thread/status/changed`
  - `skills/changed`
  - `serverRequest/resolved`
- server-initiated approval 内联展示与响应
- PTY terminal：
  - `command/exec`
  - `command/exec/write`
  - `command/exec/resize`
  - `command/exec/terminate`
- Raw Events / Unknown Events / thread event export
- backend 结构化日志与日志轮转
- 子进程退出后的自动重连与线程状态重拉
- 前端刷新后的状态恢复，来源于 backend persisted cache

## 目录结构

```text
.
├── apps
│   ├── backend
│   │   ├── src
│   │   │   ├── config.ts
│   │   │   ├── index.ts
│   │   │   ├── jsonRpc.ts
│   │   │   ├── logger.ts
│   │   │   ├── persistence.ts
│   │   │   └── runtime
│   │   │       └── runtimeManager.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend
│       ├── src
│       │   ├── components
│       │   │   ├── ComposerBar.tsx
│       │   │   ├── InspectorPane.tsx
│       │   │   ├── ThreadsPane.tsx
│       │   │   └── TimelinePane.tsx
│       │   ├── lib
│       │   │   └── api.ts
│       │   ├── store
│       │   │   └── useRuntimeStore.ts
│       │   ├── App.tsx
│       │   ├── index.css
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── postcss.config.cjs
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vite.config.ts
├── generated
│   ├── codex-json-schema
│   └── codex-schema
├── packages
│   └── shared
│       ├── src
│       │   ├── codex.ts
│       │   ├── index.ts
│       │   └── runtime-state.ts
│       ├── package.json
│       └── tsconfig.json
├── data
├── logs
├── package.json
├── tsconfig.base.json
└── README.md
```

## 架构

### Backend

- `RuntimeManager` 是 backend 内部唯一的 app-server runtime manager
- `JsonRpcClient` 负责 stdio JSONL 读写、request id、超时、server request、响应路由
- backend 保存运行态投影缓存：
  - `RuntimeConnection`
  - `ThreadRecord`
  - `TurnRecord`
  - `ItemRecord`
  - `EventLogRecord`
  - `TerminalSessionRecord`
- backend 是前端唯一数据源
- 前端只消费：
  - `GET /api/runtime`
  - `POST /api/action`
  - `WS /ws`

### Frontend

- 响应式 workbench：
  - 桌面端：左 `Threads`，中 `Conversation / Timeline`，右 `Inspector / Raw Events`
  - 移动端：single-pane shell，在 `Threads / Conversation / Settings` 间切换；Debug UI 仅在 Debug Mode 下按需打开
- 底部 composer 调用 `turn/start` / `turn/steer` / `turn/interrupt` / `review/start`
- 不把 assistant bubble 当真相
- 渲染单位是 `thread -> turn -> item`

## 启动

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

默认地址：

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8787`
- websocket: `ws://127.0.0.1:8787/ws`

### 3. 构建

```bash
npm run build
```

## 运行时行为

backend 启动时会：

1. 检查本机 `codex` 是否可用
2. 执行：

```bash
codex app-server generate-ts --experimental --out ./generated/codex-schema
```

3. spawn:

```bash
codex app-server --listen stdio://
```

4. 执行握手：
   - `initialize`
   - `initialized`

5. 完成后主动 `thread/list`
6. 若有 persisted selected thread，则 `thread/read` 恢复历史视图

## 已完成阶段

### 阶段 1：Backend JSON-RPC bridge

已完成：

- stdio child process
- initialize / initialized
- JSON-RPC request / response / notification / server request
- request timeout
- child process exit handling
- server overload note (`-32001`)
- structured logs
- cache persistence

还缺：

- 更细粒度的 request retry/backoff
- 更丰富的 unsupported server request response UI

手动测试：

1. 启动 backend
2. 看 `logs/backend.log`
3. 验证 `generated/codex-schema` 自动刷新
4. 杀掉 app-server 子进程，确认 backend 自动重连

### 阶段 2：Generated schema 接入

已完成：

- `packages/shared/src/codex.ts` 直接引用 `generated/codex-schema`
- request / response / notification 的关键 method map 以生成结果为准

还缺：

- 更多非核心 method 的显式映射

手动测试：

1. 删除 `generated/codex-schema`
2. 重启 backend
3. 确认自动重新生成

### 阶段 3：Thread list/read/start/resume/fork/archive

已完成：

- 左栏 thread 列表
- 搜索 / cwd filter / archived toggle
- new thread / read / resume / fork / archive / export
- backend reconnect 后自动重拉线程列表

还缺：

- 服务端分页 cursor 的更完整 UI 状态展示
- archived thread 的更强区分样式

手动测试：

1. 点击 `New Thread`
2. 点击 `Read`
3. 点击 `Resume`
4. 点击 `Fork`
5. 点击 `Archive`
6. 点击 `Export`

### 阶段 4：Timeline

已完成：

- turn timeline
- item started/completed
- agent message delta
- command output delta
- file change delta
- raw JSON 展开
- diff panel
- unknown notification fallback

还缺：

- 更多 item.type 的定制化样式
- raw response item / reasoning 流的更细渲染

手动测试：

1. 选中 thread
2. `Read` 或 `Resume`
3. 发送消息
4. 观察 turn / item / delta 实时增长

### 阶段 5：Approvals

已完成：

- server-initiated request 收到后挂到 timeline
- command approval / file approval 内联展示
- `accept`
- `acceptForSession`
- `decline`
- `cancel`
- `serverRequest/resolved` 收尾

还缺：

- permissions request / tool user input 的交互表单
- file approval 的结构化 patch 摘要

手动测试：

1. 触发命令审批
2. 在 timeline 中批准 / 拒绝
3. 观察 `serverRequest/resolved`

### 阶段 6：Terminal / Raw Event Inspector

已完成：

- PTY terminal
- stdout/stderr base64 decode
- write / resize / terminate
- raw event inspector
- unknown event 面板

还缺：

- ANSI/xterm 渲染
- 更精细的 terminal disconnected UX

手动测试：

1. 在 PTY Terminal 输入 `bash`
2. 发送 `pwd`
3. 调整 rows/cols 并点 `Resize`
4. 点 `Terminate`

## 手动测试清单

1. 新建 thread
   - 左栏点 `New Thread`
   - 确认 thread 出现在列表

2. 恢复历史 thread
   - 点 `Read`
   - 再点 `Resume`
   - 确认中栏 timeline 有 turn/items

3. 流式 agent 输出
   - 在 composer 输入消息并发送
   - 观察 `item/agentMessage/delta`

4. interrupt
   - turn 进行中点击 `Stop`
   - 确认 UI 收尾

5. steer
   - turn 进行中输入补充文本
   - 点 `Steer`

6. review/start
   - 点 `Code Review`
   - 当前默认 target 为 `uncommittedChanges`

7. command approval
   - 触发需要审批的命令
   - 在 timeline 内联卡片里点 `accept` 或 `decline`

8. file change approval
   - 触发 patch 写入审批
   - 在 timeline 中处理

9. thread shell command
   - 当前版本不会伪造此能力
   - UI 会明确标注 “schema unavailable”

10. PTY terminal
   - 启动 `bash`
   - 输入命令
   - resize
   - terminate

11. 未知事件兜底展示
   - 触发当前前端未识别的 notification 或 item.type
   - 在右栏 `Unknown Methods / Item Types` 查看

12. 前端刷新后恢复
   - 刷新浏览器
   - 确认 thread 列表和选中 thread 恢复

13. app-server 子进程重启后的恢复策略
   - 杀掉 child
   - backend 自动重连
   - 自动重新 initialize
   - 自动重新 thread/list
   - 自动尝试 `thread/read` 恢复选中 thread 历史视图

## Protocol assumptions / TODO

以下点明确按当前 `codex app-server generate-ts --experimental` 结果处理，不做臆测：

- `thread/shellCommand`：
  - 当前生成 schema 未暴露该 request type
  - 本项目没有伪造一个“看起来像”的替代方法
  - UI 明确标注 unavailable

- `thread.status`：
  - 当前生成类型是对象联合，不是简单字符串
  - UI 以 `status.type` 的 label 方式展示

- approval 扩展类型：
  - 当前实现重点支持 command / file change approval
  - 其他 server request 会保留 raw event，不会被吞掉

- PTY terminal：
  - 当前是 plain text terminal view
  - 没有做 ANSI/xterm emulator
  - 但底层仍是 `command/exec` 原生 PTY 流

- `command/exec` 启动命令解析：
  - 当前前端用空格分割为 argv
  - 这只是 UI 输入层简化，不改变底层协议
  - 后续可改为更严谨的 argv 编辑器

## 已知限制

- 已完成 `npm run build`
- 已完成 backend 短时 smoke test，确认可监听 `127.0.0.1:8787` 并完成 app-server 握手
- `thread/shellCommand` 受当前生成 schema 限制未实现
- terminal 还不是完整终端仿真器
- event log 目前保留最近 200 条，全量导出按 thread event trail 导出最近窗口
- 目前只有单 app-server runtime 实例，尚未抽象多 workspace/runtime manager
