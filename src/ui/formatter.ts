/**
 * 通貨の表示フォーマット。
 * JPY などのゼロ十進通貨は小数桁を持たないため特別扱いする。
 */

// 小数を持たない（最小単位が1である）主要通貨。ISO 4217 のゼロ十進通貨。
const ZERO_DECIMAL_CURRENCIES = new Set([
  "JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD",
  "XOF", "XAF", "XPF", "PYG", "RWF", "UGX", "VUV",
  "GNF", "BIF", "DJF", "KMF",
]);

/**
 * 小数桁を持たない通貨か判定する。
 * フォーマットの小数桁と、金額ベースの閾値スケールの両方で使う。
 */
export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}

export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    const isZeroDecimal = isZeroDecimalCurrency(currency);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
      maximumFractionDigits: isZeroDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
