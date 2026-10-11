from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.db.models import ProtectedError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .filters import UserFilter
from .permissions import IsManager, capabilities_of, is_manager
from .serializers import (
    PROTECTED_MESSAGE,
    ChangePasswordSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    UserSerializer,
)
from .services import (
    check_password_rules,
    count_active_managers,
    revoke_user_tokens,
    role_of,
    send_password_reset_email_safely,
)


def serialize_me(user):
    return {
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": role_of(user),
        "is_manager": is_manager(user),
        "capabilities": capabilities_of(user),
    }


class MeView(APIView):
    def get(self, request):
        return Response(serialize_me(request.user))

    def patch(self, request):
        serializer = ProfileSerializer(
            data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(request.user, field, value)
        request.user.save()
        return Response(serialize_me(request.user))


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        revoke_user_tokens(request.user)
        return Response({"detail": "Mot de passe modifié. Reconnectez-vous avec le nouveau."})


class RegisterView(APIView):
    """Open registration. The account stays inactive until a manager approves it."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        if not settings.REGISTRATION_ENABLED:
            return Response(
                {"detail": "Les inscriptions sont désactivées."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        User.objects.create_user(is_active=False, **data)
        return Response(
            {"detail": "Compte créé. Il sera utilisable dès qu'un gestionnaire l'aura activé."},
            status=status.HTTP_201_CREATED,
        )


class PasswordResetRequestView(APIView):
    """Always answers the same thing, so it cannot be used to find existing e-mails."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password-reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        users = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True)
        for user in users:
            if user.has_usable_password():
                send_password_reset_email_safely(user)
        return Response(
            {"detail": "Si un compte correspond à cette adresse, un e-mail vient d'être envoyé."}
        )


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password-reset-confirm"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = self.find_user(data["uid"])
        if user is None or not default_token_generator.check_token(user, data["token"]):
            return Response(
                {"detail": "Ce lien est invalide ou a expiré."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        check_password_rules(data["new_password"], user, field="new_password")
        user.set_password(data["new_password"])
        user.save()
        revoke_user_tokens(user)
        return Response({"detail": "Mot de passe réinitialisé. Vous pouvez vous connecter."})

    @staticmethod
    def find_user(uid):
        try:
            pk = force_str(urlsafe_base64_decode(uid))
            return User.objects.get(pk=pk, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return None


class UserViewSet(viewsets.ModelViewSet):
    """User management, reserved to managers."""

    serializer_class = UserSerializer
    permission_classes = [IsManager]
    queryset = User.objects.prefetch_related("groups", "user_permissions").order_by("username")
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = UserFilter
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "date_joined", "last_login"]

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.is_superuser:
            raise PermissionDenied(PROTECTED_MESSAGE)
        if user.pk == request.user.pk:
            return Response(
                {"detail": "Vous ne pouvez pas supprimer votre propre compte."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_active and role_of(user) == "manager" and count_active_managers(exclude=user) == 0:
            return Response(
                {"detail": "Il doit rester au moins un gestionnaire actif."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {
                    "detail": "Suppression impossible : ce compte a des ventes ou des mouvements "
                    "de stock. Désactivez-le plutôt."
                },
                status=status.HTTP_409_CONFLICT,
            )

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        if user.is_superuser:
            raise PermissionDenied(PROTECTED_MESSAGE)
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data["new_password"]
        check_password_rules(password, user, field="new_password")
        user.set_password(password)
        user.save()
        revoke_user_tokens(user)
        return Response({"detail": "Mot de passe modifié."})
