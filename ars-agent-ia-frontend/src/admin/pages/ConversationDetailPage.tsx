import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MessageSquare, Phone, Send, CheckCircle,
  Clock, User, FileText, Mail,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SentimentBadge from '../components/SentimentBadge';
import Badge from '@/shared/components/Badge';
import Spinner from '@/shared/components/Spinner';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import {
  formatDate, formatDuration, statusBadgeColor, statusLabel,
  channelLabel, scoreToPercent, cn,
} from '@/lib/utils';
import type { Conversation } from '@/types/conversation';
import toast from 'react-hot-toast';

export default function ConversationDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const convAsync = useAsync<Conversation>();
  const sendAsync = useAsync<{ status: string }>();

  const load = useCallback(() => {
    if (!id) return;
    convAsync.run(adminApi.getConversation(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSendEmail = async () => {
    if (!id) return;
    const res = await sendAsync.run(adminApi.sendEmail(id));
    if (res !== null) {
      toast.success(res.status === 'sent' ? 'Email envoyé avec succès' : `Statut de l’email : ${res.status}`);
      load();
    }
  };

  const conv = convAsync.data;

  if (convAsync.loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!conv || convAsync.error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{convAsync.error ?? 'Conversation introuvable'}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4 text-sm">Retour</button>
      </div>
    );
  }

  const sentPct = scoreToPercent(conv.sentimentScore);

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#b51a1a] transition-colors mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux conversations
      </button>

      <PageHeader
        title={`Conversation — ${conv.assureNom ?? 'Non identifié'}`}
        subtitle={conv.id}
      />

      {/* Meta strip */}
      <div className="card p-4 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {conv.channel === 'CHAT_WEB'
            ? <MessageSquare className="h-4 w-4 text-[#b51a1a]/60" />
            : <Phone className="h-4 w-4 text-[#b51a1a]/60" />
          }
          <span className="text-sm text-slate-600">{channelLabel(conv.channel)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusBadgeColor(conv.status)} dot>{statusLabel(conv.status)}</Badge>
        </div>
        <SentimentBadge label={conv.sentimentLabel} />
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <Clock className="h-4 w-4 text-slate-400" />
          {formatDuration(conv.durationSeconds)}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <User className="h-4 w-4 text-slate-400" />
          CIN: <span className="font-mono font-medium">{conv.assureCin ?? '—'}</span>
        </div>
        <div className="text-sm text-slate-500 ml-auto">
          {formatDate(conv.startedAt)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Transcript */}
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/50">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#b51a1a]/70" />
              Transcript ({conv.messages.length} messages)
            </h2>
          </div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {conv.messages.filter((m) => m.role !== 'tool').map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div className={cn(
                  'px-3.5 py-2.5 rounded-2xl text-sm max-w-[75%] leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] text-white shadow-glow-red rounded-br-sm'
                    : 'bg-white/70 backdrop-blur-md border border-white/70 text-slate-800 shadow-glass-sm rounded-bl-sm',
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Sentiment indicator */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Score de sentiment</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-white/50 rounded-full overflow-hidden shadow-inner">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    sentPct >= 60 ? 'bg-gradient-to-r from-sage-400 to-sage-500' : sentPct >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-red-400 to-red-500',
                  )}
                  style={{ width: `${sentPct}%` }}
                />
              </div>
              <span className="text-sm font-bold text-slate-700">{sentPct}%</span>
            </div>
            <div className="mt-2">
              <SentimentBadge label={conv.sentimentLabel} />
            </div>
          </div>

          {/* Summary */}
          {conv.summary && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#b51a1a]/70" />
                Résumé automatique
              </h3>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-2xs text-slate-400 uppercase tracking-wide">Motif principal</dt>
                  <dd className="text-slate-700 font-medium">{conv.summary.motifPrincipal}</dd>
                </div>
                <div>
                  <dt className="text-2xs text-slate-400 uppercase tracking-wide">Résultat</dt>
                  <dd className="text-slate-700 font-medium">{conv.summary.resultat}</dd>
                </div>
                {conv.summary.ticketReference && (
                  <div>
                    <dt className="text-2xs text-slate-400 uppercase tracking-wide">Référence ticket</dt>
                    <dd className="font-mono text-[#b51a1a] font-medium">{conv.summary.ticketReference}</dd>
                  </div>
                )}
                {conv.summary.actionsEffectuees.length > 0 && (
                  <div>
                    <dt className="text-2xs text-slate-400 uppercase tracking-wide mb-1">Actions effectuées</dt>
                    <ul className="space-y-0.5">
                      {conv.summary.actionsEffectuees.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-slate-600 text-xs">
                          <CheckCircle className="h-3 w-3 text-sage-500 mt-0.5 flex-shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Email draft */}
          {conv.emailDraft && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[#b51a1a]/70" />
                Email auto-généré
              </h3>
              <div className="space-y-2 text-sm">
                <div className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/60">
                  <p className="text-2xs text-slate-400 mb-0.5">Objet</p>
                  <p className="text-slate-700 font-medium text-xs">{conv.emailDraft.subject}</p>
                </div>
                <div className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/60 max-h-36 overflow-y-auto">
                  <p className="text-2xs text-slate-400 mb-0.5">Corps</p>
                  <p className="text-slate-600 text-xs whitespace-pre-wrap">{conv.emailDraft.body}</p>
                </div>
                {conv.emailDraft.actionsRequises.length > 0 && (
                  <div>
                    <p className="text-2xs text-slate-400 uppercase tracking-wide mb-1">Actions requises</p>
                    <ul className="space-y-0.5">
                      {conv.emailDraft.actionsRequises.map((a, i) => (
                        <li key={i} className="text-xs text-slate-600 flex items-start gap-1">
                          <span className="text-amber-500 mt-0.5">•</span> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {conv.emailDraft.sentAt ? (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-sage-600">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Envoyé le {formatDate(conv.emailDraft.sentAt)}
                </div>
              ) : (
                <button
                  onClick={handleSendEmail}
                  disabled={sendAsync.loading}
                  className="btn-primary w-full mt-3 text-xs py-2"
                >
                  {sendAsync.loading
                    ? <Spinner size="sm" className="text-white" />
                    : <><Send className="h-3.5 w-3.5" /> Envoyer l'email</>
                  }
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}