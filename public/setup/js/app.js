// ===========================================
// Comment Overlay Setup - フロントエンドアプリケーション
// ===========================================

// ===========================================
// 状態管理
// ===========================================

/**
 * @typedef {'idle' | 'ready' | 'starting' | 'running' | 'stopping'} AppState
 */

/** @type {AppState} */
let currentState = 'idle';

/** @type {File | null} */
let selectedFile = null;

/** @type {WebSocket | null} */
let ws = null;

/** @type {number | null} */
let uptimeInterval = null;

/** @type {number} */
let startTime = 0;

// ===========================================
// DOM要素
// ===========================================

const elements = {
  // ステップインジケーター
  step1Indicator: document.getElementById('step1-indicator'),
  step1Label: document.getElementById('step1-label'),
  step2Indicator: document.getElementById('step2-indicator'),
  step2Label: document.getElementById('step2-label'),
  step3Indicator: document.getElementById('step3-indicator'),
  step3Label: document.getElementById('step3-label'),

  // ステップコンテンツ
  step1: document.getElementById('step1'),
  step2: document.getElementById('step2'),
  step3: document.getElementById('step3'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loading-text'),

  // Step 1
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  fileName: document.getElementById('file-name'),
  password: document.getElementById('password'),
  decryptBtn: document.getElementById('decrypt-btn'),
  errorMessage: document.getElementById('error-message'),

  // Step 2
  threadUrl: document.getElementById('thread-url'),
  step2Error: document.getElementById('step2-error'),
  backBtn: document.getElementById('back-btn'),
  startBtn: document.getElementById('start-btn'),

  // Step 3
  currentUrl: document.getElementById('current-url'),
  uptime: document.getElementById('uptime'),
  stopBtn: document.getElementById('stop-btn'),
};

// ===========================================
// ユーティリティ
// ===========================================

/**
 * 経過時間をフォーマット
 * @param {number} ms ミリ秒
 * @returns {string}
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

/**
 * エラーメッセージを表示
 * @param {HTMLElement} element
 * @param {string} message
 */
function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

/**
 * エラーメッセージを非表示
 * @param {HTMLElement} element
 */
function hideError(element) {
  element.classList.add('hidden');
}

/**
 * ローディング表示
 * @param {string} text
 */
function showLoading(text) {
  elements.loadingText.textContent = text;
  elements.loading.classList.remove('hidden');
  elements.step1.classList.add('hidden');
  elements.step2.classList.add('hidden');
  elements.step3.classList.add('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading() {
  elements.loading.classList.add('hidden');
}

// ===========================================
// ステップ管理
// ===========================================

/**
 * ステップを更新
 * @param {1 | 2 | 3} activeStep
 */
function updateStepIndicators(activeStep) {
  const indicators = [
    { indicator: elements.step1Indicator, label: elements.step1Label },
    { indicator: elements.step2Indicator, label: elements.step2Label },
    { indicator: elements.step3Indicator, label: elements.step3Label },
  ];

  indicators.forEach((item, index) => {
    const stepNum = index + 1;
    item.indicator.classList.remove('active', 'completed', 'pending');
    item.label.classList.remove('text-gray-700', 'text-gray-500', 'font-medium');

    if (stepNum < activeStep) {
      item.indicator.classList.add('completed');
      item.indicator.innerHTML = '✓';
      item.label.classList.add('text-gray-500');
    } else if (stepNum === activeStep) {
      item.indicator.classList.add('active');
      item.indicator.textContent = stepNum.toString();
      item.label.classList.add('text-gray-700', 'font-medium');
    } else {
      item.indicator.classList.add('pending');
      item.indicator.textContent = stepNum.toString();
      item.label.classList.add('text-gray-500');
    }
  });
}

/**
 * ステップを表示
 * @param {1 | 2 | 3} step
 */
function showStep(step) {
  hideLoading();
  elements.step1.classList.add('hidden');
  elements.step2.classList.add('hidden');
  elements.step3.classList.add('hidden');

  if (step === 1) {
    elements.step1.classList.remove('hidden');
  } else if (step === 2) {
    elements.step2.classList.remove('hidden');
  } else if (step === 3) {
    elements.step3.classList.remove('hidden');
  }

  updateStepIndicators(step);
}

// ===========================================
// WebSocket接続
// ===========================================

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/ws/status');

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'status') {
      handleStatusUpdate(message.data);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  };
}

/**
 * 状態更新を処理
 * @param {Object} status
 */
function handleStatusUpdate(status) {
  currentState = status.state;

  if (status.state === 'idle') {
    showStep(1);
    stopUptimeTimer();
  } else if (status.state === 'ready') {
    showStep(2);
    stopUptimeTimer();
  } else if (status.state === 'starting') {
    showLoading('オーバーレイを起動中...');
  } else if (status.state === 'running') {
    showStep(3);
    elements.currentUrl.textContent = status.threadUrl || '';
    startUptimeTimer();
  } else if (status.state === 'stopping') {
    showLoading('オーバーレイを停止中...');
  }
}

// ===========================================
// 経過時間タイマー
// ===========================================

function startUptimeTimer() {
  startTime = Date.now();
  updateUptime();
  uptimeInterval = setInterval(updateUptime, 1000);
}

function stopUptimeTimer() {
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
  }
}

function updateUptime() {
  const elapsed = Date.now() - startTime;
  elements.uptime.textContent = formatUptime(elapsed);
}

// ===========================================
// API呼び出し
// ===========================================

/**
 * 復号化API呼び出し
 */
async function decrypt() {
  if (!selectedFile || !elements.password.value) return;

  showLoading('復号化中...');
  hideError(elements.errorMessage);

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('password', elements.password.value);

    const response = await fetch('/api/decrypt', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      showStep(2);
    } else {
      showStep(1);
      showError(elements.errorMessage, result.error || '復号化に失敗しました');
    }
  } catch (error) {
    showStep(1);
    showError(elements.errorMessage, 'ネットワークエラーが発生しました');
  }
}

/**
 * 開始API呼び出し
 */
async function start() {
  const threadUrl = elements.threadUrl.value.trim();
  if (!threadUrl) return;

  showLoading('オーバーレイを起動中...');
  hideError(elements.step2Error);

  try {
    const response = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadUrl }),
    });

    const result = await response.json();

    if (!result.success) {
      showStep(2);
      showError(elements.step2Error, result.error || '起動に失敗しました');
    }
    // 成功時はWebSocketで状態更新を受け取る
  } catch (error) {
    showStep(2);
    showError(elements.step2Error, 'ネットワークエラーが発生しました');
  }
}

/**
 * 停止API呼び出し
 */
async function stop() {
  showLoading('オーバーレイを停止中...');

  try {
    await fetch('/api/stop', { method: 'POST' });
    // 成功時はWebSocketで状態更新を受け取る
  } catch (error) {
    console.error('Stop error:', error);
    showStep(1);
  }
}

// ===========================================
// バリデーション
// ===========================================

function validateStep1() {
  const valid = selectedFile !== null && elements.password.value.length > 0;
  elements.decryptBtn.disabled = !valid;
}

function validateStep2() {
  const urlPattern = /^https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/;
  const valid = urlPattern.test(elements.threadUrl.value.trim());
  elements.startBtn.disabled = !valid;
}

// ===========================================
// イベントリスナー
// ===========================================

// ファイルドロップゾーン
elements.dropZone.addEventListener('click', () => elements.fileInput.click());

elements.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  elements.dropZone.classList.add('dragover');
});

elements.dropZone.addEventListener('dragleave', () => {
  elements.dropZone.classList.remove('dragover');
});

elements.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elements.dropZone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    selectedFile = files[0];
    elements.fileName.textContent = selectedFile.name;
    validateStep1();
  }
});

elements.fileInput.addEventListener('change', () => {
  if (elements.fileInput.files.length > 0) {
    selectedFile = elements.fileInput.files[0];
    elements.fileName.textContent = selectedFile.name;
    validateStep1();
  }
});

// パスワード入力
elements.password.addEventListener('input', validateStep1);
elements.password.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !elements.decryptBtn.disabled) {
    decrypt();
  }
});

// 復号化ボタン
elements.decryptBtn.addEventListener('click', decrypt);

// URL入力
elements.threadUrl.addEventListener('input', () => {
  validateStep2();
  hideError(elements.step2Error);
});
elements.threadUrl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !elements.startBtn.disabled) {
    start();
  }
});

// 戻るボタン
elements.backBtn.addEventListener('click', () => showStep(1));

// 開始ボタン
elements.startBtn.addEventListener('click', start);

// 停止ボタン
elements.stopBtn.addEventListener('click', stop);

// ===========================================
// 初期化
// ===========================================

// 初期状態の取得
fetch('/api/status')
  .then(res => res.json())
  .then(status => {
    handleStatusUpdate(status);
    connectWebSocket();
  })
  .catch(err => {
    console.error('Failed to fetch initial status:', err);
    showStep(1);
    connectWebSocket();
  });
