import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { extractError, fieldErrors } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { Product, PurchaseOrder, Supplier } from '../../../models/inventory';
import { ProductService } from '../../../services/product';
import { PurchaseOrderService } from '../../../services/purchase-order';
import { SupplierService } from '../../../services/supplier';

/** Quantity that brings a product back to twice its alert threshold (at least 1). */
export function suggestedQuantity(product: Pick<Product, 'quantity' | 'low_stock_threshold'>) {
  return Math.max(product.low_stock_threshold * 2 - product.quantity, 1);
}

function newLine(product: number, name: string, sku: string, quantity = 1, unitCost = 0) {
  return new FormGroup({
    product: new FormControl(product, { nonNullable: true }),
    name: new FormControl(name, { nonNullable: true }),
    sku: new FormControl(sku, { nonNullable: true }),
    quantity: new FormControl(quantity, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    unit_cost: new FormControl(unitCost, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });
}

@Component({
  selector: 'app-purchase-order-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './purchase-order-form.html',
})
export class PurchaseOrderForm {
  private orderApi = inject(PurchaseOrderService);
  private supplierApi = inject(SupplierService);
  private productApi = inject(ProductService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;

  readonly suppliers = signal<Supplier[]>([]);
  readonly candidates = signal<Product[]>([]);
  readonly loading = signal(this.id !== null);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly total = signal(0);
  readonly productSearch = new FormControl('', { nonNullable: true });

  readonly form = new FormGroup({
    supplier: new FormControl<number | null>(null, Validators.required),
    expected_date: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    lines: new FormArray<ReturnType<typeof newLine>>([]),
  });

  constructor() {
    this.supplierApi.list().subscribe({
      next: (list) => this.suppliers.set(list.filter((s) => s.is_active)),
      error: (err) =>
        this.toast.error(extractError(err, 'Impossible de charger les fournisseurs.')),
    });

    this.form.controls.lines.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.total.set(this.computeTotal()));

    this.productSearch.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((search) =>
          search.trim().length < 2
            ? of(null)
            : this.productApi
                .list({ search: search.trim(), isActive: true })
                .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => this.candidates.set(page?.results.slice(0, 8) ?? []));

    if (this.id !== null) this.loadOrder(this.id);
  }

  get lines() {
    return this.form.controls.lines;
  }

  errorsFor(field: string): string[] {
    return this.serverErrors()[field] ?? [];
  }

  private loadOrder(id: number) {
    this.orderApi.get(id).subscribe({
      next: (order) => {
        this.loading.set(false);
        if (order.status !== 'DRAFT') {
          this.loadError.set('Seul un bon de commande en brouillon peut être modifié.');
          return;
        }
        this.fill(order);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(extractError(err, 'Bon de commande introuvable.'));
      },
    });
  }

  private fill(order: PurchaseOrder) {
    this.form.patchValue({
      supplier: order.supplier,
      expected_date: order.expected_date ?? '',
      notes: order.notes,
    });
    for (const line of order.lines) {
      this.lines.push(
        newLine(
          line.product,
          line.product_name,
          line.product_sku,
          line.quantity,
          Number(line.unit_cost),
        ),
      );
    }
  }

  hasProduct(id: number) {
    return this.lines.controls.some((line) => line.controls.product.value === id);
  }

  addProduct(product: Product) {
    if (!this.hasProduct(product.id)) {
      this.lines.push(newLine(product.id, product.name, product.sku));
    }
    this.productSearch.setValue('');
    this.candidates.set([]);
  }

  removeLine(index: number) {
    this.lines.removeAt(index);
  }

  /** Add the low-stock products of the chosen supplier, with a suggested quantity. */
  addLowStock() {
    const supplier = this.form.controls.supplier.value;
    if (supplier === null) return;
    this.productApi.lowStock().subscribe({
      next: (products) => {
        const toAdd = products.filter((p) => p.supplier === supplier && !this.hasProduct(p.id));
        for (const p of toAdd) {
          this.lines.push(newLine(p.id, p.name, p.sku, suggestedQuantity(p)));
        }
        this.toast.show(
          toAdd.length
            ? `${toAdd.length} produit(s) en stock bas ajouté(s). Renseignez les prix d'achat.`
            : 'Aucun produit en stock bas pour ce fournisseur.',
          'info',
        );
      },
      error: (err) => this.toast.error(extractError(err, 'Impossible de charger le stock bas.')),
    });
  }

  private computeTotal() {
    return this.lines.controls.reduce(
      (sum, line) => sum + line.controls.quantity.value * line.controls.unit_cost.value,
      0,
    );
  }

  save() {
    if (this.form.invalid || this.lines.length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body = {
      supplier: value.supplier!,
      expected_date: value.expected_date || null,
      notes: value.notes,
      lines: value.lines.map((l) => ({
        product: l.product,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      })),
    };
    const request = this.id ? this.orderApi.update(this.id, body) : this.orderApi.create(body);

    this.saving.set(true);
    this.serverErrors.set({});
    request.subscribe({
      next: (order) => {
        this.saving.set(false);
        this.toast.success(
          this.id ? `${order.reference} modifié.` : `${order.reference} créé en brouillon.`,
        );
        this.router.navigate(['/purchase-orders', order.id]);
      },
      error: (err) => {
        this.saving.set(false);
        const errors = fieldErrors(err);
        this.serverErrors.set(errors);
        if (Object.keys(errors).length === 0) {
          this.toast.error(extractError(err, "L'enregistrement a échoué."));
        }
      },
    });
  }
}
