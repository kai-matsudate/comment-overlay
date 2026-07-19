import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { ProcessManager } from './services/processManager.js';
import { createDecryptRouter } from './routes/decryptRoute.js';
import { createControlRouter } from './routes/controlRoute.js';
import { createStatusRouter, createStatusMessage } from './routes/statusRoute.js';
import resolvePort from '../../shared/resolvePort.cjs';

// ESM用の __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env を読み込む（存在しない場合は無視）。
// SETUP_PORT / OVERLAY_PORT を設定可能。dotenv 依存は不要（Node 標準API）。
// ここで読み込んだ値は spawn される overlay サーバー / Electron にも継承される。
try {
  process.loadEnvFile();
} catch {
  // .env は任意。存在しなければデフォルト値を使用する
}

/**
 * フロントエンドバンドルの存在を確認する
 * ビルドされていない場合はエラーメッセージを表示して終了
 */
export function checkFrontendBuild(): void {
  const frontendBundle = path.join(__dirname, '../../public/setup/js/app.js');
  if (!existsSync(frontendBundle)) {
    console.error('');
    console.error('Error: フロントエンドがビルドされていません');
    console.error('先に npm run build を実行してください');
    console.error('');
    process.exit(1);
  }
}

const SETUP_PORT = resolvePort(process.env['SETUP_PORT'], 8001);

/**
 * Setup Serverのメイン処理
 */
async function main(): Promise<void> {
  // フロントエンドビルドの存在確認
  checkFrontendBuild();

  console.log('Starting Setup Server...');

  // 状態管理
  let decryptedEnv: Map<string, string> | null = null;
  const processManager = new ProcessManager();

  // Express アプリケーション
  const app = express();

  // セキュリティ: HTTPセキュリティヘッダーを設定
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
      },
    },
  }));

  // JSONボディパーサー
  app.use(express.json());

  // 静的ファイル配信
  app.use(express.static(path.join(__dirname, '../../public/setup')));

  // API ルート
  app.use('/api', createDecryptRouter((env) => {
    decryptedEnv = env;
    // 環境変数がセットされたことを通知
    broadcastStatus();
  }));

  app.use('/api', createControlRouter(
    processManager,
    () => decryptedEnv
  ));

  app.use('/api', createStatusRouter(
    processManager,
    () => decryptedEnv !== null
  ));

  // HTTP サーバー
  const httpServer = createServer(app);

  // WebSocket サーバー（セキュリティ: localhostからの接続のみ許可）
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/status',
    verifyClient: (info: { origin?: string }) => {
      const origin = info.origin ?? '';
      const allowedOrigins = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      ];
      if (!origin) return true;
      return allowedOrigins.some((pattern) => pattern.test(origin));
    },
  });

  const wsClients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    wsClients.add(ws);
    console.log('WebSocket client connected');

    // 接続時に現在の状態を送信
    const status = createStatusMessage(
      processManager.getStatus(),
      decryptedEnv !== null
    );
    ws.send(JSON.stringify(status));

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('WebSocket client disconnected');
    });
  });

  // 状態をブロードキャスト
  function broadcastStatus(): void {
    const status = createStatusMessage(
      processManager.getStatus(),
      decryptedEnv !== null
    );
    const data = JSON.stringify(status);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // プロセスマネージャーの状態変更を監視
  processManager.onStatusChange(() => {
    broadcastStatus();
  });

  // サーバー起動
  httpServer.listen(SETUP_PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         Comment Overlay Setup Server               ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║                                                    ║');
    console.log('║   ブラウザで以下のURLを開いてください:             ║');
    console.log('║                                                    ║');
    console.log('║   🌐  http://localhost:' + SETUP_PORT + '                        ║');
    console.log('║                                                    ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
  });

  // シャットダウンハンドラー
  const shutdown = async (): Promise<void> => {
    console.log('\nShutting down...');
    await processManager.stop();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// テスト時は main() を実行しない
if (!process.env['VITEST']) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };
