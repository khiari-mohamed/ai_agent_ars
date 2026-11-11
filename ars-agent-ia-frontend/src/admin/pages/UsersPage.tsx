import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle, Copy, KeyRound, Plus, UserCheck, UserX, Users, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import Spinner from '@/shared/components/Spinner';
import Badge from '@/shared/components/Badge';
import EmptyState from '@/shared/components/EmptyState';
import Modal from '@/shared/components/Modal';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { passwordChecks, isStrongPassword } from '@/lib/password';
import { canManageUsers } from '@/admin/access';
import { useAuthStore } from '@/store/authStore';
import { formatRelative, cn } from '@/lib/utils';
import type { AdminUser, UserRole } from '@/types/admin';

const ROLE_LABELS: Record<UserRole, string> = {
  AGENT: 'Agent',
  SUPERVISEUR: 'Superviseur',
  ADMIN: 'Administrateur',
};

const ROLE_COLORS: Record<UserRole, string> = {
  AGENT: 'bg-blue-50 text-blue-700 border-blue-200',
  SUPERVISEUR: 'bg-purple-50 text-purple-700 border-purple-200',
  ADMIN: 'bg-red-50 text-red-700 border-red-200',
};

interface CreateForm {
  prenom: string;
  nom: string;
  email: string;
  password: string;
  role: UserRole;
}

const EMPTY_FORM: CreateForm = { prenom: '', nom: '', email: '', password: '', role: 'AGENT' };

interface Enrollment {
  user: AdminUser;
  totpSecret: string;
  totpUri: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copié');
    } catch {
      toast.error('Copie impossible : sélectionnez le texte manuellement.');
    }
  };
  return (
    <div>
      <label className="label-base">{label}</label>
      <div className="flex gap-2">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input-base font-mono text-xs" />
        <button type="button" onClick={() => void copy()} className="btn-secondary px-3" aria-label={`Copier : ${label}`}>
          <Copy className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = canManageUsers(me?.role);

  const usersAsync = useAsync<AdminUser[]>();
  const { run } = usersAsync;

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    void run(adminApi.listUsers());
  }, [run]);

  useEffect(() => { load(); }, [load]);

  const setField = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!isStrongPassword(form.password) || creating) return;
    setCreating(true);
    try {
      const result = await adminApi.createUser({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setEnrollment(result);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (user: AdminUser, active: boolean) => {
    setBusyId(user.id);
    try {
      await adminApi.setUserActive(user.id, active);
      toast.success(`${user.prenom} ${user.nom} ${active ? 'réactivé' : 'désactivé'}`);
      setToDeactivate(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const users = usersAsync.data ?? [];
  const checks = passwordChecks(form.password);

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Gestion des accès au tableau de bord admin"
        action={
          isAdmin ? (
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary text-sm">
              <Plus className="h-4 w-4" aria-hidden /> Nouvel utilisateur
            </button>
          ) : undefined
        }
      />

      <div className="px-6">
        <div className="card overflow-hidden">
          {usersAsync.loading && !usersAsync.data ? (
            <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
          ) : usersAsync.error && !usersAsync.data ? (
            <p role="alert" className="p-5 text-sm text-red-600">{usersAsync.error}</p>
          ) : users.length > 0 ? (
            <ul className="divide-y divide-surface-border" aria-label="Utilisateurs">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition-colors">
                  <div className="h-9 w-9 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0" aria-hidden>
                    <span className="text-navy-600 text-sm font-semibold">{u.prenom[0]}{u.nom[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{u.prenom} {u.nom}{u.id === me?.id && <span className="ml-2 text-2xs text-slate-400">(vous)</span>}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <Badge className={cn('border', ROLE_COLORS[u.role])}>{ROLE_LABELS[u.role]}</Badge>
                  <div className="flex items-center gap-1.5 text-xs">
                    {u.active
                      ? <><CheckCircle className="h-3.5 w-3.5 text-sage-500" aria-hidden /><span className="text-sage-600">Actif</span></>
                      : <><XCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden /><span className="text-slate-400">Inactif</span></>}
                  </div>
                  <p className="hidden sm:block text-xs text-slate-400 whitespace-nowrap">
                    {u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Jamais connecté'}
                  </p>
                  {isAdmin && u.id !== me?.id && (
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => (u.active ? setToDeactivate(u) : void setActive(u, true))}
                      className="p-1.5 rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      aria-label={`${u.active ? 'Désactiver' : 'Réactiver'} ${u.prenom} ${u.nom}`}
                      title={u.active ? 'Désactiver' : 'Réactiver'}
                    >
                      {u.active ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="Aucun utilisateur" description="Aucun compte agent ARS n’est enregistré." />
          )}
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvel utilisateur" size="md">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-600">
              Prénom *
              <input required maxLength={100} value={form.prenom} onChange={(e) => setField('prenom', e.target.value)} className="input-base" />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              Nom *
              <input required maxLength={100} value={form.nom} onChange={(e) => setField('nom', e.target.value)} className="input-base" />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-slate-600">
            Email *
            <input required type="email" autoComplete="off" value={form.email} onChange={(e) => setField('email', e.target.value)} className="input-base" />
          </label>
          <label className="block space-y-1 text-xs text-slate-600">
            Rôle
            <select value={form.role} onChange={(e) => setField('role', e.target.value as UserRole)} className="input-base">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs text-slate-600">
            Mot de passe initial *
            <input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setField('password', e.target.value)} className="input-base" />
          </label>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Règles du mot de passe">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'text-sage-600' : 'text-slate-400'}>
                {c.ok ? '✓' : '○'} {c.label}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={creating || !isStrongPassword(form.password)} className="btn-primary">
              {creating ? <Spinner size="sm" className="text-white" /> : 'Créer le compte'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={enrollment !== null} onClose={() => setEnrollment(null)} title="Activer l’authentificateur" size="md">
        {enrollment && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800" role="alert">
              <KeyRound className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>
                Cette clé n’est affichée qu’une seule fois. Transmettez-la à {enrollment.user.prenom} {enrollment.user.nom} par un canal sûr :
                sans elle, le compte ne peut pas se connecter.
              </span>
            </p>
            <CopyField label="Clé secrète (saisie manuelle)" value={enrollment.totpSecret} />
            <CopyField label="URI otpauth (import)" value={enrollment.totpUri} />
            <p className="text-xs text-slate-500">
              Dans l’application d’authentification : « Ajouter un compte » puis « Saisir une clé de configuration », avec l’email du compte et la clé ci-dessus (codes à 6 chiffres, renouvelés toutes les 30 secondes).
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setEnrollment(null)} className="btn-primary">J’ai transmis la clé</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={toDeactivate !== null} onClose={() => setToDeactivate(null)} title="Désactiver l’utilisateur" size="sm">
        {toDeactivate && (
          <>
            <p className="mb-5 text-sm text-slate-600">
              {toDeactivate.prenom} {toDeactivate.nom} ne pourra plus se connecter. Vous pourrez le réactiver plus tard.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setToDeactivate(null)} className="btn-secondary">Annuler</button>
              <button type="button" disabled={busyId === toDeactivate.id} onClick={() => void setActive(toDeactivate, false)} className="btn-danger">
                {busyId === toDeactivate.id ? <Spinner size="sm" className="text-white" /> : 'Désactiver'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}