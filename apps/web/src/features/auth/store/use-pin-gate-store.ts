import { create } from 'zustand';

interface PinGateState {
  isOpen: boolean;
  pendingAction: (() => void) | null;
  requireAdmin: (action: () => void) => void;
  resolve: (success: boolean) => void;
}

export const usePinGateStore = create<PinGateState>((set, get) => ({
  isOpen: false,
  pendingAction: null,
  requireAdmin: (action) => set({ isOpen: true, pendingAction: action }),
  resolve: (success) => {
    if (success) get().pendingAction?.();
    set({ isOpen: false, pendingAction: null });
  },
}));
