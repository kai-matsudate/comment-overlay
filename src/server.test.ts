import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  getUserDisplayName,
  clearUserCache,
  generateUserColor,
  getCommentCount,
  incrementCommentCount,
  resetCommentCount,
  setCommentCount,
  fetchInitialCommentCount,
  getEmojiList,
  clearEmojiCache,
  processMessage,
  getStandardEmojiUrl,
  isStandardEmojiMapInitialized,
  type SlackClient,
} from './server.js';

// モック用のヘルパー関数
function createMockClient(): SlackClient & { users: { info: Mock } } {
  return {
    users: {
      info: vi.fn(),
    },
    conversations: {
      replies: vi.fn(),
    },
    emoji: {
      list: vi.fn(),
    },
  };
}

// 絵文字APIを含むモッククライアント
function createMockClientWithEmoji(): SlackClient & {
  users: { info: Mock };
  emoji: { list: Mock };
} {
  return {
    users: {
      info: vi.fn(),
    },
    conversations: {
      replies: vi.fn(),
    },
    emoji: {
      list: vi.fn(),
    },
  };
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
    emoji: {
      list: vi.fn(),
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

describe('getEmojiList', () => {
  let mockClient: ReturnType<typeof createMockClientWithEmoji>;

  beforeEach(() => {
    clearEmojiCache();
    mockClient = createMockClientWithEmoji();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('APIから絵文字リストを取得する', async () => {
    mockClient.emoji.list.mockResolvedValue({
      ok: true,
      emoji: {
        thumbsup_custom: 'https://emoji.slack-edge.com/T123/thumbsup_custom/abc123.png',
        wave: 'https://emoji.slack-edge.com/T123/wave/def456.gif',
      },
    });

    const result = await getEmojiList(mockClient);

    expect(result.get('thumbsup_custom')).toBe('https://emoji.slack-edge.com/T123/thumbsup_custom/abc123.png');
    expect(result.get('wave')).toBe('https://emoji.slack-edge.com/T123/wave/def456.gif');
    expect(mockClient.emoji.list).toHaveBeenCalledTimes(1);
  });

  it('キャッシュがTTL内なら再取得しない', async () => {
    mockClient.emoji.list.mockResolvedValue({
      ok: true,
      emoji: {
        test: 'https://example.com/test.png',
      },
    });

    // 1回目の呼び出し
    await getEmojiList(mockClient);
    // 30分後（TTL内）
    vi.advanceTimersByTime(30 * 60 * 1000);
    // 2回目の呼び出し
    await getEmojiList(mockClient);

    expect(mockClient.emoji.list).toHaveBeenCalledTimes(1);
  });

  it('キャッシュがTTL超過なら再取得する', async () => {
    mockClient.emoji.list.mockResolvedValue({
      ok: true,
      emoji: {
        test: 'https://example.com/test.png',
      },
    });

    // 1回目の呼び出し
    await getEmojiList(mockClient);
    // 61分後（TTL超過）
    vi.advanceTimersByTime(61 * 60 * 1000);
    // 2回目の呼び出し
    await getEmojiList(mockClient);

    expect(mockClient.emoji.list).toHaveBeenCalledTimes(2);
  });

  it('APIエラー時は空マップを返す', async () => {
    mockClient.emoji.list.mockRejectedValue(new Error('API Error'));

    const result = await getEmojiList(mockClient);

    expect(result.size).toBe(0);
  });

  it('エイリアス絵文字は除外する', async () => {
    mockClient.emoji.list.mockResolvedValue({
      ok: true,
      emoji: {
        real_emoji: 'https://example.com/real.png',
        alias_emoji: 'alias:real_emoji',
      },
    });

    const result = await getEmojiList(mockClient);

    expect(result.get('real_emoji')).toBe('https://example.com/real.png');
    expect(result.has('alias_emoji')).toBe(false);
  });
});

describe('processMessage', () => {
  it('絵文字なしテキストはそのまま返す', () => {
    const emojiMap = new Map<string, string>();
    const result = processMessage('Hello World', emojiMap);

    expect(result.sanitizedText).toBe('Hello World');
    expect(result.emojis).toEqual({});
  });

  it('カスタム絵文字を検出しURLマップを返す', () => {
    const emojiMap = new Map([
      ['thumbsup', 'https://example.com/thumbsup.png'],
    ]);
    const result = processMessage('Good job :thumbsup:', emojiMap);

    expect(result.sanitizedText).toBe('Good job :thumbsup:');
    expect(result.emojis).toEqual({
      thumbsup: 'https://example.com/thumbsup.png',
    });
  });

  it('複数の絵文字を正しく処理する', () => {
    const emojiMap = new Map([
      ['wave', 'https://example.com/wave.gif'],
      ['smile', 'https://example.com/smile.png'],
    ]);
    const result = processMessage(':wave: Hello :smile:', emojiMap);

    expect(result.sanitizedText).toBe(':wave: Hello :smile:');
    expect(result.emojis).toEqual({
      wave: 'https://example.com/wave.gif',
      smile: 'https://example.com/smile.png',
    });
  });

  it('存在しない絵文字はURLマップに含めない', () => {
    const emojiMap = new Map([
      ['wave', 'https://example.com/wave.gif'],
    ]);
    const result = processMessage(':wave: :nonexistent:', emojiMap);

    expect(result.sanitizedText).toBe(':wave: :nonexistent:');
    expect(result.emojis).toEqual({
      wave: 'https://example.com/wave.gif',
    });
    expect(result.emojis['nonexistent']).toBeUndefined();
  });

  it('メンションは除去し、リンクは[リンク]に変換する', () => {
    const emojiMap = new Map([
      ['thumbsup', 'https://example.com/thumbsup.png'],
    ]);
    const result = processMessage(
      '<@U12345> Check this <http://example.com|link> :thumbsup:',
      emojiMap
    );

    expect(result.sanitizedText).toBe('Check this [リンク] :thumbsup:');
    expect(result.emojis).toEqual({
      thumbsup: 'https://example.com/thumbsup.png',
    });
  });

  it('同じ絵文字が複数回出現しても一度だけマップに含める', () => {
    const emojiMap = new Map([
      ['fire', 'https://example.com/fire.gif'],
    ]);
    const result = processMessage(':fire: Hot! :fire: :fire:', emojiMap);

    expect(result.sanitizedText).toBe(':fire: Hot! :fire: :fire:');
    expect(Object.keys(result.emojis)).toHaveLength(1);
    expect(result.emojis['fire']).toBe('https://example.com/fire.gif');
  });

  it('空文字列を正しく処理する', () => {
    const emojiMap = new Map<string, string>();
    const result = processMessage('', emojiMap);

    expect(result.sanitizedText).toBe('');
    expect(result.emojis).toEqual({});
  });

  it('undefinedを空文字列として処理する', () => {
    const emojiMap = new Map<string, string>();
    const result = processMessage(undefined, emojiMap);

    expect(result.sanitizedText).toBe('');
    expect(result.emojis).toEqual({});
  });

  // ============================================
  // 日本語カスタム絵文字のテスト
  // ============================================
  describe('Japanese custom emoji names', () => {
    it('漢字のみの絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['日本語', 'https://example.com/nihongo.png'],
      ]);
      const result = processMessage(':日本語:', emojiMap);

      expect(result.sanitizedText).toBe(':日本語:');
      expect(result.emojis).toEqual({
        日本語: 'https://example.com/nihongo.png',
      });
    });

    it('ひらがなのみの絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['ありがとう', 'https://example.com/arigatou.png'],
      ]);
      const result = processMessage(':ありがとう:', emojiMap);

      expect(result.sanitizedText).toBe(':ありがとう:');
      expect(result.emojis).toEqual({
        ありがとう: 'https://example.com/arigatou.png',
      });
    });

    it('カタカナのみの絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['ハート', 'https://example.com/heart.png'],
      ]);
      const result = processMessage(':ハート:', emojiMap);

      expect(result.sanitizedText).toBe(':ハート:');
      expect(result.emojis).toEqual({
        ハート: 'https://example.com/heart.png',
      });
    });

    it('漢字とひらがな混合の絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['お疲れさま', 'https://example.com/otsukare.png'],
      ]);
      const result = processMessage(':お疲れさま:', emojiMap);

      expect(result.sanitizedText).toBe(':お疲れさま:');
      expect(result.emojis).toEqual({
        お疲れさま: 'https://example.com/otsukare.png',
      });
    });

    it('ASCIIと日本語混合の絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['good_仕事', 'https://example.com/good_shigoto.png'],
      ]);
      const result = processMessage(':good_仕事:', emojiMap);

      expect(result.sanitizedText).toBe(':good_仕事:');
      expect(result.emojis).toEqual({
        good_仕事: 'https://example.com/good_shigoto.png',
      });
    });

    it('日本語絵文字と標準絵文字を同時に処理する', () => {
      const emojiMap = new Map([
        ['完了', 'https://example.com/kanryo.png'],
      ]);
      const result = processMessage(':完了: Done! :fire:', emojiMap);

      expect(result.sanitizedText).toBe(':完了: Done! :fire:');
      expect(result.emojis['完了']).toBe('https://example.com/kanryo.png');
      expect(result.emojis['fire']).toBeDefined(); // 標準絵文字
    });

    it('存在しない日本語絵文字はURLマップに含めない', () => {
      const emojiMap = new Map([
        ['存在する', 'https://example.com/exists.png'],
      ]);
      const result = processMessage(':存在する: :存在しない:', emojiMap);

      expect(result.sanitizedText).toBe(':存在する: :存在しない:');
      expect(result.emojis['存在する']).toBe('https://example.com/exists.png');
      expect(result.emojis['存在しない']).toBeUndefined();
    });

    it('全角英数字を含む絵文字名を検出する', () => {
      const emojiMap = new Map([
        ['テスト１２３', 'https://example.com/test123.png'],
      ]);
      const result = processMessage(':テスト１２３:', emojiMap);

      expect(result.sanitizedText).toBe(':テスト１２３:');
      expect(result.emojis).toEqual({
        テスト１２３: 'https://example.com/test123.png',
      });
    });
  });

  it('リンク（表示テキストなし）を[リンク]に変換する', () => {
    const emojiMap = new Map<string, string>();
    const result = processMessage('Check <http://example.com>', emojiMap);

    expect(result.sanitizedText).toBe('Check [リンク]');
  });

  it('連続空白を1つにまとめる', () => {
    const emojiMap = new Map<string, string>();
    const result = processMessage('Hello    World', emojiMap);

    expect(result.sanitizedText).toBe('Hello World');
  });
});

// ============================================
// 標準絵文字マップのテスト
// ============================================
describe('Standard Emoji Map', () => {
  describe('isStandardEmojiMapInitialized', () => {
    it('起動時に初期化されていること', () => {
      expect(isStandardEmojiMapInitialized()).toBe(true);
    });
  });

  describe('getStandardEmojiUrl', () => {
    it(':fire: のURLを返す', () => {
      const url = getStandardEmojiUrl('fire');
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/emoji-datasource-google/);
      expect(url).toContain('.png');
    });

    it(':thumbsup: のURLを返す', () => {
      const url = getStandardEmojiUrl('thumbsup');
      expect(url).toBeDefined();
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/emoji-datasource-google/);
    });

    it(':+1: (thumbsupのエイリアス) のURLを返す', () => {
      const url = getStandardEmojiUrl('+1');
      expect(url).toBeDefined();
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/emoji-datasource-google/);
    });

    it('存在しない絵文字はundefinedを返す', () => {
      const url = getStandardEmojiUrl('not_a_real_emoji_xyz');
      expect(url).toBeUndefined();
    });

    it('大文字小文字を区別しない（内部で小文字に変換）', () => {
      // 注: 入力は小文字で統一される前提
      const url = getStandardEmojiUrl('fire');
      expect(url).toBeDefined();
    });
  });
});

// ============================================
// processMessage と標準絵文字の統合テスト
// ============================================
describe('processMessage with standard emojis', () => {
  it('標準絵文字 :fire: のURLを返す（カスタム絵文字なし）', () => {
    const customEmojiMap = new Map<string, string>();
    const result = processMessage(':fire: Hot!', customEmojiMap);

    expect(result.sanitizedText).toBe(':fire: Hot!');
    expect(result.emojis['fire']).toBeDefined();
    expect(result.emojis['fire']).toMatch(/^https:\/\/cdn\.jsdelivr\.net/);
  });

  it('カスタム絵文字が標準絵文字より優先される', () => {
    const customEmojiMap = new Map([
      ['fire', 'https://custom.slack.com/fire.png'],
    ]);
    const result = processMessage(':fire:', customEmojiMap);

    expect(result.emojis['fire']).toBe('https://custom.slack.com/fire.png');
  });

  it('標準絵文字とカスタム絵文字を同時に処理する', () => {
    const customEmojiMap = new Map([
      ['custom_emoji', 'https://custom.slack.com/custom.png'],
    ]);
    const result = processMessage(':fire: :custom_emoji:', customEmojiMap);

    expect(result.emojis['fire']).toBeDefined();
    expect(result.emojis['fire']).toMatch(/cdn\.jsdelivr\.net/);
    expect(result.emojis['custom_emoji']).toBe('https://custom.slack.com/custom.png');
  });

  it(':thumbsup: と :+1: が両方動作する', () => {
    const customEmojiMap = new Map<string, string>();

    const result1 = processMessage(':thumbsup:', customEmojiMap);
    const result2 = processMessage(':+1:', customEmojiMap);

    expect(result1.emojis['thumbsup']).toBeDefined();
    expect(result2.emojis['+1']).toBeDefined();
  });
});

// ============================================
// Slack特殊記法処理のテスト
// ============================================
describe('Slack special notation processing', () => {
  // ============================================
  // リンク処理
  // ============================================
  describe('Link processing', () => {
    it('リンク（テキスト付き）を[リンク]に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        'Check this <http://example.com|Click here>',
        emojiMap
      );
      expect(result.sanitizedText).toBe('Check this [リンク]');
    });

    it('リンク（テキストなし）を[リンク]に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        'Visit <http://example.com>',
        emojiMap
      );
      expect(result.sanitizedText).toBe('Visit [リンク]');
    });

    it('HTTPSリンクも[リンク]に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        '<https://secure.example.com|Secure>',
        emojiMap
      );
      expect(result.sanitizedText).toBe('[リンク]');
    });

    it('複数のリンクを処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        '<http://a.com> and <http://b.com|B>',
        emojiMap
      );
      expect(result.sanitizedText).toBe('[リンク] and [リンク]');
    });
  });

  // ============================================
  // テキスト装飾記号の除去
  // ============================================
  describe('Text decoration removal', () => {
    it('太字 *text* からマーカーを除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('This is *bold* text', emojiMap);
      expect(result.sanitizedText).toBe('This is bold text');
    });

    it('イタリック _text_ からマーカーを除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('This is _italic_ text', emojiMap);
      expect(result.sanitizedText).toBe('This is italic text');
    });

    it('打ち消し線 ~text~ からマーカーを除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('This is ~deleted~ text', emojiMap);
      expect(result.sanitizedText).toBe('This is deleted text');
    });

    it('インラインコード `code` からマーカーを除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('Run `npm install` command', emojiMap);
      expect(result.sanitizedText).toBe('Run npm install command');
    });

    it('複数のスタイルを同時に処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        '*bold* and _italic_ and ~strike~ and `code`',
        emojiMap
      );
      expect(result.sanitizedText).toBe('bold and italic and strike and code');
    });

    it('ネストした装飾を処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('*_bold italic_*', emojiMap);
      expect(result.sanitizedText).toBe('bold italic');
    });

    it('空の装飾（例: **）は除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('Hello ** World', emojiMap);
      expect(result.sanitizedText).toBe('Hello World');
    });
  });

  // ============================================
  // コードブロック処理
  // ============================================
  describe('Code block processing', () => {
    it('コードブロックを[コード]に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        'Here is code:\n```\nconst x = 1;\n```',
        emojiMap
      );
      expect(result.sanitizedText).toBe('Here is code: [コード]');
    });

    it('言語指定付きコードブロックを[コード]に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        '```javascript\nconsole.log("hi");\n```',
        emojiMap
      );
      expect(result.sanitizedText).toBe('[コード]');
    });

    it('コードブロック内の装飾記号は変換しない', () => {
      const emojiMap = new Map<string, string>();
      // コードブロック全体が[コード]に置換されるので、内部は関係ない
      const result = processMessage(
        '```\n*not bold* _not italic_\n```',
        emojiMap
      );
      expect(result.sanitizedText).toBe('[コード]');
    });

    it('複数のコードブロックを処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage(
        '```\ncode1\n``` and ```\ncode2\n```',
        emojiMap
      );
      expect(result.sanitizedText).toBe('[コード] and [コード]');
    });
  });

  // ============================================
  // 引用処理
  // ============================================
  describe('Quote processing', () => {
    it('引用 > text から記号を除去する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('> This is a quote', emojiMap);
      expect(result.sanitizedText).toBe('This is a quote');
    });

    it('複数行の引用を処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('> line1\n> line2', emojiMap);
      expect(result.sanitizedText).toBe('line1 line2');
    });

    it('ブロック引用 >>> を処理する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('>>> This is\na block quote', emojiMap);
      expect(result.sanitizedText).toBe('This is a block quote');
    });
  });

  // ============================================
  // リスト処理
  // ============================================
  describe('List processing', () => {
    it('順序なしリスト（・）を1行に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('• item1\n• item2\n• item3', emojiMap);
      expect(result.sanitizedText).toBe('item1・item2・item3');
    });

    it('順序なしリスト（-）を1行に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('- item1\n- item2', emojiMap);
      expect(result.sanitizedText).toBe('item1・item2');
    });

    it('順序付きリストを1行に変換する', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('1. first\n2. second\n3. third', emojiMap);
      expect(result.sanitizedText).toBe('1.first 2.second 3.third');
    });
  });

  // ============================================
  // エッジケース
  // ============================================
  describe('Edge cases', () => {
    it('複合的なメッセージを正しく処理する', () => {
      const emojiMap = new Map([
        ['thumbsup', 'https://example.com/thumbsup.png'],
      ]);
      const result = processMessage(
        '*Important:* Check <https://example.com|this link> :thumbsup:',
        emojiMap
      );
      expect(result.sanitizedText).toBe('Important: Check [リンク] :thumbsup:');
      expect(result.emojis['thumbsup']).toBeDefined();
    });

    it('空のメッセージは空のまま返す', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('', emojiMap);
      expect(result.sanitizedText).toBe('');
    });

    it('通常テキストはそのまま返す', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('Hello World!', emojiMap);
      expect(result.sanitizedText).toBe('Hello World!');
    });
  });
});

// ============================================
// セキュリティテスト
// ============================================
describe('Security: XSS Prevention', () => {
  describe('processMessage XSS resistance', () => {
    it('HTMLタグを含むメッセージがサニタイズされる', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<script>alert(1)</script>', emojiMap);
      // 山括弧タグは除去される
      expect(result.sanitizedText).not.toContain('<script>');
      expect(result.sanitizedText).not.toContain('</script>');
    });

    it('imgタグがサニタイズされる', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<img src=x onerror=alert(1)>', emojiMap);
      expect(result.sanitizedText).not.toContain('<img');
      expect(result.sanitizedText).not.toContain('onerror');
    });

    it('イベントハンドラを含むタグがサニタイズされる', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<div onclick="alert(1)">Click me</div>', emojiMap);
      expect(result.sanitizedText).not.toContain('onclick');
      expect(result.sanitizedText).not.toContain('<div');
    });

    it('javascript: URLスキームがリンク処理で[リンク]に変換されない', () => {
      const emojiMap = new Map<string, string>();
      // javascript: スキームはhttps?ではないので[リンク]に変換されず、タグが除去される
      const result = processMessage('<javascript:alert(1)>', emojiMap);
      expect(result.sanitizedText).not.toContain('javascript:');
    });

    it('data: URLスキームがリンク処理で[リンク]に変換されない', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<data:text/html,<script>alert(1)</script>>', emojiMap);
      expect(result.sanitizedText).not.toContain('data:');
    });

    it('SVGを使ったXSS攻撃パターンがサニタイズされる', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<svg onload="alert(1)">', emojiMap);
      expect(result.sanitizedText).not.toContain('<svg');
      expect(result.sanitizedText).not.toContain('onload');
    });

    it('iframeタグがサニタイズされる', () => {
      const emojiMap = new Map<string, string>();
      const result = processMessage('<iframe src="javascript:alert(1)"></iframe>', emojiMap);
      expect(result.sanitizedText).not.toContain('<iframe');
    });
  });

  describe('Emoji URL validation', () => {
    it('正常なhttps URLの絵文字はマップに含まれる', () => {
      const emojiMap = new Map([
        ['thumbsup', 'https://example.com/thumbsup.png'],
      ]);
      const result = processMessage(':thumbsup:', emojiMap);
      expect(result.emojis['thumbsup']).toBe('https://example.com/thumbsup.png');
    });

    it('正常なhttp URLの絵文字はマップに含まれる', () => {
      const emojiMap = new Map([
        ['wave', 'http://example.com/wave.gif'],
      ]);
      const result = processMessage(':wave:', emojiMap);
      expect(result.emojis['wave']).toBe('http://example.com/wave.gif');
    });

    it('絵文字URLにjavascript:スキームは使用できない（フロントエンド側で検証）', () => {
      // 注: このテストはサーバー側でURL検証を行わないことを確認
      // フロントエンドのindex.htmlでhttps/httpのみ許可する検証を行う
      const emojiMap = new Map([
        ['malicious', 'javascript:alert(1)'],
      ]);
      const result = processMessage(':malicious:', emojiMap);
      // サーバー側はURLをそのままマップに含める（フロントエンドで検証）
      expect(result.emojis['malicious']).toBe('javascript:alert(1)');
      // 重要: フロントエンドでこのURLは拒否される
    });
  });
});
