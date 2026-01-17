#!/bin/bash
set -e

readonly ENV_FILE=".env"
readonly ENCRYPTED_FILE=".env.encrypted"
readonly ALGORITHM="aes-256-cbc"

if [ -z "$ENCRYPTION_PASSWORD" ]; then
  echo "Error: ENCRYPTION_PASSWORD環境変数が設定されていません" >&2
  echo "使用方法: export ENCRYPTION_PASSWORD='your-password' && npm run encrypt-env" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE ファイルが見つかりません" >&2
  exit 1
fi

openssl enc -$ALGORITHM -salt -pbkdf2 -in "$ENV_FILE" -out "$ENCRYPTED_FILE" -pass env:ENCRYPTION_PASSWORD
echo "✓ Encrypted to $ENCRYPTED_FILE"
