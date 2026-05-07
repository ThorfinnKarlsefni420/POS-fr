import { useState, useEffect } from 'react';
import { Image as ImageIcon, Loader2, Play, StopCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface SyncStatus {
  total: number;
  processed: number;
  success: number;
  failed: number;
  isRunning: boolean;
  lastItem?: string;
}

export function ImageSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/image-sync/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch sync status', err);
    }
  };

  const startSync = async () => {
    setLoading(true);
    try {
      await api.post('/image-sync/start');
      await fetchStatus();
    } catch (err) {
      console.error('Failed to start sync', err);
    } finally {
      setLoading(false);
    }
  };

  const stopSync = async () => {
    try {
      await api.post('/image-sync/stop');
      await fetchStatus();
    } catch (err) {
      console.error('Failed to stop sync', err);
    }
  };

  if (!status) return null;

  const percent = status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Image Automation</h3>
            <p className="text-xs text-muted-foreground">Source product images using SerpApi</p>
          </div>
        </div>
        
        {status.isRunning ? (
          <button
            onClick={stopSync}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors"
          >
            <StopCircle className="h-3.5 w-3.5" />
            Stop Sync
          </button>
        ) : (
          <button
            onClick={startSync}
            disabled={loading || (status.total === 0 && status.processed > 0)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {status.processed > 0 && status.processed === status.total ? 'Restart Sync' : 'Start Auto-Sourcing'}
          </button>
        )}
      </div>

      {(status.isRunning || (status.processed > 0)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">
              {status.isRunning ? 'Processing...' : 'Sync Complete'}
            </span>
            <span className="font-bold">{percent}% ({status.processed} / {status.total})</span>
          </div>
          
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-out" 
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex gap-4 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle className="h-3 w-3" />
              {status.success} Success
            </div>
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
              <AlertCircle className="h-3 w-3" />
              {status.failed} Failed
            </div>
            {status.isRunning && status.lastItem && (
              <div className="flex-1 text-right text-[10px] text-muted-foreground italic truncate">
                Current: {status.lastItem}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
