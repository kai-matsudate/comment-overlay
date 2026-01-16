import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type LaneState,
  LANE_COUNT,
  USABLE_RANGE_START,
  USABLE_RANGE_END,
  createLaneState,
  getAvailableLanes,
  findOldestLane,
  selectLane,
  occupyLane,
  releaseLane,
  calculateLaneY,
} from './laneManager.js';

describe('createLaneState', () => {
  it('指定した数のレーン（全てnull）を持つ状態を作成する', () => {
    const state = createLaneState(5);
    expect(state.lanes).toHaveLength(5);
    expect(state.lanes.every((lane) => lane === null)).toBe(true);
  });

  it('デフォルトのLANE_COUNTで作成できる', () => {
    const state = createLaneState(LANE_COUNT);
    expect(state.lanes).toHaveLength(LANE_COUNT);
  });

  it('0以下の値はエラーを投げる', () => {
    expect(() => createLaneState(0)).toThrow('Lane count must be greater than 0');
    expect(() => createLaneState(-1)).toThrow('Lane count must be greater than 0');
  });
});

describe('getAvailableLanes', () => {
  it('全て空きの場合、全インデックスを返す', () => {
    const lanes: LaneState = [null, null, null];
    expect(getAvailableLanes(lanes)).toEqual([0, 1, 2]);
  });

  it('一部使用中の場合、空きインデックスのみを返す', () => {
    const lanes: LaneState = [1000, null, 2000, null];
    expect(getAvailableLanes(lanes)).toEqual([1, 3]);
  });

  it('全て使用中の場合、空配列を返す', () => {
    const lanes: LaneState = [1000, 2000, 3000];
    expect(getAvailableLanes(lanes)).toEqual([]);
  });
});

describe('findOldestLane', () => {
  it('最も古いタイムスタンプを持つレーンのインデックスを返す', () => {
    const lanes: LaneState = [3000, 1000, 2000];
    expect(findOldestLane(lanes)).toBe(1);
  });

  it('同じタイムスタンプの場合、最初に見つかったインデックスを返す', () => {
    const lanes: LaneState = [2000, 1000, 1000];
    expect(findOldestLane(lanes)).toBe(1);
  });

  it('nullが混在している場合、数値のみから最古を選ぶ', () => {
    const lanes: LaneState = [null, 3000, 1000, null, 2000];
    expect(findOldestLane(lanes)).toBe(2);
  });

  it('全てnullの場合はインデックス0を返す', () => {
    const lanes: LaneState = [null, null, null];
    expect(findOldestLane(lanes)).toBe(0);
  });
});

describe('selectLane', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random');
  });

  it('空きレーンがある場合、空きからランダムに選択する', () => {
    const lanes: LaneState = [1000, null, null];
    vi.mocked(Math.random).mockReturnValue(0); // 最初の空きを選択
    expect(selectLane(lanes)).toBe(1);

    vi.mocked(Math.random).mockReturnValue(0.99); // 最後の空きを選択
    expect(selectLane(lanes)).toBe(2);
  });

  it('全て使用中の場合、最古のレーンを選択する', () => {
    const lanes: LaneState = [3000, 1000, 2000];
    expect(selectLane(lanes)).toBe(1); // 最古（1000）のインデックス
  });
});

describe('occupyLane', () => {
  it('指定したレーンにタイムスタンプを設定する', () => {
    const lanes: LaneState = [null, null, null];
    const newLanes = occupyLane(lanes, 1, 5000);
    expect(newLanes[1]).toBe(5000);
  });

  it('元の配列を変更しない（イミュータブル）', () => {
    const lanes: LaneState = [null, null, null];
    const newLanes = occupyLane(lanes, 1, 5000);
    expect(lanes[1]).toBe(null);
    expect(newLanes).not.toBe(lanes);
  });

  it('範囲外のインデックスはエラーを投げる', () => {
    const lanes: LaneState = [null, null, null];
    expect(() => occupyLane(lanes, -1, 5000)).toThrow('Invalid lane index');
    expect(() => occupyLane(lanes, 3, 5000)).toThrow('Invalid lane index');
  });
});

describe('releaseLane', () => {
  it('指定したレーンをnullに設定する', () => {
    const lanes: LaneState = [1000, 2000, 3000];
    const newLanes = releaseLane(lanes, 1);
    expect(newLanes[1]).toBe(null);
  });

  it('元の配列を変更しない（イミュータブル）', () => {
    const lanes: LaneState = [1000, 2000, 3000];
    const newLanes = releaseLane(lanes, 1);
    expect(lanes[1]).toBe(2000);
    expect(newLanes).not.toBe(lanes);
  });

  it('範囲外のインデックスはエラーを投げる', () => {
    const lanes: LaneState = [null, null, null];
    expect(() => releaseLane(lanes, -1)).toThrow('Invalid lane index');
    expect(() => releaseLane(lanes, 3)).toThrow('Invalid lane index');
  });
});

describe('calculateLaneY', () => {
  it('使用可能範囲内でY座標を計算する', () => {
    const viewportHeight = 800;
    const usableHeight = viewportHeight * (USABLE_RANGE_END - USABLE_RANGE_START);
    const laneHeight = usableHeight / 10;
    const startY = viewportHeight * USABLE_RANGE_START;

    // レーン0は使用可能範囲の先頭
    const y0 = calculateLaneY(0, 10, viewportHeight);
    expect(y0).toBeCloseTo(startY + laneHeight * 0.5, 1);

    // レーン9は使用可能範囲の末尾
    const y9 = calculateLaneY(9, 10, viewportHeight);
    expect(y9).toBeCloseTo(startY + laneHeight * 9.5, 1);
  });

  it('異なる画面高さでも正しく計算する', () => {
    const y1 = calculateLaneY(0, 10, 600);
    const y2 = calculateLaneY(0, 10, 1200);
    // 高さ2倍なら、Y座標も2倍
    expect(y2).toBeCloseTo(y1 * 2, 1);
  });

  it('レーン数が変わっても使用可能範囲内に収まる', () => {
    const viewportHeight = 800;
    const minY = viewportHeight * USABLE_RANGE_START;
    const maxY = viewportHeight * USABLE_RANGE_END;

    for (let i = 0; i < 5; i++) {
      const y = calculateLaneY(i, 5, viewportHeight);
      expect(y).toBeGreaterThanOrEqual(minY);
      expect(y).toBeLessThanOrEqual(maxY);
    }
  });
});

describe('定数の値', () => {
  it('LANE_COUNTは10', () => {
    expect(LANE_COUNT).toBe(10);
  });

  it('USABLE_RANGE_STARTは0.1', () => {
    expect(USABLE_RANGE_START).toBe(0.1);
  });

  it('USABLE_RANGE_ENDは0.9', () => {
    expect(USABLE_RANGE_END).toBe(0.9);
  });
});
