from rest_framework.permissions import SAFE_METHODS, BasePermission

MANAGER_GROUP = "Gestionnaire"
SELLER_GROUP = "Vendeur"


def is_manager(user):
    return user.is_authenticated and (
        user.is_staff or user.groups.filter(name=MANAGER_GROUP).exists()
    )


class IsManagerOrReadOnly(BasePermission):
    """Read access for any authenticated user, write access for managers."""

    message = "Cette action est réservée aux gestionnaires."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.method in SAFE_METHODS or is_manager(request.user)


class IsManager(BasePermission):
    message = "Cette action est réservée aux gestionnaires."

    def has_permission(self, request, view):
        return is_manager(request.user)
