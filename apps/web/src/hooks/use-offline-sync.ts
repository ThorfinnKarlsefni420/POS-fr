import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './use-online-status';
import { api, CreateTransactionPayload } from '@/lib/api';

const QUEUE_KEY = 'nomadbite_offline_queue';

export interface QueuedTransaction {
  localId: string;
  timestamp: number;
  payload: CreateTransactionPayload;
}

export function getOfflineQueue(): QueuedTransaction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function enqueueOfflineTransaction(payload: CreateTransactionPayload): string {
  const localId = crypto.randomUUID();
  const queue = getOfflineQueue();
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, { localId, timestamp: Date.now(), payload }]));
  return localId;
}

function dequeueTransaction(localId: string) {
  const queue = getOfflineQueue().filter((t) => t.localId !== localId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    (async () => {
      for (const item of queue) {
        try {
          await api.transactions.create(item.payload);
          dequeueTransaction(item.localId);
          queryClient.invalidateQueries({ queryKey: ['products'] });
        } catch {
          // Leave in queue; will retry on next reconnect
        }
      }
    })();
  }, [isOnline, queryClient]);

  return {
    isOnline,
    pendingCount: getOfflineQueue().length,
  };
}
