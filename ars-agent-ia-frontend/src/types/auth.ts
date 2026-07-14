export type AuthState = 'IDLE' | 'PENDING_CIN' | 'PENDING_OTP' | 'AUTHENTICATED' | 'LOCKED';

export interface AuthSession {
  sessionId: string;
  conversationId: string;
  assureCin: string;
  assureNom: string;
  expiresAt: string;
}

export interface AdminAuthUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: import('./admin').UserRole;
  token: string;
}