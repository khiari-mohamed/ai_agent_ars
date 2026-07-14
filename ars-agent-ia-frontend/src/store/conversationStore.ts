import { create } from 'zustand';
import type { Message, ConversationStatus, SentimentLabel } from '@/types/conversation';
import type { AuthState, AuthSession } from '@/types/auth';

interface ConversationStore {
  conversationId: string | null;
  sessionId: string | null;
  messages: Message[];
  status: ConversationStatus | 'IDLE';
  authState: AuthState;
  authSession: AuthSession | null;
  isConnected: boolean;
  isAgentTyping: boolean;
  sentimentScore: number;
  sentimentLabel: SentimentLabel;

  // Actions
  setConversationId: (id: string) => void;
  setSessionId: (id: string) => void;
  addMessage: (msg: Message) => void;
  setStatus: (status: ConversationStatus | 'IDLE') => void;
  setAuthState: (state: AuthState) => void;
  setAuthSession: (session: AuthSession | null) => void;
  setConnected: (v: boolean) => void;
  setAgentTyping: (v: boolean) => void;
  setSentiment: (score: number, label: SentimentLabel) => void;
  reset: () => void;
}

const initialState = {
  conversationId: null,
  sessionId: null,
  messages: [],
  status: 'IDLE' as const,
  authState: 'IDLE' as const,
  authSession: null,
  isConnected: false,
  isAgentTyping: false,
  sentimentScore: 0,
  sentimentLabel: 'NEUTRE' as const,
};

export const useConversationStore = create<ConversationStore>()((set) => ({
  ...initialState,
  setConversationId: (id) => set({ conversationId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStatus: (status) => set({ status }),
  setAuthState: (authState) => set({ authState }),
  setAuthSession: (authSession) => set({ authSession }),
  setConnected: (isConnected) => set({ isConnected }),
  setAgentTyping: (isAgentTyping) => set({ isAgentTyping }),
  setSentiment: (sentimentScore, sentimentLabel) => set({ sentimentScore, sentimentLabel }),
  reset: () => set(initialState),
}));