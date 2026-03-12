import { useEffect, useRef, useCallback, useState } from 'react';
import { WS_URL } from '../config';

// Reconnect: start fast, back off gently
const RECONNECT_BASE_DELAY = 500;
const RECONNECT_MAX_DELAY = 8000;

// Keepalive: send a ping every 30s to prevent idle disconnection.
// API Gateway drops idle connections after ~10 min,
// but mobile browsers and proxies may drop them much sooner.
const KEEPALIVE_INTERVAL = 30_000;

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const keepaliveTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const intentionalClose = useRef(false);
  const [connected, setConnected] = useState(false);

  // Keep callback ref fresh without re-creating connect()
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // ── Keepalive ──
  const startKeepalive = useCallback(() => {
    stopKeepalive();
    keepaliveTimer.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ action: 'ping' }));
        } catch {
          wsRef.current?.close();
        }
      }
    }, KEEPALIVE_INTERVAL);
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimer.current) {
      clearInterval(keepaliveTimer.current);
      keepaliveTimer.current = null;
    }
  }, []);

  // ── Connect ──
  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    intentionalClose.current = false;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        reconnectAttempt.current = 0;
        startKeepalive();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected', event.code, event.reason);
        setConnected(false);
        wsRef.current = null;
        stopKeepalive();
        if (!intentionalClose.current) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose will fire after this — let it handle reconnection
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      scheduleReconnect();
    }
  }, [startKeepalive, stopKeepalive]);

  // ── Reconnect with exponential backoff ──
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (intentionalClose.current) return;

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempt.current),
      RECONNECT_MAX_DELAY
    );
    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempt.current + 1})`);

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      reconnectAttempt.current += 1;
      connect();
    }, delay);
  }, [connect]);

  // ── Disconnect (intentional) ──
  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    stopKeepalive();

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, [stopKeepalive]);

  // ── Send ──
  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    console.warn('[WS] Not connected, cannot send:', payload.action);
    return false;
  }, []);

  // ── Lifecycle ──
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // ── Visibility change: reconnect when user comes back to tab/app ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (
          !wsRef.current ||
          wsRef.current.readyState === WebSocket.CLOSED ||
          wsRef.current.readyState === WebSocket.CLOSING
        ) {
          console.log('[WS] Tab visible, reconnecting...');
          reconnectAttempt.current = 0;
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connect]);

  // ── Online event: reconnect when network comes back ──
  useEffect(() => {
    const handleOnline = () => {
      console.log('[WS] Network online, reconnecting...');
      reconnectAttempt.current = 0;
      connect();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [connect]);

  return { send, connected, disconnect, reconnect: connect };
}
