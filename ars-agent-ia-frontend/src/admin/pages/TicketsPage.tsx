import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
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
import type { AdminUser } from '@/types/admin';
import type { TicketFilters, Ticket as TicketType } from '@/types/ticket';

const INIT_FILTERS: TicketFilters = { search: '', status: 'ALL', priority: 'ALL', category: 'ALL' };

const STATUS_OPTIONS: ReadonlyArray<{ value: TicketType['status']; label: string }> = [
  { value: 'NOUVEAU', label: 'Nouveau' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'EN_ATTENTE_VALIDATION', label: 'En attente' },
  { value: 'RESOLU', label: 'Résolu' },
  { value: 'FERME', label: 'Fermé' },
];

const rowSelect =
  'text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#d62121] disabled:opacity-50 max-w-[160px]';

export default function TicketsPage() {
  const [filters, setFilters] = useState<TicketFilters>(INIT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { page, limit, total, totalPages, setTotal, next, prev, goTo, reset } = usePagination(25);
  const tickets = useAsync<{ items: TicketType[]; total: number }>();
  const users = useAsync<AdminUser[]>();
  const { run } = tickets;
  const { run: runUsers } = users;

  const load = useCallback(() => {
    void run(adminApi.listTickets(filters, page, limit));
  }, [run, filters, page, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { void runUsers(adminApi.listUsers()); }, [runUsers]);

  const fetchedTotal = tickets.data?.total;
  useEffect(() => {
    if (fetchedTotal !== undefined) setTotal(fetchedTotal);
  }, [fetchedTotal, setTotal]);

  // Debounce the free-text search: one request per pause, not per keystroke.
  useEffect(() => {
    if (searchInput === filters.search) return undefined;
    const handle = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
      reset();
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, filters.search, reset]);

  const updateFilter = <K extends keyof TicketFilters>(key: K, val: TicketFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: val }));
    reset();
  };

  const patchTicket = async (
    id: string,
    patch: { status?: TicketType['status']; assignedTo?: string },
    success: string,
  ) => {
    setBusyId(id);
    try {
      await adminApi.updateTicket(id, patch);
      toast.success(success);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const rows = tickets.data?.items ?? [];
  const people = users.data ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader title="Tickets CRM" subtitle={`${total} ticket${total !== 1 ? 's' : ''}`} />

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={100}
            placeholder="Rechercher par sujet, assuré…"
            className="input-base pl-9"
            aria-label="Rechercher un ticket"
          />
        </div>
        <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value as TicketFilters['status'])} className="input-base w-auto" aria-label="Statut">
          <option value="ALL">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
          <option value="AUTRE">Autre</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {tickets.loading && !tickets.data ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : tickets.error && !tickets.data ? (
          <p role="alert" className="p-5 text-sm text-red-600">{tickets.error}</p>
        ) : rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Tickets">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Référence', 'Assuré', 'Sujet', 'Catégorie', 'Priorité', 'Statut', 'Date', 'Modifier le statut', 'Assigné à'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {rows.map((t) => {
                    const ref = t.crmId ?? t.id.slice(0, 8);
                    const busy = busyId === t.id;
                    return (
                      <tr key={t.id} className="hover:bg-surface-raised transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-navy-600 font-medium">
                          {t.conversationId
                            ? <Link to={`/admin/conversations/${t.conversationId}`} className="underline-offset-2 hover:underline" title="Ouvrir la conversation">{ref}</Link>
                            : ref}
                        </td>
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
                            disabled={busy}
                            onChange={(e) => void patchTicket(t.id, { status: e.target.value as TicketType['status'] }, 'Statut mis à jour')}
                            className={rowSelect}
                            aria-label={`Changer le statut du ticket ${ref}`}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={t.assignedTo ?? ''}
                            disabled={busy || people.length === 0}
                            onChange={(e) => void patchTicket(t.id, { assignedTo: e.target.value }, 'Ticket assigné')}
                            className={rowSelect}
                            aria-label={`Assigner le ticket ${ref}`}
                          >
                            {t.assignedTo === null && <option value="" disabled>Non assigné</option>}
                            {people.map((u) => (
                              <option key={u.id} value={u.id}>{u.prenom} {u.nom}{u.active ? '' : ' (inactif)'}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
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