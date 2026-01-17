// ===========================================
// 定数
// ===========================================
const LANE_COUNT = 10;
const USABLE_RANGE_START = 0.1;
const USABLE_RANGE_END = 0.9;
const FLOW_DURATION = 8; // CSSアニメーションの秒数

// ===========================================
// 状態管理
// ===========================================
// レーン状態: 各要素は使用中の場合タイムスタンプ、空きの場合null
let lanes = new Array(LANE_COUNT).fill(null);

// WebSocket接続
let ws;
let reconnectTimer;

// ===========================================
// WebSocket接続
// ===========================================
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // カウンターメッセージの処理
    if (data.type === 'counter') {
      updateCounter(data.count);
      return;
    }

    // コメントメッセージの処理（後方互換性維持）
    if (data.text && data.userName) {
      showComment(data.userName, data.text, data.userColor || '#ffffff', data.emojis || {});
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  };
}

// ===========================================
// UI更新
// ===========================================
// カウンター色決定（盛り上がり系カラースキーム）
function getCounterColor(count) {
  if (count >= 100) return '#FFD700'; // Gold - 最高潮
  if (count >= 50) return '#FF9800';  // Orange - 熱くなってきた
  if (count >= 25) return '#FFEB3B';  // Yellow - 盛り上がり開始
  return '#4CAF50';                    // Green - 平穏
}

// カウンター更新
function updateCounter(count) {
  const counter = document.getElementById('comment-counter');
  if (counter) {
    counter.textContent = `💬 ${count}`;
    counter.style.color = getCounterColor(count);
  }
}

// フォントサイズ決定
// | 文字数 | フォントサイズ |
// | 1〜10文字 | 40px (大) |
// | 11〜30文字 | 32px (中) |
// | 31文字以上 | 24px (小) |
function getFontSize(text) {
  const length = text.length;
  if (length <= 10) return 40;
  if (length <= 30) return 32;
  return 24;
}

// ===========================================
// 絵文字処理
// ===========================================
// テキスト内の絵文字を画像に置換してDocumentFragmentを返す
function renderTextWithEmojis(text, emojis) {
  const fragment = document.createDocumentFragment();

  // emojisが空または未定義の場合はテキストのみ返す
  if (!emojis || Object.keys(emojis).length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  // 絵文字パターンでテキストを分割 (日本語文字をサポート)
  const emojiPattern = /:([a-z0-9_+\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef]+):/gi;
  let lastIndex = 0;
  let match;

  while ((match = emojiPattern.exec(text)) !== null) {
    // マッチ前のテキストを追加
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const emojiName = match[1]?.toLowerCase();
    const emojiUrl = emojis[emojiName];

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
      img.onerror = function() {
        const textNode = document.createTextNode(':' + emojiName + ':');
        this.parentNode.replaceChild(textNode, this);
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
function getLaneY(laneIndex) {
  const usableHeight = window.innerHeight * (USABLE_RANGE_END - USABLE_RANGE_START);
  const laneHeight = usableHeight / LANE_COUNT;
  const startY = window.innerHeight * USABLE_RANGE_START;
  return startY + laneHeight * (laneIndex + 0.5);
}

// 空きレーンのインデックス一覧を取得
function getAvailableLanes() {
  const available = [];
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) {
      available.push(i);
    }
  }
  return available;
}

// 最古のレーンのインデックスを取得
function findOldestLane() {
  let oldestIndex = 0;
  let oldestTimestamp = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const timestamp = lanes[i];
    if (timestamp !== null && timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
      oldestIndex = i;
    }
  }
  return oldestIndex;
}

// 使用するレーンを選択
function selectLane() {
  const available = getAvailableLanes();
  if (available.length > 0) {
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }
  return findOldestLane();
}

// ===========================================
// コメント表示
// ===========================================
function showComment(userName, text, userColor, emojis) {
  const comment = document.createElement('div');
  comment.className = 'comment';
  comment.style.color = userColor;

  // フォントサイズを動的に設定
  const fontSize = getFontSize(text);
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

  // 一定時間後にレーンを解放（コメントが画面中央を過ぎた頃）
  setTimeout(() => {
    // 同じタイムスタンプの場合のみ解放（上書きされていない場合）
    if (lanes[laneIndex] === now) {
      lanes[laneIndex] = null;
    }
  }, (FLOW_DURATION / 2) * 1000);

  document.body.appendChild(comment);

  // アニメーション終了後に要素を削除
  comment.addEventListener('animationend', () => {
    comment.remove();
  });
}

// ===========================================
// 初期化
// ===========================================
connect();
