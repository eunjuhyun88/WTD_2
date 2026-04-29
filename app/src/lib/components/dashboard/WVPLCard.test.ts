import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import WVPLCard from './WVPLCard.svelte';

const WEEKS = [
  { week_start: '2026-04-27', loop_count: 3, capture_n: 4, search_n: 5, verdict_n: 3 },
  { week_start: '2026-04-20', loop_count: 2, capture_n: 2, search_n: 3, verdict_n: 2 },
  { week_start: '2026-04-13', loop_count: 1, capture_n: 1, search_n: 2, verdict_n: 1 },
];

afterEach(() => cleanup());

describe('WVPLCard', () => {
  it('renders current loop count and component breakdown', () => {
    render(WVPLCard, { weeks: WEEKS });

    expect(screen.getByText('WEEKLY LOOPS · WVPL')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText(/4c \/ 5s \/ 3v/)).toBeTruthy();
  });

  it('renders loading state', () => {
    render(WVPLCard, { loading: true });

    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.getByText('loading')).toBeTruthy();
  });

  it('renders error state', () => {
    render(WVPLCard, { error: 'Engine timed out' });

    expect(screen.getByText('!')).toBeTruthy();
    expect(screen.getByText('Engine timed out')).toBeTruthy();
  });

  it('renders empty state when no week data exists', () => {
    render(WVPLCard, { weeks: [] });

    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('no data this week')).toBeTruthy();
  });

  it('draws a sparkline path for multi-week data', () => {
    const { container } = render(WVPLCard, { weeks: WEEKS });

    const path = container.querySelector('svg.spark path');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('d')).toMatch(/^M\d+\.\d,\d+\.\d L/);
  });

  it('uses the good trend color when target is reached', () => {
    const { container } = render(WVPLCard, { weeks: WEEKS });

    const card = container.querySelector('.wvpl-card');
    expect(card?.getAttribute('style')).toContain('--sc-good');
  });
});
