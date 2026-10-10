import os
import tempfile
from io import BytesIO, StringIO
from unittest import mock

from django.contrib.auth.models import Group, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from .models import Category, Product, StockMovement
from .permissions import MANAGER_GROUP, SELLER_GROUP


class InventoryAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        manager_group = Group.objects.create(name=MANAGER_GROUP)
        seller_group = Group.objects.create(name=SELLER_GROUP)
        cls.manager = User.objects.create_user("manager", password="Test-1234567")
        cls.manager.groups.add(manager_group)
        cls.seller = User.objects.create_user("seller", password="Test-1234567")
        cls.seller.groups.add(seller_group)

        cls.category = Category.objects.create(name="Boissons")
        cls.water = Product.objects.create(
            sku="WATER-1", name="Eau", category=cls.category, price="1.50", quantity=10
        )
        cls.juice = Product.objects.create(
            sku="JUICE-1", name="Jus", category=cls.category, price="3.00",
            quantity=2, low_stock_threshold=5,
        )


class SaleTests(InventoryAPITestCase):
    def setUp(self):
        self.client.force_authenticate(self.seller)

    def sell(self, *lines):
        items = [{"product": p.pk, "quantity": q} for p, q in lines]
        return self.client.post("/api/sales/", {"items": items}, format="json")

    def test_sale_decrements_stock_and_logs_movement(self):
        response = self.sell((self.water, 3))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total"], "4.50")
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 7)
        movement = StockMovement.objects.get()
        self.assertEqual(movement.kind, StockMovement.Kind.OUT)
        self.assertEqual(movement.quantity, 3)

    def test_duplicate_lines_are_merged(self):
        response = self.sell((self.water, 2), (self.water, 3))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data["items"]), 1)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 5)

    def test_insufficient_stock_rolls_everything_back(self):
        response = self.sell((self.water, 1), (self.juice, 99))
        self.assertEqual(response.status_code, 400)
        self.assertIn("Stock insuffisant", str(response.data))
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 10)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_inactive_product_cannot_be_sold(self):
        self.water.is_active = False
        self.water.save()
        self.assertEqual(self.sell((self.water, 1)).status_code, 400)

    def test_empty_sale_is_refused(self):
        response = self.client.post("/api/sales/", {"items": []}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_seller_only_sees_own_sales(self):
        self.sell((self.water, 1))
        self.client.force_authenticate(self.manager)
        self.sell((self.water, 1))
        self.assertEqual(self.client.get("/api/sales/").data["count"], 2)
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/sales/").data["count"], 1)


class ProductTests(InventoryAPITestCase):
    def test_anonymous_is_refused(self):
        self.assertEqual(self.client.get("/api/products/").status_code, 401)

    def test_seller_cannot_create_product(self):
        self.client.force_authenticate(self.seller)
        response = self.client.post("/api/products/", {"sku": "X"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_manager_can_create_product(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post("/api/products/", {
            "sku": "NEW-1", "name": "Soda", "category": self.category.pk,
            "price": "2.00", "quantity": 4, "low_stock_threshold": 2,
        }, format="json")
        self.assertEqual(response.status_code, 201)

    def test_low_stock_filter_and_endpoint(self):
        self.client.force_authenticate(self.seller)
        filtered = self.client.get("/api/products/?low_stock=true")
        self.assertEqual([p["sku"] for p in filtered.data["results"]], ["JUICE-1"])
        endpoint = self.client.get("/api/products/low-stock/")
        self.assertEqual([p["sku"] for p in endpoint.data], ["JUICE-1"])

    def test_search_and_price_filter(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/products/?search=eau").data["count"], 1)
        self.assertEqual(self.client.get("/api/products/?min_price=2").data["count"], 1)

    def test_deleting_used_category_returns_409(self):
        self.client.force_authenticate(self.manager)
        response = self.client.delete(f"/api/categories/{self.category.pk}/")
        self.assertEqual(response.status_code, 409)


class FrontendContractTests(InventoryAPITestCase):
    """Requests shaped exactly like the ones sent by the Angular frontend."""

    def test_categories_are_returned_as_a_plain_list(self):
        for index in range(25):
            Category.objects.create(name=f"Categorie {index}")
        self.client.force_authenticate(self.seller)
        response = self.client.get("/api/categories/")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 26)

    def test_product_can_be_created_with_multipart_and_an_image(self):
        buffer = BytesIO()
        Image.new("RGB", (4, 4), "red").save(buffer, format="PNG")
        image = SimpleUploadedFile("photo.png", buffer.getvalue(), content_type="image/png")
        self.client.force_authenticate(self.manager)

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post("/api/products/", {
                "sku": "IMG-1", "name": "Avec image", "category": str(self.category.pk),
                "price": "1.5", "quantity": "7", "low_stock_threshold": "2",
                "is_active": "true", "image": image,
            }, format="multipart")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["image"].endswith(".png"))
        self.assertEqual(response.data["price"], "1.50")

    def test_product_update_without_image_keeps_the_existing_one(self):
        self.client.force_authenticate(self.manager)
        response = self.client.put(f"/api/products/{self.water.pk}/", {
            "sku": "WATER-1", "name": "Eau", "category": self.category.pk,
            "price": 2, "quantity": 10, "low_stock_threshold": 5, "is_active": False,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

    def test_sales_list_is_paginated_with_items(self):
        self.client.force_authenticate(self.seller)
        self.client.post("/api/sales/", {"items": [{"product": self.water.pk, "quantity": 1}]}, format="json")
        response = self.client.get("/api/sales/?page=1")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["items"][0]["unit_price"], "1.50")


class StockMovementTests(InventoryAPITestCase):
    def setUp(self):
        self.client.force_authenticate(self.manager)

    def move(self, kind, quantity):
        return self.client.post("/api/movements/", {
            "product": self.water.pk, "kind": kind, "quantity": quantity,
        }, format="json")

    def test_in_out_and_adjustment_update_stock(self):
        self.assertEqual(self.move("IN", 5).status_code, 201)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 15)
        self.assertEqual(self.move("OUT", 4).status_code, 201)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 11)
        self.assertEqual(self.move("ADJ", 8).status_code, 201)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 8)

    def test_out_cannot_make_stock_negative(self):
        response = self.move("OUT", 999)
        self.assertEqual(response.status_code, 400)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 10)

    def test_seller_cannot_use_movements(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/movements/").status_code, 403)


class AuthTests(InventoryAPITestCase):
    def test_login_refresh_and_logout(self):
        login = self.client.post("/api/auth/token/", {
            "username": "seller", "password": "Test-1234567"}, format="json")
        self.assertEqual(login.status_code, 200)
        refresh = login.data["refresh"]
        self.assertEqual(self.client.post(
            "/api/auth/logout/", {"refresh": refresh}, format="json").status_code, 200)
        self.assertEqual(self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)

    def test_me_reports_role(self):
        self.client.force_authenticate(self.manager)
        self.assertTrue(self.client.get("/api/auth/me/").data["is_manager"])

    def test_auth_errors_are_in_french(self):
        bad_login = self.client.post("/api/auth/token/", {
            "username": "seller", "password": "wrong"}, format="json")
        self.assertEqual(bad_login.status_code, 401)
        self.assertEqual(bad_login.data["detail"], "Identifiant ou mot de passe incorrect.")
        bad_token = self.client.get("/api/products/", headers={"Authorization": "Bearer abc"})
        self.assertEqual(bad_token.status_code, 401)
        self.assertEqual(bad_token.data["detail"], "Jeton invalide ou expiré.")


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
