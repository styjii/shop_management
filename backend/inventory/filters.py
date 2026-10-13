from django.db.models import F
from django_filters import rest_framework as filters

from .models import Product, PurchaseOrder


class ProductFilter(filters.FilterSet):
    min_price = filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = filters.NumberFilter(field_name="price", lookup_expr="lte")
    low_stock = filters.BooleanFilter(method="filter_low_stock")
    has_barcode = filters.BooleanFilter(method="filter_has_barcode")

    class Meta:
        model = Product
        fields = ["category", "is_active", "supplier", "barcode"]

    def filter_has_barcode(self, queryset, name, value):
        return queryset.filter(barcode__isnull=not value)

    def filter_low_stock(self, queryset, name, value):
        if value:
            return queryset.filter(quantity__lte=F("low_stock_threshold"))
        return queryset


class PurchaseOrderFilter(filters.FilterSet):
    class Meta:
        model = PurchaseOrder
        fields = ["status", "supplier"]
