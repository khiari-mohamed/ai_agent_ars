const SPECIALS = `!@#$%^&*()_+-=[]{}|;':",./<>?`;

export interface PasswordCheck {
  label: string;
  ok: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '12 caractères minimum', ok: password.length >= 12 },
    { label: 'Une majuscule', ok: /\p{Lu}/u.test(password) },
    { label: 'Un chiffre', ok: /\p{Nd}/u.test(password) },
    { label: 'Un caractère spécial', ok: [...password].some((c) => SPECIALS.includes(c)) },
  ];
}

export const isStrongPassword = (password: string): boolean => passwordChecks(password).every((c) => c.ok);