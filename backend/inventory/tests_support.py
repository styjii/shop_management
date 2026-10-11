"""Helpers for the tests only."""

from django.core.mail.backends.base import BaseEmailBackend


class BrokenBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        raise ConnectionError("SMTP server unreachable")
