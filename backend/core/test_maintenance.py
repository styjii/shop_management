"""The periodic housekeeping commands only delete what is expired (see deploy/maintenance.sh)."""

from datetime import timedelta
from io import StringIO

from django.contrib.auth.models import User
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


class ExpiredTokensTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("vendeur", password="Test-1234567")

    def make_token(self, expires_in, revoked=False):
        refresh = RefreshToken.for_user(self.user)
        outstanding = OutstandingToken.objects.get(jti=refresh["jti"])
        outstanding.expires_at = timezone.now() + expires_in
        outstanding.save(update_fields=["expires_at"])
        if revoked:
            BlacklistedToken.objects.create(token=outstanding)
        return outstanding

    def test_only_expired_tokens_are_deleted(self):
        valid = self.make_token(timedelta(hours=5))
        revoked_valid = self.make_token(timedelta(hours=5), revoked=True)
        expired = self.make_token(-timedelta(hours=1))
        expired_revoked = self.make_token(-timedelta(days=2), revoked=True)

        call_command("flushexpiredtokens", stdout=StringIO())

        remaining = set(OutstandingToken.objects.values_list("pk", flat=True))
        self.assertEqual(remaining, {valid.pk, revoked_valid.pk})
        self.assertNotIn(expired.pk, remaining)
        self.assertNotIn(expired_revoked.pk, remaining)
        # A revoked token that has not expired yet must stay revoked (still refused).
        self.assertTrue(BlacklistedToken.objects.filter(token=revoked_valid).exists())


class ExpiredSessionsTests(TestCase):
    def test_only_expired_sessions_are_deleted(self):
        now = timezone.now()
        Session.objects.create(session_key="valid", session_data="x", expire_date=now + timedelta(days=1))
        Session.objects.create(session_key="expired", session_data="x", expire_date=now - timedelta(days=1))

        call_command("clearsessions")

        self.assertEqual(list(Session.objects.values_list("session_key", flat=True)), ["valid"])
