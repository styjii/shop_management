import { Routes } from '@angular/router';
import { authGuard, capabilityGuard, guestGuard, managerGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Créer un compte',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    title: 'Mot de passe oublié',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    title: 'Nouveau mot de passe',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Tableau de bord',
        loadComponent: () =>
          import('./features/dashboard/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'products',
        title: 'Produits',
        loadComponent: () =>
          import('./features/products/product-list/product-list').then((m) => m.ProductList),
      },
      {
        path: 'products/new',
        title: 'Nouveau produit',
        canActivate: [capabilityGuard('manage_catalog')],
        loadComponent: () =>
          import('./features/products/product-form/product-form').then((m) => m.ProductForm),
      },
      {
        path: 'products/:id/edit',
        title: 'Modifier le produit',
        canActivate: [capabilityGuard('manage_catalog')],
        loadComponent: () =>
          import('./features/products/product-form/product-form').then((m) => m.ProductForm),
      },
      {
        path: 'sales',
        title: 'Caisse',
        loadComponent: () => import('./features/sales/sale-pos/sale-pos').then((m) => m.SalePos),
      },
      {
        path: 'sales/history',
        title: 'Historique des ventes',
        loadComponent: () =>
          import('./features/sales/sale-history/sale-history').then((m) => m.SaleHistory),
      },
      {
        path: 'categories',
        title: 'Catégories',
        canActivate: [capabilityGuard('manage_catalog')],
        loadComponent: () =>
          import('./features/categories/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'account',
        title: 'Mon compte',
        loadComponent: () => import('./features/account/account/account').then((m) => m.Account),
      },
      {
        path: 'users',
        title: 'Utilisateurs',
        canActivate: [managerGuard],
        loadComponent: () => import('./features/users/users/users').then((m) => m.Users),
      },
      {
        path: 'movements',
        title: 'Mouvements de stock',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/movements/movements/movements').then((m) => m.Movements),
      },
      {
        path: 'stats',
        title: 'Statistiques de ventes',
        loadComponent: () =>
          import('./features/stats/sales-stats/sales-stats').then((m) => m.SalesStatsPage),
      },
      {
        path: 'products/labels',
        title: 'Étiquettes de codes-barres',
        canActivate: [capabilityGuard('manage_catalog')],
        loadComponent: () =>
          import('./features/products/product-labels/product-labels').then((m) => m.ProductLabels),
      },
      {
        path: 'suppliers',
        title: 'Fournisseurs',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/suppliers/suppliers/suppliers').then((m) => m.Suppliers),
      },
      {
        path: 'purchase-orders',
        title: 'Bons de commande',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/purchase-orders/purchase-order-list/purchase-order-list').then(
            (m) => m.PurchaseOrderList,
          ),
      },
      {
        path: 'purchase-orders/new',
        title: 'Nouveau bon de commande',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/purchase-orders/purchase-order-form/purchase-order-form').then(
            (m) => m.PurchaseOrderForm,
          ),
      },
      {
        path: 'purchase-orders/:id/edit',
        title: 'Modifier le bon de commande',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/purchase-orders/purchase-order-form/purchase-order-form').then(
            (m) => m.PurchaseOrderForm,
          ),
      },
      {
        path: 'purchase-orders/:id',
        title: 'Bon de commande',
        canActivate: [capabilityGuard('manage_stock')],
        loadComponent: () =>
          import('./features/purchase-orders/purchase-order-detail/purchase-order-detail').then(
            (m) => m.PurchaseOrderDetail,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
