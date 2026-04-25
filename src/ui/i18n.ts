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
};
