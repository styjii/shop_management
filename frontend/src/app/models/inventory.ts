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
  /** EAN-8, UPC-A or EAN-13; null when the product has none. */
  barcode: string | null;
  supplier: number | null;
  supplier_name: string | null;
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
  barcode: string;
  supplier: number | null;
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
  {
    value: 'ADJ',
    label: 'Ajustement',
    hint: 'Remplace le stock par la quantité comptée (0 permis).',
  },
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

export interface Supplier {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  is_active: boolean;
}

export type SupplierPayload = Omit<Supplier, 'id'>;

export type OrderStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';

export const ORDER_STATUSES: { value: OrderStatus; label: string; badge: string }[] = [
  { value: 'DRAFT', label: 'Brouillon', badge: 'badge-ghost' },
  { value: 'SENT', label: 'Envoyé', badge: 'badge-info' },
  { value: 'RECEIVED', label: 'Reçu', badge: 'badge-success' },
  { value: 'CANCELLED', label: 'Annulé', badge: 'badge-error' },
];

export interface PurchaseOrderLine {
  product: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_cost: string;
  line_total: string;
}

export interface PurchaseOrder {
  id: number;
  reference: string;
  supplier: number;
  supplier_name: string;
  status: OrderStatus;
  expected_date: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  received_at: string | null;
  total: string;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderPayload {
  supplier: number;
  expected_date: string | null;
  notes: string;
  lines: { product: number; quantity: number; unit_cost: number }[];
}

export interface SalesStats {
  days: number;
  from: string;
  to: string;
  totals: {
    revenue: string;
    sales_count: number;
    items_sold: number;
    average_basket: string;
  };
  daily: { date: string; revenue: string; sales_count: number }[];
  top_products: { product: number; name: string; quantity: number; revenue: string }[];
  by_category: { category: string; revenue: string }[];
}
