import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: number;       // percent change (+/-)
  subtitle?: string;
}

export default function KPICard({ title, value, icon: Icon, iconColor = 'text-navy-600', trend, subtitle }: KPICardProps) {
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend === undefined ? '' : trend > 0 ? 'text-sage-600' : trend < 0 ? 'text-red-600' : 'text-slate-500';

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={cn('h-9 w-9 rounded-lg bg-navy-50 flex items-center justify-center', iconColor.replace('text-', 'text-'))}>
          <Icon className={cn('h-4.5 w-4.5', iconColor)} />
        </div>
        {TrendIcon && trend !== undefined && (
          <span className={cn('flex items-center gap-0.5 text-xs font-medium', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{title}</p>
      {subtitle && <p className="text-2xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}