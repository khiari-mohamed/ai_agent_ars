export type TicketCategory = 'RECLAMATION' | 'INFORMATION' | 'ELIGIBILITE' | 'TECHNIQUE' | 'AUTRE';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'NOUVEAU' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'RESOLU' | 'FERME';

export interface Ticket {
  id: string;
  crmId: string;
  conversationId: string;
  assureCin: string;
  assureNomComplet: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketFilters {
  search: string;
  status: TicketStatus | 'ALL';
  priority: TicketPriority | 'ALL';
  category: TicketCategory | 'ALL';
}