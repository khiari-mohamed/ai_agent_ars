import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SentimentDataPoint } from '@/types/admin';

interface SentimentTrendProps {
  data: SentimentDataPoint[];
}

export default function SentimentTrend({ data }: SentimentTrendProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'dd MMM', { locale: fr }),
    pct: Math.round(((d.avg + 1) / 2) * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e2df" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
        <ReferenceLine y={50} stroke="#e2e8f0" strokeDasharray="4 2" />
        <Tooltip
          formatter={(v: number) => [`${v}%`, 'Satisfaction']}
          contentStyle={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.7)',
            borderRadius: 14,
            fontSize: 12,
            boxShadow: '0 8px 32px -8px rgb(15 18 24 / 0.15)',
          }}
        />
        <Line
          type="monotone"
          dataKey="pct"
          stroke="#d62121"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#d62121', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}