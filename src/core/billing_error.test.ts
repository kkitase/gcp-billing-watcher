import { describe, expect, it } from "vitest";
import { parseBillingError } from "./billing_error";

describe("parseBillingError", () => {
  it("dataset/table への権限不足を抽出する", () => {
    const info = parseBillingError(
      "Permission bigquery.tables.list denied on dataset vivecoding2:billing_export2",
    );
    expect(info).toEqual({
      kind: "permission_denied",
      missingPermission: "bigquery.tables.list",
      projectId: "vivecoding2",
      datasetId: "billing_export2",
    });
  });

  it("project への権限不足を抽出する（datasetId なし）", () => {
    const info = parseBillingError(
      "Permission bigquery.jobs.create denied on project foo-bar",
    );
    expect(info).toEqual({
      kind: "permission_denied",
      missingPermission: "bigquery.jobs.create",
      projectId: "foo-bar",
    });
  });

  it("データセット未存在を抽出する", () => {
    const info = parseBillingError("Not found: Dataset vivecoding2:billing_export2");
    expect(info).toEqual({
      kind: "dataset_not_found",
      projectId: "vivecoding2",
      datasetId: "billing_export2",
    });
  });

  it("詳細不明な Access Denied は permission_denied にフォールバックする", () => {
    const info = parseBillingError("Access Denied: User does not have permission");
    expect(info).toEqual({ kind: "permission_denied" });
  });

  it("Error オブジェクトからも抽出できる", () => {
    const err = new Error("Not found: Dataset proj-x:ds_y");
    expect(parseBillingError(err)?.kind).toBe("dataset_not_found");
  });

  it("詳細パターンを Access Denied フォールバックより優先する", () => {
    const info = parseBillingError(
      "Access Denied: Permission bigquery.tables.list denied on dataset proj-x:ds_y",
    );
    expect(info?.projectId).toBe("proj-x");
    expect(info?.datasetId).toBe("ds_y");
  });

  it("該当しない入力は null を返す", () => {
    expect(parseBillingError("invalid_rapt")).toBeNull();
    expect(parseBillingError("")).toBeNull();
    expect(parseBillingError(null)).toBeNull();
  });
});
