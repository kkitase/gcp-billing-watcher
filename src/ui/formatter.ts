/**
 * 通貨の表示フォーマット。
 * JPY は少数桁を持たないため特別扱いする。
 */

export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    const isZeroDecimal = currency === "JPY";
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
