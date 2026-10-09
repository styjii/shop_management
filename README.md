# Shop Management

> Mini-ERP de gestion de stock pour un magasin : suivi des produits, alertes de stock bas et enregistrement des ventes.

![Django](https://img.shields.io/badge/Django-6.1-092E20?logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-3.18-A30000)
![Angular](https://img.shields.io/badge/Angular-SPA-DD0031?logo=angular&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![Status](https://img.shields.io/badge/status-en%20d%C3%A9veloppement-orange)
![License](https://img.shields.io/badge/licence-MIT-green)

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
- **Frontend** : application monopage Angular. *(en cours)*

Convention du projet : le **code reste en anglais**, les **sorties** (administration, libellés, messages d'erreur) sont **en français**.

## Fonctionnalités

- Authentification par jetons **JWT** (access + refresh, rotation et liste noire), avec messages d'erreur en français.
- Rôles **Gestionnaire** et **Vendeur** (groupes Django) : un vendeur ne voit que ses propres ventes.
- CRUD des **produits** et des **catégories** (SKU unique, prix, quantité, image de 2 Mo maximum).
- **Recherche et filtres** : recherche par nom ou SKU, filtres par catégorie, prix et « stock bas », tri et pagination.
- **Alertes** de stock bas, avec seuil configurable par produit.
- **Ventes atomiques** : contrôle du stock, prix figé, total calculé par le serveur, lignes en double fusionnées.
- **Mouvements de stock** (entrée, sortie, ajustement) qui mettent à jour la quantité du produit.
- **Suppression protégée** : une catégorie ou un produit déjà utilisé ne peut pas être supprimé (réponse 409 claire).
- **Administration Django en français** ; les ventes et mouvements y sont en lecture seule pour préserver la cohérence du stock.
- **Initialisation en une commande** : groupes et compte administrateur par défaut.

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

- Angular (composants autonomes, signaux, formulaires réactifs, `HttpClient`)
- TypeScript, RxJS
- Tests unitaires : Karma / Jasmine

### Outils

`git`, `pip` + `venv`, `npm` + Angular CLI, `curl`, **Ruff** (lint) et **Pyright** (typage), configurés par `ruff.toml` et `pyrightconfig.json`. Développement possible sur mobile avec Termux.

## Structure du projet

```text
shop_management/
├── backend/
│   ├── core/                      # configuration Django
│   │   ├── asgi.py
│   │   ├── exceptions.py          # messages d'erreur JWT en français
│   │   ├── settings.py
│   │   ├── urls.py                # routes + authentification JWT
│   │   └── wsgi.py
│   ├── inventory/                 # application métier
│   │   ├── management/commands/
│   │   │   └── setup_defaults.py  # groupes + compte admin par défaut
│   │   ├── migrations/
│   │   ├── admin.py               # administration en français
│   │   ├── apps.py
│   │   ├── filters.py             # recherche et filtres produits
│   │   ├── models.py              # Category, Product, StockMovement, Sale, SaleItem
│   │   ├── permissions.py         # rôles Gestionnaire / Vendeur
│   │   ├── serializers.py
│   │   ├── services.py            # règles métier du stock
│   │   ├── tests.py
│   │   ├── urls.py
│   │   ├── validators.py
│   │   └── views.py
│   ├── .gitignore
│   └── manage.py
├── frontend/                      # Angular (squelette généré)
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.config.ts
│   │   │   ├── app.routes.ts
│   │   │   ├── app.html
│   │   │   ├── app.css
│   │   │   ├── app.spec.ts
│   │   │   └── app.ts
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css
│   ├── angular.json
│   ├── package.json
│   └── tsconfig*.json
├── requirements/
│   ├── base.txt                   # dépendances d'exécution
│   ├── dev.txt                    # développement (typage, audit)
│   └── prod.txt                   # production (gunicorn, PostgreSQL)
├── .env.example                   # modèle de configuration (sans secret)
├── .gitignore
├── LICENSE
├── pyrightconfig.json
├── ruff.toml
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
| `DJANGO_DEFAULT_ADMIN_USERNAME` | Nom du compte admin par défaut | `admin` |
| `DJANGO_DEFAULT_ADMIN_PASSWORD` | Mot de passe du compte admin (vide : généré aléatoirement) | *(optionnel)* |

Générer une clé secrète :

```bash
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

## Utilisation

### Premier lancement

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

## API

| Méthode | Endpoint | Description | Accès |
|---|---|---|---|
| POST | `/api/auth/token/` | Connexion (access + refresh), 5 essais par minute | Public (limité) |
| POST | `/api/auth/refresh/` | Nouveau jeton access | Refresh valide |
| POST | `/api/auth/logout/` | Invalide le refresh | Refresh valide |
| GET | `/api/auth/me/` | Nom et rôle de l'utilisateur connecté | Connecté |
| GET | `/api/products/` | Liste filtrée et paginée | Connecté |
| GET | `/api/products/low-stock/` | Produits sous le seuil | Connecté |
| POST | `/api/products/` | Créer un produit | Gestionnaire |
| PUT / PATCH / DELETE | `/api/products/<id>/` | Modifier / supprimer un produit | Gestionnaire |
| GET | `/api/categories/` | Liste des catégories | Connecté |
| POST / PUT / PATCH / DELETE | `/api/categories/` | Gestion des catégories | Gestionnaire |
| POST | `/api/sales/` | Enregistrer une vente | Connecté |
| GET | `/api/sales/` | Lister les ventes (les siennes ou toutes) | Connecté |
| GET / POST | `/api/movements/` | Historique et mouvements de stock | Gestionnaire |

Paramètres de filtrage des produits : `search`, `category`, `min_price`, `max_price`, `low_stock`, `is_active`, `ordering`, `page`.

Exemple de vente :

```bash
curl -X POST http://localhost:8000/api/sales/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product": 1, "quantity": 2}]}'
```

Mouvements de stock : `IN` (entrée, ajoute), `OUT` (sortie, retire et refuse si le stock est insuffisant), `ADJ` (ajustement : la quantité devient celle de l'inventaire).

## Tests et qualité du code

```bash
# Backend (ventes, stock, permissions, filtres, authentification, setup_defaults)
cd backend && python manage.py test

# Lint et typage (depuis la racine)
ruff check backend
pyright

# Frontend
cd frontend && npx ng test
```

## Sécurité

- Secrets en variables d'environnement, jamais dans le dépôt ; l'application refuse de démarrer sans `DJANGO_SECRET_KEY`.
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
- [ ] Interface Angular (connexion, tableau filtrable, formulaires, caisse)
- [ ] Tableau de bord des alertes
- [ ] Déploiement (PostgreSQL, Gunicorn, Nginx)

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
