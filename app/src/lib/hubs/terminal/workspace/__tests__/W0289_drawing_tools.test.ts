/**
 * W-0289 검증: TradingView 스타일 차트 드로잉 도구
 *
 * 검증 항목:
 *   AC1. DrawingManager.ts 존재 + 7가지 도구 타입 정의
 *   AC2. localStorage 직렬화 (save/load)
 *   AC3. zoom/pan 후 위치 유지 (timeToCoordinate 실시간 변환)
 *   AC4. Fibonacci 7레벨 (0/23.6/38.2/50/61.8/78.6/100%)
 *   AC5. DrawingToolbar.svelte 존재 + 8가지 도구 버튼
 *   AC6. DrawingCanvas.svelte 존재 + canvas overlay 구조
 *   AC7. ChartBoard.svelte에 드로잉 도구 통합
 *   AC8. 멀티차트 pane간 독립 DrawingManager (storageKey per symbol:tf)
 *   AC9. FSM 상태 (idle/drawing/complete)
 *   AC10. 키보드 단축키 (T/H/V/E/R/F/L/Escape)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const APP  = resolve(__dirname, '../../../../../');
const WS   = resolve(APP, 'src/components/terminal/workspace');
const LIB  = resolve(APP, 'src/lib/chart');

function read(p: string) { return readFileSync(p, 'utf-8'); }


// ── DrawingManager 단위 검증 ──────────────────────────────────────────────────
describe('W-0289: DrawingManager.ts', () => {

  it('AC1: DrawingManager.ts 파일 존재', () => {
    expect(existsSync(resolve(LIB, 'DrawingManager.ts'))).toBe(true);
  });

  it('AC1b: DrawingToolType에 7가지 도구 타입 정의', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    const required: string[] = [
      'trendLine',
      'horizontalLine',
      'verticalLine',
      'extendedLine',
      'rectangle',
      'fibRetracement',
      'textLabel',
    ];
    for (const tool of required) {
      expect(src, `DrawingToolType에 '${tool}' 없음`).toMatch(
        new RegExp(`'${tool}'`)
      );
    }
  });

  it('AC9: FSM 상태 (idle/drawing/complete) 정의', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/'idle'/);
    expect(src).toMatch(/'drawing'/);
    // complete 또는 committed
    expect(src).toMatch(/'complete'|commitDrawing/);
  });

  it('AC2: localStorage save/load 메서드 존재', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/localStorage\.setItem/);
    expect(src).toMatch(/localStorage\.getItem/);
    expect(src).toMatch(/private save\(\)|function save/);
    expect(src).toMatch(/private load\(\)|function load/);
  });

  it('AC8: storageKey를 symbol:tf 기반으로 per-pane 격리', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    // 생성자에서 storageKey를 받아야 함
    expect(src).toMatch(/storageKey/);
    expect(src).toMatch(/constructor.*storageKey|storageKey.*constructor/s);
    // public readonly로 외부에서 체크 가능해야 함
    expect(src).toMatch(/public.*storageKey|storageKey.*public/);
  });

  it('AC3: chart timeToCoordinate / priceToCoordinate 실시간 변환', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/timeToCoordinate/);
    expect(src).toMatch(/priceToCoordinate/);
    // render 함수에서 호출해야 함
    expect(src).toMatch(/toCanvasX|toCanvasY/);
  });

  it('AC3b: chart range 변경 시 re-render (subscribeVisibleLogicalRangeChange)', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/subscribeVisibleLogicalRangeChange/);
    expect(src).toMatch(/unsubscribeVisibleLogicalRangeChange/);
  });

  it('AC4: Fibonacci 7레벨 정확히 정의', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    // TradingView 표준 7레벨
    const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    for (const level of fibLevels) {
      expect(src, `피보나치 레벨 ${level} 없음`).toMatch(
        new RegExp(String(level).replace('.', '\\.'))
      );
    }
    // 7개 레벨 배열
    expect(src).toMatch(/FIB_LEVELS\s*=\s*\[/);
  });

  it('pointsNeeded: horizontalLine/verticalLine = 1점, trendLine/rectangle/fib = 2점', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/pointsNeeded/);
    // horizontalLine은 1점
    expect(src).toMatch(/horizontalLine.*return 1|return 1.*horizontalLine/s);
    // trendLine은 2점
    expect(src).toMatch(/trendLine.*return 2|return 2.*trendLine/s);
  });

  it('setTool 토글 기능 (같은 툴 클릭 → cursor 복귀)', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    expect(src).toMatch(/setTool/);
    // 같은 툴이면 cursor로 토글
    expect(src).toMatch(/activeTool.*tool.*cursor|cursor.*activeTool.*tool/s);
  });

  it('API: attach / detach / setTool / clearAll / deleteSelected / render 모두 존재', () => {
    const src = read(resolve(LIB, 'DrawingManager.ts'));
    const methods = ['attach', 'detach', 'setTool', 'clearAll', 'deleteSelected', 'render', 'setCanvas'];
    for (const m of methods) {
      expect(src, `DrawingManager.${m}() 없음`).toMatch(new RegExp(`${m}\\s*\\(`));
    }
  });
});


// ── DrawingToolbar 검증 ───────────────────────────────────────────────────────
describe('W-0289: DrawingToolbar.svelte', () => {

  it('AC5: DrawingToolbar.svelte 파일 존재', () => {
    expect(existsSync(resolve(WS, 'DrawingToolbar.svelte'))).toBe(true);
  });

  it('AC5b: 8개 도구 버튼 정의 (cursor 포함)', () => {
    const src = read(resolve(WS, 'DrawingToolbar.svelte'));
    const tools = [
      'cursor', 'trendLine', 'horizontalLine', 'verticalLine',
      'extendedLine', 'rectangle', 'fibRetracement', 'textLabel',
    ];
    for (const t of tools) {
      expect(src, `툴바에 '${t}' 없음`).toMatch(new RegExp(t));
    }
  });

  it('각 버튼 aria-pressed 속성 존재 (접근성)', () => {
    const src = read(resolve(WS, 'DrawingToolbar.svelte'));
    expect(src).toMatch(/aria-pressed/);
  });

  it('clearAll / deleteSelected 버튼 존재', () => {
    const src = read(resolve(WS, 'DrawingToolbar.svelte'));
    expect(src).toMatch(/onClearAll|clearAll/);
    expect(src).toMatch(/onDeleteSelected|deleteSelected/);
  });
});


// ── DrawingCanvas 검증 ────────────────────────────────────────────────────────
describe('W-0289: DrawingCanvas.svelte', () => {

  it('AC6: DrawingCanvas.svelte 파일 존재', () => {
    expect(existsSync(resolve(WS, 'DrawingCanvas.svelte'))).toBe(true);
  });

  it('AC6b: <canvas> 엘리먼트 + 절대 위치 overlay 스타일', () => {
    const src = read(resolve(WS, 'DrawingCanvas.svelte'));
    expect(src).toMatch(/<canvas/);
    expect(src).toMatch(/position:\s*absolute/);
    expect(src).toMatch(/pointer-events:\s*none/);
  });

  it('AC6c: ResizeObserver로 canvas 크기 동기화', () => {
    const src = read(resolve(WS, 'DrawingCanvas.svelte'));
    expect(src).toMatch(/ResizeObserver/);
    expect(src).toMatch(/sizeCanvas/);
  });

  it('AC6d: devicePixelRatio(DPR) 반영 (고해상도 디스플레이 지원)', () => {
    const src = read(resolve(WS, 'DrawingCanvas.svelte'));
    // dpr 처리는 DrawingManager 또는 DrawingCanvas 중 하나에 있어야 함
    const dmSrc = read(resolve(LIB, 'DrawingManager.ts'));
    const hasDpr = src.includes('devicePixelRatio') || dmSrc.includes('devicePixelRatio');
    expect(hasDpr, 'devicePixelRatio 처리 없음 — Retina 디스플레이에서 흐릿함').toBe(true);
  });
});


// ── ChartBoard 통합 검증 ──────────────────────────────────────────────────────
describe('W-0289: ChartBoard.svelte 드로잉 도구 통합', () => {

  it('AC7: DrawingManager import 존재', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import.*DrawingManager/);
  });

  it('AC7b: drawingToolsVisible 상태 존재', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/drawingToolsVisible\s*=\s*\$state/);
  });

  it('AC7c: DrawingCanvas 컴포넌트 사용', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import DrawingCanvas/);
    expect(src).toMatch(/<DrawingCanvas/);
  });

  it('AC7d: DrawingToolbar 컴포넌트 사용', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/import DrawingToolbar/);
    expect(src).toMatch(/<DrawingToolbar/);
  });

  it('AC7e: drawingMgr가 renderCharts 완료 후 attach', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    // DrawingManager는 mainChart와 priceSeries가 있을 때만 attach
    expect(src).toMatch(/new DrawingManager/);
    expect(src).toMatch(/drawingMgr\.attach/);
  });

  it('AC10: 키보드 단축키 등록 (DrawingToolbar 또는 전역)', () => {
    // DrawingToolbar나 DrawingCanvas 중 하나에 키보드 처리 있어야 함
    const tbSrc = read(resolve(WS, 'DrawingToolbar.svelte'));
    const cbSrc = read(resolve(WS, 'ChartBoard.svelte'));
    const cvSrc = read(resolve(WS, 'DrawingCanvas.svelte'));
    const hasShorcuts =
      tbSrc.includes('keydown') ||
      cbSrc.includes('keydown') ||
      cvSrc.includes('keydown');
    // 단축키는 DrawingManager에 직접 있을 수도
    const dmSrc = read(resolve(LIB, 'DrawingManager.ts'));
    expect(hasShorcuts || dmSrc.includes('keydown'), '키보드 단축키 없음').toBe(true);
  });

  it('ChartBoardHeader에 드로잉 토글 버튼 연결', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    expect(src).toMatch(/onToggleDrawingTools/);
    expect(src).toMatch(/drawingToolsVisible.*onToggleDrawingTools|onToggleDrawingTools.*drawingToolsVisible/s);
  });
});


// ── 멀티차트 pane 독립성 ──────────────────────────────────────────────────────
describe('W-0289: 멀티차트 pane 독립 DrawingManager', () => {
  it('AC8: storageKey = drawings:{symbol}:{tf} 형식으로 pane별 격리', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    // drawings:${symbol}:${tf} 패턴
    expect(src).toMatch(/drawings:.*symbol.*tf|`drawings:\$\{symbol\}:\$\{tf\}`/s);
  });

  it('AC8b: symbol/tf 변경 시 DrawingManager 재초기화', () => {
    const src = read(resolve(WS, 'ChartBoard.svelte'));
    // storageKey !== key일 때 새 DrawingManager 생성
    expect(src).toMatch(/drawingMgr\.storageKey\s*!==\s*key|storageKey.*key.*DrawingManager/s);
  });
});
