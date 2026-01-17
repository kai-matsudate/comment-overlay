#!/bin/bash
set -e

readonly ENV_FILE=".env"
readonly ENCRYPTED_FILE=".env.encrypted"
readonly ALGORITHM="aes-256-cbc"

# パスワードを対話的に入力
echo "パスワードを入力してください（入力は表示されません）:" >&2
read -s ENCRYPTION_PASSWORD
echo "" >&2  # 改行

if [ -z "$ENCRYPTION_PASSWORD" ]; then
  echo "Error: パスワードが入力されませんでした" >&2
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

echo "$ENCRYPTION_PASSWORD" | openssl enc -d -$ALGORITHM -pbkdf2 -in "$ENCRYPTED_FILE" -out "$ENV_FILE" -pass stdin
echo "✓ Decrypted to $ENV_FILE"
