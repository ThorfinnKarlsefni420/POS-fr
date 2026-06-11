import { useAuthStore } from '@/features/auth/store/use-auth-store';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

async function buildHeaders(overrideStoreId?: string) {
  const user = useAuthStore.getState().user;
  return {
    'Content-Type': 'application/json',
    ...(user?.id ? { 'X-User-Id': user.id } : {}),
    ...(overrideStoreId
      ? { 'X-Store-Id': overrideStoreId }
      : user?.role !== 'SUPERADMIN' && user?.storeId
        ? { 'X-Store-Id': user.storeId }
        : {}),
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: await buildHeaders(),
    ...init,
  });
  if (!res.ok) {
    let msg = `API ${res.status}: ${path}`;
    try {
      const body = await res.clone().json();
      if (body?.error) msg = body.error;
    } catch { /* ignore parse errors */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function reqForStore<T>(path: string, storeId: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: await buildHeaders(storeId),
    ...init,
  });
  if (!res.ok) {
    let msg = `API ${res.status}: ${path}`;
    try {
      const body = await res.clone().json();
      if (body?.error) msg = body.error;
    } catch { /* ignore parse errors */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface ApiUser {
  id: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
  storeId?: string | null;
}

export interface ApiStore {
  id: string;
  name: string;
  slug: string;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreStats {
  storeId: string;
  revenueToday: number;
  revenueWeek: number;
  transactionsToday: number;
  activeShifts: number;
  topProduct: string | null;
}

export interface SuperAdminDashboard {
  summary: {
    totalRevenueToday: number;
    totalTransactionsToday: number;
    activeStores: number;
    totalStores: number;
    activeShifts: number;
  };
  stores: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    revenueToday: number;
    revenueWeek: number;
    transactionsToday: number;
    activeShifts: number;
    topProduct: string | null;
  }>;
}

export interface ApiShift {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string | null;
  startingCash: string | number;
  endingCash?: string | number | null;
  actualCash?: string | number | null;
  cashLogs: Array<{
    id: string;
    amount: string | number;
    type: 'PAY_IN' | 'PAY_OUT';
    reason: string;
    createdAt: string;
  }>;
}

export const api = {
  users: {
    list: () => req<ApiUser[]>('/users'),
    create: (data: { name: string; pin: string; role?: string; storeId?: string }) =>
      req<ApiUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; pin?: string; role?: string; storeId?: string | null }) =>
      req<ApiUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
    verify: (userId: string, pin: string) =>
      req<ApiUser>('/users/verify', { method: 'POST', body: JSON.stringify({ userId, pin }) }),
    verifyAdmin: (pin: string) =>
      req<ApiUser>('/users/verify-admin', { method: 'POST', body: JSON.stringify({ pin }) }),
  },
  shifts: {
    current: (userId?: string | null) =>
      req<ApiShift | null>(`/shifts/current${userId ? `?userId=${userId}` : ''}`),
    start: (userId: string, startingCash: number, storeId?: string) =>
      req<ApiShift>('/shifts', { method: 'POST', body: JSON.stringify({ userId, startingCash, storeId }) }),
    addCashLog: (shiftId: string, data: { amount: number; type: 'PAY_IN' | 'PAY_OUT'; reason: string }) =>
      req<{ id: string }>(`/shifts/${shiftId}/cashlog`, { method: 'POST', body: JSON.stringify(data) }),
    close: (shiftId: string, actualCash: number) =>
      req<{ expectedCash: number; variance: number }>(`/shifts/${shiftId}/close`, { method: 'POST', body: JSON.stringify({ actualCash }) }),
  },
  products: {
    list: () => req<ApiItem[]>('/products'),
    create: (data: Partial<ApiItem>) =>
      req<ApiItem>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiItem>) =>
      req<ApiItem>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    vatPending: () => req<VatPendingItem[]>('/products/vat-pending'),
    expiring: (days = 30) => req<ExpiringProduct[]>(`/products/expiring?days=${days}`),
    confirmVatClass: (id: string, vatClassId: string, vatOverrideReason: string) =>
      req<ApiItem>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ vatClassId, vatOverrideReason, needsVatConfirmation: false }),
      }),
    import: (products: ApiItem[], replace: boolean) =>
      req<{ succeeded: number; failed: number; firstErrors?: string[] }>('/products/import', {
        method: 'POST',
        body: JSON.stringify({ products, replace }),
      }),
    replaceTiers: (
      itemId: string,
      tiers: Array<{ name: string; qtyInBase: number; costPrice: number; sellingPrice?: number | null; barcode?: string | null }>,
    ) => req<{ ok: boolean }>(`/products/tiers/${itemId}`, { method: 'PUT', body: JSON.stringify({ tiers }) }),
    bulkTiers: (rows: Array<{ sku: string; tierName: string; qtyInBase: number; costPrice: number; sellingPrice?: number | null; barcode?: string | null }>) =>
      req<{ results: Array<{ sku: string; status: 'ok' | 'skipped'; tiersApplied?: number; reason?: string }> }>('/products/tiers/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }),
    breakdown: (sourceId: string, sourceQty: number, targetId: string, unitsPerSource: number, notes?: string) =>
      req<{ sourceDeducted: number; targetAdded: number }>('/products/breakdown', {
        method: 'POST',
        body: JSON.stringify({ sourceId, sourceQty, targetId, unitsPerSource, notes }),
      }),
    adjustStock: (id: string, delta: number, reasonCode = 'RESTOCK', note?: string, tierId?: string) =>
      req<ApiItem>(`/products/${id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, reasonCode, note, tierId }),
      }),
    bulkImage: (ids: string[], imageUrl: string) =>
      req<{ updated: number }>('/products/bulk-image', {
        method: 'POST',
        body: JSON.stringify({ ids, imageUrl }),
      }),
    listTiers: (itemId: string) =>
      req<ApiPackagingTier[]>(`/products/${itemId}/packaging`),
    createTier: (itemId: string, data: Partial<ApiPackagingTier>) =>
      req<ApiPackagingTier>(`/products/${itemId}/packaging`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTier: (itemId: string, tierId: string, data: Partial<ApiPackagingTier>) =>
      req<ApiPackagingTier>(`/products/${itemId}/packaging/${tierId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteTier: (itemId: string, tierId: string) =>
      req<{ ok: boolean }>(`/products/${itemId}/packaging/${tierId}`, { method: 'DELETE' }),
    history: (itemId: string) =>
      req<ItemHistory>(`/products/${itemId}/history`),
  },
  settings: {
    get: () => req<ApiSettings>('/settings'),
    save: (data: Partial<ApiSettings>) =>
      req<{ ok: boolean }>('/settings', { method: 'POST', body: JSON.stringify(data) }),
  },
  reports: {
    sales: (from: string, to: string) => req<SalesReport>(`/reports/sales?from=${from}&to=${to}`),
    shifts: (from: string, to: string) => req<ShiftsReport>(`/reports/shifts?from=${from}&to=${to}`),
    inventory: () => req<InventoryReport>('/reports/inventory'),
    vat: (from: string, to: string) => req<VatReport>(`/reports/vat?from=${from}&to=${to}`),
    profit: (from: string, to: string) => req<ProfitReport>(`/reports/profit?from=${from}&to=${to}`),
    exportCsv: async (endpoint: string, filename: string) => {
      const user = useAuthStore.getState().user;
      const headers: Record<string, string> = {};
      if (user?.id) headers['X-User-Id'] = user.id;
      if (user?.storeId) headers['X-Store-Id'] = user.storeId;
      const res = await fetch(`${BASE}${endpoint}`, { headers });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  transactions: {
    create: (payload: CreateTransactionPayload) =>
      req<TransactionResult>('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
    list: () => req<ApiTransaction[]>('/transactions'),
    refund: (id: string, items: Array<{ lineItemId: string; isDamaged: boolean }>) =>
      req<{ ok: boolean }>(`/transactions/${id}/refund`, { method: 'POST', body: JSON.stringify({ items }) }),
    void: (id: string) =>
      req<ApiTransaction>(`/transactions/${id}/void`, { method: 'DELETE' }),
  },
  stores: {
    list: () => req<ApiStore[]>('/stores'),
    create: (data: { name: string; slug: string; ownerName?: string; phone?: string; email?: string; address?: string }) =>
      req<ApiStore>('/stores', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiStore>) =>
      req<ApiStore>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    stats: (id: string) => req<StoreStats>(`/stores/${id}/stats`),
  },
  locations: {
    list: () => req<StockLocation[]>('/locations'),
    create: (data: { name: string; type?: LocationType; description?: string }) =>
      req<StockLocation>('/locations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<StockLocation, 'name' | 'type' | 'description' | 'isActive'>>) =>
      req<StockLocation>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deactivate: (id: string) =>
      req<{ ok: boolean }>(`/locations/${id}`, { method: 'DELETE' }),
    getItemStock: (itemId: string) =>
      req<ItemStockBreakdown>(`/locations/item/${itemId}`),
    transfer: (itemId: string, payload: TransferPayload) =>
      req<{ ok: boolean; totalStock: number; locations: ItemLocationStock[] }>(
        `/locations/item/${itemId}/transfer`,
        { method: 'POST', body: JSON.stringify(payload) }
      ),
    transfers: (params?: { itemId?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.itemId) qs.set('itemId', params.itemId);
      if (params?.limit) qs.set('limit', String(params.limit));
      const q = qs.toString();
      return req<StockTransferRecord[]>(`/locations/transfers${q ? `?${q}` : ''}`);
    },
    replenishment: () => req<ReplenishmentAlert[]>('/locations/replenishment'),
  },
  integrations: {
    list: () => req<Integration[]>('/integrations'),
    create: (data: Partial<Integration> & { name: string; type: IntegrationType }) =>
      req<Integration>('/integrations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Integration>) =>
      req<Integration>(`/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) =>
      req<{ ok: boolean }>(`/integrations/${id}`, { method: 'DELETE' }),
    logs: (id: string) => req<SyncLog[]>(`/integrations/${id}/logs`),
    sync: (id: string, payload: { rows?: Record<string, unknown>[]; csvText?: string }) =>
      req<{ ok: boolean; result: { rowsProcessed: number; rowsSucceeded: number; rowsFailed: number; errors: string[] }; log: SyncLog }>(
        `/integrations/${id}/sync`,
        { method: 'POST', body: JSON.stringify(payload) }
      ),
  },
  purchaseOrders: {
    list: (status?: string) => req<ApiPO[]>(`/purchase-orders${status ? `?status=${status}` : ''}`),
    create: (data: { referenceNo?: string; vendorName?: string; expectedAt?: string; notes?: string; lines: ApiPOLineInput[] }) =>
      req<ApiPODetail>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => req<ApiPODetail>(`/purchase-orders/${id}`),
    update: (id: string, data: Partial<{ referenceNo: string; vendorName: string; expectedAt: string | null; notes: string; status: string }>) =>
      req<ApiPODetail>(`/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    receive: (id: string, lines: Array<{ lineId: string; receivedQty: number }>, notes?: string) =>
      req<ApiPODetail>(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ lines, notes }) }),
  },
  promos: {
    list: (activeOnly?: boolean) => req<ApiPromo[]>(`/promos${activeOnly ? '?active=true' : ''}`),
    create: (data: ApiPromoInput) => req<ApiPromo>('/promos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiPromoInput & { isActive: boolean }>) =>
      req<ApiPromo>(`/promos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/promos/${id}`, { method: 'DELETE' }),
    apply: (lines: Array<{ itemId: string; category: string; quantity: number; price: number }>, cartTotal: number) =>
      req<ApiPromoResult[]>('/promos/apply', { method: 'POST', body: JSON.stringify({ lines, cartTotal }) }),
  },
  customers: {
    list: (q?: string) => req<ApiCustomer[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    search: (q: string) => req<ApiCustomer[]>(`/customers/search?q=${encodeURIComponent(q)}`),
    create: (data: { name: string; phone?: string; email?: string; creditLimit?: number }) =>
      req<ApiCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; phone: string; email: string; creditLimit: number }>) =>
      req<ApiCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    get: (id: string) => req<ApiCustomer>(`/customers/${id}`),
    overdue: () => req<unknown[]>('/customers/overdue'),
    recordPayment: (customerId: string, data: { mkopoSaleId: string; amount: number; method: 'CASH' | 'MPESA' | 'BANK_TRANSFER'; recordedById: string; note?: string }) =>
      req<{ ok: boolean }>(`/customers/${customerId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  },
  superadmin: {
    dashboard: () => req<SuperAdminDashboard>('/superadmin/dashboard'),
    inventory: (params?: { storeId?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.storeId) qs.set('storeId', params.storeId);
      if (params?.search) qs.set('search', params.search);
      const q = qs.toString();
      return req<SuperAdminInventoryItem[]>(`/superadmin/inventory${q ? `?${q}` : ''}`);
    },
    getGlobalSettings: () => req<GlobalSettings>('/superadmin/settings'),
    saveGlobalSettings: (data: Partial<GlobalSettings>) =>
      req<{ ok: boolean }>('/superadmin/settings', { method: 'POST', body: JSON.stringify(data) }),
    recalculatePrices: () =>
      req<{ updated: number; markupPercent: number }>('/superadmin/recalculate-prices', { method: 'POST' }),
    setVendorPrices: (markupPercent: number, roundTo: number, onlyUnset: boolean) =>
      req<{ updated: number }>('/superadmin/set-vendor-prices', {
        method: 'POST',
        body: JSON.stringify({ markupPercent, roundTo, onlyUnset }),
      }),
    importForStore: (storeId: string, products: Partial<ApiItem>[], replace: boolean) =>
      reqForStore<{ succeeded: number; failed: number }>('/products/import', storeId, {
        method: 'POST',
        body: JSON.stringify({ products, replace }),
      }),
    broadcastImage: (name: string, imageUrl: string) =>
      req<{ updated: number }>('/superadmin/broadcast-image', {
        method: 'POST',
        body: JSON.stringify({ name, imageUrl }),
      }),
    pendingConsignment: () => req<any>('/superadmin/consignment/pending'),
  },
  suppliers: {
    list: () => req<ApiSupplier[]>('/suppliers'),
    create: (data: Partial<ApiSupplier>) =>
      req<ApiSupplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ApiSupplier>) =>
      req<ApiSupplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),
    getMe: () => req<ApiSupplier & { items: ApiItem[]; consignmentSales: any[]; settlements: ApiSettlement[] }>('/suppliers/me'),
  },
  consignment: {
    pending: () => req<PendingConsignment[]>('/consignment/pending'),
    listSettlements: () => req<ApiSettlement[]>('/consignment/settlements'),
    settle: (supplierId: string, saleIds: string[]) =>
      req<ApiSettlement>('/consignment/settle', {
        method: 'POST',
        body: JSON.stringify({ supplierId, saleIds }),
      }),
    paySettlement: (id: string) =>
      req<ApiSettlement>(`/consignment/settlements/${id}/pay`, { method: 'PATCH' }),
  },
};

export interface ApiSupplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  isConsignment: boolean;
  defaultType: 'FIXED_COST' | 'PERCENTAGE_COMMISSION';
  defaultRate: number;
  createdAt: string;
}

export interface PendingConsignment {
  supplier: ApiSupplier;
  supplierId: string;
  sales: Array<{
    id: string;
    lineItemId: string;
    supplierId: string;
    payoutAmount: number | string;
    status: string;
    createdAt: string;
    lineItem?: {
      item?: { name: string };
    };
  }>;
  totalPayout: number;
}

export interface ApiSettlement {
  id: string;
  supplierId: string;
  supplier?: ApiSupplier;
  store?: { name: string };
  totalAmount: number;
  supplierAmount: number;
  superadminAmount: number;
  status: 'UNPAID' | 'PAID';
  paidAt?: string | null;
  createdAt: string;
}


export interface ItemHistory {
  adjustments: {
    id: string;
    quantity: number;
    reasonCode: string;
    note: string | null;
    createdAt: string;
  }[];
  transfers: {
    id: string;
    from: string;
    to: string;
    quantityBase: number;
    tierName: string | null;
    quantityInTier: number | null;
    reason: string | null;
    createdAt: string;
  }[];
}

export interface ApiPackagingTier {
  id: string;
  name: string;
  level: number;
  quantityInBase: string | number;
  costPrice: string | number;
  sellingPriceOverride?: string | number | null;
  barcode?: string | null;
  isBaseUnit: boolean;
  roundingPrecision?: string | number;
}

export interface ApiItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  unit: string;
  boxQty: string;
  costPrice: string | number;
  sellingPrice: string | number;
  nomadBitePrice: string | number;
  taxRate: string | number;
  etimsCode?: string;           // 'VAT' | 'ZERO' | 'NONTAXABLE' — resolved server-side from VatClass
  vatClassId?: string | null;
  needsVatConfirmation?: boolean;
  isFractional: boolean;
  currentStock: string | number;
  description?: string;
  notes?: string;
  imageUrl?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  packagingTiers?: ApiPackagingTier[];
}

// ── Multi-Location Stock Types ────────────────────────────────────────────────

export type LocationType = 'WAREHOUSE' | 'SHELF' | 'DISPLAY' | 'TRANSIT' | 'OTHER';

export interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  description?: string | null;
  isActive: boolean;
  itemCount: number;
  totalUnits: number;
  createdAt: string;
}

export interface ItemLocationStock {
  id: string;
  locationId: string;
  locationName: string;
  locationType: LocationType;
  locationActive: boolean;
  quantity: number;
}

export interface ItemStockBreakdown {
  itemId: string;
  totalStock: number;
  unallocated: number;
  locations: ItemLocationStock[];
}

export interface StockTransferRecord {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  from: string;
  to: string;
  quantityBase: number;
  tierName: string | null;
  quantityInTier: number | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface TransferPayload {
  fromLocationId?: string | null;
  toLocationId?: string | null;
  quantity: number;
  tierId?: string;
  reason?: string;
  notes?: string;
}

export interface ReplenishmentAlert {
  itemId: string;
  itemName: string;
  itemSku: string;
  packagingTiers: { id: string; name: string; quantityInBase: number }[];
  warehouseQty: number;
  warehouseLocations: { id: string; name: string; qty: number }[];
  shelfQty: number;
  shelfLocations: { id: string; name: string; type: string; qty: number }[];
}

// ─── Warehouse Integration types ──────────────────────────────────────────────

export type IntegrationType = 'CSV' | 'WEBHOOK' | 'REST_API' | 'ODOO' | 'QUICKBOOKS' | 'SAGE' | 'DYNAMICS_365';
export type SyncDirection = 'INBOUND' | 'OUTBOUND';
export type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface FieldMapping {
  externalField: string;
  internalField: 'sku' | 'name' | 'currentStock' | 'costPrice' | 'sellingPrice' | 'category' | 'unit';
  stockMode?: 'SET' | 'ADD';
}

export interface Integration {
  id: string;
  name: string;
  type: IntegrationType;
  syncDirection: SyncDirection;
  isActive: boolean;
  lastSyncAt: string | null;
  webhookSecret: string | null;
  credentials: Record<string, string>;
  fieldMappings: FieldMapping[];
  syncCount: number;
  createdAt: string;
}

export interface SyncLog {
  id: string;
  integrationId: string;
  status: SyncStatus;
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errorMessage: string | null;
  details: { errors: string[] } | null;
  createdAt: string;
}

export interface SuperAdminInventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  nomadBitePrice: number;
  taxRate: number;
  currentStock: number;
  storeId: string;
  storeName: string;
  imageUrl?: string | null;
  storeCount: number;
}

export interface GlobalSettings {
  globalMarkupPercent: number;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
}

export interface ApiSettings {
  serviceFeePercent: number;
  storeName: string;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
}

export interface ApiPO {
  id: string;
  referenceNo?: string | null;
  vendorName?: string | null;
  status: 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  expectedAt?: string | null;
  notes?: string | null;
  lineCount: number;
  totalCost: number;
  receivedPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPOLine {
  id: string;
  itemId: string;
  tierId?: string | null;
  orderedQty: string | number;
  receivedQty: string | number;
  unitCost: string | number;
  notes?: string | null;
  item: { id: string; name: string; sku: string; unit: string; costPrice: string | number };
}

export interface ApiPODetail extends Omit<ApiPO, 'lineCount' | 'totalCost' | 'receivedPct'> {
  lines: ApiPOLine[];
}

export interface ApiPOLineInput {
  itemId: string;
  tierId?: string;
  orderedQty: number;
  unitCost: number;
  notes?: string;
}

export type PromoType = 'PERCENT_OFF' | 'FIXED_OFF' | 'BOGO';
export type PromoScope = 'ALL' | 'CATEGORY' | 'ITEM';

export interface ApiPromo {
  id: string;
  name: string;
  type: PromoType;
  value: string | number;
  scope: PromoScope;
  categoryName?: string | null;
  itemId?: string | null;
  item?: { id: string; name: string; sku: string } | null;
  minQty: number;
  minAmount: string | number;
  buyQty?: number | null;
  getQty?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ApiPromoInput {
  name: string;
  type: PromoType;
  value: number;
  scope?: PromoScope;
  categoryName?: string;
  itemId?: string;
  minQty?: number;
  minAmount?: number;
  buyQty?: number;
  getQty?: number;
  startDate?: string;
  endDate?: string;
}

export interface ApiPromoResult {
  promoId: string;
  promoName: string;
  type: PromoType;
  appliedToLineIndex: number;
  discountedPrice: number;
  saving: number;
}

export interface ApiCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimit: string | number;
  totalSales?: number;
  outstandingBalance?: number;
}

export interface CreateTransactionPayload {
  items: Array<{ id: string; quantity: number; originalPrice: number; soldPrice: number; discountReason?: string }>;
  totalAmount: number;
  taxAmount: number;
  paymentType: 'CASH' | 'CARD' | 'MPESA' | 'MKOPO' | 'SPLIT';
  userId?: string;
  shiftId?: string;
  customerId?: string;
  dueDate?: string;
  payments?: Array<{ method: string; amount: number }>;
  splitChange?: number;
}

export interface ExpiringProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: number;
  expiryDate: string;
  daysLeft: number;
  status: 'EXPIRED' | 'CRITICAL' | 'WARNING';
}

export interface TransactionResult {
  id: string;
  stockDiscrepancies: Array<{ id: string; name: string; available: number; requested: number }>;
  negativeStockItems: Array<{ id: string; name: string; stock: number }>;
  lineItems?: Array<{
    itemId: string;
    item?: ApiItem;
    quantity: string | number;
    soldPrice: string | number;
    discountReason?: string;
  }>;
}

export interface ApiLineItem {
  id: string;
  itemId: string;
  item: ApiItem;
  quantity: string | number;
  originalPrice: string | number;
  soldPrice: string | number;
  discountReason?: string;
  isReturned: boolean;
  isDamaged: boolean;
  createdAt: string;
}

export interface ApiTransaction {
  id: string;
  totalAmount: string | number;
  taxAmount: string | number;
  paymentType: 'CASH' | 'CARD' | 'MPESA';
  status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
  lineItems: ApiLineItem[];
  user: { id: string; name: string };
  createdAt: string;
}

export interface SalesReport {
  from: string;
  to: string;
  totalRevenue: number;
  transactionCount: number;
  avgTransaction: number;
  paymentBreakdown: Record<string, number>;
  topProducts: Array<{ name: string; category: string; qty: number; revenue: number }>;
  daily: Array<{ date: string; revenue: number; transactions: number }>;
}

export interface ShiftsReport {
  shifts: Array<{
    id: string;
    user: string;
    startTime: string;
    endTime: string | null;
    startingCash: number;
    cashSales: number;
    totalSales: number;
    payIns: number;
    payOuts: number;
    expectedCash: number;
    actualCash: number | null;
    variance: number | null;
    transactionCount: number;
  }>;
}

export interface InventoryReport {
  totalProducts: number;
  totalCostValue: number;
  totalRetailValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStock: Array<{ id: string; name: string; category: string; currentStock: number; unit: string }>;
  outOfStock: Array<{ id: string; name: string; category: string }>;
  byCategory: Array<{ category: string; count: number; value: number }>;
  recentAdjustments: Array<{ itemName: string; quantity: number; reasonCode: string; note: string; createdAt: string }>;
}

export interface VatPendingItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentEtimsCode: string;
  currentVatLabel: string;
  flagReason: string;
  suggestedVatClassId: string;
  suggestedEtimsCode: string;
  suggestedLabel: string;
}

export interface ProfitReport {
  from: string;
  to: string;
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPct: number;
  byProduct: Array<{
    id: string;
    name: string;
    category: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPct: number;
    unitsSold: number;
  }>;
}

export interface VatReport {
  from: string;
  to: string;
  transactionCount: number;
  totalOutputVat: number;
  totalTaxableSales: number;
  totalZeroRated: number;
  totalExempt: number;
  netVatPayable: number;
  pendingEtims: number;
  byCategory: Array<{ category: string; taxable: number; vat: number; zero: number; exempt: number }>;
  byMonth: Array<{ month: string; outputVat: number; taxableSales: number; zeroRated: number; exempt: number; txCount: number }>;
}

export function apiItemToProduct(item: ApiItem) {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    subCategory: item.subCategory,
    unit: item.unit,
    boxQty: item.boxQty,
    costPrice: Number(item.costPrice),
    sellingPrice: Number(item.sellingPrice),
    nomadBitePrice: Number(item.nomadBitePrice),
    taxRate: Number(item.taxRate),
    etimsCode: item.etimsCode ?? 'VAT',
    needsVatConfirmation: item.needsVatConfirmation ?? false,
    isFractional: item.isFractional,
    currentStock: Number(item.currentStock),
    description: item.description,
    notes: item.notes,
    imageUrl: item.imageUrl,
    manufacturingDate: item.manufacturingDate?.split('T')[0],
    expiryDate: item.expiryDate?.split('T')[0],
    packagingTiers: (item.packagingTiers ?? []).map((t) => ({
      id: t.id,
      itemId: item.id,
      name: t.name,
      level: Number(t.level),
      quantityInBase: Number(t.quantityInBase),
      costPrice: Number(t.costPrice),
      sellingPriceOverride: t.sellingPriceOverride != null ? Number(t.sellingPriceOverride) : null,
      barcode: t.barcode ?? null,
      isBaseUnit: t.isBaseUnit,
      roundingPrecision: t.roundingPrecision != null ? Number(t.roundingPrecision) : 0.001,
    })),
  };
}
