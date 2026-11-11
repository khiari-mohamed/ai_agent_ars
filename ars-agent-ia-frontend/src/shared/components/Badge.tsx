import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  dot?: boolean;
}

export default function Badge({ children, className, dot = false, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {dot ? <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}