import { useEffect, useRef } from 'react';

const SCAN_TIMEOUT_MS = 80;  // scanners finish a barcode in < 80 ms
const MIN_BARCODE_LEN = 3;

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      const code = bufferRef.current.trim();
      if (code.length >= MIN_BARCODE_LEN) onScan(code);
      bufferRef.current = '';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when the user is typing in an input/textarea themselves
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        if (timerRef.current) clearTimeout(timerRef.current);
        flush();
        return;
      }

      if (e.key.length !== 1) return; // ignore modifier keys

      bufferRef.current += e.key;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SCAN_TIMEOUT_MS);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onScan]);
}
