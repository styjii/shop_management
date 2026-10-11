"""Helpers for the accounts tests only."""

from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.mail.backends.base import BaseEmailBackend
from rest_framework.test import APITestCase

from .permissions import MANAGER_GROUP, SELLER_GROUP

PASSWORD = "Test-1234567"
NEW_PASSWORD = "Nouveau-Mdp-98765"


class AccountsTestCase(APITestCase):
    """A manager ("chef") and a seller ("vendeur"), plus a clean throttling cache."""

    def setUp(self):
        super().setUp()
        cache.clear()  # the throttling counters live in the cache

    @classmethod
    def setUpTestData(cls):
        manager_group = Group.objects.create(name=MANAGER_GROUP)
        seller_group = Group.objects.create(name=SELLER_GROUP)
        cls.manager = User.objects.create_user("chef", "chef@example.com", PASSWORD)
        cls.manager.groups.add(manager_group)
        cls.seller = User.objects.create_user("vendeur", "vendeur@example.com", PASSWORD)
        cls.seller.groups.add(seller_group)

    def login(self, username, password=PASSWORD):
        return self.client.post(
            "/api/auth/token/", {"username": username, "password": password}, format="json"
        )


class BrokenBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        raise ConnectionError("SMTP server unreachable")
