#!/bin/bash
set -e

readonly ENCRYPTED_FILE=".env.encrypted"
readonly ALGORITHM="aes-256-cbc"

echo "========================================"
echo "  環境変数の暗号化"
echo "========================================"
echo ""

# SLACK_BOT_TOKEN の入力
read -sp "SLACK_BOT_TOKEN (xoxb-...): " SLACK_BOT_TOKEN
echo ""

if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo "Error: SLACK_BOT_TOKEN を入力してください" >&2
  exit 1
fi

# SLACK_APP_TOKEN の入力
read -sp "SLACK_APP_TOKEN (xapp-...): " SLACK_APP_TOKEN
echo ""

if [ -z "$SLACK_APP_TOKEN" ]; then
  echo "Error: SLACK_APP_TOKEN を入力してください" >&2
  exit 1
fi

echo ""

# パスワードの自動生成（32バイト = 44文字のBase64エンコード）
export ENCRYPTION_PASSWORD=$(openssl rand -base64 32)

# 一時ファイルを使わずに直接暗号化（ヒアストリング使用）
echo -e "SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}\nSLACK_APP_TOKEN=${SLACK_APP_TOKEN}" | \
  openssl enc -$ALGORITHM -salt -pbkdf2 -out "$ENCRYPTED_FILE" -pass env:ENCRYPTION_PASSWORD

echo "✓ Encrypted to $ENCRYPTED_FILE"
echo ""
echo "========================================"
echo "生成されたパスワード（利用者に共有してください）:"
echo ""
echo "$ENCRYPTION_PASSWORD"
echo "========================================"
