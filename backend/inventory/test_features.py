"""Barcodes, CSV exports, sales statistics, suppliers and purchase orders."""

from decimal import Decimal

from django.test import SimpleTestCase

from .barcodes import build_in_store_ean13, is_valid_gtin
from .models import Product, PurchaseOrder, StockMovement, Supplier
from .tests import InventoryAPITestCase


class GtinTests(SimpleTestCase):
    def test_valid_codes(self):
        for code in ("4006381333931", "73513537", "036000291452"):  # EAN-13, EAN-8, UPC-A
            with self.subTest(code=code):
                self.assertTrue(is_valid_gtin(code))

    def test_invalid_codes(self):
        for code in ("4006381333932", "123", "abcdefgh", "40063813339312", "٤٠٠٦٣٨١٣٣٣٩٣١"):
            with self.subTest(code=code):
                self.assertFalse(is_valid_gtin(code))

    def test_generated_in_store_code_is_a_valid_ean13(self):
        code = build_in_store_ean13(1)
        self.assertEqual(len(code), 13)
        self.assertTrue(code.startswith("2"))
        self.assertTrue(is_valid_gtin(code))


class BarcodeAPITests(InventoryAPITestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.manager)

    def create(self, **extra):
        payload = {
            "sku": "NEW-1", "name": "Nouveau", "category": self.category.pk,
            "price": "2.00", "quantity": 1, "low_stock_threshold": 1, **extra,
        }
        return self.client.post("/api/products/", payload, format="json")

    def test_a_valid_barcode_is_saved(self):
        response = self.create(barcode="4006381333931")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["barcode"], "4006381333931")

    def test_an_invalid_barcode_is_refused(self):
        response = self.create(barcode="4006381333932")
        self.assertEqual(response.status_code, 400)
        self.assertIn("barcode", response.data)

    def test_barcodes_are_unique_but_blank_ones_are_not(self):
        self.assertEqual(self.create(sku="A", barcode="4006381333931").status_code, 201)
        self.assertEqual(self.create(sku="B", barcode="4006381333931").status_code, 400)
        self.assertEqual(self.create(sku="C", barcode="").status_code, 201)
        self.assertEqual(self.create(sku="D", barcode="").status_code, 201)
        self.assertEqual(Product.objects.filter(barcode__isnull=True).count(), 4)

    def test_lookup_by_barcode_for_the_cash_register(self):
        self.create(barcode="4006381333931")
        found = self.client.get("/api/products/", {"barcode": "4006381333931"})
        self.assertEqual([p["sku"] for p in found.data["results"]], ["NEW-1"])
        self.assertEqual(self.client.get("/api/products/", {"search": "40063813"}).data["count"], 1)

    def test_filter_products_that_have_a_barcode(self):
        self.create(sku="WITH", barcode="4006381333931")
        with_code = self.client.get("/api/products/", {"has_barcode": "true"})
        self.assertEqual([p["sku"] for p in with_code.data["results"]], ["WITH"])
        without = self.client.get("/api/products/", {"has_barcode": "false"})
        self.assertNotIn("WITH", [p["sku"] for p in without.data["results"]])

    def test_next_barcode_is_free_and_valid(self):
        first = self.client.get("/api/products/next-barcode/").data["barcode"]
        self.assertTrue(is_valid_gtin(first))
        self.create(barcode=first)
        second = self.client.get("/api/products/next-barcode/").data["barcode"]
        self.assertNotEqual(first, second)
        self.assertTrue(is_valid_gtin(second))


class CsvExportTests(InventoryAPITestCase):
    def sell(self, user, quantity=2):
        self.client.force_authenticate(user)
        response = self.client.post(
            "/api/sales/", {"items": [{"product": self.water.pk, "quantity": quantity}]}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def lines(self, response):
        text = response.content.decode("utf-8")
        self.assertTrue(text.startswith("\ufeff"))
        return text.lstrip("\ufeff").splitlines()

    def test_products_export(self):
        self.client.force_authenticate(self.seller)  # reading the catalogue is open to everyone
        response = self.client.get("/api/products/export/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("attachment; filename=\"produits-", response["Content-Disposition"])
        lines = self.lines(response)
        self.assertEqual(lines[0].split(";")[:3], ["SKU", "Nom", "Catégorie"])
        self.assertIn("WATER-1;Eau;Boissons;;;1,50;10;5;Non;Oui", lines)  # decimal comma

    def test_export_applies_the_filters(self):
        self.client.force_authenticate(self.manager)
        lines = self.lines(self.client.get("/api/products/export/", {"low_stock": "true"}))
        self.assertEqual(len(lines), 2)  # header + the juice (stock 2 <= threshold 5)
        self.assertIn("JUICE-1", lines[1])

    def test_formulas_are_neutralised(self):
        self.client.force_authenticate(self.manager)
        Product.objects.filter(pk=self.water.pk).update(name='=HYPERLINK("http://evil.example")')
        text = self.client.get("/api/products/export/").content.decode("utf-8")
        self.assertIn("'=HYPERLINK", text)
        self.assertNotIn(";=HYPERLINK", text)

    def test_exports_require_authentication(self):
        for url in ("products", "sales", "movements", "purchase-orders"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(f"/api/{url}/export/").status_code, 401)

    def test_sales_export_has_one_row_per_line_and_respects_the_scope(self):
        self.sell(self.seller)
        self.sell(self.manager, quantity=1)
        self.client.force_authenticate(self.seller)
        own = self.lines(self.client.get("/api/sales/export/"))
        self.assertEqual(len(own), 2)  # header + the seller's line only
        self.assertIn("seller;WATER-1;Eau;2;1,50;3,00;3,00", own[1].replace("\u202f", ""))
        self.client.force_authenticate(self.manager)
        self.assertEqual(len(self.lines(self.client.get("/api/sales/export/"))), 3)

    def test_sales_export_date_filter(self):
        self.sell(self.manager)
        future = self.client.get("/api/sales/export/", {"date_from": "2999-01-01"})
        self.assertEqual(len(self.lines(future)), 1)  # header only

    def test_movements_export_is_reserved_to_stock_managers(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/movements/export/").status_code, 403)
        self.client.force_authenticate(self.manager)
        response = self.client.get("/api/movements/export/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.lines(response)[0].split(";")[0], "Date")


class SalesStatsTests(InventoryAPITestCase):
    def sell(self, user, product, quantity):
        self.client.force_authenticate(user)
        self.client.post(
            "/api/sales/", {"items": [{"product": product.pk, "quantity": quantity}]}, format="json"
        )

    def test_totals_daily_series_and_rankings(self):
        self.sell(self.manager, self.water, 4)  # 6.00
        self.sell(self.seller, self.juice, 1)  # 3.00
        self.client.force_authenticate(self.manager)
        data = self.client.get("/api/sales/stats/", {"days": 7}).data

        self.assertEqual(len(data["daily"]), 7)
        self.assertEqual(data["totals"]["revenue"], "9.00")
        self.assertEqual(data["totals"]["sales_count"], 2)
        self.assertEqual(data["totals"]["items_sold"], 5)
        self.assertEqual(data["totals"]["average_basket"], "4.50")
        self.assertEqual(data["daily"][-1]["revenue"], "9.00")  # today is the last day
        self.assertEqual(data["daily"][0]["revenue"], "0.00")  # missing days are filled with 0
        self.assertEqual([p["name"] for p in data["top_products"]], ["Eau", "Jus"])
        self.assertEqual(data["top_products"][0]["revenue"], "6.00")
        self.assertEqual(data["by_category"], [{"category": "Boissons", "revenue": "9.00"}])

    def test_a_seller_only_sees_their_own_sales(self):
        self.sell(self.manager, self.water, 4)
        self.sell(self.seller, self.juice, 1)
        self.client.force_authenticate(self.seller)
        data = self.client.get("/api/sales/stats/").data
        self.assertEqual(data["totals"]["revenue"], "3.00")

    def test_no_sales_gives_zeros(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get("/api/sales/stats/").data
        self.assertEqual(data["totals"]["average_basket"], "0.00")
        self.assertEqual(data["top_products"], [])
        self.assertEqual(len(data["daily"]), 30)

    def test_the_period_is_validated(self):
        self.client.force_authenticate(self.manager)
        for value in ("0", "366", "abc", "-3"):
            with self.subTest(days=value):
                self.assertEqual(self.client.get("/api/sales/stats/", {"days": value}).status_code, 400)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get("/api/sales/stats/").status_code, 401)


class SupplierTests(InventoryAPITestCase):
    def test_only_stock_managers_use_suppliers(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/suppliers/").status_code, 403)
        self.assertEqual(self.client.post("/api/suppliers/", {"name": "X"}, format="json").status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get("/api/suppliers/").status_code, 200)

    def test_crud_and_unique_name(self):
        self.client.force_authenticate(self.manager)
        created = self.client.post(
            "/api/suppliers/",
            {"name": "Boissons SA", "email": "contact@boissons.example", "phone": "0102030405"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(
            self.client.post("/api/suppliers/", {"name": "Boissons SA"}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.post("/api/suppliers/", {"name": "Y", "email": "pas-un-email"}, format="json").status_code,
            400,
        )
        url = f"/api/suppliers/{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {"phone": "0600000000"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_a_product_shows_its_supplier_and_survives_the_supplier_deletion(self):
        supplier = Supplier.objects.create(name="Boissons SA")
        self.client.force_authenticate(self.manager)
        self.client.patch(f"/api/products/{self.water.pk}/", {"supplier": supplier.pk}, format="json")
        data = self.client.get(f"/api/products/{self.water.pk}/").data
        self.assertEqual(data["supplier_name"], "Boissons SA")
        self.assertIsNone(self.client.get(f"/api/products/{self.juice.pk}/").data["supplier_name"])
        self.client.delete(f"/api/suppliers/{supplier.pk}/")
        self.water.refresh_from_db()
        self.assertIsNone(self.water.supplier)

    def test_a_supplier_with_orders_cannot_be_deleted(self):
        supplier = Supplier.objects.create(name="Boissons SA")
        PurchaseOrder.objects.create(supplier=supplier, created_by=self.manager)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.delete(f"/api/suppliers/{supplier.pk}/").status_code, 409)


class PurchaseOrderTests(InventoryAPITestCase):
    def setUp(self):
        super().setUp()
        self.supplier = Supplier.objects.create(name="Boissons SA")
        self.client.force_authenticate(self.manager)

    def payload(self, **extra):
        return {
            "supplier": self.supplier.pk,
            "expected_date": "2026-11-01",
            "notes": "Livraison matin",
            "lines": [
                {"product": self.water.pk, "quantity": 20, "unit_cost": "0.80"},
                {"product": self.juice.pk, "quantity": 10, "unit_cost": "1.50"},
            ],
            **extra,
        }

    def create(self, **extra):
        return self.client.post("/api/purchase-orders/", self.payload(**extra), format="json")

    def test_only_stock_managers_use_purchase_orders(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/purchase-orders/").status_code, 403)
        self.assertEqual(self.client.post("/api/purchase-orders/", self.payload(), format="json").status_code, 403)

    def test_create_computes_the_total_on_the_server(self):
        response = self.create(total="1.00", status="RECEIVED")  # both ignored
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "DRAFT")
        self.assertEqual(response.data["total"], "31.00")  # 20 × 0.80 + 10 × 1.50
        self.assertEqual(response.data["reference"], f"BC-{response.data['id']:05d}")
        self.assertEqual(response.data["created_by"], "manager")
        self.assertEqual(response.data["lines"][0]["line_total"], "16.00")

    def test_invalid_orders_are_refused(self):
        self.assertEqual(self.create(lines=[]).status_code, 400)
        duplicate = [{"product": self.water.pk, "quantity": 1, "unit_cost": "1"}] * 2
        self.assertEqual(self.create(lines=duplicate).status_code, 400)
        zero = [{"product": self.water.pk, "quantity": 0, "unit_cost": "1"}]
        self.assertEqual(self.create(lines=zero).status_code, 400)
        negative = [{"product": self.water.pk, "quantity": 1, "unit_cost": "-1"}]
        self.assertEqual(self.create(lines=negative).status_code, 400)
        Supplier.objects.filter(pk=self.supplier.pk).update(is_active=False)
        self.assertEqual(self.create().status_code, 400)

    def test_an_inactive_product_cannot_be_ordered(self):
        Product.objects.filter(pk=self.water.pk).update(is_active=False)
        self.assertEqual(self.create().status_code, 400)

    def test_a_draft_can_be_edited_and_its_lines_replaced(self):
        order_id = self.create().data["id"]
        url = f"/api/purchase-orders/{order_id}/"
        lines = [{"product": self.juice.pk, "quantity": 5, "unit_cost": "2.00"}]
        response = self.client.patch(url, {"lines": lines, "notes": "Modifié"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["lines"]), 1)
        self.assertEqual(response.data["total"], "10.00")
        self.assertEqual(response.data["notes"], "Modifié")

    def test_a_sent_order_cannot_be_edited_or_deleted(self):
        order_id = self.create().data["id"]
        self.client.post(f"/api/purchase-orders/{order_id}/send/")
        url = f"/api/purchase-orders/{order_id}/"
        self.assertEqual(self.client.patch(url, {"notes": "x"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 409)

    def test_a_draft_can_be_deleted(self):
        order_id = self.create().data["id"]
        self.assertEqual(self.client.delete(f"/api/purchase-orders/{order_id}/").status_code, 204)

    def test_receiving_adds_the_stock_and_records_the_movements(self):
        order_id = self.create().data["id"]
        sent = self.client.post(f"/api/purchase-orders/{order_id}/send/")
        self.assertEqual(sent.data["status"], "SENT")

        received = self.client.post(f"/api/purchase-orders/{order_id}/receive/")
        self.assertEqual(received.status_code, 200)
        self.assertEqual(received.data["status"], "RECEIVED")
        self.assertIsNotNone(received.data["received_at"])

        self.water.refresh_from_db()
        self.juice.refresh_from_db()
        self.assertEqual((self.water.quantity, self.juice.quantity), (30, 12))  # 10 + 20, 2 + 10
        movements = StockMovement.objects.filter(reason=f"Réception BC-{order_id:05d}")
        self.assertEqual(movements.count(), 2)
        self.assertEqual({m.kind for m in movements}, {"IN"})
        self.assertEqual({m.created_by for m in movements}, {self.manager})

    def test_an_order_cannot_be_received_twice(self):
        order_id = self.create().data["id"]
        self.assertEqual(self.client.post(f"/api/purchase-orders/{order_id}/receive/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/purchase-orders/{order_id}/receive/").status_code, 409)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 30)  # added once

    def test_status_transitions(self):
        order_id = self.create().data["id"]
        base = f"/api/purchase-orders/{order_id}"
        self.assertEqual(self.client.post(f"{base}/send/").status_code, 200)
        self.assertEqual(self.client.post(f"{base}/send/").status_code, 409)
        self.assertEqual(self.client.post(f"{base}/cancel/").status_code, 200)
        self.assertEqual(self.client.post(f"{base}/receive/").status_code, 409)
        self.water.refresh_from_db()
        self.assertEqual(self.water.quantity, 10)  # a cancelled order adds nothing

    def test_a_received_order_cannot_be_cancelled(self):
        order_id = self.create().data["id"]
        self.client.post(f"/api/purchase-orders/{order_id}/receive/")
        self.assertEqual(self.client.post(f"/api/purchase-orders/{order_id}/cancel/").status_code, 409)

    def test_list_filters_and_export(self):
        first = self.create().data["id"]
        self.create()
        self.client.post(f"/api/purchase-orders/{first}/send/")
        listing = self.client.get("/api/purchase-orders/", {"status": "SENT"})
        self.assertEqual(listing.data["count"], 1)
        text = self.client.get("/api/purchase-orders/export/").content.decode("utf-8")
        self.assertIn(f"BC-{first:05d};Boissons SA;Envoyé", text)
        self.assertIn("31,00", text)
        self.assertEqual(Decimal(listing.data["results"][0]["total"]), Decimal("31.00"))
