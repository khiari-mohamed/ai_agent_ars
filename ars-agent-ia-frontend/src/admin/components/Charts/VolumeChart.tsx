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
            <stop offset="5%"  stopColor="#2d62a8" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#2d62a8" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3e7e3b" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3e7e3b" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }}
          cursor={{ stroke: '#e2e8f0' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="total"    name="Total"    stroke="#2d62a8" fill="url(#colorTotal)"    strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="resolved" name="Résolues" stroke="#3e7e3b" fill="url(#colorResolved)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}