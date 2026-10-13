import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 48 };
const TICKS = 4;

/** A "nice" axis maximum (1, 2, 5 × a power of ten) at or above the highest value. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exponent = Math.floor(Math.log10(max));
  const fraction = max / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

/** Vertical bar chart drawn with SVG: no charting library. */
@Component({
  selector: 'app-bar-chart',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './bar-chart.html',
})
export class BarChart {
  readonly points = input<ChartPoint[]>([]);
  readonly title = input('Graphique');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly baseline = HEIGHT - MARGIN.bottom;
  protected readonly left = MARGIN.left;
  protected readonly right = WIDTH - MARGIN.right;

  protected readonly max = computed(() =>
    niceMax(Math.max(0, ...this.points().map((p) => p.value))),
  );

  protected readonly ticks = computed(() =>
    Array.from({ length: TICKS + 1 }, (_, i) => {
      const value = (this.max() * i) / TICKS;
      return {
        label: new Intl.NumberFormat('fr-FR', {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value),
        y: this.baseline - (value / this.max()) * (this.baseline - MARGIN.top),
      };
    }),
  );

  protected readonly bars = computed(() => {
    const points = this.points();
    const slot = (this.right - this.left) / Math.max(points.length, 1);
    const every = Math.max(1, Math.ceil(points.length / 10)); // at most ~10 labels on the axis
    return points.map((point, index) => {
      const height = (point.value / this.max()) * (this.baseline - MARGIN.top);
      return {
        ...point,
        x: this.left + index * slot + slot * 0.15,
        width: slot * 0.7,
        y: this.baseline - height,
        height,
        labelX: this.left + index * slot + slot / 2,
        showLabel: index % every === 0,
      };
    });
  });
}
