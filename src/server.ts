import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;
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
  type: 'comment';
  text: string;
  userName: string;
  userColor: string;
}

interface CounterMessage {
  type: 'counter';
  count: number;
}

type WebSocketMessage = CommentMessage | CounterMessage;

interface UserCache {
  displayName: string;
}

// テスト用に型を定義（Slack WebClient の部分的な型）
export interface SlackClient {
  users: {
    info: (params: { user: string }) => Promise<{
      ok: boolean;
      user?: {
        profile?: {
          display_name?: string;
          real_name?: string;
        };
      };
    }>;
  };
  conversations: {
    replies: (params: {
      channel: string;
      ts: string;
      limit?: number;
      cursor?: string;
    }) => Promise<{
      ok: boolean;
      messages?: Array<{
        ts?: string;
        thread_ts?: string;
        user?: string;
        text?: string;
        subtype?: string;
      }>;
      has_more?: boolean;
      response_metadata?: { next_cursor?: string };
    }>;
  };
}

// ============================================
// コメントカウンター
// ============================================
let commentCount = 0;

/**
 * 現在のコメント数を取得
 */
export function getCommentCount(): number {
  return commentCount;
}

/**
 * コメント数をインクリメントし、新しい値を返す
 */
export function incrementCommentCount(): number {
  commentCount += 1;
  return commentCount;
}

/**
 * コメント数をリセット（テスト用）
 */
export function resetCommentCount(): void {
  commentCount = 0;
}

/**
 * コメント数を指定値に設定
 */
export function setCommentCount(value: number): void {
  commentCount = value;
}

// ============================================
// ユーザーキャッシュ
// ============================================
const userCache = new Map<string, UserCache>();

/**
 * キャッシュをクリア（テスト用）
 */
export function clearUserCache(): void {
  userCache.clear();
}

/**
 * ユーザーIDからHSL色を生成
 * 同一ユーザーは常に同じ色を返す
 */
export function generateUserColor(userId: string): string {
  let hash = 0;
  for (const char of userId) {
    hash = (hash + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 80%, 65%)`;
}

/**
 * ユーザーIDから表示名を取得
 * キャッシュがあればキャッシュから、なければSlack APIから取得
 */
export async function getUserDisplayName(
  client: SlackClient,
  userId: string
): Promise<string> {
  // キャッシュ確認
  const cached = userCache.get(userId);
  if (cached) {
    return cached.displayName;
  }

  try {
    const result = await client.users.info({ user: userId });
    const profile = result.user?.profile;
    const displayName = profile?.display_name || profile?.real_name || 'Unknown User';

    // 空文字の場合も "Unknown User" にフォールバック
    const finalName = displayName || 'Unknown User';

    // キャッシュに保存
    userCache.set(userId, { displayName: finalName });

    return finalName;
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
    return 'Unknown User';
  }
}

// ============================================
// 既存スレッドメッセージのカウント取得
// ============================================

/**
 * 既存のスレッドメッセージ数を取得
 * ページネーションに対応し、メッセージイベントと同じフィルタリング条件を適用
 */
export async function fetchInitialCommentCount(
  client: SlackClient,
  channelId: string,
  threadTs: string
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;

  try {
    do {
      const params: { channel: string; ts: string; limit: number; cursor?: string } = {
        channel: channelId,
        ts: threadTs,
        limit: 100,
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await client.conversations.replies(params);
      const messages = result.messages ?? [];

      for (const msg of messages) {
        // 親メッセージを除外（ts === thread_ts）
        if (msg.ts === threadTs) continue;
        // subtype があるメッセージを除外
        if (msg.subtype) continue;
        // user がないメッセージを除外
        if (!msg.user) continue;
        // text が空のメッセージを除外
        if (!msg.text) continue;

        count += 1;
      }

      cursor = result.has_more ? result.response_metadata?.next_cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error('Failed to fetch initial comment count:', error);
    return 0;
  }

  return count;
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

    // textプロパティを安全に取得
    const text = sanitizeMessage('text' in event ? event.text : undefined);
    if (!text) return; // 空メッセージはスキップ

    // ユーザー名を取得
    const userName = await getUserDisplayName(client as SlackClient, userId);

    const userColor = generateUserColor(userId);
    console.log(`New comment from ${userName}: ${text}`);

    // カウンターをインクリメントしてブロードキャスト
    const newCount = incrementCommentCount();
    broadcast({ type: 'comment', text, userName, userColor });
    broadcast({ type: 'counter', count: newCount });
  });

  // サーバー起動
  const PORT = process.env['PORT'] || 3000;

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

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open this URL in OBS Browser Source');
  });
}

// テスト時は main() を実行しない
if (!process.env['VITEST']) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
