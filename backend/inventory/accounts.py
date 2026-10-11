"""Account helpers: roles, individual rights, token revocation, password e-mails."""

import logging

from django.conf import settings
from django.contrib.auth.models import Group, Permission, User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db.models import Q
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import serializers
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .models import Product
from .permissions import CAPABILITIES, MANAGER_GROUP, SELLER_GROUP

logger = logging.getLogger(__name__)

ROLE_GROUPS = {"manager": MANAGER_GROUP, "seller": SELLER_GROUP}


def role_of(user):
    """'manager', 'seller' or None (no role yet, e.g. a pending registration)."""
    names = {group.name for group in user.groups.all()}
    if user.is_staff or MANAGER_GROUP in names:
        return "manager"
    if SELLER_GROUP in names:
        return "seller"
    return None


def set_role(user, role):
    user.groups.remove(*Group.objects.filter(name__in=ROLE_GROUPS.values()))
    if role:
        group, _ = Group.objects.get_or_create(name=ROLE_GROUPS[role])
        user.groups.add(group)


def explicit_capabilities(user):
    return [p.codename for p in user.user_permissions.all() if p.codename in CAPABILITIES]


def set_capabilities(user, capabilities):
    content_type = ContentType.objects.get_for_model(Product)
    permissions = Permission.objects.filter(
        content_type=content_type, codename__in=list(capabilities)
    )
    user.user_permissions.set(permissions)


def count_active_managers(exclude=None):
    managers = User.objects.filter(is_active=True).filter(
        Q(is_staff=True) | Q(groups__name=MANAGER_GROUP)
    )
    if exclude is not None:
        managers = managers.exclude(pk=exclude.pk)
    return managers.distinct().count()


def check_password_rules(password, user=None, field="password"):
    """Apply the AUTH_PASSWORD_VALIDATORS and report the errors the DRF way."""
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError({field: list(error.messages)}) from error


def revoke_user_tokens(user):
    """Blacklist every refresh token of the user (after a password change)."""
    tokens = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in tokens], ignore_conflicts=True
    )


def email_in_use(email, exclude=None):
    users = User.objects.filter(email__iexact=email)
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return users.exists()


def send_password_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    name = user.first_name or user.username
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    send_mail(
        subject="Réinitialisation de votre mot de passe - Shop Management",
        message=(
            f"Bonjour {name},\n\n"
            "Vous avez demandé la réinitialisation de votre mot de passe.\n"
            f"Cliquez sur ce lien pour en choisir un nouveau (valable {minutes} minutes) :\n\n"
            f"{link}\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : "
            "votre mot de passe reste inchangé.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )


def send_password_reset_email_safely(user):
    """Never let an SMTP problem reveal (or break) the reset flow."""
    try:
        send_password_reset_email(user)
    except Exception:
        logger.exception("Could not send the password reset e-mail")
