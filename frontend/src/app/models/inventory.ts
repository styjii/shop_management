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

export interface CurrentUser {
  username: string;
  is_manager: boolean;
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
