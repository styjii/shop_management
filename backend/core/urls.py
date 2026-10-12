"""URL configuration for the shop_management backend."""

import os

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .views import LoginView, LogoutView, RefreshView

# The admin URL can be moved (ADMIN_URL=gestion-xyz/) to avoid automated scans of /admin/.
ADMIN_URL = os.environ.get("ADMIN_URL", "admin/").strip("/") + "/"

urlpatterns = [
    path(ADMIN_URL, admin.site.urls),
    path("api/auth/token/", LoginView.as_view(), name="token_obtain"),
    path("api/auth/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="token_blacklist"),
    path("api/", include("accounts.urls")),
    path("api/", include("inventory.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
