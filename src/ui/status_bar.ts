/**
 * ステータスバーの表示制御。
 * 集約された AggregatedBilling を受け取り、合計をテキスト、内訳を Tooltip に表示する。
 */

import * as vscode from "vscode";
import { AggregatedBilling } from "../core/billing_manager";
import { Language } from "../core/config";
import { formatCurrency } from "./formatter";
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
          lines.push(`   • ${r.project.label}: ⚠️ ${r.error ?? "error"}`);
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
    // 予算未設定時の年間コストベースのフォールバック判定
    if (total.yearlyAmount > 500) {
      return { icon: "$(error)", backgroundColor: undefined };
    }
    if (total.yearlyAmount > 100) {
      return { icon: "$(warning)", backgroundColor: undefined };
    }
  }

  // 一部プロジェクトが失敗している場合は警告アイコンだけ出す
  if (errorCount > 0) {
    return { icon: "$(warning)", backgroundColor: undefined };
  }

  return { icon: "$(check)", backgroundColor: undefined };
}
