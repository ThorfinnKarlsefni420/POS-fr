import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { api, ApiSupplier } from '@/lib/api';

interface SupplierModalProps {
  supplier?: ApiSupplier;
  onClose: () => void;
  onSaved: () => void;
}

export function SupplierModal({ supplier, onClose, onSaved }: SupplierModalProps) {
  const isEdit = !!supplier;
  const [name, setName]               = useState(supplier?.name ?? '');
  const [phone, setPhone]             = useState(supplier?.phone ?? '');
  const [email, setEmail]             = useState(supplier?.email ?? '');
  const [isConsignment, setIsConsign]  = useState(supplier?.isConsignment ?? true);
  const [defaultType, setDefaultType] = useState<'FIXED_COST' | 'PERCENTAGE_COMMISSION'>(supplier?.defaultType ?? 'FIXED_COST');
  const [defaultRate, setDefaultRate] = useState(String(supplier?.defaultRate ?? '0'));
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Supplier name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        phone: phone || undefined,
        email: email || undefined,
        isConsignment,
        defaultType,
        defaultRate: Number(defaultRate) || 0,
      };
      if (isEdit) {
        await api.suppliers.update(supplier.id, data);
      } else {
        await api.suppliers.create(data);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">{isEdit ? 'Edit Supplier' : 'New Supplier'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplier Name *</label>
          <input
            className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
            placeholder="e.g. Highlands Dairy"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
            <input
              className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
              placeholder="+254 7xx xxx xxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
            <input
              className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
              placeholder="supplier@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <label className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${isConsignment ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" checked={isConsignment} onChange={(e) => setIsConsign(e.target.checked)} />
          <div>
            <p className={`font-semibold text-sm ${isConsignment ? 'text-emerald-700' : ''}`}>Consignment (Pay on Sell)</p>
            <p className="text-xs text-gray-400 mt-0.5">Enable to auto-track payouts when their products are sold.</p>
          </div>
        </label>

        {isConsignment && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pricing Model</label>
              <div className="flex gap-2">
                {[
                  { value: 'FIXED_COST' as const, label: 'Fixed Cost', desc: 'Payout = cost price × qty' },
                  { value: 'PERCENTAGE_COMMISSION' as const, label: 'Commission %', desc: 'Store keeps a % cut' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDefaultType(opt.value)}
                    className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors ${
                      defaultType === opt.value
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {defaultType === 'PERCENTAGE_COMMISSION' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Commission Rate (store's cut)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 pr-12 text-sm font-semibold"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(e.target.value)}
                    placeholder="e.g. 0.10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                    {(Number(defaultRate) * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  0.10 = store keeps 10%, supplier gets 90% of sold price.
                </p>
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}
