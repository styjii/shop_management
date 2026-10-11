from django.core.exceptions import ImproperlyConfigured
from rest_framework.permissions import SAFE_METHODS, BasePermission

MANAGER_GROUP = "Gestionnaire"
SELLER_GROUP = "Vendeur"

# Individual rights a manager can grant to a seller, on top of the role.
# (codename -> French label). They are Django permissions declared on Product.
CAPABILITIES = {
    "manage_catalog": "Gérer le catalogue (produits et catégories)",
    "manage_stock": "Gérer le stock (mouvements)",
    "view_all_sales": "Voir toutes les ventes",
}


def is_manager(user):
    return user.is_authenticated and (
        user.is_staff or user.groups.filter(name=MANAGER_GROUP).exists()
    )


def has_capability(user, capability):
    """Managers have every right; other users need the individual permission."""
    if not user.is_authenticated:
        return False
    return is_manager(user) or user.has_perm(f"inventory.{capability}")


def capabilities_of(user):
    return [capability for capability in CAPABILITIES if has_capability(user, capability)]


def required_capability(view):
    """The capability a view declares with its `required_capability` attribute."""
    capability = getattr(view, "required_capability", None)
    if capability not in CAPABILITIES:
        raise ImproperlyConfigured(f"{type(view).__name__} needs a valid required_capability")
    return capability


class HasCapabilityOrReadOnly(BasePermission):
    """Read access for any authenticated user, write access with `required_capability`."""

    message = "Vous n'avez pas le droit d'effectuer cette action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return has_capability(request.user, required_capability(view))


class HasCapability(BasePermission):
    """Access (read and write) reserved to users with `required_capability`."""

    message = "Vous n'avez pas le droit d'accéder à cette ressource."

    def has_permission(self, request, view):
        return has_capability(request.user, required_capability(view))


class IsManager(BasePermission):
    """Role-only access: this right cannot be delegated (user management)."""

    message = "Cette action est réservée aux gestionnaires."

    def has_permission(self, request, view):
        return is_manager(request.user)
