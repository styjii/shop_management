"""Stock business rules shared by sales and manual stock movements."""

from django.db import transaction
from django.utils import timezone

from .models import Product, PurchaseOrder, StockMovement


class InsufficientStockError(Exception):
    def __init__(self, product):
        self.product = product
        super().__init__(f"Insufficient stock for {product.name}")


def lock_products(product_ids):
    """
    Lock the given products and return them as {pk: product}.

    Rows are locked in primary-key order so that two concurrent sales
    touching the same products cannot deadlock. Must run inside a transaction.
    """
    products = (
        Product.objects.select_for_update().filter(pk__in=product_ids).order_by("pk")
    )
    return {product.pk: product for product in products}


def apply_stock_change(product, kind, quantity):
    """Update the product stock according to the movement kind and save it."""
    if kind == StockMovement.Kind.IN:
        product.quantity += quantity
    elif kind == StockMovement.Kind.OUT:
        if product.quantity < quantity:
            raise InsufficientStockError(product)
        product.quantity -= quantity
    elif kind == StockMovement.Kind.ADJ:
        product.quantity = quantity  # inventory count replaces the stock
    else:
        raise ValueError(f"Unknown movement kind: {kind}")
    product.save(update_fields=["quantity", "updated_at"])


class InvalidTransitionError(Exception):
    """The purchase order cannot go from its current status to the requested one."""


ALLOWED_TRANSITIONS = {
    PurchaseOrder.Status.SENT: {PurchaseOrder.Status.DRAFT},
    PurchaseOrder.Status.RECEIVED: {PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.SENT},
    PurchaseOrder.Status.CANCELLED: {PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.SENT},
}


@transaction.atomic
def change_order_status(order_id, new_status, user):
    """
    Move a purchase order to `new_status` (SENT, RECEIVED or CANCELLED).

    Receiving adds every line to the stock and records one entry movement per product,
    atomically. The order row is locked so it cannot be received twice.
    """
    order = PurchaseOrder.objects.select_for_update().get(pk=order_id)
    if order.status not in ALLOWED_TRANSITIONS[new_status]:
        raise InvalidTransitionError(
            f"Un bon de commande « {order.get_status_display().lower()} » "
            "ne peut pas passer à ce statut."
        )
    if new_status == PurchaseOrder.Status.RECEIVED:
        lines = list(order.lines.select_related("product"))
        products = lock_products([line.product.pk for line in lines])
        for line in lines:
            product = products[line.product.pk]
            apply_stock_change(product, StockMovement.Kind.IN, line.quantity)
            StockMovement.objects.create(
                product=product,
                kind=StockMovement.Kind.IN,
                quantity=line.quantity,
                created_by=user,
                reason=f"Réception {order.reference}",
            )
        order.received_at = timezone.now()
    order.status = new_status
    order.save(update_fields=["status", "received_at"])
    return order
