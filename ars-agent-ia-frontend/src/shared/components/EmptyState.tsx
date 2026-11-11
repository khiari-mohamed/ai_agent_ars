import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      <div className="h-14 w-14 rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-glass-sm flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-[#b51a1a]/60" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs text-balance mb-4">{description}</p>
      {action}
    </div>
  );
}