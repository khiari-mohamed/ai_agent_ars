import { useState, useId, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Ticket,
} from 'lucide-react';
import { adminApi } from '@/lib/api-admin';
import { ApiError } from '@/lib/api';
import Spinner from '@/shared/components/Spinner';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Shared visual primitives — kept byte-identical to LoginPage.tsx    */
/*  so the two screens read as one continuous surface.                */
/* ------------------------------------------------------------------ */

function MeshPattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]" aria-hidden="true">
      <defs>
        <pattern id="ars-star-signup" width="56" height="56" patternUnits="userSpaceOnUse">
          <path
            d="M28 4 L34 20 L52 20 L38 30 L44 48 L28 38 L12 48 L18 30 L4 20 L22 20 Z"
            fill="none"
            stroke="#eceef1"
            strokeWidth="0.75"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ars-star-signup)" />
    </svg>
  );
}

function GrainOverlay() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.035] mix-blend-overlay" aria-hidden="true">
      <filter id="ars-grain-signup">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ars-grain-signup)" />
    </svg>
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

/* ------------------------------------------------------------------ */
/*  Left rail — swapped from the live ops dashboard (login) for a      */
/*  provisioning-flow explainer (signup), same frame + typography.     */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    label: 'Code d\u2019invitation',
    detail: 'Fourni par votre superviseur au Département Maladie.',
  },
  {
    label: 'Identité de l\u2019agent',
    detail: 'Nom, prénom et email professionnel @ars.tn.',
  },
  {
    label: 'Mot de passe',
    detail: 'Créez un mot de passe fort, connu de vous seul.',
  },
  {
    label: 'Double authentification',
    detail: 'Un QR code TOTP vous sera présenté après validation.',
  },
];

function ProvisioningPanel({ activeStep }: { activeStep: number }) {
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
          Provisionnement de compte agent
        </p>
        <h1 className="font-display text-[2.75rem] leading-[1.08] text-white">Un accès,</h1>
        <h1 className="mb-6 font-display text-[2.75rem] leading-[1.08] text-ink-300">bien vérifié.</h1>
        <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-400">
          Chaque compte est rattaché à une invitation nominative et protégé par une authentification à deux
          facteurs avant tout accès au tableau de bord.
        </p>
      </div>

      <div className="relative z-10 space-y-8">
        <ol className="space-y-5 border-b border-ink-700/60 pb-6">
          {STEPS.map((step, index) => {
            const state = index < activeStep ? 'done' : index === activeStep ? 'active' : 'upcoming';
            return (
              <li key={step.label} className="flex items-start gap-3.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors duration-200 ${
                    state === 'done'
                      ? 'border-navy-500 bg-navy-500 text-white'
                      : state === 'active'
                      ? 'border-navy-500 bg-navy-500/15 text-navy-400'
                      : 'border-ink-600 text-ink-500'
                  }`}
                >
                  {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <div>
                  <p className={`text-[13px] font-medium ${state === 'upcoming' ? 'text-ink-400' : 'text-ink-200'}`}>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-500">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-5 pt-2">
          <TrustMark icon={<Lock className="h-3 w-3" />} label="TLS 1.3" />
          <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
          <TrustMark icon={<ShieldCheck className="h-3 w-3" />} label="Audit HMAC-256" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Password strength — quiet, no scoring theatrics, matches ink/navy  */
/* ------------------------------------------------------------------ */

function getPasswordStrength(pwd: string) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const level = Math.min(score, 4);
  const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Fort'];
  return { level, label: labels[level] };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const { level, label } = useMemo(() => getPasswordStrength(password), [password]);
  if (!password) return null;

  const colors = ['bg-navy-500', 'bg-navy-400', 'bg-amber-500', 'bg-sage-500', 'bg-sage-400'];

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i < level ? colors[level] : 'bg-ink-700'
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-500">
        Robustesse : <span className="text-ink-300">{label}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Signup form                                                        */
/* ------------------------------------------------------------------ */

interface FormState {
  codeInvitation: string;
  prenom: string;
  nom: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  codeInvitation?: string;
  prenom?: string;
  nom?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

const initialForm: FormState = {
  codeInvitation: '',
  prenom: '',
  nom: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function SignupPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  const inviteId = useId();
  const prenomId = useId();
  const nomId = useId();
  const emailId = useId();
  const pwdId = useId();
  const confirmId = useId();

  // Drives the left-rail step indicator; purely visual, tracks how much of
  // the form has been meaningfully filled in.
  const activeStep = useMemo(() => {
    if (!form.codeInvitation.trim()) return 0;
    if (!form.prenom.trim() || !form.nom.trim() || !form.email.trim()) return 1;
    if (!form.password || form.password !== form.confirmPassword) return 2;
    return 3;
  }, [form]);

  const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const validate = () => {
    const e: FormErrors = {};
    if (!form.codeInvitation.trim()) e.codeInvitation = 'Code d\u2019invitation requis';
    if (!form.prenom.trim()) e.prenom = 'Prénom requis';
    if (!form.nom.trim()) e.nom = 'Nom requis';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Adresse email invalide';
    else if (!form.email.trim().toLowerCase().endsWith('@ars.tn')) e.email = 'Utilisez votre email @ars.tn';
    if (form.password.length < 8) e.password = 'Minimum 8 caractères';
    else if (getPasswordStrength(form.password).level < 2) e.password = 'Mot de passe trop faible';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await adminApi.signup({
        codeInvitation: form.codeInvitation.trim(),
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      setSuccess(true);
      toast.success('Compte créé. Configurez votre authentificateur pour continuer.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 410) {
          setErrors({ codeInvitation: 'Code d\u2019invitation invalide ou expiré' });
        } else if (err.status === 409) {
          setErrors({ email: 'Un compte existe déjà avec cet email' });
        } else if (err.status === 422) {
          setErrors({ general: 'Certaines informations sont invalides. Vérifiez le formulaire.' });
        } else {
          setErrors({ general: 'Une erreur est survenue. Réessayez.' });
        }
      } else {
        setErrors({ general: 'Une erreur est survenue. Réessayez.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-ink-950 lg:grid lg:grid-cols-[1.15fr_1fr]">
      <ProvisioningPanel activeStep={activeStep} />

      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10 sm:px-10">
        <GrainOverlay />

        <div className="relative z-10 mb-10 flex items-center gap-3 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-navy-500/30 bg-navy-500/15">
            <ShieldCheck className="h-4 w-4 text-navy-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200">ARS Tunisie</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Provisionnement agent</p>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-[400px]">
          <p className="mb-2 hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-navy-400 lg:block">
            Administration ARS
          </p>
          <h2 className="font-display text-[1.9rem] leading-tight text-white">Créer un compte agent</h2>
          <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-ink-400">
            Sur invitation uniquement. Munissez-vous du code transmis par votre superviseur.
          </p>

          <div className="rounded-2xl border border-ink-700 bg-ink-900/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-sm sm:p-8">
            {success ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-sage-500/30 bg-sage-500/10">
                  <CheckCircle2 className="h-6 w-6 text-sage-400" />
                </div>
                <h3 className="font-display text-[1.35rem] text-white">Compte créé</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-400">
                  Votre compte agent a été enregistré. Connectez-vous pour configurer votre authentificateur
                  TOTP et accéder au tableau de bord.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  className="group relative mt-6 w-full overflow-hidden rounded-xl bg-navy-500 py-3.5 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-navy-600 active:scale-[0.99]"
                >
                  <span className="relative flex items-center justify-center gap-2">
                    Aller à la connexion
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </button>
              </div>
            ) : (
              <>
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
                    <label htmlFor={inviteId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                      Code d&rsquo;invitation
                    </label>
                    <div className="relative">
                      <Ticket className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                      <input
                        id={inviteId}
                        type="text"
                        autoComplete="off"
                        value={form.codeInvitation}
                        onChange={update('codeInvitation')}
                        placeholder="ARS-INV-XXXXXX"
                        className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-3.5 text-[13.5px] uppercase tracking-wide text-white placeholder:text-ink-500 placeholder:tracking-normal transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                          errors.codeInvitation ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
                        }`}
                        aria-invalid={!!errors.codeInvitation}
                        aria-describedby={errors.codeInvitation ? `${inviteId}-err` : undefined}
                        disabled={loading}
                      />
                    </div>
                    {errors.codeInvitation && (
                      <p id={`${inviteId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                        <AlertCircle className="h-3 w-3" /> {errors.codeInvitation}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor={prenomId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                        Prénom
                      </label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                        <input
                          id={prenomId}
                          type="text"
                          autoComplete="given-name"
                          value={form.prenom}
                          onChange={update('prenom')}
                          placeholder="Amine"
                          className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-3 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                            errors.prenom ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
                          }`}
                          aria-invalid={!!errors.prenom}
                          aria-describedby={errors.prenom ? `${prenomId}-err` : undefined}
                          disabled={loading}
                        />
                      </div>
                      {errors.prenom && (
                        <p id={`${prenomId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                          <AlertCircle className="h-3 w-3" /> {errors.prenom}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor={nomId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                        Nom
                      </label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                        <input
                          id={nomId}
                          type="text"
                          autoComplete="family-name"
                          value={form.nom}
                          onChange={update('nom')}
                          placeholder="Ben Ali"
                          className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-3 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                            errors.nom ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
                          }`}
                          aria-invalid={!!errors.nom}
                          aria-describedby={errors.nom ? `${nomId}-err` : undefined}
                          disabled={loading}
                        />
                      </div>
                      {errors.nom && (
                        <p id={`${nomId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                          <AlertCircle className="h-3 w-3" /> {errors.nom}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor={emailId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                      Email professionnel
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                      <input
                        id={emailId}
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={update('email')}
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
                        autoComplete="new-password"
                        value={form.password}
                        onChange={update('password')}
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
                    <PasswordStrengthMeter password={form.password} />
                    {errors.password && (
                      <p id={`${pwdId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                        <AlertCircle className="h-3 w-3" /> {errors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={confirmId} className="mb-1.5 block text-[12.5px] font-medium text-ink-300">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                      <input
                        id={confirmId}
                        type={showConfirmPwd ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={update('confirmPassword')}
                        placeholder="••••••••"
                        className={`w-full rounded-xl border bg-ink-800/60 py-2.5 pl-10 pr-10 text-[13.5px] text-white placeholder:text-ink-500 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-navy-500/25 ${
                          errors.confirmPassword ? 'border-navy-500' : 'border-ink-600 focus:border-navy-500'
                        }`}
                        aria-invalid={!!errors.confirmPassword}
                        aria-describedby={errors.confirmPassword ? `${confirmId}-err` : undefined}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPwd((v) => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 transition-colors hover:text-ink-300"
                        aria-label={showConfirmPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p id={`${confirmId}-err`} className="mt-1.5 flex items-center gap-1 text-[12px] text-navy-400">
                        <AlertCircle className="h-3 w-3" /> {errors.confirmPassword}
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
                          Créer mon compte
                          <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                        </>
                      )}
                    </span>
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  className="mt-5 flex w-full items-center justify-center gap-1.5 text-[12.5px] text-ink-500 transition-colors hover:text-ink-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>
                    Déjà un compte ?{' '}
                    <span className="font-medium text-ink-300 underline-offset-2 hover:text-navy-400 hover:underline">
                      Se connecter
                    </span>
                  </span>
                </button>
              </>
            )}
          </div>

          {!success && (
            <>
              <div className="mt-7 flex items-center justify-center gap-5 lg:hidden">
                <TrustMark icon={<Lock className="h-3 w-3" />} label="TLS 1.3" />
                <TrustMark icon={<KeyRound className="h-3 w-3" />} label="MFA TOTP" />
              </div>

              <p className="mt-8 text-center text-[11.5px] text-ink-600">
                ARS Tunisie — Département Maladie · Accès réservé aux agents autorisés
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}