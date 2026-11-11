import { useState, useEffect, useCallback } from 'react';
import { BookOpen, CheckCircle, Plus, Trash2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import Modal from '@/shared/components/Modal';
import { adminApi, type KnowledgeDoc } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { formatDate } from '@/lib/utils';

interface DocumentForm {
  source: string;
  language: 'fr' | 'tn';
  intent: string;
  title: string;
  question: string;
  answer: string;
}

const EMPTY_FORM: DocumentForm = {
  source: '',
  language: 'fr',
  intent: '',
  title: '',
  question: '',
  answer: '',
};

export default function KnowledgeBasePage() {
  const docsAsync = useAsync<KnowledgeDoc[]>();
  const createAsync = useAsync<KnowledgeDoc>();
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    void docsAsync.run(adminApi.listDocuments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = <K extends keyof DocumentForm>(key: K, value: DocumentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const source = form.source.trim();
    const question = form.question.trim();
    const answer = form.answer.trim();
    if (!source || !question || !answer) {
      toast.error('La source, la question et la réponse sont obligatoires.');
      return;
    }

    const created = await createAsync.run(adminApi.createDocument({
      source,
      language: form.language,
      intent: form.intent.trim() || null,
      title: form.title.trim() || null,
      question,
      answer,
    }));
    if (created) {
      toast.success('Entrée ajoutée à la base de connaissances.');
      setForm(EMPTY_FORM);
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await adminApi.deleteDocument(deleteId);
      toast.success('Entrée supprimée.');
      setDeleteId(null);
      load();
    } catch {
      toast.error('Impossible de supprimer cette entrée. Vérifiez vos droits et réessayez.');
    } finally {
      setDeleting(false);
    }
  };

  const docs = docsAsync.data ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader title="Base de connaissances" subtitle="Questions et réponses indexées pour le RAG — Agent IA" />

      <form onSubmit={handleCreate} className="card p-5 space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Plus className="h-4 w-4 text-[#b51a1a]" />
          Ajouter une entrée
        </h2>
        <p className="text-xs text-slate-500">
          Le backend accepte des questions et réponses textuelles. L’import de fichiers n’est pas disponible dans son API actuelle.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-600">
            Source *
            <input
              value={form.source}
              onChange={(event) => setField('source', event.target.value)}
              className="input-base"
              maxLength={128}
              required
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            Langue
            <select
              value={form.language}
              onChange={(event) => setField('language', event.target.value as DocumentForm['language'])}
              className="input-base"
            >
              <option value="fr">Français</option>
              <option value="tn">Tunisien</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            Titre
            <input
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
              className="input-base"
              maxLength={1000}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            Intention
            <input
              value={form.intent}
              onChange={(event) => setField('intent', event.target.value)}
              className="input-base"
              maxLength={64}
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs text-slate-600">
          Question *
          <textarea
            value={form.question}
            onChange={(event) => setField('question', event.target.value)}
            className="input-base min-h-20"
            maxLength={4000}
            required
          />
        </label>
        <label className="block space-y-1 text-xs text-slate-600">
          Réponse officielle *
          <textarea
            value={form.answer}
            onChange={(event) => setField('answer', event.target.value)}
            className="input-base min-h-28"
            maxLength={8000}
            required
          />
        </label>
        <div className="flex justify-end">
          <button type="submit" disabled={createAsync.loading} className="btn-primary text-sm">
            {createAsync.loading ? <Spinner size="sm" className="text-white" /> : 'Ajouter à la base'}
          </button>
        </div>
        {createAsync.error && <p role="alert" className="text-sm text-red-600">{createAsync.error}</p>}
      </form>

      <div className="card overflow-hidden">
        {docsAsync.loading ? (
          <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
        ) : docsAsync.error ? (
          <p role="alert" className="p-5 text-sm text-red-600">{docsAsync.error}</p>
        ) : docs.length > 0 ? (
          <ul className="divide-y divide-white/40" aria-label="Documents indexés">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-start gap-4 px-5 py-4 hover:bg-white/40 transition-colors">
                <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/60 border border-white/60">
                  <BookOpen className="h-4 w-4 text-[#b51a1a]/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{doc.title || doc.question}</p>
                  <p className="mt-1 text-xs text-slate-500">{doc.question}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{doc.answer}</p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {doc.source} · {doc.language ?? 'langue non précisée'} · {formatDate(doc.createdAt)}
                    {doc.intent ? ` · ${doc.intent}` : ''}
                  </p>
                </div>
                <span className={`flex items-center gap-1 text-xs ${doc.isActive ? 'text-sage-600' : 'text-slate-400'}`}>
                  {doc.isActive
                    ? <><CheckCircle className="h-3.5 w-3.5" />Actif</>
                    : <><XCircle className="h-3.5 w-3.5" />Inactif</>}
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteId(doc.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Supprimer ${doc.title || doc.question}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Base de connaissances vide"
            description="Ajoutez une question et sa réponse officielle pour alimenter la recherche."
          />
        )}
      </div>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer l’entrée" size="sm">
        <p className="mb-5 text-sm text-slate-600">Cette entrée sera supprimée de la base de connaissances.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setDeleteId(null)} className="btn-secondary">Annuler</button>
          <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="btn-danger">
            {deleting ? <Spinner size="sm" className="text-white" /> : 'Supprimer'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
