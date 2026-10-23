import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Archive,
  Award,
  BookOpen,
  Car,
  Download,
  ExternalLink,
  FileBadge,
  FileText,
  Heart,
  IdCard,
  Languages,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Baby,
  Briefcase,
  GraduationCap,
  BookUser,
} from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageLoader } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { VAULT_KINDS, VAULT_QUERY, isImageMime, vaultFileUrl, type VaultDoc, type VaultKind } from '@/components/vault/api';
import { ExpiryBadge } from '@/components/vault/ExpiryBadge';
import { DocCheckBadge } from '@/components/vault/DocCheckBadge';
import { UseInCaseDialog, VaultEditDialog, VaultUploadDialog } from '@/components/vault/VaultDialogs';
import { VaultModal } from '@/components/vault/VaultModal';
import { useVaultError } from '@/components/vault/useVaultError';

const KIND_ICON: Record<VaultKind, typeof FileText> = {
  PASSPORT: BookUser,
  ID_CARD: IdCard,
  PHOTO: User,
  DIPLOMA: GraduationCap,
  TRANSCRIPT: BookOpen,
  CERTIFICATE: Award,
  EMPLOYMENT_REF: Briefcase,
  LANGUAGE_CERT: Languages,
  DRIVING_LICENCE: Car,
  BIRTH_CERT: Baby,
  MARRIAGE_CERT: Heart,
  POLICE_CLEARANCE: ShieldCheck,
  CV: FileBadge,
  OTHER: FileText,
};

const DocCard = ({
  doc,
  onPreview,
  onEdit,
  onDelete,
  onUse,
}: {
  doc: VaultDoc;
  onPreview: (d: VaultDoc) => void;
  onEdit: (d: VaultDoc) => void;
  onDelete: (d: VaultDoc) => void;
  onUse: (d: VaultDoc) => void;
}) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const Icon = KIND_ICON[doc.kind];
  const image = isImageMime(doc.mimeType);
  return (
    <li className="card flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => onPreview(doc)}
        className="group relative grid h-32 place-items-center overflow-hidden border-b border-line bg-surface"
        aria-label={`${t('vault.actions.preview')}: ${doc.title}`}
      >
        {image ? (
          <img src={vaultFileUrl(doc.id)} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <Icon className="size-10 text-brand-600/70" aria-hidden />
        )}
      </button>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate font-semibold text-ink" title={doc.title}>
          {doc.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted" title={doc.filename}>
          {doc.ownerName ? `${doc.ownerName} · ` : ''}
          {formatBytes(doc.size)} · {date(doc.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ExpiryBadge doc={doc} />
          <DocCheckBadge checks={doc.checks} showOk={false} />
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
          <button type="button" className="btn-primary btn-sm mr-auto" onClick={() => onUse(doc)}>
            <Send className="size-3.5" aria-hidden />
            {t('vault.actions.use')}
          </button>
          <a
            href={vaultFileUrl(doc.id, true)}
            className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
            title={t('vault.actions.download')}
            aria-label={`${t('vault.actions.download')}: ${doc.title}`}
          >
            <Download className="size-4" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => onEdit(doc)}
            className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
            title={t('vault.actions.edit')}
            aria-label={`${t('vault.actions.edit')}: ${doc.title}`}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(doc)}
            className="grid size-9 place-items-center rounded-lg text-danger transition hover:bg-red-50 dark:hover:bg-red-950/30"
            title={t('vault.actions.delete')}
            aria-label={`${t('vault.actions.delete')}: ${doc.title}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
};

/** /account/vault — the client's personal document vault. */
export default function AccountVault() {
  const { t } = useTranslation();
  usePageTitle(t('vault.title'));
  const qc = useQueryClient();
  const onError = useVaultError();
  const [uploadKind, setUploadKind] = useState<VaultKind | null>(null);
  const [editing, setEditing] = useState<VaultDoc | null>(null);
  const [using, setUsing] = useState<VaultDoc | null>(null);
  const [preview, setPreview] = useState<VaultDoc | null>(null);
  const [toDelete, setToDelete] = useState<VaultDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: VAULT_QUERY,
    queryFn: async () => (await api.get<{ documents: VaultDoc[]; groups: Partial<Record<VaultKind, VaultDoc[]>> }>('/vault')).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['vault'] });

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/vault/${toDelete.id}`);
      toast.success(t('vault.deleted'));
      setToDelete(null);
      await refresh();
    } catch (err) {
      onError(err);
    } finally {
      setDeleting(false);
    }
  };

  const openPreview = (d: VaultDoc) => {
    if (isImageMime(d.mimeType)) setPreview(d);
    else window.open(vaultFileUrl(d.id), '_blank', 'noopener');
  };

  if (isLoading) return <PageLoader />;
  const documents = data?.documents ?? [];
  const groups = data?.groups ?? {};
  const kinds = VAULT_KINDS.filter((k) => groups[k]?.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{t('vault.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('vault.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => setUploadKind('PASSPORT')}>
          <Plus className="size-4" aria-hidden /> {t('vault.upload')}
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600">
            <Archive className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{t('vault.empty')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t('vault.emptyHint')}</p>
          <button type="button" className="btn-primary mt-5" onClick={() => setUploadKind('PASSPORT')}>
            <Plus className="size-4" aria-hidden /> {t('vault.upload')}
          </button>
        </div>
      ) : (
        kinds.map((k) => {
          const Icon = KIND_ICON[k];
          const list = groups[k] ?? [];
          return (
            <section key={k} aria-labelledby={`vault-${k}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id={`vault-${k}`} className="flex items-center gap-2 text-base font-bold text-ink">
                  <span className="grid size-8 place-items-center rounded-lg bg-brand-100 text-brand-600">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {t(`vault.kinds.${k}`)}
                  <span className="text-xs font-medium text-muted">· {t('vault.count', { count: list.length })}</span>
                </h3>
                <button type="button" className="btn btn-sm border border-line text-ink hover:bg-surface" onClick={() => setUploadKind(k)}>
                  <Plus className="size-3.5" aria-hidden /> {t('vault.upload')}
                </button>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((d) => (
                  <DocCard key={d.id} doc={d} onPreview={openPreview} onEdit={setEditing} onDelete={setToDelete} onUse={setUsing} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <VaultUploadDialog open={!!uploadKind} initialKind={uploadKind ?? undefined} onClose={() => setUploadKind(null)} onUploaded={refresh} />
      <VaultEditDialog doc={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <UseInCaseDialog doc={using} onClose={() => setUsing(null)} />
      <VaultModal open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ''} wide>
        {preview && (
          <div className="space-y-3">
            <img src={vaultFileUrl(preview.id)} alt={preview.title} className="mx-auto max-h-[65vh] w-auto rounded-lg border border-line object-contain" />
            <a href={vaultFileUrl(preview.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              <ExternalLink className="size-4" aria-hidden />
              {t('vault.actions.preview')}
            </a>
          </div>
        )}
      </VaultModal>
      <ConfirmDialog open={!!toDelete} title={t('vault.deleteTitle')} confirmLabel={t('vault.actions.delete')} danger busy={deleting} onConfirm={remove} onClose={() => setToDelete(null)}>
        <span className="font-semibold text-ink">{toDelete?.title}</span>
        <br />
        {t('vault.deleteMsg')}
      </ConfirmDialog>
    </div>
  );
}
