import { TestBed } from '@angular/core/testing';
import { Barcode } from './barcode';

describe('Barcode', () => {
  const render = (value: string | null) => {
    const fixture = TestBed.createComponent(Barcode);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('draws a valid EAN-13 as SVG with its digits and an accessible label', () => {
    const element = render('4006381333931');
    const svg = element.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('Code-barres 4006381333931');
    expect(element.textContent).toContain('4006381333931');
    // background + bars
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20);
  });

  it('leaves room for the quiet zone around the bars', () => {
    const svg = render('4006381333931').querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 113 60'); // 95 modules + 2 × 9
    const bars = Array.from(svg.querySelectorAll('rect')).slice(1);
    expect(Math.min(...bars.map((b) => Number(b.getAttribute('x'))))).toBe(9);
  });

  it('draws nothing for an invalid, empty or missing value', () => {
    for (const value of ['4006381333932', '', null]) {
      expect(render(value).querySelector('svg'), String(value)).toBeNull();
    }
  });
});
