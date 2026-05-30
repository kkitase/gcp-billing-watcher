/**
 * Google Cloud Billing Watcher - エントリポイント。
 * 各モジュールの組み立てと定期実行のスケジューリングのみを担当する。
 */

import * as vscode from "vscode";
import {
  promptForProjectId,
  registerCommands,
  showApiDisabledNotification,
  showAuthErrorNotification,
  showBillingErrorNotification,
} from "./commands";
import { ApiDisabledInfo, parseApiDisabledError } from "./core/api_error";
import { AuthErrorKind, classifyAuthError } from "./core/auth_error";
import { BillingErrorInfo, parseBillingError } from "./core/billing_error";
import { BillingManager } from "./core/billing_manager";
import { ExtensionConfig, loadConfig, migrateLegacyConfig } from "./core/config";
import { Logger } from "./core/logger";
import { getLabels } from "./ui/i18n";
import { StatusBarManager } from "./ui/status_bar";

const EXTENSION_NAME = "Google Cloud Billing Watcher";

let logger: Logger;
let statusBar: StatusBarManager;
let manager: BillingManager;
let refreshTimer: NodeJS.Timeout | undefined;
/** fetchAndUpdate の再入防止。定期更新・手動更新・再初期化の並行実行で表示が乱れるのを防ぐ */
let isFetching = false;
/** 認証エラー通知の重複抑制。同じ種類の警告が連続して出るのを防ぐ */
let lastNotifiedAuthErrorKind: AuthErrorKind = null;
/** API 未有効化通知の重複抑制キー ("projectId::apiId")。プロジェクト/API が変われば再通知する */
let lastNotifiedApiDisabledKey: string | null = null;
/** BigQuery エラー通知の重複抑制キー ("kind::projectId::datasetId") */
let lastNotifiedBillingErrorKey: string | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger(EXTENSION_NAME);
  context.subscriptions.push({ dispose: () => logger.dispose() });

  statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  manager = new BillingManager(logger);

  registerCommands(context, {
    logger,
    manager,
    refresh: fetchAndUpdate,
  });

  logger.info("拡張機能を起動しています...");

  // v0.5.0 で UI から廃止した旧設定を新形式に自動移行する。
  // 設定変更リスナーより前に実行することで、移行による update() が
  // onDidChangeConfiguration を発火させ initialize() が二重に走るのを防ぐ。
  try {
    const migrated = await migrateLegacyConfig();
    if (migrated) {
      logger.info("旧設定 (gcpBilling.projectId 系) を gcpBilling.projects へ移行しました");
    }
  } catch (e) {
    logger.error("旧設定のマイグレーションに失敗しました", e);
  }

  // マイグレーション完了後に設定変更リスナーを登録する
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gcpBilling")) {
        logger.info("設定が変更されました。再初期化します...");
        initialize();
      }
    }),
  );

  initialize();
  logger.info("拡張機能の起動が完了しました");
}

export function deactivate(): void {
  clearRefreshTimer();
  logger?.info("拡張機能を終了しました");
}

/**
 * 現在の設定を読み込み、BillingManager と定期実行を設定し直す。
 */
function initialize(): void {
  const config = loadConfig();

  applySslVerificationSetting(config.skipSslVerification);
  clearRefreshTimer();

  if (!manager.hasProjects() && config.projects.length === 0) {
    logger.info("プロジェクトが設定されていません");
    statusBar.showNotConfigured(config.language);
    promptForProjectId(logger);
    return;
  }

  manager.configure(config.projects);

  if (config.projects.length === 0) {
    statusBar.showNotConfigured(config.language);
    return;
  }

  logger.info(
    `監視対象プロジェクト: ${config.projects.map((p) => p.projectId).join(", ")}`,
  );
  logger.info(`更新間隔: ${config.refreshIntervalMinutes} 分`);

  fetchAndUpdate();

  const intervalMs = config.refreshIntervalMinutes * 60 * 1000;
  refreshTimer = setInterval(() => {
    logger.info("定期更新を実行します...");
    fetchAndUpdate();
  }, intervalMs);
}

async function fetchAndUpdate(): Promise<void> {
  // 既に取得処理中なら多重実行しない（定期更新と手動更新・再初期化の競合を防ぐ）
  if (isFetching) {
    logger.info("既に課金データを取得中のため、今回の更新要求はスキップします");
    return;
  }
  isFetching = true;
  try {
    await fetchAndUpdateInner();
  } finally {
    isFetching = false;
  }
}

async function fetchAndUpdateInner(): Promise<void> {
  // 直前が認証エラー状態なら、GoogleAuth のメモリキャッシュを破棄してから再試行する。
  // `gcloud auth application-default login` で refresh_token が更新されても、
  // プロセス内の UserRefreshClient が古いトークンを持ち続けるのを防ぐ。
  if (lastNotifiedAuthErrorKind !== null) {
    logger.info("認証エラー状態から復帰を試行: GoogleAuth クライアントを再生成します");
    manager.resetAuth();
  }

  if (!manager.hasProjects()) {
    // UI は initialize 側で showNotConfigured 済み
    return;
  }

  statusBar.showLoading();

  try {
    const aggregated = await manager.fetchAll();

    // 設定の再読み込みはここで1度だけ行う
    const config = loadConfig();

    // 既知エラーは全失敗・部分失敗のどちらでも特別扱いする。
    // 優先度: reauth_required > credentials_missing > api_disabled > permission_denied > dataset_not_found > その他。
    const authKind = detectAuthErrorKind(aggregated.perProject);
    const apiDisabled = authKind ? null : detectApiDisabled(aggregated.perProject);
    const billingError =
      authKind || apiDisabled ? null : detectBillingError(aggregated.perProject);

    if (aggregated.errorCount === aggregated.perProject.length) {
      if (authKind) {
        statusBar.showAuthRequired(config.language);
        maybeNotifyAuthError(authKind, config.language);
      } else if (apiDisabled) {
        statusBar.showApiDisabled(apiDisabled.apiName, apiDisabled.projectId, config.language);
        maybeNotifyApiDisabled(apiDisabled);
      } else if (billingError) {
        statusBar.showBillingError(billingError, config.language);
        maybeNotifyBillingError(billingError);
      } else {
        const first = aggregated.perProject.find((r) => r.error !== null)?.error ?? "unknown";
        statusBar.showError(first);
      }
      return;
    }

    logSuccess(aggregated, config);
    statusBar.update(aggregated, config.monthlyBudget, config.language);

    // 部分失敗でも既知エラーが含まれていれば1度だけ通知
    if (authKind) {
      maybeNotifyAuthError(authKind, config.language);
    } else if (apiDisabled) {
      maybeNotifyApiDisabled(apiDisabled);
    } else if (billingError) {
      maybeNotifyBillingError(billingError);
    } else {
      // 全プロジェクト健全に戻ったら通知抑制フラグをリセット
      lastNotifiedAuthErrorKind = null;
      lastNotifiedApiDisabledKey = null;
      lastNotifiedBillingErrorKey = null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("課金データの取得に失敗しました", error);

    const authKind = classifyAuthError(error);
    const apiDisabled = authKind ? null : parseApiDisabledError(error);
    const billingError = authKind || apiDisabled ? null : parseBillingError(error);
    const language = loadConfig().language;

    if (authKind) {
      statusBar.showAuthRequired(language);
      maybeNotifyAuthError(authKind, language);
    } else if (apiDisabled) {
      statusBar.showApiDisabled(apiDisabled.apiName, apiDisabled.projectId, language);
      maybeNotifyApiDisabled(apiDisabled);
    } else if (billingError) {
      statusBar.showBillingError(billingError, language);
      maybeNotifyBillingError(billingError);
    } else {
      statusBar.showError(message);
    }
  }
}

/**
 * perProject の error 文字列を走査し、最初に見つかった認証エラー種別を返す。
 * 種別の優先度は reauth_required > credentials_missing。
 */
function detectAuthErrorKind(
  perProject: Array<{ error: string | null }>,
): AuthErrorKind {
  let fallback: AuthErrorKind = null;
  for (const r of perProject) {
    if (!r.error) continue;
    const kind = classifyAuthError(r.error);
    if (kind === "reauth_required") return kind;
    if (kind && !fallback) fallback = kind;
  }
  return fallback;
}

/**
 * 同じ種類の認証エラーを連続で通知しないようにする。
 * 種別が変わったときと、一度成功で抑制が解けたときのみ通知する。
 */
function maybeNotifyAuthError(kind: AuthErrorKind, language: ExtensionConfig["language"]): void {
  if (!kind || kind === lastNotifiedAuthErrorKind) return;
  lastNotifiedAuthErrorKind = kind;

  const labels = getLabels(language);
  const message =
    kind === "reauth_required" ? labels.authNotificationReauth : labels.authNotificationMissing;
  void showAuthErrorNotification(message);
}

/**
 * perProject の error 文字列を走査し、最初に見つかった API 未有効化情報を返す。
 */
function detectApiDisabled(
  perProject: Array<{ error: string | null }>,
): ApiDisabledInfo | null {
  for (const r of perProject) {
    if (!r.error) continue;
    const info = parseApiDisabledError(r.error);
    if (info) return info;
  }
  return null;
}

/**
 * 同じ (projectId, apiId) の API 未有効化通知を連続で出さない。
 * 別プロジェクトや別 API になれば改めて通知する。
 */
function maybeNotifyApiDisabled(info: ApiDisabledInfo): void {
  const key = `${info.projectId}::${info.apiId}`;
  if (key === lastNotifiedApiDisabledKey) return;
  lastNotifiedApiDisabledKey = key;
  void showApiDisabledNotification(info);
}

/**
 * perProject の error から最初に見つかった BigQuery エラーを返す。
 * 複数プロジェクトで異なるエラーが出ている場合、permission_denied を優先する。
 */
function detectBillingError(
  perProject: Array<{ error: string | null }>,
): BillingErrorInfo | null {
  let fallback: BillingErrorInfo | null = null;
  for (const r of perProject) {
    if (!r.error) continue;
    const info = parseBillingError(r.error);
    if (!info) continue;
    if (info.kind === "permission_denied") return info;
    if (!fallback) fallback = info;
  }
  return fallback;
}

/**
 * 同じ (kind, projectId, datasetId) の BigQuery エラー通知を連続で出さない。
 */
function maybeNotifyBillingError(info: BillingErrorInfo): void {
  const key = `${info.kind}::${info.projectId ?? "?"}::${info.datasetId ?? "?"}`;
  if (key === lastNotifiedBillingErrorKey) return;
  lastNotifiedBillingErrorKey = key;
  void showBillingErrorNotification(info);
}

function logSuccess(
  aggregated: ReturnType<BillingManager["fetchAll"]> extends Promise<infer T> ? T : never,
  config: ExtensionConfig,
): void {
  const { total, errorCount } = aggregated;
  logger.info(
    `課金データ取得: ${total.currency} ${total.amount.toFixed(2)} (projects=${aggregated.perProject.length}, errors=${errorCount})`,
  );
  if (config.monthlyBudget > 0) {
    const ratio = ((total.amount / config.monthlyBudget) * 100).toFixed(1);
    logger.info(`予算使用率: ${ratio}%`);
  }
}

/**
 * SSL 検証スキップの反映。設定 OFF 時は環境変数を元に戻す。
 */
function applySslVerificationSetting(skip: boolean): void {
  if (skip) {
    logger.warn("SSL 証明書の検証をスキップします (gcpBilling.skipSslVerification: true)");
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  } else {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
}

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}
