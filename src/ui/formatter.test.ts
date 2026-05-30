import { describe, expect, it } from "vitest";
import { formatCurrency, isZeroDecimalCurrency } from "./formatter";

describe("isZeroDecimalCurrency", () => {
  it("ゼロ十進通貨を判定する（大文字小文字を問わない）", () => {
    expect(isZeroDecimalCurrency("JPY")).toBe(true);
    expect(isZeroDecimalCurrency("jpy")).toBe(true);
    expect(isZeroDecimalCurrency("KRW")).toBe(true);
  });

  it("小数を持つ通貨は false", () => {
    expect(isZeroDecimalCurrency("USD")).toBe(false);
    expect(isZeroDecimalCurrency("EUR")).toBe(false);
  });
});

describe("formatCurrency", () => {
  it("JPY は小数桁を持たない", () => {
    const result = formatCurrency(1000, "JPY", "ja-JP");
    expect(result).toMatch(/1,000/);
    expect(result).not.toMatch(/\.\d/); // 小数点以下の数字を含まない
  });

  it("USD は小数2桁で表示する", () => {
    const result = formatCurrency(1234.5, "USD", "en-US");
    expect(result).toMatch(/1,234\.50/);
  });

  it("不正な通貨コードはフォールバック表記になる", () => {
    // "INVALID" は 3 文字の通貨コードとして ill-formed なので Intl が例外を投げる
    expect(formatCurrency(100, "INVALID", "en-US")).toBe("INVALID 100.00");
  });
});
