import { access, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, relative } from "node:path";
import type { CodexContextResponse, CodexSkillRecord, CodexSkillRootRecord, CodexSkillScope, CodexSkillSource } from "@codex-web/shared";
import { appConfig } from "../config.js";

const skillFileName = "SKILL.md";
const maxSkillDepth = 4;
const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", ".next", "__pycache__"]);

const rootSpecsFor = (cwd: string | null): Array<{ path: string; source: CodexSkillSource }> => {
  const roots: Array<{ path: string; source: CodexSkillSource }> = [
    { path: resolve(appConfig.codexHome, "skills"), source: "codexHome" },
    { path: resolve(homedir(), ".agents/skills"), source: "agents" },
  ];

  if (cwd) {
    roots.push({ path: resolve(cwd, ".codex/skills"), source: "workspace" });
  }

  return roots;
};

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const summarizeMarkdown = (markdown: string): string | null => {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^#+\s+/gm, "").trim())
    .filter((entry) => !entry.startsWith("```"));

  const summary = paragraphs.find((entry) => !entry.startsWith("- ") && !entry.startsWith("* ") && !entry.startsWith("1. "));
  if (!summary) {
    return null;
  }

  const compact = summary.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }
  return compact.length <= 220 ? compact : `${compact.slice(0, 219)}...`;
};

const skillScopeFor = (source: CodexSkillSource, rootPath: string, skillDir: string): CodexSkillScope => {
  if (source === "workspace") {
    return "workspace";
  }
  const relativePath = relative(rootPath, skillDir).replace(/\\/g, "/");
  return relativePath.startsWith(".system/") ? "system" : "user";
};

const findSkillFiles = async (directory: string, depth = 0): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isFile() && entry.name === skillFileName) {
      files.push(fullPath);
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    if (depth >= maxSkillDepth || ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    files.push(...(await findSkillFiles(fullPath, depth + 1)));
  }

  return files;
};

const readSkillRecord = async (skillFilePath: string, rootPath: string, source: CodexSkillSource): Promise<CodexSkillRecord | null> => {
  try {
    const skillDir = resolve(skillFilePath, "..");
    const [content, fileStat, scriptsExists, assetsExists, referencesExists] = await Promise.all([
      readFile(skillFilePath, "utf8"),
      stat(skillFilePath),
      directoryExists(join(skillDir, "scripts")),
      directoryExists(join(skillDir, "assets")),
      directoryExists(join(skillDir, "references")),
    ]);

    return {
      id: relative(rootPath, skillDir).replace(/\\/g, "/") || basename(skillDir),
      name: basename(skillDir),
      path: skillDir,
      source,
      scope: skillScopeFor(source, rootPath, skillDir),
      summary: summarizeMarkdown(content),
      hasScripts: scriptsExists,
      hasAssets: assetsExists,
      hasReferences: referencesExists,
      modifiedAt: fileStat.mtimeMs,
    };
  } catch {
    return null;
  }
};

const compareSkills = (left: CodexSkillRecord, right: CodexSkillRecord): number => {
  const scopeWeight = { system: 0, user: 1, workspace: 2 } as const;
  return scopeWeight[left.scope] - scopeWeight[right.scope] || left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
};

export const readCodexContext = async (cwd: string | null): Promise<CodexContextResponse> => {
  const roots = rootSpecsFor(cwd);
  const rootRecords: CodexSkillRootRecord[] = [];
  const skillEntries: CodexSkillRecord[] = [];

  for (const root of roots) {
    const exists = await directoryExists(root.path);
    if (!exists) {
      rootRecords.push({
        path: root.path,
        source: root.source,
        exists: false,
        skillCount: 0,
      });
      continue;
    }

    const skillFiles = await findSkillFiles(root.path);
    const records = (await Promise.all(skillFiles.map((skillFile) => readSkillRecord(skillFile, root.path, root.source)))).filter(
      (entry): entry is CodexSkillRecord => Boolean(entry),
    );

    records.sort(compareSkills);
    skillEntries.push(...records);
    rootRecords.push({
      path: root.path,
      source: root.source,
      exists: true,
      skillCount: records.length,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    cwd,
    codexHome: appConfig.codexHome,
    roots: rootRecords,
    skills: skillEntries.sort(compareSkills),
  };
};
