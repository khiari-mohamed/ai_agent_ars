import { useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, ExternalLink } from 'lucide-react';
import Badge from '@/shared/components/Badge';
import SentimentBadge from './SentimentBadge';
import { formatRelative, statusBadgeColor, statusLabel, channelLabel } from '@/lib/utils';
import type { ConversationListItem } from '@/types/conversation';

interface ConversationTableProps {
  items: ConversationListItem[];
}

export default function ConversationTable({ items }: ConversationTableProps) {
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Liste des conversations">
        <thead>
          <tr className="border-b border-surface-border">
            {['Canal', 'Assuré', 'Statut', 'Sentiment', 'Durée', 'Date', ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {items.map((conv) => (
            <tr
              key={conv.id}
              className="hover:bg-surface-raised transition-colors cursor-pointer group"
              onClick={() => navigate(`/admin/conversations/${conv.id}`)}
            >
              <td className="px-4 py-3">
                <span className="flex items-center gap-1.5 text-slate-600">
                  {conv.channel === 'CHAT_WEB'
                    ? <MessageSquare className="h-3.5 w-3.5 text-navy-400" />
                    : <Phone className="h-3.5 w-3.5 text-navy-400" />
                  }
                  <span className="text-xs">{channelLabel(conv.channel)}</span>
                </span>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{conv.assureNom ?? '—'}</p>
                <p className="text-2xs text-slate-400 font-mono">{conv.assureCin ?? 'Non identifié'}</p>
              </td>
              <td className="px-4 py-3">
                <Badge className={statusBadgeColor(conv.status)} dot>
                  {statusLabel(conv.status)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <SentimentBadge label={conv.sentimentLabel} />
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                {Math.floor(conv.durationSeconds / 60)}m {conv.durationSeconds % 60}s
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                {formatRelative(conv.startedAt)}
              </td>
              <td className="px-4 py-3">
                <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-navy-400 transition-colors" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}