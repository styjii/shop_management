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
- [Tests](#tests)
- [Sécurité](#sécurité)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)
- [Auteur](#auteur)

## À propos

**Shop Management** est une application web complète de type Mini-ERP. Elle reproduit les briques que l'on retrouve dans les logiciels d'entreprise : authentification, rôles, base relationnelle, formulaires dynamiques et tableaux filtrables.

- **Backend** : API REST avec Django et Django REST Framework, base SQL.
- **Frontend** : application monopage Angular.

## Fonctionnalités

- Authentification par jetons **JWT** (access + refresh, rotation et liste noire).
- Rôles **Gestionnaire** et **Vendeur** (groupes Django).
- CRUD des **produits** et des **catégories** (SKU unique, prix, quantité, image).
- **Tableau filtrable** : recherche par nom ou SKU, filtres par catégorie et prix, filtre « stock bas », tri et pagination.
- **Alertes** de stock bas, avec seuil configurable par produit.
- **Ventes** atomiques : contrôle du stock, prix figé, total calculé par le serveur.
- **Historique** des mouvements de stock (entrée, sortie, ajustement).

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

`git`, `pip` + `venv`, `npm` + Angular CLI, `tree`, `curl`. Développement possible sur mobile avec Termux.

## Structure du projet

```text
shop_management/
├── backend/
│   ├── core/                  # configuration Django
│   │   ├── asgi.py
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── inventory/             # application métier (à créer)
│   ├── .gitignore
│   └── manage.py
├── frontend/
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
│   ├── base.txt               # dépendances d'exécution
│   ├── dev.txt                # développement (typage, audit)
│   └── prod.txt               # production (gunicorn, PostgreSQL)
├── .env.example               # modèle de configuration (sans secret)
├── .gitignore
├── LICENSE
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
| `DJANGO_SECRET_KEY` | Clé secrète Django | *(à générer)* |
| `DJANGO_DEBUG` | `1` en développement, `0` en production | `1` |
| `DJANGO_ALLOWED_HOSTS` | Hôtes autorisés, séparés par des virgules | `localhost,127.0.0.1` |
| `CORS_ALLOWED_ORIGINS` | Origines autorisées pour le frontend | `http://localhost:4200` |

Générer une clé secrète :

```bash
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

## Utilisation

```bash
# Terminal 1 : backend (http://localhost:8000)
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# Terminal 2 : frontend (http://localhost:4200)
cd frontend
npx ng serve
```

Créez ensuite les groupes `Gestionnaire` et `Vendeur` depuis l'administration (`/admin/`) et affectez-y vos utilisateurs.

## API

| Méthode | Endpoint | Description | Accès |
|---|---|---|---|
| POST | `/api/auth/token/` | Connexion (access + refresh) | Public (limité) |
| POST | `/api/auth/refresh/` | Nouveau jeton access | Refresh valide |
| POST | `/api/auth/logout/` | Invalide le refresh | Connecté |
| GET | `/api/products/` | Liste filtrée et paginée | Connecté |
| GET | `/api/products/low-stock/` | Produits sous le seuil | Connecté |
| POST / PUT / DELETE | `/api/products/` | Gestion des produits | Gestionnaire |
| GET / POST | `/api/categories/` | Catégories | Lecture : connecté, écriture : gestionnaire |
| POST / GET | `/api/sales/` | Enregistrer / lister les ventes | Connecté |
| GET | `/api/movements/` | Historique du stock | Gestionnaire |

Paramètres de filtrage des produits : `search`, `category`, `min_price`, `max_price`, `low_stock`, `is_active`, `ordering`, `page`.

## Tests

```bash
# Backend
cd backend && python manage.py test

# Frontend
cd frontend && npx ng test
```

## Sécurité

- Secrets en variables d'environnement, jamais dans le dépôt.
- Jetons access courts (15 min), refresh avec rotation et liste noire.
- Limitation du débit sur la connexion.
- Authentification obligatoire par défaut et permissions par rôle.
- Liste blanche CORS, HTTPS et en-têtes de sécurité en production.
- Audit régulier :

```bash
python manage.py check --deploy
pip-audit -r requirements/base.txt
cd frontend && npm audit
```

## Feuille de route

- [x] Squelette Django et Angular
- [x] Séparation des dépendances (`base`, `dev`, `prod`)
- [ ] Modèles et API catalogue (produits, catégories)
- [ ] Authentification JWT et rôles
- [ ] Ventes et mouvements de stock
- [ ] Interface Angular (tableau filtrable, formulaires, caisse)
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
