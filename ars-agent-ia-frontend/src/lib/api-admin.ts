import { api } from './api';
import { useAuthStore } from '@/store/authStore';
import type { DashboardStats, VolumeDataPoint, SentimentDataPoint, AdminUser } from '@/types/admin';
import type { ConversationListItem, Conversation, ConversationFilters } from '@/types/conversation';
import type { Ticket, TicketFilters } from '@/types/ticket';

function getToken(): string {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  return user.token;
}

export const adminApi = {
  // Auth
  login: async (email: string, password: string, totpCode: string) => {
    // Backend returns { access_token, token_type, user } — normalize to { user, token }
    const resp = await api.post<{ access_token: string; token_type: string; user: AdminUser }>(
      '/admin/auth/login',
      { email, password, totp_code: totpCode },
    );
    return { user: resp.user, token: resp.access_token };
  },

  signup: (data: SignupPayload) =>
    api.post<{ user: AdminUser; token: string }>('/admin/auth/signup', data),

  // Dashboard
  getDashboardStats: () =>
    api.get<DashboardStats>('/admin/stats/dashboard', getToken()),

  getVolumeData: (period: 'today' | 'week' | 'month') =>
    api.get<VolumeDataPoint[]>(`/admin/stats/volume?period=${period}`, getToken()),

  getSentimentTrend: (days: number) =>
    api.get<SentimentDataPoint[]>(`/admin/stats/sentiment?days=${days}`, getToken()),

  // Conversations
  listConversations: (filters: Partial<ConversationFilters>, page: number, limit: number) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== 'ALL'),
      ),
    });
    return api.get<{ items: ConversationListItem[]; total: number }>(
      `/admin/conversations?${params}`,
      getToken(),
    );
  },

  getConversation: (id: string) =>
    api.get<Conversation>(`/admin/conversations/${id}`, getToken()),

  // Email
  validateEmail: (conversationId: string) =>
    api.post<void>(`/admin/conversations/${conversationId}/email/validate`, {}, getToken()),

  sendEmail: (conversationId: string) =>
    api.post<void>(`/admin/conversations/${conversationId}/email/send`, {}, getToken()),

  // Tickets
  listTickets: (filters: Partial<TicketFilters>, page: number, limit: number) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== 'ALL'),
      ),
    });
    return api.get<{ items: Ticket[]; total: number }>(
      `/admin/tickets?${params}`,
      getToken(),
    );
  },

  updateTicketStatus: (id: string, status: Ticket['status']) =>
    api.patch<Ticket>(`/admin/tickets/${id}`, { status }, getToken()),

  // Knowledge base
  listDocuments: () =>
    api.get<KnowledgeDoc[]>('/admin/knowledge', getToken()),

  deleteDocument: (id: string) =>
    api.delete(`/admin/knowledge/${id}`, getToken()),

  // Users
  listUsers: () =>
    api.get<AdminUser[]>('/admin/users', getToken()),

  createUser: (data: CreateUserPayload) =>
    api.post<AdminUser>('/admin/users', data, getToken()),

  updateUser: (id: string, data: Partial<CreateUserPayload>) =>
    api.patch<AdminUser>(`/admin/users/${id}`, data, getToken()),

  deactivateUser: (id: string) =>
    api.patch<AdminUser>(`/admin/users/${id}`, { active: false }, getToken()),

  // Audit
  listAuditEvents: (page: number, limit: number, eventType?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (eventType) params.set('event_type', eventType);
    return api.get<{ items: AuditEvent[]; total: number }>(
      `/admin/audit?${params}`,
      getToken(),
    );
  },
};

// Local types for API payloads
interface KnowledgeDoc {
  id: string;
  title: string;
  sourceUrl: string | null;
  status: 'INDEXING' | 'INDEXED' | 'FAILED';
  chunkCount: number;
  uploadedAt: string;
}

interface CreateUserPayload {
  nom: string;
  prenom: string;
  email: string;
  role: AdminUser['role'];
  active: boolean;
}

interface SignupPayload {
  codeInvitation: string;
  prenom: string;
  nom: string;
  email: string;
  password: string;
}

interface AuditEvent {
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