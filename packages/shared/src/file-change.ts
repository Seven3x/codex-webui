export type NormalizedFileChangeKind = "add" | "delete" | "update" | "change";

export interface NormalizedFileChange {
  path: string;
  kind: NormalizedFileChangeKind;
  kindLabel: string;
  movePath: string | null;
  diffText: string;
}

const synthesizeContentDiff = (content: string, prefix: "+" | "-"): string =>
  content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n")
    .trim();

const normalizeKind = (value: unknown): {
  kind: NormalizedFileChangeKind;
  movePath: string | null;
  embeddedDiff: string;
} => {
  let kind: NormalizedFileChangeKind = "change";
  let movePath: string | null = null;
  let embeddedDiff = "";

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "add" || normalized === "delete" || normalized === "update") {
      kind = normalized;
    }
    return { kind, movePath, embeddedDiff };
  }

  if (!value || typeof value !== "object") {
    return { kind, movePath, embeddedDiff };
  }

  const record = value as Record<string, unknown>;
  const rawType = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  if (rawType === "add" || rawType === "delete" || rawType === "update") {
    kind = rawType;
  }

  const rawMovePath = typeof record.move_path === "string"
    ? record.move_path
    : typeof record.movePath === "string"
      ? record.movePath
      : null;
  movePath = rawMovePath && rawMovePath.trim().length > 0 ? rawMovePath : null;

  if (typeof record.unified_diff === "string") {
    embeddedDiff = record.unified_diff.trim();
  } else if (typeof record.unifiedDiff === "string") {
    embeddedDiff = record.unifiedDiff.trim();
  } else if (typeof record.content === "string" && (kind === "add" || kind === "delete")) {
    embeddedDiff = synthesizeContentDiff(record.content, kind === "add" ? "+" : "-");
  }

  return { kind, movePath, embeddedDiff };
};

const labelForKind = (kind: NormalizedFileChangeKind): string => {
  switch (kind) {
    case "add":
      return "Added";
    case "delete":
      return "Deleted";
    case "update":
      return "Updated";
    default:
      return "Changed";
  }
};

export const normalizeFileChanges = (value: unknown): NormalizedFileChange[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      const fallback = typeof entry === "string" ? entry : JSON.stringify(entry);
      return {
        path: "unknown",
        kind: "change" as const,
        kindLabel: labelForKind("change"),
        movePath: null,
        diffText: fallback,
      };
    }

    const record = entry as Record<string, unknown>;
    const pathValue = typeof record.path === "string"
      ? record.path
      : typeof record.file_path === "string"
        ? record.file_path
        : "unknown";

    const kindInfo = normalizeKind(record.kind ?? record.change ?? record.fileChange ?? record.type);
    const directDiff = typeof record.diff === "string"
      ? record.diff.trim()
      : typeof record.unified_diff === "string"
        ? record.unified_diff.trim()
        : typeof record.unifiedDiff === "string"
          ? record.unifiedDiff.trim()
          : "";
    const topLevelContent = typeof record.content === "string" && (kindInfo.kind === "add" || kindInfo.kind === "delete")
      ? synthesizeContentDiff(record.content, kindInfo.kind === "add" ? "+" : "-")
      : "";
    const diffText = directDiff || kindInfo.embeddedDiff || topLevelContent;

    return {
      path: pathValue,
      kind: kindInfo.kind,
      kindLabel: labelForKind(kindInfo.kind),
      movePath: kindInfo.movePath,
      diffText,
    };
  });
};

export const renderNormalizedFileChange = (change: NormalizedFileChange): string => {
  const destination = change.movePath ? ` -> ${change.movePath}` : "";
  return change.diffText
    ? `${change.kindLabel} ${change.path}${destination}\n${change.diffText}`
    : `${change.kindLabel} ${change.path}${destination}`;
};

export const renderFileChanges = (value: unknown): string =>
  normalizeFileChanges(value)
    .map((change) => renderNormalizedFileChange(change))
    .join("\n\n");
