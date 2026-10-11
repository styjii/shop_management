from django.contrib.auth.models import User
from django.db.models import Q
from django_filters import rest_framework as django_filters

from .permissions import MANAGER_GROUP, SELLER_GROUP


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
