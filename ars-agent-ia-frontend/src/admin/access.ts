import type { UserRole } from '@/types/admin';

const ROUTE_ROLES: Partial<Record<string, readonly UserRole[]>> = {
  '/admin/audit': ['SUPERVISEUR', 'ADMIN'],
  '/admin/users': ['SUPERVISEUR', 'ADMIN'],
  '/admin/settings': ['SUPERVISEUR', 'ADMIN'],
};

/** Mirrors the backend `require_role` dependencies. The server stays the authority. */
export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  const allowed = ROUTE_ROLES[path];
  if (!allowed) return true;
  return role !== undefined && allowed.includes(role);
}

export const canManageUsers = (role: UserRole | undefined): boolean => role === 'ADMIN';