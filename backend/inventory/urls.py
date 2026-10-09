from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("categories", views.CategoryViewSet, basename="category")
router.register("products", views.ProductViewSet, basename="product")
router.register("sales", views.SaleViewSet, basename="sale")
router.register("movements", views.StockMovementViewSet, basename="movement")

urlpatterns = [
    path("auth/me/", views.current_user, name="current-user"),
    path("", include(router.urls)),
]
