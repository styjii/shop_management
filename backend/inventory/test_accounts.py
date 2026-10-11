import re

from django.contrib.auth.models import Group, User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Category, Product, Sale
from .permissions import MANAGER_GROUP, SELLER_GROUP

PASSWORD = "Test-1234567"
NEW_PASSWORD = "Nouveau-Mdp-98765"


class AccountsTestCase(APITestCase):
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
        cls.category = Category.objects.create(name="Boissons")
        cls.water = Product.objects.create(
            sku="WATER-1", name="Eau", category=cls.category, price="1.50", quantity=10
        )

    def login(self, username, password=PASSWORD):
        response = self.client.post(
            "/api/auth/token/", {"username": username, "password": password}, format="json"
        )
        return response


class RegistrationTests(AccountsTestCase):
    payload = {"username": "nouveau", "email": "nouveau@example.com", "password": NEW_PASSWORD}

    def test_registration_creates_an_inactive_account(self):
        response = self.client.post("/api/auth/register/", self.payload, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="nouveau")
        self.assertFalse(user.is_active)
        self.assertFalse(user.groups.exists())
        self.assertEqual(self.login("nouveau", NEW_PASSWORD).status_code, 401)

    def test_duplicates_and_weak_passwords_are_refused(self):
        taken = {**self.payload, "username": "CHEF"}
        self.assertEqual(self.client.post("/api/auth/register/", taken, format="json").status_code, 400)
        email = {**self.payload, "email": "Chef@Example.com"}
        self.assertEqual(self.client.post("/api/auth/register/", email, format="json").status_code, 400)
        weak = self.client.post("/api/auth/register/", {**self.payload, "password": "123"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertIn("password", weak.data)
        self.assertFalse(User.objects.filter(username="nouveau").exists())

    @override_settings(REGISTRATION_ENABLED=False)
    def test_registration_can_be_disabled(self):
        response = self.client.post("/api/auth/register/", self.payload, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Les inscriptions sont désactivées.")

    def test_registration_ignores_an_expired_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer expired.token.value")
        response = self.client.post("/api/auth/register/", self.payload, format="json")
        self.assertEqual(response.status_code, 201)


class PasswordResetTests(AccountsTestCase):
    def request_reset(self, email):
        return self.client.post("/api/auth/password-reset/", {"email": email}, format="json")

    def test_sends_a_link_to_the_known_address(self):
        response = self.request_reset("VENDEUR@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["vendeur@example.com"])
        self.assertIn("/reset-password?uid=", mail.outbox[0].body)

    def test_unknown_inactive_addresses_get_the_same_answer_without_email(self):
        User.objects.create_user("attente", "attente@example.com", PASSWORD, is_active=False)
        known = self.request_reset("vendeur@example.com").data
        self.assertEqual(self.request_reset("inconnu@example.com").data, known)
        self.assertEqual(self.request_reset("attente@example.com").data, known)
        self.assertEqual(len(mail.outbox), 1)  # only the known, active address

    def reset_credentials(self):
        self.request_reset("vendeur@example.com")
        match = re.search(r"uid=([^&\s]+)&token=([^\s]+)", str(mail.outbox[0].body))
        assert match
        return match.group(1), match.group(2)

    def confirm(self, uid, token, password=NEW_PASSWORD):
        return self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": password},
            format="json",
        )

    def test_the_link_changes_the_password_once_and_revokes_sessions(self):
        refresh = self.login("vendeur").data["refresh"]
        uid, token = self.reset_credentials()

        self.assertEqual(self.confirm(uid, token).status_code, 200)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        self.assertEqual(self.login("vendeur", PASSWORD).status_code, 401)
        old_session = self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(old_session.status_code, 401)

        reuse = self.confirm(uid, token, "Autre-Mdp-54321")
        self.assertEqual(reuse.status_code, 400)
        self.assertEqual(reuse.data["detail"], "Ce lien est invalide ou a expiré.")

    def test_invalid_links_and_weak_passwords_are_refused(self):
        self.assertEqual(self.confirm("nope", "bad-token").status_code, 400)
        uid, token = self.reset_credentials()
        weak = self.confirm(uid, token, "123")
        self.assertEqual(weak.status_code, 400)
        self.assertIn("new_password", weak.data)

    def test_email_failure_does_not_break_the_endpoint(self):
        broken = override_settings(EMAIL_BACKEND="inventory.tests_support.BrokenBackend")
        with broken, self.assertLogs("inventory.accounts", level="ERROR"):
            response = self.request_reset("vendeur@example.com")
        self.assertEqual(response.status_code, 200)


class ChangePasswordTests(AccountsTestCase):
    def change(self, old, new):
        return self.client.post(
            "/api/auth/change-password/", {"old_password": old, "new_password": new}, format="json"
        )

    def test_requires_authentication(self):
        self.assertEqual(self.change(PASSWORD, NEW_PASSWORD).status_code, 401)

    def test_changes_the_password_and_revokes_refresh_tokens(self):
        tokens = self.login("vendeur").data
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.change(PASSWORD, NEW_PASSWORD).status_code, 200)

        self.client.credentials()
        self.assertEqual(self.login("vendeur", PASSWORD).status_code, 401)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        refresh = self.client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(refresh.status_code, 401)

    def test_rejects_a_wrong_current_password_a_weak_or_identical_new_one(self):
        self.client.force_authenticate(self.seller)
        wrong = self.change("faux", NEW_PASSWORD)
        self.assertEqual(wrong.data["old_password"], ["Le mot de passe actuel est incorrect."])
        self.assertIn("new_password", self.change(PASSWORD, "123").data)
        self.assertIn("new_password", self.change(PASSWORD, PASSWORD).data)


class ProfileTests(AccountsTestCase):
    def test_me_exposes_role_and_effective_capabilities(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get("/api/auth/me/").data
        self.assertEqual(data["role"], "manager")
        self.assertEqual(sorted(data["capabilities"]), ["manage_catalog", "manage_stock", "view_all_sales"])

        self.client.force_authenticate(self.seller)
        data = self.client.get("/api/auth/me/").data
        self.assertEqual((data["role"], data["is_manager"], data["capabilities"]), ("seller", False, []))

    def test_a_user_can_edit_their_own_profile_only(self):
        self.client.force_authenticate(self.seller)
        response = self.client.patch(
            "/api/auth/me/", {"email": "nouvelle@example.com", "first_name": "Léa"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.seller.refresh_from_db()
        self.assertEqual((self.seller.email, self.seller.first_name), ("nouvelle@example.com", "Léa"))
        self.assertEqual(
            self.client.patch("/api/auth/me/", {"email": "chef@example.com"}, format="json").status_code, 400
        )
        # a username or a role cannot be changed through this endpoint
        self.client.patch("/api/auth/me/", {"username": "pirate", "is_staff": True}, format="json")
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.username, "vendeur")
        self.assertFalse(self.seller.is_staff)


class IndividualRightsTests(AccountsTestCase):
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


class UserManagementTests(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.manager)

    def test_only_managers_can_use_the_users_api(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/users/").status_code, 401)

    def test_lists_searches_and_filters_by_status_and_role(self):
        User.objects.create_user("attente", "attente@example.com", PASSWORD, is_active=False)
        listed = self.client.get("/api/users/").data
        self.assertEqual(listed["count"], 3)
        self.assertNotIn("password", listed["results"][0])

        pending = self.client.get("/api/users/?status=pending").data
        self.assertEqual([u["username"] for u in pending["results"]], ["attente"])
        self.assertEqual(pending["results"][0]["status"], "pending")
        self.assertEqual(self.client.get("/api/users/?role=seller").data["count"], 1)
        self.assertEqual(self.client.get("/api/users/?role=manager").data["count"], 1)
        self.assertEqual(self.client.get("/api/users/?search=VENDEUR").data["count"], 1)

    def test_creates_a_seller_with_individual_rights(self):
        response = self.client.post("/api/users/", {
            "username": "marc", "email": "marc@example.com", "password": NEW_PASSWORD,
            "role": "seller", "capabilities": ["manage_stock"],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data["role"], response.data["capabilities"]), ("seller", ["manage_stock"]))
        self.assertNotIn("password", response.data)
        self.assertEqual(self.login("marc", NEW_PASSWORD).status_code, 200)

    def test_creation_requires_a_role_a_password_and_a_unique_identity(self):
        base = {"username": "marc", "email": "marc@example.com", "password": NEW_PASSWORD, "role": "seller"}
        self.assertIn("role", self.client.post("/api/users/", {**base, "role": None}, format="json").data)
        self.assertIn("password", self.client.post("/api/users/", {**base, "password": ""}, format="json").data)
        self.assertIn("password", self.client.post("/api/users/", {**base, "password": "123"}, format="json").data)
        self.assertIn("username", self.client.post("/api/users/", {**base, "username": "Chef"}, format="json").data)
        self.assertIn("email", self.client.post("/api/users/", {**base, "email": "chef@example.com"}, format="json").data)

    def test_approves_a_pending_registration(self):
        self.client.force_authenticate(None)
        self.client.post("/api/auth/register/", {
            "username": "nouveau", "email": "nouveau@example.com", "password": NEW_PASSWORD}, format="json")
        self.client.force_authenticate(self.manager)
        pending = User.objects.get(username="nouveau")

        no_role = self.client.patch(f"/api/users/{pending.pk}/", {"is_active": True}, format="json")
        self.assertEqual(no_role.status_code, 400)

        approved = self.client.patch(
            f"/api/users/{pending.pk}/", {"is_active": True, "role": "seller"}, format="json")
        self.assertEqual((approved.status_code, approved.data["status"]), (200, "active"))
        self.client.force_authenticate(None)
        self.assertEqual(self.login("nouveau", NEW_PASSWORD).status_code, 200)

    def test_a_deactivated_user_is_refused_at_login(self):
        self.client.patch(f"/api/users/{self.seller.pk}/", {"is_active": False}, format="json")
        self.assertEqual(self.client.get(f"/api/users/{self.seller.pk}/").data["status"], "inactive")
        self.client.force_authenticate(None)
        self.assertEqual(self.login("vendeur").status_code, 401)

    def test_a_manager_cannot_lock_themselves_out(self):
        for change in ({"is_active": False}, {"role": "seller"}):
            response = self.client.patch(f"/api/users/{self.manager.pk}/", change, format="json")
            self.assertEqual(response.status_code, 400, change)
        self.assertEqual(self.client.delete(f"/api/users/{self.manager.pk}/").status_code, 400)

    def test_the_last_active_manager_cannot_be_removed(self):
        other = User.objects.create_user("autre", "autre@example.com", PASSWORD)
        other.groups.add(Group.objects.get(name=MANAGER_GROUP))
        self.client.force_authenticate(other)
        self.client.patch(f"/api/users/{self.manager.pk}/", {"is_active": False}, format="json")
        # `other` is now the last active manager: another manager-level actor cannot remove them
        self.client.force_authenticate(self.manager)  # inactive, but authenticated in this test
        response = self.client.patch(f"/api/users/{other.pk}/", {"role": "seller"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete(f"/api/users/{other.pk}/").status_code, 400)

    def test_superusers_are_protected(self):
        root = User.objects.create_superuser("root", "root@example.com", PASSWORD)
        self.assertTrue(self.client.get(f"/api/users/{root.pk}/").data["is_protected"])
        self.assertEqual(self.client.patch(f"/api/users/{root.pk}/", {"is_active": False}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/users/{root.pk}/").status_code, 403)
        self.assertEqual(
            self.client.post(f"/api/users/{root.pk}/set-password/", {"new_password": NEW_PASSWORD}, format="json").status_code, 403)

    def test_deletes_a_pending_account_but_not_one_with_history(self):
        pending = User.objects.create_user("attente", "attente@example.com", PASSWORD, is_active=False)
        self.assertEqual(self.client.delete(f"/api/users/{pending.pk}/").status_code, 204)

        Sale.objects.create(seller=self.seller)
        response = self.client.delete(f"/api/users/{self.seller.pk}/")
        self.assertEqual(response.status_code, 409)
        self.assertIn("Désactivez-le", response.data["detail"])

    def test_sets_a_new_password_and_revokes_the_sessions(self):
        self.client.force_authenticate(None)
        refresh = self.login("vendeur").data["refresh"]
        self.client.force_authenticate(self.manager)

        response = self.client.post(
            f"/api/users/{self.seller.pk}/set-password/", {"new_password": NEW_PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        self.assertEqual(
            self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)

    def test_set_password_applies_the_password_rules(self):
        response = self.client.post(
            f"/api/users/{self.seller.pk}/set-password/", {"new_password": "123"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_username_cannot_be_renamed(self):
        self.client.patch(f"/api/users/{self.seller.pk}/", {"username": "pirate"}, format="json")
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.username, "vendeur")
