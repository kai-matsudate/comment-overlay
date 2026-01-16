import type { SlackClient } from '../types/index.js';

/**
 * 既存のスレッドメッセージ数を取得
 * ページネーションに対応し、メッセージイベントと同じフィルタリング条件を適用
 */
export async function fetchInitialCommentCount(
  client: SlackClient,
  channelId: string,
  threadTs: string
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;

  try {
    do {
      const params: { channel: string; ts: string; limit: number; cursor?: string } = {
        channel: channelId,
        ts: threadTs,
        limit: 100,
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const result = await client.conversations.replies(params);
      const messages = result.messages ?? [];

      for (const msg of messages) {
        // 親メッセージを除外（ts === thread_ts）
        if (msg.ts === threadTs) continue;
        // subtype があるメッセージを除外
        if (msg.subtype) continue;
        // user がないメッセージを除外
        if (!msg.user) continue;
        // text が空のメッセージを除外
        if (!msg.text) continue;

        count += 1;
      }

      cursor = result.has_more ? result.response_metadata?.next_cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error('Failed to fetch initial comment count:', error);
    return 0;
  }

  return count;
}
