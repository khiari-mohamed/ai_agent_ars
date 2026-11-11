export type UserRole = 'AGENT' | 'SUPERVISEUR' | 'ADMIN';

export interface AdminUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  conversationsToday: number;
  conversationsActive: number;
  resolutionRate: number;        // 0-100
  escalationRate: number;        // 0-100
  avgResponseTimeMs: number | null;
  avgSentimentScore: number;     // -1 to 1
  ticketsOpenCount: number;
  satisfactionScore: number;     // 0-5
}

export interface VolumeDataPoint {
  hour: string;   // 'HH:00'
  total: number;
  resolved: number;
  escalated: number;
}

export interface SentimentDataPoint {
  date: string;   // 'YYYY-MM-DD'
  avg: number;    // -1 to 1
}

export interface KPITrend {
  current: number;
  previous: number;
  changePercent: number;
}