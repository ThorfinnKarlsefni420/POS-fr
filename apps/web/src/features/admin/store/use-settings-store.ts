import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  serviceFeePercent: number;
  storeName: string;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
  setServiceFeePercent: (percent: number) => void;
  setStoreName: (name: string) => void;
  setCloudinaryCloudName: (name: string) => void;
  setCloudinaryUploadPreset: (preset: string) => void;
  calcNomadBitePrice: (costPrice: number) => number;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      serviceFeePercent: 5,
      storeName: 'NomadBite POS',
      cloudinaryCloudName: '',
      cloudinaryUploadPreset: '',

      setServiceFeePercent: (percent) => set({ serviceFeePercent: Math.max(0, Math.min(100, percent)) }),
      setStoreName: (name) => set({ storeName: name }),
      setCloudinaryCloudName: (name) => set({ cloudinaryCloudName: name }),
      setCloudinaryUploadPreset: (preset) => set({ cloudinaryUploadPreset: preset }),

      calcNomadBitePrice: (costPrice) => {
        const { serviceFeePercent } = get();
        return Number((costPrice * (1 + serviceFeePercent / 100)).toFixed(2));
      },
    }),
    { name: 'pos-settings' }
  )
);
