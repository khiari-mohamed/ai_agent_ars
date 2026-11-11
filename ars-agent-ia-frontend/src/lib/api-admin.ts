import { api } from './api';
import { useAuthStore } from '@/store/authStore';
import type {
  AdminUser,
  DashboardStats,
  SentimentDataPoint,
  VolumeDataPoint,
} from '@/types/admin';
import type {
  Conversation,
  ConversationFilters,
  ConversationListItem,
  EmailDraft,
  Message,
  ConversationSummary,
} from '@/types/conversation';
import type { Ticket, TicketFilters } from '@/types/ticket';

function getToken(): string {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  return user.token;
}

interface ApiUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: AdminUser['role'];
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

function mapUser(user: ApiUser): AdminUser {
  return {
    id: user.id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role,
    active: user.active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

interface ApiConversation {
  id: string;
  channel: Conversation['channel'];
  assure_id: string | null;
  assure_cin: string | null;
  assure_nom: string | null;
  status: Conversation['status'];
  language: Conversation['language'];
  sentiment_score: number;
  sentiment_label: Conversation['sentimentLabel'];
  ticket_id: string | null;
  duration_seconds: number;
  escalation_reason: string | null;
  started_at: string;
  ended_at: string | null;
}

function mapConversationListItem(item: ApiConversation): ConversationListItem {
  return {
    id: item.id,
    channel: item.channel,
    assureId: item.assure_id,
    assureCin: item.assure_cin,
    assureNom: item.assure_nom,
    status: item.status,
    language: item.language,
    sentimentScore: item.sentiment_score,
    sentimentLabel: item.sentiment_label,
    ticketId: item.ticket_id,
    durationSeconds: item.duration_seconds,
    escalationReason: item.escalation_reason,
    startedAt: item.started_at,
    endedAt: item.ended_at,
  };
}

function mapMessage(message: {
  id: string;
  conversation_id: string;
  role: Message['role'];
  content: string;
  tool_name: string | null;
  tokens_used: number | null;
  timestamp: string;
}): Message {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    role: message.role,
    content: message.content,
    toolName: message.tool_name,
    tokensUsed: message.tokens_used,
    timestamp: message.timestamp,
  };
}

function mapSummary(summary: {
  assure_identifiant: string;
  date_heure: string;
  canal: ConversationSummary['canal'];
  motif_principal: string;
  motifs_secondaires: string[];
  actions_effectuees: string[];
  resultat: ConversationSummary['resultat'];
  ticket_reference: string | null;
  points_attention: string[];
  sentiment_final: ConversationSummary['sentimentFinal'];
}): ConversationSummary {
  return {
    assureIdentifiant: summary.assure_identifiant,
    dateHeure: summary.date_heure,
    canal: summary.canal,
    motifPrincipal: summary.motif_principal,
    motifsSecondaires: summary.motifs_secondaires,
    actionsEffectuees: summary.actions_effectuees,
    resultat: summary.resultat,
    ticketReference: summary.ticket_reference,
    pointsAttention: summary.points_attention,
    sentimentFinal: summary.sentiment_final,
  };
}

function mapEmailDraft(draft: {
  subject: string;
  to: string[];
  cc: string[];
  body: string;
  actions_requises: string[];
  generated_at: string;
  validated: boolean;
  validated_by: string | null;
  sent_at: string | null;
}): EmailDraft {
  return {
    subject: draft.subject,
    to: draft.to,
    cc: draft.cc,
    body: draft.body,
    actionsRequises: draft.actions_requises,
    generatedAt: draft.generated_at,
    validated: draft.validated,
    validatedBy: draft.validated_by,
    sentAt: draft.sent_at,
  };
}

interface ApiTicket {
  id: string;
  crm_id: string | null;
  conversation_id: string | null;
  assure_cin: string;
  assure_nom_complet: string;
  category: Ticket['category'];
  priority: Ticket['priority'];
  status: Ticket['status'];
  subject: string;
  description: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

function mapTicket(ticket: ApiTicket): Ticket {
  return {
    id: ticket.id,
    crmId: ticket.crm_id,
    conversationId: ticket.conversation_id,
    assureCin: ticket.assure_cin,
    assureNomComplet: ticket.assure_nom_complet,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    description: ticket.description,
    assignedTo: ticket.assigned_to,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

export interface KnowledgeDoc {
  id: string;
  externalId: string | null;
  rowNo: number | null;
  source: string;
  intent: string | null;
  language: 'fr' | 'tn' | null;
  title: string | null;
  question: string;
  responseTitle: string | null;
  answer: string;
  hasAudio: boolean;
  noResponse: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface KnowledgeDocCreate {
  external_id?: string | null;
  source: string;
  intent?: string | null;
  language?: 'fr' | 'tn' | null;
  title?: string | null;
  question: string;
  answer: string;
  metadata?: Record<string, unknown> | null;
}

interface ApiKnowledgeDoc {
  id: string;
  external_id: string | null;
  row_no: number | null;
  source: string;
  intent: string | null;
  language: 'fr' | 'tn' | null;
  title: string | null;
  question: string;
  response_title: string | null;
  answer: string;
  has_audio: boolean;
  no_response: boolean;
  is_active: boolean;
  created_at: string;
}

function mapKnowledgeDoc(doc: ApiKnowledgeDoc): KnowledgeDoc {
  return {
    id: doc.id,
    externalId: doc.external_id,
    rowNo: doc.row_no,
    source: doc.source,
    intent: doc.intent,
    language: doc.language,
    title: doc.title,
    question: doc.question,
    responseTitle: doc.response_title,
    answer: doc.answer,
    hasAudio: doc.has_audio,
    noResponse: doc.no_response,
    isActive: doc.is_active,
    createdAt: doc.created_at,
  };
}

interface ApiAuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  conversation_id: string | null;
  action: string;
  resource: string;
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  ip_address: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  actorType: string;
  actorId: string;
  conversationId: string | null;
  action: string;
  resource: string;
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  ipAddress: string;
}

function mapAuditEvent(event: ApiAuditEvent): AuditEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    eventType: event.event_type,
    actorType: event.actor_type,
    actorId: event.actor_id,
    conversationId: event.conversation_id,
    action: event.action,
    resource: event.resource,
    result: event.result,
    ipAddress: event.ip_address,
  };
}

function toQuery(filters: Record<string, string | undefined>, page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

export const adminApi = {
  login: async (email: string, password: string, totpCode: string) => {
    const response = await api.post<{
      access_token: string;
      token_type: string;
      user: ApiUser;
    }>('/admin/auth/login', { email, password, totp_code: totpCode });
    return { user: mapUser(response.user), token: response.access_token };
  },

  getDashboardStats: async (): Promise<DashboardStats> => {
    const stats = await api.get<{
      conversations_today: number;
      conversations_active: number;
      resolution_rate: number;
      escalation_rate: number;
      avg_response_time_ms: number | null;
      avg_sentiment_score: number;
      tickets_open_count: number;
      satisfaction_score: number;
    }>('/admin/stats/dashboard', getToken());
    return {
      conversationsToday: stats.conversations_today,
      conversationsActive: stats.conversations_active,
      resolutionRate: stats.resolution_rate,
      escalationRate: stats.escalation_rate,
      avgResponseTimeMs: stats.avg_response_time_ms,
      avgSentimentScore: stats.avg_sentiment_score,
      ticketsOpenCount: stats.tickets_open_count,
      satisfactionScore: stats.satisfaction_score,
    };
  },

  getVolumeData: (period: 'today' | 'week' | 'month') =>
    api.get<VolumeDataPoint[]>(`/admin/stats/volume?period=${period}`, getToken()),

  getSentimentTrend: (days: number) =>
    api.get<SentimentDataPoint[]>(`/admin/stats/sentiment?days=${days}`, getToken()),

  listConversations: async (filters: Partial<ConversationFilters>, page: number, limit: number) => {
    const params = toQuery({
      search: filters.search,
      channel: filters.channel === 'ALL' ? undefined : filters.channel,
      status: filters.status === 'ALL' ? undefined : filters.status,
      sentiment: filters.sentiment === 'ALL' ? undefined : filters.sentiment,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    }, page, limit);
    const response = await api.get<{
      items: ApiConversation[];
      total: number;
      page: number;
      limit: number;
    }>(`/admin/conversations?${params}`, getToken());
    return { ...response, items: response.items.map(mapConversationListItem) };
  },

  getConversation: async (id: string): Promise<Conversation> => {
    const data = await api.get<ApiConversation & {
      messages: Array<Parameters<typeof mapMessage>[0]>;
      summary: Parameters<typeof mapSummary>[0] | null;
      email_draft: Parameters<typeof mapEmailDraft>[0] | null;
    }>(`/admin/conversations/${id}`, getToken());
    return {
      ...mapConversationListItem(data),
      messages: data.messages.map(mapMessage),
      summary: data.summary ? mapSummary(data.summary) : null,
      emailDraft: data.email_draft ? mapEmailDraft(data.email_draft) : null,
    };
  },

  sendEmail: (conversationId: string) =>
    api.post<{ status: string }>(`/admin/conversations/${conversationId}/email/send`, {}, getToken()),

  listTickets: async (filters: Partial<TicketFilters>, page: number, limit: number) => {
    const params = toQuery({
      search: filters.search,
      status: filters.status === 'ALL' ? undefined : filters.status,
      priority: filters.priority === 'ALL' ? undefined : filters.priority,
      category: filters.category === 'ALL' ? undefined : filters.category,
    }, page, limit);
    const response = await api.get<{
      items: ApiTicket[];
      total: number;
      page: number;
      limit: number;
    }>(`/admin/tickets?${params}`, getToken());
    return { ...response, items: response.items.map(mapTicket) };
  },

  updateTicketStatus: async (id: string, status: Ticket['status']) =>
    mapTicket(await api.patch<ApiTicket>(`/admin/tickets/${id}`, { status }, getToken())),

  updateTicket: async (
    id: string,
    patch: { status?: Ticket['status']; priority?: Ticket['priority']; assignedTo?: string },
  ) => {
    const body: Record<string, string> = {};
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.assignedTo !== undefined) body.assigned_to = patch.assignedTo;
    return mapTicket(await api.patch<ApiTicket>(`/admin/tickets/${id}`, body, getToken()));
  },

  listDocuments: async () => {
    const docs = await api.get<ApiKnowledgeDoc[]>('/admin/knowledge?limit=200', getToken());
    return docs.map(mapKnowledgeDoc);
  },

  createDocument: async (data: KnowledgeDocCreate) =>
    mapKnowledgeDoc(await api.post<ApiKnowledgeDoc>('/admin/knowledge', data, getToken())),

  deleteDocument: (id: string) =>
    api.delete<void>(`/admin/knowledge/${id}`, getToken()),

  listUsers: async () => {
    const users = await api.get<ApiUser[]>('/admin/users', getToken());
    return users.map(mapUser);
  },

  createUser: async (data: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    role: AdminUser['role'];
  }) => {
    const created = await api.post<ApiUser & { totp_secret: string; totp_uri: string }>(
      '/admin/users',
      data,
      getToken(),
    );
    return {
      user: mapUser(created),
      totpSecret: created.totp_secret,
      totpUri: created.totp_uri,
    };
  },

  setUserActive: async (id: string, active: boolean) =>
    mapUser(await api.patch<ApiUser>(`/admin/users/${id}`, { active }, getToken())),

  listAuditEvents: async (page: number, limit: number, eventType?: string) => {
    const params = toQuery({ event_type: eventType }, page, limit);
    const response = await api.get<{
      items: ApiAuditEvent[];
      total: number;
    }>(`/admin/audit?${params}`, getToken());
    return { ...response, items: response.items.map(mapAuditEvent) };
  },
};
