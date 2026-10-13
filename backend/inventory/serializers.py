from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import (
    Category,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    Sale,
    SaleItem,
    StockMovement,
    Supplier,
)
from .services import InsufficientStockError, apply_stock_change, lock_products

MAX_SALE_LINES = 100
MAX_ORDER_LINES = 100


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_name", "email", "phone", "address", "notes", "is_active",
        ]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source="category.name")
    supplier_name = serializers.ReadOnlyField(source="supplier.name", default=None)
    is_low_stock = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            "id", "sku", "name", "category", "category_name", "price",
            "quantity", "low_stock_threshold", "is_low_stock",
            "barcode", "supplier", "supplier_name",
            "image", "is_active",
        ]
        extra_kwargs = {"barcode": {"allow_blank": True}}

    def validate_barcode(self, value):
        # No barcode is stored as NULL so that the unique constraint ignores it.
        return value or None


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source="product.name")
    created_by = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        model = StockMovement
        fields = [
            "id", "product", "product_name", "kind", "quantity",
            "reason", "created_by", "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        # An inventory adjustment may set the stock to 0; entries and exits may not be empty.
        if attrs["kind"] != StockMovement.Kind.ADJ and attrs["quantity"] < 1:
            raise serializers.ValidationError(
                {"quantity": "La quantité doit être d'au moins 1."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # The movement also updates the product stock, atomically.
        product = Product.objects.select_for_update().get(
            pk=validated_data["product"].pk
        )
        try:
            apply_stock_change(
                product, validated_data["kind"], validated_data["quantity"]
            )
        except InsufficientStockError:
            raise serializers.ValidationError(
                {"quantity": f"Stock insuffisant pour « {product.name} »."}
            ) from None
        validated_data["product"] = product
        return super().create(validated_data)


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source="product.name")

    class Meta:
        model = SaleItem
        fields = ["product", "product_name", "quantity", "unit_price"]
        read_only_fields = ["unit_price"]


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)
    seller = serializers.ReadOnlyField(source="seller.username")

    class Meta:
        model = Sale
        fields = ["id", "seller", "created_at", "total", "items"]
        read_only_fields = ["total", "created_at"]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError(
                "Une vente doit contenir au moins un article."
            )
        if len(value) > MAX_SALE_LINES:
            raise serializers.ValidationError(
                f"Une vente ne peut pas dépasser {MAX_SALE_LINES} lignes."
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        user = self.context["request"].user

        # Merge duplicate lines so each product is checked once.
        quantities = defaultdict(int)
        for item in items:
            quantities[item["product"].pk] += item["quantity"]

        products = lock_products(list(quantities))
        sale = Sale.objects.create(seller=user)
        total = Decimal("0.00")

        for product_id, quantity in quantities.items():
            product = products[product_id]
            if not product.is_active:
                raise serializers.ValidationError(
                    {"items": f"Le produit « {product.name} » n'est plus en vente."}
                )
            try:
                apply_stock_change(product, StockMovement.Kind.OUT, quantity)
            except InsufficientStockError:
                raise serializers.ValidationError(
                    {"items": f"Stock insuffisant pour « {product.name} »."}
                ) from None
            SaleItem.objects.create(
                sale=sale, product=product, quantity=quantity,
                unit_price=product.price,  # price frozen at sale time
            )
            StockMovement.objects.create(
                product=product, kind=StockMovement.Kind.OUT, quantity=quantity,
                created_by=user, reason=f"Vente n°{sale.pk}",
            )
            total += product.price * quantity

        sale.total = total
        sale.save(update_fields=["total"])
        return sale


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source="product.name")
    product_sku = serializers.ReadOnlyField(source="product.sku")
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "product", "product_name", "product_sku", "quantity", "unit_cost", "line_total",
        ]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True)
    reference = serializers.ReadOnlyField()
    supplier_name = serializers.ReadOnlyField(source="supplier.name")
    created_by = serializers.ReadOnlyField(source="created_by.username")
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "reference", "supplier", "supplier_name", "status", "expected_date",
            "notes", "created_by", "created_at", "received_at", "total", "lines",
        ]
        read_only_fields = ["status", "created_at", "received_at"]

    def validate_supplier(self, supplier):
        if not supplier.is_active:
            raise serializers.ValidationError("Ce fournisseur n'est plus actif.")
        return supplier

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Un bon de commande doit contenir au moins une ligne.")
        if len(lines) > MAX_ORDER_LINES:
            raise serializers.ValidationError(
                f"Un bon de commande ne peut pas dépasser {MAX_ORDER_LINES} lignes."
            )
        seen = set()
        for line in lines:
            product = line["product"]
            if product.pk in seen:
                raise serializers.ValidationError(
                    f"Le produit « {product.name} » apparaît deux fois."
                )
            if not product.is_active:
                raise serializers.ValidationError(
                    f"Le produit « {product.name} » n'est plus en vente."
                )
            seen.add(product.pk)
        return lines

    def validate(self, attrs):
        if self.instance and self.instance.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError(
                "Seul un bon de commande en brouillon peut être modifié."
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines")
        order = PurchaseOrder.objects.create(
            created_by=self.context["request"].user, **validated_data
        )
        PurchaseOrderLine.objects.bulk_create(
            PurchaseOrderLine(order=order, **line) for line in lines
        )
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            PurchaseOrderLine.objects.bulk_create(
                PurchaseOrderLine(order=instance, **line) for line in lines
            )
        return instance
