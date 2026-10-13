from django.db.models import F, ProtectedError
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasCapability, HasCapabilityOrReadOnly, has_capability

from .barcodes import IN_STORE_PREFIX, build_in_store_ean13
from .exports import csv_response, dated_filename
from .filters import ProductFilter, PurchaseOrderFilter
from .models import (
    Category,
    Product,
    PurchaseOrder,
    Sale,
    StockMovement,
    Supplier,
)
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    PurchaseOrderSerializer,
    SaleSerializer,
    StockMovementSerializer,
    SupplierSerializer,
)
from .services import InvalidTransitionError, change_order_status
from .stats import MAX_DAYS, sales_stats


class ProtectedDeleteMixin(mixins.DestroyModelMixin):
    """Answer 409 instead of crashing when a PROTECTed object is deleted."""

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Suppression impossible : cet élément est encore utilisé."},
                status=status.HTTP_409_CONFLICT,
            )


class CategoryViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [HasCapabilityOrReadOnly]
    required_capability = "manage_catalog"
    pagination_class = None  # a short list, used as a whole by the frontend selects


class ProductViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category", "supplier")
    serializer_class = ProductSerializer
    permission_classes = [HasCapabilityOrReadOnly]
    required_capability = "manage_catalog"
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "barcode"]
    ordering_fields = ["name", "price", "quantity", "created_at"]

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        queryset = self.get_queryset().filter(
            is_active=True, quantity__lte=F("low_stock_threshold")
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="next-barcode")
    def next_barcode(self, request):
        """A free in-store EAN-13 (prefix 2) for a product that has no manufacturer code."""
        used = Product.objects.filter(barcode__startswith=IN_STORE_PREFIX).values_list(
            "barcode", flat=True
        )
        last = max((int(code[1:12]) for code in used if len(code) == 13), default=0)
        return Response({"barcode": build_in_store_ean13(last + 1)})

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        products = self.filter_queryset(self.get_queryset())
        rows = (
            (
                p.sku, p.name, p.category.name, p.barcode, p.supplier.name if p.supplier else "",
                p.price, p.quantity, p.low_stock_threshold, p.is_low_stock, p.is_active,
            )
            for p in products
        )
        header = [
            "SKU", "Nom", "Catégorie", "Code-barres", "Fournisseur", "Prix", "Stock",
            "Seuil d'alerte", "Stock bas", "En vente",
        ]
        return csv_response(dated_filename("produits"), header, rows)


class SaleViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SaleSerializer

    def get_queryset(self):
        queryset = Sale.objects.select_related("seller").prefetch_related(
            "items__product"
        )
        user = self.request.user
        return (
            queryset if has_capability(user, "view_all_sales") else queryset.filter(seller=user)
        )

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Totals, daily revenue, best products and categories over the last `days` days."""
        try:
            days = int(request.query_params.get("days", 30))
        except ValueError:
            days = 0
        if not 1 <= days <= MAX_DAYS:
            return Response(
                {"detail": f"« days » doit être compris entre 1 et {MAX_DAYS}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(sales_stats(self.get_queryset(), days))

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """One row per sold line. Optional `date_from` / `date_to` (YYYY-MM-DD)."""
        sales = self.get_queryset()
        date_from = parse_date(request.query_params.get("date_from", ""))
        date_to = parse_date(request.query_params.get("date_to", ""))
        if date_from:
            sales = sales.filter(created_at__date__gte=date_from)
        if date_to:
            sales = sales.filter(created_at__date__lte=date_to)
        rows = (
            (
                sale.pk, sale.created_at, sale.seller.username, item.product.sku,
                item.product.name, item.quantity, item.unit_price, item.line_total, sale.total,
            )
            for sale in sales
            for item in sale.items.all()
        )
        header = [
            "N° vente", "Date", "Vendeur", "SKU", "Produit", "Quantité", "Prix unitaire",
            "Total ligne", "Total vente",
        ]
        return csv_response(dated_filename("ventes"), header, rows)


class StockMovementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = StockMovement.objects.select_related("product", "created_by")
    serializer_class = StockMovementSerializer
    permission_classes = [HasCapability]
    required_capability = "manage_stock"
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["product", "kind"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        movements = self.filter_queryset(self.get_queryset())
        rows = (
            (
                m.created_at, m.product.sku, m.product.name, m.get_kind_display(),
                m.quantity, m.reason, m.created_by.username,
            )
            for m in movements
        )
        header = ["Date", "SKU", "Produit", "Type", "Quantité", "Motif", "Enregistré par"]
        return csv_response(dated_filename("mouvements"), header, rows)


class SupplierViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [HasCapability]
    required_capability = "manage_stock"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "contact_name", "email"]
    pagination_class = None  # a short list, used as a whole by the frontend selects


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier", "created_by").prefetch_related(
        "lines__product"
    )
    serializer_class = PurchaseOrderSerializer
    permission_classes = [HasCapability]
    required_capability = "manage_stock"
    filter_backends = [DjangoFilterBackend]
    filterset_class = PurchaseOrderFilter

    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"detail": "Seul un bon de commande en brouillon peut être supprimé."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    def _change_status(self, request, new_status):
        try:
            order = change_order_status(self.get_object().pk, new_status, request.user)
        except InvalidTransitionError as error:
            return Response({"detail": str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        return self._change_status(request, PurchaseOrder.Status.SENT)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Receive the goods: adds every line to the stock (one entry movement each)."""
        return self._change_status(request, PurchaseOrder.Status.RECEIVED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._change_status(request, PurchaseOrder.Status.CANCELLED)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        orders = self.filter_queryset(self.get_queryset())
        rows = (
            (
                o.reference, o.supplier.name, o.get_status_display(), o.created_at,
                o.expected_date, o.received_at, o.total, o.created_by.username,
            )
            for o in orders
        )
        header = [
            "Référence", "Fournisseur", "Statut", "Créé le", "Livraison prévue", "Reçu le",
            "Total", "Créé par",
        ]
        return csv_response(dated_filename("bons-de-commande"), header, rows)
