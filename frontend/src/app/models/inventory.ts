export interface Category {
  id: number;
  name: string;
  description: string;
}

export interface CategoryPayload {
  name: string;
  description?: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: number;
  category_name: string;
  price: string; // DRF serializes decimals as strings
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  image: string | null;
  is_active: boolean;
}

export interface ProductPayload {
  sku: string;
  name: string;
  category: number | null;
  price: number;
  quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SaleLine {
  product: number;
  quantity: number;
}

export interface SaleItem extends SaleLine {
  product_name: string;
  unit_price: string;
}

export interface Sale {
  id: number;
  seller: string;
  created_at: string;
  total: string;
  items: SaleItem[];
}

export type Role = 'manager' | 'seller';

export type Capability = 'manage_catalog' | 'manage_stock' | 'view_all_sales';

/** Individual rights a manager can grant to a seller, on top of the role. */
export const CAPABILITIES: { value: Capability; label: string; hint: string }[] = [
  {
    value: 'manage_catalog',
    label: 'Gérer le catalogue',
    hint: 'Créer, modifier et supprimer produits et catégories.',
  },
  {
    value: 'manage_stock',
    label: 'Gérer le stock',
    hint: 'Enregistrer des entrées, sorties et ajustements.',
  },
  {
    value: 'view_all_sales',
    label: 'Voir toutes les ventes',
    hint: 'Consulter les ventes des autres vendeurs.',
  },
];

export interface CurrentUser {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role | null;
  is_manager: boolean;
  /** Effective rights: every right for a manager, the granted ones for a seller. */
  capabilities: Capability[];
}

export interface ProfilePayload {
  email: string;
  first_name: string;
  last_name: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export type UserStatus = 'pending' | 'active' | 'inactive';

export interface AppUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role | null;
  /** Rights granted individually (always empty for a manager). */
  capabilities: Capability[];
  is_active: boolean;
  status: UserStatus;
  /** Superusers cannot be changed from the application. */
  is_protected: boolean;
  last_login: string | null;
  date_joined: string;
}

export interface UserPayload {
  username?: string;
  email: string;
  first_name: string;
  last_name: string;
  password?: string;
  role: Role | null;
  capabilities: Capability[];
  is_active: boolean;
}

export type MovementKind = 'IN' | 'OUT' | 'ADJ';

export const MOVEMENT_KINDS: { value: MovementKind; label: string; hint: string }[] = [
  { value: 'IN', label: 'Entrée', hint: 'Ajoute des unités au stock (livraison, retour).' },
  { value: 'OUT', label: 'Sortie', hint: 'Retire des unités du stock (casse, perte, don).' },
  { value: 'ADJ', label: 'Ajustement', hint: 'Remplace le stock par la quantité comptée.' },
];

export interface StockMovement {
  id: number;
  product: number;
  product_name: string;
  kind: MovementKind;
  quantity: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface MovementPayload {
  product: number;
  kind: MovementKind;
  quantity: number;
  reason: string;
}
