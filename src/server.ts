import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;
import express from 'express';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

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
  emojis?: Record<string, string>;
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
  emoji: {
    list: () => Promise<{
      ok: boolean;
      emoji?: Record<string, string>;
    }>;
  };
}

// ============================================
// 標準絵文字マップ
// ============================================

// emoji-datasource のエントリ型
interface StandardEmojiEntry {
  unified: string;
  short_name: string;
  short_names: string[];
  image: string;
  has_img_google: boolean;
}

// 標準絵文字マップ（shortcode → 画像URL）
const standardEmojiMap = new Map<string, string>();

/**
 * 標準絵文字マップを初期化
 * emoji-datasource から shortcode → CDN URL のマッピングを構築
 */
function initializeStandardEmojiMap(): void {
  const require = createRequire(import.meta.url);
  const emojiDataPath = require.resolve('emoji-datasource/emoji.json');
  const emojiData: StandardEmojiEntry[] = JSON.parse(
    readFileSync(emojiDataPath, 'utf-8')
  );

  for (const emoji of emojiData) {
    if (emoji.has_img_google) {
      const url = `https://cdn.jsdelivr.net/npm/emoji-datasource-google@16.0.0/img/google/64/${emoji.image}`;
      // short_name を登録
      standardEmojiMap.set(emoji.short_name, url);
      // short_names の全エイリアスも登録
      for (const name of emoji.short_names) {
        if (!standardEmojiMap.has(name)) {
          standardEmojiMap.set(name, url);
        }
      }
    }
  }
}

// 起動時に初期化
initializeStandardEmojiMap();

/**
 * 標準絵文字のURLを取得
 * @param shortcode 絵文字のshortcode（例: "fire", "thumbsup"）
 * @returns 画像URL、または見つからない場合は undefined
 */
export function getStandardEmojiUrl(shortcode: string): string | undefined {
  return standardEmojiMap.get(shortcode);
}

/**
 * 標準絵文字マップが初期化済みかどうか
 */
export function isStandardEmojiMapInitialized(): boolean {
  return standardEmojiMap.size > 0;
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

// ============================================
// 絵文字キャッシュ
// ============================================
interface EmojiCache {
  data: Map<string, string>;
  timestamp: number;
}

const EMOJI_CACHE_TTL = 60 * 60 * 1000; // 1時間
let emojiCache: EmojiCache | null = null;

/**
 * 絵文字キャッシュをクリア（テスト用）
 */
export function clearEmojiCache(): void {
  emojiCache = null;
}

/**
 * Slack APIから絵文字リストを取得（キャッシュ付き）
 * エイリアス絵文字（alias:xxx形式）は除外される
 */
export async function getEmojiList(client: SlackClient): Promise<Map<string, string>> {
  const now = Date.now();

  // キャッシュが有効な場合はキャッシュを返す
  if (emojiCache && now - emojiCache.timestamp < EMOJI_CACHE_TTL) {
    return emojiCache.data;
  }

  try {
    const result = await client.emoji.list();
    const emojiMap = new Map<string, string>();

    if (result.emoji) {
      for (const [name, url] of Object.entries(result.emoji)) {
        // エイリアス絵文字（alias:xxx形式）は除外
        if (!url.startsWith('alias:')) {
          emojiMap.set(name, url);
        }
      }
    }

    // キャッシュを更新
    emojiCache = {
      data: emojiMap,
      timestamp: now,
    };

    return emojiMap;
  } catch (error) {
    console.error('Failed to fetch emoji list:', error);
    return new Map();
  }
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
    // カスタム絵文字 :emoji_name: → 除去 (日本語文字をサポート)
    .replace(/:[a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+:/gi, '')
    // 連続空白を1つに
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// メッセージ処理（絵文字URL抽出付き）
// ============================================
export interface ProcessedMessage {
  sanitizedText: string;
  emojis: Record<string, string>;
}

/**
 * メッセージを処理し、サニタイズされたテキストと絵文字URLマップを返す
 * - メンション、リンクを除去
 * - 絵文字はテキスト内に保持し、URLマップを生成
 */
export function processMessage(
  text: string | undefined,
  emojiMap: Map<string, string>
): ProcessedMessage {
  if (!text) {
    return { sanitizedText: '', emojis: {} };
  }

  let processed = text;

  // 1. コードブロック → [コード] に置換（最優先：内部の装飾記号を保護）
  processed = processed.replace(/```[\s\S]*?```/g, '[コード]');

  // 2. インラインコード → マーカー除去
  processed = processed.replace(/`([^`]*)`/g, '$1');

  // 3. リンク処理 → [リンク] に置換
  // リンク（テキスト付き）<http://example.com|Click here>
  processed = processed.replace(/<https?:\/\/[^|>]+\|[^>]+>/g, '[リンク]');
  // リンク（テキストなし）<http://example.com>
  processed = processed.replace(/<https?:\/\/[^>]+>/g, '[リンク]');

  // 4. メンション <@U1234567890> → 除去（将来的に@ユーザー名に変換予定）
  processed = processed.replace(/<@[A-Z0-9]+>/gi, '');

  // 5. 残りの山括弧タグを除去（チャンネルリンクなど）
  processed = processed.replace(/<[^>]+>/g, '');

  // 6. ブロック引用 >>> を処理
  processed = processed.replace(/^>>>\s*/gm, '');

  // 7. 引用 > text → 記号除去
  processed = processed.replace(/^>\s*/gm, '');

  // 8. テキスト装飾の除去
  // 太字 *text*
  processed = processed.replace(/\*([^*]*)\*/g, '$1');
  // イタリック _text_
  processed = processed.replace(/_([^_]*)_/g, '$1');
  // 打ち消し線 ~text~
  processed = processed.replace(/~([^~]*)~/g, '$1');

  // 9. リスト処理
  // 順序なしリスト（•）を検出して1行化
  if (/^[•]\s/m.test(processed)) {
    const items = processed.split('\n')
      .map(line => line.replace(/^[•]\s*/, ''))
      .filter(line => line.trim() !== '');
    processed = items.join('・');
  }
  // 順序なしリスト（-）を検出して1行化
  else if (/^-\s/m.test(processed)) {
    const items = processed.split('\n')
      .map(line => line.replace(/^-\s*/, ''))
      .filter(line => line.trim() !== '');
    processed = items.join('・');
  }
  // 順序付きリストを検出して1行化
  else if (/^\d+\.\s/m.test(processed)) {
    const items: string[] = [];
    processed.split('\n').forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.*)$/);
      if (match) {
        items.push(`${match[1]}.${match[2]}`);
      } else if (line.trim()) {
        items.push(line.trim());
      }
    });
    processed = items.join(' ');
  }

  // 10. 改行を空白に変換
  processed = processed.replace(/\n/g, ' ');

  // 11. 連続空白を1つに
  processed = processed.replace(/\s+/g, ' ').trim();

  // 絵文字パターンを抽出してURLマップを生成 (日本語文字をサポート)
  const emojiPattern = /:([a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+):/gi;
  const emojis: Record<string, string> = {};

  let match;
  while ((match = emojiPattern.exec(processed)) !== null) {
    const emojiName = match[1]?.toLowerCase();
    if (emojiName) {
      // 1. カスタム絵文字を優先
      let url = emojiMap.get(emojiName);
      // 2. なければ標準絵文字を検索
      if (!url) {
        url = standardEmojiMap.get(emojiName);
      }
      if (url) {
        emojis[emojiName] = url;
      }
    }
  }

  return { sanitizedText: processed, emojis };
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
