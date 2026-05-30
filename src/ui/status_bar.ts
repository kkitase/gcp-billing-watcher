/**
 * ステータスバーの表示制御。
 * 集約された AggregatedBilling を受け取り、合計をテキスト、内訳を Tooltip に表示する。
 */

import * as vscode from "vscode";
import { parseApiDisabledError } from "../core/api_error";
import { classifyAuthError } from "../core/auth_error";
import { BillingErrorInfo, parseBillingError } from "../core/billing_error";
import { AggregatedBilling } from "../core/billing_manager";
import { Language } from "../core/config";
import { formatCurrency, isZeroDecimalCurrency } from "./formatter";
import { getLabels, resolveLocale } from "./i18n";

const DIVIDER = "─────────────────────";

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.command = "gcpBilling.menu";
    this.item.text = "$(cloud) Google Cloud: --";
    this.item.tooltip = "Google Cloud Billing Watcher";
    this.item.show();
  }

  showLoading(): void {
    this.item.text = "$(sync~spin) Google Cloud: ...";
    this.item.backgroundColor = undefined;
  }

  showError(message: string): void {
    this.item.text = "$(error) Google Cloud: Error";
    this.item.tooltip = `Error: ${message}`;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  }

  showNotConfigured(language: Language): void {
    const labels = getLabels(language);
    this.item.text = `$(gear) Google Cloud: ${labels.notConfigured}`;
    this.item.tooltip = labels.notConfiguredTooltip;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  showAuthRequired(language: Language): void {
    const labels = getLabels(language);
    this.item.text = `$(key) Google Cloud: ${labels.authRequired}`;
    this.item.tooltip = labels.authRequiredTooltip;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  showApiDisabled(apiName: string, projectId: string, language: Language): void {
    const labels = getLabels(language);
    this.item.text = `$(circle-slash) Google Cloud: ${labels.apiDisabled}`;
    this.item.tooltip = labels.apiDisabledTooltip(apiName, projectId);
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  /**
   * BigQuery レイヤのエラー（権限不足 / データセット未存在）専用の表示。
   * 全プロジェクトが同じ理由で失敗したときに使う。
   */
  showBillingError(info: BillingErrorInfo, language: Language): void {
    const labels = getLabels(language);
    const projectId = info.projectId ?? "?";
    const datasetId = info.datasetId ?? "?";
    if (info.kind === "permission_denied") {
      this.item.text = `$(shield) Google Cloud: ${labels.errorShortPermissionDenied}`;
      this.item.tooltip = labels.billingErrorPermissionTooltip(projectId, datasetId);
    } else {
      this.item.text = `$(question) Google Cloud: ${labels.errorShortDatasetNotFound}`;
      this.item.tooltip = labels.billingErrorDatasetNotFoundTooltip(projectId, datasetId);
    }
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  update(aggregated: AggregatedBilling, budget: number, language: Language): void {
    const locale = resolveLocale(language);
    const { total } = aggregated;

    const monthly = formatCurrency(total.amount, total.currency, locale);
    const yearly = formatCurrency(total.yearlyAmount, total.currency, locale);

    const { icon, backgroundColor } = pickSeverity(aggregated, budget);

    this.item.text = `${icon} Google Cloud: ${monthly} / ${yearly}`;
    this.item.tooltip = this.buildTooltip(aggregated, budget, language);
    this.item.backgroundColor = backgroundColor;
  }

  dispose(): void {
    this.item.dispose();
  }

  private buildTooltip(aggregated: AggregatedBilling, budget: number, language: Language): string {
    const labels = getLabels(language);
    const locale = resolveLocale(language);
    const { total, perProject, hasMixedCurrency, errorCount } = aggregated;

    const now = new Date();
    const month = now.getMonth() + 1;
    const lastMonthNum = month === 1 ? 12 : month - 1;

    const fmt = (n: number) => formatCurrency(n, total.currency, locale);

    const lines: string[] = [
      labels.title,
      DIVIDER,
      `💰 ${labels.currentCost}:`,
      `   ${labels.beforeCredits}: ${fmt(total.amountBeforeCredits)}`,
      `   ${labels.credits}: ${fmt(total.creditsAmount)}`,
      `   ${labels.total}: ${fmt(total.amount)}`,
    ];

    if (budget > 0) {
      const ratio = (total.amount / budget) * 100;
      lines.push(`💰 ${labels.budget}: ${fmt(budget)} (${ratio.toFixed(1)}%)`);
    }

    lines.push(
      `📅 ${labels.lastMonth(lastMonthNum)}: ${fmt(total.lastMonthAmount)}`,
      DIVIDER,
      `📊 ${labels.last3Months}: ${fmt(total.last3MonthsAmount)}`,
      `📊 ${labels.yearly(now.getFullYear())}: ${fmt(total.yearlyAmount)}`,
    );

    // プロジェクトが1件より多いときだけ内訳を出す
    if (perProject.length > 1) {
      lines.push(DIVIDER, `📁 ${labels.breakdown}:`);
      for (const r of perProject) {
        if (r.cost) {
          const amount = formatCurrency(r.cost.amount, r.cost.currency, locale);
          lines.push(`   • ${r.project.label}: ${amount}`);
        } else {
          lines.push(`   • ${r.project.label}: ⚠️ ${summarizeError(r.error, language)}`);
        }
      }
    }

    if (hasMixedCurrency) {
      lines.push(DIVIDER, labels.mixedCurrencyWarning);
    }
    if (errorCount > 0) {
      lines.push(labels.errorSuffix(errorCount));
    }

    lines.push(
      DIVIDER,
      `${labels.lastUpdated}: ${total.lastUpdated.toLocaleString(locale)}`,
      labels.clickMenu,
    );
    return lines.join("\n");
  }
}

/**
 * Tooltip の内訳に表示するためにエラーメッセージを短い1行に要約する。
 * 既知のエラー種別は専用ラベルに、未知のメッセージは80文字でトリミングする。
 */
function summarizeError(text: string | null, language: Language): string {
  if (!text) return "error";
  const labels = getLabels(language);

  if (classifyAuthError(text)) return labels.errorShortAuthRequired;
  if (parseApiDisabledError(text)) return labels.errorShortApiDisabled;
  const billing = parseBillingError(text);
  if (billing?.kind === "permission_denied") return labels.errorShortPermissionDenied;
  if (billing?.kind === "dataset_not_found") return labels.errorShortDatasetNotFound;

  // 改行を 1 行に圧縮し、長さを制限する
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length > 80 ? `${flattened.slice(0, 80)}…` : flattened;
}

function pickSeverity(
  aggregated: AggregatedBilling,
  budget: number,
): { icon: string; backgroundColor: vscode.ThemeColor | undefined } {
  const { total, errorCount } = aggregated;

  // 予算設定がある場合はそれを優先
  if (budget > 0) {
    const ratio = total.amount / budget;
    if (ratio >= 1.0) {
      return {
        icon: "$(error)",
        backgroundColor: new vscode.ThemeColor("statusBarItem.errorBackground"),
      };
    }
    if (ratio >= 0.8) {
      return {
        icon: "$(warning)",
        backgroundColor: new vscode.ThemeColor("statusBarItem.warningBackground"),
      };
    }
  } else {
    // 予算未設定時の年間コストベースのフォールバック判定。
    // 閾値は USD 基準（$500 / $100）。ゼロ十進通貨（JPY 等）は桁が大きく異なるため
    // 概ねの為替感に合わせて 100 倍した閾値で判定する。
    const scale = isZeroDecimalCurrency(total.currency) ? 100 : 1;
    if (total.yearlyAmount > 500 * scale) {
      return { icon: "$(error)", backgroundColor: undefined };
    }
    if (total.yearlyAmount > 100 * scale) {
      return { icon: "$(warning)", backgroundColor: undefined };
    }
  }

  // 一部プロジェクトが失敗している場合は警告アイコンだけ出す
  if (errorCount > 0) {
    return { icon: "$(warning)", backgroundColor: undefined };
  }

  return { icon: "$(check)", backgroundColor: undefined };
}
