# Shop Management

> Mini-ERP de gestion de stock pour un magasin : suivi des produits, alertes de stock bas et enregistrement des ventes.

![Django](https://img.shields.io/badge/Django-6.1-092E20?logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-3.18-A30000)
![Angular](https://img.shields.io/badge/Angular-SPA-DD0031?logo=angular&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![Status](https://img.shields.io/badge/status-en%20d%C3%A9veloppement-orange)
![License](https://img.shields.io/badge/licence-MIT-green)
![CI](https://github.com/styjii/shop_management/actions/workflows/ci.yml/badge.svg)

Par **[styjii](https://github.com/styjii)** (username : `styjii`).

---

## Table des matières

- [À propos](#à-propos)
- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [API](#api)
- [Tests et qualité du code](#tests-et-qualité-du-code)
- [Sécurité](#sécurité)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)
- [Auteur](#auteur)

## À propos

**Shop Management** est une application web complète de type Mini-ERP. Elle reproduit les briques que l'on retrouve dans les logiciels d'entreprise : authentification, rôles, base relationnelle, formulaires dynamiques et tableaux filtrables.

- **Backend** : API REST avec Django et Django REST Framework, base SQL. *(fonctionnel)*
- **Frontend** : application monopage Angular 21 avec Tailwind CSS et daisyUI. *(fonctionnel)*

Convention du projet : le **code reste en anglais**, les **sorties** (administration, libellés, messages d'erreur) sont **en français**.

## Fonctionnalités

- Authentification par jetons **JWT** (rotation et liste noire), avec messages d'erreur en français : le jeton d'accès reste en mémoire, le jeton de rafraîchissement est dans un cookie `HttpOnly` illisible par JavaScript.
- Rôles **Gestionnaire** et **Vendeur** (groupes Django) et **droits individuels** que le gestionnaire accorde à un vendeur : gérer le catalogue, gérer le stock, voir toutes les ventes.
- **Gestion des utilisateurs** par les gestionnaires : création, modification, rôle et droits, désactivation, mot de passe temporaire, suppression.
- **Inscription libre** : chacun peut demander un compte, qui reste inactif jusqu'à l'approbation d'un gestionnaire.
- **Mot de passe oublié** par e-mail (lien valable 1 heure, à usage unique) et **changement de mot de passe** (ferme toutes les sessions).
- CRUD des **produits** et des **catégories** (SKU unique, prix, quantité, image de 2 Mo maximum).
- **Recherche et filtres** : recherche par nom ou SKU, filtres par catégorie, prix et « stock bas », tri et pagination.
- **Alertes** de stock bas, avec seuil configurable par produit.
- **Ventes atomiques** : contrôle du stock, prix figé, total calculé par le serveur, lignes en double fusionnées.
- **Mouvements de stock** (entrée, sortie, ajustement) qui mettent à jour la quantité du produit.
- **Suppression protégée** : une catégorie ou un produit déjà utilisé ne peut pas être supprimé (réponse 409 claire).
- **Administration Django en français** ; les ventes et mouvements y sont en lecture seule pour préserver la cohérence du stock.
- **Initialisation en une commande** : groupes et compte administrateur par défaut.
- **Interface Angular** : connexion, tableau de bord des alertes, tableau de produits filtrable (recherche, catégorie, tri, pagination), formulaire de produit avec image, caisse avec panier, historique des ventes avec détail, gestion des catégories, mouvements de stock (entrée, sortie, ajustement), menu adapté au rôle et au mobile.

## Stack technique

### Backend

Les dépendances sont réparties en trois fichiers dans `requirements/`.

**`base.txt`** : nécessaire pour exécuter l'application

| Paquet | Version | Rôle |
|---|---|---|
| Django | 6.1.2 | Framework web, ORM, administration |
| djangorestframework | 3.18.3 | API REST |
| djangorestframework_simplejwt | 5.5.1 | Authentification JWT |
| django-cors-headers | 4.9.0 | Autorisation CORS pour le frontend |
| django-filter | 26.2 | Filtres de recherche |
| pillow | 12.3.0 | Images de produits (`ImageField`) |
| asgiref, sqlparse, PyJWT | 3.12.1, 0.6.0, 2.15.1 | Dépendances de Django et de SimpleJWT |

**`dev.txt`** : développement (inclut `base.txt`)

| Paquet | Version | Rôle |
|---|---|---|
| django-stubs, django-stubs-ext | 6.1.2 | Typage statique |
| djangorestframework-stubs | 3.18.1 | Typage de DRF (évite les faux positifs de Pyright) |
| types-PyYAML, typing_extensions | 6.0.12.20260906, 4.16.0 | Dépendances du typage |
| pip-audit | | Audit des dépendances vulnérables |

**`prod.txt`** : production (inclut `base.txt`)

| Paquet | Rôle |
|---|---|
| gunicorn | Serveur WSGI |
| psycopg[binary] | Connecteur PostgreSQL |

### Frontend

| Technologie | Rôle |
|---|---|
| Angular 21 | Composants autonomes, signaux, formulaires réactifs, `HttpClient`, sans `zone.js` |
| TypeScript, RxJS | Typage strict, flux asynchrones (recherche instantanée, rafraîchissement du jeton) |
| Tailwind CSS 4 | Utilitaires CSS (`@tailwindcss/postcss`) |
| daisyUI 5 | Composants d'interface (navbar, tableaux, formulaires, modales, toasts) |
| Vitest + jsdom | Tests unitaires (aucun navigateur requis) |
| Prettier | Formatage du code |

### Outils

`git`, `pip` + `venv`, `npm` + Angular CLI, `curl`, HTTPie, **Ruff** (lint) et **Pyright** (typage), configurés par `backend/ruff.toml` et `pyrightconfig.json`. Développement possible sur mobile avec Termux.

## Structure du projet

```text
shop_management/
├── backend/
│   ├── core/                      # configuration Django
│   │   ├── asgi.py
│   │   ├── exceptions.py          # messages d'erreur JWT en français
│   │   ├── settings.py
│   │   ├── urls.py                # routes
│   │   ├── auth_views.py          # connexion, rafraîchissement, déconnexion (cookie HttpOnly)
│   │   └── wsgi.py
│   ├── accounts/                  # comptes, rôles et droits
│   │   ├── management/commands/
│   │   │   └── setup_defaults.py  # groupes + compte admin par défaut
│   │   ├── migrations/
│   │   ├── filters.py             # filtres des utilisateurs (statut, rôle)
│   │   ├── models.py              # Right : porte les droits individuels (sans table)
│   │   ├── permissions.py         # rôles, droits individuels, classes de permission DRF
│   │   ├── serializers.py         # profil, mot de passe, inscription, utilisateurs
│   │   ├── services.py            # rôles, jetons, e-mails de réinitialisation
│   │   ├── urls.py                # /api/auth/... et /api/users/
│   │   ├── views.py
│   │   └── test_*.py
│   ├── inventory/                 # application métier (stock)
│   │   ├── migrations/
│   │   ├── admin.py               # administration en français
│   │   ├── filters.py             # recherche et filtres produits
│   │   ├── models.py              # Category, Product, StockMovement, Sale, SaleItem
│   │   ├── serializers.py
│   │   ├── services.py            # règles métier du stock
│   │   ├── tests.py
│   │   ├── urls.py
│   │   ├── validators.py
│   │   └── views.py
│   ├── gunicorn.conf.py           # serveur WSGI de production
│   ├── manage.py
│   └── ruff.toml                  # configuration de Ruff (lint)
├── frontend/                      # Angular + Tailwind + daisyUI
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/              # auth, intercepteur JWT, gardes, erreurs, toasts
│   │   │   ├── features/
│   │   │   │   ├── auth/login/, register/, forgot-password/, reset-password/
│   │   │   │   ├── account/account/
│   │   │   │   ├── users/users/
│   │   │   │   ├── dashboard/dashboard/
│   │   │   │   ├── products/product-list/
│   │   │   │   ├── products/product-form/
│   │   │   │   ├── categories/categories/
│   │   │   │   ├── movements/movements/
│   │   │   │   ├── sales/sale-pos/
│   │   │   │   └── sales/sale-history/
│   │   │   ├── models/inventory.ts
│   │   │   ├── services/          # product, category, movement, sale
│   │   │   ├── app.config.ts
│   │   │   ├── app.routes.ts
│   │   │   ├── app.html
│   │   │   └── app.ts
│   │   ├── environments/          # URL de l'API (production / développement)
│   │   ├── testing/factories.ts   # données de test
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css             # Tailwind + daisyUI
│   ├── .postcssrc.json
│   ├── .prettierrc
│   ├── angular.json
│   ├── package.json
│   └── tsconfig*.json
├── requirements/
│   ├── base.txt                   # dépendances d'exécution
│   ├── dev.txt                    # développement (typage, audit)
│   └── prod.txt                   # production (gunicorn, PostgreSQL)
├── .github/workflows/ci.yml       # intégration continue (GitHub Actions)
├── deploy/
│   └── nginx.conf.example         # Nginx : HTTPS, CSP, en-têtes, /media sécurisé
├── SECURITY.md                    # politique et checklist de production
├── .env.example                   # modèle de configuration (sans secret)
├── .gitignore
├── LICENSE
├── pyrightconfig.json
└── README.md
```

## Prérequis

- Python 3.12 ou supérieur
- Node.js (version LTS) et npm
- git

## Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/styjii/shop_management.git
cd shop_management

# 2. Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements/dev.txt      # en production : requirements/prod.txt

# 3. Frontend
cd frontend
npm install
```

## Configuration

Le backend lit sa configuration dans des variables d'environnement. Copiez le modèle, renseignez vos valeurs, puis chargez-les dans le terminal. Ne commitez jamais le fichier `.env`.

```bash
cp .env.example .env
set -a; source .env; set +a
```

| Variable | Description | Exemple |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clé secrète Django (obligatoire) | *(à générer)* |
| `DJANGO_DEBUG` | `1` en développement, `0` en production | `1` |
| `DJANGO_ALLOWED_HOSTS` | Hôtes autorisés, séparés par des virgules | `localhost,127.0.0.1` |
| `CORS_ALLOWED_ORIGINS` | Origines autorisées pour le frontend | `http://localhost:4200` |
| `CSRF_TRUSTED_ORIGINS` | Origines HTTPS de confiance (production, ex. `https://shop.example.com`) | *(optionnel)* |
| `TRUST_PROXY_SSL` | `1` derrière Nginx (fait confiance à `X-Forwarded-Proto`, évite la boucle de redirection HTTPS) | `1` |
| `NUM_PROXIES` | Nombre de proxys devant Django : la limitation de débit utilise alors l'IP réelle | `1` |
| `ADMIN_URL` | Déplace l'administration (ex. `gestion-a8f3k2/`) | `admin/` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL (si `DB_NAME` est vide : SQLite) | *(production)* |
| `DJANGO_DEFAULT_ADMIN_USERNAME` | Nom du compte admin par défaut | `admin` |
| `DJANGO_DEFAULT_ADMIN_PASSWORD` | Mot de passe du compte admin (vide : généré aléatoirement) | *(optionnel)* |
| `REGISTRATION_ENABLED` | `1` : inscription libre (comptes à approuver), `0` : désactivée | `1` |
| `FRONTEND_URL` | Adresse d'Angular, utilisée dans les liens des e-mails | `http://localhost:4200` |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` | Serveur SMTP (production) | `smtp.example.com`, `587` |
| `DEFAULT_FROM_EMAIL` | Expéditeur des e-mails | `Shop Management <no-reply@example.com>` |
| `DJANGO_EMAIL_BACKEND` | Pour forcer un autre moteur d'e-mails (par défaut : console en développement, SMTP sinon) | *(optionnel)* |

Générer une clé secrète :

```bash
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

## Utilisation

### Premier lancement

Après une mise à jour qui change les modèles, appliquez les migrations : `python manage.py makemigrations` puis `migrate`. L'app `accounts` ajoute sa migration `0001` (le modèle `Right` n'a pas de table : il ne sert qu'à porter les droits individuels).

```bash
cd backend
python manage.py migrate
python manage.py setup_defaults
python manage.py runserver        # http://localhost:8000
```

La commande `setup_defaults` est idempotente. Au premier lancement, elle affiche :

```text
Groupe créé : Gestionnaire
Groupe créé : Vendeur
Compte admin créé : admin
Mot de passe généré (affiché une seule fois) : ...
```

- Si `DJANGO_DEFAULT_ADMIN_PASSWORD` est renseigné, il est utilisé (il doit respecter les règles de mot de passe) ; sinon un mot de passe aléatoire est généré et affiché **une seule fois**.
- Changez ce mot de passe après la première connexion.
- Créez ensuite vos vendeurs dans l'administration (`/admin/`) et ajoutez-les au groupe `Vendeur`.

### Frontend

```bash
cd frontend
npx ng serve                      # http://localhost:4200
```

Connectez-vous avec le compte créé par `setup_defaults`. En développement, l'application appelle l'API sur `http://<hôte>:8000/api` (voir `src/environments/environment.development.ts`). En production, elle appelle `/api` : un reverse proxy (Nginx) doit servir le frontend et relayer `/api` et `/media` vers Django.

Pour l'ouvrir depuis un autre appareil du réseau local :

```bash
npx ng serve --host 0.0.0.0
```

puis ajoutez l'adresse IP à `DJANGO_ALLOWED_HOSTS` et `http://<ip>:4200` à `CORS_ALLOWED_ORIGINS` dans `.env`.

| Écran | Route | Accès |
|---|---|---|
| Connexion | `/login` | Public |
| Tableau de bord (alertes, dernières ventes) | `/dashboard` | Tous les utilisateurs |
| Liste des produits (recherche, filtres, tri) | `/products` | Tous les utilisateurs |
| Caisse | `/sales` | Tous les utilisateurs |
| Historique des ventes (détail par vente) | `/sales/history` | Tous (un vendeur ne voit que les siennes) |
| Création et modification de produit | `/products/new`, `/products/:id/edit` | Droit « catalogue » |
| Catégories (ajout, modification, suppression) | `/categories` | Droit « catalogue » |
| Mouvements de stock (entrée, sortie, ajustement) | `/movements` | Droit « stock » |
| Utilisateurs (création, approbation, rôles et droits) | `/users` | Gestionnaire |
| Mon compte (profil, droits, mot de passe) | `/account` | Tous les utilisateurs |
| Créer un compte, mot de passe oublié, nouveau mot de passe | `/register`, `/forgot-password`, `/reset-password` | Public |

Depuis le tableau de bord ou la liste des produits, le lien « Réapprovisionner » / « Stock » ouvre `/movements?product=<id>` pour le produit concerné.

## API

| Méthode | Endpoint | Description | Accès |
|---|---|---|---|
| POST | `/api/auth/token/` | Connexion (access + refresh), 5 essais par minute | Public (limité) |
| POST | `/api/auth/refresh/` | Nouveau jeton access (lit le cookie de rafraîchissement) | Cookie valide |
| POST | `/api/auth/logout/` | Invalide le refresh | Refresh valide |
| GET / PATCH | `/api/auth/me/` | Profil, rôle et droits ; modification de l'e-mail et du nom | Connecté |
| POST | `/api/auth/change-password/` | Changer son mot de passe (ferme toutes les sessions) | Connecté |
| POST | `/api/auth/register/` | Demande de compte (inactif jusqu'à approbation), 5 par heure | Public (limité) |
| POST | `/api/auth/password-reset/` | Envoie le lien de réinitialisation (réponse identique si l'adresse est inconnue) | Public (limité) |
| POST | `/api/auth/password-reset/confirm/` | Choisit un nouveau mot de passe avec `uid` et `token` | Public (limité) |
| GET / POST | `/api/users/` | Lister (filtres `status`, `role`, `search`) / créer un utilisateur | Gestionnaire |
| GET / PATCH / DELETE | `/api/users/<id>/` | Détail, modification (rôle, droits, activation), suppression | Gestionnaire |
| POST | `/api/users/<id>/set-password/` | Définir un mot de passe temporaire | Gestionnaire |
| GET | `/api/products/` | Liste filtrée et paginée | Connecté |
| GET | `/api/products/low-stock/` | Produits sous le seuil | Connecté |
| POST | `/api/products/` | Créer un produit | Droit « catalogue » |
| PUT / PATCH / DELETE | `/api/products/<id>/` | Modifier / supprimer un produit | Droit « catalogue » |
| GET | `/api/categories/` | Liste des catégories (sans pagination) | Connecté |
| POST / PUT / PATCH / DELETE | `/api/categories/` | Gestion des catégories | Droit « catalogue » |
| POST | `/api/sales/` | Enregistrer une vente | Connecté |
| GET | `/api/sales/` | Lister les ventes (les siennes, ou toutes avec le droit « toutes les ventes ») | Connecté |
| GET / POST | `/api/movements/` | Historique et mouvements de stock | Droit « stock » |

Paramètres de filtrage des produits : `search`, `category`, `min_price`, `max_price`, `low_stock`, `is_active`, `ordering`, `page`.

Exemple de vente :

```bash
curl -X POST http://localhost:8000/api/sales/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product": 1, "quantity": 2}]}'
```

### Organisation du backend

Deux apps Django séparent les responsabilités :

- **`accounts`** : tout ce qui concerne les personnes (connexion, profil, inscription, mot de passe, utilisateurs, rôles et droits) et la commande `setup_defaults`. Elle ne dépend pas de `inventory`.
- **`inventory`** : le stock (catégories, produits, mouvements, ventes). Elle utilise les droits définis par `accounts` (`accounts.permissions`).

Les adresses de l'API ne changent pas (`/api/auth/...`, `/api/users/`, `/api/products/`...).

### Rôles et droits

| | Vendeur | Vendeur avec droits | Gestionnaire |
|---|---|---|---|
| Voir produits, tableau de bord, ses ventes ; vendre | oui | oui | oui |
| Gérer le catalogue (produits, catégories) | non | si « Gérer le catalogue » | oui |
| Gérer le stock (mouvements) | non | si « Gérer le stock » | oui |
| Voir toutes les ventes | non | si « Voir toutes les ventes » | oui |
| Gérer les utilisateurs | non | non (jamais délégable) | oui |

Règles de sécurité des comptes :
- une inscription crée un compte **inactif et sans rôle** : il ne peut rien faire avant l'approbation d'un gestionnaire ;
- un gestionnaire ne peut ni se désactiver, ni changer son propre rôle, ni supprimer son compte, et le **dernier gestionnaire actif** ne peut pas être retiré ;
- les **superutilisateurs** (le compte de `setup_defaults`) sont protégés : ils se gèrent uniquement depuis `/admin/` ;
- un compte qui a des ventes ou des mouvements ne peut pas être supprimé (409) : on le **désactive** ;
- changer ou réinitialiser un mot de passe **ferme toutes les sessions** du compte (jetons de rafraîchissement mis sur liste noire ; le jeton d'accès, court, expire seul) ;
- les liens de réinitialisation sont à usage unique et valables 1 heure ; la demande répond toujours la même chose, qu'une adresse existe ou non.

Mouvements de stock : `IN` (entrée, ajoute), `OUT` (sortie, retire et refuse si le stock est insuffisant), `ADJ` (ajustement : la quantité devient celle de l'inventaire).

## Tests et qualité du code

```bash
# Backend (comptes et droits, ventes, stock, filtres, authentification, setup_defaults)
cd backend && python manage.py test

# Lint et typage (depuis la racine)
ruff check backend
pyright

# Frontend (Vitest, sans navigateur)
cd frontend && npx ng test --watch=false
cd frontend && npx prettier --check "src/**/*.{ts,html,css}"
```

### Intégration continue

Le workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) s'exécute à chaque `push` sur `main` et à chaque Pull Request :

- **Backend** (Python 3.12 et 3.13) : Pyright, vérification des migrations, tests Django.
- **Frontend** : Prettier, `ng build`, puis `ng test` (Vitest + jsdom, sans navigateur).
- **Audit** des dépendances (`pip-audit`, `npm audit`), à titre informatif.

Le résultat s'affiche dans l'onglet **Actions** du dépôt et sur le badge CI en haut de ce fichier.

## Sécurité

- Secrets en variables d'environnement, jamais dans le dépôt ; l'application refuse de démarrer sans `DJANGO_SECRET_KEY`, et en production avec une clé faible (< 50 caractères, `change-me`) ou `ALLOWED_HOSTS=*`.
- Images : taille (2 Mo), contenu vérifié par Pillow et extensions limitées à jpg, png, webp (SVG refusé).
- API en JSON seulement en production (pas d'interface navigable) ; vente limitée à 100 lignes ; tailles de requêtes bornées.
- Compteurs de limitation de débit partagés entre les workers Gunicorn (cache en base) et calculés sur l'IP réelle (`NUM_PROXIES`).
- Administration déplaçable (`ADMIN_URL`) ; CSP et en-têtes de sécurité dans `deploy/nginx.conf.example`.
- Tests de sécurité (`backend/core/test_security.py`) : accès anonyme refusé, uploads malveillants, réglages de production.
- Checklist de mise en production : voir [SECURITY.md](SECURITY.md).
- Jetons access courts (15 min), refresh avec rotation et liste noire.
- Limitation du débit sur la connexion et sur l'API.
- Authentification obligatoire par défaut et permissions par rôle.
- Aucun mot de passe par défaut écrit en dur : il est fourni par l'environnement ou généré.
- Validation des données (prix, quantités, taille des images) et transactions atomiques sur le stock.
- Liste blanche CORS ; HTTPS, HSTS et cookies sécurisés quand `DJANGO_DEBUG=0`.
- Audit régulier :

```bash
python manage.py check --deploy
pip-audit -r requirements/base.txt
cd frontend && npm audit
```

## Feuille de route

- [x] Squelette Django et Angular
- [x] Séparation des dépendances (`base`, `dev`, `prod`)
- [x] Modèles et API catalogue (produits, catégories)
- [x] Authentification JWT et rôles
- [x] Ventes et mouvements de stock
- [x] Administration en français et commande `setup_defaults`
- [x] Tests backend, Ruff et Pyright
- [x] Interface Angular (connexion, tableau filtrable, formulaires, caisse)
- [x] Tableau de bord des alertes
- [x] Interface des mouvements de stock, historique des ventes et catégories
- [x] Gestion des utilisateurs, droits individuels, inscription et mot de passe oublié
- [x] Durcissement de sécurité et fichiers de déploiement (`deploy/`, `gunicorn.conf.py`)
- [ ] Mise en ligne effective (PostgreSQL, Gunicorn, Nginx, HTTPS)

## Contribuer

Les contributions sont les bienvenues :

1. Forkez le dépôt.
2. Créez une branche : `git checkout -b feat/ma-fonctionnalite`.
3. Commitez vos changements : `git commit -m "feat: ma fonctionnalité"`.
4. Poussez la branche : `git push origin feat/ma-fonctionnalite`.
5. Ouvrez une Pull Request.

## Licence

Ce projet est distribué sous licence **MIT**. Voir le fichier [LICENSE](LICENSE) pour le texte complet.

Copyright © 2026 Styjii Rht

## Auteur

**styjii** — [github.com/styjii](https://github.com/styjii)
