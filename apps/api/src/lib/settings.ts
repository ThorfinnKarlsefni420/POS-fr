import { prisma } from './prisma';

export type SettingType = 'string' | 'number' | 'boolean';

export interface SettingDefinition<T> {
  key: string;
  type: SettingType;
  default: T;
}

export const SETTINGS_DEFINITIONS: Record<string, SettingDefinition<any>> = {
  serviceFeePercent: { key: 'serviceFeePercent', type: 'number', default: 5 },
  storeName: { key: 'storeName', type: 'string', default: 'NomadBite POS' },
  cloudinaryCloudName: { key: 'cloudinaryCloudName', type: 'string', default: '' },
  cloudinaryUploadPreset: { key: 'cloudinaryUploadPreset', type: 'string', default: '' },
  consignmentEnabled: { key: 'consignmentEnabled', type: 'boolean', default: false },
  consignmentRate: { key: 'consignmentRate', type: 'number', default: 0.90 },
  consignmentType: { key: 'consignmentType', type: 'string', default: 'PERCENTAGE_COMMISSION' },
};

export const parseValue = (key: string, value: string): any => {
  const def = SETTINGS_DEFINITIONS[key];
  if (!def) return value;
  switch (def.type) {
    case 'number': return Number(value);
    case 'boolean': return value === 'true';
    default: return value;
  }
};

export const normalizeValue = (key: string, value: any): string => {
  const def = SETTINGS_DEFINITIONS[key];
  if (!def) return String(value);
  switch (def.type) {
    case 'number': return String(Number(value));
    case 'boolean': return String(!!value);
    default: return String(value);
  }
};

export const getSettings = async (storeId: string): Promise<Record<string, any>> => {
  const settings: Record<string, any> = {};
  for (const key in SETTINGS_DEFINITIONS) {
    settings[key] = SETTINGS_DEFINITIONS[key].default;
  }
  const rows = await prisma.storeSetting.findMany({ where: { storeId } });
  rows.forEach((r) => {
    if (SETTINGS_DEFINITIONS[r.key]) {
      settings[r.key] = parseValue(r.key, r.value);
    }
  });
  return settings;
};
