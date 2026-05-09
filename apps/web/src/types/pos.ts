export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  unit: string;
  boxQty: string;
  costPrice: number;
  sellingPrice: number;
  nomadBitePrice: number;
  taxRate: number;
  isFractional: boolean;
  currentStock: number;
  description?: string;
  notes?: string;
  imageUrl?: string;
  manufacturingDate?: string;
  expiryDate?: string;
}

export interface CartItem extends Product {
  quantity: number;
  overridePrice?: number;
  discountReason?: string;
}

export type PaymentType = 'CASH';

export interface CartTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}
