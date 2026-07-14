import { useRef, useEffect } from 'react';
import { MoreVertical, RefreshCw, Phone } from 'lucide-react';
import { useConversationStore } from '@/store/conversationStore';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import MessageBubble from './MessageBubble.tsx';
import TypingIndicator from './TypingIndicator.tsx';
import AuthForm from './AuthForm.tsx';
import MessageInput from './MessageInput.tsx';
import SentimentPulse from './SentimentPulse.tsx';
import Spinner from '@/shared/components/Spinner';

interface ChatWindowProps {
  sessionId: string;
  onClose: () => void;
  onReset: () => void;
}

export default function ChatWindow({ sessionId, onClose, onReset }: ChatWindowProps) {
  const messages      = useConversationStore((s) => s.messages);
  const authState     = useConversationStore((s) => s.authState);
  const isConnected   = useConversationStore((s) => s.isConnected);
  const isAgentTyping = useConversationStore((s) => s.isAgentTyping);
  const status        = useConversationStore((s) => s.status);
  const sentimentScore= useConversationStore((s) => s.sentimentScore);
  const sentimentLabel= useConversationStore((s) => s.sentimentLabel);

  const bottomRef = useRef<HTMLDivElement>(null);
  const { sendMessage, sendCin, sendOtp, closeConversation } = useWebSocket(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAgentTyping]);

  const isResolved = status === 'RESOLVED' || status === 'ESCALATED';
  const showAuthForm = authState === 'PENDING_CIN' || authState === 'PENDING_OTP' || authState === 'IDLE';
  const canShowInput = authState === 'AUTHENTICATED' && !isResolved;

  return (
    <div className="flex flex-col h-[580px] bg-white rounded-2xl shadow-widget overflow-hidden border border-slate-200/80">
      {/* Header */}
      <div className="bg-[#d62121] px-4 py-3.5 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-shrink-0">
          <img
            src="/Image1.png"
            alt="ARS Tunisie"
            className="h-9 w-auto rounded-full object-contain bg-white/90 p-1"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#d62121] ${isConnected ? 'bg-sage-400' : 'bg-slate-400'}`}
            aria-label={isConnected ? 'Connecté' : 'Déconnecté'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight">Agent ARS Tunisie</p>
          <p className="text-navy-200 text-xs">
            {isConnected ? (isAgentTyping ? 'en train de répondre…' : 'En ligne') : 'Connexion…'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            className="p-1.5 rounded-lg hover:bg-[#b51a1a] text-navy-200 hover:text-white transition-colors"
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              closeConversation();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-[#b51a1a] text-navy-200 hover:text-white transition-colors"
            aria-label="Fermer le chat"
            title="Fermer le chat"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sentiment pulse bar — signature element */}
      {messages.length > 0 && (
        <SentimentPulse score={sentimentScore} label={sentimentLabel} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-hidden" role="log" aria-live="polite" aria-label="Conversation">
        {!isConnected && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Spinner size="md" className="mx-auto mb-2 text-[#d62121]" />
              <p className="text-sm text-[#d62121]">Connexion en cours…</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={idx === messages.length - 1}
          />
        ))}

        {isAgentTyping && <TypingIndicator />}

        {isResolved && (
          <div className="flex justify-center pt-2">
            <span className="text-xs text-slate-400 bg-surface-raised px-3 py-1.5 rounded-full border border-surface-border">
              {status === 'RESOLVED' ? 'Conversation terminée' : 'Transféré à un conseiller'}
            </span>
          </div>
        )}

        <div ref={bottomRef} aria-hidden />
      </div>

      {/* Auth Form (when needed) */}
      {showAuthForm && !isResolved && messages.length > 0 && (
        <div className="border-t border-surface-border px-4 py-3">
          <AuthForm
            authState={authState}
            onSubmitCin={sendCin}
            onSubmitOtp={sendOtp}
          />
        </div>
      )}

      {/* Input */}
      {canShowInput && (
        <div className="border-t border-surface-border px-3 py-3 flex-shrink-0">
          <MessageInput onSend={sendMessage} disabled={!isConnected} />
        </div>
      )}

      {/* Closed state */}
      {isResolved && (
        <div className="border-t border-surface-border px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0">
          <button
            onClick={onReset}
            className="btn-secondary text-xs px-3 py-2 flex-1"
          >
            Nouvelle conversation
          </button>
          <a
            href="tel:+21671000000"
            className="btn-primary text-xs px-3 py-2 flex-1 no-underline flex items-center justify-center gap-1"
          >
            <Phone className="h-3.5 w-3.5" />
            Appeler ARS
          </a>
        </div>
      )}
    </div>
  );
}