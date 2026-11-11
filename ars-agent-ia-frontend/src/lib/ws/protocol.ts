import type { ClosedReason, ConversationStatus, ReplyLanguage, SentimentLabel } from '@/types/conversation';

export type Transport = 'chat' | 'voice';
export type AudioInputFormat = 'webm' | 'mp4' | 'container' | 'pcm16';

export const MAX_TEXT_LENGTH = 4000;
export const AUDIO_FRAME_BYTES = 64 * 1024;

export interface ServerMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  ttsText: string;
  language: ReplyLanguage;
  ticketId: string | null;
  timestamp: string;
  tokensUsed: number | null;
  toolName: string | null;
}

export type ServerEvent =
  | { type: 'session'; conversationId: string; inputFormats: string[]; outputFormat: string | null }
  | { type: 'message'; message: ServerMessage }
  | { type: 'typing'; isTyping: boolean }
  | { type: 'sentiment'; score: number; label: SentimentLabel }
  | { type: 'transcript'; text: string; language: string; languageConfidence: number }
  | { type: 'no_speech' }
  | { type: 'audio_start'; format: string; mediaType: string; chunks: number }
  | { type: 'audio_end'; ttsFirstMs: number; totalMs: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'conversation_closed'; reason: string | null };

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function toReplyLanguage(value: unknown): ReplyLanguage {
  return value === 'tn' || value === 'ar-TN' ? 'tn' : 'fr';
}

export function sentimentLabelFor(score: number, label: unknown): SentimentLabel {
  if (label === 'SATISFAIT' || label === 'NEUTRE' || label === 'INSATISFAIT') return label;
  if (score >= 0.25) return 'SATISFAIT';
  if (score <= -0.25) return 'INSATISFAIT';
  return 'NEUTRE';
}

/** Chat sends {} on user close, a non-empty escalation reason on escalation; voice sends codes. */
export function closedReasonFrom(reason: string | null): ClosedReason {
  const r = (reason ?? '').trim().toUpperCase();
  if (r === '' || r === 'RESOLVED' || r === 'CLOSED') return 'RESOLVED';
  if (r === 'IDLE_TIMEOUT' || r === 'TIMEOUT' || r === 'CONNECTION_LOST') return 'TIMEOUT';
  if (r === 'CONNECTION_LOST') return 'CONNECTION_LOST';
  return 'ESCALATED';
}

export function statusForClosedReason(reason: ClosedReason): ConversationStatus {
  if (reason === 'RESOLVED') return 'RESOLVED';
  if (reason === 'ESCALATED') return 'ESCALATED';
  return 'ABANDONED';
}

export function buildWsUrl(
  transport: Transport,
  configuredOrigin: string | undefined,
  location: { protocol: string; host: string },
): string {
  const path = transport === 'chat' ? '/ws/chat' : '/ws/voice';
  const configured = configuredOrigin?.trim().replace(/\/+$/, '');
  if (configured) return `${configured}${path}`;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${path}`;
}

export const clientMessage = {
  text: (content: string): string => JSON.stringify({ type: 'message', content }),
  close: (): string => JSON.stringify({ type: 'close' }),
  audioStart: (format: AudioInputFormat): string => JSON.stringify({ type: 'audio_start', format }),
  endOfSpeech: (): string => JSON.stringify({ type: 'end_of_speech' }),
};

export function splitIntoFrames(buffer: ArrayBuffer, frameBytes: number = AUDIO_FRAME_BYTES): ArrayBuffer[] {
  const frames: ArrayBuffer[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += frameBytes) {
    frames.push(buffer.slice(offset, Math.min(offset + frameBytes, buffer.byteLength)));
  }
  return frames;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Returns null for malformed or unknown events: callers just ignore them. */
export function parseServerEvent(raw: string): ServerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(parsed) || typeof parsed.type !== 'string') return null;
  const d: Obj = isObj(parsed.data) ? parsed.data : {};

  switch (parsed.type) {
    case 'session': {
      const conversationId = str(d.conversationId);
      if (!conversationId) return null;
      return {
        type: 'session',
        conversationId,
        inputFormats: Array.isArray(d.inputFormats) ? d.inputFormats.filter((f): f is string => typeof f === 'string') : [],
        outputFormat: strOrNull(d.outputFormat),
      };
    }
    case 'message': {
      const id = str(d.id);
      const conversationId = str(d.conversationId);
      if (!id || !conversationId) return null;
      const content = str(d.content);
      return {
        type: 'message',
        message: {
          id,
          conversationId,
          role: str(d.role, 'assistant'),
          content,
          ttsText: str(d.ttsText, content),
          language: toReplyLanguage(d.language),
          ticketId: strOrNull(d.ticketId),
          timestamp: str(d.timestamp, new Date().toISOString()),
          tokensUsed: numOrNull(d.tokensUsed),
          toolName: strOrNull(d.toolName),
        },
      };
    }
    case 'typing':
      return { type: 'typing', isTyping: d.isTyping === true };
    case 'sentiment': {
      const score = num(d.score);
      return { type: 'sentiment', score, label: sentimentLabelFor(score, d.label) };
    }
    case 'transcript':
      return {
        type: 'transcript',
        text: str(d.text),
        language: str(d.language, 'fr'),
        languageConfidence: num(d.languageConfidence),
      };
    case 'no_speech':
      return { type: 'no_speech' };
    case 'audio_start':
      return { type: 'audio_start', format: str(d.format), mediaType: str(d.mediaType), chunks: num(d.chunks) };
    case 'audio_end':
      return { type: 'audio_end', ttsFirstMs: num(d.ttsFirstMs), totalMs: num(d.totalMs) };
    case 'error':
      return { type: 'error', code: str(d.code, 'ERROR'), message: str(d.message) };
    case 'conversation_closed': {
      const reason = strOrNull(d.reason);
      return { type: 'conversation_closed', reason: reason && reason.length > 0 ? reason : null };
    }
    default:
      return null;
  }
}