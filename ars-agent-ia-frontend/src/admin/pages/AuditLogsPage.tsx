import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, MinusCircle, RefreshCw, Shield, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Pagination from '@/shared/components/Pagination';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import Badge from '@/shared/components/Badge';
import { adminApi, type AuditEvent } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { usePagination } from '@/lib/hooks/usePagination';
import { formatDate, cn } from '@/lib/utils';

const RESULT_CONFIG: Record<AuditEvent['result'], { icon: typeof CheckCircle; color: string; badge: string; label: string }> = {
  SUCCESS: { icon: CheckCircle, color: 'text-sage-500', badge: 'bg-sage-50 text-sage-700 border-sage-200', label: 'Succès' },
  FAILURE: { icon: XCircle, color: 'text-red-500', badge: 'bg-red-50 text-red-700 border-red-200', label: 'Échec' },
  PARTIAL: { icon: MinusCircle, color: 'text-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Partiel' },
};

const EVENT_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ADMIN_LOGIN', label: 'Connexion admin' },
  { value: 'AUTH_FAILURE', label: 'Échec d’authentification' },
  { value: 'AUTH_LOCKOUT', label: 'Compte verrouillé' },
  { value: 'CONVERSATION_STARTED', label: 'Conversation démarrée' },
  { value: 'CONVERSATION_CLOSED', label: 'Conversation terminée' },
  { value: 'EMAIL_SENT', label: 'Email envoyé' },
  { value: 'USER_CREATED', label: 'Utilisateur créé' },
  { value: 'USER_UPDATED', label: 'Utilisateur modifié' },
];

const EVENT_LABELS: Record<string, string> = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.label]));

function actorLabel(actorId: string): string {
  return actorId.includes('@') ? actorId : `#${actorId.slice(0, 8)}`;
}

export default function AuditLogsPage() {
  const [eventType, setEventType] = useState('');
  const { page, limit, total, totalPages, setTotal, next, prev, goTo, reset } = usePagination(30);
  const audit = useAsync<{ items: AuditEvent[]; total: number }>();
  const { run } = audit;

  const load = useCallback(() => {
    void run(adminApi.listAuditEvents(page, limit, eventType || undefined));
  }, [run, page, limit, eventType]);

  useEffect(() => { load(); }, [load]);

  const fetchedTotal = audit.data?.total;
  useEffect(() => {
    if (fetchedTotal !== undefined) setTotal(fetchedTotal);
  }, [fetchedTotal, setTotal]);

  const events = audit.data?.items ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader
        title="Journaux d'audit"
        subtitle="Historique des actions système — lecture seule"
      />

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select
          value={eventType}
          onChange={(e) => { setEventType(e.target.value); reset(); }}
          className="input-base w-auto"
          aria-label="Filtrer par type d'événement"
        >
          <option value="">Tous les événements</option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button type="button" onClick={load} disabled={audit.loading} className="btn-secondary text-sm" aria-label="Actualiser">
          <RefreshCw className={cn('h-4 w-4', audit.loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          Actualiser
        </button>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
          <Shield className="h-3.5 w-3.5" aria-hidden />
          Événements signés HMAC-SHA256
        </div>
      </div>

      <div className="card overflow-hidden">
        {audit.loading && !audit.data ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : audit.error && !audit.data ? (
          <p role="alert" className="p-5 text-sm text-red-600">{audit.error}</p>
        ) : events.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label="Journaux d'audit">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Horodatage', 'Événement', 'Acteur', 'Action', 'Ressource', 'Résultat', 'IP'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {events.map((ev) => {
                    const rc = RESULT_CONFIG[ev.result];
                    const ResultIcon = rc.icon;
                    return (
                      <tr key={ev.id} className="hover:bg-surface-raised transition-colors">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(ev.timestamp)}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-navy-600 font-semibold">{EVENT_LABELS[ev.eventType] ?? ev.eventType}</p>
                          <p className="font-mono text-2xs text-slate-400">{ev.eventType}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-slate-600">{ev.actorType}</span>
                          <span className="ml-1 font-mono text-slate-400" title={ev.actorId}>{actorLabel(ev.actorId)}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 max-w-[160px] truncate" title={ev.action}>{ev.action}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-500 max-w-[200px] truncate" title={ev.resource}>{ev.resource}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={cn('border', rc.badge)}>
                            <ResultIcon className={cn('h-3 w-3', rc.color)} aria-hidden />
                            {rc.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{ev.ipAddress}</td>
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
          <EmptyState icon={Shield} title="Aucun événement" description="Aucun événement d'audit ne correspond à ce filtre." />
        )}
      </div>
    </div>
  );
}