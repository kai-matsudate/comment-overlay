import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { decryptEnvFile, DecryptError } from '../../src/setup/services/decryptService.js';

// テスト用の暗号化データを生成するヘルパー
function createEncryptedData(content: string, password: string): Buffer {
  // OpenSSL互換の暗号化をシェルで実行
  const result = execSync(
    `echo -n "${content}" | openssl enc -aes-256-cbc -pbkdf2 -pass pass:${password}`,
    { encoding: 'buffer' }
  );
  return result;
}

describe('decryptService', () => {
  describe('decryptEnvFile', () => {
    describe('正常系', () => {
      it('正しいパスワードで復号化できる', () => {
        const envContent = 'SLACK_BOT_TOKEN=xoxb-test-token\nSLACK_APP_TOKEN=xapp-test-token';
        const password = 'testpassword123';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.get('SLACK_BOT_TOKEN')).toBe('xoxb-test-token');
        expect(result.get('SLACK_APP_TOKEN')).toBe('xapp-test-token');
      });

      it('複数行の.envファイルを正しくパースできる', () => {
        const envContent = [
          'KEY1=value1',
          'KEY2=value2',
          'KEY3=value with spaces',
          '# comment line',
          '',
          'KEY4=value4',
        ].join('\n');
        const password = 'mypassword';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.get('KEY1')).toBe('value1');
        expect(result.get('KEY2')).toBe('value2');
        expect(result.get('KEY3')).toBe('value with spaces');
        expect(result.get('KEY4')).toBe('value4');
        expect(result.has('#')).toBe(false); // コメント行は除外
      });

      it('値に=を含む場合も正しくパースできる', () => {
        const envContent = 'URL=https://example.com?foo=bar&baz=qux';
        const password = 'pass';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.get('URL')).toBe('https://example.com?foo=bar&baz=qux');
      });

      it('クォートで囲まれた値を正しく処理できる', () => {
        const envContent = 'QUOTED="hello world"\nSINGLE=\'single quotes\'';
        const password = 'pass';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.get('QUOTED')).toBe('hello world');
        expect(result.get('SINGLE')).toBe('single quotes');
      });
    });

    describe('異常系', () => {
      it('不正なパスワードでDecryptErrorをスローする', () => {
        const envContent = 'KEY=value';
        const correctPassword = 'correct';
        const wrongPassword = 'wrong';
        const encrypted = createEncryptedData(envContent, correctPassword);

        expect(() => decryptEnvFile(encrypted, wrongPassword)).toThrow(DecryptError);
      });

      it('不正な形式のデータでDecryptErrorをスローする', () => {
        const invalidData = Buffer.from('invalid data without salt header');
        const password = 'anypassword';

        expect(() => decryptEnvFile(invalidData, password)).toThrow(DecryptError);
      });

      it('空のバッファでDecryptErrorをスローする', () => {
        const emptyBuffer = Buffer.alloc(0);
        const password = 'anypassword';

        expect(() => decryptEnvFile(emptyBuffer, password)).toThrow(DecryptError);
      });

      it('空のパスワードでDecryptErrorをスローする', () => {
        const envContent = 'KEY=value';
        const password = 'correct';
        const encrypted = createEncryptedData(envContent, password);

        expect(() => decryptEnvFile(encrypted, '')).toThrow(DecryptError);
      });
    });

    describe('エッジケース', () => {
      it('空の.envファイルは空のMapを返す', () => {
        const envContent = '';
        const password = 'pass';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.size).toBe(0);
      });

      it('コメントのみの.envファイルは空のMapを返す', () => {
        const envContent = '# comment only\n# another comment';
        const password = 'pass';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.size).toBe(0);
      });

      it('日本語を含む値を正しく復号化できる', () => {
        const envContent = 'MESSAGE=こんにちは世界';
        const password = 'pass';
        const encrypted = createEncryptedData(envContent, password);

        const result = decryptEnvFile(encrypted, password);

        expect(result.get('MESSAGE')).toBe('こんにちは世界');
      });
    });
  });
});
