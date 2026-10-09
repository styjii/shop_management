import os
import secrets

from django.contrib.auth.models import Group, User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from inventory.permissions import MANAGER_GROUP, SELLER_GROUP


class Command(BaseCommand):
    help = (
        "Crée les groupes (Gestionnaire, Vendeur) et un compte administrateur "
        "par défaut s'il n'en existe aucun. Idempotent."
    )

    def handle(self, *args, **options):
        self.create_groups()
        self.create_default_admin()

    def create_groups(self):
        for name in (MANAGER_GROUP, SELLER_GROUP):
            _, created = Group.objects.get_or_create(name=name)
            if created:
                self.stdout.write(f"Groupe créé : {name}")

    def create_default_admin(self):
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("Un administrateur existe déjà : rien à créer.")
            return

        username = os.environ.get("DJANGO_DEFAULT_ADMIN_USERNAME", "admin")
        password = os.environ.get("DJANGO_DEFAULT_ADMIN_PASSWORD")
        generated = not password
        if generated:
            password = secrets.token_urlsafe(12)
        else:
            try:
                validate_password(password)
            except ValidationError as error:
                raise CommandError(
                    "Mot de passe par défaut refusé : " + " ".join(error.messages)
                )

        user = User.objects.create_superuser(username, password=password)
        user.groups.add(Group.objects.get(name=MANAGER_GROUP))

        self.stdout.write(self.style.SUCCESS(f"Compte admin créé : {username}"))
        if generated:
            self.stdout.write(
                self.style.WARNING(
                    f"Mot de passe généré (affiché une seule fois) : {password}"
                )
            )
        self.stdout.write("Changez ce mot de passe après la première connexion.")
