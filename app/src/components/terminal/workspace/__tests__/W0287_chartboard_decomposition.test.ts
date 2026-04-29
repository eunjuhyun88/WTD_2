/**
 * W-0287 검증: ChartBoard 분해 + 버그 수정 + 신규 차트 타입
 *
 * 검증 항목:
 *   AC1. ChartBoard.svelte 파일 크기 ≤ 2,600줄 (분해 목표)
 *   AC2. useChartDataFeed.svelte.ts 존재 (composable 추출)
 *   AC3. usePriceLines.ts 존재 (PriceLineManager 추출)
 *   AC4. ChartBoardHeader.svelte 존재 (sub-component 추출)
 *   AC5. scrollToRealTime() 호출 코드 존재 (BUG-1 수정)
 *   AC6. handleScroll / handleScale: true 설정 존재 (BUG-2 수정)
 *   AC7. chartMode 타입에 'bar' | 'area' | 'heikin' 포함 (신규 차트 타입)
 *   AC8. PriceScaleMode import 존재 (Log/% 스케일)
 *   AC9. BarSeries / AreaSeries import 존재
 *   AC10. priceSeries 타입에 Area / Bar 포함 (TS 에러 0)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// __dirname = app/src/components/terminal/workspace/__tests__
// 5 levels up = app/
const APP  = resolve(__dirname, '../../../../../');
const WS   = resolve(APP, 'src/components/terminal/workspace');
const LIB  = resolve(APP, 'src/lib/chart');

function read(p: string) { return readFileSync(p, 'utf-8'); }
function lineCount(p: string) { return read(p).split('\n').length; }

describe('W-0287: ChartBoard 분해 검증', () => {

  // ── AC1: 파일 크기 ───────────────────────────────────────────────────────
  it('AC1: ChartBoard.svelte ≤ 2,600줄 (분해 목표)', () => {
    const path = resolve(WS, 'ChartBoard.svelte');
    expect(existsSync(path), 'ChartBoard.svelte 파일 없음').toBe(true);
    const lines = lineCount(path);
    // 원본 3,276줄 → 목표 2,600줄 이하
    expect(lines, `ChartBoard.svelte ${lines}줄 — 목표 ≤ 2,600줄`).toBeLessThanOrEqual(2600);
  });

  // ── AC2~4: 추출된 파일 존재 ──────────────────────────────────────────────
  it('AC2: useChartDataFeed.svelte.ts 존재 (composable 추출)', () => {
    expect(existsSync(resolve(LIB, 'useChartDataFeed.svelte.ts'))).toBe(true);
  });

  it('AC3: usePriceLines.ts 존재 (PriceLineManager 추출)', () => {
    expect(existsSync(resolve(LIB, 'usePriceLines.ts'))).toBe(true);
  });

  it('AC4: ChartBoardHeader.svelte 존재 (sub-component 추출)', () => {
    expect(existsSync(resolve(WS, 'ChartBoardHeader.svelte'))).toBe(true);
  });

  // ── AC5: scrollToRealTime BUG 수정 ───────────────────────────────────────
  it('AC5: scrollToRealTime() 호출 존재 (초기 오늘 날짜 표시 BUG 수정)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/scrollToRealTime\(\)/);
    // tick() 이후에 호출되어야 함 (DOM 업데이트 후)
    expect(src).toMatch(/tick\(\)[^}]*scrollToRealTime|scrollToRealTime.*tick/s);
  });

  // ── AC6: handleScroll/Scale 활성화 ───────────────────────────────────────
  it('AC6: handleScroll: true 설정 (차트 스크롤 활성화)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src, 'handleScroll: true 없음').toMatch(/handleScroll\s*:\s*true/);
  });

  it('AC6b: handleScale: true 설정 (차트 줌 활성화)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src, 'handleScale: true 없음').toMatch(/handleScale\s*:\s*true/);
  });

  // ── AC7: 신규 차트 타입 ───────────────────────────────────────────────────
  it('AC7: chartMode 타입에 bar / area / heikin 포함', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/'bar'/);
    expect(src).toMatch(/'area'/);
    expect(src).toMatch(/'heikin'/);
  });

  // ── AC8: Log/% 스케일 ────────────────────────────────────────────────────
  it('AC8: PriceScaleMode import 존재 (Log/% 스케일 모드)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/PriceScaleMode/);
    expect(src).toMatch(/'log'|PriceScaleMode\.Logarithmic/);
    expect(src).toMatch(/'percent'|PriceScaleMode\.Percentage/);
  });

  // ── AC9: BarSeries / AreaSeries ──────────────────────────────────────────
  it('AC9: BarSeries, AreaSeries import 존재', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/BarSeries/);
    expect(src).toMatch(/AreaSeries/);
  });

  // ── AC10: priceSeries 타입 ───────────────────────────────────────────────
  it('AC10: priceSeries 타입에 Area와 Bar 포함 (TS 에러 0)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    // 타입 선언에 Area와 Bar가 모두 포함되어야 함
    expect(src).toMatch(/ISeriesApi<'Area'>/);
    expect(src).toMatch(/ISeriesApi<'Bar'>/);
  });

  // ── Heikin Ashi 계산 로직 ─────────────────────────────────────────────────
  it('AC7b: Heikin Ashi 계산 로직 존재 (haClose, haOpen)', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/haClose\s*=/);
    expect(src).toMatch(/haOpen\s*=/);
    // haClose = (O+H+L+C)/4
    expect(src).toMatch(/open.*high.*low.*close.*\/\s*4|4.*haClose/s);
  });

  // ── ChartBoardHeader 연결 ────────────────────────────────────────────────
  it('AC4b: ChartBoard.svelte가 ChartBoardHeader를 import하고 사용', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import ChartBoardHeader/);
    expect(src).toMatch(/<ChartBoardHeader/);
  });

  // ── useChartDataFeed 연결 ────────────────────────────────────────────────
  it('AC2b: ChartBoard.svelte가 useChartDataFeed를 import하고 사용', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import.*useChartDataFeed/);
    expect(src).toMatch(/useChartDataFeed\(/);
  });

  // ── PriceLineManager 연결 ────────────────────────────────────────────────
  it('AC3b: ChartBoard.svelte가 PriceLineManager를 import하고 사용', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import.*usePriceLines|PriceLineManager/);
  });
});


// ── 번외: useChartDataFeed API 계약 검증 ─────────────────────────────────────
describe('W-0287: useChartDataFeed composable API', () => {
  it('loadData / loadMoreHistory 함수 export (DataFeed WS 연결 포함)', () => {
    const src = read(resolve(LIB, 'useChartDataFeed.svelte.ts'));
    expect(src).toMatch(/loadData/);
    expect(src).toMatch(/loadMore|loadMoreHistory/i);
    // DataFeed 클래스가 connect/disconnect 담당
    const dfSrc = read(resolve(LIB, 'DataFeed.ts'));
    expect(dfSrc).toMatch(/connect/);
    expect(dfSrc).toMatch(/disconnect/);
  });

  it('chartData / loading / error reactive 상태 export', () => {
    const src = read(resolve(LIB, 'useChartDataFeed.svelte.ts'));
    expect(src).toMatch(/chartData/);
    expect(src).toMatch(/loading/);
    expect(src).toMatch(/error/);
  });
});


// ── 번외: PriceLineManager API 계약 검증 ─────────────────────────────────────
describe('W-0287: PriceLineManager API', () => {
  it('updateVerdictLevels / clearLiqLines / applyLiqLines / applyWhaleLines 존재', () => {
    const src = read(resolve(LIB, 'usePriceLines.ts'));
    expect(src).toMatch(/updateVerdictLevels|setSeries/);
    expect(src).toMatch(/clearLiq|applyLiq/);
    expect(src).toMatch(/whale|Whale/i);
  });
});
