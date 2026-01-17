#!/bin/bash
set -e

readonly ENV_FILE=".env"
readonly ENCRYPTED_FILE=".env.encrypted"
readonly ALGORITHM="aes-256-cbc"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE ファイルが見つかりません" >&2
  exit 1
fi

# パスワードの自動生成（32バイト = 44文字のBase64エンコード）
export ENCRYPTION_PASSWORD=$(openssl rand -base64 32)

openssl enc -$ALGORITHM -salt -pbkdf2 -in "$ENV_FILE" -out "$ENCRYPTED_FILE" -pass env:ENCRYPTION_PASSWORD
echo "✓ Encrypted to $ENCRYPTED_FILE"
echo ""
echo "================================================"
echo "生成されたパスワード（利用者に共有してください）:"
echo ""
echo "$ENCRYPTION_PASSWORD"
echo "================================================"
