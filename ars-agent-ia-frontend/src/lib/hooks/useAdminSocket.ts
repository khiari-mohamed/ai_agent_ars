import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import type { ConversationListItem } from '@/types/conversation';
import type { Ticket } from '@/types/ticket';

const WS_URL = import.meta.env.VITE_WS_URL ?? '';

interface AdminServerEvents {
  conversation_started: (conv: ConversationListItem) => void;
  conversation_updated: (conv: ConversationListItem) => void;
  ticket_created:       (ticket: Ticket) => void;
  ticket_updated:       (ticket: Ticket) => void;
  stats_update:         (stats: Partial<import('@/types/admin').DashboardStats>) => void;
}

type Handler<T> = (data: T) => void;

interface AdminSocketHandlers {
  onConversationStarted?: Handler<ConversationListItem>;
  onConversationUpdated?: Handler<ConversationListItem>;
  onTicketCreated?:       Handler<Ticket>;
  onTicketUpdated?:       Handler<Ticket>;
  onStatsUpdate?:         Handler<Partial<import('@/types/admin').DashboardStats>>;
}

export function useAdminSocket(handlers: AdminSocketHandlers) {
  const socketRef = useRef<Socket<AdminServerEvents, Record<string, never>> | null>(null);
  const token = useAuthStore((s) => s.user?.token);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!token || socketRef.current?.connected) return;

    const socket = io(WS_URL, {
      path: '/ws',
      query: { type: 'admin' },
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30_000,
      withCredentials: true,
    });

    socket.on('conversation_started', (c) => handlersRef.current.onConversationStarted?.(c));
    socket.on('conversation_updated', (c) => handlersRef.current.onConversationUpdated?.(c));
    socket.on('ticket_created',       (t) => handlersRef.current.onTicketCreated?.(t));
    socket.on('ticket_updated',       (t) => handlersRef.current.onTicketUpdated?.(t));
    socket.on('stats_update',         (s) => handlersRef.current.onStatsUpdate?.(s));

    socketRef.current = socket;
  }, [token]);

  useEffect(() => {
    connect();
    return () => { socketRef.current?.disconnect(); };
  }, [connect]);
}