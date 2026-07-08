/**
 * Setup Server API 型定義
 */

/**
 * POST /api/decrypt のレスポンス
 */
export interface DecryptResponse {
  success: boolean;
  envKeys?: string[];
  error?: string;
}

/**
 * POST /api/start のリクエスト
 */
export interface StartRequest {
  threadUrl: string;
}

/**
 * POST /api/start のレスポンス
 */
export interface StartResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * 成否のみを返すAPIの共通レスポンス
 */
export interface ApiResponse {
  success: boolean;
  error?: string;
}

/**
 * POST /api/stop のレスポンス
 */
export type StopResponse = ApiResponse;

/**
 * POST /api/settings のレスポンス
 */
export type SettingsResponse = ApiResponse;

/**
 * GET /api/status のレスポンス
 */
export interface StatusResponse {
  state: 'idle' | 'ready' | 'starting' | 'running' | 'stopping';
  threadUrl: string | null;
  sessionId: string | null;
  uptime: number;
}

/**
 * WebSocket メッセージ型
 */
export interface WebSocketStatusMessage {
  type: 'status';
  data: StatusResponse;
}
