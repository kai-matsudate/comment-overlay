import { createDecipheriv, pbkdf2Sync } from 'crypto';

/**
 * 復号化に失敗した際にスローされるエラー
 */
export class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptError';
  }
}

// OpenSSL暗号化ファイルの定数
const OPENSSL_MAGIC = 'Salted__';
const SALT_LENGTH = 8;
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 16;  // CBC mode
const PBKDF2_ITERATIONS = 10000;

/**
 * OpenSSL aes-256-cbc pbkdf2形式で暗号化されたBufferを復号化し、
 * .env形式としてパースしてMap<string, string>を返す
 *
 * @param encryptedData - OpenSSLで暗号化されたBuffer
 * @param password - 復号化パスワード
 * @returns 環境変数のMap（キー=値のペア）
 * @throws DecryptError パスワードが不正、またはデータ形式が不正な場合
 */
export function decryptEnvFile(
  encryptedData: Buffer,
  password: string
): Map<string, string> {
  // バリデーション
  if (!password) {
    throw new DecryptError('Password is required');
  }

  if (encryptedData.length < OPENSSL_MAGIC.length + SALT_LENGTH + 1) {
    throw new DecryptError('Invalid encrypted data: too short');
  }

  // OpenSSL形式のヘッダーを検証
  const magic = encryptedData.subarray(0, OPENSSL_MAGIC.length).toString('utf8');
  if (magic !== OPENSSL_MAGIC) {
    throw new DecryptError('Invalid encrypted data: missing OpenSSL header');
  }

  // saltを抽出
  const salt = encryptedData.subarray(
    OPENSSL_MAGIC.length,
    OPENSSL_MAGIC.length + SALT_LENGTH
  );

  // 暗号化されたデータ本体
  const ciphertext = encryptedData.subarray(OPENSSL_MAGIC.length + SALT_LENGTH);

  // PBKDF2でキーとIVを導出
  const keyIv = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH + IV_LENGTH,
    'sha256'
  );
  const key = keyIv.subarray(0, KEY_LENGTH);
  const iv = keyIv.subarray(KEY_LENGTH, KEY_LENGTH + IV_LENGTH);

  // 復号化
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const content = decrypted.toString('utf8');

    return parseEnvContent(content);
  } catch {
    throw new DecryptError('Decryption failed: invalid password or corrupted data');
  }
}

/**
 * .env形式の文字列をパースしてMapを返す
 */
function parseEnvContent(content: string): Map<string, string> {
  const result = new Map<string, string>();

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // 空行とコメント行をスキップ
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // KEY=VALUE形式をパース（最初の=で分割）
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalIndex);
    let value = trimmed.substring(equalIndex + 1);

    // クォートを除去
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result.set(key, value);
  }

  return result;
}
