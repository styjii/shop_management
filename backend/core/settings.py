"""
Django settings for the shop_management backend.

Configuration comes from environment variables (see .env.example).
Docs: https://docs.djangoproject.com/en/6.1/topics/settings/
"""

import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def get_env(name, default=None):
    """Read an environment variable, failing loudly if it is required and missing."""
    value = os.environ.get(name, default)
    if value is None:
        raise ImproperlyConfigured(
            f"La variable d'environnement {name} est obligatoire "
            "(voir le fichier .env.example)."
        )
    return value


def get_env_list(name, default):
    """Read a comma-separated environment variable as a clean list."""
    return [item.strip() for item in get_env(name, default).split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

SECRET_KEY = get_env("DJANGO_SECRET_KEY")
DEBUG = get_env("DJANGO_DEBUG", "0") == "1"
ALLOWED_HOSTS = get_env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",  # required by the logout endpoint
    "corsheaders",
    "django_filters",
    # Local
    "accounts",
    "inventory",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # must come before CommonMiddleware
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# ---------------------------------------------------------------------------
# API (Django REST Framework + JWT + CORS)
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
        "user": "300/min",
        "login": "5/min",
        "register": "5/hour",
        "password-reset": "5/hour",
        "password-reset-confirm": "10/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

CORS_ALLOWED_ORIGINS = get_env_list("CORS_ALLOWED_ORIGINS", "http://localhost:4200")

# ---------------------------------------------------------------------------
# Accounts: registration, password reset e-mails
# ---------------------------------------------------------------------------

# Anyone can request an account, but it stays inactive until a manager approves it.
REGISTRATION_ENABLED = get_env("REGISTRATION_ENABLED", "1") == "1"

# Base URL of the Angular app, used in the links of the password reset e-mails.
FRONTEND_URL = get_env("FRONTEND_URL", "http://localhost:4200").rstrip("/")

# Password reset links are valid for one hour (Django's default is three days).
PASSWORD_RESET_TIMEOUT = 3600

# In development the e-mails are printed in the terminal; in production use SMTP.
EMAIL_BACKEND = get_env(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = get_env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(get_env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = get_env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = get_env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = get_env("EMAIL_USE_TLS", "1") == "1"
DEFAULT_FROM_EMAIL = get_env("DEFAULT_FROM_EMAIL", "Shop Management <no-reply@localhost>")

# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# ---------------------------------------------------------------------------
# Internationalization (user-facing text is in French, code stays in English)
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "fr"
TIME_ZONE = "UTC"  # set your own zone, e.g. "Europe/Paris"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static and media files
# ---------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Production hardening (only when DEBUG is off)
# ---------------------------------------------------------------------------

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

if "test" in sys.argv:
    # A fast hasher makes the test suite several times quicker.
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
