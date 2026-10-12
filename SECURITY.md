# Politique de sécurité

Pour signaler une vulnérabilité, n'ouvrez pas d'issue publique : utilisez l'onglet
**Security → Report a vulnerability** du dépôt GitHub.

## Avant la mise en production

- [ ] `DJANGO_DEBUG=0`, clé secrète aléatoire (50+ caractères), `DJANGO_ALLOWED_HOSTS` précis
- [ ] PostgreSQL (`DB_*`), `python manage.py createcachetable`, `python manage.py migrate`
- [ ] `TRUST_PROXY_SSL=1` et `NUM_PROXIES=1` derrière Nginx ; `CSRF_TRUSTED_ORIGINS` renseigné
- [ ] `python manage.py check --deploy` sans avertissement
- [ ] Mot de passe administrateur changé ; `/admin/` déplacé (`ADMIN_URL`) ou restreint par IP
- [ ] `REGISTRATION_ENABLED=0` si l'inscription libre n'est pas souhaitée
- [ ] HTTPS (Let's Encrypt), `deploy/nginx.conf.example` adapté
- [ ] Sauvegardes de la base (`pg_dump`) et de `media/`
- [ ] `pip-audit` et `npm audit` à jour

## Limites connues

- Le jeton d'accès (15 min) reste en mémoire dans l'onglet Angular ; le jeton de rafraîchissement
  est dans un cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` en production), limité à `/api/auth/` :
  JavaScript ne peut pas le lire. Une faille XSS pourrait toutefois utiliser la session ouverte
  pendant que l'onglet est actif : la CSP de Nginx et l'absence de HTML injecté limitent ce risque.
- Rafraîchissement avec rotation : deux onglets qui renouvellent la session exactement au même
  instant peuvent se déconnecter l'un l'autre (le second jeton est refusé). Cas rare.
- La déconnexion révoque le refresh et supprime le cookie ; l'access (15 min) expire seul.
- Le formulaire d'inscription indique si un nom ou une adresse est déjà pris (compromis d'ergonomie).
