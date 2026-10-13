from django.contrib import admin
from django.db.models import Count

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

admin.site.site_header = "Shop Management — Administration"
admin.site.site_title = "Shop Management"
admin.site.index_title = "Gestion du stock"


class ReadOnlyModelAdmin(admin.ModelAdmin):
    """Records created by the API (sales, movements) must not be edited by hand."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "description", "products_count"]
    search_fields = ["name"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(products_count=Count("products"))

    @admin.display(description="Produits", ordering="products_count")
    def products_count(self, obj):
        return obj.products_count


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = [
        "sku", "name", "category", "price", "quantity", "low_stock", "is_active",
    ]
    list_filter = ["category", "is_active"]
    list_select_related = ["category"]
    search_fields = ["sku", "name", "barcode"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = [
        ("Identification", {"fields": ["sku", "name", "category", "barcode", "supplier", "image"]}),
        ("Prix et stock", {"fields": ["price", "quantity", "low_stock_threshold"]}),
        ("Statut", {"fields": ["is_active", "created_at", "updated_at"]}),
    ]

    @admin.display(description="Stock bas", boolean=True)
    def low_stock(self, obj):
        return obj.is_low_stock


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    fields = ["product", "quantity", "unit_price"]
    readonly_fields = ["product", "quantity", "unit_price"]

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Sale)
class SaleAdmin(ReadOnlyModelAdmin):
    list_display = ["id", "seller", "created_at", "total"]
    list_filter = ["seller"]
    date_hierarchy = "created_at"
    inlines = [SaleItemInline]


@admin.register(StockMovement)
class StockMovementAdmin(ReadOnlyModelAdmin):
    list_display = ["created_at", "product", "kind", "quantity", "created_by", "reason"]
    list_filter = ["kind"]
    search_fields = ["product__name", "product__sku", "reason"]
    date_hierarchy = "created_at"


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "contact_name", "email", "phone", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "contact_name", "email"]


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    fields = ["product", "quantity", "unit_cost"]
    readonly_fields = ["product", "quantity", "unit_cost"]

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(ReadOnlyModelAdmin):
    """Purchase orders go through the API: receiving one must update the stock."""

    list_display = ["reference", "supplier", "status", "created_at", "received_at"]
    list_filter = ["status", "supplier"]
    inlines = [PurchaseOrderLineInline]
