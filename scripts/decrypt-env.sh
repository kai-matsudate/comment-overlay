#!/bin/bash
set -e

readonly ENV_FILE=".env"
readonly ENCRYPTED_FILE=".env.encrypted"
readonly ALGORITHM="aes-256-cbc"

if [ -z "$ENCRYPTION_PASSWORD" ]; then
  echo "Error: ENCRYPTION_PASSWORD環境変数が設定されていません" >&2
  echo "使用方法: export ENCRYPTION_PASSWORD='your-password' && npm run decrypt-env" >&2
  exit 1
fi

if [ ! -f "$ENCRYPTED_FILE" ]; then
  echo "Error: $ENCRYPTED_FILE ファイルが見つかりません" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  echo "Warning: $ENV_FILE は既に存在します。上書きしますか? (y/N)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "キャンセルしました"
    exit 0
  fi
fi

openssl enc -d -$ALGORITHM -pbkdf2 -in "$ENCRYPTED_FILE" -out "$ENV_FILE" -pass env:ENCRYPTION_PASSWORD
echo "✓ Decrypted to $ENV_FILE"
