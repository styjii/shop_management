"""Security regression tests: authentication, uploads and production settings."""

import io
import os
import subprocess
import sys
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from accounts.support import AccountsTestCase
from inventory.models import Category

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROTECTED_URLS = [
    "/api/auth/me/",
    "/api/users/",
    "/api/products/",
    "/api/products/low-stock/",
    "/api/categories/",
    "/api/sales/",
    "/api/movements/",
]


class AnonymousAccessTests(APITestCase):
    def test_every_endpoint_requires_a_token(self):
        for url in PROTECTED_URLS:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 401)

    def test_invalid_token_is_refused(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        self.assertEqual(self.client.get("/api/products/").status_code, 401)

    def test_api_answers_json_only_in_production_style_renderers(self):
        response = self.client.get("/api/products/")
        self.assertEqual(response["Content-Type"], "application/json")


class UploadTests(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name="Divers")
        self.client.force_authenticate(self.manager)

    def post_image(self, name, content, content_type):
        return self.client.post(
            "/api/products/",
            {
                "sku": "IMG-1", "name": "Produit", "category": self.category.pk,
                "price": "1.00", "quantity": 1, "low_stock_threshold": 1,
                "image": SimpleUploadedFile(name, content, content_type=content_type),
            },
            format="multipart",
        )

    def test_svg_is_refused(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        self.assertEqual(self.post_image("x.svg", svg, "image/svg+xml").status_code, 400)

    def test_fake_image_is_refused(self):
        self.assertEqual(self.post_image("x.png", b"<?php echo 1; ?>", "image/png").status_code, 400)

    def test_oversized_image_is_refused(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buffer, "PNG")
        big = buffer.getvalue() + b"0" * (2 * 1024 * 1024 + 1)
        self.assertEqual(self.post_image("big.png", big, "image/png").status_code, 400)


class ProductionSettingsTests(APITestCase):
    """Start Django in a subprocess with DJANGO_DEBUG=0 to test the production rules."""

    STRONG_KEY = "k" * 20 + "Zq7!" * 10 + "abcdefghij"

    def run_check(self, **env):
        base = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "DB_"))}
        base.update({"DJANGO_DEBUG": "0", "DJANGO_ALLOWED_HOSTS": "shop.example.com"})
        base.update(env)
        return subprocess.run(  # noqa: S603
            [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
            cwd=BACKEND_DIR, env=base, capture_output=True, text=True, timeout=120,
        )

    def test_weak_secret_key_is_refused(self):
        result = self.run_check(DJANGO_SECRET_KEY="change-me")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", result.stderr)

    def test_wildcard_host_is_refused(self):
        result = self.run_check(DJANGO_SECRET_KEY=self.STRONG_KEY, DJANGO_ALLOWED_HOSTS="*")
        self.assertNotEqual(result.returncode, 0)

    def test_production_passes_check_deploy(self):
        result = self.run_check(DJANGO_SECRET_KEY=self.STRONG_KEY, TRUST_PROXY_SSL="1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
