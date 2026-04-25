/**
 * GoogleAuth / google-auth-library から飛んでくる認証エラーの分類。
 * UI 層が "再ログインを促す" べきかを判断するために使う。
 */

export type AuthErrorKind =
  | "reauth_required" // RAPT 失効。`gcloud auth application-default login` で再認証が必要
  | "credentials_missing" // ADC が存在しない／期限切れトークンのリフレッシュ失敗
  | null;

/**
 * 既知の文字列パターンからエラー種別を分類する。
 * google-auth-library のエラーは Error のメッセージに OAuth レスポンスの JSON が
 * 文字列として埋め込まれることが多いため、メッセージ文字列の部分一致で判定する。
 */
export function classifyAuthError(error: unknown): AuthErrorKind {
  const text = extractText(error).toLowerCase();
  if (!text) return null;

  // RAPT 失効: 組織ポリシーの再認証要求 (Reauth) によるもの
  if (
    text.includes("invalid_rapt") ||
    text.includes("reauth related error") ||
    /invalid_grant.*rapt/.test(text)
  ) {
    return "reauth_required";
  }

  // ADC 自体が無い／refresh token が無効化されている
  if (
    text.includes("could not load the default credentials") ||
    text.includes("could not refresh access token") ||
    text.includes("invalid_grant")
  ) {
    return "credentials_missing";
  }

  return null;
}

export function isAuthError(error: unknown): boolean {
  return classifyAuthError(error) !== null;
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