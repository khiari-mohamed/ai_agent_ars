import Badge from '@/shared/components/Badge';
import { sentimentBgColor } from '@/lib/utils';
import type { SentimentLabel } from '@/types/conversation';

const labelMap: Record<SentimentLabel, string> = {
  SATISFAIT:   'Satisfait',
  NEUTRE:      'Neutre',
  INSATISFAIT: 'Insatisfait',
};

export default function SentimentBadge({ label }: { label: SentimentLabel }) {
  return (
    <Badge className={sentimentBgColor(label)} dot>
      {labelMap[label]}
    </Badge>
  );
}