import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileText, Trash2, CheckCircle, Loader, AlertCircle, BookOpen } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Spinner from '@/shared/components/Spinner';
import EmptyState from '@/shared/components/EmptyState';
import { adminApi } from '@/lib/api-admin';
import { useAsync } from '@/lib/hooks/useAsync';
import { formatDate } from '@/lib/utils';
import Modal from '@/shared/components/Modal';
import toast from 'react-hot-toast';

interface KnowledgeDoc {
  id: string;
  title: string;
  sourceUrl: string | null;
  status: 'INDEXING' | 'INDEXED' | 'FAILED';
  chunkCount: number;
  uploadedAt: string;
}

const statusIcon = {
  INDEXING: <Loader className="h-4 w-4 text-amber-500 animate-spin" />,
  INDEXED:  <CheckCircle className="h-4 w-4 text-sage-500" />,
  FAILED:   <AlertCircle className="h-4 w-4 text-red-500" />,
};

const statusLabel = { INDEXING: 'Indexation…', INDEXED: 'Indexé', FAILED: 'Erreur' };

export default function KnowledgeBasePage() {
  const docsAsync   = useAsync<KnowledgeDoc[]>();
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    docsAsync.run(adminApi.listDocuments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      toast.error('Format non supporté. Utilisez PDF ou DOCX.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 Mo).');
      return;
    }
    setUploading(true);
    // In production: use FormData + fetch to /api/admin/knowledge/upload
    await new Promise((r) => setTimeout(r, 1500)); // mock
    toast.success(`"${file.name}" ajouté à la file d'indexation`);
    setUploading(false);
    load();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await adminApi.deleteDocument(deleteId);
      toast.success('Document supprimé');
      setDeleteId(null);
      load();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const docs = docsAsync.data ?? [];

  return (
    <div className="p-6 space-y-5 w-full">
      <PageHeader title="Base de connaissances" subtitle="Documents indexés pour le RAG — Agent IA" />

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-150 ${
          dragOver ? 'border-navy-400 bg-navy-50' : 'border-surface-border hover:border-navy-300 hover:bg-surface-raised'
        }`}
        role="button"
        tabIndex={0}
        aria-label="Zone de dépôt de document"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
          aria-hidden
        />
        {uploading ? (
          <Spinner size="lg" className="mx-auto mb-2" />
        ) : (
          <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        )}
        <p className="text-sm font-medium text-slate-600">
          {uploading ? 'Traitement en cours…' : 'Déposez un PDF ou DOCX ici'}
        </p>
        <p className="text-xs text-slate-400 mt-1">ou cliquez pour parcourir — Max 10 Mo</p>
      </div>

      {/* Docs list */}
      <div className="card overflow-hidden">
        {docsAsync.loading ? (
          <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
        ) : docs.length > 0 ? (
          <ul className="divide-y divide-surface-border" aria-label="Documents indexés">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition-colors">
                <FileText className="h-5 w-5 text-navy-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-400">{doc.chunkCount} segments · {formatDate(doc.uploadedAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {statusIcon[doc.status]}
                  <span>{statusLabel[doc.status]}</span>
                </div>
                <button
                  onClick={() => setDeleteId(doc.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  aria-label={`Supprimer ${doc.title}`}
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
            description="Déposez des documents PDF ou DOCX pour alimenter la base de connaissances de l'agent IA."
          />
        )}
      </div>

      {/* Delete confirm modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer le document" size="sm">
        <p className="text-sm text-slate-600 mb-5">
          Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible et le document sera désindexé.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Annuler</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger">
            {deleting ? <Spinner size="sm" className="text-white" /> : 'Supprimer'}
          </button>
        </div>
      </Modal>
    </div>
  );
}