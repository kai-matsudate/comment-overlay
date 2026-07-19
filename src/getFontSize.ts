import type { DisplaySettings } from './types/index.js';

/**
 * コメントの文字数に応じたフォントサイズを返す
 *
 * | 文字数 | フォントサイズ |
 * |--------|---------------|
 * | 1〜10文字 | fontSizes.large（デフォルト40px） |
 * | 11〜30文字 | fontSizes.medium（デフォルト32px） |
 * | 31文字以上 | fontSizes.small（デフォルト24px） |
 *
 * @param text コメントテキスト
 * @param fontSizes 文字数段階ごとのフォントサイズ設定
 * @returns フォントサイズ（px）
 */
export function getFontSize(text: string, fontSizes: DisplaySettings['fontSizes']): number {
  const length = text.length;
  if (length <= 10) return fontSizes.large;
  if (length <= 30) return fontSizes.medium;
  return fontSizes.small;
}
