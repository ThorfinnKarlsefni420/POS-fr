export interface PackagingTier {
  id: string;
  itemId: string;
  name: string;               // "Piece", "Outer", "Carton", "Bale", or custom
  level: number;              // 0 = base, 1 = outer, 2 = carton, 3 = bale
  quantityInBase: number;     // how many base units fit in this tier
  costPrice: number;          // buying cost per unit of this tier
  sellingPriceOverride?: number | null; // optional bulk selling price override
  barcode?: string | null;
  isBaseUnit: boolean;        // true = the tier sold individually at POS
  roundingPrecision?: number; // base-unit qty rounded to this step after conversion (default 0.001)
}

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
  etimsCode: string;  // 'VAT' | 'ZERO' | 'NONTAXABLE' — resolved from VatClass
  needsVatConfirmation?: boolean;
  isFractional: boolean;
  currentStock: number;
  description?: string;
  notes?: string;
  imageUrl?: string;
  barcode?: string | null;
  manufacturingDate?: string;
  expiryDate?: string;
  // Supplier info
  supplierName?: string | null;
  supplierPhone?: string | null;
  leadTimeDays?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
  packagingTiers?: PackagingTier[];
}

export interface CartItem extends Product {
  cartKey: string;            // unique cart identity: `${id}:${selectedTier?.id ?? 'base'}`
  quantity: number;           // number of selectedTier units (or base units if no tier)
  selectedTier?: PackagingTier; // the packaging tier chosen at add-to-cart time
  overridePrice?: number;     // manual price override (per selected tier unit)
  discountReason?: string;
  baseUnitPrice: number;      // original per-base-unit price; never changes after addItem
}

export type PaymentType = 'CASH' | 'MKOPO' | 'SPLIT';

export interface CartTotals {
  subtotal: number;
  taxAmount: number;     // Standard 16% VAT extracted (already included in subtotal)
  totalZeroKes: number;  // sum of Zero-Rated line totals
  totalExemptKes: number;
  total: number;         // equals subtotal — prices are VAT-inclusive
}
