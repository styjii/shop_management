import {
  AppUser,
  CurrentUser,
  Product,
  PurchaseOrder,
  Sale,
  SalesStats,
  StockMovement,
  Supplier,
} from '../app/models/inventory';

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
    barcode: null,
    supplier: null,
    supplier_name: null,
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

export function makeCurrentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    username: 'vendeur',
    email: 'vendeur@example.com',
    first_name: '',
    last_name: '',
    role: 'seller',
    is_manager: false,
    capabilities: [],
    ...overrides,
  };
}

export function makeManager(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return makeCurrentUser({
    username: 'chef',
    email: 'chef@example.com',
    role: 'manager',
    is_manager: true,
    capabilities: ['manage_catalog', 'manage_stock', 'view_all_sales'],
    ...overrides,
  });
}

export function makeAppUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 2,
    username: 'vendeur',
    email: 'vendeur@example.com',
    first_name: 'Léa',
    last_name: 'Martin',
    role: 'seller',
    capabilities: [],
    is_active: true,
    status: 'active',
    is_protected: false,
    last_login: '2026-10-08T08:00:00Z',
    date_joined: '2026-09-01T08:00:00Z',
    ...overrides,
  };
}

export function page<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}

export function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 1,
    name: 'Boissons SA',
    contact_name: 'Jeanne Durand',
    email: 'contact@boissons.example',
    phone: '0102030405',
    address: '1 rue des Fleurs',
    notes: '',
    is_active: true,
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 7,
    reference: 'BC-00007',
    supplier: 1,
    supplier_name: 'Boissons SA',
    status: 'DRAFT',
    expected_date: '2026-11-01',
    notes: '',
    created_by: 'chef',
    created_at: '2026-10-09T09:00:00Z',
    received_at: null,
    total: '16.00',
    lines: [
      {
        product: 1,
        product_name: 'Eau minérale',
        product_sku: 'WATER-1',
        quantity: 20,
        unit_cost: '0.80',
        line_total: '16.00',
      },
    ],
    ...overrides,
  };
}

export function makeStats(overrides: Partial<SalesStats> = {}): SalesStats {
  return {
    days: 7,
    from: '2026-10-06',
    to: '2026-10-12',
    totals: { revenue: '12.00', sales_count: 3, items_sold: 8, average_basket: '4.00' },
    daily: [
      { date: '2026-10-11', revenue: '0.00', sales_count: 0 },
      { date: '2026-10-12', revenue: '12.00', sales_count: 3 },
    ],
    top_products: [
      { product: 1, name: 'Eau minérale', quantity: 6, revenue: '9.00' },
      { product: 2, name: 'Jus', quantity: 1, revenue: '3.00' },
    ],
    by_category: [{ category: 'Boissons', revenue: '12.00' }],
    ...overrides,
  };
}
