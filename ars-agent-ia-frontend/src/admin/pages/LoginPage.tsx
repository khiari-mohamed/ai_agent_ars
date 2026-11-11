import { useState, useId, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { adminApi } from '@/lib/api-admin';
import { ApiError } from '@/lib/api';
import Spinner from '@/shared/components/Spinner';
import toast from 'react-hot-toast';

function MeshPattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]" aria-hidden="true">
      <defs>
        <pattern id="ars-star" width="56" height="56" patternUnits="userSpaceOnUse">
          <path
            d="M28 4 L34 20 L52 20 L38 30 L44 48 L28 38 L12 48 L18 30 L4 20 L22 20 Z"
            fill="none"
            stroke="#eceef1"
            strokeWidth="0.75"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ars-star)" />
    </svg>
  );
}

function GrainOverlay() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.035] mix-blend-overlay" aria-hidden="true">
      <filter id="ars-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ars-grain)" />
    </svg>
  );
}

function GlowOrbs() {
  return (
    <>
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-red-500/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-red-600/10 blur-[100px]" aria-hidden />
    </>
  );
}

function TrustMark({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-500">
      <span>{icon}</span>
      <span className="text-[10.5px] uppercase tracking-[0.06em]">{label}</span>
    </div>
  );
}

function BrandMark({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-navy-500/30 bg-navy-500/15 backdrop-blur-sm">
        <ShieldCheck className="h-4 w-4 text-navy-400" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200">ARS Tunisie</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">{subtitle}</p>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div
      className="relative hidden h-full w-full flex-col justify-between overflow-hidden bg-ink-950 bg-mesh-dark px-14 py-16 lg:flex"
      aria-hidden="true"
    >
      <MeshPattern />
      <GrainOverlay />
      <GlowOrbs />
      <div className="relative z-10">
        <div className="mb-16">
          <BrandMark subtitle="Département Maladie" />
        </div>
        <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.22em] text-navy-400">Agent IA Conversationnel</p>
        <h1 className="font-display text-[2.75rem] leading-[1.08] text-white">Moins d&apos;attente.</h1>
        <p className="mb-6 font-display text-[2.75rem] leading-[1.08] text-ink-300">Plus de réponses.</p>
        <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-400">
          Chaque conversation est résumée et chaque réclamation devient un ticket, en quelques secondes.
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-5">
        <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
        <TrustMark icon={<ShieldCheck className="h-3 w-3" />} label="Audit HMAC-256" />
      </div>
    </div>
  );
}

interface OtpInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  describedBy?: string | undefined;
}

function OtpInput({ id, value, onChange, length = 6, disabled, error, describedBy }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const next = digit
      ? `${value.slice(0, index)}${digit}${value.slice(index + 1)}`
      : `${value.slice(0, index)}${value.slice(index + 1)}`;
    onChange(next.slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    requestAnimationFrame(() => inputsRef.current[focusIndex]?.focus());
  };

  return (
    <div
      role="group"
      aria-label="Code d'authentification à 6 chiffres"
      className="flex gap-2 sm:gap-2.5"
      onPaste={handlePaste}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          id={index === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          aria-label={`Chiffre ${index + 1} sur ${length}`}
          onFocus={() => {
            if (index > value.length) inputsRef.current[value.length]?.focus();
          }}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={`h-12 w-full rounded-xl border bg-white/[0.04] backdrop-blur-md text-center font-mono text-lg tracking-widest text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 disabled:opacity-50 ${
            error ? 'border-navy-500' : 'border-white/10 focus:border-navy-500'
          }`}
        />
      ))}
    </div>
  );
}

interface FieldErrors {
  email?: string;
  password?: string;
  totp?: string;
  general?: string;
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Identifiants ou code TOTP invalide.';
    if (err.status === 423) {
      return err.message.startsWith('HTTP ')
        ? 'Compte temporairement verrouillé. Réessayez plus tard.'
        : err.message;
    }
    if (err.status === 422) return 'Format des identifiants invalide.';
    if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') return err.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

function redirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as { from?: { pathname?: unknown } }).from;
    if (
      typeof from?.pathname === 'string'
      && from.pathname.startsWith('/admin')
      && from.pathname !== '/admin/login'
    ) {
      return from.pathname;
    }
  }
  return '/admin/dashboard';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  const emailId = useId();
  const pwdId = useId();
  const totpId = useId();

  if (isAuthenticated) return <Navigate to={redirectTarget(location.state)} replace />;

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Adresse email invalide';
    if (password.length === 0) next.password = 'Mot de passe requis';
    if (!/^\d{6}$/.test(totp)) next.totp = 'Code à 6 chiffres requis';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !validate()) return;
    setLoading(true);
    setErrors({});
    try {
      const { user, token } = await adminApi.login(email.trim(), password, totp);
      login({ ...user, token });
      toast.success(`Bienvenue, ${user.prenom} !`);
    } catch (err) {
      setErrors({ general: loginErrorMessage(err) });
      setTotp('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-ink-950 bg-mesh-dark lg:grid lg:grid-cols-[1.15fr_1fr]">
      <BrandPanel />

      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10 sm:px-10">
        <GrainOverlay />
        <GlowOrbs />

        <div className="relative z-10 mb-10 lg:hidden">
          <BrandMark subtitle="Agent IA Conversationnel" />
        </div>

        <div className="relative z-10 w-full max-w-[400px]">
          <p className="mb-2 hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-navy-400 lg:block">
            Administration ARS
          </p>
          <h2 className="font-display text-[1.9rem] leading-tight text-white">Connexion agent</h2>
          <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-ink-400">
            Accès réservé aux agents autorisés du Département Maladie.
          </p>

          <div className="relative rounded-[28px] border border-white/10 bg-ink-900/40 p-6 shadow-glass-dark backdrop-blur-2xl ring-1 ring-white/5 sm:p-8">
            {errors.general && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-2xl border border-navy-500/20 bg-navy-500/10 backdrop-blur-sm p-3.5"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-navy-400" />
                <p className="text-[13px] leading-snug text-navy-300">{errors.general}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor={emailId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@ars.tn"
                    className={`w-full rounded-xl border bg-white/[0.04] backdrop-blur-md py-2.5 pl-10 pr-3.5 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                      errors.email ? 'border-navy-500' : 'border-white/10 focus:border-navy-500'
                    }`}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? `${emailId}-err` : undefined}
                    disabled={loading}
                  />
                </div>
                {errors.email && (
                  <p id={`${emailId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                    <AlertCircle className="h-3 w-3" /> {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={pwdId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input
                    id={pwdId}
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border bg-white/[0.04] backdrop-blur-md py-2.5 pl-10 pr-10 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                      errors.password ? 'border-navy-500' : 'border-white/10 focus:border-navy-500'
                    }`}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? `${pwdId}-err` : undefined}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 transition-colors hover:text-ink-300"
                    aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p id={`${pwdId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                    <AlertCircle className="h-3 w-3" /> {errors.password}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={totpId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                  Code TOTP <span className="text-ink-500">· Authentificateur</span>
                </label>
                <OtpInput
                  id={totpId}
                  value={totp}
                  onChange={setTotp}
                  disabled={loading}
                  error={!!errors.totp}
                  describedBy={errors.totp ? `${totpId}-err` : undefined}
                />
                {errors.totp && (
                  <p id={`${totpId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                    <AlertCircle className="h-3 w-3" /> {errors.totp}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#e5504f] via-[#d62121] to-[#a91717] py-3.5 text-[13.5px] font-semibold text-white shadow-glow-red transition-all duration-200 hover:shadow-glow-red-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:shadow-none"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -translate-x-full skew-x-12 bg-white/15 transition-transform duration-700 group-hover:translate-x-full"
                />
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <Spinner size="sm" className="text-white" />
                  ) : (
                    <>
                      Se connecter
                      <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </button>
            </form>

            <p className="mt-3 text-center text-[12.5px] text-ink-500">
              Création de compte gérée par un administrateur ARS.
            </p>
            <p className="mt-5 text-center text-[12.5px] text-ink-500">
              Besoin d'aide ?{' '}
              <a
                href="mailto:support-it@ars.tn"
                className="font-medium text-ink-300 underline-offset-2 hover:text-navy-400 hover:underline"
              >
                Contactez le support IT
              </a>
            </p>
          </div>

          <div className="mt-7 flex items-center justify-center gap-5 lg:hidden">
            <TrustMark icon={<Lock className="h-3 w-3" />} label="TLS 1.3" />
            <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
          </div>

          <div className="mt-7 flex items-center justify-center gap-5 lg:hidden">
            <TrustMark icon={<Lock className="h-3 w-3" />} label="TLS 1.3" />
            <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
          </div>

          <p className="mt-8 text-center text-[11.5px] text-ink-600">
            ARS Tunisie — Département Maladie · Accès réservé aux agents autorisés
          </p>
        </div>
      </div>
    </div>
  );
}