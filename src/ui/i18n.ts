/**
 * UI 表示言語の解決とラベル辞書。
 * StatusBar / Tooltip の表示テキストはすべてここに集約する。
 */

import * as vscode from "vscode";
import { Language } from "../core/config";

export interface Labels {
  title: string;
  currentCost: string;
  beforeCredits: string;
  credits: string;
  total: string;
  budget: string;
  lastMonth: (month: number) => string;
  last3Months: string;
  yearly: (year: number) => string;
  lastUpdated: string;
  clickMenu: string;
  breakdown: string;
  mixedCurrencyWarning: string;
  errorSuffix: (count: number) => string;
  notConfigured: string;
  notConfiguredTooltip: string;
  authRequired: string;
  authRequiredTooltip: string;
  authNotificationReauth: string;
  authNotificationMissing: string;
  authActionRunInTerminal: string;
  authActionCopyCommand: string;
  authActionOpenHelp: string;
  authCommandCopied: string;
  apiDisabled: string;
  apiDisabledTooltip: (apiName: string, projectId: string) => string;
  apiDisabledNotification: (apiName: string, projectId: string) => string;
  apiDisabledActionEnable: string;
  apiDisabledActionCopyUrl: string;
  apiUrlCopied: string;
  errorShortDatasetNotFound: string;
  errorShortPermissionDenied: string;
  errorShortApiDisabled: string;
  errorShortAuthRequired: string;
  billingErrorPermissionTooltip: (projectId: string, datasetId: string) => string;
  billingErrorDatasetNotFoundTooltip: (projectId: string, datasetId: string) => string;
  billingErrorPermissionNotification: (projectId: string, datasetId: string) => string;
  billingErrorDatasetNotFoundNotification: (projectId: string, datasetId: string) => string;
  billingErrorActionOpenIam: string;
  billingErrorActionOpenSettings: string;
  billingErrorActionOpenHelp: string;
}

export function resolveLocale(language: Language): string {
  if (language === "en") return "en-US";
  if (language === "ja") return "ja-JP";
  return vscode.env.language.startsWith("ja") ? "ja-JP" : "en-US";
}

export function getLabels(language: Language): Labels {
  const isJa = resolveLocale(language) === "ja-JP";
  return isJa ? JA : EN;
}

const JA: Labels = {
  title: "Google Cloud Billing Watcher",
  currentCost: "現在のコスト",
  beforeCredits: "割引前",
  credits: "割引額",
  total: "小計",
  budget: "予算",
  lastMonth: (m) => `${m}月 (確定)`,
  last3Months: "過去3ヶ月",
  yearly: (y) => `${y}年間`,
  lastUpdated: "最終更新",
  clickMenu: "クリックしてメニューを表示",
  breakdown: "プロジェクト別内訳",
  mixedCurrencyWarning: "⚠️ 複数通貨が混在しているため、主要通貨のみを合算しています",
  errorSuffix: (n) => `⚠️ ${n} 件のプロジェクトで取得エラー`,
  notConfigured: "未設定",
  notConfiguredTooltip: "クリックして設定を開く（gcpBilling.projects を設定してください）",
  authRequired: "認証が必要",
  authRequiredTooltip:
    "Google Cloud の認証が切れています。\n`gcloud auth application-default login` を実行してください。\nクリックしてメニューを開けます。",
  authNotificationReauth:
    "Google Cloud の再認証が必要です（RAPT 失効）。`gcloud auth application-default login` を実行してください。",
  authNotificationMissing:
    "Google Cloud の認証情報が読み込めません。`gcloud auth application-default login` を実行してください。",
  authActionRunInTerminal: "ターミナルで実行",
  authActionCopyCommand: "コマンドをコピー",
  authActionOpenHelp: "ヘルプを開く",
  authCommandCopied: "コマンドをクリップボードにコピーしました",
  apiDisabled: "API 未有効",
  apiDisabledTooltip: (apiName, projectId) =>
    `${apiName} がプロジェクト「${projectId}」で有効化されていません。\nクリックしてメニューを開き、有効化ページへアクセスしてください。`,
  apiDisabledNotification: (apiName, projectId) =>
    `${apiName} がプロジェクト「${projectId}」で有効化されていません。Google Cloud コンソールで有効化してください。`,
  apiDisabledActionEnable: "API を有効化",
  apiDisabledActionCopyUrl: "URL をコピー",
  apiUrlCopied: "URL をクリップボードにコピーしました",
  errorShortDatasetNotFound: "データセットが見つかりません",
  errorShortPermissionDenied: "BigQuery 権限が不足",
  errorShortApiDisabled: "API 未有効",
  errorShortAuthRequired: "認証が必要",
  billingErrorPermissionTooltip: (projectId, datasetId) =>
    `BigQuery への権限が不足しています: ${projectId}:${datasetId}\n` +
    `IAM で「BigQuery ジョブユーザー」「BigQuery データ閲覧者」を付与してください。`,
  billingErrorDatasetNotFoundTooltip: (projectId, datasetId) =>
    `データセットが見つかりません: ${projectId}:${datasetId}\n` +
    `gcpBilling.projects の datasetId と Cloud Billing Export の出力先を確認してください。`,
  billingErrorPermissionNotification: (projectId, datasetId) =>
    `${projectId}:${datasetId} に対する BigQuery 権限がありません。IAM で「BigQuery ジョブユーザー」「BigQuery データ閲覧者」を付与してください。`,
  billingErrorDatasetNotFoundNotification: (projectId, datasetId) =>
    `データセット ${projectId}:${datasetId} が見つかりません。datasetId 設定または Cloud Billing Export の出力先を確認してください。`,
  billingErrorActionOpenIam: "IAM コンソールを開く",
  billingErrorActionOpenSettings: "設定を開く",
  billingErrorActionOpenHelp: "ヘルプを開く",
};

const EN: Labels = {
  title: "Google Cloud Billing Watcher",
  currentCost: "Current Cost",
  beforeCredits: "Before Credits",
  credits: "Credits",
  total: "Subtotal",
  budget: "Budget",
  lastMonth: (m) => `Last Month (${m})`,
  last3Months: "Last 3 Months",
  yearly: (y) => `Yearly (${y})`,
  lastUpdated: "Last Updated",
  clickMenu: "Click to show menu",
  breakdown: "Per-project breakdown",
  mixedCurrencyWarning: "⚠️ Multiple currencies detected; aggregating the primary currency only",
  errorSuffix: (n) => `⚠️ ${n} project(s) failed to fetch`,
  notConfigured: "Not Configured",
  notConfiguredTooltip: "Click to open settings (configure gcpBilling.projects)",
  authRequired: "Auth Required",
  authRequiredTooltip:
    "Google Cloud authentication has expired.\nRun `gcloud auth application-default login` in a terminal.\nClick to open the menu.",
  authNotificationReauth:
    "Google Cloud reauthentication required (RAPT expired). Run `gcloud auth application-default login`.",
  authNotificationMissing:
    "Google Cloud credentials could not be loaded. Run `gcloud auth application-default login`.",
  authActionRunInTerminal: "Run in Terminal",
  authActionCopyCommand: "Copy Command",
  authActionOpenHelp: "Open Help",
  authCommandCopied: "Command copied to clipboard",
  apiDisabled: "API Disabled",
  apiDisabledTooltip: (apiName, projectId) =>
    `${apiName} is not enabled for project "${projectId}".\nClick to open the menu and enable the API.`,
  apiDisabledNotification: (apiName, projectId) =>
    `${apiName} is not enabled for project "${projectId}". Enable it in the Google Cloud Console.`,
  apiDisabledActionEnable: "Enable API",
  apiDisabledActionCopyUrl: "Copy URL",
  apiUrlCopied: "URL copied to clipboard",
  errorShortDatasetNotFound: "Dataset not found",
  errorShortPermissionDenied: "BigQuery permission required",
  errorShortApiDisabled: "API disabled",
  errorShortAuthRequired: "Authentication required",
  billingErrorPermissionTooltip: (projectId, datasetId) =>
    `Missing BigQuery permission for ${projectId}:${datasetId}.\n` +
    `Grant 'BigQuery Job User' and 'BigQuery Data Viewer' via IAM.`,
  billingErrorDatasetNotFoundTooltip: (projectId, datasetId) =>
    `Dataset ${projectId}:${datasetId} not found.\n` +
    `Verify gcpBilling.projects datasetId and your Cloud Billing Export destination.`,
  billingErrorPermissionNotification: (projectId, datasetId) =>
    `Missing BigQuery permission for ${projectId}:${datasetId}. Grant 'BigQuery Job User' and 'BigQuery Data Viewer' via IAM.`,
  billingErrorDatasetNotFoundNotification: (projectId, datasetId) =>
    `Dataset ${projectId}:${datasetId} not found. Check the datasetId setting or your Cloud Billing Export destination.`,
  billingErrorActionOpenIam: "Open IAM Console",
  billingErrorActionOpenSettings: "Open Settings",
  billingErrorActionOpenHelp: "Open Help",
};
