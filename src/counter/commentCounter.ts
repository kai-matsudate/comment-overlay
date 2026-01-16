// ============================================
// コメントカウンター - インターフェース
// ============================================
export interface CommentCounter {
  getCount: () => number;
  increment: () => number;
  set: (value: number) => void;
  reset: () => void;
}

// ============================================
// コメントカウンター - ファクトリ関数
// ============================================

/**
 * 独立したコメントカウンターインスタンスを生成
 * テスト時に状態汚染を防ぐために使用できる
 */
export function createCommentCounter(): CommentCounter {
  let count = 0;
  return {
    getCount: () => count,
    increment: () => ++count,
    set: (value: number) => {
      count = value;
    },
    reset: () => {
      count = 0;
    },
  };
}

// ============================================
// コメントカウンター - グローバルインスタンス（後方互換性のため）
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
