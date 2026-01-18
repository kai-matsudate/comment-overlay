import { Router, type Request, type Response } from 'express';
import type { ProcessManager, ProcessStatus } from '../services/processManager.js';
import type { StatusResponse, WebSocketStatusMessage } from '../types/index.js';

/**
 * 内部状態をAPI用状態に変換
 */
function mapProcessStatusToApiStatus(
  processStatus: ProcessStatus,
  hasEnv: boolean
): StatusResponse {
  let state: StatusResponse['state'];

  if (processStatus.state === 'idle') {
    // idle状態で環境変数がセット済みならready
    state = hasEnv ? 'ready' : 'idle';
  } else {
    state = processStatus.state;
  }

  return {
    state,
    threadUrl: processStatus.threadUrl,
    sessionId: processStatus.sessionId,
    uptime: processStatus.uptime,
  };
}

/**
 * ステータス用ルーターを作成
 * @param processManager プロセスマネージャー
 * @param hasDecryptedEnv 環境変数がセットされているか確認する関数
 */
export function createStatusRouter(
  processManager: ProcessManager,
  hasDecryptedEnv: () => boolean
): Router {
  const router = Router();

  /**
   * GET /api/status
   * 現在の状態を取得
   */
  router.get('/status', (_req: Request, res: Response<StatusResponse>) => {
    const processStatus = processManager.getStatus();
    const apiStatus = mapProcessStatusToApiStatus(processStatus, hasDecryptedEnv());
    res.json(apiStatus);
  });

  return router;
}

/**
 * WebSocket状態メッセージを作成
 */
export function createStatusMessage(
  processStatus: ProcessStatus,
  hasEnv: boolean
): WebSocketStatusMessage {
  return {
    type: 'status',
    data: mapProcessStatusToApiStatus(processStatus, hasEnv),
  };
}
