import { useState } from 'react';
import { Save, Sliders, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Spinner from '@/shared/components/Spinner';
import toast from 'react-hot-toast';

interface EscalationSettings {
  sentimentThreshold: number;
  maxAuthAttempts: number;
  maxConversationDurationMin: number;
  maxUnresolvedTurns: number;
  inactivityTimeoutMin: number;
}

const DEFAULTS: EscalationSettings = {
  sentimentThreshold: -0.6,
  maxAuthAttempts: 3,
  maxConversationDurationMin: 15,
  maxUnresolvedTurns: 3,
  inactivityTimeoutMin: 5,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<EscalationSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    // In production: PATCH /api/admin/settings
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    toast.success('Paramètres enregistrés');
    setTimeout(() => setSaved(false), 3000);
  };

  const update = <K extends keyof EscalationSettings>(key: K, val: EscalationSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  return (
    <div className="w-full p-6 space-y-6">
      <PageHeader title="Paramètres système" subtitle="Configuration des règles métier de l'agent IA" />

      {/* Escalation rules */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-border">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-700">Règles d'escalade</h2>
        </div>

        <div className="grid gap-5">
          {/* Sentiment */}
          <div>
            <label className="label-base flex items-center justify-between">
              <span>Seuil de sentiment (escalade automatique)</span>
              <span className="font-mono text-navy-600">{settings.sentimentThreshold}</span>
            </label>
            <input
              type="range"
              min="-1" max="0" step="0.05"
              value={settings.sentimentThreshold}
              onChange={(e) => update('sentimentThreshold', parseFloat(e.target.value))}
              className="w-full accent-navy-600 mt-2"
              aria-label="Seuil de sentiment"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>-1 (très négatif)</span>
              <span>0 (neutre)</span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              L'agent escalade si le score descend en dessous de ce seuil après 2 messages.
            </p>
          </div>

          {/* Auth attempts */}
          <div>
            <label className="label-base">Tentatives d'authentification max.</label>
            <div className="flex gap-2 items-center mt-1">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => update('maxAuthAttempts', n)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium border transition-colors ${
                    settings.maxAuthAttempts === n
                      ? 'bg-[#d62121] text-white border-[#d62121]'
                      : 'bg-white text-slate-600 border-surface-border hover:border-navy-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="label-base flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Durée max. de conversation (minutes)
            </label>
            <input
              type="number"
              min={5} max={60}
              value={settings.maxConversationDurationMin}
              onChange={(e) => update('maxConversationDurationMin', parseInt(e.target.value))}
              className="input-base w-24 mt-1"
            />
          </div>

          {/* Unresolved turns */}
          <div>
            <label className="label-base flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              Tours sans résolution avant escalade
            </label>
            <input
              type="number"
              min={1} max={10}
              value={settings.maxUnresolvedTurns}
              onChange={(e) => update('maxUnresolvedTurns', parseInt(e.target.value))}
              className="input-base w-24 mt-1"
            />
          </div>

          {/* Inactivity */}
          <div>
            <label className="label-base flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              Timeout d'inactivité (minutes)
            </label>
            <input
              type="number"
              min={1} max={30}
              value={settings.inactivityTimeoutMin}
              onChange={(e) => update('inactivityTimeoutMin', parseInt(e.target.value))}
              className="input-base w-24 mt-1"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-slate-500" aria-live="polite">
          {saved ? 'Modifications enregistrées' : ''}
        </span>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving
            ? <Spinner size="sm" className="text-white" />
            : <><Save className="h-4 w-4" /> Enregistrer les modifications</>
          }
        </button>
      </div>
    </div>
  );
}