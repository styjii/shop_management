"""
JWT endpoints with the refresh token kept in an HttpOnly cookie.

The access token (15 min) is returned in the JSON body and lives in the memory of the
Angular app only. The refresh token never reaches JavaScript: it is stored in a cookie
that scripts cannot read (HttpOnly), so an XSS flaw cannot steal a long-lived session.
SameSite=Strict keeps the browser from sending it on cross-site requests (CSRF).
"""

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/auth/"  # sent to the auth endpoints only, never with other API calls


def set_refresh_cookie(response, token):
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="Strict",
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH, samesite="Strict")


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": "Identifiant ou mot de passe incorrect.",
    }


class LoginView(TokenObtainPairView):
    """Login: returns the access token, sets the refresh cookie. Rate limited ("login")."""

    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_refresh_cookie(response, response.data.pop("refresh"))
        return response


class RefreshView(APIView):
    """New access token from the refresh cookie (rotated at each call, old one revoked)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE, "")
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, AuthenticationFailed, ValidationError):
            response = Response({"detail": "Session expirée, reconnectez-vous."}, status=401)
            clear_refresh_cookie(response)
            return response

        data = serializer.validated_data
        response = Response({"access": data["access"]})
        set_refresh_cookie(response, data.get("refresh", token))
        return response


class LogoutView(APIView):
    """Revoke the refresh token of the cookie and delete the cookie. Always succeeds."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # already expired or revoked: nothing left to revoke
        response = Response({"detail": "Déconnexion effectuée."})
        clear_refresh_cookie(response)
        return response
