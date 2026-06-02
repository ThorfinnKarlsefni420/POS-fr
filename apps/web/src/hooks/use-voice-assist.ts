import { useState, useRef, useCallback } from 'react';

export interface VoiceSuggestion {
  productId: string;
  name: string;
  sku: string;
  confidence: 'high' | 'medium' | 'low';
  qty?: number;
}

interface VoiceState {
  isListening: boolean;
  partial: string;
  transcript: string | null;
  suggestions: VoiceSuggestion[];
  processing: boolean;
  error: string | null;
}

export function useVoiceAssist(apiBase: string, headers: () => Record<string, string>) {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    partial: '',
    transcript: null,
    suggestions: [],
    processing: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchIntent = useCallback(async (transcript: string) => {
    setState((s) => ({ ...s, processing: true }));
    try {
      const res = await fetch(`${apiBase}/voice/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json() as { suggestions: VoiceSuggestion[] };
      setState((s) => ({
        ...s,
        transcript,
        suggestions: data.suggestions ?? [],
        processing: false,
      }));
    } catch {
      setState((s) => ({ ...s, processing: false, error: 'Intent extraction failed' }));
    }
  }, [apiBase, headers]);

  const stopListening = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'Terminate' }));
      ws.close();
    }
    wsRef.current = null;

    processorRef.current?.disconnect();
    processorRef.current = null;

    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setState((s) => ({ ...s, isListening: false, partial: '' }));
  }, []);

  const startListening = useCallback(async (_lang = 'so') => {
    setState((s) => ({ ...s, isListening: true, error: null, transcript: null, suggestions: [], partial: '', processing: false }));

    // 1. Get short-lived AssemblyAI token from our API
    let token: string | null = null;
    try {
      const tokenRes = await fetch(`${apiBase}/voice/token`, { headers: headers() });
      if (!tokenRes.ok) throw new Error(`Token ${tokenRes.status}`);
      const tokenData = await tokenRes.json() as { token: string | null; demo?: boolean };

      if (tokenData.demo || !tokenData.token) {
        // Demo mode — simulate a final transcript after 2s
        console.log('[Voice] ASSEMBLYAI_API_KEY not set — demo mode');
        setTimeout(() => fetchIntent('[Demo] sonkor iyo bariis'), 2000);
        return;
      }
      token = tokenData.token;
    } catch (e) {
      setState((s) => ({ ...s, isListening: false, error: 'Could not start voice session' }));
      return;
    }

    // 2. Request microphone (mono, 16 kHz preferred)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
    } catch {
      setState((s) => ({ ...s, isListening: false, error: 'Microphone access denied' }));
      return;
    }

    // 3. Open AssemblyAI real-time WebSocket (v3)
    // whisper-rt: 99+ languages including Somali and Swahili
    const ws = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${token}&speech_model=whisper-rt`
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          transcript?: string;
          end_of_turn?: boolean;
        };
        if (msg.type === 'Turn' && msg.transcript) {
          if (msg.end_of_turn) {
            setState((s) => ({ ...s, partial: '' }));
            fetchIntent(msg.transcript!.trim());
          } else {
            setState((s) => ({ ...s, partial: msg.transcript! }));
          }
        } else if (msg.type === 'SessionTerminated') {
          setState((s) => ({ ...s, isListening: false, partial: '' }));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, isListening: false, error: 'Voice connection error' }));
      stopListening();
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, isListening: false, partial: '' }));
    };

    // Wait for WS to open before wiring up AudioContext
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 6000);
        ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WS error')); }, { once: true });
      });
    } catch {
      setState((s) => ({ ...s, isListening: false, error: 'Voice connection failed' }));
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    // 4. AudioContext at 16 kHz → ScriptProcessor → Int16 PCM → base64 → WS
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    // Silent gain node prevents audio feedback through speakers
    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // v3 expects raw binary PCM frames, not base64 JSON
      wsRef.current.send(int16.buffer);
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioCtx.destination);
  }, [apiBase, headers, fetchIntent, stopListening]);

  const clearSuggestions = useCallback(() => {
    setState((s) => ({ ...s, suggestions: [], transcript: null, error: null, partial: '' }));
  }, []);

  return { ...state, startListening, stopListening, clearSuggestions };
}
