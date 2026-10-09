from django.db.models import F
from django_filters import rest_framework as filters

from .models import Product


class ProductFilter(filters.FilterSet):
    min_price = filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = filters.NumberFilter(field_name="price", lookup_expr="lte")
    low_stock = filters.BooleanFilter(method="filter_low_stock")

    class Meta:
        model = Product
        fields = ["category", "is_active"]

    def filter_low_stock(self, queryset, name, value):
        if value:
            return queryset.filter(quantity__lte=F("low_stock_threshold"))
        return queryset
