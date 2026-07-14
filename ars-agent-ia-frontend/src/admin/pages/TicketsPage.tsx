import { useState, useEffect, useCallback } from 'react';
import { Search, Ticket } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Badge from '@/shared/components/Badge';
import Pagination from '@/shared/components/Pagination';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { usePagination } from '@/lib/hooks/usePagination';
import {
  ticketPriorityColor, ticketStatusColor, ticketStatusLabel,
  ticketCategoryLabel, formatRelative,
} from '@/lib/utils';
import type { TicketFilters, Ticket as TicketType } from '@/types/ticket';
import toast from 'react-hot-toast';

const INIT_FILTERS: TicketFilters = { search: '', status: 'ALL', priority: 'ALL', category: 'ALL' };

export default function TicketsPage() {
  const [filters, setFilters] = useState<TicketFilters>(INIT_FILTERS);
  const { page, limit, total, totalPages, setTotal, next, prev, goTo, reset } = usePagination(25);
  const { data, loading, run } = useAsync<{ items: TicketType[]; total: number }>();
  const updateStatus = useAsync<TicketType>();

  const load = useCallback(() => {
    run(adminApi.listTickets(filters, page, limit)).then((res) => {
      if (res) setTotal(res.total);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, limit]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = <K extends keyof TicketFilters>(key: K, val: TicketFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: val }));
    reset();
  };

  const handleStatusChange = async (id: string, status: TicketType['status']) => {
    const res = await updateStatus.run(adminApi.updateTicketStatus(id, status));
    if (res !== null) {
      toast.success('Statut mis à jour');
      load();
    }
  };

  const tickets = data?.items ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader title="Tickets CRM" subtitle={`${total} ticket${total !== 1 ? 's' : ''}`} />

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="Rechercher par sujet, assuré…"
            className="input-base pl-9"
          />
        </div>
        <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value as TicketFilters['status'])} className="input-base w-auto" aria-label="Statut">
          <option value="ALL">Tous les statuts</option>
          <option value="NOUVEAU">Nouveau</option>
          <option value="EN_COURS">En cours</option>
          <option value="EN_ATTENTE_VALIDATION">En attente</option>
          <option value="RESOLU">Résolu</option>
          <option value="FERME">Fermé</option>
        </select>
        <select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value as TicketFilters['priority'])} className="input-base w-auto" aria-label="Priorité">
          <option value="ALL">Toutes priorités</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">Haute</option>
          <option value="MEDIUM">Moyenne</option>
          <option value="LOW">Faible</option>
        </select>
        <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value as TicketFilters['category'])} className="input-base w-auto" aria-label="Catégorie">
          <option value="ALL">Toutes catégories</option>
          <option value="RECLAMATION">Réclamation</option>
          <option value="INFORMATION">Information</option>
          <option value="ELIGIBILITE">Éligibilité</option>
          <option value="TECHNIQUE">Technique</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : tickets.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Tickets">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Référence', 'Assuré', 'Sujet', 'Catégorie', 'Priorité', 'Statut', 'Date', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-raised transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-navy-600 font-medium">{t.crmId}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{t.assureNomComplet}</p>
                        <p className="text-2xs text-slate-400 font-mono">{t.assureCin}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-slate-700 text-xs truncate" title={t.subject}>{t.subject}</p>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-slate-600">{ticketCategoryLabel(t.category)}</span></td>
                      <td className="px-4 py-3"><Badge className={ticketPriorityColor(t.priority)}>{t.priority}</Badge></td>
                      <td className="px-4 py-3"><Badge className={ticketStatusColor(t.status)} dot>{ticketStatusLabel(t.status)}</Badge></td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatRelative(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={t.status}
                          onChange={(e) => handleStatusChange(t.id, e.target.value as TicketType['status'])}
                          className="text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#d62121]"
                          aria-label={`Changer statut du ticket ${t.crmId}`}
                        >
                          <option value="NOUVEAU">Nouveau</option>
                          <option value="EN_COURS">En cours</option>
                          <option value="EN_ATTENTE_VALIDATION">En attente</option>
                          <option value="RESOLU">Résolu</option>
                          <option value="FERME">Fermé</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between">
              <p className="text-xs text-slate-500">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} sur {total}</p>
              <Pagination page={page} totalPages={totalPages} onNext={next} onPrev={prev} onGoTo={goTo} />
            </div>
          </>
        ) : (
          <EmptyState icon={Ticket} title="Aucun ticket" description="Aucun ticket ne correspond à vos filtres." />
        )}
      </div>
    </div>
  );
}