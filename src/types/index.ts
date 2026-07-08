// ============================================
// スレッド情報
// ============================================
export interface ThreadInfo {
  channelId: string;
  threadTs: string;
}

// ============================================
// WebSocketメッセージ
// ============================================
export interface CommentMessage {
  type: 'comment';
  text: string;
  userName: string;
  userColor: string;
  emojis?: Record<string, string>;
}

export interface CounterMessage {
  type: 'counter';
  count: number;
}

export interface SettingsMessage {
  type: 'settings';
  settings: DisplaySettings;
}

export type WebSocketMessage = CommentMessage | CounterMessage | SettingsMessage;

// ============================================
// 表示設定
// ============================================
export interface DisplaySettings {
  /** 文字数段階ごとのフォントサイズ (px) */
  fontSizes: {
    /** 1〜10文字 */
    large: number;
    /** 11〜30文字 */
    medium: number;
    /** 31文字以上 */
    small: number;
  };
  /** 速度一定モード（コメント幅によらず同じ速度で流す） */
  constantSpeedEnabled: boolean;
  /** 速度一定モード時の速度 (px/秒) */
  speedPxPerSec: number;
}

// ============================================
// ユーザーキャッシュ
// ============================================
export interface UserCache {
  displayName: string;
}

// ============================================
// Slack Client型（Slack WebClientの部分的な型）
// ============================================
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
// 絵文字キャッシュ
// ============================================
export interface EmojiCache {
  data: Map<string, string>;
  timestamp: number;
}

// ============================================
// 標準絵文字エントリ（emoji-datasource）
// ============================================
export interface StandardEmojiEntry {
  unified: string;
  short_name: string;
  short_names: string[];
  image: string;
  has_img_google: boolean;
}

// ============================================
// メッセージ処理結果
// ============================================
export interface ProcessedMessage {
  sanitizedText: string;
  emojis: Record<string, string>;
}
