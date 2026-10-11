from django.contrib.auth.models import User
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .permissions import CAPABILITIES
from .services import (
    check_password_rules,
    count_active_managers,
    email_in_use,
    explicit_capabilities,
    role_of,
    set_capabilities,
    set_role,
    status_of,
)

PROTECTED_MESSAGE = "Ce compte est protégé : il se gère depuis l'administration (/admin/)."


class ProfileSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        if email_in_use(value, exclude=self.context["request"].user):
            raise serializers.ValidationError("Cette adresse e-mail est déjà utilisée.")
        return value


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


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["manager", "seller"], required=False, allow_null=True)
    capabilities = serializers.ListField(
        child=serializers.ChoiceField(choices=list(CAPABILITIES)), required=False
    )
    status = serializers.SerializerMethodField()
    is_protected = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "password",
            "role", "capabilities", "is_active", "status", "is_protected",
            "last_login", "date_joined",
        ]
        read_only_fields = ["last_login", "date_joined"]

    def get_status(self, user):
        return status_of(user)

    def get_is_protected(self, user):
        return user.is_superuser

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["role"] = role_of(instance)
        data["capabilities"] = explicit_capabilities(instance)
        return data

    def validate_email(self, value):
        if email_in_use(value, exclude=self.instance):
            raise serializers.ValidationError("Cette adresse e-mail est déjà utilisée.")
        return value

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exclude(
            pk=getattr(self.instance, "pk", None)
        ).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
        return value

    def validate(self, attrs):
        actor = self.context["request"].user
        if self.instance is None:
            self.validate_creation(attrs)
        else:
            self.validate_change(self.instance, attrs, actor)
        return attrs

    def validate_creation(self, attrs):
        if not attrs.get("password"):
            raise serializers.ValidationError({"password": ["Ce champ est obligatoire."]})
        if not attrs.get("role"):
            raise serializers.ValidationError({"role": ["Choisissez un rôle."]})
        check_password_rules(attrs["password"], User(username=attrs["username"], email=attrs["email"]))

    def validate_change(self, user, attrs, actor):
        if user.is_superuser:
            raise PermissionDenied(PROTECTED_MESSAGE)

        role_changes = "role" in attrs
        new_role = attrs["role"] if role_changes else role_of(user)
        was_manager = role_of(user) == "manager"
        demoting = was_manager and new_role != "manager"
        deactivating = user.is_active and attrs.get("is_active") is False

        if attrs.get("is_active") and new_role is None:
            raise serializers.ValidationError(
                {"role": ["Choisissez un rôle avant d'activer le compte."]}
            )
        if user.pk == actor.pk and (demoting or deactivating):
            raise serializers.ValidationError(
                "Vous ne pouvez ni changer votre propre rôle ni vous désactiver."
            )
        removing_a_manager = (demoting or deactivating) and user.is_active and was_manager
        if removing_a_manager and count_active_managers(exclude=user) == 0:
            raise serializers.ValidationError("Il doit rester au moins un gestionnaire actif.")

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data.pop("role")
        capabilities = validated_data.pop("capabilities", [])
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        set_role(user, role)
        set_capabilities(user, capabilities if role == "seller" else [])
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        validated_data.pop("username", None)  # the username is fixed once created
        validated_data.pop("password", None)  # passwords have their own endpoint
        role_changes = "role" in validated_data
        role = validated_data.pop("role", None)
        capabilities = validated_data.pop("capabilities", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if role_changes:
            set_role(instance, role)
        final_role = role if role_changes else role_of(instance)
        if final_role == "manager":
            set_capabilities(instance, [])
        elif capabilities is not None:
            set_capabilities(instance, capabilities)
        return instance


class SetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)
