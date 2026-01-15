import 'dotenv/config';
import { App } from '@slack/bolt';
import express from 'express';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM用の __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// 型定義
// ============================================
interface ThreadInfo {
  channelId: string;
  threadTs: string;
}

interface CommentMessage {
  text: string;
}

// ============================================
// スレッドURL解析
// ============================================
function parseThreadUrl(url: string): ThreadInfo {
  // https://xxx.slack.com/archives/C1234567890/p1705200000000000
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/i);
  if (!match) {
    throw new Error('Invalid Slack thread URL. Expected format: https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP');
  }

  const channelId = match[1];
  const rawTs = match[2];

  // noUncheckedIndexedAccess対応: matchが成功した場合、グループ1,2は必ず存在する
  if (!channelId || !rawTs) {
    throw new Error('Failed to extract channel ID or timestamp from URL');
  }

  // p1705200000000000 → 1705200000.000000
  const threadTs = rawTs.slice(0, 10) + '.' + rawTs.slice(10);

  return { channelId, threadTs };
}

// ============================================
// メッセージ変換（Slack記法の除去）
// ============================================
function sanitizeMessage(text: string | undefined): string {
  if (!text) return '';

  return text
    // メンション <@U1234567890> → 除去
    .replace(/<@[A-Z0-9]+>/gi, '')
    // リンク <http://example.com|表示テキスト> → 表示テキスト
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    // リンク（表示テキストなし）<http://example.com> → 除去
    .replace(/<[^>]+>/g, '')
    // カスタム絵文字 :emoji_name: → 除去
    .replace(/:[a-z0-9_+-]+:/gi, '')
    // 連続空白を1つに
    .replace(/\s+/g, ' ')
    .trim();
}

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
  expressApp.use(express.static(path.join(__dirname, '../public')));
  const httpServer = createServer(expressApp);

  // WebSocket サーバー
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected (total: ${clients.size})`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected (total: ${clients.size})`);
    });
  });

  // 全クライアントにブロードキャスト
  function broadcast(message: CommentMessage): void {
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
  slackApp.event('message', async ({ event }) => {
    // 対象チャンネルかつ対象スレッドのメッセージのみ処理
    if (event.channel !== channelId) return;
    if (!('thread_ts' in event) || event.thread_ts !== threadTs) return;

    // サブタイプがあるメッセージ（編集、削除等）はスキップ
    if ('subtype' in event && event.subtype) return;

    // textプロパティを安全に取得
    const text = sanitizeMessage('text' in event ? event.text : undefined);
    if (!text) return; // 空メッセージはスキップ

    console.log(`New comment: ${text}`);
    broadcast({ text });
  });

  // サーバー起動
  const PORT = process.env['PORT'] || 3000;

  await slackApp.start();
  console.log('Slack connection established (Socket Mode)');

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open this URL in OBS Browser Source');
  });
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
