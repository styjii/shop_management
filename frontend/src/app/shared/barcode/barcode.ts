import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { eanModules, toBars } from '../../core/ean';

const QUIET_ZONE = 9; // empty modules required on each side so that scanners can read it
const BAR_HEIGHT = 48;

/** Draws an EAN-13 / UPC-A / EAN-8 code as SVG. Nothing is drawn for an invalid value. */
@Component({
  selector: 'app-barcode',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './barcode.html',
})
export class Barcode {
  readonly value = input<string | null>('');

  protected readonly modules = computed(() => {
    const value = this.value();
    return value ? eanModules(value) : null;
  });

  protected readonly bars = computed(() =>
    toBars(this.modules() ?? '').map((bar) => ({ ...bar, x: bar.x + QUIET_ZONE })),
  );

  protected readonly width = computed(() => (this.modules()?.length ?? 0) + 2 * QUIET_ZONE);
  protected readonly barHeight = BAR_HEIGHT;
  protected readonly height = BAR_HEIGHT + 12;
}
