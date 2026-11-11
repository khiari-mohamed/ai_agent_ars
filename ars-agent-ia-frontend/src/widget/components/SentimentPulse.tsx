import { cn, scoreToPercent } from '@/lib/utils';
import type { SentimentLabel } from '@/types/conversation';

interface SentimentPulseProps {
  score: number;
  label: SentimentLabel;
}

const colorMap: Record<SentimentLabel, { bar: string; text: string; bg: string }> = {
  SATISFAIT: { bar: 'bg-gradient-to-r from-sage-400 to-sage-500', text: 'text-sage-700', bg: 'bg-sage-50/60' },
  NEUTRE: { bar: 'bg-gradient-to-r from-amber-400 to-amber-500', text: 'text-amber-700', bg: 'bg-amber-50/60' },
  INSATISFAIT: { bar: 'bg-gradient-to-r from-red-400 to-red-500', text: 'text-red-700', bg: 'bg-red-50/60' },
};

const labelText: Record<SentimentLabel, string> = {
  SATISFAIT: 'Satisfait',
  NEUTRE: 'Neutre',
  INSATISFAIT: 'Insatisfait',
};

export default function SentimentPulse({ score, label }: SentimentPulseProps) {
  const pct = Math.min(100, Math.max(0, scoreToPercent(score)));
  const colors = colorMap[label];

  return (
    <div
      className={cn('relative px-4 py-1.5 flex items-center gap-2 backdrop-blur-md border-b border-white/40', colors.bg)}
      role="img"
      aria-label={`Sentiment de la conversation : ${labelText[label]}`}
    >
      <div className="flex-1 h-1.5 bg-white/50 rounded-full overflow-hidden shadow-inner">
        <div
          data-testid="sentiment-fill"
          className={cn('h-full rounded-full transition-all duration-700 ease-out motion-reduce:transition-none', colors.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-2xs font-semibold whitespace-nowrap', colors.text)}>{labelText[label]}</span>
    </div>
  );
}