import { useState, useEffect, useRef, useCallback } from 'react';
import type { CapabilityMode } from '../types';

export interface UseEngineClientOptions {
  onEvent?: (event: Record<string, unknown>) => void;
}

export function useEngineClient(options: UseEngineClientOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<string>('');
  const [capability, setCapability] = useState<CapabilityMode>('READ_ONLY_INSPECTION');
  const wsRef = useRef<WebSocket | null>(null);

  const getBaseUrl = useCallback(() => {
    return window.location.port === '5173'
      ? 'http://127.0.0.1:8000'
      : window.location.origin;
  }, []);

  const getWsUrl = useCallback(() => {
    const baseUrl = getBaseUrl();
    const url = new URL(baseUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws`;
  }, [getBaseUrl]);

  // Fetch active workspace from engine REST endpoint
  const refreshWorkspace = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/workspace`);
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setActiveWorkspace(data.workspace);
        }
      }
    } catch {
      // Offline or starting
    }
  }, [getBaseUrl]);

  const selectWorkspace = useCallback(
    async (path: string) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/workspace/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.workspace) {
            setActiveWorkspace(data.workspace);
          }
          return true;
        }
      } catch (err) {
        console.error('Failed to select workspace:', err);
      }
      return false;
    },
    [getBaseUrl]
  );

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // Connect to engine WebSocket
  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: NodeJS.Timeout | null = null;

    function connect() {
      if (unmounted) return;
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          if (!unmounted) {
            setConnected(true);
            refreshWorkspace();
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            options.onEvent?.(data);
          } catch { /* ignore non-json */ }
        };

        ws.onclose = () => {
          if (!unmounted) {
            setConnected(false);
            reconnectTimer = setTimeout(connect, 2000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [getWsUrl, refreshWorkspace, options]);

  return {
    connected,
    activeWorkspace,
    capability,
    setCapability,
    selectWorkspace,
    refreshWorkspace,
    sendMessage,
  };
}
