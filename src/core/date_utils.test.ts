import { describe, expect, it } from "vitest";
import { getInvoiceMonths } from "./date_utils";

describe("getInvoiceMonths", () => {
  it("年内の月を YYYYMM 形式で算出する", () => {
    const m = getInvoiceMonths(new Date(Date.UTC(2026, 3, 15))); // 2026-04
    expect(m).toEqual({
      current: "202604",
      last: "202603",
      threeMonthsAgo: "202601",
      currentYear: "2026",
    });
  });

  it("年をまたぐ月を正しく算出する（1月基準）", () => {
    const m = getInvoiceMonths(new Date(Date.UTC(2026, 0, 15))); // 2026-01
    expect(m).toEqual({
      current: "202601",
      last: "202512",
      threeMonthsAgo: "202510",
      currentYear: "2026",
    });
  });

  it("3ヶ月前が前年になるケースを正しく算出する（2月基準）", () => {
    const m = getInvoiceMonths(new Date(Date.UTC(2026, 1, 28))); // 2026-02
    expect(m.current).toBe("202602");
    expect(m.last).toBe("202601");
    expect(m.threeMonthsAgo).toBe("202511");
  });

  it("UTC 基準で計算する（ローカルタイムに依存しない）", () => {
    // UTC では 2026-01-01、日本時間では 2026-01-01 09:00 となる境界
    const m = getInvoiceMonths(new Date("2026-01-01T00:00:00Z"));
    expect(m.current).toBe("202601");
    expect(m.currentYear).toBe("2026");
  });
});
