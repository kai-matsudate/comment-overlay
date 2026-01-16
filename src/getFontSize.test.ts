import { describe, it, expect } from 'vitest';
import { getFontSize } from './getFontSize.js';

describe('getFontSize', () => {
  describe('短いコメント（1〜10文字）', () => {
    it('1文字のコメントは40pxを返す', () => {
      expect(getFontSize('草')).toBe(40);
    });

    it('10文字ちょうどのコメントは40pxを返す', () => {
      expect(getFontSize('1234567890')).toBe(40);
    });
  });

  describe('中程度のコメント（11〜30文字）', () => {
    it('11文字のコメントは32pxを返す', () => {
      expect(getFontSize('12345678901')).toBe(32);
    });

    it('通常のコメント（例: 「今日も配信ありがとう！」）は32pxを返す', () => {
      expect(getFontSize('今日も配信ありがとう！')).toBe(32);
    });

    it('30文字ちょうどのコメントは32pxを返す', () => {
      expect(getFontSize('123456789012345678901234567890')).toBe(32);
    });
  });

  describe('長いコメント（31文字以上）', () => {
    it('31文字のコメントは24pxを返す', () => {
      expect(getFontSize('1234567890123456789012345678901')).toBe(24);
    });

    it('非常に長いコメントは24pxを返す', () => {
      const longText = 'a'.repeat(100);
      expect(getFontSize(longText)).toBe(24);
    });
  });

  describe('エッジケース', () => {
    it('空文字列は40pxを返す（最小サイズではなく最大サイズ）', () => {
      expect(getFontSize('')).toBe(40);
    });
  });
});
