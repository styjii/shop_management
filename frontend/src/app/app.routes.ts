import { Routes } from '@angular/router';
import { authGuard, guestGuard, managerGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
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
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./features/products/product-form/product-form').then((m) => m.ProductForm),
      },
      {
        path: 'products/:id/edit',
        title: 'Modifier le produit',
        canActivate: [managerGuard],
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
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./features/categories/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'movements',
        title: 'Mouvements de stock',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./features/movements/movements/movements').then((m) => m.Movements),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
