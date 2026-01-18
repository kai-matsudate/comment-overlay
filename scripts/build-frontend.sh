#!/bin/bash
set -euo pipefail

# フロントエンドTypeScriptビルドスクリプト
# esbuildを使用してTypeScriptをJavaScriptにバンドル

echo "Building frontend TypeScript..."

# オーバーレイアプリ
npx esbuild public/js/src/app.ts \
  --bundle \
  --outfile=public/js/app.js \
  --format=iife \
  --target=es2022 \
  --minify \
  --sourcemap

# セットアップUI
npx esbuild public/setup/js/src/app.ts \
  --bundle \
  --outfile=public/setup/js/app.js \
  --format=iife \
  --target=es2022 \
  --minify \
  --sourcemap

echo "Frontend build complete!"
