import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  serviceFeePercent: number;
  storeName: string;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
  consignmentEnabled: boolean;
  consignmentRate: number;
  consignmentType: string;
  setServiceFeePercent: (percent: number) => void;
  setStoreName: (name: string) => void;
  setCloudinaryCloudName: (name: string) => void;
  setCloudinaryUploadPreset: (preset: string) => void;
  setConsignmentEnabled: (enabled: boolean) => void;
  setConsignmentRate: (rate: number) => void;
  setConsignmentType: (type: string) => void;
  calcNomadBitePrice: (costPrice: number) => number;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      serviceFeePercent: 5,
      storeName: 'NomadBite POS',
      cloudinaryCloudName: '',
      cloudinaryUploadPreset: '',
      consignmentEnabled: false,
      consignmentRate: 0.90,
      consignmentType: 'PERCENTAGE_COMMISSION',

      setServiceFeePercent: (percent) => set({ serviceFeePercent: Math.max(0, Math.min(100, percent)) }),
      setStoreName: (name) => set({ storeName: name }),
      setCloudinaryCloudName: (name) => set({ cloudinaryCloudName: name }),
      setCloudinaryUploadPreset: (preset) => set({ cloudinaryUploadPreset: preset }),
      setConsignmentEnabled: (enabled) => set({ consignmentEnabled: enabled }),
      setConsignmentRate: (rate) => set({ consignmentRate: rate }),
      setConsignmentType: (type) => set({ consignmentType: type }),

      calcNomadBitePrice: (costPrice) => {
        const { serviceFeePercent } = get();
        return Number((costPrice * (1 + serviceFeePercent / 100)).toFixed(2));
      },
    }),
    { name: 'pos-settings' }
  )
);
