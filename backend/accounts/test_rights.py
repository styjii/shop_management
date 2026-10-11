from django.contrib.auth.models import User

from inventory.models import Category, Product, Sale

from .support import AccountsTestCase


class IndividualRightsTests(AccountsTestCase):
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
