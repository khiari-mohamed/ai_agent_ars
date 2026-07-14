import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, CheckCircle, AlertTriangle, Clock,
  Users, Smile, Ticket as TicketIcon, TrendingUp,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KPICard from '../components/KPICard';
import VolumeChart from '../components/Charts/VolumeChart';
import SentimentTrend from '../components/Charts/SentimentTrend';
import ConversationTable from '../components/ConversationTable';
import { adminApi } from '@/lib/api-admin';
import { useAdminSocket } from '@/lib/hooks/useAdminSocket';
import { useAsync } from '@/lib/hooks/useAsync';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import type { DashboardStats, VolumeDataPoint, SentimentDataPoint } from '@/types/admin';
import type { ConversationListItem } from '@/types/conversation';

export default function DashboardPage() {
  const statsAsync  = useAsync<DashboardStats>();
  const volumeAsync = useAsync<VolumeDataPoint[]>();
  const sentAsync   = useAsync<SentimentDataPoint[]>();
  const convsAsync  = useAsync<{ items: ConversationListItem[]; total: number }>();

  const [liveConvs, setLiveConvs] = useState<ConversationListItem[]>([]);

  const load = useCallback(() => {
    statsAsync.run(adminApi.getDashboardStats());
    volumeAsync.run(adminApi.getVolumeData('today'));
    sentAsync.run(adminApi.getSentimentTrend(7));
    convsAsync.run(adminApi.listConversations({ status: 'ACTIVE' }, 1, 5)).then((res) => {
      if (res) setLiveConvs(res.items);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useAdminSocket({
    onConversationStarted: (c) => setLiveConvs((prev) => [c, ...prev].slice(0, 5)),
    onConversationUpdated: (c) =>
      setLiveConvs((prev) => prev.map((x) => (x.id === c.id ? c : x))),
  });

  const s = statsAsync.data;

  return (
    <div className="p-6 space-y-6 w-full">
      <PageHeader
        title="Tableau de bord"
        subtitle="Activité en temps réel — Agent IA ARS Tunisie"
      />

      {/* KPIs */}
      {statsAsync.loading && (
        <div className="flex justify-center py-8"><Spinner /></div>
      )}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Conversations aujourd'hui"
            value={String(s.conversationsToday)}
            icon={MessageSquare}
            iconColor="text-navy-600"
            subtitle={`${s.conversationsActive} actives`}
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
            title="Temps de réponse moyen"
            value={`${(s.avgResponseTimeMs / 1000).toFixed(1)}s`}
            icon={Clock}
            iconColor="text-purple-500"
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
            title="Conversations actives"
            value={String(s.conversationsActive)}
            icon={Users}
            iconColor="text-navy-600"
          />
          <KPICard
            title="Score sentiment moyen"
            value={`${(((s.avgSentimentScore + 1) / 2) * 100).toFixed(0)}%`}
            icon={TrendingUp}
            iconColor="text-navy-400"
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Volume d'interactions (aujourd'hui)</h2>
          {volumeAsync.loading ? (
            <div className="h-[220px] flex items-center justify-center"><Spinner /></div>
          ) : volumeAsync.data ? (
            <VolumeChart data={volumeAsync.data} />
          ) : null}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Satisfaction (7 jours)</h2>
          {sentAsync.loading ? (
            <div className="h-[180px] flex items-center justify-center"><Spinner /></div>
          ) : sentAsync.data ? (
            <SentimentTrend data={sentAsync.data} />
          ) : null}
        </div>
      </div>

      {/* Live conversations */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Conversations actives</h2>
          <span className="flex items-center gap-1.5 text-xs text-sage-600">
            <span className="h-2 w-2 rounded-full bg-sage-400 animate-pulse" />
            En direct
          </span>
        </div>
        {liveConvs.length > 0 ? (
          <ConversationTable items={liveConvs} />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Aucune conversation active"
            description="Les nouvelles conversations apparaîtront ici en temps réel."
          />
        )}
      </div>
    </div>
  );
}