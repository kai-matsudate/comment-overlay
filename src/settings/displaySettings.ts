import type { DisplaySettings } from '../types/index.js';

// フォントサイズの許容範囲 (px)
// 上限はレーン高さ（画面高の8%、1080px画面で約86px）を超えて表示が崩れない値とする
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 80;

// 速度の許容範囲 (px/秒)
// 下限が低すぎるとコメントがレーンを長時間占有し、レーン枯渇による重なりが起きるため50以上とする
export const SPEED_MIN = 50;
export const SPEED_MAX = 2000;

/**
 * 表示設定のデフォルト値
 * オーバーレイ起動時は常にこの値で開始する
 */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSizes: { large: 40, medium: 32, small: 24 },
  constantSpeedEnabled: false,
  speedPxPerSec: 150,
};

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 表示設定のバリデーション
 * @param input 外部からの入力（リクエストボディ等）
 * @returns 妥当な場合は正規化済みの DisplaySettings、不正な場合は null
 */
export function validateDisplaySettings(input: unknown): DisplaySettings | null {
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;

  const fontSizes = obj['fontSizes'];
  if (typeof fontSizes !== 'object' || fontSizes === null) return null;
  const fs = fontSizes as Record<string, unknown>;

  const large = fs['large'];
  const medium = fs['medium'];
  const small = fs['small'];
  if (
    !isNumberInRange(large, FONT_SIZE_MIN, FONT_SIZE_MAX) ||
    !isNumberInRange(medium, FONT_SIZE_MIN, FONT_SIZE_MAX) ||
    !isNumberInRange(small, FONT_SIZE_MIN, FONT_SIZE_MAX)
  ) {
    return null;
  }

  const constantSpeedEnabled = obj['constantSpeedEnabled'];
  if (typeof constantSpeedEnabled !== 'boolean') return null;

  const speedPxPerSec = obj['speedPxPerSec'];
  if (!isNumberInRange(speedPxPerSec, SPEED_MIN, SPEED_MAX)) return null;

  return {
    fontSizes: { large, medium, small },
    constantSpeedEnabled,
    speedPxPerSec,
  };
}
