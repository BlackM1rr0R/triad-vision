import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, CheckCheck, ClipboardList, Plus, Trash2, Upload, X } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, CaseDocument, Requirement } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '../ConfirmDialog';
import { L10nInput, emptyL10n } from '../L10nInput';
import { Modal } from '../Modal';
import { DOC_STATUS_TONE, docStatusLabel, stageLabel, toastError } from '../labels';
import { Panel, Switch } from '../ui';
import { DocIcon, DocLinks, DocMeta, isAccepted, stageRequirements, uploadCaseDocument, useCaseRefresh } from './shared';
import { OcrBadge } from '@/components/docsIntel/OcrBadge';
import type { DocWithOcr } from '@/components/docsIntel/api';
import { DocCheckBadge } from '@/components/vault/DocCheckBadge';
import { ExpiryEditor } from '@/components/expiry/Expiry';
// AI verdict chip (issues + fields), "Yenidən yoxla" and "AI layihə tərcüməsi".
import { AiDocActions } from '@/components/aiDocs/AiDocActions';
// Smart uploads: "AI · type" chip with the suggestion card, "Low quality", and "Accept all suggestions (N)".
import { CaseAcceptAllBar, CaseDocAiChip, CaseDocNameWarning } from '@/components/uploadAi/StaffChips';
import { PHOTO_KEYS, PhotoCheckBadge, photoCheckOf } from '@/components/uploadAi/PhotoCheckNotice'; // biometric photo rules badge
// Marks on a rejected scan: red boxes + notes drawn while rejecting (sent as reviewMarks), read-only view afterwards.
import { MarkEditor } from '@/components/review/MarkEditor';
import { MarkedScan } from '@/components/review/MarkedScan';
import { cleanMarks, marksOf, type ReviewMark } from '@/components/review/marks';
import { scanKind } from '@/components/review/ScanPage';

type Stage = 'INITIAL' | 'EMBASSY';

const reqState = (r: Requirement): { key: 'accepted' | 'review' | 'rejected' | 'missing'; tone: string } => {
  if (isAccepted(r)) return { key: 'accepted', tone: 'bg-success-bg text-success-fg' };
  if (r.documents.some((d) => d.status === 'PENDING')) return { key: 'review', tone: 'bg-warning-bg text-warning-fg' };
  if (r.documents.length > 0) return { key: 'rejected', tone: 'bg-danger-bg text-danger-fg' };
  return { key: 'missing', tone: 'bg-sunken text-muted' };
};

// ─── Document row with review controls ─────────────────────────────────

const DocRow = ({ c, doc, requirementKey }: { c: CaseDetail; doc: CaseDocument; requirementKey?: string | null }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(c.id);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [marks, setMarks] = useState<ReviewMark[]>([]);
  const [marking, setMarking] = useState(false);
  const [busy, setBusy] = useState<'ACCEPTED' | 'REJECTED' | null>(null);
  // Permanent removal of a case document is reserved for super admins.
  const isSuper = useAuth().user?.role === 'SUPER_ADMIN';
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/cases/${c.id}/documents/${doc.id}`);
      await refresh();
      toast.success(t('admin.case.req.docDeleted'));
      setAskDelete(false);
    } catch (err) {
      toastError(err);
    } finally {
      setDeleting(false);
    }
  };

  const review = async (status: 'ACCEPTED' | 'REJECTED') => {
    setBusy(status);
    try {
      await api.post(`/admin/cases/${c.id}/documents/${doc.id}/review`, {
        status,
        note: status === 'REJECTED' ? note.trim() : undefined,
        reviewMarks: status === 'REJECTED' && marks.length ? cleanMarks(marks) : undefined,
      });
      await refresh();
      toast.success(status === 'ACCEPTED' ? t('admin.case.req.docAccepted') : t('admin.case.req.docRejected'));
      setRejecting(false);
      setNote('');
      setMarks([]);
      setMarking(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="rounded-lg border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
          <DocIcon mime={doc.mimeType} className="size-4 shrink-0 text-link" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink" title={doc.originalName}>
              {doc.originalName}
            </p>
            <DocMeta doc={doc} />
            {/* name on the document ≠ client (or family member): same check as client uploads, a warning only */}
            <CaseDocNameWarning caseId={c.id} docId={doc.id} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className={clsx('badge whitespace-nowrap', DOC_STATUS_TONE[doc.status])}>{docStatusLabel(doc.status)}</span>
          <DocCheckBadge checks={(doc as CaseDocument & { checks?: unknown }).checks} />
          {requirementKey && PHOTO_KEYS.includes(requirementKey) && <PhotoCheckBadge check={photoCheckOf((doc as CaseDocument & { photoCheck?: unknown }).photoCheck)} caseId={c.id} docId={doc.id} />}
          <AiDocActions docId={doc.id} checks={(doc as CaseDocument & { checks?: unknown }).checks} name={doc.originalName} mimeType={doc.mimeType} onChanged={refresh} />
          <CaseDocAiChip caseId={c.id} docId={doc.id} onChanged={refresh} />
          {/* validity date: chip (green/amber/red) + date picker to set or clear it */}
          <ExpiryEditor caseId={c.id} docId={doc.id} expiresAt={(doc as CaseDocument & { expiresAt?: string | null }).expiresAt} requirementKey={requirementKey} onSaved={refresh} />
          <DocLinks doc={doc} />
          {isSuper && (
            <button
              type="button"
              onClick={() => setAskDelete(true)}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg"
              aria-label={`${t('admin.case.req.deleteDoc')}: ${doc.originalName}`}
              title={t('admin.case.req.deleteDoc')}
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <ConfirmDialog
            open={askDelete}
            onClose={() => setAskDelete(false)}
            onConfirm={() => void remove()}
            loading={deleting}
            tone="danger"
            title={t('admin.case.req.deleteDocTitle')}
            message={t('admin.case.req.deleteDocBody', { name: doc.originalName })}
            confirmLabel={t('admin.case.req.deleteDoc')}
          />
          <div className="flex gap-1.5">
            {doc.status !== 'ACCEPTED' && (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-success-border bg-success-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-success-fg lg:min-h-8 transition hover:bg-success-bg disabled:opacity-50"
                onClick={() => review('ACCEPTED')}
                disabled={!!busy}
              >
                {busy === 'ACCEPTED' ? <Spinner className="size-3" /> : <Check className="size-3" />} {t('admin.case.req.accept')}
              </button>
            )}
            {doc.status !== 'REJECTED' && (
              <button
                type="button"
                aria-expanded={rejecting}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-danger-border bg-danger-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-danger-fg lg:min-h-8 transition hover:bg-danger-bg disabled:opacity-50"
                onClick={() => setRejecting((v) => !v)}
                disabled={!!busy}
              >
                <X className="size-3" /> {t('admin.case.req.reject')}
              </button>
            )}
          </div>
        </div>
      </div>
      {doc.status === 'REJECTED' && doc.reviewNote && (
        <p className="border-t border-line bg-danger-bg/50 px-3 py-1.5 text-xs text-danger-fg">
          <span className="font-semibold">{t('admin.case.req.rejectReason')}</span> {doc.reviewNote}
        </p>
      )}
      {doc.status === 'REJECTED' && marksOf(doc).length > 0 && (
        <details className="border-t border-line px-3 py-1.5 text-xs">
          <summary className="cursor-pointer font-semibold text-danger-fg">{t('cplus.editor.count', { count: marksOf(doc).length })}</summary>
          <MarkedScan className="mt-2" src={fileUrl(doc.id)} mimeType={doc.mimeType} marks={marksOf(doc)} />
        </details>
      )}
      <OcrBadge caseId={c.id} doc={doc as DocWithOcr} requirementKey={requirementKey} />
      <AnimatePresence initial={false}>
        {rejecting && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form
              className="space-y-2 border-t border-line bg-danger-bg/40 px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) void review('REJECTED');
              }}
            >
              <label htmlFor={`rej-${doc.id}`} className="label text-danger-fg">
                {t('admin.case.req.rejectReasonLabel')}
              </label>
              <textarea
                id={`rej-${doc.id}`}
                className="input"
                rows={2}
                value={note}
                autoFocus
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('admin.case.req.rejectPlaceholder')}
              />
              {scanKind(doc.mimeType) !== 'unsupported' && (
                <div>
                  <button type="button" className="text-xs font-semibold text-danger-fg hover:underline" aria-expanded={marking} onClick={() => setMarking((v) => !v)}>
                    {t('cplus.editor.open')}
                    {marks.length > 0 && ` (${marks.length})`}
                  </button>
                  {marking && <MarkEditor className="mt-2 rounded-lg border border-line bg-card p-2" src={fileUrl(doc.id)} mimeType={doc.mimeType} value={marks} onChange={setMarks} />}
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="btn-danger btn-sm" disabled={!note.trim() || !!busy}>
                  {busy === 'REJECTED' && <Spinner className="size-3" />} {t('admin.case.req.reject')}
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setRejecting(false)}>
                  {t('admin.common.close')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
};

// ─── Requirement card ───────────────────────────────────────────────────

const RequirementCard = ({ c, r }: { c: CaseDetail; r: Requirement }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const refresh = useCaseRefresh(c.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const state = reqState(r);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await uploadCaseDocument(c.id, file, r.stage === 'EMBASSY' ? 'EMBASSY' : 'INITIAL', r.id);
      await refresh();
      toast.success(t('admin.case.req.uploadedForClient'));
    } catch (err) {
      toastError(err, t('admin.case.req.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleRequired = async (required: boolean) => {
    setToggling(true);
    try {
      await api.patch(`/admin/cases/${c.id}/requirements/${r.id}`, { required });
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setToggling(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/cases/${c.id}/requirements/${r.id}`);
      await refresh();
      toast.success(t('admin.case.req.reqDeleted'));
      setConfirmDelete(false);
    } catch (err) {
      toastError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.li layout="position" className="rounded-xl border border-line bg-surface/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-[1_1_14rem] pt-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
            {tr(r.title)}
            {r.required ? (
              <span className="badge bg-primary text-[10px] whitespace-nowrap text-primary-contrast">{t('admin.case.req.required')}</span>
            ) : (
              <span className="badge bg-sunken text-[10px] whitespace-nowrap text-muted">{t('admin.case.req.optional')}</span>
            )}
            <span className={clsx('badge text-[10px] whitespace-nowrap', state.tone)}>{t(`admin.case.req.state.${state.key}`)}</span>
          </p>
          {r.description && tr(r.description) && <p className="mt-0.5 text-xs text-muted">{tr(r.description)}</p>}
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <span className="mr-1 flex items-center gap-2 text-[11px] text-muted">
            {t('admin.case.req.required')}
            <Switch checked={r.required} onChange={toggleRequired} disabled={toggling} label={t('admin.case.req.requiredDoc')} />
          </span>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-card hover:text-link lg:size-8"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={t('admin.case.req.uploadForClientTitle')}
            aria-label={t('admin.case.req.uploadForClient')}
          >
            {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-card hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-40 lg:size-8"
            onClick={() => setConfirmDelete(true)}
            disabled={r.documents.length > 0}
            title={r.documents.length > 0 ? t('admin.case.req.cantDeleteWithDocs') : t('admin.case.req.deleteReq')}
            aria-label={t('admin.case.req.deleteReq')}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {r.documents.length > 0 && (
        <ul className="mt-3 space-y-2">
          {r.documents.map((d) => (
            <DocRow key={d.id} c={c} doc={d} requirementKey={(r as Requirement & { key?: string | null }).key ?? null} />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        title={t('admin.case.req.deleteReqTitle')}
        message={t('admin.case.req.deleteReqMsg', { title: tr(r.title) })}
        confirmLabel={t('admin.common.delete')}
      />
    </motion.li>
  );
};

// ─── Add requirement ────────────────────────────────────────────────────

const AddRequirementModal = ({ c, stage, open, onClose }: { c: CaseDetail; stage: Stage; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(c.id);
  const [title, setTitle] = useState(emptyL10n);
  const [description, setDescription] = useState(emptyL10n);
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasTitle = !!(title.az.trim() || title.de.trim() || title.en.trim() || title.ru.trim());

  const submit = async () => {
    if (!hasTitle) return;
    setBusy(true);
    try {
      const hasDesc = description.az.trim() || description.de.trim() || description.en.trim() || description.ru.trim();
      // Empty languages are translated by the server (AI); without the AI it copies the text that was written.
      const res = await api.post<{ translation: { autoTranslated: boolean; reason: string | null } | null }>(`/admin/cases/${c.id}/requirements`, {
        stage,
        title,
        description: hasDesc ? description : undefined,
        required,
      });
      await refresh();
      const tx = res.data.translation;
      if (tx && !tx.autoTranslated && tx.reason && tx.reason !== 'NOTHING_TO_TRANSLATE') toast.warning(t('admin.l10n.savedCopied', { reason: tx.reason }));
      else toast.success(t('admin.case.req.reqAdded'));
      setTitle(emptyL10n());
      setDescription(emptyL10n());
      setRequired(true);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.case.req.addReqTitle', { stage: stageLabel(stage) })}
      description={t('admin.case.req.addReqDesc')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="add-req-form" className="btn-primary btn-sm" disabled={!hasTitle || busy}>
            {busy && <Spinner className="size-3.5" />} {t('admin.common.add')}
          </button>
        </>
      }
    >
      <form
        id="add-req-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <L10nInput label={t('admin.case.req.titleLabel')} value={title} onChange={setTitle} required anyLang hint={t('admin.l10n.anyLangHint')} />
        <L10nInput label={t('admin.case.req.descOptional')} value={description} onChange={setDescription} multiline rows={2} anyLang />
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3.5 py-3 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />
          {t('admin.case.req.requiredCheckbox')}
        </label>
      </form>
    </Modal>
  );
};

// ─── Section ────────────────────────────────────────────────────────────

export const RequirementsSection = ({ c, stage }: { c: CaseDetail; stage: Stage }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(c.id);
  const reqs = stageRequirements(c, stage);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const pending = reqs.flatMap((r) => r.documents.filter((d) => d.status === 'PENDING'));
  const required = reqs.filter((r) => r.required);
  const acceptedRequired = required.filter(isAccepted).length;

  const acceptAll = async () => {
    setBulkBusy(true);
    const results = await Promise.allSettled(
      pending.map((d) => api.post(`/admin/cases/${c.id}/documents/${d.id}/review`, { status: 'ACCEPTED' })),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    await refresh();
    setBulkBusy(false);
    setBulkOpen(false);
    if (failed.length) {
      const first = failed[0];
      toastError(first.status === 'rejected' ? first.reason : null, t('admin.case.req.bulkFailed', { count: failed.length }));
    } else {
      toast.success(t('admin.case.req.bulkDone', { count: pending.length }));
    }
  };

  return (
    <Panel
      title={
        <>
          {stageLabel(stage)}
          {required.length > 0 && (
            <span
              className={clsx(
                'badge ml-1 tabular-nums',
                acceptedRequired === required.length ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted',
              )}
              title={t('admin.case.req.acceptedRequiredTitle')}
            >
              {acceptedRequired}/{required.length}
            </span>
          )}
        </>
      }
      icon={ClipboardList}
      actions={
        <>
          {stage === 'INITIAL' && <CaseAcceptAllBar caseId={c.id} onChanged={refresh} />}
          {pending.length > 0 && (
            <button type="button" className="btn-secondary btn-sm border border-success-border text-success-fg" onClick={() => setBulkOpen(true)}>
              <CheckCheck className="size-3.5" /> {t('admin.case.req.acceptAll', { count: pending.length })}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> {t('admin.case.req.addReq')}
          </button>
        </>
      }
    >
      {reqs.length === 0 ? (
        <p className="text-sm text-muted">{stage === 'EMBASSY' ? t('admin.case.req.embassyEmpty') : t('admin.case.req.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {reqs.map((r) => (
            <RequirementCard key={r.id} c={c} r={r} />
          ))}
        </ul>
      )}
      <AddRequirementModal c={c} stage={stage} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={acceptAll}
        loading={bulkBusy}
        tone="primary"
        title={t('admin.case.req.acceptAllTitle')}
        message={t('admin.case.req.acceptAllMsg', { stage: stageLabel(stage), count: pending.length })}
        confirmLabel={t('admin.case.req.acceptAllBtn')}
      />
    </Panel>
  );
};
