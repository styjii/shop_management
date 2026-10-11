from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import ProtectedError, Q
from django_filters import rest_framework as django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .accounts import (
    check_password_rules,
    count_active_managers,
    email_in_use,
    explicit_capabilities,
    revoke_user_tokens,
    role_of,
    set_capabilities,
    set_role,
)
from .permissions import CAPABILITIES, MANAGER_GROUP, SELLER_GROUP, IsManager

PROTECTED_MESSAGE = "Ce compte est protégé : il se gère depuis l'administration (/admin/)."


def status_of(user):
    if user.is_active:
        return "active"
    if user.last_login is None and role_of(user) is None:
        return "pending"  # registered, never approved
    return "inactive"


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


class UserFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(
        choices=[("pending", "En attente"), ("active", "Actif"), ("inactive", "Désactivé")],
        method="filter_status",
    )
    role = django_filters.ChoiceFilter(
        choices=[("manager", "Gestionnaire"), ("seller", "Vendeur")],
        method="filter_role",
    )

    class Meta:
        model = User
        fields = ["status", "role"]

    def filter_status(self, queryset, name, value):
        pending = Q(is_active=False, last_login__isnull=True, groups__isnull=True, is_staff=False)
        if value == "active":
            return queryset.filter(is_active=True)
        if value == "pending":
            return queryset.filter(pending).distinct()
        return queryset.filter(is_active=False).exclude(pk__in=queryset.filter(pending)).distinct()

    def filter_role(self, queryset, name, value):
        managers = Q(is_staff=True) | Q(groups__name=MANAGER_GROUP)
        if value == "manager":
            return queryset.filter(managers).distinct()
        return queryset.filter(groups__name=SELLER_GROUP).exclude(
            pk__in=queryset.filter(managers)
        ).distinct()


class SetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)


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
