import { Check, Lock, Minus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import type { UserRole } from '@/types/admin';

const LIMITS: ReadonlyArray<{ label: string; value: string; note: string }> = [
  { label: 'Durée de session admin', value: '30 minutes', note: 'Le jeton expire, reconnexion requise (pas de renouvellement).' },
  { label: 'Message texte (chat)', value: '1 000 caractères (défaut)', note: 'Valeur configurable côté serveur (maximum autorisé : 4 000).' },
  { label: 'Énoncé vocal', value: '3 Mo', note: 'Taille maximale d’un enregistrement.' },
  { label: 'Cadence vocale', value: '12 tours / minute', note: 'Au-delà, les tours sont refusés.' },
  { label: 'Inactivité vocale', value: '120 secondes', note: 'La session vocale est fermée.' },
];

const ROLES: ReadonlyArray<UserRole> = ['AGENT', 'SUPERVISEUR', 'ADMIN'];
const ROLE_LABELS: Record<UserRole, string> = { AGENT: 'Agent', SUPERVISEUR: 'Superviseur', ADMIN: 'Admin' };

const PERMISSIONS: ReadonlyArray<{ label: string; roles: ReadonlyArray<UserRole> }> = [
  { label: 'Tableau de bord, conversations, envoi d’email', roles: ['AGENT', 'SUPERVISEUR', 'ADMIN'] },
  { label: 'Tickets (consulter, changer statut et assignation)', roles: ['AGENT', 'SUPERVISEUR', 'ADMIN'] },
  { label: 'Base de savoirs : consulter et tester la recherche', roles: ['AGENT', 'SUPERVISEUR', 'ADMIN'] },
  { label: 'Base de savoirs : ajouter une entrée', roles: ['SUPERVISEUR', 'ADMIN'] },
  { label: 'Journaux d’audit', roles: ['SUPERVISEUR', 'ADMIN'] },
  { label: 'Base de savoirs : supprimer une entrée', roles: ['ADMIN'] },
  { label: 'Créer, désactiver ou réactiver un utilisateur', roles: ['ADMIN'] },
];

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 w-full">
      <PageHeader title="Paramètres" subtitle="Limites techniques et droits d’accès — lecture seule" />

      <p className="flex items-start gap-2 rounded-xl border border-surface-border bg-white/50 px-4 py-3 text-sm text-slate-600">
        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />
        Ces valeurs sont définies par la configuration du serveur. Elles ne sont pas modifiables depuis cette interface.
      </p>

      <section className="card p-5" aria-labelledby="limits-title">
        <h2 id="limits-title" className="mb-4 flex items-center gap-2 border-b border-surface-border pb-3 text-sm font-semibold text-slate-700">
          <SlidersHorizontal className="h-4 w-4 text-amber-500" aria-hidden />
          Limites techniques
        </h2>
        <dl className="divide-y divide-surface-border">
          {LIMITS.map((item) => (
            <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <div>
                <dt className="text-sm font-medium text-slate-700">{item.label}</dt>
                <dd className="text-xs text-slate-500">{item.note}</dd>
              </div>
              <dd className="font-mono text-sm text-navy-600">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card overflow-hidden" aria-labelledby="roles-title">
        <h2 id="roles-title" className="flex items-center gap-2 border-b border-surface-border px-5 py-4 text-sm font-semibold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-sage-500" aria-hidden />
          Rôles et permissions
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Permissions par rôle">
            <thead>
              <tr className="border-b border-surface-border">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {PERMISSIONS.map((p) => (
                <tr key={p.label}>
                  <th scope="row" className="px-5 py-3 text-left font-normal text-slate-700">{p.label}</th>
                  {ROLES.map((r) => (
                    <td key={r} className="px-4 py-3 text-center">
                      {p.roles.includes(r)
                        ? <Check className="mx-auto h-4 w-4 text-sage-500" aria-label="Autorisé" />
                        : <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Non autorisé" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}