/**
 * Google API の "API has not been used in project ... before or it is disabled"
 * エラーの検知と情報抽出。UI 層で「API を有効化」を促すために使う。
 */

export interface ApiDisabledInfo {
  /** 例: "BigQuery API" */
  apiName: string;
  /** 例: "bigquery.googleapis.com" */
  apiId: string;
  /** API 未有効化が起きたプロジェクト ID */
  projectId: string;
  /** API 有効化ページの URL */
  enableUrl: string;
}

// API 名は "BigQuery API" や "Cloud Billing API" のように語末が "API" の形をとる。
// プロジェクト ID は GCP の規則 (6-30 文字、英小文字/数字/ハイフン、語頭は文字、語末は英数字)。
const MESSAGE_PATTERN =
  /([A-Za-z][\w\s.-]*?\s+API)\s+has not been used in project\s+([a-z][a-z0-9-]{4,28}[a-z0-9])\s+before or it is disabled/;

const ENABLE_URL_PATTERN =
  /https?:\/\/console\.(?:developers|cloud)\.google\.com\/apis\/api\/([a-z0-9.-]+)\/overview\?project=[a-z][a-z0-9-]+/i;

/**
 * エラーメッセージから API 未有効化情報を抽出する。
 * 該当しなければ null を返す。
 */
export function parseApiDisabledError(error: unknown): ApiDisabledInfo | null {
  const text = extractText(error);
  if (!text) return null;

  const messageMatch = text.match(MESSAGE_PATTERN);
  if (!messageMatch) return null;

  const apiName = messageMatch[1].trim();
  const projectId = messageMatch[2];

  const urlMatch = text.match(ENABLE_URL_PATTERN);
  const apiId = urlMatch ? urlMatch[1] : guessApiIdFromName(apiName);
  const enableUrl = urlMatch
    ? urlMatch[0]
    : `https://console.developers.google.com/apis/api/${apiId}/overview?project=${projectId}`;

  return { apiName, apiId, projectId, enableUrl };
}

export function isApiDisabledError(error: unknown): boolean {
  return parseApiDisabledError(error) !== null;
}

/**
 * URL が抽出できなかったときのフォールバック。
 * "BigQuery API" -> "bigquery.googleapis.com" のように正規化する。
 */
function guessApiIdFromName(apiName: string): string {
  const slug = apiName
    .replace(/\s+API$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return `${slug}.googleapis.com`;
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