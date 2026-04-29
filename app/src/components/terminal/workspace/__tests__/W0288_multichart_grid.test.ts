/**
 * W-0288 검증: TradingView-style 멀티차트 그리드
 *
 * 검증 항목:
 *   AC1. ChartGridLayout.svelte 존재 + 레이아웃 6종 정의
 *   AC2. ChartPane.svelte 존재 + 독립 symbol/tf 상태
 *   AC3. wsPool.ts 존재 + acquire/snapshot API
 *   AC4. 레이아웃 피커 6종 (1/2H/2V/2+1/2x2/3+1) UI 존재
 *   AC5. TradeMode.svelte에 멀티차트 토글 통합
 *   AC6. pane 닫기 → layout 자동 다운그레이드 로직
 *   AC7. CSS grid 레이아웃 스타일 정의
 *   AC8. 활성 pane border (TradingView 파란 border)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const APP  = resolve(__dirname, '../../../../../');
const WS   = resolve(APP, 'src/components/terminal/workspace');
const LIB  = resolve(APP, 'src/lib/chart');
const MODES = resolve(APP, 'src/lib/cogochi/modes');

function read(p: string) { return readFileSync(p, 'utf-8'); }

describe('W-0288: ChartGridLayout.svelte', () => {

  it('AC1: ChartGridLayout.svelte 파일 존재', () => {
    expect(existsSync(resolve(WS, 'ChartGridLayout.svelte'))).toBe(true);
  });

  it('AC4: 레이아웃 6종 정의 (1/2H/2V/2+1/2x2/3+1)', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    const layouts = ["'1'", "'2H'", "'2V'", "'2+1'", "'2x2'", "'3+1'"];
    for (const l of layouts) {
      expect(src, `레이아웃 ${l} 없음`).toMatch(new RegExp(l.replace('+', '\\+')));
    }
  });

  it('AC7: CSS grid 레이아웃 스타일 (grid-template-columns) 정의', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    expect(src).toMatch(/grid-template-columns/);
    expect(src).toMatch(/grid-template-rows/);
    // 최소 4가지 다른 컬럼 설정이 있어야 함
    const matches = src.match(/grid-template-columns[^;]*/g) ?? [];
    expect(matches.length, '그리드 컬럼 정의 부족').toBeGreaterThanOrEqual(4);
  });

  it('AC6: pane 닫기 시 layout 자동 다운그레이드 로직', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    // closePane 함수가 layout을 변경해야 함
    expect(src).toMatch(/closePane|onClose/);
    // 남은 pane 수에 따른 레이아웃 결정 로직
    expect(src).toMatch(/panes\.length.*layout|layout.*panes\.length/s);
  });

  it('AC4b: 레이아웃 피커 버튼 마크업 존재', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    expect(src).toMatch(/layout-btn/);
    // setLayout 함수 호출 (onclick 핸들러)
    expect(src).toMatch(/setLayout/);
    expect(src).toMatch(/onclick/);
  });

  it('AC5b: 레이아웃 변경 시 pane 수 자동 조정', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    // LAYOUT_PANE_COUNT 또는 유사한 매핑이 있어야 함
    expect(src).toMatch(/PANE_COUNT|pane.*count|needed/i);
  });

  it('레이아웃 2+1 아이템에 grid-area 정의 (스택 레이아웃)', () => {
    const src = read(resolve(WS, 'ChartGridLayout.svelte'));
    expect(src).toMatch(/AREA_MAP|grid-area/);
  });
});


describe('W-0288: ChartPane.svelte', () => {

  it('AC2: ChartPane.svelte 파일 존재', () => {
    expect(existsSync(resolve(WS, 'ChartPane.svelte'))).toBe(true);
  });

  it('AC2b: 독립 symbol/tf state ($state) 존재', () => {
    const src = read(resolve(WS, 'ChartPane.svelte'));
    // 각 pane이 자신의 symbol/tf 상태를 가져야 함
    expect(src).toMatch(/let symbol\s*=\s*\$state/);
    expect(src).toMatch(/let tf\s*=\s*\$state/);
  });

  it('AC8: 활성 pane 파란 border (TradingView 스타일)', () => {
    const src = read(resolve(WS, 'ChartPane.svelte'));
    // active class에 파란 border
    expect(src).toMatch(/\.active/);
    expect(src).toMatch(/border.*color.*#[0-9a-f]{3,6}|2563eb|3b82f6/i);
  });

  it('AC2c: 인라인 symbol 에디터 (클릭 → input)', () => {
    const src = read(resolve(WS, 'ChartPane.svelte'));
    expect(src).toMatch(/editing\s*=\s*\$state/);
    expect(src).toMatch(/<input/);
    expect(src).toMatch(/sym-input|symInput/i);
  });

  it('ChartPane이 ChartBoard를 import하고 wrapping', () => {
    const src = read(resolve(WS, 'ChartPane.svelte'));
    expect(src).toMatch(/import ChartBoard/);
    expect(src).toMatch(/<ChartBoard/);
  });

  it('onActivate / onClose / onSymbolChange / onTfChange callback 존재', () => {
    const src = read(resolve(WS, 'ChartPane.svelte'));
    expect(src).toMatch(/onActivate/);
    expect(src).toMatch(/onClose/);
    expect(src).toMatch(/onSymbolChange/);
    expect(src).toMatch(/onTfChange/);
  });
});


describe('W-0288: wsPool.ts', () => {

  it('AC3: wsPool.ts 파일 존재', () => {
    expect(existsSync(resolve(LIB, 'wsPool.ts'))).toBe(true);
  });

  it('AC3b: acquire / snapshot API export', () => {
    const src = read(resolve(LIB, 'wsPool.ts'));
    expect(src).toMatch(/acquire/);
    expect(src).toMatch(/snapshot/);
    expect(src).toMatch(/export.*wsPool/);
  });

  it('AC3c: reference-counted (refCount) WS 관리', () => {
    const src = read(resolve(LIB, 'wsPool.ts'));
    expect(src).toMatch(/refCount/);
    // 마지막 subscriber 해제 시 WS close
    expect(src).toMatch(/refCount\s*<=\s*0.*close|close.*refCount\s*<=\s*0/s);
  });

  it('AC3d: Map 기반 pool (URL → entry)', () => {
    const src = read(resolve(LIB, 'wsPool.ts'));
    expect(src).toMatch(/new Map/);
    expect(src).toMatch(/_pool\.get\(url\)|pool\.get\(url\)/);
  });
});


describe('W-0288: TradeMode 통합', () => {

  it('AC5: TradeMode.svelte에 ChartGridLayout import', () => {
    const src = read(resolve(MODES, 'TradeMode.svelte'));
    expect(src).toMatch(/import ChartGridLayout/);
  });

  it('AC5b: multiChartMode 토글 상태 존재', () => {
    const src = read(resolve(MODES, 'TradeMode.svelte'));
    expect(src).toMatch(/multiChartMode\s*=\s*\$state/);
  });

  it('AC5c: 토글 버튼 (⊞ 또는 multichart) 마크업 존재', () => {
    const src = read(resolve(MODES, 'TradeMode.svelte'));
    expect(src).toMatch(/multichart|multiChart|⊞/);
    expect(src).toMatch(/onclick.*multiChartMode|multiChartMode.*onclick/s);
  });

  it('AC5d: 기존 ChartBoard wiring 유지 (단일 모드에서 verdict/gammaPin 전달)', () => {
    const src = read(resolve(MODES, 'TradeMode.svelte'));
    // 단일 모드에서는 기존 ChartBoard가 verdictLevels와 gammaPin을 받아야 함
    expect(src).toMatch(/verdictLevels/);
    expect(src).toMatch(/gammaPin/);
    // 조건부 렌더링
    expect(src).toMatch(/\{#if multiChartMode\}/);
  });
});
