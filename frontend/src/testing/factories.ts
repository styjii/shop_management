import { Product, Sale, StockMovement } from '../app/models/inventory';

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'WATER-1',
    name: 'Eau minérale',
    category: 1,
    category_name: 'Boissons',
    price: '1.50',
    quantity: 10,
    low_stock_threshold: 5,
    is_low_stock: false,
    image: null,
    is_active: true,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    seller: 'vendeur',
    created_at: '2026-10-09T10:00:00Z',
    total: '4.50',
    items: [{ product: 1, product_name: 'Eau minérale', quantity: 3, unit_price: '1.50' }],
    ...overrides,
  };
}

export function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 1,
    product: 1,
    product_name: 'Eau minérale',
    kind: 'IN',
    quantity: 10,
    reason: 'Livraison',
    created_by: 'chef',
    created_at: '2026-10-09T09:00:00Z',
    ...overrides,
  };
}

export function page<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}
