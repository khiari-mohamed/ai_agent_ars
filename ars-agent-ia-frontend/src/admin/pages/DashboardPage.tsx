import { useCallback, useEffect } from 'react';
import {
  MessageSquare, CheckCircle, AlertTriangle,
  Smile, Ticket as TicketIcon, TrendingUp,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KPICard from '../components/KPICard';
import VolumeChart from '../components/Charts/VolumeChart';
import SentimentTrend from '../components/Charts/SentimentTrend';
import ConversationTable from '../components/ConversationTable';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { usePolling } from '@/lib/hooks/usePolling';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import type { DashboardStats, VolumeDataPoint, SentimentDataPoint } from '@/types/admin';
import type { ConversationListItem } from '@/types/conversation';

const POLL_MS = 20_000;

export default function DashboardPage() {
  const statsAsync = useAsync<DashboardStats>();
  const volumeAsync = useAsync<VolumeDataPoint[]>();
  const sentAsync = useAsync<SentimentDataPoint[]>();
  const convsAsync = useAsync<{ items: ConversationListItem[]; total: number }>();

  const { run: runStats } = statsAsync;
  const { run: runVolume } = volumeAsync;
  const { run: runSent } = sentAsync;
  const { run: runConvs } = convsAsync;

  const load = useCallback(() => {
    void runStats(adminApi.getDashboardStats());
    void runVolume(adminApi.getVolumeData('today'));
    void runSent(adminApi.getSentimentTrend(7));
    void runConvs(adminApi.listConversations({ status: 'ACTIVE' }, 1, 5));
  }, [runStats, runVolume, runSent, runConvs]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, POLL_MS);

  const s = statsAsync.data;
  const liveConvs = convsAsync.data?.items ?? [];

  return (
    <div className="p-6 space-y-6 w-full">
      <PageHeader title="Tableau de bord" subtitle="Activité de l'Agent IA ARS Tunisie — actualisée toutes les 20 secondes" />

      {statsAsync.error && !s && (
        <p role="alert" className="text-sm text-red-600">{statsAsync.error}</p>
      )}

      {statsAsync.loading && !s && (
        <div className="flex justify-center py-8"><Spinner /></div>
      )}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="Conversations aujourd'hui"
            value={String(s.conversationsToday)}
            icon={MessageSquare}
            iconColor="text-navy-600"
            subtitle={`${s.conversationsActive} active${s.conversationsActive !== 1 ? 's' : ''}`}
          />
          <KPICard
            title="Taux de résolution"
            value={`${s.resolutionRate.toFixed(1)}%`}
            icon={CheckCircle}
            iconColor="text-sage-600"
          />
          <KPICard
            title="Taux d'escalade"
            value={`${s.escalationRate.toFixed(1)}%`}
            icon={AlertTriangle}
            iconColor="text-amber-600"
          />
          <KPICard
            title="Tickets ouverts"
            value={String(s.ticketsOpenCount)}
            icon={TicketIcon}
            iconColor="text-red-500"
          />
          <KPICard
            title="Satisfaction client"
            value={`${s.satisfactionScore.toFixed(1)} / 5`}
            icon={Smile}
            iconColor="text-sage-600"
          />
          <KPICard
            title="Score sentiment moyen"
            value={`${(((s.avgSentimentScore + 1) / 2) * 100).toFixed(0)}%`}
            icon={TrendingUp}
            iconColor="text-navy-400"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Volume d'interactions (aujourd'hui)</h2>
          {volumeAsync.data ? (
            <VolumeChart data={volumeAsync.data} />
          ) : volumeAsync.loading ? (
            <div className="h-[220px] flex items-center justify-center"><Spinner /></div>
          ) : null}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Satisfaction (7 jours)</h2>
          {sentAsync.data ? (
            <SentimentTrend data={sentAsync.data} />
          ) : sentAsync.loading ? (
            <div className="h-[180px] flex items-center justify-center"><Spinner /></div>
          ) : null}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Conversations actives</h2>
          <span className="flex items-center gap-1.5 text-xs text-sage-600">
            <span className="h-2 w-2 rounded-full bg-sage-400 animate-pulse motion-reduce:animate-none" aria-hidden />
            Actualisation automatique
          </span>
        </div>
        {liveConvs.length > 0 ? (
          <ConversationTable items={liveConvs} />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Aucune conversation active"
            description="Les conversations en cours apparaîtront ici."
          />
        )}
      </div>
    </div>
  );
}