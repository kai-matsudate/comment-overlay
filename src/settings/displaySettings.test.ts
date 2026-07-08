import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DISPLAY_SETTINGS,
  validateDisplaySettings,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  SPEED_MIN,
  SPEED_MAX,
} from './displaySettings.js';

describe('validateDisplaySettings', () => {
  const validSettings = {
    fontSizes: { large: 50, medium: 35, small: 20 },
    constantSpeedEnabled: true,
    speedPxPerSec: 150,
  };

  it('妥当な設定を受け入れる', () => {
    expect(validateDisplaySettings(validSettings)).toEqual(validSettings);
  });

  it('デフォルト設定を受け入れる', () => {
    expect(validateDisplaySettings(DEFAULT_DISPLAY_SETTINGS)).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('余分なプロパティは結果に含めない', () => {
    const input = { ...validSettings, extra: 'evil' };
    expect(validateDisplaySettings(input)).toEqual(validSettings);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['文字列', 'settings'],
    ['数値', 42],
    ['空オブジェクト', {}],
  ])('%s を拒否する', (_label, input) => {
    expect(validateDisplaySettings(input)).toBeNull();
  });

  it('fontSizes が欠けている場合は拒否する', () => {
    const { fontSizes: _fontSizes, ...rest } = validSettings;
    expect(validateDisplaySettings(rest)).toBeNull();
  });

  it.each([
    ['範囲未満', FONT_SIZE_MIN - 1],
    ['範囲超過', FONT_SIZE_MAX + 1],
    ['文字列', '40'],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('フォントサイズが不正(%s)な場合は拒否する', (_label, value) => {
    const input = {
      ...validSettings,
      fontSizes: { ...validSettings.fontSizes, large: value },
    };
    expect(validateDisplaySettings(input)).toBeNull();
  });

  it.each([
    ['範囲未満', SPEED_MIN - 1],
    ['範囲超過', SPEED_MAX + 1],
    ['文字列', '150'],
    ['NaN', NaN],
  ])('速度が不正(%s)な場合は拒否する', (_label, value) => {
    const input = { ...validSettings, speedPxPerSec: value };
    expect(validateDisplaySettings(input)).toBeNull();
  });

  it('constantSpeedEnabled が boolean でない場合は拒否する', () => {
    const input = { ...validSettings, constantSpeedEnabled: 'true' };
    expect(validateDisplaySettings(input)).toBeNull();
  });
});
