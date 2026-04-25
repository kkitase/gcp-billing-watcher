/**
 * Google Cloud Billing Watcher - エントリポイント。
 * 各モジュールの組み立てと定期実行のスケジューリングのみを担当する。
 */

import * as vscode from "vscode";
import { promptForProjectId, registerCommands, showAuthErrorNotification } from "./commands";
import { AuthErrorKind, classifyAuthError } from "./core/auth_error";
import { BillingManager } from "./core/billing_manager";
import { ExtensionConfig, loadConfig } from "./core/config";
import { Logger } from "./core/logger";
import { getLabels } from "./ui/i18n";
import { StatusBarManager } from "./ui/status_bar";

const EXTENSION_NAME = "Google Cloud Billing Watcher";

let logger: Logger;
let statusBar: StatusBarManager;
let manager: BillingManager;
let refreshTimer: NodeJS.Timeout | undefined;
/** 認証エラー通知の重複抑制。同じ種類の警告が連続して出るのを防ぐ */
let lastNotifiedAuthErrorKind: AuthErrorKind = null;

export function activate(context: vscode.ExtensionContext): void {
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gcpBilling")) {
        logger.info("設定が変更されました。再初期化します...");
        initialize();
      }
    }),
  );

  logger.info("拡張機能を起動しています...");
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
  if (!manager.hasProjects()) {
    // UI は initialize 側で showNotConfigured 済み
    return;
  }

  statusBar.showLoading();

  try {
    const aggregated = await manager.fetchAll();

    // 設定の再読み込みはここで1度だけ行う
    const config = loadConfig();

    // 認証エラーは全失敗・部分失敗のどちらでも特別扱いする
    const authKind = detectAuthErrorKind(aggregated.perProject);

    if (aggregated.errorCount === aggregated.perProject.length) {
      // 全失敗。認証エラーなら専用 UI、それ以外は従来の Error 表示
      if (authKind) {
        statusBar.showAuthRequired(config.language);
        maybeNotifyAuthError(authKind, config.language);
      } else {
        const first = aggregated.perProject.find((r) => r.error !== null)?.error ?? "unknown";
        statusBar.showError(first);
      }
      return;
    }

    logSuccess(aggregated, config);
    statusBar.update(aggregated, config.monthlyBudget, config.language);

    // 部分失敗でも認証エラーが含まれていれば1度だけ通知
    if (authKind) {
      maybeNotifyAuthError(authKind, config.language);
    } else {
      // 全プロジェクト健全に戻ったら通知抑制フラグをリセット
      lastNotifiedAuthErrorKind = null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("課金データの取得に失敗しました", error);

    const authKind = classifyAuthError(error);
    if (authKind) {
      const language = loadConfig().language;
      statusBar.showAuthRequired(language);
      maybeNotifyAuthError(authKind, language);
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
