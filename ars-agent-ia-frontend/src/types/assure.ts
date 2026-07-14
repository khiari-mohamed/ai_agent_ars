export type CoverageStatus = 'ACTIF' | 'SUSPENDU' | 'EXPIRE';

export interface AssureProfile {
  id: string;
  cin: string;
  numeroAssure: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  email: string | null;
  telephone: string | null;
  statutCouverture: CoverageStatus;
  caisse: string;
}