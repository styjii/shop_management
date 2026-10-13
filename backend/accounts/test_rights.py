from django.contrib import admin
from django.contrib.auth.models import User

from inventory.models import Category, Product, Sale, StockMovement

from .support import AccountsTestCase


class RightsTestCase(AccountsTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Boissons")
        cls.water = Product.objects.create(
            sku="WATER-1", name="Eau", category=cls.category, price="1.50", quantity=10
        )

    def grant(self, *capabilities):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            f"/api/users/{self.seller.pk}/", {"capabilities": list(capabilities)}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(User.objects.get(pk=self.seller.pk))


class IndividualRightsTests(RightsTestCase):
    def test_a_seller_has_no_extra_right_by_default(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/movements/").status_code, 403)
        self.assertEqual(self.client.post("/api/categories/", {"name": "X"}, format="json").status_code, 403)

    def test_manage_stock_opens_the_movements(self):
        self.grant("manage_stock")
        self.assertEqual(self.client.get("/api/movements/").status_code, 200)
        response = self.client.post(
            "/api/movements/", {"product": self.water.pk, "kind": "IN", "quantity": 5}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.post("/api/categories/", {"name": "X"}, format="json").status_code, 403)

    def test_manage_catalog_opens_products_and_categories(self):
        self.grant("manage_catalog")
        self.assertEqual(self.client.post("/api/categories/", {"name": "Épicerie"}, format="json").status_code, 201)
        self.assertEqual(self.client.get("/api/movements/").status_code, 403)

    def test_view_all_sales_shows_the_sales_of_others(self):
        Sale.objects.create(seller=self.manager)
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/sales/").data["count"], 0)
        self.grant("view_all_sales")
        self.assertEqual(self.client.get("/api/sales/").data["count"], 1)

    def test_rights_are_listed_in_the_user_api_and_cleared_for_managers(self):
        self.grant("manage_stock", "view_all_sales")
        self.client.force_authenticate(self.manager)
        listed = self.client.get(f"/api/users/{self.seller.pk}/").data
        self.assertEqual(sorted(listed["capabilities"]), ["manage_stock", "view_all_sales"])

        promoted = self.client.patch(f"/api/users/{self.seller.pk}/", {"role": "manager"}, format="json")
        self.assertEqual(promoted.data["role"], "manager")
        self.assertEqual(promoted.data["capabilities"], [])

    def test_unknown_rights_are_refused(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(f"/api/users/{self.seller.pk}/", {"capabilities": ["root"]}, format="json")
        self.assertEqual(response.status_code, 400)


class StockIntegrityTests(RightsTestCase):
    """The stock only moves through traced operations, never through the product API."""

    def product_url(self):
        return f"/api/products/{self.water.pk}/"

    def assert_stock_unchanged(self):
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 10)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_catalog_right_alone_cannot_change_the_stock(self):
        self.grant("manage_catalog")
        for method in (self.client.patch, self.client.put):
            body = {"quantity": 999}
            if method == self.client.put:
                body = {"sku": "WATER-1", "name": "Eau", "category": self.category.pk,
                        "price": "1.50", "quantity": 999}
            response = method(self.product_url(), body, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["quantity"], 10)
            self.assert_stock_unchanged()

    def test_catalog_right_alone_cannot_change_the_stock_with_multipart(self):
        self.grant("manage_catalog")
        response = self.client.patch(self.product_url(), {"quantity": 999}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_stock_unchanged()

    def test_catalog_right_still_edits_the_other_fields(self):
        self.grant("manage_catalog")
        response = self.client.patch(
            self.product_url(), {"price": "2.50", "quantity": 999}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.water.refresh_from_db()
        self.assertEqual(str(self.water.price), "2.50")
        self.assertEqual(self.water.quantity, 10)

    def test_catalog_right_cannot_create_a_product_with_stock(self):
        self.grant("manage_catalog")
        response = self.client.post("/api/products/", {
            "sku": "NEW-1", "name": "Soda", "category": self.category.pk,
            "price": "2.00", "quantity": 50,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Product.objects.get(sku="NEW-1").quantity, 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_catalog_right_alone_cannot_use_the_stock_endpoints(self):
        self.grant("manage_catalog")
        response = self.client.post("/api/movements/", {
            "product": self.water.pk, "kind": "ADJ", "quantity": 999,
        }, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post("/api/purchase-orders/", {}, format="json").status_code, 403)
        self.assert_stock_unchanged()

    def test_stock_right_alone_cannot_edit_products(self):
        self.grant("manage_stock")
        response = self.client.patch(self.product_url(), {"quantity": 999}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assert_stock_unchanged()

    def test_stock_right_changes_the_stock_with_a_movement(self):
        self.grant("manage_stock")
        response = self.client.post("/api/movements/", {
            "product": self.water.pk, "kind": "IN", "quantity": 5,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 15)
        movement = StockMovement.objects.get()
        self.assertEqual((movement.kind, movement.quantity), ("IN", 5))
        self.assertEqual(movement.created_by, self.seller)

    def test_a_manager_cannot_bypass_the_movements_either(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(self.product_url(), {"quantity": 999}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_stock_unchanged()

    def test_seller_without_rights_cannot_change_the_stock(self):
        self.client.force_authenticate(self.seller)
        response = self.client.patch(self.product_url(), {"quantity": 999}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assert_stock_unchanged()

    def test_the_admin_does_not_edit_the_stock_by_hand(self):
        self.assertIn("quantity", admin.site._registry[Product].readonly_fields)
