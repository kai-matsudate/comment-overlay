import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  getUserDisplayName,
  clearUserCache,
  generateUserColor,
  getCommentCount,
  incrementCommentCount,
  resetCommentCount,
  setCommentCount,
  fetchInitialCommentCount,
  type SlackClient,
} from './server.js';

// モック用のヘルパー関数
function createMockClient(): SlackClient & { users: { info: Mock } } {
  return {
    users: {
      info: vi.fn(),
    },
  } as SlackClient & { users: { info: Mock } };
}

describe('getUserDisplayName', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    // 各テスト前にキャッシュをクリア
    clearUserCache();

    // モッククライアントを作成
    mockClient = createMockClient();
  });

  it('should return display_name when available', async () => {
    mockClient.users.info.mockResolvedValue({
      ok: true,
      user: {
        profile: {
          display_name: '田中太郎',
          real_name: 'Taro Tanaka',
        },
      },
    });

    const result = await getUserDisplayName(mockClient, 'U123456');

    expect(result).toBe('田中太郎');
    expect(mockClient.users.info).toHaveBeenCalledWith({ user: 'U123456' });
  });

  it('should fallback to real_name when display_name is empty', async () => {
    mockClient.users.info.mockResolvedValue({
      ok: true,
      user: {
        profile: {
          display_name: '',
          real_name: 'Taro Tanaka',
        },
      },
    });

    const result = await getUserDisplayName(mockClient, 'U123456');

    expect(result).toBe('Taro Tanaka');
  });

  it('should return "Unknown User" when API call fails', async () => {
    mockClient.users.info.mockRejectedValue(new Error('API Error'));

    const result = await getUserDisplayName(mockClient, 'U123456');

    expect(result).toBe('Unknown User');
  });

  it('should use cached value on subsequent calls', async () => {
    mockClient.users.info.mockResolvedValue({
      ok: true,
      user: {
        profile: {
          display_name: '田中太郎',
          real_name: 'Taro Tanaka',
        },
      },
    });

    // 1回目の呼び出し
    const result1 = await getUserDisplayName(mockClient, 'U123456');
    // 2回目の呼び出し（キャッシュから取得されるはず）
    const result2 = await getUserDisplayName(mockClient, 'U123456');

    expect(result1).toBe('田中太郎');
    expect(result2).toBe('田中太郎');
    // APIは1回だけ呼ばれるはず
    expect(mockClient.users.info).toHaveBeenCalledTimes(1);
  });

  it('should return "Unknown User" when user profile is missing', async () => {
    mockClient.users.info.mockResolvedValue({
      ok: true,
      user: {},
    });

    const result = await getUserDisplayName(mockClient, 'U123456');

    expect(result).toBe('Unknown User');
  });
});

describe('generateUserColor', () => {
  it('should return consistent color for same userId', () => {
    const color1 = generateUserColor('U12345');
    const color2 = generateUserColor('U12345');
    expect(color1).toBe(color2);
  });

  it('should return different colors for different userIds', () => {
    const color1 = generateUserColor('U12345');
    const color2 = generateUserColor('U67890');
    expect(color1).not.toBe(color2);
  });

  it('should return valid HSL format', () => {
    const color = generateUserColor('U12345');
    expect(color).toMatch(/^hsl\(\d{1,3}, 80%, 65%\)$/);
  });

  it('should handle empty string without error', () => {
    const color = generateUserColor('');
    expect(color).toMatch(/^hsl\(\d{1,3}, 80%, 65%\)$/);
  });
});

describe('Comment Counter', () => {
  beforeEach(() => {
    resetCommentCount();
  });

  describe('getCommentCount', () => {
    it('初期値は0を返す', () => {
      expect(getCommentCount()).toBe(0);
    });
  });

  describe('incrementCommentCount', () => {
    it('カウントをインクリメントして新しい値を返す', () => {
      expect(incrementCommentCount()).toBe(1);
      expect(incrementCommentCount()).toBe(2);
    });
  });

  describe('resetCommentCount', () => {
    it('カウントを0にリセットする', () => {
      incrementCommentCount();
      resetCommentCount();
      expect(getCommentCount()).toBe(0);
    });
  });

  describe('setCommentCount', () => {
    it('指定した値にカウントを設定する', () => {
      setCommentCount(42);
      expect(getCommentCount()).toBe(42);
    });

    it('0に設定できる', () => {
      incrementCommentCount();
      setCommentCount(0);
      expect(getCommentCount()).toBe(0);
    });
  });
});

// モック用のヘルパー関数（conversations.replies を含む）
function createMockClientWithReplies(): SlackClient & {
  users: { info: Mock };
  conversations: { replies: Mock };
} {
  return {
    users: {
      info: vi.fn(),
    },
    conversations: {
      replies: vi.fn(),
    },
  };
}

describe('fetchInitialCommentCount', () => {
  let mockClient: ReturnType<typeof createMockClientWithReplies>;

  beforeEach(() => {
    mockClient = createMockClientWithReplies();
    resetCommentCount();
  });

  it('返信メッセージを正しくカウントする（親メッセージを除く）', async () => {
    mockClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親メッセージ' },
        { ts: '1705200001.000001', thread_ts: '1705200000.000000', user: 'U2', text: '返信1' },
        { ts: '1705200002.000002', thread_ts: '1705200000.000000', user: 'U3', text: '返信2' },
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(2); // 親を除いた返信のみ
    expect(mockClient.conversations.replies).toHaveBeenCalledWith({
      channel: 'C123',
      ts: '1705200000.000000',
      limit: 100,
    });
  });

  it('subtype ありのメッセージを除外する', async () => {
    mockClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親' },
        { ts: '1705200001.000001', thread_ts: '1705200000.000000', user: 'U2', text: '通常返信' },
        { ts: '1705200002.000002', thread_ts: '1705200000.000000', user: 'U3', text: '編集済み', subtype: 'message_changed' },
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(1); // subtype ありを除外
  });

  it('user なしのメッセージを除外する', async () => {
    mockClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親' },
        { ts: '1705200001.000001', thread_ts: '1705200000.000000', user: 'U2', text: '通常返信' },
        { ts: '1705200002.000002', thread_ts: '1705200000.000000', text: 'ボットメッセージ' },
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(1); // user なしを除外
  });

  it('空の text を除外する', async () => {
    mockClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親' },
        { ts: '1705200001.000001', thread_ts: '1705200000.000000', user: 'U2', text: '通常返信' },
        { ts: '1705200002.000002', thread_ts: '1705200000.000000', user: 'U3', text: '' },
        { ts: '1705200003.000003', thread_ts: '1705200000.000000', user: 'U4' }, // text がない
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(1); // 空 text を除外
  });

  it('ページネーションを処理する', async () => {
    // 1ページ目
    mockClient.conversations.replies.mockResolvedValueOnce({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親' },
        { ts: '1705200001.000001', thread_ts: '1705200000.000000', user: 'U2', text: '返信1' },
      ],
      has_more: true,
      response_metadata: { next_cursor: 'cursor123' },
    });
    // 2ページ目
    mockClient.conversations.replies.mockResolvedValueOnce({
      ok: true,
      messages: [
        { ts: '1705200002.000002', thread_ts: '1705200000.000000', user: 'U3', text: '返信2' },
        { ts: '1705200003.000003', thread_ts: '1705200000.000000', user: 'U4', text: '返信3' },
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(3); // 全ページの返信をカウント
    expect(mockClient.conversations.replies).toHaveBeenCalledTimes(2);
    expect(mockClient.conversations.replies).toHaveBeenNthCalledWith(2, {
      channel: 'C123',
      ts: '1705200000.000000',
      limit: 100,
      cursor: 'cursor123',
    });
  });

  it('APIエラー時は0を返す', async () => {
    mockClient.conversations.replies.mockRejectedValue(new Error('API Error'));

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(0);
  });

  it('空のスレッドは0を返す', async () => {
    mockClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1705200000.000000', thread_ts: '1705200000.000000', user: 'U1', text: '親メッセージのみ' },
      ],
      has_more: false,
    });

    const count = await fetchInitialCommentCount(mockClient, 'C123', '1705200000.000000');

    expect(count).toBe(0); // 返信なし
  });
});
