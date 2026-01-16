import { readFileSync } from 'fs';
import { createRequire } from 'module';
import type { StandardEmojiEntry } from '../types/index.js';

// 標準絵文字マップ（shortcode → 画像URL）
const standardEmojiMap = new Map<string, string>();

/**
 * 標準絵文字マップを初期化
 * emoji-datasource から shortcode → CDN URL のマッピングを構築
 */
export function initializeStandardEmojiMap(): void {
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

/**
 * 標準絵文字マップを取得（内部使用）
 */
export function getStandardEmojiMap(): Map<string, string> {
  return standardEmojiMap;
}
