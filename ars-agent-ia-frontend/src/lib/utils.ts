import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SentimentLabel, ConversationStatus, Channel } from '@/types/conversation';
import type { TicketPriority, TicketStatus, TicketCategory } from '@/types/ticket';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy, HH:mm', { locale: fr });
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: fr });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function sentimentColor(label: SentimentLabel): string {
  const map: Record<SentimentLabel, string> = {
    SATISFAIT: 'text-sage-600',
    NEUTRE:    'text-amber-600',
    INSATISFAIT: 'text-red-600',
  };
  return map[label];
}

export function sentimentBgColor(label: SentimentLabel): string {
  const map: Record<SentimentLabel, string> = {
    SATISFAIT: 'bg-sage-50 text-sage-700 border-sage-200',
    NEUTRE:    'bg-amber-50 text-amber-700 border-amber-200',
    INSATISFAIT: 'bg-red-50 text-red-700 border-red-200',
  };
  return map[label];
}

export function statusBadgeColor(status: ConversationStatus): string {
  const map: Record<ConversationStatus, string> = {
    ACTIVE:    'bg-blue-50 text-blue-700 border-blue-200',
    RESOLVED:  'bg-sage-50 text-sage-700 border-sage-200',
    ESCALATED: 'bg-amber-50 text-amber-700 border-amber-200',
    ABANDONED: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return map[status];
}

export function statusLabel(status: ConversationStatus): string {
  const map: Record<ConversationStatus, string> = {
    ACTIVE:    'Active',
    RESOLVED:  'Résolue',
    ESCALATED: 'Escaladée',
    ABANDONED: 'Abandonnée',
  };
  return map[status];
}

export function channelLabel(channel: Channel): string {
  return channel === 'CHAT_WEB' ? 'Chat Web' : 'Téléphone';
}

export function ticketPriorityColor(priority: TicketPriority): string {
  const map: Record<TicketPriority, string> = {
    LOW:    'bg-slate-100 text-slate-600 border-slate-200',
    MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
    HIGH:   'bg-amber-50 text-amber-700 border-amber-200',
    URGENT: 'bg-red-50 text-red-700 border-red-200',
  };
  return map[priority];
}

export function ticketStatusColor(status: TicketStatus): string {
  const map: Record<TicketStatus, string> = {
    NOUVEAU:              'bg-blue-50 text-blue-700 border-blue-200',
    EN_COURS:             'bg-amber-50 text-amber-700 border-amber-200',
    EN_ATTENTE_VALIDATION:'bg-purple-50 text-purple-700 border-purple-200',
    RESOLU:               'bg-sage-50 text-sage-700 border-sage-200',
    FERME:                'bg-slate-100 text-slate-500 border-slate-200',
  };
  return map[status];
}

export function ticketCategoryLabel(cat: TicketCategory): string {
  const map: Record<TicketCategory, string> = {
    RECLAMATION: 'Réclamation',
    INFORMATION: 'Information',
    ELIGIBILITE: 'Éligibilité',
    TECHNIQUE:   'Technique',
    AUTRE:       'Autre',
  };
  return map[cat];
}

export function ticketStatusLabel(status: TicketStatus): string {
  const map: Record<TicketStatus, string> = {
    NOUVEAU:              'Nouveau',
    EN_COURS:             'En cours',
    EN_ATTENTE_VALIDATION:'En attente',
    RESOLU:               'Résolu',
    FERME:                'Fermé',
  };
  return map[status];
}

export function scoreToPercent(score: number): number {
  return Math.round(((score + 1) / 2) * 100);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}