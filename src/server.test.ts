import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getUserDisplayName, clearUserCache, generateUserColor, type SlackClient } from './server.js';

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
