import type { CSSProperties } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceControlProps {
  isRecording: boolean;
  isSpeaking: boolean;
  /** RMS level of the microphone, 0..1 */
  audioLevel: number;
  /** The agent is processing the last utterance. */
  isProcessing: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

function statusText(p: VoiceControlProps): string {
  if (p.isRecording) return p.isSpeaking ? 'Je vous écoute…' : 'Parlez maintenant…';
  if (p.isProcessing) return 'Traitement en cours…';
  if (p.disabled) return 'Connexion…';
  return 'Appuyer pour parler';
}

export default function VoiceControl(props: VoiceControlProps) {
  const { isRecording, audioLevel, isProcessing, disabled, onStart, onStop, onCancel } = props;
  const blocked = disabled || (isProcessing && !isRecording);
  const ringStyle = { '--lvl': 1 + Math.min(audioLevel * 5, 0.5) } as CSSProperties;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <span
            aria-hidden
            style={ringStyle}
            className="absolute h-16 w-16 rounded-full bg-red-400/30 scale-[var(--lvl)] motion-reduce:scale-100 transition-transform duration-75"
          />
        )}
        <button
          type="button"
          onClick={isRecording ? onStop : onStart}
          disabled={blocked}
          aria-pressed={isRecording}
          aria-label={isRecording ? 'Terminer et envoyer' : 'Commencer un enregistrement vocal'}
          className={cn(
            'relative h-16 w-16 rounded-full flex items-center justify-center text-white',
            'transition-all duration-200 active:scale-95 motion-reduce:transition-none',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
            isRecording
              ? 'bg-slate-700 hover:bg-slate-800 shadow-glass'
              : 'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] shadow-glow-red hover:shadow-glow-red-lg',
          )}
        >
          {isRecording ? <Square className="h-5 w-5" aria-hidden /> : <Mic className="h-6 w-6" aria-hidden />}
        </button>
        {isRecording && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Annuler l'enregistrement"
            title="Annuler"
            className="absolute -right-12 h-8 w-8 rounded-full bg-white/70 border border-white/70 text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-glass-sm"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <p role="status" className="text-sm font-medium text-slate-700">
        {statusText(props)}
      </p>
      <p className="text-center text-[11px] text-slate-500">
        L&apos;envoi est automatique dès que vous arrêtez de parler.
      </p>
    </div>
  );
}