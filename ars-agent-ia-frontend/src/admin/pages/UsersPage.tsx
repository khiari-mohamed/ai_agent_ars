import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Users, UserX, CheckCircle, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '@/shared/components/Modal';
import Spinner from '@/shared/components/Spinner';
import Badge from '@/shared/components/Badge';
import EmptyState from '@/shared/components/EmptyState';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { formatRelative, cn } from '@/lib/utils';
import type { AdminUser, UserRole } from '@/types/admin';
import toast from 'react-hot-toast';

const roleColors: Record<UserRole, string> = {
  AGENT:       'bg-blue-50 text-blue-700 border-blue-200',
  SUPERVISEUR: 'bg-purple-50 text-purple-700 border-purple-200',
  ADMIN:       'bg-red-50 text-red-700 border-red-200',
};

interface UserForm { nom: string; prenom: string; email: string; role: UserRole; }
const INIT_FORM: UserForm = { nom: '', prenom: '', email: '', role: 'AGENT' };

export default function UsersPage() {
  const usersAsync  = useAsync<AdminUser[]>();
  const createAsync = useAsync<AdminUser>();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<UserForm>(INIT_FORM);
  const [formErrors, setFormErrors] = useState<Partial<UserForm>>({});

  const load = useCallback(() => {
    usersAsync.run(adminApi.listUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const validateForm = () => {
    const e: Partial<UserForm> = {};
    if (!form.nom.trim())   e.nom   = 'Nom requis';
    if (!form.prenom.trim())e.prenom= 'Prénom requis';
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = 'Email invalide';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    const res = await createAsync.run(adminApi.createUser({ ...form, active: true }));
    if (res !== null) {
      toast.success(`Utilisateur ${res.prenom} ${res.nom} créé`);
      setShowCreate(false);
      setForm(INIT_FORM);
      load();
    }
  };

  const handleDeactivate = async (user: AdminUser) => {
    try {
      await adminApi.deactivateUser(user.id);
      toast.success(`${user.prenom} ${user.nom} désactivé`);
      load();
    } catch {
      toast.error('Erreur lors de la désactivation');
    }
  };

  const users = usersAsync.data ?? [];

  return (
    <div className="w-full p-6 space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Gestion des accès au tableau de bord admin"
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <UserPlus className="h-4 w-4" />
            Nouvel utilisateur
          </button>
        }
      />

      <div className="card overflow-hidden">
        {usersAsync.loading ? (
          <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
        ) : users.length > 0 ? (
          <ul className="divide-y divide-surface-border" aria-label="Utilisateurs">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition-colors">
                <div className="h-9 w-9 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-navy-600 text-sm font-semibold">{u.prenom[0]}{u.nom[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{u.prenom} {u.nom}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <Badge className={cn('border', roleColors[u.role])}>{u.role}</Badge>
                <div className="flex items-center gap-1.5 text-xs">
                  {u.active
                    ? <><CheckCircle className="h-3.5 w-3.5 text-sage-500" /><span className="text-sage-600">Actif</span></>
                    : <><XCircle className="h-3.5 w-3.5 text-slate-400" /><span className="text-slate-400">Inactif</span></>
                  }
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                  {u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Jamais connecté'}
                </p>
                {u.active && (
                  <button
                    onClick={() => handleDeactivate(u)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Désactiver ${u.prenom} ${u.nom}`}
                    title="Désactiver"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="Aucun utilisateur" description="Créez le premier compte agent ARS." />
        )}
      </div>

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Créer un utilisateur">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Prénom</label>
              <input value={form.prenom} onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))} className="input-base" placeholder="Fatma" />
              {formErrors.prenom && <p className="text-xs text-red-500 mt-1">{formErrors.prenom}</p>}
            </div>
            <div>
              <label className="label-base">Nom</label>
              <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} className="input-base" placeholder="Ben Ali" />
              {formErrors.nom && <p className="text-xs text-red-500 mt-1">{formErrors.nom}</p>}
            </div>
          </div>
          <div>
            <label className="label-base">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-base" placeholder="f.benali@ars.tn" />
            {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
          </div>
          <div>
            <label className="label-base">Rôle</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))} className="input-base">
              <option value="AGENT">Agent</option>
              <option value="SUPERVISEUR">Superviseur</option>
              <option value="ADMIN">Administrateur</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Annuler</button>
            <button onClick={handleCreate} disabled={createAsync.loading} className="btn-primary">
              {createAsync.loading ? <Spinner size="sm" className="text-white" /> : 'Créer l\'utilisateur'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}