import type { ApprovalRecord, ItemRecord, ThreadRecord, TurnRecord } from "@codex-web/shared";

export type WorkbenchLane = "user" | "codex" | "system";

export interface WorkbenchEntry {
  kind: "item" | "approval";
  item?: ItemRecord;
  approval?: ApprovalRecord;
  approvals: ApprovalRecord[];
}

export interface WorkbenchGroup {
  id: string;
  turnId: string;
  lane: WorkbenchLane;
  entries: WorkbenchEntry[];
}

export const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
};

export const threadTitle = (thread: { metadata: Record<string, unknown>; summary: { preview: string } | null; id: string }): string => {
  const explicitName = typeof thread.metadata.name === "string" ? thread.metadata.name.trim() : "";
  if (explicitName) {
    return compactText(explicitName, 120);
  }
  if (thread.summary?.preview) {
    const firstLine = thread.summary.preview.split(/\r?\n/, 1)[0] ?? thread.summary.preview;
    return compactText(firstLine, 120);
  }
  return thread.id;
};

export const extractItemBody = (item: ItemRecord): string => {
  if (item.type === "userMessage") {
    const rawContent = item.rawItem?.content;
    if (Array.isArray(rawContent)) {
      return rawContent
        .map((entry) => {
          if (entry && typeof entry === "object" && "type" in entry && (entry as { type?: unknown }).type === "text") {
            return String((entry as { text?: unknown }).text ?? "");
          }
          return JSON.stringify(entry);
        })
        .join("\n");
    }
  }
  if (item.type === "reasoning") {
    const content = Array.isArray(item.rawItem?.content)
      ? item.rawItem.content.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0).join("\n\n")
      : "";
    if (content) {
      return content;
    }

    const summary = Array.isArray(item.rawItem?.summary)
      ? item.rawItem.summary.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0).join("\n\n")
      : "";
    if (summary) {
      return summary;
    }
  }
  if (item.type === "fileChange" && Array.isArray(item.rawItem?.changes)) {
    return item.rawItem.changes
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return JSON.stringify(entry);
        }
        const record = entry as Record<string, unknown>;
        const path = String(record.path ?? "unknown");
        const kind = String(record.kind ?? "change");
        const diff = typeof record.diff === "string" ? record.diff.trim() : "";
        return diff ? `${kind} ${path}\n${diff}` : `${kind} ${path}`;
      })
      .join("\n\n");
  }
  if (item.type === "webSearch") {
    const action = item.rawItem?.action;
    const actionText =
      action && typeof action === "object"
        ? JSON.stringify(action, null, 2)
        : "";
    return [item.rawItem?.query ? `Query: ${String(item.rawItem.query)}` : "", actionText].filter(Boolean).join("\n\n");
  }
  if (item.type === "imageView") {
    return `Viewed image: ${String(item.rawItem?.path ?? "unknown")}`;
  }
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall" || item.type === "collabAgentToolCall") {
    return item.renderedText || JSON.stringify(item.rawItem, null, 2);
  }
  return item.renderedText || JSON.stringify(item.rawItem, null, 2);
};

const isDialogueItem = (item: ItemRecord): boolean => item.type === "userMessage" || item.type === "agentMessage";

const laneForItem = (item: ItemRecord): WorkbenchLane => {
  if (item.type === "userMessage") {
    return "user";
  }
  if (item.type === "agentMessage") {
    return "codex";
  }
  return "system";
};

export const deriveWorkbenchGroups = (turn: TurnRecord, approvalsById: Record<string, ApprovalRecord>): WorkbenchGroup[] => {
  const groups: WorkbenchGroup[] = [];
  let currentGroup: WorkbenchGroup | null = null;

  const pushGroup = () => {
    if (currentGroup && currentGroup.entries.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = null;
  };

  for (const itemId of turn.itemOrder) {
    const item = turn.items[itemId];
    if (!item) {
      continue;
    }
    const approvals = turn.pendingApprovals
      .map((requestId) => approvalsById[requestId])
      .filter((approval): approval is ApprovalRecord => Boolean(approval) && approval.itemId === item.id);
    const lane = laneForItem(item);
    const entry: WorkbenchEntry = {
      kind: "item",
      item,
      approvals,
    };

    if (isDialogueItem(item)) {
      pushGroup();
      currentGroup = {
        id: `${turn.id}:${item.id}`,
        turnId: turn.id,
        lane,
        entries: [entry],
      };
      continue;
    }

    if (currentGroup && currentGroup.lane === "codex") {
      currentGroup.entries.push(entry);
      continue;
    }

    if (!currentGroup || currentGroup.lane !== "system") {
      pushGroup();
      currentGroup = {
        id: `${turn.id}:${item.id}:system`,
        turnId: turn.id,
        lane: "system",
        entries: [entry],
      };
      continue;
    }

    currentGroup.entries.push(entry);
  }

  const standaloneApprovals = turn.pendingApprovals
    .map((requestId) => approvalsById[requestId])
    .filter((approval): approval is ApprovalRecord => Boolean(approval) && !turn.items[approval.itemId]);

  if (standaloneApprovals.length > 0) {
    if (currentGroup && currentGroup.lane !== "user") {
      currentGroup.entries.push(
        ...standaloneApprovals.map((approval) => ({
          kind: "approval" as const,
          approval,
          approvals: [],
        })),
      );
    } else {
      pushGroup();
      currentGroup = {
        id: `${turn.id}:approvals`,
        turnId: turn.id,
        lane: "system",
        entries: standaloneApprovals.map((approval) => ({
          kind: "approval" as const,
          approval,
          approvals: [],
        })),
      };
    }
  }

  pushGroup();
  return groups;
};

export const threadStats = (thread: ThreadRecord | null) => {
  if (!thread) {
    return {
      turns: 0,
      items: 0,
      approvals: 0,
      unknownItems: 0,
    };
  }

  let items = 0;
  let approvals = 0;
  let unknownItems = 0;
  for (const turnId of thread.turnOrder) {
    const turn = thread.turns[turnId];
    items += turn.itemOrder.length;
    approvals += turn.pendingApprovals.length;
    unknownItems += turn.itemOrder.reduce((count, itemId) => count + (turn.items[itemId]?.isUnknownType ? 1 : 0), 0);
  }

  return {
    turns: thread.turnOrder.length,
    items,
    approvals,
    unknownItems,
  };
};

export const threadHasTurnSummariesWithoutItems = (thread: ThreadRecord | null): boolean => {
  if (!thread || thread.historyState !== "loaded" || thread.turnOrder.length === 0) {
    return false;
  }
  return thread.turnOrder.every((turnId) => (thread.turns[turnId]?.itemOrder.length ?? 0) === 0);
};
