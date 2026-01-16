import type { UserCache, SlackClient } from '../types/index.js';

// ============================================
// ユーザーキャッシュ
// ============================================
const userCache = new Map<string, UserCache>();

/**
 * キャッシュをクリア（テスト用）
 */
export function clearUserCache(): void {
  userCache.clear();
}

/**
 * ユーザーIDからHSL色を生成
 * 同一ユーザーは常に同じ色を返す
 */
export function generateUserColor(userId: string): string {
  let hash = 0;
  for (const char of userId) {
    hash = (hash + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 80%, 65%)`;
}

/**
 * ユーザーIDから表示名を取得
 * キャッシュがあればキャッシュから、なければSlack APIから取得
 */
export async function getUserDisplayName(
  client: SlackClient,
  userId: string
): Promise<string> {
  // キャッシュ確認
  const cached = userCache.get(userId);
  if (cached) {
    return cached.displayName;
  }

  try {
    const result = await client.users.info({ user: userId });
    const profile = result.user?.profile;
    const displayName = profile?.display_name || profile?.real_name || 'Unknown User';

    // 空文字の場合も "Unknown User" にフォールバック
    const finalName = displayName || 'Unknown User';

    // キャッシュに保存
    userCache.set(userId, { displayName: finalName });

    return finalName;
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
    return 'Unknown User';
  }
}
