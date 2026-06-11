import { RequestInit } from 'node:fetch';

const BASE = 'http://localhost:3001/api';

export function getHeaders(init?: { userId?: string; storeId?: string }): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.userId) headers['X-User-Id'] = init.userId;
  if (init?.storeId) headers['X-Store-Id'] = init.storeId;
  return headers;
}

export async function req(
  path: string,
  init?: RequestInit & { userId?: string; storeId?: string },
): Promise<{ status: number; body: any }> {
  const headers = getHeaders(init);
  
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  
  return { status: res.status, body };
}

// ... rest of file (createTestStore, createAdminUser, createSuperadminUser, seedConsignmentSettings)
// Wait, the replace tool requires the full file content if I don't use it surgically.
// I will just update the req function surgically.

export async function createTestStore(name: string, slug: string) {
  const { body } = await req('/stores', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  });
  return body as { id: string };
}

export async function createAdminUser(storeId: string, name: string) {
  const { body } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name, pin: '1234', role: 'ADMIN', storeId }),
  });
  return body as { id: string };
}

export async function createSuperadminUser(name: string) {
  const { body } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name, pin: '0000', role: 'SUPERADMIN' }),
  });
  return body as { id: string };
}

export async function seedConsignmentSettings(storeId: string, enabled: boolean, rate: number, userId: string) {
  const { status } = await req('/settings', {
    method: 'POST',
    storeId,
    userId,
    body: JSON.stringify({
      consignmentEnabled: enabled,
      consignmentRate: rate,
    }),
  });
  return status;
}
