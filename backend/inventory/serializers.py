from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import Category, Product, Sale, SaleItem, StockMovement
from .services import InsufficientStockError, apply_stock_change, lock_products


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source="category.name")
    is_low_stock = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            "id", "sku", "name", "category", "category_name", "price",
            "quantity", "low_stock_threshold", "is_low_stock",
            "image", "is_active",
        ]


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
            )
        validated_data["product"] = product
        return super().create(validated_data)


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = ["product", "quantity", "unit_price"]
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
                )
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
