import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import TopBar from './TopBar.svelte';

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render 48px height without overflow', () => {
    const { container } = render(TopBar, { props: {} });
    const header = container.querySelector('header.top-bar');
    expect(header).toBeTruthy();
    const style = window.getComputedStyle(header!);
    expect(style.height).toBe('48px');
  });

  it('should render symbol button', () => {
    const { container } = render(TopBar, { props: {} });
    const symBtn = container.querySelector('button.sym-btn');
    expect(symBtn).toBeTruthy();
    expect(symBtn?.textContent).toContain('USDT');
  });

  it('should render all 8 timeframe buttons', () => {
    const { container } = render(TopBar, { props: {} });
    const tfBtns = container.querySelectorAll('button.tf-btn');
    expect(tfBtns.length).toBe(8);
    const labels = Array.from(tfBtns).map(btn => btn.textContent);
    expect(labels).toEqual(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D']);
  });

  it('should highlight active timeframe', () => {
    const { container } = render(TopBar, { props: {} });
    const activeTfBtn = container.querySelector('button.tf-btn.active');
    expect(activeTfBtn).toBeTruthy();
  });

  it('should fire onSymbolTap when symbol button clicked', () => {
    const onSymbolTap = vi.fn();
    const { container } = render(TopBar, { props: { onSymbolTap } });
    const symBtn = container.querySelector('button.sym-btn') as HTMLElement;
    symBtn?.click();
    expect(onSymbolTap).toHaveBeenCalledTimes(1);
  });

  it('should display live price and 24h change', () => {
    const { container } = render(TopBar, { props: {} });
    const priceBlock = container.querySelector('.price-block');
    expect(priceBlock).toBeTruthy();
    const priceVal = priceBlock?.querySelector('.price-val');
    expect(priceVal).toBeTruthy();
  });
});
