export type Channel = 'CHAT_WEB' | 'VOIP';
export type ConversationStatus = 'ACTIVE' | 'RESOLVED' | 'ESCALATED' | 'ABANDONED';
export type Language = 'fr' | 'ar-TN';
export type SentimentLabel = 'SATISFAIT' | 'NEUTRE' | 'INSATISFAIT';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type ConversationResult = 'RESOLU' | 'ESCALADE' | 'ABANDONNE';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp: string; // ISO8601
  tokensUsed: number | null;
  toolName: string | null;
}

export interface ConversationSummary {
  assureIdentifiant: string;
  dateHeure: string;
  canal: Channel;
  motifPrincipal: string;
  motifsSecondaires: string[];
  actionsEffectuees: string[];
  resultat: ConversationResult;
  ticketReference: string | null;
  pointsAttention: string[];
  sentimentFinal: SentimentLabel;
}

export interface Conversation {
  id: string;
  channel: Channel;
  assureId: string | null;
  assureCin: string | null;
  assureNom: string | null;
  startedAt: string;
  endedAt: string | null;
  status: ConversationStatus;
  language: Language;
  messages: Message[];
  sentimentScore: number; // -1 to 1
  sentimentLabel: SentimentLabel;
  summary: ConversationSummary | null;
  emailDraft: EmailDraft | null;
  ticketId: string | null;
  durationSeconds: number;
  escalationReason: string | null;
}

export interface EmailDraft {
  subject: string;
  to: string[];
  cc: string[];
  body: string;
  actionsRequises: string[];
  generatedAt: string;
  validated: boolean;
  validatedBy: string | null;
  sentAt: string | null;
}

export type ConversationListItem = Omit<Conversation, 'messages' | 'summary' | 'emailDraft'>;

export interface ConversationFilters {
  search: string;
  channel: Channel | 'ALL';
  status: ConversationStatus | 'ALL';
  sentiment: SentimentLabel | 'ALL';
  dateFrom: string;
  dateTo: string;
}