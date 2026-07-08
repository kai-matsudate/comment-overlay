// ===========================================
// 型定義（バックエンドから再利用）
// ===========================================
import type { WebSocketMessage, DisplaySettings } from '../../../src/types/index.js';
import { DEFAULT_DISPLAY_SETTINGS } from '../../../src/settings/displaySettings.js';
import { getFontSize } from '../../../src/getFontSize.js';

// ===========================================
// 定数
// ===========================================
const LANE_COUNT = 10;
const USABLE_RANGE_START = 0.1;
const USABLE_RANGE_END = 0.9;
const FLOW_DURATION = 8; // CSSアニメーションの秒数（デフォルトモード時）
const MAX_FLOW_DURATION = 60; // 速度一定モード時のduration上限（超長文が画面を占有し続けるのを防ぐ）

// ===========================================
// 状態管理
// ===========================================
// レーン状態: 各要素は使用中の場合タイムスタンプ、空きの場合null
let lanes: (number | null)[] = new Array(LANE_COUNT).fill(null);

// WebSocket接続
let ws: WebSocket | null = null;

// 表示設定（サーバーからの settings メッセージで更新される）
let displaySettings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS;

// ===========================================
// WebSocket接続
// ===========================================
function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = (): void => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event: MessageEvent): void => {
    const data = JSON.parse(event.data) as WebSocketMessage;

    // カウンターメッセージの処理
    if (data.type === 'counter') {
      updateCounter(data.count);
      return;
    }

    // 表示設定メッセージの処理（以降のコメントから反映される）
    if (data.type === 'settings') {
      displaySettings = data.settings;
      return;
    }

    // コメントメッセージの処理
    if (data.type === 'comment') {
      showComment(data.userName, data.text, data.userColor, data.emojis ?? {});
    }
  };

  ws.onclose = (): void => {
    console.log('WebSocket disconnected');
    hideCounter();
  };

  ws.onerror = (err: Event): void => {
    console.error('WebSocket error:', err);
    ws?.close();
  };
}

// ===========================================
// UI更新
// ===========================================
// カウンター色決定（盛り上がり系カラースキーム）
function getCounterColor(count: number): string {
  if (count >= 100) return '#FFD700'; // Gold - 最高潮
  if (count >= 50) return '#FF9800';  // Orange - 熱くなってきた
  if (count >= 25) return '#FFEB3B';  // Yellow - 盛り上がり開始
  return '#4CAF50';                    // Green - 平穏
}

// カウンター更新
function updateCounter(count: number): void {
  const counter = document.getElementById('comment-counter');
  if (counter) {
    counter.style.display = 'block';  // 再接続時に表示
    counter.textContent = `💬 ${count}`;
    counter.style.color = getCounterColor(count);
  }
}

// カウンターを非表示（接続切断時）
function hideCounter(): void {
  const counter = document.getElementById('comment-counter');
  if (counter) {
    counter.style.display = 'none';
  }
}

// ===========================================
// 絵文字処理
// ===========================================
// テキスト内の絵文字を画像に置換してDocumentFragmentを返す
function renderTextWithEmojis(text: string, emojis: Record<string, string>): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // emojisが空または未定義の場合はテキストのみ返す
  if (!emojis || Object.keys(emojis).length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  // 絵文字パターンでテキストを分割 (日本語文字をサポート)
  const emojiPattern = /:([a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+):/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = emojiPattern.exec(text)) !== null) {
    // マッチ前のテキストを追加
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const emojiName = match[1]?.toLowerCase();
    const emojiUrl = emojiName ? emojis[emojiName] : undefined;

    if (emojiUrl) {
      // セキュリティ: https/httpスキームのみ許可（XSS対策）
      if (!emojiUrl.startsWith('https://') && !emojiUrl.startsWith('http://')) {
        fragment.appendChild(document.createTextNode(match[0]));
        lastIndex = match.index + match[0].length;
        continue;
      }

      // 絵文字画像を作成
      const img = document.createElement('img');
      img.src = emojiUrl;
      img.alt = ':' + emojiName + ':';
      img.className = 'emoji';
      // 読み込みエラー時はテキストにフォールバック
      img.onerror = function(this: HTMLImageElement): void {
        const textNode = document.createTextNode(':' + emojiName + ':');
        this.parentNode?.replaceChild(textNode, this);
      };
      fragment.appendChild(img);
    } else {
      // URLがない場合はテキストのまま
      fragment.appendChild(document.createTextNode(match[0]));
    }

    lastIndex = match.index + match[0].length;
  }

  // 残りのテキストを追加
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

// ===========================================
// レーン管理
// ===========================================
// レーンのY座標を計算
function getLaneY(laneIndex: number): number {
  const usableHeight = window.innerHeight * (USABLE_RANGE_END - USABLE_RANGE_START);
  const laneHeight = usableHeight / LANE_COUNT;
  const startY = window.innerHeight * USABLE_RANGE_START;
  return startY + laneHeight * (laneIndex + 0.5);
}

// 空きレーンのインデックス一覧を取得
function getAvailableLanes(): number[] {
  const available: number[] = [];
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) {
      available.push(i);
    }
  }
  return available;
}

// 最古のレーンのインデックスを取得
function findOldestLane(): number {
  let oldestIndex = 0;
  let oldestTimestamp = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const timestamp = lanes[i];
    if (timestamp !== null && timestamp !== undefined && timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
      oldestIndex = i;
    }
  }
  return oldestIndex;
}

// 使用するレーンを選択
function selectLane(): number {
  const available = getAvailableLanes();
  if (available.length > 0) {
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex]!;
  }
  return findOldestLane();
}

// ===========================================
// コメント表示
// ===========================================
function showComment(userName: string, text: string, userColor: string, emojis: Record<string, string>): void {
  const comment = document.createElement('div');
  comment.className = 'comment';
  comment.style.color = userColor;

  // フォントサイズを動的に設定
  const fontSize = getFontSize(text, displaySettings.fontSizes);
  comment.style.fontSize = `${fontSize}px`;

  // コメントテキスト（絵文字を画像に置換）
  const textSpan = document.createElement('span');
  textSpan.className = 'comment-text';
  textSpan.appendChild(renderTextWithEmojis(text, emojis));
  comment.appendChild(textSpan);

  // 投稿者名（右下に控えめに表示）
  const nameSpan = document.createElement('span');
  nameSpan.className = 'user-name';
  nameSpan.textContent = userName;
  comment.appendChild(nameSpan);

  // レーンを選択してY座標を設定
  const laneIndex = selectLane();
  const y = getLaneY(laneIndex);
  comment.style.top = `${y}px`;

  // レーンを占有
  const now = Date.now();
  lanes[laneIndex] = now;

  document.body.appendChild(comment);

  // アニメーション時間を決定
  // 速度一定モード: コメント幅に応じてdurationを計算し、流れる速度を揃える
  // デフォルト: CSSの一律duration（FLOW_DURATION秒）
  let flowDuration = FLOW_DURATION;
  if (displaySettings.constantSpeedEnabled) {
    const distance = window.innerWidth + comment.offsetWidth;
    // 上限キャップ: 超長文でも必ずMAX_FLOW_DURATION以内に画面を抜ける（その場合のみ設定速度より速くなる）
    flowDuration = Math.min(distance / displaySettings.speedPxPerSec, MAX_FLOW_DURATION);
    comment.style.animationDuration = `${flowDuration}s`;
  }

  // 一定時間後にレーンを解放（コメントが画面中央を過ぎた頃）
  setTimeout(() => {
    // 同じタイムスタンプの場合のみ解放（上書きされていない場合）
    if (lanes[laneIndex] === now) {
      lanes[laneIndex] = null;
    }
  }, (flowDuration / 2) * 1000);

  // アニメーション終了後に要素を削除
  comment.addEventListener('animationend', () => {
    comment.remove();
  });
}

// ===========================================
// 初期化
// ===========================================
connect();
