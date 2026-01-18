import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { decryptEnvFile, DecryptError } from '../services/decryptService.js';
import type { DecryptResponse } from '../types/index.js';

// multerをmemoryStorageモードで設定（ディスク書き込みなし）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024, // 10KB max（.envファイルは小さいはず）
  },
});

/**
 * 復号化用ルーターを作成
 * @param setDecryptedEnv 復号化された環境変数を保存するコールバック
 */
export function createDecryptRouter(
  setDecryptedEnv: (env: Map<string, string>) => void
): Router {
  const router = Router();

  /**
   * POST /api/decrypt
   * 暗号化された.envファイルを復号化
   */
  router.post(
    '/decrypt',
    upload.single('file'),
    (req: Request, res: Response<DecryptResponse>) => {
      try {
        // ファイルの検証
        if (!req.file) {
          res.status(400).json({
            success: false,
            error: 'No file uploaded',
          });
          return;
        }

        // パスワードの検証
        const password = req.body?.password;
        if (!password || typeof password !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Password is required',
          });
          return;
        }

        // 復号化
        const envMap = decryptEnvFile(req.file.buffer, password);

        // 必須の環境変数を検証
        const requiredKeys = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'];
        const missingKeys = requiredKeys.filter((key) => !envMap.has(key));
        if (missingKeys.length > 0) {
          res.status(400).json({
            success: false,
            error: 'Missing required environment variables: ' + missingKeys.join(', '),
          });
          return;
        }

        // 復号化された環境変数を保存
        setDecryptedEnv(envMap);

        // 成功レスポンス（パスワードや値は含めない）
        res.json({
          success: true,
          envKeys: Array.from(envMap.keys()),
        });
      } catch (error) {
        if (error instanceof DecryptError) {
          res.status(400).json({
            success: false,
            error: error.message,
          });
        } else {
          console.error('Decrypt error:', error);
          res.status(500).json({
            success: false,
            error: 'Internal server error',
          });
        }
      }
    }
  );

  return router;
}
