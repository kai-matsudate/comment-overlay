#!/bin/bash

# Comment Overlay - サーバーとElectronの同時起動スクリプト
# 使用方法: npm run dev:overlay -- "THREAD_URL"

set -e

THREAD_URL="$1"

if [ -z "$THREAD_URL" ]; then
  echo "Error: スレッドURLが指定されていません"
  echo ""
  echo "使用方法:"
  echo "  npm run dev:overlay -- \"https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP\""
  echo ""
  echo "例:"
  echo "  npm run dev:overlay -- \"https://example.slack.com/archives/C1234567890/p1705200000000000\""
  exit 1
fi

echo "Starting Comment Overlay..."
echo "Thread URL: $THREAD_URL"
echo ""

# concurrentlyでサーバーとElectronを同時起動
# -k: いずれかのプロセスが終了したら他も終了
# -n: プロセス名のラベル
# -c: 出力の色分け
# server: tsx watchでサーバーを起動（2秒後にElectron起動を待たせるためsleepは不要、サーバーは即座に起動する）
npx concurrently -k -n "server,electron" -c "blue,green" \
  "tsx watch src/server.ts \"$THREAD_URL\"" \
  "sleep 2 && npm run electron"
