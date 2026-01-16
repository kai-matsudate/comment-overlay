/**
 * コメントの文字数に応じたフォントサイズを返す
 *
 * | 文字数 | フォントサイズ |
 * |--------|---------------|
 * | 1〜10文字 | 40px (大) |
 * | 11〜30文字 | 32px (中) |
 * | 31文字以上 | 24px (小) |
 *
 * @param text コメントテキスト
 * @returns フォントサイズ（px）
 */
export function getFontSize(text: string): number {
  const length = text.length;
  if (length <= 10) return 40;
  if (length <= 30) return 32;
  return 24;
}
