import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, MessageSquare, Mic, Minus, RefreshCw, Volume2 } from 'lucide-react';
import { useConversationStore } from '@/store/conversationStore';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import type { Transport } from '@/lib/ws/protocol';
import { STRINGS } from '@/lib/strings';
import { cn } from '@/lib/utils';
import Spinner from '@/shared/components/Spinner';
import MessageBubble from './MessageBubble.tsx';
import TypingIndicator from './TypingIndicator.tsx';
import MessageInput from './MessageInput.tsx';
import SentimentPulse from './SentimentPulse.tsx';
import VoiceControl from './VoiceControl.tsx';

interface ChatWindowProps {
  onClose: () => void;
  onReset: () => void;
}

interface ModeTabProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Mic;
  label: string;
}

function ModeTab({ active, onClick, icon: Icon, label }: ModeTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
        active ? 'bg-red-50 text-[#b51a1a]' : 'text-slate-500 hover:bg-white/50',
      )}
    >
      <Icon className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

const HEADER_BUTTON =
  'p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/60';

/** Owns the transport; each transport is a separate session, so switching remounts the session. */
export default function ChatWindow({ onClose, onReset }: ChatWindowProps) {
  const [transport, setTransport] = useState<Transport>('chat');

  const changeTransport = useCallback(
    (next: Transport) => {
      if (next === transport) return;
      const { messages } = useConversationStore.getState();
      if (messages.some((m) => m.role === 'user') && !window.confirm(STRINGS.switchModeConfirm)) return;
      useConversationStore.getState().reset();
      setTransport(next);
    },
    [transport],
  );

  return (
    <ChatSession
      key={transport}
      transport={transport}
      onTransportChange={changeTransport}
      onClose={onClose}
      onReset={onReset}
    />
  );
}

interface ChatSessionProps extends ChatWindowProps {
  transport: Transport;
  onTransportChange: (next: Transport) => void;
}

function ChatSession({ transport, onTransportChange, onClose, onReset }: ChatSessionProps) {
  const messages = useConversationStore((s) => s.messages);
  const connection = useConversationStore((s) => s.connection);
  const isAgentTyping = useConversationStore((s) => s.isAgentTyping);
  const status = useConversationStore((s) => s.status);
  const closedReason = useConversationStore((s) => s.closedReason);
  const sentimentScore = useConversationStore((s) => s.sentimentScore);
  const sentimentLabel = useConversationStore((s) => s.sentimentLabel);

  const {
    connect,
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
  } = useWebSocket(transport);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const isClosed = status !== 'IDLE' && status !== 'ACTIVE';
  const isReady = connection === 'open' && status === 'ACTIVE';

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages.length, isAgentTyping, voiceError, isClosed]);

  const headerStatus =
    connection === 'open'
      ? isAgentTyping
        ? transport === 'voice'
          ? 'traitement…'
          : 'en train de répondre…'
        : 'En ligne'
      : connection === 'closed'
        ? 'Indisponible'
        : 'Connexion…';

  return (
    <div className="relative flex flex-col h-[min(580px,calc(100dvh-8rem))] rounded-[28px] overflow-hidden bg-white/70 backdrop-blur-2xl border border-white/60 shadow-glass-lg ring-1 ring-black/[0.02]">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-red-400/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-sage-400/10 blur-3xl" aria-hidden />

      {/* Header */}
      <div className="relative px-4 py-3.5 flex items-center gap-3 flex-shrink-0 bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
        <div className="relative flex-shrink-0">
          <img
            src="/Image1.png"
            alt="ARS Tunisie"
            className="h-9 w-9 rounded-full object-contain bg-white/95 p-1 shadow-md ring-2 ring-white/40"
          />
          <span
            role="img"
            aria-label={connection === 'open' ? 'Connecté' : 'Déconnecté'}
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#d62121]',
              connection === 'open' ? 'bg-sage-400' : 'bg-slate-300',
            )}
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight drop-shadow-sm">Agent ARS Tunisie</p>
          <p className="text-white/80 text-xs">{headerStatus}</p>
        </div>
        <div className="relative flex items-center gap-1">
          {status === 'ACTIVE' && (
            <button type="button" onClick={closeConversation} className={HEADER_BUTTON} aria-label="Terminer la conversation" title="Terminer la conversation">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button type="button" onClick={onReset} className={HEADER_BUTTON} aria-label="Nouvelle conversation" title="Nouvelle conversation">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onClose} className={HEADER_BUTTON} aria-label="Réduire le chat" title="Réduire">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {sentimentScore !== null && sentimentLabel !== null && (
        <SentimentPulse score={sentimentScore} label={sentimentLabel} />
      )}

      {!isClosed && (
        <div className="relative flex gap-1 px-3 pt-3">
          <ModeTab active={transport === 'chat'} onClick={() => onTransportChange('chat')} icon={MessageSquare} label="Chat" />
          <ModeTab active={transport === 'voice'} onClick={() => onTransportChange('voice')} icon={Mic} label="Voix" />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-hidden"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && (connection === 'idle' || connection === 'connecting') && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Spinner size="md" className="mx-auto mb-2 text-[#d62121]" />
              <p className="text-sm text-[#d62121]">Connexion en cours…</p>
            </div>
          </div>
        )}

        {connection === 'closed' && messages.length === 0 && !isClosed && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-600">Impossible de se connecter au service pour le moment.</p>
            <button type="button" onClick={connect} className="btn-secondary text-xs px-3 py-2">
              <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
              Réessayer
            </button>
          </div>
        )}

        {connection === 'open' && messages.length === 0 && !isClosed && (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <p className="text-sm text-slate-500 leading-relaxed">
              Bonjour, je suis l&apos;assistant ARS Tunisie.
              <br />
              {transport === 'voice'
                ? 'Appuyez sur le micro et posez votre question.'
                : 'Posez votre question, je vous réponds.'}
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={msg.id} message={msg} isLast={idx === messages.length - 1} />
        ))}

        {isAgentTyping && <TypingIndicator />}

        {audioNeedsGesture && (
          <div className="flex justify-center pt-2">
            <button type="button" onClick={resumeAudio} className="btn-secondary text-xs px-3 py-2">
              <Volume2 className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
              Écouter la réponse audio
            </button>
          </div>
        )}

        {voiceError && (
          <div role="alert" className="flex items-center justify-center gap-2 px-2 py-1 text-xs text-red-600">
            <span>{voiceError}</span>
            <button type="button" onClick={clearVoiceError} className="underline underline-offset-2 hover:text-red-800">
              Fermer
            </button>
          </div>
        )}

        {isClosed && (
          <div className="flex justify-center pt-2">
            <span className="text-xs text-slate-500 bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/60 shadow-glass-sm">
              {STRINGS.closed[closedReason ?? 'RESOLVED']}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      {!isClosed && transport === 'chat' && (
        <div className="relative border-t border-white/50 bg-white/30 backdrop-blur-md px-3 py-3 flex-shrink-0">
          <MessageInput onSend={sendMessage} disabled={!isReady} busy={isAgentTyping} />
        </div>
      )}

      {!isClosed && transport === 'voice' && (
        <div className="relative border-t border-white/50 bg-white/30 backdrop-blur-md px-3 py-4 flex-shrink-0">
          <VoiceControl
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            isProcessing={isAgentTyping}
            disabled={!isReady}
            onStart={() => void startRecording()}
            onStop={stopRecording}
            onCancel={cancelRecording}
          />
        </div>
      )}

      {isClosed && (
        <div className="relative border-t border-white/50 bg-white/30 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0">
          <button type="button" onClick={onReset} className="btn-secondary text-xs px-3 py-2 flex-1">
            Nouvelle conversation
          </button>
          <span className="flex-1 text-center text-xs text-slate-500">Contactez l’ARS par les canaux habituels.</span>
        </div>
      )}
    </div>
  );
}