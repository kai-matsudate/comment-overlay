import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

// 型定義をインポート
import type {
  ThreadInfo,
  WebSocketMessage,
  SlackClient,
  ProcessedMessage,
} from './types/index.js';

// 絵文字モジュールをインポート
import {
  getStandardEmojiUrl,
  isStandardEmojiMapInitialized,
  getEmojiList,
  clearEmojiCache,
} from './emoji/index.js';

// ユーザーモジュールをインポート
import {
  clearUserCache,
  generateUserColor,
  getUserDisplayName,
} from './user/index.js';

// メッセージモジュールをインポート
import {
  parseThreadUrl,
  processMessage,
} from './message/index.js';

// カウンターモジュールをインポート
import {
  getCommentCount,
  incrementCommentCount,
  resetCommentCount,
  setCommentCount,
} from './counter/index.js';

// Slackモジュールをインポート
import { fetchInitialCommentCount } from './slack/index.js';

// 後方互換性のため型と関数を再エクスポート
export type { SlackClient, ProcessedMessage } from './types/index.js';
export { getStandardEmojiUrl, isStandardEmojiMapInitialized, getEmojiList, clearEmojiCache } from './emoji/index.js';
export { clearUserCache, generateUserColor, getUserDisplayName } from './user/index.js';
export { processMessage } from './message/index.js';
export { getCommentCount, incrementCommentCount, resetCommentCount, setCommentCount } from './counter/index.js';
export { fetchInitialCommentCount } from './slack/index.js';

// ESM用の __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// メイン処理
// ============================================
async function main(): Promise<void> {
  // CLI引数からスレッドURLを取得
  const threadUrl = process.argv[2];
  if (!threadUrl) {
    console.error('Usage: npm run dev "https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP"');
    process.exit(1);
  }

  // 環境変数チェック
  const slackBotToken = process.env['SLACK_BOT_TOKEN'];
  const slackAppToken = process.env['SLACK_APP_TOKEN'];
  if (!slackBotToken || !slackAppToken) {
    console.error('Error: SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in .env');
    process.exit(1);
  }

  // スレッドURL解析
  const { channelId, threadTs } = parseThreadUrl(threadUrl);
  console.log(`Monitoring thread: channel=${channelId}, thread_ts=${threadTs}`);

  // Express + HTTP サーバー
  const expressApp = express();

  // セキュリティ: HTTPセキュリティヘッダーを設定
  expressApp.use(helmet({
    // WebSocket接続のためCSPを調整
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://emoji.slack-edge.com", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
      },
    },
  }));

  expressApp.use(express.static(path.join(__dirname, '../public')));
  const httpServer = createServer(expressApp);

  // WebSocket サーバー
  // セキュリティ: Originヘッダーを検証してlocalhostからの接続のみ許可
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info: { origin?: string }) => {
      const origin = info.origin ?? '';
      // localhost、127.0.0.1、file://（Electron）からの接続を許可
      const allowedOrigins = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        /^file:\/\//,
      ];
      // Originヘッダーがない場合（同一オリジン）も許可
      if (!origin) return true;
      return allowedOrigins.some((pattern) => pattern.test(origin));
    },
  });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected (total: ${clients.size})`);

    // 新規クライアントに現在のカウントを送信
    ws.send(JSON.stringify({ type: 'counter', count: getCommentCount() }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected (total: ${clients.size})`);
    });
  });

  // 全クライアントにブロードキャスト
  function broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Slack Bolt App（Socket Mode）
  const slackApp = new App({
    token: slackBotToken,
    appToken: slackAppToken,
    socketMode: true,
  });

  // メッセージイベントをリッスン
  slackApp.event('message', async ({ event, client }) => {
    // 対象チャンネルかつ対象スレッドのメッセージのみ処理
    if (event.channel !== channelId) return;
    if (!('thread_ts' in event) || event.thread_ts !== threadTs) return;

    // サブタイプがあるメッセージ（編集、削除等）はスキップ
    if ('subtype' in event && event.subtype) return;

    // ユーザーIDを取得（型安全に）
    const userId = 'user' in event ? event.user : undefined;
    if (!userId) return;

    // 絵文字リストを取得
    const emojiMap = await getEmojiList(client as SlackClient);

    // テキストを処理（絵文字URLマップを含む）
    const rawText = 'text' in event ? event.text : undefined;
    const { sanitizedText, emojis } = processMessage(rawText, emojiMap);
    if (!sanitizedText) return; // 空メッセージはスキップ

    // ユーザー名を取得
    const userName = await getUserDisplayName(client as SlackClient, userId);

    const userColor = generateUserColor(userId);
    console.log(`New comment from ${userName}: ${sanitizedText}`);

    // カウンターをインクリメントしてブロードキャスト
    const newCount = incrementCommentCount();
    broadcast({ type: 'comment', text: sanitizedText, userName, userColor, emojis });
    broadcast({ type: 'counter', count: newCount });
  });

  // サーバー起動
  const PORT = process.env['PORT'] || 8000;

  // HTTPサーバーを先に起動（Electronが即座に接続できる）
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open this URL in OBS Browser Source');
  });

  // Slack接続は後続処理として実行（時間がかかっても問題ない）
  await slackApp.start();
  console.log('Slack connection established (Socket Mode)');

  // 既存のスレッドメッセージ数を取得してカウンターを初期化
  const initialCount = await fetchInitialCommentCount(
    slackApp.client as unknown as SlackClient,
    channelId,
    threadTs
  );
  setCommentCount(initialCount);
  console.log(`Initial comment count: ${initialCount}`);
}

// テスト時は main() を実行しない
if (!process.env['VITEST']) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
