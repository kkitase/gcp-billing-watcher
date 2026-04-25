/**
 * 1 GCP プロジェクトに対する課金データ取得ロジック。
 * Cloud Billing Export to BigQuery のテーブルを直接クエリする。
 */

import { GoogleAuth } from "google-auth-library";
import { ProjectConfig } from "./config";
import { getInvoiceMonths } from "./date_utils";
import { Logger } from "./logger";

export interface BillingCost {
  currency: string;
  /** 当月の課金額（割引後） */
  amount: number;
  /** 当月の課金額（割引前） */
  amountBeforeCredits: number;
  /** 当月のクレジット額（負の値になることが多い） */
  creditsAmount: number;
  /** 先月の課金額 */
  lastMonthAmount: number;
  /** 過去3ヶ月の課金額 */
  last3MonthsAmount: number;
  /** 当年の課金額 */
  yearlyAmount: number;
  lastUpdated: Date;
}

interface BigQueryTablesResponse {
  tables?: Array<{ tableReference: { tableId: string } }>;
}

interface BigQueryRow {
  f: Array<{ v: string | null }>;
}

interface BigQueryQueryResponse {
  rows?: BigQueryRow[];
}

const BILLING_TABLE_PREFIXES = [
  "gcp_billing_export_v1",
  "gcp_billing_export_resource_v1",
] as const;

export class BillingService {
  private readonly auth: GoogleAuth;
  private readonly logger: Logger;
  private cachedTableName: string | null = null;

  constructor(
    readonly project: ProjectConfig,
    logger: Logger,
  ) {
    this.logger = logger;
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      ...(project.credentialsPath ? { keyFilename: project.credentialsPath } : {}),
    });
  }

  /**
   * 当月・先月・過去3ヶ月・年間の課金額を1クエリで取得。
   * Cloud Billing Export to BigQuery の前提 (invoice.month = "YYYYMM" 形式) に従う。
   */
  async fetchCurrentMonthCost(): Promise<BillingCost> {
    const client = await this.auth.getClient();
    const tableName = await this.discoverBillingTableName(client);
    const months = getInvoiceMonths();

    const query = this.buildAggregateQuery(tableName, months);
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.project.projectId}/queries`;

    const response = await client.request<BigQueryQueryResponse>({
      url,
      method: "POST",
      data: { query, useLegacySql: false },
    });

    return this.parseRow(response.data.rows?.[0]);
  }

  /**
   * datasetId 内から gcp_billing_export_* テーブルを発見しキャッシュする。
   * テーブル名はアカウントIDで一意に決まるため1インスタンス内でキャッシュ可能。
   */
  private async discoverBillingTableName(
    client: Awaited<ReturnType<GoogleAuth["getClient"]>>,
  ): Promise<string> {
    if (this.cachedTableName) {
      return this.cachedTableName;
    }

    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${this.project.projectId}/datasets/${this.project.datasetId}/tables`;
    const response = await client.request<BigQueryTablesResponse>({ url, method: "GET" });
    const tables = response.data.tables ?? [];

    if (tables.length === 0) {
      throw new Error(`No tables found in ${this.project.datasetId} dataset`);
    }

    const billingTable = tables.find((t) =>
      BILLING_TABLE_PREFIXES.some((p) => t.tableReference.tableId.startsWith(p)),
    );

    if (!billingTable) {
      throw new Error(
        `No billing export table found in ${this.project.datasetId} (pattern: gcp_billing_export_*)`,
      );
    }

    this.cachedTableName = billingTable.tableReference.tableId;
    this.logger.info(`Discovered billing table: ${this.project.projectId}.${this.cachedTableName}`);
    return this.cachedTableName;
  }

  private buildAggregateQuery(tableName: string, m: ReturnType<typeof getInvoiceMonths>): string {
    // cost + credits.amount を1行で表すサブクエリを共通化する
    const netCost = `(cost + (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)))`;
    const table = `\`${this.project.projectId}.${this.project.datasetId}.${tableName}\``;

    return `
      SELECT
        SUM(CASE WHEN invoice.month = '${m.current}' THEN ${netCost} ELSE 0 END) AS monthly_cost,
        SUM(CASE WHEN invoice.month = '${m.last}' THEN ${netCost} ELSE 0 END) AS last_month_cost,
        SUM(CASE WHEN invoice.month >= '${m.threeMonthsAgo}' AND invoice.month <= '${m.current}' THEN ${netCost} ELSE 0 END) AS last_3months_cost,
        SUM(CASE WHEN invoice.month LIKE '${m.currentYear}%' THEN ${netCost} ELSE 0 END) AS yearly_cost,
        currency,
        SUM(CASE WHEN invoice.month = '${m.current}' THEN cost ELSE 0 END) AS monthly_cost_before_credits,
        SUM(CASE WHEN invoice.month = '${m.current}' THEN (SELECT IFNULL(SUM(amount), 0) FROM UNNEST(credits)) ELSE 0 END) AS monthly_credits
      FROM ${table}
      GROUP BY currency
      LIMIT 1
    `;
  }

  private parseRow(row: BigQueryRow | undefined): BillingCost {
    if (!row || !row.f || row.f.length < 7) {
      return emptyCost();
    }
    const num = (i: number) => parseFloat(row.f[i].v ?? "0");
    return {
      amount: num(0),
      lastMonthAmount: num(1),
      last3MonthsAmount: num(2),
      yearlyAmount: num(3),
      currency: row.f[4].v ?? "USD",
      amountBeforeCredits: num(5),
      creditsAmount: num(6),
      lastUpdated: new Date(),
    };
  }
}

function emptyCost(): BillingCost {
  return {
    amount: 0,
    amountBeforeCredits: 0,
    creditsAmount: 0,
    lastMonthAmount: 0,
    last3MonthsAmount: 0,
    yearlyAmount: 0,
    currency: "USD",
    lastUpdated: new Date(),
  };
}
