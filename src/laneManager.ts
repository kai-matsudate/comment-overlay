/**
 * レーン管理モジュール
 *
 * コメントの重なりを防ぐため、Y座標をレーン単位で管理する純粋関数群
 */

/** レーン状態: 各要素は使用中の場合タイムスタンプ、空きの場合null */
export type LaneState = (number | null)[];

/** デフォルトのレーン数 */
export const LANE_COUNT = 10;

/** 使用可能範囲の開始位置（画面高さに対する割合） */
export const USABLE_RANGE_START = 0.1;

/** 使用可能範囲の終了位置（画面高さに対する割合） */
export const USABLE_RANGE_END = 0.9;

/**
 * レーン状態を初期化する
 * @param count レーン数（1以上）
 * @returns 全てnullで初期化されたレーン状態
 */
export function createLaneState(count: number): { lanes: LaneState } {
  if (count <= 0) {
    throw new Error('Lane count must be greater than 0');
  }
  return { lanes: new Array(count).fill(null) };
}

/**
 * 空きレーンのインデックス一覧を取得する
 * @param lanes 現在のレーン状態
 * @returns 空きレーンのインデックス配列
 */
export function getAvailableLanes(lanes: LaneState): number[] {
  const available: number[] = [];
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) {
      available.push(i);
    }
  }
  return available;
}

/**
 * 最も古い（タイムスタンプが小さい）レーンのインデックスを取得する
 * @param lanes 現在のレーン状態
 * @returns 最古のレーンのインデックス（全てnullの場合は0）
 */
export function findOldestLane(lanes: LaneState): number {
  let oldestIndex = 0;
  let oldestTimestamp = Infinity;

  for (let i = 0; i < lanes.length; i++) {
    const timestamp = lanes[i] ?? null;
    if (timestamp !== null && timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
      oldestIndex = i;
    }
  }

  return oldestIndex;
}

/**
 * 使用するレーンを選択する
 * - 空きレーンがある場合: ランダムに選択
 * - 全て使用中の場合: 最古のレーンを選択
 * @param lanes 現在のレーン状態
 * @returns 選択されたレーンのインデックス
 */
export function selectLane(lanes: LaneState): number {
  const available = getAvailableLanes(lanes);

  if (available.length > 0) {
    const randomIndex = Math.floor(Math.random() * available.length);
    // available.length > 0 を確認済みなので必ず存在する
    return available[randomIndex]!;
  }

  return findOldestLane(lanes);
}

/**
 * レーンを占有する（イミュータブル）
 * @param lanes 現在のレーン状態
 * @param index 占有するレーンのインデックス
 * @param timestamp 占有開始時刻
 * @returns 新しいレーン状態
 */
export function occupyLane(lanes: LaneState, index: number, timestamp: number): LaneState {
  if (index < 0 || index >= lanes.length) {
    throw new Error('Invalid lane index');
  }
  const newLanes = [...lanes];
  newLanes[index] = timestamp;
  return newLanes;
}

/**
 * レーンを解放する（イミュータブル）
 * @param lanes 現在のレーン状態
 * @param index 解放するレーンのインデックス
 * @returns 新しいレーン状態
 */
export function releaseLane(lanes: LaneState, index: number): LaneState {
  if (index < 0 || index >= lanes.length) {
    throw new Error('Invalid lane index');
  }
  const newLanes = [...lanes];
  newLanes[index] = null;
  return newLanes;
}

/**
 * レーンのY座標を計算する
 * @param laneIndex レーンのインデックス
 * @param laneCount 総レーン数
 * @param viewportHeight ビューポートの高さ
 * @returns Y座標（ピクセル）
 */
export function calculateLaneY(laneIndex: number, laneCount: number, viewportHeight: number): number {
  const usableHeight = viewportHeight * (USABLE_RANGE_END - USABLE_RANGE_START);
  const laneHeight = usableHeight / laneCount;
  const startY = viewportHeight * USABLE_RANGE_START;

  // 各レーンの中央にY座標を設定
  return startY + laneHeight * (laneIndex + 0.5);
}
