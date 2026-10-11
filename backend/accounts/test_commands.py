import os
from io import StringIO
from unittest import mock

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APITestCase

from .permissions import MANAGER_GROUP, SELLER_GROUP


class SetupDefaultsTests(APITestCase):
    def run_command(self, *args):
        out = StringIO()
        call_command("setup_defaults", *args, stdout=out)
        return out.getvalue()

    def test_creates_groups_and_admin_once(self):
        output = self.run_command()
        admin = User.objects.get(username="admin")
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.groups.filter(name=MANAGER_GROUP).exists())
        self.assertTrue(Group.objects.filter(name=SELLER_GROUP).exists())
        self.assertIn("Mot de passe généré", output)

        second = self.run_command()
        self.assertEqual(User.objects.filter(is_superuser=True).count(), 1)
        self.assertIn("existe déjà", second)

    def test_weak_password_from_environment_is_refused(self):
        weak = {"DJANGO_DEFAULT_ADMIN_PASSWORD": "123"}
        with mock.patch.dict(os.environ, weak), self.assertRaises(CommandError):
            self.run_command()
        self.assertFalse(User.objects.exists())
