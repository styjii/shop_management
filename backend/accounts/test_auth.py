import re

from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings

from core.views import REFRESH_COOKIE

from .support import NEW_PASSWORD, PASSWORD, AccountsTestCase


class LoginTests(AccountsTestCase):
    def test_login_returns_the_access_token_and_sets_an_httponly_refresh_cookie(self):
        login = self.login("vendeur")
        self.assertEqual(login.status_code, 200)
        self.assertIn("access", login.data)
        self.assertNotIn("refresh", login.data)  # the refresh token never reaches JavaScript
        cookie = self.client.cookies[REFRESH_COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(cookie["path"], "/api/auth/")

    def test_refresh_uses_the_cookie_and_rotates_it(self):
        self.login("vendeur")
        first = self.refresh_cookie()
        response = self.client.post("/api/auth/refresh/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertNotEqual(self.refresh_cookie(), first)
        # the previous refresh token has been revoked by the rotation
        self.assertEqual(self.refresh_with(first).status_code, 401)

    def test_refresh_ignores_a_token_sent_in_the_body(self):
        self.login("vendeur")
        token = self.refresh_cookie()
        self.client.cookies.clear()
        response = self.client.post("/api/auth/refresh/", {"refresh": token}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_refresh_without_cookie_or_with_garbage_is_refused_and_clears_the_cookie(self):
        self.assertEqual(self.client.post("/api/auth/refresh/", {}, format="json").status_code, 401)
        response = self.refresh_with("not-a-token")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies[REFRESH_COOKIE]["max-age"], 0)

    def test_logout_revokes_the_refresh_token_and_clears_the_cookie(self):
        self.login("vendeur")
        token = self.refresh_cookie()
        logout = self.client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(logout.status_code, 200)
        self.assertEqual(logout.cookies[REFRESH_COOKIE]["max-age"], 0)
        self.assertEqual(self.refresh_with(token).status_code, 401)

    def test_logout_always_succeeds(self):
        self.assertEqual(self.client.post("/api/auth/logout/", {}, format="json").status_code, 200)

    def test_a_deactivated_user_cannot_refresh(self):
        self.login("vendeur")
        token = self.refresh_cookie()
        self.seller.is_active = False
        self.seller.save()
        self.assertEqual(self.refresh_with(token).status_code, 401)

    def test_auth_errors_are_in_french(self):
        bad_login = self.login("vendeur", "wrong")
        self.assertEqual(bad_login.status_code, 401)
        self.assertEqual(bad_login.data["detail"], "Identifiant ou mot de passe incorrect.")
        bad_token = self.client.get("/api/products/", headers={"Authorization": "Bearer abc"})
        self.assertEqual(bad_token.status_code, 401)
        self.assertEqual(bad_token.data["detail"], "Jeton invalide ou expiré.")

    def test_login_is_rate_limited(self):
        for _ in range(5):
            self.login("vendeur", "wrong")
        self.assertEqual(self.login("vendeur", "wrong").status_code, 429)


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
        self.login("vendeur")
        refresh = self.refresh_cookie()
        uid, token = self.reset_credentials()

        self.assertEqual(self.confirm(uid, token).status_code, 200)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        self.assertEqual(self.login("vendeur", PASSWORD).status_code, 401)
        self.assertEqual(self.refresh_with(refresh).status_code, 401)

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
        broken = override_settings(EMAIL_BACKEND="accounts.support.BrokenBackend")
        with broken, self.assertLogs("accounts.services", level="ERROR"):
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
        old_refresh = self.refresh_cookie()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.change(PASSWORD, NEW_PASSWORD).status_code, 200)

        self.client.credentials()
        self.assertEqual(self.login("vendeur", PASSWORD).status_code, 401)
        self.assertEqual(self.login("vendeur", NEW_PASSWORD).status_code, 200)
        self.assertEqual(self.refresh_with(old_refresh).status_code, 401)

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


class LastLoginTests(AccountsTestCase):
    def test_login_records_last_login(self):
        self.assertIsNone(self.seller.last_login)
        self.assertEqual(self.login("vendeur").status_code, 200)
        self.seller.refresh_from_db()
        self.assertIsNotNone(self.seller.last_login)

    def test_failed_login_does_not_record_last_login(self):
        self.login("vendeur", "mauvais-mot-de-passe")
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.last_login)
