import { create } from 'zustand';
import type {
  ClosedReason,
  ConnectionState,
  ConversationStatus,
  Message,
  SentimentLabel,
} from '@/types/conversation';
import { statusForClosedReason } from '@/lib/ws/protocol';

interface ConversationState {
  conversationId: string | null;
  messages: Message[];
  status: 'IDLE' | ConversationStatus;
  isConnected: boolean;
  connection: ConnectionState;
  isAgentTyping: boolean;
  sentimentScore: number | null;
  sentimentLabel: SentimentLabel | null;
  ticketId: string | null;
  closedReason: ClosedReason | null;

  setConversationId: (id: string | null) => void;
  addMessage: (message: Message) => void;
  setStatus: (status: 'IDLE' | ConversationStatus) => void;
  setConnected: (connected: boolean) => void;
  setConnection: (connection: ConnectionState) => void;
  setAgentTyping: (typing: boolean) => void;
  setSentiment: (score: number, label: SentimentLabel) => void;
  setTicketId: (ticketId: string | null) => void;
  finish: (reason: ClosedReason) => void;
  reset: () => void;
}

const initialState = {
  conversationId: null,
  messages: [] as Message[],
  status: 'IDLE' as const,
  isConnected: false,
  connection: 'idle' as ConnectionState,
  isAgentTyping: false,
  sentimentScore: null,
  sentimentLabel: null,
  ticketId: null,
  closedReason: null,
};

export const useConversationStore = create<ConversationState>((set) => ({
  ...initialState,

  setConversationId: (conversationId) => set({ conversationId }),

  addMessage: (message) =>
    set((state) =>
      state.messages.some((m) => m.id === message.id)
        ? state
        : { messages: [...state.messages, message] },
    ),

  setStatus: (status) => set({ status }),

  setConnected: (isConnected) => set({ isConnected }),

  setConnection: (connection) => set({ connection, isConnected: connection === 'open' }),

  setAgentTyping: (isAgentTyping) => set({ isAgentTyping }),

  setSentiment: (sentimentScore, sentimentLabel) => set({ sentimentScore, sentimentLabel }),

  setTicketId: (ticketId) => set({ ticketId }),

  finish: (reason) =>
    set({
      status: statusForClosedReason(reason),
      closedReason: reason,
      connection: 'closed',
      isConnected: false,
      isAgentTyping: false,
    }),

  reset: () => set({ ...initialState, messages: [] }),
}));