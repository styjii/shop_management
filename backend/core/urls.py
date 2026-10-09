"""URL configuration for the shop_management backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": "Identifiant ou mot de passe incorrect.",
    }


class LoginView(TokenObtainPairView):
    """Token login, rate limited by the "login" scope (see REST_FRAMEWORK)."""

    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", LoginView.as_view(), name="token_obtain"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/logout/", TokenBlacklistView.as_view(), name="token_blacklist"),
    path("api/", include("inventory.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
