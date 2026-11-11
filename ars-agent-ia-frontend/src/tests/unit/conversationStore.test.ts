import { beforeEach, describe, expect, it } from 'vitest';
import { useConversationStore } from '@/store/conversationStore';
import type { Message } from '@/types/conversation';

const msg = (id: string, role: Message['role'] = 'assistant'): Message => ({
  id,
  conversationId: 'c1',
  role,
  content: id,
  timestamp: '2026-11-10T10:00:00.000Z',
  tokensUsed: null,
  toolName: null,
});

const state = () => useConversationStore.getState();

beforeEach(() => state().reset());

describe('conversationStore', () => {
  it('starts idle', () => {
    expect(state()).toMatchObject({ status: 'IDLE', connection: 'idle', isConnected: false, messages: [] });
  });

  it('dedupes messages by id', () => {
    state().addMessage(msg('a'));
    state().addMessage(msg('a'));
    state().addMessage(msg('b'));
    expect(state().messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('keeps isConnected in sync with connection', () => {
    state().setConnection('open');
    expect(state().isConnected).toBe(true);
    state().setConnection('connecting');
    expect(state().isConnected).toBe(false);
  });

  it('finish() closes the conversation and stops typing', () => {
    state().setStatus('ACTIVE');
    state().setConnection('open');
    state().setAgentTyping(true);
    state().finish('ESCALATED');
    expect(state()).toMatchObject({
      status: 'ESCALATED',
      closedReason: 'ESCALATED',
      connection: 'closed',
      isConnected: false,
      isAgentTyping: false,
    });
  });

  it('finish(CONNECTION_LOST) marks the conversation abandoned', () => {
    state().finish('CONNECTION_LOST');
    expect(state().status).toBe('ABANDONED');
  });

  it('reset() clears everything', () => {
    state().addMessage(msg('a'));
    state().setTicketId('T-1');
    state().setSentiment(0.5, 'SATISFAIT');
    state().finish('RESOLVED');
    state().reset();
    expect(state()).toMatchObject({
      messages: [],
      ticketId: null,
      sentimentScore: null,
      sentimentLabel: null,
      closedReason: null,
      status: 'IDLE',
    });
  });
});
