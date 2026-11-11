import { describe, expect, it } from 'vitest';
import { canAccessRoute, canManageUsers } from '@/admin/access';
import { isStrongPassword, passwordChecks } from '@/lib/password';
import { jwtExpiryMs } from '@/lib/jwt';

describe('role access', () => {
  it('hides audit, users and settings from agents', () => {
    for (const path of ['/admin/audit', '/admin/users', '/admin/settings']) {
      expect(canAccessRoute('AGENT', path)).toBe(false);
      expect(canAccessRoute(undefined, path)).toBe(false);
      expect(canAccessRoute('SUPERVISEUR', path)).toBe(true);
      expect(canAccessRoute('ADMIN', path)).toBe(true);
    }
  });

  it('leaves the other pages open to every role', () => {
    expect(canAccessRoute('AGENT', '/admin/dashboard')).toBe(true);
    expect(canAccessRoute('AGENT', '/admin/tickets')).toBe(true);
  });

  it('only admins manage users', () => {
    expect(canManageUsers('ADMIN')).toBe(true);
    expect(canManageUsers('SUPERVISEUR')).toBe(false);
  });
});

describe('password rules (mirror of the backend)', () => {
  it('accepts a strong password', () => {
    expect(isStrongPassword('Motdepasse-2026!')).toBe(true);
  });

  it.each([
    ['Court1!a', 'length'],
    ['motdepasse-2026!', 'uppercase'],
    ['Motdepasse-ABCD!', 'digit'],
    ['Motdepasse2026ab', 'special'],
  ])('rejects %s (%s)', (password) => {
    expect(isStrongPassword(password)).toBe(false);
  });

  it('reports each rule separately', () => {
    expect(passwordChecks('abc').filter((check) => check.ok)).toHaveLength(0);
  });
});

describe('jwtExpiryMs', () => {
  const token = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;

  it('reads exp in milliseconds', () => {
    expect(jwtExpiryMs(token({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it('returns null for malformed tokens or missing exp', () => {
    expect(jwtExpiryMs('nope')).toBeNull();
    expect(jwtExpiryMs('a.!!!.c')).toBeNull();
    expect(jwtExpiryMs(token({ sub: 'x' }))).toBeNull();
  });
});
