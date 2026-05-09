import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiUser } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { Users, UserPlus, Pencil, Trash2, Loader2, X } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   'bg-orange-100 text-orange-700',
  CASHIER: 'bg-blue-100 text-blue-700',
};

interface StaffModalProps {
  storeId: string;
  editing?: ApiUser;
  onClose: () => void;
  onSaved: () => void;
}

function StaffModal({ storeId, editing, onClose, onSaved }: StaffModalProps) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? '');
  const [pin, setPin]   = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!isEdit && pin.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) { setError('PIN must be exactly 4 digits.'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.users.update(editing!.id, { name: name.trim(), ...(pin ? { pin } : {}), storeId });
      } else {
        await api.users.create({ name: name.trim(), pin, role: 'CASHIER', storeId });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">{isEdit ? 'Edit Staff' : 'Add Cashier'}</h2>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</label>
            <input
              className="w-full h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              PIN {isEdit && <span className="normal-case font-normal text-gray-400">(leave blank to keep current)</span>}
            </label>
            <input
              className="w-full h-10 rounded-xl border px-3 text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Cashier'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StaffManagement() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const storeId = me?.storeId ?? '';

  const [modal, setModal] = useState<{ open: boolean; editing?: ApiUser }>({ open: false });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['admin-staff', storeId],
    queryFn: () => api.users.list(),
    staleTime: 30_000,
    enabled: !!storeId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.users.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-staff'] }); setDeletingId(null); },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['admin-staff'] });

  const visibleStaff = staff.filter((u) => u.id !== me?.id);

  return (
    <div className="bg-white border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-orange-600" />
          <p className="font-bold text-sm">Staff</p>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{visibleStaff.length}</span>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Cashier
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading staff…</span>
        </div>
      ) : visibleStaff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
          <Users className="h-8 w-8 opacity-20" />
          <p className="text-sm font-medium">No staff yet</p>
          <p className="text-xs opacity-60">Add a cashier to get started.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleStaff.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-xs font-black text-orange-700">
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <p className="font-semibold">{u.name}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => setModal({ open: true, editing: u })}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deletingId === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(u.id)}
                          disabled={deleteMutation.isPending}
                          className="h-7 px-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="h-7 px-2 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(u.id)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal.open && storeId && (
        <StaffModal
          storeId={storeId}
          editing={modal.editing}
          onClose={() => setModal({ open: false })}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
