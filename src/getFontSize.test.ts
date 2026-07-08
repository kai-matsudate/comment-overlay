import { describe, it, expect } from 'vitest';
import { getFontSize } from './getFontSize.js';
import { DEFAULT_DISPLAY_SETTINGS } from './settings/displaySettings.js';

const defaultSizes = DEFAULT_DISPLAY_SETTINGS.fontSizes;

describe('getFontSize', () => {
  describe('短いコメント（1〜10文字）', () => {
    it('1文字のコメントは40pxを返す', () => {
      expect(getFontSize('草', defaultSizes)).toBe(40);
    });

    it('10文字ちょうどのコメントは40pxを返す', () => {
      expect(getFontSize('1234567890', defaultSizes)).toBe(40);
    });
  });

  describe('中程度のコメント（11〜30文字）', () => {
    it('11文字のコメントは32pxを返す', () => {
      expect(getFontSize('12345678901', defaultSizes)).toBe(32);
    });

    it('通常のコメント（例: 「今日も配信ありがとう！」）は32pxを返す', () => {
      expect(getFontSize('今日も配信ありがとう！', defaultSizes)).toBe(32);
    });

    it('30文字ちょうどのコメントは32pxを返す', () => {
      expect(getFontSize('123456789012345678901234567890', defaultSizes)).toBe(32);
    });
  });

  describe('長いコメント（31文字以上）', () => {
    it('31文字のコメントは24pxを返す', () => {
      expect(getFontSize('1234567890123456789012345678901', defaultSizes)).toBe(24);
    });

    it('非常に長いコメントは24pxを返す', () => {
      const longText = 'a'.repeat(100);
      expect(getFontSize(longText, defaultSizes)).toBe(24);
    });
  });

  describe('エッジケース', () => {
    it('空文字列は40pxを返す（最小サイズではなく最大サイズ）', () => {
      expect(getFontSize('', defaultSizes)).toBe(40);
    });
  });

  describe('カスタム設定', () => {
    const customSizes = { large: 50, medium: 35, small: 20 };

    it('文字数段階ごとに設定されたサイズを返す', () => {
      expect(getFontSize('短い', customSizes)).toBe(50);
      expect(getFontSize('a'.repeat(20), customSizes)).toBe(35);
      expect(getFontSize('a'.repeat(31), customSizes)).toBe(20);
    });
  });
});
