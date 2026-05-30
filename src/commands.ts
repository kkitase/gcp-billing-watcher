/**
 * コマンド登録の集約。
 * extension.ts からは registerCommands() を1度呼ぶだけで済むようにする。
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { ApiDisabledInfo } from "./core/api_error";
import { BillingErrorInfo } from "./core/billing_error";
import { BillingManager } from "./core/billing_manager";
import { ProjectConfig, addProjectToConfig, loadConfig } from "./core/config";
import { Logger } from "./core/logger";
import { getLabels } from "./ui/i18n";

/** child_process.exec の Promise 版。execSync と違い拡張ホストをブロックしない */
const execAsync = promisify(exec);

/** ADC 再認証コマンド。1箇所に定義して通知 / コマンド / Tooltip で共有する */
export const ADC_LOGIN_COMMAND = "gcloud auth application-default login";
const ADC_HELP_URL = "https://cloud.google.com/docs/authentication/provide-credentials-adc";
const API_ENABLE_HELP_URL = "https://cloud.google.com/apis/docs/getting-started#enabling_apis";
const BIGQUERY_IAM_HELP_URL = "https://cloud.google.com/bigquery/docs/access-control";
const BILLING_EXPORT_HELP_URL =
  "https://cloud.google.com/billing/docs/how-to/export-data-bigquery-setup";

export interface CommandDeps {
  logger: Logger;
  manager: BillingManager;
  /** 最新設定で再取得して UI を更新するコールバック */
  refresh: () => Promise<void>;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gcpBilling.refresh", async () => {
      deps.logger.info("手動更新がリクエストされました");
      await deps.refresh();
    }),

    vscode.commands.registerCommand("gcpBilling.menu", () => showMenu(deps)),

    vscode.commands.registerCommand("gcpBilling.openConsole", () => openConsole(deps)),

    vscode.commands.registerCommand("gcpBilling.showLogs", () => deps.logger.show()),

    vscode.commands.registerCommand("gcpBilling.runAdcLogin", () => runAdcLoginInTerminal()),
  );
}

/**
 * 統合ターミナルを開いて ADC 再認証コマンドを送り込む。
 * Enter は自動送信せず、ユーザに最終確認させる。
 */
export function runAdcLoginInTerminal(): void {
  const terminal =
    vscode.window.terminals.find((t) => t.name === "Google Cloud Billing Watcher") ??
    vscode.window.createTerminal({ name: "Google Cloud Billing Watcher" });
  terminal.show();
  terminal.sendText(ADC_LOGIN_COMMAND, false);
}

/**
 * 認証エラー検知時の通知。ボタンから再認証手順へ誘導する。
 * 同一エラーが続く間は extension.ts 側で再表示しないよう制御する想定。
 */
export async function showAuthErrorNotification(message: string): Promise<void> {
  const language = loadConfig().language;
  const labels = getLabels(language);

  const choice = await vscode.window.showWarningMessage(
    message,
    labels.authActionRunInTerminal,
    labels.authActionCopyCommand,
    labels.authActionOpenHelp,
  );

  if (choice === labels.authActionRunInTerminal) {
    runAdcLoginInTerminal();
  } else if (choice === labels.authActionCopyCommand) {
    await vscode.env.clipboard.writeText(ADC_LOGIN_COMMAND);
    vscode.window.showInformationMessage(labels.authCommandCopied);
  } else if (choice === labels.authActionOpenHelp) {
    await vscode.env.openExternal(vscode.Uri.parse(ADC_HELP_URL));
  }
}

/**
 * API 未有効化検知時の通知。ボタンから有効化ページに誘導する。
 * 同一 (projectId, apiId) の通知は extension.ts 側で抑制する想定。
 */
export async function showApiDisabledNotification(info: ApiDisabledInfo): Promise<void> {
  const language = loadConfig().language;
  const labels = getLabels(language);

  const choice = await vscode.window.showWarningMessage(
    labels.apiDisabledNotification(info.apiName, info.projectId),
    labels.apiDisabledActionEnable,
    labels.apiDisabledActionCopyUrl,
    labels.authActionOpenHelp,
  );

  if (choice === labels.apiDisabledActionEnable) {
    await vscode.env.openExternal(vscode.Uri.parse(info.enableUrl));
  } else if (choice === labels.apiDisabledActionCopyUrl) {
    await vscode.env.clipboard.writeText(info.enableUrl);
    vscode.window.showInformationMessage(labels.apiUrlCopied);
  } else if (choice === labels.authActionOpenHelp) {
    await vscode.env.openExternal(vscode.Uri.parse(API_ENABLE_HELP_URL));
  }
}

/**
 * BigQuery 層のエラー（権限不足 / データセット未存在）通知。
 * 同一 (kind, projectId, datasetId) の通知は extension.ts 側で抑制する想定。
 */
export async function showBillingErrorNotification(info: BillingErrorInfo): Promise<void> {
  const language = loadConfig().language;
  const labels = getLabels(language);
  const projectId = info.projectId ?? "?";
  const datasetId = info.datasetId ?? "?";

  if (info.kind === "permission_denied") {
    const choice = await vscode.window.showWarningMessage(
      labels.billingErrorPermissionNotification(projectId, datasetId),
      labels.billingErrorActionOpenIam,
      labels.billingErrorActionOpenHelp,
    );
    if (choice === labels.billingErrorActionOpenIam && info.projectId) {
      await vscode.env.openExternal(
        vscode.Uri.parse(`https://console.cloud.google.com/iam-admin/iam?project=${info.projectId}`),
      );
    } else if (choice === labels.billingErrorActionOpenHelp) {
      await vscode.env.openExternal(vscode.Uri.parse(BIGQUERY_IAM_HELP_URL));
    }
    return;
  }

  // dataset_not_found
  const choice = await vscode.window.showWarningMessage(
    labels.billingErrorDatasetNotFoundNotification(projectId, datasetId),
    labels.billingErrorActionOpenSettings,
    labels.billingErrorActionOpenHelp,
  );
  if (choice === labels.billingErrorActionOpenSettings) {
    await vscode.commands.executeCommand("workbench.action.openSettings", "gcpBilling.projects");
  } else if (choice === labels.billingErrorActionOpenHelp) {
    await vscode.env.openExternal(vscode.Uri.parse(BILLING_EXPORT_HELP_URL));
  }
}

async function showMenu(deps: CommandDeps): Promise<void> {
  const items: Array<vscode.QuickPickItem & { action: string }> = [
    { label: "$(sync) 今すぐ更新", action: "refresh" },
    { label: "$(link-external) Google Cloud コンソールを開く", action: "openConsole" },
    { label: "$(gear) 設定を開く", action: "openSettings" },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Google Cloud Billing Watcher",
  });
  if (!selected) return;

  switch (selected.action) {
    case "refresh":
      await deps.refresh();
      break;
    case "openConsole":
      await openConsole(deps);
      break;
    case "openSettings":
      await vscode.commands.executeCommand("workbench.action.openSettings", "gcpBilling");
      break;
  }
}

async function openConsole(deps: CommandDeps): Promise<void> {
  const projects = deps.manager.getProjects();
  if (projects.length === 0) {
    vscode.window.showWarningMessage(
      "Google Cloud Billing Watcher: プロジェクトが設定されていません",
    );
    return;
  }

  const target =
    projects.length === 1 ? projects[0] : await pickProject(projects);
  if (!target) return;

  const url = `https://console.cloud.google.com/billing/reports?project=${target.projectId}`;
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function pickProject(projects: ProjectConfig[]): Promise<ProjectConfig | undefined> {
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({
      label: p.label,
      description: p.projectId,
      project: p,
    })),
    { placeHolder: "Select a project" },
  );
  return picked?.project;
}

/**
 * プロジェクト ID 未設定時のダイアログ。
 * gcloud projects list で取得できればピッカー、失敗時は手入力にフォールバックする。
 * 選んだ projectId は gcpBilling.projects に追記され、設定変更イベント経由で再初期化される。
 */
export async function promptForProjectId(logger: Logger): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    "Google Cloud Billing Watcher: プロジェクト ID が設定されていません",
    "設定する",
    "後で",
  );

  if (action !== "設定する") return;

  const projects = await listGcloudProjects();
  const projectId =
    projects.length > 0 ? await pickProjectIdFromList(projects) : await inputProjectId();

  if (projectId) {
    await addProjectToConfig(projectId);
    logger.info(`プロジェクト ID を設定しました: ${projectId}`);
  }
}

interface GcloudProject {
  projectId: string;
  /** 表示名。`gcloud projects list` の name フィールド */
  name: string;
}

/**
 * gcloud CLI でアクセス可能な GCP プロジェクト一覧を取得する。
 * gcloud 未インストール / 認証未済 / コマンド失敗時は空配列を返す。
 */
async function listGcloudProjects(): Promise<GcloudProject[]> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Google Cloud プロジェクト一覧を取得中...",
      cancellable: false,
    },
    async () => {
      try {
        const { stdout } = await execAsync(
          "gcloud projects list --format=json --sort-by=projectId",
          { maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
        );
        const parsed = JSON.parse(stdout) as Array<{ projectId?: string; name?: string }>;
        return parsed
          .filter(
            (p): p is { projectId: string; name?: string } =>
              typeof p.projectId === "string" && p.projectId.length > 0,
          )
          .map((p) => ({ projectId: p.projectId, name: p.name ?? p.projectId }));
      } catch {
        return [];
      }
    },
  );
}

/**
 * QuickPick でプロジェクトを選ばせる。末尾の「手動で入力」を選んだ場合は InputBox に切り替える。
 */
async function pickProjectIdFromList(projects: GcloudProject[]): Promise<string | undefined> {
  const current = await detectGcloudProjectId();

  type Item = vscode.QuickPickItem & { projectId?: string; manual?: boolean };
  const items: Item[] = projects.map((p) => ({
    label: p.name,
    description: p.projectId,
    detail: p.projectId === current ? "$(check) 現在の gcloud config の project" : undefined,
    projectId: p.projectId,
  }));
  items.push({ label: "$(edit) 手動で入力...", manual: true });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "監視対象のプロジェクトを選択してください",
    matchOnDescription: true,
  });
  if (!selected) return undefined;
  if (selected.manual) return inputProjectId();
  return selected.projectId;
}

async function inputProjectId(): Promise<string | undefined> {
  const suggestedId = await detectGcloudProjectId();
  return await vscode.window.showInputBox({
    prompt: "プロジェクト ID を入力してください",
    placeHolder: "my-project-id",
    value: suggestedId,
    validateInput: (value) => {
      if (!value || value.trim() === "") {
        return "プロジェクト ID を入力してください";
      }
      if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) {
        return "プロジェクト ID の形式が正しくありません";
      }
      return null;
    },
  });
}

async function detectGcloudProjectId(): Promise<string> {
  try {
    const { stdout } = await execAsync("gcloud config get-value project", { timeout: 10000 });
    return stdout.trim();
  } catch {
    return "";
  }
}
