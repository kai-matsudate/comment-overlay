import { Router, type Request, type Response } from 'express';
import type { ProcessManager } from '../services/processManager.js';
import type { StartRequest, StartResponse, StopResponse } from '../types/index.js';

// SlackスレッドURLの正規表現パターン
const SLACK_THREAD_URL_PATTERN =
  /^https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/;

/**
 * コントロール用ルーターを作成
 * @param processManager プロセスマネージャー
 * @param getDecryptedEnv 復号化された環境変数を取得する関数
 */
export function createControlRouter(
  processManager: ProcessManager,
  getDecryptedEnv: () => Map<string, string> | null
): Router {
  const router = Router();

  /**
   * POST /api/start
   * オーバーレイを起動
   */
  router.post('/start', async (req: Request, res: Response<StartResponse>) => {
    try {
      const body = req.body as StartRequest;

      // スレッドURLの検証
      if (!body.threadUrl || typeof body.threadUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Thread URL is required',
        });
        return;
      }

      if (!SLACK_THREAD_URL_PATTERN.test(body.threadUrl)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Slack thread URL format',
        });
        return;
      }

      // 環境変数の確認
      const env = getDecryptedEnv();
      if (!env) {
        res.status(400).json({
          success: false,
          error: 'Environment variables not set. Please decrypt first.',
        });
        return;
      }

      // 起動
      const sessionId = await processManager.start(body.threadUrl, env);

      res.json({
        success: true,
        sessionId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Process already running') {
        res.status(409).json({
          success: false,
          error: 'Process already running',
        });
      } else {
        console.error('Start error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  });

  /**
   * POST /api/stop
   * オーバーレイを停止
   */
  router.post('/stop', async (_req: Request, res: Response<StopResponse>) => {
    try {
      await processManager.stop();

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('Stop error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
