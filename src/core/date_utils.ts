/**
 * 課金データ向けの日付ユーティリティ。
 * BigQuery 側の invoice.month は YYYYMM 形式のため、それに揃える。
 */

export interface InvoiceMonths {
  /** 当月 (例: "202604") */
  current: string;
  /** 先月 */
  last: string;
  /** 3ヶ月前 */
  threeMonthsAgo: string;
  /** 現在の年 (YYYY) */
  currentYear: string;
}

/**
 * UTC 基準で当月・先月・3ヶ月前・当年の YYYYMM キーを一括生成する。
 * クエリ内で同じ日付計算が散らばるのを防ぐ。
 */
export function getInvoiceMonths(now: Date = new Date()): InvoiceMonths {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12

  return {
    current: formatYearMonth(year, month),
    last: shiftMonth(year, month, -1),
    threeMonthsAgo: shiftMonth(year, month, -3),
    currentYear: String(year),
  };
}

function shiftMonth(year: number, month: number, delta: number): string {
  // month は 1-12、Date コンストラクタの month は 0-11
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return formatYearMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function formatYearMonth(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}
