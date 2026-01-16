import type { SlackClient, EmojiCache } from '../types/index.js';

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
