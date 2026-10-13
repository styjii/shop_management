import { TestBed } from '@angular/core/testing';
import { BarChart, niceMax } from './bar-chart';

describe('niceMax', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-4)).toBe(1);
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(1.4)).toBe(2);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(50)).toBe(50);
    expect(niceMax(51)).toBe(100);
    expect(niceMax(1234)).toBe(2000);
  });
});

describe('BarChart', () => {
  const render = (points: { label: string; value: number }[]) => {
    const fixture = TestBed.createComponent(BarChart);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('title', 'CA par jour');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('draws one bar per point with a tooltip showing the amount', () => {
    const element = render([
      { label: '11/10', value: 0 },
      { label: '12/10', value: 12 },
    ]);
    const bars = element.querySelectorAll('rect');
    expect(bars).toHaveLength(2);
    expect(bars[1].querySelector('title')?.textContent).toContain('12/10');
    expect(bars[1].querySelector('title')?.textContent).toMatch(/12[.,]00/);
  });

  it('scales the bars to the highest value', () => {
    const bars = render([
      { label: 'a', value: 10 },
      { label: 'b', value: 5 },
    ]).querySelectorAll('rect');
    const [tall, short] = Array.from(bars).map((b) => Number(b.getAttribute('height')));
    expect(tall).toBeGreaterThan(0);
    expect(short).toBeCloseTo(tall / 2, 5);
  });

  it('shows a flat chart without error when there is no data', () => {
    const element = render([]);
    expect(element.querySelectorAll('rect')).toHaveLength(0);
    expect(element.querySelector('svg')?.getAttribute('aria-label')).toBe('CA par jour');
  });

  it('limits the axis labels when there are many days', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ label: `d${i}`, value: i }));
    const labels = Array.from(render(points).querySelectorAll('text')).filter((t) =>
      /^d\d+$/.test(t.textContent?.trim() ?? ''),
    );
    expect(labels.length).toBeLessThanOrEqual(10);
    expect(labels.length).toBeGreaterThan(3);
  });
});
