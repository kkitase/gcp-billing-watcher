import { describe, expect, it } from "vitest";
import { isApiDisabledError, parseApiDisabledError } from "./api_error";

describe("parseApiDisabledError", () => {
  it("メッセージと有効化 URL の両方から情報を抽出する", () => {
    const text =
      "BigQuery API has not been used in project my-project-123 before or it is disabled. " +
      "Enable it by visiting https://console.developers.google.com/apis/api/bigquery.googleapis.com/overview?project=my-project-123 then retry.";
    const info = parseApiDisabledError(text);
    expect(info).not.toBeNull();
    expect(info?.apiName).toBe("BigQuery API");
    expect(info?.apiId).toBe("bigquery.googleapis.com");
    expect(info?.projectId).toBe("my-project-123");
    expect(info?.enableUrl).toContain("bigquery.googleapis.com");
  });

  it("URL が無い場合は API 名から apiId を推測する", () => {
    const text =
      "Cloud Billing API has not been used in project test-project-9 before or it is disabled.";
    const info = parseApiDisabledError(text);
    expect(info?.apiName).toBe("Cloud Billing API");
    expect(info?.projectId).toBe("test-project-9");
    expect(info?.apiId).toBe("cloudbilling.googleapis.com");
    expect(info?.enableUrl).toBe(
      "https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=test-project-9",
    );
  });

  it("Error オブジェクトからも抽出できる", () => {
    const err = new Error(
      "Compute Engine API has not been used in project demo-project-1 before or it is disabled.",
    );
    expect(parseApiDisabledError(err)?.apiName).toBe("Compute Engine API");
  });

  it("該当しない入力は null を返す", () => {
    expect(parseApiDisabledError("Not found: Dataset a:b")).toBeNull();
    expect(parseApiDisabledError("")).toBeNull();
    expect(parseApiDisabledError(null)).toBeNull();
  });
});

describe("isApiDisabledError", () => {
  it("API 未有効化エラーなら true", () => {
    expect(
      isApiDisabledError(
        "Some API has not been used in project foo-bar-1 before or it is disabled.",
      ),
    ).toBe(true);
    expect(isApiDisabledError("random error")).toBe(false);
  });
});
