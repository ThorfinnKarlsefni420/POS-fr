import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
  storeId: string | null;
}

interface AuthState {
  user: AuthUser | null;
  shiftId: string | null;
  setUser: (user: AuthUser) => void;
  setShiftId: (id: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      shiftId: null,
      setUser: (user) => set({ user }),
      setShiftId: (shiftId) => set({ shiftId }),
      logout: () => set({ user: null, shiftId: null }),
    }),
    { name: 'nomadbite_session' }
  )
);
