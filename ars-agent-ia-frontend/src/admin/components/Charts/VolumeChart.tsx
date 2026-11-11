import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { VolumeDataPoint } from '@/types/admin';

interface VolumeChartProps {
  data: VolumeDataPoint[];
}

export default function VolumeChart({ data }: VolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#d62121" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#d62121" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3e7e3b" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#3e7e3b" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e2df" />
        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.7)',
            borderRadius: 14,
            fontSize: 12,
            boxShadow: '0 8px 32px -8px rgb(15 18 24 / 0.15)',
          }}
          cursor={{ stroke: '#d6212140' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="total"    name="Total"    stroke="#d62121" fill="url(#colorTotal)"    strokeWidth={2.5} dot={false} />
        <Area type="monotone" dataKey="resolved" name="Résolues" stroke="#3e7e3b" fill="url(#colorResolved)" strokeWidth={2.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}