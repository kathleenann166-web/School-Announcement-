import { useEffect, useRef, useState } from 'react';
import { isStaticModeActive } from '../lib/staticFallback';
import type { RealtimeEvent } from '../types';

interface UseRealtimeSocketOptions {
  token: string | null;
  onEvent: (event: RealtimeEvent) => void;
}

export function useRealtimeSocket({ token, onEvent }: UseRealtimeSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const tokenRef = useRef(token);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    tokenRef.current = token;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && token) {
      wsRef.current.send(JSON.stringify({ type: 'auth', token }));
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    let reconnectTimer: number | undefined;
    let retryDelay = 1000;

    const handleLocalEvent = (evt: Event) => {
      const customEvt = evt as CustomEvent<RealtimeEvent>;
      if (customEvt.detail) {
        onEventRef.current(customEvt.detail);
      }
    };
    window.addEventListener('omsu:realtime', handleLocalEvent);

    let bc: BroadcastChannel | null = null;
    try {
      bc =
        typeof BroadcastChannel !== 'undefined'
          ? new BroadcastChannel('omsu-mamburao-realtime')
          : null;
      if (bc) {
        bc.onmessage = (msg) => {
          if (msg.data) {
            onEventRef.current(msg.data as RealtimeEvent);
          }
        };
      }
    } catch {
      bc = null;
    }

    const staticHost =
      isStaticModeActive() ||
      window.location.hostname.endsWith('.github.io') ||
      window.location.protocol === 'file:';

    if (staticHost) {
      setConnected(true);
      setOnlineCount(1);
      return () => {
        active = false;
        window.removeEventListener('omsu:realtime', handleLocalEvent);
        bc?.close();
      };
    }

    function connect() {
      if (!active) return;
      if (isStaticModeActive()) {
        setConnected(true);
        setOnlineCount(1);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setConnected(true);
        retryDelay = 1000;
        if (tokenRef.current) {
          socket.send(JSON.stringify({ type: 'auth', token: tokenRef.current }));
        }
      };

      socket.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data as string) as RealtimeEvent;
          if (parsed.type === 'ws:connected' || parsed.type === 'ws:presence') {
            setOnlineCount(parsed.onlineCount);
          }
          onEventRef.current(parsed);
        } catch {
          // Ignore invalid payloads
        }
      };

      socket.onclose = () => {
        if (!active) return;
        if (isStaticModeActive()) {
          setConnected(true);
          return;
        }
        setConnected(false);
        reconnectTimer = window.setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, 10000);
          connect();
        }, retryDelay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      active = false;
      window.removeEventListener('omsu:realtime', handleLocalEvent);
      bc?.close();
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
    };
  }, []);

  return { connected, onlineCount };
}
