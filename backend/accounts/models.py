from django.db import models

from .permissions import CAPABILITIES


class Right(models.Model):
    """
    Carries the individual rights as Django permissions ("accounts.manage_stock", ...).

    There is no table behind it (managed = False): it only exists so that the rights show
    up in the permission lists of the administration and can be granted to a single user.
    """

    class Meta:
        managed = False
        default_permissions = ()
        verbose_name = "droit"
        verbose_name_plural = "droits"
        permissions = list(CAPABILITIES.items())
