from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/me/", views.MeView.as_view(), name="current-user"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    *router.urls,
]
