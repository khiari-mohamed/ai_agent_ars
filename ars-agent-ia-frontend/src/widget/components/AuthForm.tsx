import { useState, useId } from 'react';
import { Shield, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuthState } from '@/types/auth';
import Spinner from '@/shared/components/Spinner';

interface AuthFormProps {
  authState: AuthState;
  onSubmitCin: (cin: string) => void;
  onSubmitOtp: (otp: string) => void;
}

export default function AuthForm({ authState, onSubmitCin, onSubmitOtp }: AuthFormProps) {
  const [cin, setCin]     = useState('');
  const [otp, setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const cinId = useId();
  const otpId = useId();

  const handleCinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cin.trim().replace(/\s/g, '');
    if (trimmed.length < 7) return;
    setLoading(true);
    onSubmitCin(trimmed);
    setTimeout(() => setLoading(false), 2000);
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = otp.trim().replace(/\s/g, '');
    if (trimmed.length !== 6) return;
    setLoading(true);
    onSubmitOtp(trimmed);
    setTimeout(() => setLoading(false), 2000);
  };

  if (authState === 'LOCKED') {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
        <Shield className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-red-700">
          Trop de tentatives. Votre session est temporairement bloquée (15 min).
          Veuillez contacter l'ARS directement.
        </p>
      </div>
    );
  }

  if (authState === 'IDLE' || authState === 'PENDING_CIN') {
    return (
      <form onSubmit={handleCinSubmit} className="space-y-2" noValidate>
        <div className="flex items-center gap-1.5 mb-1">
          <Shield className="h-3.5 w-3.5 text-navy-500" />
          <p className="text-xs font-medium text-slate-700">Identification requise</p>
        </div>
        <div>
          <label htmlFor={cinId} className="text-xs text-slate-500 mb-1 block">
            Numéro de CIN
          </label>
          <div className="flex gap-2">
            <input
              id={cinId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cin}
              onChange={(e) => setCin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="Ex: 12345678"
              className="input-base flex-1 text-sm py-2"
              required
              aria-required="true"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={cin.trim().length < 7 || loading}
              className="btn-primary text-xs px-3 py-2"
            >
              {loading ? <Spinner size="sm" className="text-white" /> : 'Confirmer'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  if (authState === 'PENDING_OTP') {
    return (
      <form onSubmit={handleOtpSubmit} className="space-y-2" noValidate>
        <div className="flex items-center gap-1.5 mb-1">
          <KeyRound className="h-3.5 w-3.5 text-navy-500" />
          <p className="text-xs font-medium text-slate-700">Code de vérification</p>
        </div>
        <p className="text-xs text-slate-500">Un code à 6 chiffres a été envoyé sur votre téléphone.</p>
        <div className="flex gap-2">
          <input
            id={otpId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className={cn('input-base flex-1 text-sm py-2 font-mono tracking-widest text-center')}
            required
            aria-required="true"
            disabled={loading}
            maxLength={6}
          />
          <button
            type="submit"
            disabled={otp.trim().length !== 6 || loading}
            className="btn-primary text-xs px-3 py-2"
          >
            {loading ? <Spinner size="sm" className="text-white" /> : 'Valider'}
          </button>
        </div>
      </form>
    );
  }

  return null;
}