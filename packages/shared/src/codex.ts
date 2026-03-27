import type {
  ClientNotification,
  ClientRequest,
  InitializeParams,
  InitializeResponse,
  ServerNotification,
  ServerRequest,
} from "../../../generated/codex-schema";
import type {
  AgentMessageDeltaNotification,
  CommandExecOutputDeltaNotification,
  CommandExecParams,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeOutputDeltaNotification,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  ItemCompletedNotification,
  ItemStartedNotification,
  ReviewStartParams,
  ReviewStartResponse,
  ServerRequestResolvedNotification,
  SkillsChangedNotification,
  Thread,
  ThreadArchiveParams,
  ThreadArchiveResponse,
  ThreadForkParams,
  ThreadForkResponse,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadStatusChangedNotification,
  Turn,
  TurnCompletedNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnStartedNotification,
  TurnSteerParams,
  TurnSteerResponse,
} from "../../../generated/codex-schema/v2";

export type { ClientNotification, ClientRequest, InitializeParams, InitializeResponse, ServerNotification, ServerRequest };
export type {
  AgentMessageDeltaNotification,
  CommandExecOutputDeltaNotification,
  CommandExecParams,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeOutputDeltaNotification,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  ItemCompletedNotification,
  ItemStartedNotification,
  ReviewStartParams,
  ReviewStartResponse,
  ServerRequestResolvedNotification,
  SkillsChangedNotification,
  Thread,
  ThreadArchiveParams,
  ThreadArchiveResponse,
  ThreadForkParams,
  ThreadForkResponse,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadStatusChangedNotification,
  Turn,
  TurnCompletedNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnStartedNotification,
  TurnSteerParams,
  TurnSteerResponse,
};

export type AppServerRequestMap = {
  initialize: { params: InitializeParams; result: InitializeResponse };
  "thread/list": { params: ThreadListParams; result: ThreadListResponse };
  "thread/read": { params: ThreadReadParams; result: ThreadReadResponse };
  "thread/start": { params: ThreadStartParams; result: ThreadStartResponse };
  "thread/resume": { params: ThreadResumeParams; result: ThreadResumeResponse };
  "thread/fork": { params: ThreadForkParams; result: ThreadForkResponse };
  "thread/archive": { params: ThreadArchiveParams; result: ThreadArchiveResponse };
  "turn/start": { params: TurnStartParams; result: TurnStartResponse };
  "turn/steer": { params: TurnSteerParams; result: TurnSteerResponse };
  "turn/interrupt": { params: TurnInterruptParams; result: TurnInterruptResponse };
  "review/start": { params: ReviewStartParams; result: ReviewStartResponse };
  "command/exec": { params: CommandExecParams; result: CommandExecResponse };
  "command/exec/write": { params: CommandExecWriteParams; result: CommandExecWriteResponse };
  "command/exec/resize": { params: CommandExecResizeParams; result: CommandExecResizeResponse };
  "command/exec/terminate": { params: CommandExecTerminateParams; result: CommandExecTerminateResponse };
};

export type AppServerRequestMethod = keyof AppServerRequestMap;

export type AppServerServerRequestMap = {
  "item/commandExecution/requestApproval": {
    params: CommandExecutionRequestApprovalParams;
    result: CommandExecutionRequestApprovalResponse;
  };
  "item/fileChange/requestApproval": {
    params: FileChangeRequestApprovalParams;
    result: FileChangeRequestApprovalResponse;
  };
};

export type AppServerServerRequestMethod = keyof AppServerServerRequestMap;

export const KNOWN_ITEM_TYPES = new Set([
  "userMessage",
  "agentMessage",
  "plan",
  "reasoning",
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "collabAgentToolCall",
  "webSearch",
  "imageView",
  "imageGeneration",
  "enteredReviewMode",
  "exitedReviewMode",
  "contextCompaction",
]);

export const STREAMING_NOTIFICATION_METHODS = new Set([
  "item/agentMessage/delta",
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
  "command/exec/outputDelta",
]);

