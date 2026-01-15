require('dotenv').config();

const { App } = require('@slack/bolt');
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

// ============================================
// スレッドURL解析
// ============================================
function parseThreadUrl(url) {
  // https://xxx.slack.com/archives/C1234567890/p1705200000000000
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/i);
  if (!match) {
    throw new Error('Invalid Slack thread URL. Expected format: https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP');
  }

  const channelId = match[1];
  // p1705200000000000 → 1705200000.000000
  const rawTs = match[2];
  const threadTs = rawTs.slice(0, 10) + '.' + rawTs.slice(10);

  return { channelId, threadTs };
}

// ============================================
// メッセージ変換（Slack記法の除去）
// ============================================
function sanitizeMessage(text) {
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
async function main() {
  // CLI引数からスレッドURLを取得
  const threadUrl = process.argv[2];
  if (!threadUrl) {
    console.error('Usage: node src/server.js "https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP"');
    process.exit(1);
  }

  // 環境変数チェック
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
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
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`WebSocket client connected (total: ${clients.size})`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected (total: ${clients.size})`);
    });
  });

  // 全クライアントにブロードキャスト
  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  // Slack Bolt App（Socket Mode）
  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  // メッセージイベントをリッスン
  slackApp.event('message', async ({ event }) => {
    // 対象チャンネルかつ対象スレッドのメッセージのみ処理
    if (event.channel !== channelId) return;
    if (event.thread_ts !== threadTs) return;

    // サブタイプがあるメッセージ（編集、削除等）はスキップ
    if (event.subtype) return;

    const text = sanitizeMessage(event.text);
    if (!text) return; // 空メッセージはスキップ

    console.log(`New comment: ${text}`);
    broadcast({ text });
  });

  // サーバー起動
  const PORT = process.env.PORT || 3000;

  await slackApp.start();
  console.log('Slack connection established (Socket Mode)');

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open this URL in OBS Browser Source');
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
