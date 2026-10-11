from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .accounts import (
    check_password_rules,
    email_in_use,
    revoke_user_tokens,
    role_of,
    send_password_reset_email_safely,
)
from .permissions import capabilities_of, is_manager


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


class ProfileSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        if email_in_use(value, exclude=self.context["request"].user):
            raise serializers.ValidationError("Cette adresse e-mail est déjà utilisée.")
        return value


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


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError(
                {"old_password": ["Le mot de passe actuel est incorrect."]}
            )
        if attrs["old_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": ["Le nouveau mot de passe doit être différent de l'ancien."]}
            )
        check_password_rules(attrs["new_password"], user, field="new_password")
        return attrs


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        revoke_user_tokens(request.user)
        return Response({"detail": "Mot de passe modifié. Reconnectez-vous avec le nouveau."})


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
        return value

    def validate_email(self, value):
        if email_in_use(value):
            raise serializers.ValidationError("Cette adresse e-mail est déjà utilisée.")
        return value

    def validate(self, attrs):
        candidate = User(username=attrs["username"], email=attrs["email"])
        check_password_rules(attrs["password"], candidate)
        return attrs


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


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


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


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)


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
