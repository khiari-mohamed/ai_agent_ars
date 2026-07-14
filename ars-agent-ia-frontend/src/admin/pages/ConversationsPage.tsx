import { useState, useEffect, useCallback } from 'react';
import { Search, Filter } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ConversationTable from '../components/ConversationTable';
import Pagination from '@/shared/components/Pagination';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { usePagination } from '@/lib/hooks/usePagination';
import type { ConversationFilters, ConversationListItem } from '@/types/conversation';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const INITIAL_FILTERS: ConversationFilters = {
  search: '',
  channel: 'ALL',
  status: 'ALL',
  sentiment: 'ALL',
  dateFrom: '',
  dateTo: '',
};

export default function ConversationsPage() {
  const [filters, setFilters]       = useState<ConversationFilters>(INITIAL_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { page, limit, total, totalPages, setTotal, next, prev, goTo, reset } = usePagination(20);
  const { data, loading, run } = useAsync<{ items: ConversationListItem[]; total: number }>();

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filters.search), 400);
    return () => clearTimeout(id);
  }, [filters.search]);

  const load = useCallback(() => {
    run(adminApi.listConversations({ ...filters, search: debouncedSearch }, page, limit)).then((res) => {
      if (res) setTotal(res.total);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedSearch, page, limit]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = <K extends keyof ConversationFilters>(key: K, value: ConversationFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    reset();
  };

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader title="Conversations" subtitle={`${total} conversation${total !== 1 ? 's' : ''} trouvée${total !== 1 ? 's' : ''}`} />

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Rechercher par CIN, nom…"
              className="input-base pl-9"
            />
          </div>

          {/* Channel */}
          <select
            value={filters.channel}
            onChange={(e) => updateFilter('channel', e.target.value as ConversationFilters['channel'])}
            className="input-base w-auto"
            aria-label="Filtrer par canal"
          >
            <option value="ALL">Tous les canaux</option>
            <option value="CHAT_WEB">Chat Web</option>
            <option value="VOIP">Téléphone</option>
          </select>

          {/* Status */}
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value as ConversationFilters['status'])}
            className="input-base w-auto"
            aria-label="Filtrer par statut"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Active</option>
            <option value="RESOLVED">Résolue</option>
            <option value="ESCALATED">Escaladée</option>
            <option value="ABANDONED">Abandonnée</option>
          </select>

          {/* Sentiment */}
          <select
            value={filters.sentiment}
            onChange={(e) => updateFilter('sentiment', e.target.value as ConversationFilters['sentiment'])}
            className="input-base w-auto"
            aria-label="Filtrer par sentiment"
          >
            <option value="ALL">Tout sentiment</option>
            <option value="SATISFAIT">Satisfait</option>
            <option value="NEUTRE">Neutre</option>
            <option value="INSATISFAIT">Insatisfait</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : data && data.items.length > 0 ? (
          <>
            <ConversationTable items={data.items} />
            <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} sur {total}
              </p>
              <Pagination page={page} totalPages={totalPages} onNext={next} onPrev={prev} onGoTo={goTo} />
            </div>
          </>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Aucune conversation"
            description="Aucune conversation ne correspond à vos filtres."
          />
        )}
      </div>
    </div>
  );
}