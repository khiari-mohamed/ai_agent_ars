import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (p: number) => void;
  className?: string;
}

export default function Pagination({ page, totalPages, onNext, onPrev, onGoTo, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
        aria-label="Page précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm select-none">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onGoTo(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'h-8 w-8 rounded-lg text-sm font-medium transition-all duration-150',
              p === page
                ? 'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] text-white shadow-glow-red'
                : 'hover:bg-white/60 text-slate-600',
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={onNext}
        disabled={page === totalPages}
        className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
        aria-label="Page suivante"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}