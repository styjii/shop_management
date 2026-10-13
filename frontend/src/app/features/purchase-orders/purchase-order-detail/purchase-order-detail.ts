import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { extractError } from '../../../core/errors';
import { ToastService } from '../../../core/toast';
import { ORDER_STATUSES, PurchaseOrder } from '../../../models/inventory';
import { PurchaseOrderService } from '../../../services/purchase-order';

type Action = 'send' | 'receive' | 'cancel' | 'delete';

const CONFIRMATIONS: Record<
  Action,
  { title: string; text: string; button: string; danger: boolean }
> = {
  send: {
    title: 'Marquer comme envoyé ?',
    text: "Le bon ne pourra plus être modifié. Pensez à l'envoyer au fournisseur (impression ou PDF).",
    button: 'Marquer comme envoyé',
    danger: false,
  },
  receive: {
    title: 'Réceptionner la marchandise ?',
    text: 'Les quantités du bon seront ajoutées au stock et une entrée sera enregistrée pour chaque produit. Cette action est définitive.',
    button: 'Réceptionner',
    danger: false,
  },
  cancel: {
    title: 'Annuler ce bon de commande ?',
    text: 'Le bon passera au statut « Annulé » et ne pourra plus être réceptionné.',
    button: 'Annuler le bon',
    danger: true,
  },
  delete: {
    title: 'Supprimer ce brouillon ?',
    text: 'Le brouillon sera définitivement supprimé.',
    button: 'Supprimer',
    danger: true,
  },
};

@Component({
  selector: 'app-purchase-order-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './purchase-order-detail.html',
})
export class PurchaseOrderDetail {
  private api = inject(PurchaseOrderService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly order = signal<PurchaseOrder | null>(null);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirming = signal<Action | null>(null);
  readonly confirmations = CONFIRMATIONS;

  constructor() {
    this.api.get(this.id).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, 'Bon de commande introuvable.'));
      },
    });
  }

  statusOf(order: PurchaseOrder) {
    return ORDER_STATUSES.find((s) => s.value === order.status)!;
  }

  ask(action: Action) {
    this.confirming.set(action);
  }

  dismiss() {
    this.confirming.set(null);
  }

  print() {
    window.print();
  }

  confirm() {
    const action = this.confirming();
    const order = this.order();
    if (!action || !order) return;

    this.working.set(true);
    if (action === 'delete') {
      this.api.remove(order.id).subscribe({
        next: () => {
          this.toast.success(`Brouillon ${order.reference} supprimé.`);
          this.router.navigate(['/purchase-orders']);
        },
        error: (err) => this.fail(err),
      });
      return;
    }

    this.api[action](order.id).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.confirming.set(null);
        this.order.set(updated);
        this.toast.success(
          action === 'receive'
            ? `${updated.reference} réceptionné : le stock a été mis à jour.`
            : action === 'send'
              ? `${updated.reference} marqué comme envoyé.`
              : `${updated.reference} annulé.`,
        );
      },
      error: (err) => this.fail(err),
    });
  }

  private fail(err: unknown) {
    this.working.set(false);
    this.confirming.set(null);
    this.toast.error(extractError(err, "L'opération a échoué."));
  }
}
