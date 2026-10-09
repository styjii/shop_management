from django.db.models import F, ProtectedError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .filters import ProductFilter
from .models import Category, Product, Sale, StockMovement
from .permissions import IsManager, IsManagerOrReadOnly, is_manager
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleSerializer,
    StockMovementSerializer,
)


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
    permission_classes = [IsManagerOrReadOnly]


class ProductViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [IsManagerOrReadOnly]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ProductFilter
    search_fields = ["name", "sku"]
    ordering_fields = ["name", "price", "quantity", "created_at"]

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        queryset = self.get_queryset().filter(
            is_active=True, quantity__lte=F("low_stock_threshold")
        )
        return Response(self.get_serializer(queryset, many=True).data)


class SaleViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SaleSerializer

    def get_queryset(self):
        queryset = Sale.objects.select_related("seller").prefetch_related("items")
        user = self.request.user
        return queryset if is_manager(user) else queryset.filter(seller=user)


class StockMovementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = StockMovement.objects.select_related("product", "created_by")
    serializer_class = StockMovementSerializer
    permission_classes = [IsManager]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["product", "kind"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@api_view(["GET"])
def current_user(request):
    return Response(
        {"username": request.user.username, "is_manager": is_manager(request.user)}
    )
