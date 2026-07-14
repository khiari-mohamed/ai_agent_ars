import { useEffect, useRef, useCallback } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import type { Message, SentimentLabel } from '@/types/conversation';

// In dev, Vite proxies /ws/chat → ws://localhost:8000/ws/chat
// In prod, VITE_WS_URL should be the full wss:// origin (e.g. wss://api.ars.tn)
// If VITE_WS_URL is empty we use a relative path so the Vite proxy (dev) or
// same-origin nginx (prod) handles it automatically.
const WS_ORIGIN = import.meta.env.VITE_WS_URL ?? '';

function buildWsUrl(sessionId: string): string {
  const path = `/ws/chat?session_id=${encodeURIComponent(sessionId)}`;
  if (!WS_ORIGIN) {
    // Relative WebSocket URL — works with Vite proxy in dev and nginx in prod
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  return `${WS_ORIGIN}${path}`;
}

// Shape of every frame the backend sends
interface WsFrame {
  type: string;
  data: Record<string, unknown>;
}

export function useWebSocket(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);

  const {
    addMessage,
    setAgentTyping,
    setSentiment,
    setAuthState,
    setConnected,
    setStatus,
    setConversationId,
  } = useConversationStore();

  // ── Send a typed JSON frame to the backend ──────────────────────────────
  const send = useCallback((type: string, content: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, content, session_id: sessionId }));
  }, [sessionId]);

  // ── Handle incoming frames ───────────────────────────────────────────────
  const handleFrame = useCallback((frame: WsFrame) => {
    switch (frame.type) {
      case 'message': {
        const msg = frame.data as unknown as Message;
        addMessage(msg);
        setAgentTyping(false);
        // Persist conversationId from first message
        if (msg.conversationId) setConversationId(msg.conversationId);
        break;
      }
      case 'typing':
        setAgentTyping((frame.data as { isTyping: boolean }).isTyping);
        break;

      case 'sentiment': {
        const s = frame.data as { score: number; label: SentimentLabel };
        setSentiment(s.score, s.label);
        break;
      }
      case 'auth_result': {
        const r = frame.data as { success: boolean; state: string };
        // Map backend ConvState values to frontend AuthState
        const stateMap: Record<string, string> = {
          PENDING_CIN:   'PENDING_CIN',
          PENDING_OTP:   'PENDING_OTP',
          AUTHENTICATED: 'AUTHENTICATED',
          LOCKED:        'LOCKED',
          ESCALATED:     'AUTHENTICATED', // keep input enabled until closed
          CLOSED:        'AUTHENTICATED',
          INIT:          'IDLE',
        };
        const mapped = stateMap[r.state] ?? 'IDLE';
        setAuthState(mapped as import('@/types/auth').AuthState);
        break;
      }
      case 'conversation_closed':
        setStatus('RESOLVED');
        wsRef.current?.close(1000, 'conversation_closed');
        break;

      case 'error':
        // Non-fatal — the backend already sent a user-facing message
        console.warn('[ws] server error', frame.data);
        break;
    }
  }, [addMessage, setAgentTyping, setSentiment, setAuthState, setConnected, setStatus, setConversationId]);

  // ── Connect / reconnect ──────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (unmounted.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const ws = new WebSocket(buildWsUrl(sessionId));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000; // reset backoff on successful connect
    };

    ws.onclose = (ev) => {
      setConnected(false);
      // Don't reconnect on intentional close (1000) or if component unmounted
      if (unmounted.current || ev.code === 1000) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      // onclose fires right after onerror — reconnect handled there
      setConnected(false);
    };

    ws.onmessage = (ev) => {
      try {
        const frame: WsFrame = JSON.parse(ev.data as string);
        handleFrame(frame);
      } catch {
        console.warn('[ws] unparseable frame', ev.data);
      }
    };
  }, [sessionId, setConnected, handleFrame]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close(1000, 'user_disconnect');
    wsRef.current = null;
    setConnected(false);
  }, [setConnected]);

  // ── Public send helpers ──────────────────────────────────────────────────
  const sendMessage = useCallback((content: string) => {
    send('message', content);
  }, [send]);

  const sendCin = useCallback((cin: string) => {
    setAuthState('PENDING_OTP');
    send('send_cin', cin);
  }, [send, setAuthState]);

  const sendOtp = useCallback((otp: string) => {
    send('send_otp', otp);
  }, [send]);

  const closeConversation = useCallback(() => {
    send('close', '');
  }, [send]);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connect, disconnect, sendMessage, sendCin, sendOtp, closeConversation };
}