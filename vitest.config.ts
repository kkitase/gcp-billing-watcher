import { defineConfig } from "vitest/config";

// vscode に依存しない純粋ロジック（エラーパーサ・日付・通貨フォーマット）の
// ユニットテストのみを対象にする。vscode API を import するモジュール
// (extension/commands/status_bar/i18n/config) はここでは扱わない。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
