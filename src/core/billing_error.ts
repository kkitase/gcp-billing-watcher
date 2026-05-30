/**
 * BigQuery 層から返るビジネス的なエラー（権限不足・データセット未存在）の分類。
 * UI 層で「どのプロジェクト/データセットで何が起きたか」を案内するために使う。
 */

export type BillingErrorKind = "dataset_not_found" | "permission_denied";

export interface BillingErrorInfo {
  kind: BillingErrorKind;
  /** 例: "vivecoding2" */
  projectId?: string;
  /** 例: "billing_export2" */
  datasetId?: string;
  /** permission_denied のときのみ。例: "bigquery.tables.list" */
  missingPermission?: string;
}

// "Not found: Dataset vivecoding2:billing_export2" 形式
const NOT_FOUND_PATTERN = /Not found:\s*Dataset\s+([a-z][a-z0-9-]+):([\w-]+)/i;

// "Permission bigquery.tables.list denied on dataset vivecoding2:billing_export2" 形式
const PERMISSION_DATASET_PATTERN =
  /Permission\s+([\w.]+)\s+denied\s+on\s+(?:dataset|table)\s+([a-z][a-z0-9-]+):([\w-]+)/i;

// "Permission bigquery.jobs.create denied on project foo-bar" 形式
const PERMISSION_PROJECT_PATTERN =
  /Permission\s+([\w.]+)\s+denied\s+on\s+project\s+([a-z][a-z0-9-]+)/i;

// 上の詳細パターンに合致しない "Access Denied" だけのケースのフォールバック
const ACCESS_DENIED_FALLBACK = /Access Denied/i;

/**
 * エラーから BigQuery 関連エラー情報を抽出する。該当しなければ null。
 */
export function parseBillingError(error: unknown): BillingErrorInfo | null {
  const text = extractText(error);
  if (!text) return null;

  const permDataset = text.match(PERMISSION_DATASET_PATTERN);
  if (permDataset) {
    return {
      kind: "permission_denied",
      missingPermission: permDataset[1],
      projectId: permDataset[2],
      datasetId: permDataset[3],
    };
  }

  const permProject = text.match(PERMISSION_PROJECT_PATTERN);
  if (permProject) {
    return {
      kind: "permission_denied",
      missingPermission: permProject[1],
      projectId: permProject[2],
    };
  }

  const notFoundMatch = text.match(NOT_FOUND_PATTERN);
  if (notFoundMatch) {
    return {
      kind: "dataset_not_found",
      projectId: notFoundMatch[1],
      datasetId: notFoundMatch[2],
    };
  }

  if (ACCESS_DENIED_FALLBACK.test(text)) {
    return { kind: "permission_denied" };
  }

  return null;
}

function extractText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
