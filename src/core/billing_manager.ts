/**
 * 複数プロジェクトの BillingService を束ねる集約層。
 * 並列にコストを取得し、成功分を合算して AggregatedBilling として返す。
 * 一部プロジェクトが失敗しても残りは表示できるように、Promise.allSettled を使う。
 */

import { BillingCost, BillingService } from "./billing_service";
import { ProjectConfig, projectsEqual } from "./config";
import { Logger } from "./logger";

export interface ProjectCostResult {
  project: ProjectConfig;
  /** 成功時のコスト。失敗なら null */
  cost: BillingCost | null;
  /** 失敗時のエラーメッセージ。成功なら null */
  error: string | null;
}

export interface AggregatedBilling {
  /**
   * 全成功プロジェクトを合算したコスト。
   * 複数通貨が混在する場合は最多出現の通貨で合算し、primaryCurrency にその通貨を入れる。
   */
  total: BillingCost;
  /** 合算に使った代表通貨 */
  primaryCurrency: string;
  /** 合算対象から除外された通貨があるか（複数通貨混在の場合に true） */
  hasMixedCurrency: boolean;
  /** プロジェクトごとの結果（成功・失敗両方） */
  perProject: ProjectCostResult[];
  /** エラーのあったプロジェクト数 */
  errorCount: number;
}

export class BillingManager {
  private services: BillingService[] = [];

  constructor(private readonly logger: Logger) {}

  /**
   * 設定を反映して BillingService 群を再構築する。
   * 設定に変更がなければ何もしない（テーブル発見キャッシュを維持するため）。
   */
  configure(projects: ProjectConfig[]): void {
    const current = this.services.map((s) => s.project);
    if (projectsEqual(current, projects)) {
      return;
    }
    this.services = projects.map((p) => new BillingService(p, this.logger));
  }

  hasProjects(): boolean {
    return this.services.length > 0;
  }

  getProjects(): ProjectConfig[] {
    return this.services.map((s) => s.project);
  }

  /**
   * 全プロジェクトのコストを並列取得して集約する。
   * プロジェクト単位の失敗は AggregatedBilling.perProject に記録され、例外は投げない。
   */
  async fetchAll(): Promise<AggregatedBilling> {
    const settled = await Promise.allSettled(
      this.services.map((s) => s.fetchCurrentMonthCost()),
    );

    const perProject: ProjectCostResult[] = settled.map((result, i) => {
      const project = this.services[i].project;
      if (result.status === "fulfilled") {
        return { project, cost: result.value, error: null };
      }
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      this.logger.error(`Failed to fetch ${project.projectId}`, result.reason);
      return { project, cost: null, error: message };
    });

    return aggregate(perProject);
  }
}

/**
 * プロジェクトごとの結果を1つの AggregatedBilling に合算する。
 * 通貨が混在する場合は最多通貨のみを合算し、hasMixedCurrency を true にする。
 */
function aggregate(results: ProjectCostResult[]): AggregatedBilling {
  const successes = results.filter((r): r is ProjectCostResult & { cost: BillingCost } => r.cost !== null);
  const errorCount = results.length - successes.length;

  if (successes.length === 0) {
    return {
      total: zeroCost("USD"),
      primaryCurrency: "USD",
      hasMixedCurrency: false,
      perProject: results,
      errorCount,
    };
  }

  const primaryCurrency = pickPrimaryCurrency(successes.map((s) => s.cost.currency));
  const matching = successes.filter((s) => s.cost.currency === primaryCurrency);
  const hasMixedCurrency = matching.length !== successes.length;

  const total: BillingCost = {
    currency: primaryCurrency,
    amount: sum(matching, (c) => c.amount),
    amountBeforeCredits: sum(matching, (c) => c.amountBeforeCredits),
    creditsAmount: sum(matching, (c) => c.creditsAmount),
    lastMonthAmount: sum(matching, (c) => c.lastMonthAmount),
    last3MonthsAmount: sum(matching, (c) => c.last3MonthsAmount),
    yearlyAmount: sum(matching, (c) => c.yearlyAmount),
    lastUpdated: new Date(),
  };

  return { total, primaryCurrency, hasMixedCurrency, perProject: results, errorCount };
}

function sum(
  items: Array<ProjectCostResult & { cost: BillingCost }>,
  pick: (c: BillingCost) => number,
): number {
  return items.reduce((acc, it) => acc + pick(it.cost), 0);
}

function pickPrimaryCurrency(currencies: string[]): string {
  const counts = new Map<string, number>();
  for (const c of currencies) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = currencies[0];
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

function zeroCost(currency: string): BillingCost {
  return {
    currency,
    amount: 0,
    amountBeforeCredits: 0,
    creditsAmount: 0,
    lastMonthAmount: 0,
    last3MonthsAmount: 0,
    yearlyAmount: 0,
    lastUpdated: new Date(),
  };
}
