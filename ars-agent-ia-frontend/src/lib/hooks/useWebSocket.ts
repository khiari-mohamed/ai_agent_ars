import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import type { Message, MessageRole } from '@/types/conversation';
import { STRINGS } from '@/lib/strings';
import {
  MAX_TEXT_LENGTH,
  buildWsUrl,
  clientMessage,
  closedReasonFrom,
  newId,
  parseServerEvent,
  splitIntoFrames,
  toReplyLanguage,
  type ServerEvent,
  type ServerMessage,
  type Transport,
} from '@/lib/ws/protocol';
import { VoicePlayer } from '@/lib/audio/player';
import { UtteranceRecorder, recorderErrorMessage, type RecordingResult } from '@/lib/audio/recorder';

const WS_ORIGIN: string | undefined = import.meta.env.VITE_WS_URL;
const MAX_CONNECT_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 8_000;
const REPLY_WATCHDOG_MS = 90_000;

const ROLES: readonly MessageRole[] = ['user', 'assistant', 'system', 'tool'];

function toRole(value: string): MessageRole {
  return ROLES.find((r) => r === value) ?? 'assistant';
}

function toChatMessage(m: ServerMessage): Message {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: toRole(m.role),
    content: m.content,
    ttsText: m.ttsText,
    language: m.language,
    ticketId: m.ticketId,
    timestamp: m.timestamp,
    tokensUsed: m.tokensUsed,
    toolName: m.toolName,
  };
}

function localMessage(role: MessageRole, content: string, language?: Message['language']): Message {
  return {
    id: newId(),
    conversationId: useConversationStore.getState().conversationId ?? '',
    role,
    content,
    ...(language ? { language } : {}),
    timestamp: new Date().toISOString(),
    tokensUsed: null,
    toolName: null,
  };
}

function clearTimer(ref: { current: number | null }): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

export function useWebSocket(transport: Transport = 'chat') {
  const wsRef = useRef<WebSocket | null>(null);
  const sessionReadyRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const startTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const playerRef = useRef<VoicePlayer | null>(null);
  const recorderRef = useRef<UtteranceRecorder | null>(null);
  const openRef = useRef<() => void>(() => undefined);

  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

  const addSystem = useCallback((text: string) => {
    useConversationStore.getState().addMessage(localMessage('system', text));
  }, []);

  const clearWatchdog = useCallback(() => clearTimer(watchdogRef), []);

  const armWatchdog = useCallback(() => {
    clearTimer(watchdogRef);
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      useConversationStore.getState().setAgentTyping(false);
      addSystem(STRINGS.replyTimeout);
    }, REPLY_WATCHDOG_MS);
  }, [addSystem]);

  const getPlayer = useCallback((): VoicePlayer => {
    if (!playerRef.current) {
      playerRef.current = new VoicePlayer({
        onState: (state) => setAudioNeedsGesture(state === 'blocked'),
        onError: (kind) =>
          setVoiceError(kind === 'unsupported' ? STRINGS.audioUnsupported : STRINGS.audioPlaybackFailed),
      });
    }
    return playerRef.current;
  }, []);

  const resetRecordingUi = useCallback(() => {
    setIsRecording(false);
    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  const stopMedia = useCallback(() => {
    recorderRef.current?.cancel();
    playerRef.current?.stop();
    resetRecordingUi();
    setAudioNeedsGesture(false);
  }, [resetRecordingUi]);

  const closeSocket = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    sessionReadyRef.current = false;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close(1000, 'client_close');
    } catch {
      // already closed
    }
  }, []);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      const store = useConversationStore.getState();
      switch (event.type) {
        case 'session':
          sessionReadyRef.current = true;
          attemptRef.current = 0;
          store.setConversationId(event.conversationId);
          store.setStatus('ACTIVE');
          break;
        case 'message':
          clearWatchdog();
          store.setAgentTyping(false);
          store.setConversationId(event.message.conversationId);
          store.addMessage(toChatMessage(event.message));
          if (event.message.ticketId) store.setTicketId(event.message.ticketId);
          break;
        case 'typing':
          store.setAgentTyping(event.isTyping);
          if (!event.isTyping) clearWatchdog();
          break;
        case 'sentiment':
          store.setSentiment(event.score, event.label);
          break;
        case 'transcript':
          if (event.text.trim()) {
            store.addMessage(localMessage('user', event.text, toReplyLanguage(event.language)));
          }
          break;
        case 'no_speech':
          clearWatchdog();
          store.setAgentTyping(false);
          addSystem(STRINGS.noSpeech);
          break;
        case 'audio_start':
          getPlayer().begin(event.format);
          break;
        case 'audio_end':
          playerRef.current?.end();
          break;
        case 'error':
          clearWatchdog();
          store.setAgentTyping(false);
          if (event.code === 'TTS_ERROR') setVoiceError(STRINGS.ttsUnavailable);
          else addSystem(event.message || STRINGS.genericError);
          break;
        case 'conversation_closed':
          clearWatchdog();
          store.finish(closedReasonFrom(event.reason));
          closeSocket();
          break;
      }
    },
    [addSystem, clearWatchdog, closeSocket, getPlayer],
  );

  const openSocket = useCallback(() => {
    if (unmountedRef.current) return;
    const existing = wsRef.current;
    if (existing && existing.readyState <= WebSocket.OPEN) return;
    clearTimer(retryTimerRef);

    const store = useConversationStore.getState();
    store.setConnection('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl(transport, WS_ORIGIN, window.location));
    } catch {
      store.setConnection('closed');
      return;
    }
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      useConversationStore.getState().setConnection('open');
    };

    ws.onmessage = (message: MessageEvent<string | ArrayBuffer>) => {
      const data = message.data;
      if (typeof data === 'string') {
        const parsed = parseServerEvent(data);
        if (parsed) handleEvent(parsed);
      } else if (data instanceof ArrayBuffer) {
        playerRef.current?.push(data);
      }
    };

    ws.onerror = () => {
      // onclose always follows and carries the handling
    };

    ws.onclose = () => {
      wsRef.current = null;
      const hadSession = sessionReadyRef.current;
      sessionReadyRef.current = false;
      stopMedia();
      clearWatchdog();
      const current = useConversationStore.getState();
      if (hadSession) {
        current.finish('TIMEOUT');
        addSystem(STRINGS.connectionLost);
        return;
      }
      if (attemptRef.current < MAX_CONNECT_ATTEMPTS && !unmountedRef.current) {
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        retryTimerRef.current = window.setTimeout(() => openRef.current(), delay);
      } else {
        current.setConnection('closed');
      }
    };
  }, [addSystem, clearWatchdog, handleEvent, stopMedia, transport]);

  const disconnect = useCallback(() => {
    clearTimer(retryTimerRef);
    clearTimer(startTimerRef);
    clearWatchdog();
    stopMedia();
    closeSocket();
    useConversationStore.getState().setAgentTyping(false);
    const { connection } = useConversationStore.getState();
    if (connection === 'open' || connection === 'connecting') {
      useConversationStore.getState().setConnection('closed');
    }
  }, [clearWatchdog, closeSocket, stopMedia]);

  const connect = useCallback(() => {
    attemptRef.current = 0;
    openSocket();
  }, [openSocket]);

  /** Fresh conversation: drops the old state and opens a new session. */
  const restart = useCallback(() => {
    disconnect();
    useConversationStore.getState().reset();
    setVoiceError(null);
    attemptRef.current = 0;
    openSocket();
  }, [disconnect, openSocket]);

  const sendMessage = useCallback(
    (raw: string): boolean => {
      const content = raw.trim();
      const ws = wsRef.current;
      const store = useConversationStore.getState();
      if (transport !== 'chat' || !content) return false;
      if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReadyRef.current) return false;
      if (store.status !== 'ACTIVE' || store.isAgentTyping) return false;
      if (content.length > MAX_TEXT_LENGTH) {
        addSystem(STRINGS.messageTooLong);
        return false;
      }
      store.addMessage(localMessage('user', content));
      store.setAgentTyping(true);
      armWatchdog();
      ws.send(clientMessage.text(content));
      return true;
    },
    [addSystem, armWatchdog, transport],
  );

  const closeConversation = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(clientMessage.close());
  }, []);

  const sendUtterance = useCallback(
    (result: RecordingResult) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setVoiceError(STRINGS.voiceSendFailed);
        return;
      }
      const store = useConversationStore.getState();
      store.setAgentTyping(true);
      armWatchdog();
      ws.send(clientMessage.audioStart(result.format));
      result.blob
        .arrayBuffer()
        .then((buffer) => {
          if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) throw new Error('socket_closed');
          for (const frame of splitIntoFrames(buffer)) ws.send(frame);
          ws.send(clientMessage.endOfSpeech());
        })
        .catch(() => {
          clearWatchdog();
          useConversationStore.getState().setAgentTyping(false);
          setVoiceError(STRINGS.voiceSendFailed);
        });
    },
    [armWatchdog, clearWatchdog],
  );

  const getRecorder = useCallback((): UtteranceRecorder => {
    if (!recorderRef.current) {
      recorderRef.current = new UtteranceRecorder({
        onLevel: (level, speaking) => {
          setAudioLevel(Math.round(level * 100) / 100);
          setIsSpeaking(speaking);
        },
        onComplete: (result) => {
          resetRecordingUi();
          sendUtterance(result);
        },
        onDiscard: (reason) => {
          resetRecordingUi();
          if (reason !== 'cancelled') addSystem(STRINGS.noSpeech);
        },
        onError: (error) => {
          resetRecordingUi();
          setVoiceError(recorderErrorMessage(error));
        },
      });
    }
    return recorderRef.current;
  }, [addSystem, resetRecordingUi, sendUtterance]);

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    const ws = wsRef.current;
    const store = useConversationStore.getState();
    if (transport !== 'voice' || !ws || ws.readyState !== WebSocket.OPEN || !sessionReadyRef.current) {
      setVoiceError(STRINGS.voiceUnavailable);
      return;
    }
    if (store.isAgentTyping || store.status !== 'ACTIVE') return;
    const player = getPlayer();
    void player.unlock(); // inside the user gesture: lifts the autoplay block
    player.stop(); // barge-in
    const recorder = getRecorder();
    try {
      await recorder.start();
      setIsRecording(recorder.isRecording);
    } catch (error) {
      resetRecordingUi();
      setVoiceError(recorderErrorMessage(error));
    }
  }, [getPlayer, getRecorder, resetRecordingUi, transport]);

  const stopRecording = useCallback(() => recorderRef.current?.stop(), []);
  const cancelRecording = useCallback(() => recorderRef.current?.cancel(), []);

  const resumeAudio = useCallback(() => {
    void playerRef.current?.unlock();
  }, []);

  const clearVoiceError = useCallback(() => setVoiceError(null), []);

  useEffect(() => {
    openRef.current = openSocket;
  }, [openSocket]);

  useEffect(() => {
    unmountedRef.current = false;
    // Deferred so React StrictMode's mount/unmount/mount never opens a throw-away session.
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      attemptRef.current = 0;
      openRef.current();
    }, 0);
    return () => {
      unmountedRef.current = true;
      disconnect();
      recorderRef.current?.cancel();
      recorderRef.current = null;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    restart,
    sendMessage,
    closeConversation,
    startRecording,
    stopRecording,
    cancelRecording,
    resumeAudio,
    clearVoiceError,
    isRecording,
    isSpeaking,
    audioLevel,
    voiceError,
    audioNeedsGesture,
  };
}