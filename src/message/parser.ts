import type { ThreadInfo, ProcessedMessage } from '../types/index.js';
import { getStandardEmojiMap } from '../emoji/index.js';

// ============================================
// スレッドURL解析
// ============================================
export function parseThreadUrl(url: string): ThreadInfo {
  // https://xxx.slack.com/archives/C1234567890/p1705200000000000
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/i);
  if (!match) {
    throw new Error('Invalid Slack thread URL. Expected format: https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP');
  }

  const channelId = match[1];
  const rawTs = match[2];

  // noUncheckedIndexedAccess対応: matchが成功した場合、グループ1,2は必ず存在する
  if (!channelId || !rawTs) {
    throw new Error('Failed to extract channel ID or timestamp from URL');
  }

  // p1705200000000000 → 1705200000.000000
  const threadTs = rawTs.slice(0, 10) + '.' + rawTs.slice(10);

  return { channelId, threadTs };
}

// ============================================
// メッセージ変換（Slack記法の除去）- 未使用だが将来の拡張用に保持
// ============================================
export function sanitizeMessage(text: string | undefined): string {
  if (!text) return '';

  return text
    // メンション <@U1234567890> → 除去
    .replace(/<@[A-Z0-9]+>/gi, '')
    // リンク <http://example.com|表示テキスト> → 表示テキスト
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    // リンク（表示テキストなし）<http://example.com> → 除去
    .replace(/<[^>]+>/g, '')
    // カスタム絵文字 :emoji_name: → 除去 (日本語文字をサポート)
    .replace(/:[a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+:/gi, '')
    // 連続空白を1つに
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// メッセージ処理（絵文字URL抽出付き）
// ============================================

/**
 * メッセージを処理し、サニタイズされたテキストと絵文字URLマップを返す
 * - メンション、リンクを除去
 * - 絵文字はテキスト内に保持し、URLマップを生成
 */
export function processMessage(
  text: string | undefined,
  emojiMap: Map<string, string>
): ProcessedMessage {
  if (!text) {
    return { sanitizedText: '', emojis: {} };
  }

  let processed = text;

  // 1. コードブロック → [コード] に置換（最優先：内部の装飾記号を保護）
  processed = processed.replace(/```[\s\S]*?```/g, '[コード]');

  // 2. インラインコード → マーカー除去
  processed = processed.replace(/`([^`]*)`/g, '$1');

  // 3. リンク処理 → [リンク] に置換
  // リンク（テキスト付き）<http://example.com|Click here>
  processed = processed.replace(/<https?:\/\/[^|>]+\|[^>]+>/g, '[リンク]');
  // リンク（テキストなし）<http://example.com>
  processed = processed.replace(/<https?:\/\/[^>]+>/g, '[リンク]');

  // 4. メンション <@U1234567890> → 除去（将来的に@ユーザー名に変換予定）
  processed = processed.replace(/<@[A-Z0-9]+>/gi, '');

  // 5. 残りの山括弧タグを除去（チャンネルリンクなど）
  processed = processed.replace(/<[^>]+>/g, '');

  // 6. ブロック引用 >>> を処理
  processed = processed.replace(/^>>>\s*/gm, '');

  // 7. 引用 > text → 記号除去
  processed = processed.replace(/^>\s*/gm, '');

  // 8. テキスト装飾の除去
  // 太字 *text*
  processed = processed.replace(/\*([^*]*)\*/g, '$1');
  // イタリック _text_
  processed = processed.replace(/_([^_]*)_/g, '$1');
  // 打ち消し線 ~text~
  processed = processed.replace(/~([^~]*)~/g, '$1');

  // 9. リスト処理
  // 順序なしリスト（•）を検出して1行化
  if (/^[•]\s/m.test(processed)) {
    const items = processed.split('\n')
      .map(line => line.replace(/^[•]\s*/, ''))
      .filter(line => line.trim() !== '');
    processed = items.join('・');
  }
  // 順序なしリスト（-）を検出して1行化
  else if (/^-\s/m.test(processed)) {
    const items = processed.split('\n')
      .map(line => line.replace(/^-\s*/, ''))
      .filter(line => line.trim() !== '');
    processed = items.join('・');
  }
  // 順序付きリストを検出して1行化
  else if (/^\d+\.\s/m.test(processed)) {
    const items: string[] = [];
    processed.split('\n').forEach(line => {
      const regexMatch = line.match(/^(\d+)\.\s*(.*)$/);
      if (regexMatch) {
        items.push(`${regexMatch[1]}.${regexMatch[2]}`);
      } else if (line.trim()) {
        items.push(line.trim());
      }
    });
    processed = items.join(' ');
  }

  // 10. 改行を空白に変換
  processed = processed.replace(/\n/g, ' ');

  // 11. 連続空白を1つに
  processed = processed.replace(/\s+/g, ' ').trim();

  // 絵文字パターンを抽出してURLマップを生成 (日本語文字をサポート)
  const emojiPattern = /:([a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+):/gi;
  const emojis: Record<string, string> = {};

  let regexMatch;
  while ((regexMatch = emojiPattern.exec(processed)) !== null) {
    const emojiName = regexMatch[1]?.toLowerCase();
    if (emojiName) {
      // 1. カスタム絵文字を優先
      let url = emojiMap.get(emojiName);
      // 2. なければ標準絵文字を検索
      if (!url) {
        url = getStandardEmojiMap().get(emojiName);
      }
      if (url) {
        emojis[emojiName] = url;
      }
    }
  }

  return { sanitizedText: processed, emojis };
}
