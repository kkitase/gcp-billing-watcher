#!/bin/bash

# リリース自動化スクリプト
# 使用方法: ./scripts/release.sh [patch|minor|major] "Release message"

set -e

VERSION_TYPE=${1:-patch}
MESSAGE=${2:-"Update"}

echo "--- リリースプロセスを開始します: $VERSION_TYPE ---"
# VSCE PAT は macOS キーチェーン (service=vscode-vsce, account=kimisan) から
# vsce が自動取得するため、環境変数 VSCE_PAT は不要。

# 1. バージョンアップ
echo "--- バージョンを更新中 ($VERSION_TYPE) ---"
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
echo "新しいバージョン: $NEW_VERSION"

# 2. ビルド
echo "--- ビルド中 ---"
npm run compile

# 3. パッケージング
echo "--- VSIX を作成中 ---"
mkdir -p release
VSIX_FILE="release/gcp-billing-watcher-${NEW_VERSION#v}.vsix"
npx @vscode/vsce package --out "$VSIX_FILE"

# 4. GitHub へのプッシュとタグ付け
echo "--- GitHub へプッシュ中 ---"
git add .
git commit -m "chore: release $NEW_VERSION - $MESSAGE"
git tag "$NEW_VERSION"
git push origin main --tags

# 5. GitHub リリースページ作成
echo "--- GitHub リリースを作成中 ---"
gh release create "$NEW_VERSION" "$VSIX_FILE" --title "$NEW_VERSION" --notes "$MESSAGE"

# 6. Marketplace への公開
echo "--- Marketplace へ公開中 ---"
npx @vscode/vsce publish

echo "--- リリースが正常に完了しました: $NEW_VERSION ---"
