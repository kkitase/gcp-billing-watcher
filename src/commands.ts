/**
 * コマンド登録の集約。
 * extension.ts からは registerCommands() を1度呼ぶだけで済むようにする。
 */

import * as vscode from "vscode";
import { BillingManager } from "./core/billing_manager";
import { ProjectConfig, loadConfig, saveLegacyProjectId } from "./core/config";
import { Logger } from "./core/logger";
import { getLabels } from "./ui/i18n";

/** ADC 再認証コマンド。1箇所に定義して通知 / コマンド / Tooltip で共有する */
export const ADC_LOGIN_COMMAND = "gcloud auth application-default login";
const ADC_HELP_URL = "https://cloud.google.com/docs/authentication/provide-credentials-adc";

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
 * プロジェクト ID 未設定時のダイアログ。旧 projectId 設定に書き込むことで
 * 設定変更イベント経由で projects へマイグレーションされる。
 */
export async function promptForProjectId(logger: Logger): Promise<void> {
  const suggestedId = detectGcloudProjectId();

  const action = await vscode.window.showWarningMessage(
    "Google Cloud Billing Watcher: プロジェクト ID が設定されていません",
    "設定する",
    "後で",
  );

  if (action !== "設定する") return;

  const projectId = await vscode.window.showInputBox({
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

  if (projectId) {
    await saveLegacyProjectId(projectId);
    logger.info(`プロジェクト ID を設定しました: ${projectId}`);
  }
}

function detectGcloudProjectId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require("child_process");
    return execSync("gcloud config get-value project", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
