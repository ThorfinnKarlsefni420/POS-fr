import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { api } from '@/lib/api';

export function useSettingsSync() {
  const storeId = useAuthStore((s) => s.user?.storeId);

  useEffect(() => {
    if (!storeId) return;
    api.settings.get().then((settings) => {
      const store = useSettingsStore.getState();
      store.setServiceFeePercent(settings.serviceFeePercent);
      store.setStoreName(settings.storeName);
      store.setCloudinaryCloudName(settings.cloudinaryCloudName);
      store.setCloudinaryUploadPreset(settings.cloudinaryUploadPreset);
    }).catch(() => {});
  }, [storeId]);
}
