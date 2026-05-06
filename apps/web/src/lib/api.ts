import { useAuthStore } from '@/features/auth/store/use-auth-store';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const user = useAuthStore.getState().user;
  const userId = user?.id;
  const storeId = user?.role === 'SUPERADMIN' ? undefined : user?.storeId;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...(storeId ? { 'X-Store-Id': storeId } : {}),
    },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
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
    verify: (userId: string, pin: string) =>
      req<ApiUser>('/users/verify', { method: 'POST', body: JSON.stringify({ userId, pin }) }),
    verifyAdmin: (pin: string) =>
      req<ApiUser>('/users/verify-admin', { method: 'POST', body: JSON.stringify({ pin }) }),
  },
  shifts: {
    current: (userId?: string | null) =>
      req<ApiShift | null>(`/shifts/current${userId ? `?userId=${userId}` : ''}`),
    start: (userId: string, startingCash: number) =>
      req<ApiShift>('/shifts', { method: 'POST', body: JSON.stringify({ userId, startingCash }) }),
    addCashLog: (shiftId: string, data: { amount: number; type: 'PAY_IN' | 'PAY_OUT'; reason: string }) =>
      req<{ id: string }>(`/shifts/${shiftId}/cashlog`, { method: 'POST', body: JSON.stringify(data) }),
    close: (shiftId: string, actualCash: number) =>
      req<{ expectedCash: number; variance: number }>(`/shifts/${shiftId}/close`, { method: 'POST', body: JSON.stringify({ actualCash }) }),
  },
  products: {
    list: () => req<ApiItem[]>('/products'),
    update: (id: string, data: Partial<ApiItem>) =>
      req<ApiItem>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    import: (products: ApiItem[], replace: boolean) =>
      req<{ succeeded: number; failed: number }>('/products/import', {
        method: 'POST',
        body: JSON.stringify({ products, replace }),
      }),
    adjustStock: (id: string, delta: number, reasonCode = 'RESTOCK', note?: string) =>
      req<ApiItem>(`/products/${id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, reasonCode, note }),
      }),
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
    exportSalesCsvUrl: (from: string, to: string) => `${BASE}/reports/export/sales?from=${from}&to=${to}`,
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
  superadmin: {
    dashboard: () => req<SuperAdminDashboard>('/superadmin/dashboard'),
  },
};

export interface ApiItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  unit: string;
  boxQty: string;
  costPrice: string | number;
  nomadBitePrice: string | number;
  taxRate: string | number;
  isFractional: boolean;
  currentStock: string | number;
  description?: string;
  notes?: string;
  imageUrl?: string;
  manufacturingDate?: string;
  expiryDate?: string;
}

export interface ApiSettings {
  serviceFeePercent: number;
  storeName: string;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
}

export interface CreateTransactionPayload {
  items: Array<{ id: string; quantity: number; originalPrice: number; soldPrice: number; discountReason?: string }>;
  totalAmount: number;
  taxAmount: number;
  paymentType: 'CASH' | 'CARD' | 'MPESA';
  userId?: string;
  shiftId?: string;
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
    nomadBitePrice: Number(item.nomadBitePrice),
    taxRate: Number(item.taxRate),
    isFractional: item.isFractional,
    currentStock: Number(item.currentStock),
    description: item.description,
    notes: item.notes,
    imageUrl: item.imageUrl,
    manufacturingDate: item.manufacturingDate?.split('T')[0],
    expiryDate: item.expiryDate?.split('T')[0],
  };
}
