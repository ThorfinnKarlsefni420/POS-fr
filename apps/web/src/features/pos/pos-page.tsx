import { Catalog } from './components/catalog';
import { Cart } from './components/cart';

export function PosPage() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Catalog panel */}
      <div className="flex-1 min-w-0 p-4 overflow-hidden flex flex-col">
        <Catalog />
      </div>

      {/* Cart panel */}
      <div className="w-80 border-l flex flex-col shrink-0 bg-card">
        <Cart />
      </div>
    </div>
  );
}
