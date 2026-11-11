import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_FRAME_BYTES,
  buildWsUrl,
  closedReasonFrom,
  newId,
  parseServerEvent,
  sentimentLabelFor,
  splitIntoFrames,
  statusForClosedReason,
  toReplyLanguage,
} from '@/lib/ws/protocol';

const frame = (type: string, data?: unknown) => JSON.stringify({ type, data });

afterEach(async () => {
  vi.unstubAllGlobals();
});

describe('parseServerEvent', () => {
  it('parses a session', () => {
    expect(parseServerEvent(frame('session', { conversationId: 'c1', inputFormats: ['webm', 3], outputFormat: 'mp3' }))).toEqual({
      type: 'session',
      conversationId: 'c1',
      inputFormats: ['webm'],
      outputFormat: 'mp3',
    });
  });

  it('rejects a session without conversationId', () => {
    expect(parseServerEvent(frame('session', {}))).toBeNull();
  });

  it('rejects malformed JSON, non-objects and unknown types', () => {
    expect(parseServerEvent('{nope')).toBeNull();
    expect(parseServerEvent('42')).toBeNull();
    expect(parseServerEvent(frame('weird', {}))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ data: {} }))).toBeNull();
  });

  it('normalises a message (ttsText fallback, ar-TN -> tn)', () => {
    const event = parseServerEvent(
      frame('message', { id: 'm1', conversationId: 'c1', role: 'assistant', content: 'Salut', language: 'ar-TN', ticketId: 7 }),
    );
    expect(event).toMatchObject({
      type: 'message',
      message: { id: 'm1', ttsText: 'Salut', language: 'tn', ticketId: null, tokensUsed: null, toolName: null },
    });
  });

  it('rejects a message without id', () => {
    expect(parseServerEvent(frame('message', { conversationId: 'c1', content: 'x' }))).toBeNull();
  });

  it('parses typing, no_speech, errors and audio events', () => {
    expect(parseServerEvent(frame('typing', { isTyping: true }))).toEqual({ type: 'typing', isTyping: true });
    expect(parseServerEvent(frame('typing', {}))).toEqual({ type: 'typing', isTyping: false });
    expect(parseServerEvent(frame('no_speech'))).toEqual({ type: 'no_speech' });
    expect(parseServerEvent(frame('error', { message: 'boom' }))).toEqual({ type: 'error', code: 'ERROR', message: 'boom' });
    expect(parseServerEvent(frame('audio_start', { format: 'mp3', mediaType: 'audio/mpeg', chunks: 4 }))).toEqual({
      type: 'audio_start',
      format: 'mp3',
      mediaType: 'audio/mpeg',
      chunks: 4,
    });
    expect(parseServerEvent(frame('audio_end', { ttsFirstMs: 300, totalMs: 900 }))).toEqual({
      type: 'audio_end',
      ttsFirstMs: 300,
      totalMs: 900,
    });
  });

  it('treats an empty conversation_closed reason as null', () => {
    expect(parseServerEvent(frame('conversation_closed', {}))).toEqual({ type: 'conversation_closed', reason: null });
    expect(parseServerEvent(frame('conversation_closed', { reason: '' }))).toEqual({ type: 'conversation_closed', reason: null });
    expect(parseServerEvent(frame('conversation_closed', { reason: 'ESCALATED' }))).toEqual({
      type: 'conversation_closed',
      reason: 'ESCALATED',
    });
  });
});

describe('closed reasons', () => {
  it.each([
    [null, 'RESOLVED'],
    ['RESOLVED', 'RESOLVED'],
    ['closed', 'RESOLVED'],
    ['idle_timeout', 'TIMEOUT'],
    ['ESCALATED', 'ESCALATED'],
    ['Réclamation complexe', 'ESCALATED'],
  ] as const)('%s -> %s', (input, expected) => {
    expect(closedReasonFrom(input)).toBe(expected);
  });

  it('maps reasons to conversation statuses', () => {
    expect(statusForClosedReason('RESOLVED')).toBe('RESOLVED');
    expect(statusForClosedReason('ESCALATED')).toBe('ESCALATED');
    expect(statusForClosedReason('TIMEOUT')).toBe('ABANDONED');
    expect(statusForClosedReason('CONNECTION_LOST')).toBe('ABANDONED');
  });
});

describe('buildWsUrl', () => {
  const https = { protocol: 'https:', host: 'ars.tn' };
  const http = { protocol: 'http:', host: 'localhost:3000' };

  it('derives from location when unset or blank', () => {
    expect(buildWsUrl('chat', undefined, https)).toBe('wss://ars.tn/ws/chat');
    expect(buildWsUrl('voice', '', http)).toBe('ws://localhost:3000/ws/voice');
    expect(buildWsUrl('chat', '   ', http)).toBe('ws://localhost:3000/ws/chat');
  });

  it('uses the configured origin and strips trailing slashes', () => {
    expect(buildWsUrl('voice', 'wss://api.ars.tn//', http)).toBe('wss://api.ars.tn/ws/voice');
  });
});

describe('helpers', () => {
  it('splits buffers into frames', () => {
    const frames = splitIntoFrames(new ArrayBuffer(AUDIO_FRAME_BYTES * 2 + 10));
    expect(frames.map((f) => f.byteLength)).toEqual([AUDIO_FRAME_BYTES, AUDIO_FRAME_BYTES, 10]);
    expect(splitIntoFrames(new ArrayBuffer(0))).toEqual([]);
  });

  it('keeps a valid sentiment label, otherwise derives it from the score', () => {
    expect(sentimentLabelFor(0.9, 'INSATISFAIT')).toBe('INSATISFAIT');
    expect(sentimentLabelFor(0.6, 'weird')).toBe('SATISFAIT');
    expect(sentimentLabelFor(-0.6, undefined)).toBe('INSATISFAIT');
    expect(sentimentLabelFor(0, null)).toBe('NEUTRE');
  });

  it('maps reply languages', () => {
    expect(toReplyLanguage('tn')).toBe('tn');
    expect(toReplyLanguage('ar-TN')).toBe('tn');
    expect(toReplyLanguage('fr')).toBe('fr');
    expect(toReplyLanguage(undefined)).toBe('fr');
  });

  it('generates ids even without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', undefined);
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });
});
