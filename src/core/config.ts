/**
 * 拡張機能の設定読み込み。
 * VS Code の WorkspaceConfiguration を単一の型付き ExtensionConfig に正規化する。
 * 旧設定 (gcpBilling.projectId) は自動的に projects[] にマイグレーションされる。
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

/**
 * 新設定 gcpBilling.projects[] を優先し、未設定の場合のみ旧 projectId を fallback として取り込む。
 * これにより既存ユーザーは設定変更なしで動作し続ける。
 */
function normalizeProjects(raw: vscode.WorkspaceConfiguration): ProjectConfig[] {
  const rawProjects = raw.get<unknown[]>("projects", []);
  const fromNew = Array.isArray(rawProjects)
    ? rawProjects.map(parseProjectEntry).filter((p): p is ProjectConfig => p !== null)
    : [];

  if (fromNew.length > 0) {
    return fromNew;
  }

  // 後方互換: 旧単一プロジェクト設定を拾う
  const legacyProjectId = raw.get<string>("projectId", "").trim();
  if (!legacyProjectId) {
    return [];
  }

  return [
    {
      projectId: legacyProjectId,
      datasetId: raw.get<string>("datasetId", DEFAULT_DATASET_ID) || DEFAULT_DATASET_ID,
      credentialsPath: raw.get<string>("credentialsPath", "") || undefined,
      label: legacyProjectId,
    },
  ];
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
 * 旧 projectId をプログラム的に更新するユーティリティ。
 * 初回起動ダイアログからのみ使う想定。
 */
export async function saveLegacyProjectId(projectId: string): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update("projectId", projectId, vscode.ConfigurationTarget.Global);
}
