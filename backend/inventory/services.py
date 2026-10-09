"""Stock business rules shared by sales and manual stock movements."""

from .models import Product, StockMovement


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
