export type CodexSkillSource = "codexHome" | "agents" | "workspace";

export type CodexSkillScope = "system" | "user" | "workspace";

export interface CodexSkillRootRecord {
  path: string;
  source: CodexSkillSource;
  exists: boolean;
  skillCount: number;
}

export interface CodexSkillRecord {
  id: string;
  name: string;
  path: string;
  source: CodexSkillSource;
  scope: CodexSkillScope;
  summary: string | null;
  hasScripts: boolean;
  hasAssets: boolean;
  hasReferences: boolean;
  modifiedAt: number | null;
}

export interface CodexContextResponse {
  generatedAt: string;
  cwd: string | null;
  codexHome: string;
  roots: CodexSkillRootRecord[];
  skills: CodexSkillRecord[];
}
