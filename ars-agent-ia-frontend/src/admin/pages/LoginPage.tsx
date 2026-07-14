import { useState, useId, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

const FEED_LINES = [
  'Ticket créé — Remboursement soins',
  'Dossier consulté — DigiHealth',
  'Escalade → agent humain',
  'Résumé généré — Réclamation',
  'Éligibilité vérifiée — DigiHealth',
  'Email de suivi envoyé',
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className={`font-mono text-xl ${accent ? 'text-navy-400' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-ink-500">{label}</p>
    </div>
  );
}

function TrustMark({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-500">
      <span className="text-ink-500">{icon}</span>
      <span className="text-[10.5px] uppercase tracking-[0.06em]">{label}</span>
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
    const chars = value.split('');
    chars[index] = digit;
    onChange(chars.join('').slice(0, length));
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
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={`h-12 w-full rounded-xl border bg-ink-800/60 text-center font-mono text-lg tracking-widest text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 disabled:opacity-50 ${
            error ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
          }`}
        />
      ))}
    </div>
  );
}

function LiveOpsPanel() {
  const reducedMotion = useReducedMotion();
  const [activeConvos, setActiveConvos] = useState(247);
  const [resolutionRate, setResolutionRate] = useState(62);
  const [latency, setLatency] = useState(1.8);
  const [feedIndex, setFeedIndex] = useState(0);
  const [sparkDrawn, setSparkDrawn] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSparkDrawn(true));
    if (reducedMotion) return () => cancelAnimationFrame(raf);

    const feedTimer = setInterval(() => {
      setFeedIndex((i) => (i + 1) % FEED_LINES.length);
    }, 3200);

    const statsTimer = setInterval(() => {
      setActiveConvos((v) => Math.max(210, Math.min(290, v + Math.round((Math.random() - 0.5) * 8))));
      setResolutionRate((v) => Math.max(58, Math.min(68, Math.round((v + (Math.random() - 0.5)) * 10) / 10)));
      setLatency((v) => Math.max(1.4, Math.min(2.4, Math.round((v + (Math.random() - 0.5) * 0.2) * 10) / 10)));
    }, 2600);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(feedTimer);
      clearInterval(statsTimer);
    };
  }, [reducedMotion]);

  const sparkPoints = '0,34 14,30 28,32 42,22 56,26 70,14 84,18 98,6 112,10 126,2';

  return (
    <div
      className="relative hidden h-full w-full flex-col justify-between overflow-hidden bg-ink-950 px-14 py-16 lg:flex"
      aria-hidden="true"
    >
      <MeshPattern />
      <GrainOverlay />

      <div className="relative z-10">
        <div className="mb-16 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-navy-500/30 bg-navy-500/15">
            <ShieldCheck className="h-4 w-4 text-navy-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200">ARS Tunisie</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Département Maladie</p>
          </div>
        </div>

        <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.22em] text-navy-400">
          Agent IA Conversationnel
        </p>
        <h1 className="font-display text-[2.75rem] leading-[1.08] text-white">Moins d'attente.</h1>
        <h1 className="mb-6 font-display text-[2.75rem] leading-[1.08] text-ink-300">Plus de réponses.</h1>
        <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-400">
          Chaque conversation est résumée et chaque réclamation devient un ticket, en quelques secondes.
        </p>
      </div>

      <div className="relative z-10 space-y-8">
        <div className="grid grid-cols-3 gap-6 border-b border-ink-700/60 pb-6">
          <Stat label="Conversations actives" value={activeConvos.toLocaleString('fr-FR')} />
          <Stat label="Taux de résolution" value={`${resolutionRate.toFixed(0)}%`} accent />
          <Stat label="Latence moyenne" value={`${latency.toFixed(1)}s`} />
        </div>

        <div>
          <svg viewBox="0 0 130 40" className="mb-1 h-10 w-full" preserveAspectRatio="none">
            <polyline
              points={sparkPoints}
              fill="none"
              stroke="#d62121"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 220,
                strokeDashoffset: sparkDrawn ? 0 : 220,
                transition: 'stroke-dashoffset 1.6s ease-out',
              }}
            />
          </svg>
          <p className="text-[11px] uppercase tracking-[0.1em] text-ink-500">
            Taux de résolution — 7 derniers jours
          </p>
        </div>

        <div className="h-6 overflow-hidden">
          <p key={feedIndex} className="animate-fade-in font-mono text-[12.5px] text-ink-400">
            <span className="text-navy-400">→</span> {FEED_LINES[feedIndex]}
          </p>
        </div>

        <div className="flex items-center gap-5 pt-2">
          <TrustMark icon={<Lock className="h-3 w-3" />} label="TLS 1.3" />
          <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
          <TrustMark icon={<ShieldCheck className="h-3 w-3" />} label="Audit HMAC-256" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; totp?: string; general?: string }>({});

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const emailId = useId();
  const pwdId = useId();
  const totpId = useId();

  const validate = () => {
    const e: typeof errors = {};
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = 'Adresse email invalide';
    if (password.length < 8) e.password = 'Mot de passe requis';
    if (!/^\d{6}$/.test(totp)) e.totp = 'Code à 6 chiffres requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      const { user, token } = await adminApi.login(email.trim(), password, totp.trim());
      login({ ...user, token });
      toast.success(`Bienvenue, ${user.prenom} !`);
      navigate('/admin/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrors({ general: 'Identifiants ou code TOTP invalide.' });
        } else if (err.status === 423) {
          setErrors({ general: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.' });
        } else {
          setErrors({ general: 'Une erreur est survenue. Réessayez.' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-ink-950 lg:grid lg:grid-cols-[1.15fr_1fr]">
      <LiveOpsPanel />

      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10 sm:px-10">
        <GrainOverlay />

        <div className="relative z-10 mb-10 flex items-center gap-3 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-navy-500/30 bg-navy-500/15">
            <ShieldCheck className="h-4 w-4 text-navy-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200">ARS Tunisie</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Agent IA Conversationnel</p>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-[400px]">
          <p className="mb-2 hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-navy-400 lg:block">
            Administration ARS
          </p>
          <h2 className="font-display text-[1.9rem] leading-tight text-white">Connexion agent</h2>
          <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-ink-400">
            Accès réservé aux agents autorisés du Département Maladie.
          </p>

          <div className="rounded-2xl border border-ink-700 bg-ink-900/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-sm sm:p-8">
            {errors.general && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-navy-500/30 bg-navy-500/10 p-3.5"
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
                    className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-3.5 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                      errors.email ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
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
                    className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-10 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                      errors.password ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
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
                className="group relative mt-2 w-full overflow-hidden rounded-xl bg-navy-500 py-3.5 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-navy-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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
              Pas encore de compte ?{' '}
              <Link
                to="/admin/signup"
                className="font-medium text-ink-300 underline-offset-2 hover:text-navy-400 hover:underline"
              >
                Créez un compte
              </Link>
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

          <p className="mt-8 text-center text-[11.5px] text-ink-600">
            ARS Tunisie — Département Maladie · Accès réservé aux agents autorisés
          </p>
        </div>
      </div>
    </div>
  );
}