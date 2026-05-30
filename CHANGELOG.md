# Change Log

All notable changes to the "Google Cloud Billing Watcher" extension will be documented in this file.

## [0.5.0] - 2026-04-25

### Added
- Google API 未有効化エラー (`* API has not been used in project ... before or it is disabled`) を検知し、有効化ページへ誘導する通知を追加
- ステータスバーに「API 未有効 (⊘)」状態を追加（warning 背景色）
- 通知のアクション: 「API を有効化」「URL をコピー」「ヘルプを開く」
- BigQuery API に限らず、メッセージ形式に合致する全ての Google API 未有効化エラーを汎用的に検知（`apiName` / `projectId` / 有効化 URL を抽出）
- 同一 (projectId, apiId) の通知は連続して再表示しないよう抑制（次回成功または別 API でリセット）
- 初回セットアップ時にプロジェクト ID を `gcloud projects list` の結果から QuickPick で選択できるように変更（取得失敗時は従来の手入力にフォールバック、ピッカー末尾に「手動で入力」項目あり）
- BigQuery 層のエラーを検知して案内 UI を出すように追加
  - 権限不足 (`Permission ... denied on dataset/table/project`): 通知のアクションは「IAM コンソールを開く」「ヘルプを開く」、ステータスバーは `🛡 BigQuery 権限が不足`
  - データセット未存在 (`Not found: Dataset xxx:yyy`): 通知のアクションは「設定を開く」「ヘルプを開く」、ステータスバーは `❓ データセットが見つかりません`
  - 同一 (kind, projectId, datasetId) の通知は連続して再表示しないよう抑制
- Tooltip 内訳のエラー表示を短縮ラベルに置き換え（`認証が必要` / `API 未有効` / `BigQuery 権限が不足` / `データセットが見つかりません`）。未知メッセージは 80 文字でトリミング

### Changed (Breaking)
- 旧 single-project 設定 (`gcpBilling.projectId` / `gcpBilling.datasetId` / `gcpBilling.credentialsPath`) を VS Code 設定 UI から削除。設定は `gcpBilling.projects` の配列形式に一本化
- 起動時に旧設定が残っていれば自動で `gcpBilling.projects` に移行し、旧キーは削除する（既存ユーザーは設定変更不要で動作継続）
- 初回プロンプトで選択した projectId は `gcpBilling.projects` 配列に直接追記される（旧 `gcpBilling.projectId` への書き込みは廃止）

### Fixed
- 予算未設定時のステータスバー色分け閾値が通貨非依存のハードコード（$500 / $100）だったため、JPY など少額通貨で誤って警告/エラー色になる問題を修正。ゼロ十進通貨（JPY/KRW など）は閾値を 100 倍にスケールするように変更
- 定期更新・手動更新・設定変更による再初期化が重なると課金データ取得 (`fetchAndUpdate`) が多重実行され、ステータスバー表示が乱れる可能性があった問題を修正（再入ガードを追加）
- 起動時の旧設定マイグレーションが設定変更イベントを誘発し、`initialize()` および初回データ取得が二重実行される問題を修正（設定変更リスナーをマイグレーション後に登録）
- `gcloud` 実行 (`projects list` / `config get-value project`) に同期版 `execSync` を使っており拡張ホスト（エディタ UI）が最大 30 秒ブロックされる問題を修正（非同期の `exec` に変更）

## [0.4.1] - 2026-04-25

### Added
- 認証エラー (`invalid_rapt` / RAPT 失効、ADC 読み込み失敗) を検知し、再認証手順を案内する通知を追加
- ステータスバーに「認証が必要 (🔑)」状態を追加（warning 背景色）
- コマンド `Google Cloud Billing: Run ADC Login` を追加。統合ターミナルを開いて `gcloud auth application-default login` を入力済みの状態にする
- 通知のアクション: 「ターミナルで実行」「コマンドをコピー」「ヘルプを開く」
- 同一種別の認証エラー通知は連続して再表示しないよう抑制（次回成功でリセット）

## [0.3.16] - 2025-12-25

### Changed
- 拡張機能の名称を "GCP Billing Watcher" から **"Google Cloud Billing Watcher"** に変更
- ステータスバーのプレフィックスを `GCP:` から **`Google Cloud:`** に変更
- コマンド名のプレフィックスを `GCP Billing:` から **`Google Cloud Billing:`** に統一
- README、設定項目の説明文、ソースコード内のメッセージを一括修正して「Google Cloud」表記に統一
- GitHub リリースノートの改善（名称変更サマリおよび各マーケットプレイスへのリンク追加）

## [0.3.11] - 2024-12-24

### Added
- トラブルシューティング: SSL 証明書検証スキップ設定 (`gcpBilling.skipSslVerification`) を追加
- プロキシ環境などで接続エラーが発生する場合の回避策を提供

## [0.3.10] - 2024-12-24

## [0.3.9] - 2024-12-24

### Changed
- README の最適化とセットアップ手順の簡略化


## [0.3.4] - 2024-12-23

### Fixed
- Marketplace 版で「fetch failed」エラーが発生する問題を修正
- グローバル `fetch` の代わりに `google-auth-library` の `request` メソッドを使用するように変更

## [0.3.2] - 2024-12-23

### Changed
- ドキュメント: ステータスバー表示形式（今月/年間）の説明を追加
- ドキュメント: 過去データの制限事項を統合

## [0.3.1] - 2024-12-23

### Changed
- ドキュメント: 過去データの制限事項を追加

## [0.3.0] - 2024-12-23

### Added
- 先月の課金額をツールチップに表示
- 過去3ヶ月の課金額をツールチップに表示

## [0.2.0] - 2024-12-23

### Added
- 年間課金額の表示機能
- ステータスバーに「今月 / 年間」形式で表示

## [0.1.1] - 2024-12-23

### Fixed
- BigQuery テーブル名の自動発見機能を追加
- `gcp_billing_export_v1_*` パターンのテーブルを動的に検索

## [0.1.0] - 2024-12-22

### Added
- 初回リリース
- 当月の Google Cloud 課金額をステータスバーに表示
- Application Default Credentials による認証
- 設定可能な更新間隔
