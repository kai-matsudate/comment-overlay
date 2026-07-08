// ===========================================
// Comment Overlay Setup - フロントエンドアプリケーション
// ===========================================

import type { DisplaySettings } from '../../../../src/types/index.js';
import type { ApiResponse } from '../../../../src/setup/types/index.js';
import {
  DEFAULT_DISPLAY_SETTINGS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  SPEED_MIN,
  SPEED_MAX,
  validateDisplaySettings,
} from '../../../../src/settings/displaySettings.js';

// ===========================================
// 型定義
// ===========================================

type AppState = 'idle' | 'ready' | 'starting' | 'running' | 'stopping';

interface StatusResponse {
  state: AppState;
  threadUrl?: string;
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

  // Step 3: 表示設定
  settingsToggle: HTMLButtonElement;
  settingsToggleIcon: HTMLElement;
  settingsPanel: HTMLElement;
  fontCustom: HTMLInputElement;
  fontLarge: HTMLInputElement;
  fontMedium: HTMLInputElement;
  fontSmall: HTMLInputElement;
  constantSpeed: HTMLInputElement;
  speedValue: HTMLInputElement;
  settingsError: HTMLElement;
  applySettingsBtn: HTMLButtonElement;
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

  // Step 3: 表示設定
  settingsToggle: document.getElementById('settings-toggle') as HTMLButtonElement,
  settingsToggleIcon: document.getElementById('settings-toggle-icon')!,
  settingsPanel: document.getElementById('settings-panel')!,
  fontCustom: document.getElementById('font-custom') as HTMLInputElement,
  fontLarge: document.getElementById('font-large') as HTMLInputElement,
  fontMedium: document.getElementById('font-medium') as HTMLInputElement,
  fontSmall: document.getElementById('font-small') as HTMLInputElement,
  constantSpeed: document.getElementById('constant-speed') as HTMLInputElement,
  speedValue: document.getElementById('speed-value') as HTMLInputElement,
  settingsError: document.getElementById('settings-error')!,
  applySettingsBtn: document.getElementById('apply-settings-btn') as HTMLButtonElement,
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
  const prevState = currentState;
  currentState = status.state;

  // 新しいセッション開始時は表示設定をデフォルトに戻す
  // （オーバーレイサーバーは常にデフォルト設定で起動するため、UIも同期させる）
  if (status.state === 'running' && prevState !== 'running') {
    resetSettingsForm();
  }

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
// 表示設定
// ===========================================

/**
 * チェックボックスの状態に応じて入力フォームの有効/無効を切り替え
 */
function updateSettingsFormState(): void {
  const fontCustom = elements.fontCustom.checked;
  elements.fontLarge.disabled = !fontCustom;
  elements.fontMedium.disabled = !fontCustom;
  elements.fontSmall.disabled = !fontCustom;

  elements.speedValue.disabled = !elements.constantSpeed.checked;
}

/**
 * 数値入力の min/max を displaySettings.ts の定数から設定
 * （HTML側にハードコードせず、定数の一元管理を保つ）
 */
function initSettingsFormConstraints(): void {
  for (const input of [elements.fontLarge, elements.fontMedium, elements.fontSmall]) {
    input.min = String(FONT_SIZE_MIN);
    input.max = String(FONT_SIZE_MAX);
  }
  elements.speedValue.min = String(SPEED_MIN);
  elements.speedValue.max = String(SPEED_MAX);
}

/**
 * 表示設定フォームをデフォルト状態に戻す
 */
function resetSettingsForm(): void {
  elements.fontCustom.checked = false;
  elements.fontLarge.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.large);
  elements.fontMedium.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.medium);
  elements.fontSmall.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.small);
  elements.constantSpeed.checked = false;
  elements.speedValue.value = String(DEFAULT_DISPLAY_SETTINGS.speedPxPerSec);
  hideError(elements.settingsError);
  updateSettingsFormState();

  // パネルを閉じた状態に戻す
  elements.settingsPanel.classList.add('hidden');
  elements.settingsToggle.setAttribute('aria-expanded', 'false');
  elements.settingsToggleIcon.textContent = '▸';
}

/**
 * フォーム値から表示設定オブジェクトを構築
 * @returns 妥当な場合は DisplaySettings、不正な場合はエラーメッセージ
 */
function buildDisplaySettings(): DisplaySettings | string {
  const parseSize = (input: HTMLInputElement, label: string): number | string => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < FONT_SIZE_MIN || value > FONT_SIZE_MAX) {
      return `${label}は ${FONT_SIZE_MIN}〜${FONT_SIZE_MAX} の範囲で入力してください`;
    }
    return value;
  };

  let fontSizes = { ...DEFAULT_DISPLAY_SETTINGS.fontSizes };
  if (elements.fontCustom.checked) {
    const large = parseSize(elements.fontLarge, 'フォントサイズ(大)');
    if (typeof large === 'string') return large;
    const medium = parseSize(elements.fontMedium, 'フォントサイズ(中)');
    if (typeof medium === 'string') return medium;
    const small = parseSize(elements.fontSmall, 'フォントサイズ(小)');
    if (typeof small === 'string') return small;
    fontSizes = { large, medium, small };
  }

  const constantSpeedEnabled = elements.constantSpeed.checked;
  let speedPxPerSec = DEFAULT_DISPLAY_SETTINGS.speedPxPerSec;
  if (constantSpeedEnabled) {
    const value = Number(elements.speedValue.value);
    if (!Number.isFinite(value) || value < SPEED_MIN || value > SPEED_MAX) {
      return `速度は ${SPEED_MIN}〜${SPEED_MAX} の範囲で入力してください`;
    }
    speedPxPerSec = value;
  }

  // サーバー側と同じバリデーションを最終ゲートとして通す
  // （上のチェックはフィールド別エラーメッセージ用。ルールの正はvalidateDisplaySettings）
  const validated = validateDisplaySettings({ fontSizes, constantSpeedEnabled, speedPxPerSec });
  if (!validated) {
    return '設定値が不正です。入力内容を確認してください';
  }
  return validated;
}

/**
 * 表示設定を反映
 */
async function applySettings(): Promise<void> {
  hideError(elements.settingsError);

  const settings = buildDisplaySettings();
  if (typeof settings === 'string') {
    showError(elements.settingsError, settings);
    return;
  }

  elements.applySettingsBtn.disabled = true;

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    const result = await response.json() as ApiResponse;

    if (result.success) {
      // 反映成功をボタンで一時的にフィードバック
      elements.applySettingsBtn.textContent = '反映しました ✓';
      setTimeout(() => {
        elements.applySettingsBtn.textContent = '設定を反映';
      }, 2000);
    } else {
      showError(elements.settingsError, result.error ?? '設定の反映に失敗しました');
    }
  } catch {
    showError(elements.settingsError, 'ネットワークエラーが発生しました。接続を確認して再試行してください。');
  } finally {
    elements.applySettingsBtn.disabled = false;
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

// 表示設定: 開閉トグル
elements.settingsToggle.addEventListener('click', () => {
  const isOpen = !elements.settingsPanel.classList.contains('hidden');
  elements.settingsPanel.classList.toggle('hidden');
  elements.settingsToggle.setAttribute('aria-expanded', String(!isOpen));
  elements.settingsToggleIcon.textContent = isOpen ? '▸' : '▾';
});

// 表示設定: チェックボックスによるフォーム有効/無効の切り替え
// チェックを外したら入力値をデフォルトに戻す（disabled欄の表示 = 実際に適用される値、を保つ）
elements.fontCustom.addEventListener('change', () => {
  if (!elements.fontCustom.checked) {
    elements.fontLarge.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.large);
    elements.fontMedium.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.medium);
    elements.fontSmall.value = String(DEFAULT_DISPLAY_SETTINGS.fontSizes.small);
  }
  updateSettingsFormState();
});
elements.constantSpeed.addEventListener('change', () => {
  if (!elements.constantSpeed.checked) {
    elements.speedValue.value = String(DEFAULT_DISPLAY_SETTINGS.speedPxPerSec);
  }
  updateSettingsFormState();
});

// 表示設定: 反映ボタン
elements.applySettingsBtn.addEventListener('click', applySettings);

// ===========================================
// 初期化
// ===========================================

// 表示設定フォームの初期化（min/max・デフォルト値を定数から設定）
initSettingsFormConstraints();
resetSettingsForm();

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
