import { cn } from '@/lib/utils';
import type { SentimentLabel } from '@/types/conversation';
import { scoreToPercent } from '@/lib/utils';

interface SentimentPulseProps {
  score: number;
  label: SentimentLabel;
}

const colorMap: Record<SentimentLabel, { bar: string; text: string; bg: string }> = {
  SATISFAIT:   { bar: 'bg-sage-400',  text: 'text-sage-700',  bg: 'bg-sage-50'  },
  NEUTRE:      { bar: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  INSATISFAIT: { bar: 'bg-red-400',   text: 'text-red-700',   bg: 'bg-red-50'   },
};

const labelText: Record<SentimentLabel, string> = {
  SATISFAIT:   'Satisfait',
  NEUTRE:      'Neutre',
  INSATISFAIT: 'Insatisfait',
};

export default function SentimentPulse({ score, label }: SentimentPulseProps) {
  const pct = scoreToPercent(score);
  const colors = colorMap[label];

  return (
    <div
      className={cn('px-4 py-1.5 flex items-center gap-2', colors.bg)}
      role="status"
      aria-label={`Sentiment de la conversation : ${labelText[label]}`}
    >
      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', colors.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-2xs font-medium whitespace-nowrap', colors.text)}>
        {labelText[label]}
      </span>
    </div>
  );
}