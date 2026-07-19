import { Router, type Request, type Response } from 'express';
import type { ProcessManager } from '../services/processManager.js';
import type { SettingsResponse } from '../types/index.js';

// オーバーレイサーバーのURL（server.ts のデフォルトポートと同一）
const OVERLAY_SERVER_URL = 'http://localhost:8000';

/**
 * 表示設定用ルーターを作成
 * Setup画面からの設定変更をオーバーレイサーバーへ中継する
 * @param processManager プロセスマネージャー
 */
export function createSettingsRouter(processManager: ProcessManager): Router {
  const router = Router();

  /**
   * POST /api/settings
   * 表示設定をオーバーレイサーバーへ転送
   */
  router.post('/settings', async (req: Request, res: Response<SettingsResponse>) => {
    // オーバーレイ実行中のみ設定変更を受け付ける
    if (processManager.getStatus().state !== 'running') {
      res.status(409).json({
        success: false,
        error: 'Overlay is not running',
      });
      return;
    }

    try {
      const response = await fetch(`${OVERLAY_SERVER_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const result = (await response.json()) as SettingsResponse;
      res.status(response.status).json(result);
    } catch (error) {
      console.error('Settings relay error:', error);
      res.status(502).json({
        success: false,
        error: 'Failed to reach overlay server',
      });
    }
  });

  return router;
}
