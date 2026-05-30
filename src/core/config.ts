/**
 * 拡張機能の設定読み込み。
 * VS Code の WorkspaceConfiguration を単一の型付き ExtensionConfig に正規化する。
 */

import * as vscode from "vscode";

export type Language = "auto" | "en" | "ja";

export interface ProjectConfig {
  projectId: string;
  datasetId: string;
  credentialsPath?: string;
  /** 表示用ラベル。未指定なら projectId をそのまま使う。 */
  label: string;
}

export interface ExtensionConfig {
  projects: ProjectConfig[];
  refreshIntervalMinutes: number;
  monthlyBudget: number;
  language: Language;
  skipSslVerification: boolean;
}

const CONFIG_SECTION = "gcpBilling";
const DEFAULT_DATASET_ID = "billing_export";
const DEFAULT_REFRESH_MINUTES = 30;
const MIN_REFRESH_MINUTES = 5;

export function loadConfig(): ExtensionConfig {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const projects = normalizeProjects(raw);
  const refreshMinutes = raw.get<number>("refreshIntervalMinutes", DEFAULT_REFRESH_MINUTES);

  return {
    projects,
    refreshIntervalMinutes: Math.max(MIN_REFRESH_MINUTES, refreshMinutes),
    monthlyBudget: raw.get<number>("monthlyBudget", 0),
    language: raw.get<Language>("language", "auto"),
    skipSslVerification: raw.get<boolean>("skipSslVerification", false),
  };
}

function normalizeProjects(raw: vscode.WorkspaceConfiguration): ProjectConfig[] {
  const rawProjects = raw.get<unknown[]>("projects", []);
  if (!Array.isArray(rawProjects)) return [];
  return rawProjects.map(parseProjectEntry).filter((p): p is ProjectConfig => p !== null);
}

function parseProjectEntry(entry: unknown): ProjectConfig | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const obj = entry as Record<string, unknown>;
  const projectId = typeof obj.projectId === "string" ? obj.projectId.trim() : "";
  if (!projectId) {
    return null;
  }
  const datasetId =
    typeof obj.datasetId === "string" && obj.datasetId.trim() !== ""
      ? obj.datasetId.trim()
      : DEFAULT_DATASET_ID;
  const credentialsPath =
    typeof obj.credentialsPath === "string" && obj.credentialsPath.trim() !== ""
      ? obj.credentialsPath.trim()
      : undefined;
  const label =
    typeof obj.label === "string" && obj.label.trim() !== "" ? obj.label.trim() : projectId;
  return { projectId, datasetId, credentialsPath, label };
}

/**
 * 設定の単純な同一性チェック。
 * projects が変わったかどうかで BillingService を作り直すかを判断するために使う。
 */
export function projectsEqual(a: ProjectConfig[], b: ProjectConfig[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((p, i) => {
    const q = b[i];
    return (
      p.projectId === q.projectId &&
      p.datasetId === q.datasetId &&
      p.credentialsPath === q.credentialsPath &&
      p.label === q.label
    );
  });
}

/**
 * 選んだ projectId を gcpBilling.projects 配列に追記する。
 * 初回プロンプトおよび「プロジェクト追加」コマンドから使う。
 */
export async function addProjectToConfig(projectId: string): Promise<void> {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const existing = raw.get<unknown[]>("projects", []) ?? [];
  const list = Array.isArray(existing) ? existing : [];
  const next = [...list, { projectId, datasetId: DEFAULT_DATASET_ID, label: projectId }];
  await raw.update("projects", next, vscode.ConfigurationTarget.Global);
}

/**
 * v0.5.0 で UI から廃止した旧 single-project 設定 (gcpBilling.projectId /
 * datasetId / credentialsPath) を新 gcpBilling.projects[] 形式へ自動移行する。
 * 移行後は旧キーを削除して二重保持を防ぐ。
 */
export async function migrateLegacyConfig(): Promise<boolean> {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const legacyProjectId = (raw.get<string>("projectId", "") ?? "").trim();
  const legacyDatasetId = (raw.get<string>("datasetId", "") ?? "").trim();
  const legacyCredentialsPath = (raw.get<string>("credentialsPath", "") ?? "").trim();

  // 旧キーがどれも残っていなければ何もしない
  if (!legacyProjectId && !legacyDatasetId && !legacyCredentialsPath) {
    return false;
  }

  const existingRaw = raw.get<unknown[]>("projects", []) ?? [];
  const existing = Array.isArray(existingRaw) ? existingRaw : [];

  // 新 projects が未設定で旧 projectId がある場合のみエントリを作成する
  if (existing.length === 0 && legacyProjectId) {
    const newEntry: Record<string, string> = {
      projectId: legacyProjectId,
      datasetId: legacyDatasetId || DEFAULT_DATASET_ID,
      label: legacyProjectId,
    };
    if (legacyCredentialsPath) newEntry.credentialsPath = legacyCredentialsPath;
    await raw.update("projects", [newEntry], vscode.ConfigurationTarget.Global);
  }

  // 旧キーをクリア。package.json から登録が消えていても settings.json 上の値は削除される。
  for (const key of ["projectId", "datasetId", "credentialsPath"] as const) {
    try {
      await raw.update(key, undefined, vscode.ConfigurationTarget.Global);
    } catch {
      // 登録解除済みでも続行する
    }
  }
  return true;
}
