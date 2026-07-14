import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Pagination from '@/shared/components/Pagination';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import Badge from '@/shared/components/Badge';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { usePagination } from '@/lib/hooks/usePagination';
import { formatDate, cn } from '@/lib/utils';

interface AuditEvent {
  id: string; timestamp: string; eventType: string;
  actorType: string; actorId: string;
  conversationId: string | null; action: string;
  resource: string; result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  ipAddress: string;
}

const resultConfig = {
  SUCCESS: { icon: CheckCircle, color: 'text-sage-500', badge: 'bg-sage-50 text-sage-700 border-sage-200' },
  FAILURE: { icon: XCircle,     color: 'text-red-500',  badge: 'bg-red-50 text-red-700 border-red-200'   },
  PARTIAL: { icon: MinusCircle, color: 'text-amber-500',badge: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const EVENT_TYPES = [
  'AUTH_ATTEMPT', 'AUTH_SUCCESS', 'AUTH_FAILURE', 'AUTH_LOCKOUT',
  'DIGIHEALTH_QUERY', 'TICKET_CREATED', 'ESCALATION_TRIGGERED',
  'CONVERSATION_STARTED', 'CONVERSATION_CLOSED', 'ADMIN_LOGIN',
];

export default function AuditLogsPage() {
  const [eventType, setEventType] = useState('');
  const { page, limit, total, totalPages, setTotal, next, prev, goTo, reset } = usePagination(30);
  const { data, loading, run } = useAsync<{ items: AuditEvent[]; total: number }>();

  const load = useCallback(() => {
    run(adminApi.listAuditEvents(page, limit, eventType || undefined)).then((res) => {
      if (res) setTotal(res.total);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, eventType]);

  useEffect(() => { load(); }, [load]);

  const events = data?.items ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader
        title="Journaux d'audit"
        subtitle="Historique immuable de toutes les actions système — Lecture seule"
      />

      {/* Filter */}
      <div className="card p-4 flex gap-3">
        <select
          value={eventType}
          onChange={(e) => { setEventType(e.target.value); reset(); }}
          className="input-base w-auto"
          aria-label="Filtrer par type d'événement"
        >
          <option value="">Tous les événements</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
          <Shield className="h-3.5 w-3.5" />
          Logs signés HMAC-SHA256 — Intégrité garantie
        </div>
      </div>

      {/* Log table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : events.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label="Journaux d'audit">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Horodatage', 'Événement', 'Acteur', 'Action', 'Ressource', 'Résultat', 'IP'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border font-mono">
                  {events.map((ev) => {
                    const rc = resultConfig[ev.result];
                    const ResultIcon = rc.icon;
                    return (
                      <tr key={ev.id} className="hover:bg-surface-raised transition-colors">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(ev.timestamp)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-navy-600 font-semibold">{ev.eventType.replace(/_/g, '_\u200B')}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-slate-600">{ev.actorType}</span>
                          <span className="text-slate-400 ml-1">#{ev.actorId.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate" title={ev.action}>{ev.action}</td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[140px] truncate" title={ev.resource}>{ev.resource}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={cn('border', rc.badge)}>
                            <ResultIcon className={cn('h-3 w-3', rc.color)} />
                            {ev.result}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{ev.ipAddress}</td>
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
          <EmptyState icon={Shield} title="Aucun événement" description="Aucun événement d'audit ne correspond à vos filtres." />
        )}
      </div>
    </div>
  );
}