from django.contrib.auth.models import Group, User

from inventory.models import Sale

from .permissions import MANAGER_GROUP
from .support import NEW_PASSWORD, PASSWORD, AccountsTestCase


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
        self.login("vendeur")
        refresh = self.refresh_cookie()
        self.client.force_authenticate(self.manager)

        response = self.client.post(
            f"/api/users/{self.seller.pk}/set-password/", {"new_password": NEW_PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        self.assertEqual(self.refresh_with(refresh).status_code, 401)

    def test_set_password_applies_the_password_rules(self):
        response = self.client.post(
            f"/api/users/{self.seller.pk}/set-password/", {"new_password": "123"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_username_cannot_be_renamed(self):
        self.client.patch(f"/api/users/{self.seller.pk}/", {"username": "pirate"}, format="json")
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.username, "vendeur")
