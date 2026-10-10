import { Product, Sale } from '../app/models/inventory';

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
    items: [{ product: 1, quantity: 3, unit_price: '1.50' }],
    ...overrides,
  };
}

export function page<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}
