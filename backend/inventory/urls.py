from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import auth_views, user_views, views

router = DefaultRouter()
router.register("categories", views.CategoryViewSet, basename="category")
router.register("products", views.ProductViewSet, basename="product")
router.register("sales", views.SaleViewSet, basename="sale")
router.register("movements", views.StockMovementViewSet, basename="movement")
router.register("users", user_views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/me/", auth_views.MeView.as_view(), name="current-user"),
    path("auth/change-password/", auth_views.ChangePasswordView.as_view(), name="change-password"),
    path("auth/register/", auth_views.RegisterView.as_view(), name="register"),
    path("auth/password-reset/", auth_views.PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "auth/password-reset/confirm/",
        auth_views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("", include(router.urls)),
]
