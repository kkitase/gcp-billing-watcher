import { describe, expect, it } from "vitest";
import { classifyAuthError, isAuthError } from "./auth_error";

describe("classifyAuthError", () => {
  it("RAPT 失効を reauth_required に分類する", () => {
    expect(classifyAuthError("invalid_rapt")).toBe("reauth_required");
    expect(classifyAuthError("Reauth related error occurred")).toBe("reauth_required");
    expect(classifyAuthError("invalid_grant: rapt required")).toBe("reauth_required");
  });

  it("invalid_rapt は invalid_grant より優先して reauth_required になる", () => {
    expect(classifyAuthError("invalid_grant invalid_rapt")).toBe("reauth_required");
  });

  it("ADC 不在・トークン更新失敗を credentials_missing に分類する", () => {
    expect(classifyAuthError("Could not load the default credentials")).toBe("credentials_missing");
    expect(classifyAuthError("Could not refresh access token")).toBe("credentials_missing");
    expect(classifyAuthError("invalid_grant")).toBe("credentials_missing");
  });

  it("Error オブジェクトのメッセージからも分類できる", () => {
    expect(classifyAuthError(new Error("invalid_rapt"))).toBe("reauth_required");
  });

  it("該当しない入力は null を返す", () => {
    expect(classifyAuthError("some random network error")).toBeNull();
    expect(classifyAuthError("")).toBeNull();
    expect(classifyAuthError(null)).toBeNull();
    expect(classifyAuthError(undefined)).toBeNull();
  });
});

describe("isAuthError", () => {
  it("認証エラーなら true、それ以外は false", () => {
    expect(isAuthError("invalid_rapt")).toBe(true);
    expect(isAuthError("Not found: Dataset a:b")).toBe(false);
  });
});
