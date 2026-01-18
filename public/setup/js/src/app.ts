// ===========================================
// Comment Overlay Setup - フロントエンドアプリケーション
// ===========================================

// ===========================================
// 型定義
// ===========================================

type AppState = 'idle' | 'ready' | 'starting' | 'running' | 'stopping';

interface StatusResponse {
  state: AppState;
  threadUrl?: string;
}

interface ApiResponse {
  success: boolean;
  error?: string;
}

interface WebSocketStatusMessage {
  type: 'status';
  data: StatusResponse;
}

interface DOMElements {
  // ステップインジケーター
  step1Indicator: HTMLElement;
  step1Label: HTMLElement;
  step2Indicator: HTMLElement;
  step2Label: HTMLElement;
  step3Indicator: HTMLElement;
  step3Label: HTMLElement;

  // ステップコンテンツ
  step1: HTMLElement;
  step2: HTMLElement;
  step3: HTMLElement;
  loading: HTMLElement;
  loadingText: HTMLElement;

  // Step 1
  dropZone: HTMLElement;
  fileInput: HTMLInputElement;
  fileName: HTMLElement;
  password: HTMLInputElement;
  decryptBtn: HTMLButtonElement;
  errorMessage: HTMLElement;

  // Step 2
  threadUrl: HTMLInputElement;
  step2Error: HTMLElement;
  backBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;

  // Step 3
  currentUrl: HTMLElement;
  uptime: HTMLElement;
  stopBtn: HTMLButtonElement;
}

// ===========================================
// 状態管理
// ===========================================

let currentState: AppState = 'idle';
let selectedFile: File | null = null;
let ws: WebSocket | null = null;
let uptimeInterval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

// ===========================================
// DOM要素
// ===========================================

const elements: DOMElements = {
  // ステップインジケーター
  step1Indicator: document.getElementById('step1-indicator')!,
  step1Label: document.getElementById('step1-label')!,
  step2Indicator: document.getElementById('step2-indicator')!,
  step2Label: document.getElementById('step2-label')!,
  step3Indicator: document.getElementById('step3-indicator')!,
  step3Label: document.getElementById('step3-label')!,

  // ステップコンテンツ
  step1: document.getElementById('step1')!,
  step2: document.getElementById('step2')!,
  step3: document.getElementById('step3')!,
  loading: document.getElementById('loading')!,
  loadingText: document.getElementById('loading-text')!,

  // Step 1
  dropZone: document.getElementById('drop-zone')!,
  fileInput: document.getElementById('file-input') as HTMLInputElement,
  fileName: document.getElementById('file-name')!,
  password: document.getElementById('password') as HTMLInputElement,
  decryptBtn: document.getElementById('decrypt-btn') as HTMLButtonElement,
  errorMessage: document.getElementById('error-message')!,

  // Step 2
  threadUrl: document.getElementById('thread-url') as HTMLInputElement,
  step2Error: document.getElementById('step2-error')!,
  backBtn: document.getElementById('back-btn') as HTMLButtonElement,
  startBtn: document.getElementById('start-btn') as HTMLButtonElement,

  // Step 3
  currentUrl: document.getElementById('current-url')!,
  uptime: document.getElementById('uptime')!,
  stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,
};

// ===========================================
// ユーティリティ
// ===========================================

/**
 * 経過時間をフォーマット
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

/**
 * エラーメッセージを表示
 */
function showError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.classList.remove('hidden');
}

/**
 * エラーメッセージを非表示
 */
function hideError(element: HTMLElement): void {
  element.classList.add('hidden');
}

/**
 * ローディング表示
 */
function showLoading(text: string): void {
  elements.loadingText.textContent = text;
  elements.loading.classList.remove('hidden');
  elements.step1.classList.add('hidden');
  elements.step2.classList.add('hidden');
  elements.step3.classList.add('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading(): void {
  elements.loading.classList.add('hidden');
}

// ===========================================
// ステップ管理
// ===========================================

type StepNumber = 1 | 2 | 3;

/**
 * ステップを更新
 */
function updateStepIndicators(activeStep: StepNumber): void {
  const indicators = [
    { indicator: elements.step1Indicator, label: elements.step1Label },
    { indicator: elements.step2Indicator, label: elements.step2Label },
    { indicator: elements.step3Indicator, label: elements.step3Label },
  ];

  indicators.forEach((item, index) => {
    const stepNum = (index + 1) as StepNumber;
    item.indicator.classList.remove('active', 'completed', 'pending');
    item.label.classList.remove('text-gray-700', 'text-gray-500', 'font-medium');

    if (stepNum < activeStep) {
      item.indicator.classList.add('completed');
      item.indicator.textContent = '✓';
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
 */
function showStep(step: StepNumber): void {
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

function connectWebSocket(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/ws/status');

  ws.onopen = (): void => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event: MessageEvent): void => {
    const message = JSON.parse(event.data) as WebSocketStatusMessage;
    if (message.type === 'status') {
      handleStatusUpdate(message.data);
    }
  };

  ws.onclose = (): void => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (err: Event): void => {
    console.error('WebSocket error:', err);
    ws?.close();
  };
}

/**
 * 状態更新を処理
 */
function handleStatusUpdate(status: StatusResponse): void {
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
    elements.currentUrl.textContent = status.threadUrl ?? '';
    startUptimeTimer();
  } else if (status.state === 'stopping') {
    showLoading('オーバーレイを停止中...');
  }
}

// ===========================================
// 経過時間タイマー
// ===========================================

function startUptimeTimer(): void {
  startTime = Date.now();
  updateUptime();
  uptimeInterval = setInterval(updateUptime, 1000);
}

function stopUptimeTimer(): void {
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
  }
}

function updateUptime(): void {
  const elapsed = Date.now() - startTime;
  elements.uptime.textContent = formatUptime(elapsed);
}

// ===========================================
// API呼び出し
// ===========================================

/**
 * 復号化API呼び出し
 */
async function decrypt(): Promise<void> {
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

    const result = await response.json() as ApiResponse;

    if (result.success) {
      showStep(2);
    } else {
      showStep(1);
      const errorMsg = result.error ?? '復号化に失敗しました';
      showError(elements.errorMessage, `${errorMsg}。パスワードを確認してください。`);
    }
  } catch {
    showStep(1);
    showError(elements.errorMessage, 'ネットワークエラーが発生しました。接続を確認して再試行してください。');
  }
}

/**
 * 開始API呼び出し
 */
async function start(): Promise<void> {
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

    const result = await response.json() as ApiResponse;

    if (!result.success) {
      showStep(2);
      const errorMsg = result.error ?? '起動に失敗しました';
      showError(elements.step2Error, `${errorMsg}。URLを確認して再試行してください。`);
    }
    // 成功時はWebSocketで状態更新を受け取る
  } catch {
    showStep(2);
    showError(elements.step2Error, 'ネットワークエラーが発生しました。接続を確認して再試行してください。');
  }
}

/**
 * 停止API呼び出し
 */
async function stop(): Promise<void> {
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

function validateStep1(): void {
  const valid = selectedFile !== null && elements.password.value.length > 0;
  elements.decryptBtn.disabled = !valid;
}

function validateStep2(): void {
  const urlPattern = /^https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/;
  const valid = urlPattern.test(elements.threadUrl.value.trim());
  elements.startBtn.disabled = !valid;
}

// ===========================================
// イベントリスナー
// ===========================================

// ファイルドロップゾーン
elements.dropZone.addEventListener('click', () => elements.fileInput.click());

elements.dropZone.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault();
  elements.dropZone.classList.add('dragover');
});

elements.dropZone.addEventListener('dragleave', () => {
  elements.dropZone.classList.remove('dragover');
});

elements.dropZone.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault();
  elements.dropZone.classList.remove('dragover');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    selectedFile = files[0]!;
    elements.fileName.textContent = selectedFile.name;
    validateStep1();
  }
});

elements.fileInput.addEventListener('change', () => {
  if (elements.fileInput.files && elements.fileInput.files.length > 0) {
    selectedFile = elements.fileInput.files[0]!;
    elements.fileName.textContent = selectedFile.name;
    validateStep1();
  }
});

// パスワード入力
elements.password.addEventListener('input', validateStep1);
elements.password.addEventListener('keypress', (e: KeyboardEvent) => {
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
elements.threadUrl.addEventListener('keypress', (e: KeyboardEvent) => {
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
  .then(res => res.json() as Promise<StatusResponse>)
  .then(status => {
    handleStatusUpdate(status);
    connectWebSocket();
  })
  .catch(err => {
    console.error('Failed to fetch initial status:', err);
    showStep(1);
    connectWebSocket();
  });
