import { useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Circle, Clock, ExternalLink, FileStack, FileText, Lock, Send, Trash2, XCircle } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail, CaseDocument, CaseStatus, Requirement } from '@/lib/types';
import { DocStatusBadge } from './StatusBadge';
import { FileDrop } from './FileDrop';
import { ConfirmDialog } from './ConfirmDialog';
import { useApiError } from './useApiError';
// Document vault + automatic checks: client-side check before upload, "choose from my vault", server check result.
import { useDocCheckGate } from '@/components/vault/DocCheckDialog';
import { VaultPicker } from '@/components/vault/VaultPicker';
import { CheckResultNotice } from '@/components/vault/CheckResultNotice';
import { DocCheckBadge } from '@/components/vault/DocCheckBadge';
// Validity chip + hint, and several images → one PDF (same endpoint as the phone scanner).
import { ExpiryChip, ExpiryHint } from '@/components/expiry/Expiry';

type UploadStage = 'INITIAL' | 'EMBASSY';

/** Which stage the client may currently upload to. */
export const UPLOAD_STAGE: Partial<Record<CaseStatus, UploadStage>> = {
  DOCUMENTS_PENDING: 'INITIAL',
  EMBASSY_DOCUMENTS: 'EMBASSY',
};

const isSatisfied = (r: Requirement) => r.documents.some((d) => d.status !== 'REJECTED');

const RequirementIcon = ({ req }: { req: Requirement }) => {
  const docs = req.documents;
  if (docs.some((d) => d.status === 'ACCEPTED')) return <CheckCircle2 className="size-5 text-success" aria-hidden />;
  if (docs.some((d) => d.status === 'PENDING')) return <Clock className="size-5 text-brand-600" aria-hidden />;
  if (docs.length) return <XCircle className="size-5 text-danger" aria-hidden />;
  return <Circle className="size-5 text-line" aria-hidden />;
};

const DocRow = ({
  doc,
  canDelete,
  onDelete,
  requirementKey,
}: {
  doc: CaseDocument;
  canDelete: boolean;
  onDelete: (doc: CaseDocument) => void;
  requirementKey?: string | null;
}) => {
  const expiresAt = (doc as CaseDocument & { expiresAt?: string | null }).expiresAt;
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
      className={clsx(
        'rounded-lg border bg-white py-1.5 pr-1.5 pl-3',
        doc.status === 'REJECTED' ? 'border-red-200 bg-red-50/40' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-3">
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900" title={doc.originalName}>
              {doc.originalName}
            </p>
            <p className="truncate text-xs text-muted">
              {formatBytes(doc.size)} · {dateTime(doc.createdAt)}
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* automatic check findings (warnings / problems only) */}
        <DocCheckBadge checks={(doc as CaseDocument & { checks?: unknown }).checks} showOk={false} />
        {doc.status !== 'REJECTED' && <ExpiryChip expiresAt={expiresAt} requirementKey={requirementKey} />}
        <DocStatusBadge status={doc.status} className="mr-1" />
          <a
            href={fileUrl(doc.id)}
            target="_blank"
            rel="noreferrer"
            className="grid size-10 place-items-center rounded-lg text-brand-600 transition hover:bg-brand-50 lg:size-9"
            aria-label={`${t('common.open')}: ${doc.originalName}`}
            title={t('common.open')}
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(doc)}
              className="grid size-10 place-items-center rounded-lg text-danger transition hover:bg-red-50 lg:size-9"
              aria-label={`${t('common.delete')}: ${doc.originalName}`}
              title={t('common.delete')}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {doc.status !== 'REJECTED' && <ExpiryHint expiresAt={expiresAt} requirementKey={requirementKey} />}
      {doc.status === 'REJECTED' && doc.reviewNote && (
        <p className="mt-1.5 mb-1.5 mr-1.5 flex gap-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-line text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {doc.reviewNote}
        </p>
      )}
    </motion.li>
  );
};

const RequirementCard = ({
  req,
  caseId,
  open,
  onChanged,
  onDelete,
}: {
  req: Requirement;
  caseId: string;
  open: boolean;
  onChanged: () => Promise<unknown>;
  onDelete: (doc: CaseDocument) => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const onError = useApiError();
  const [progress, setProgress] = useState<number | null>(null);
  // Client-side quality check dialog and the server check result of the last upload.
  const { gate, dialog: checkDialog } = useDocCheckGate();
  const [lastChecks, setLastChecks] = useState<unknown>(null);
  const docs = [...req.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const description = tr(req.description);

  const upload = async (file: File) => {
    if (!(await gate(file))) return; // the client chose another file
    setLastChecks(null);
    const form = new FormData();
    form.append('requirementId', req.id);
    form.append('file', file);
    setProgress(0);
    try {
      const { data } = await api.post<{ checks?: unknown }>(`/cases/${caseId}/documents`, form, {
        onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
      });
      setLastChecks(data.checks ?? null);
      toast.success(t('portal.docs.uploaded'));
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setProgress(null);
    }
  };

  // Several page images → one PDF on the server (POST /cases/:id/documents/scan).
  const pagesRef = useRef<HTMLInputElement>(null);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const uploadAsPdf = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (pagesRef.current) pagesRef.current.value = '';
    if (!files.length) return;
    if (files.length > 20) return void toast.error(t('expiry.scan.tooMany'));
    if (files.some((f) => !['image/jpeg', 'image/png'].includes(f.type))) return void toast.error(t('expiry.scan.onlyImages'));
    const form = new FormData();
    form.append('requirementId', req.id);
    form.append('name', tr(req.title));
    for (const f of files) form.append('pages', f);
    setLastChecks(null);
    setPdfProgress(0);
    try {
      const { data } = await api.post<{ checks?: unknown; pages: number }>(`/cases/${caseId}/documents/scan`, form, {
        onUploadProgress: (e) => setPdfProgress(e.total ? e.loaded / e.total : 0),
        timeout: 180_000,
      });
      setLastChecks(data.checks ?? null);
      toast.success(t('expiry.scan.done', { count: data.pages }));
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setPdfProgress(null);
    }
  };

  const missing = req.required && !isSatisfied(req);

  return (
    <li className={clsx('rounded-xl border p-4 transition-colors sm:p-5', missing && open ? 'border-amber-200 bg-amber-50/30' : 'border-line bg-white')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          <RequirementIcon req={req} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 font-sans text-[0.95rem] font-semibold break-words text-navy-900">{tr(req.title)}</h4>
            <span className={clsx('badge whitespace-nowrap', req.required ? 'bg-navy-900/8 text-navy-900' : 'bg-surface text-muted')}>
              {req.required ? t('common.required') : t('common.optional')}
            </span>
          </div>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>

      <div className="mt-3 space-y-3 sm:pl-8">
        {docs.length > 0 ? (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {docs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  canDelete={open && d.uploadedById === user?.id && d.status !== 'ACCEPTED'}
                  onDelete={onDelete}
                  requirementKey={(req as Requirement & { key?: string | null }).key ?? null}
                />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          !open && <p className="text-xs text-muted italic">{t('portal.docs.notUploaded')}</p>
        )}
        {open && lastChecks != null && <CheckResultNotice checks={lastChecks} onDismiss={() => setLastChecks(null)} />}
        {open && (
          <FileDrop
            onFile={upload}
            progress={progress}
            compact={docs.length > 0}
            label={docs.length > 0 ? t('portal.docs.replace') : t('portal.docs.upload')}
          />
        )}
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={pagesRef}
              type="file"
              multiple
              accept="image/jpeg,image/png"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void uploadAsPdf(e.target.files)}
            />
            <button
              type="button"
              className="btn-white btn-sm border border-line"
              onClick={() => pagesRef.current?.click()}
              disabled={pdfProgress !== null || progress !== null}
              title={t('expiry.scan.hint')}
            >
              <FileStack className="size-4" aria-hidden />
              {t('expiry.scan.button')}
            </button>
            {pdfProgress !== null ? (
              <span className="text-xs text-muted" role="status">
                {t('expiry.scan.uploading', { percent: Math.round(pdfProgress * 100) })}
              </span>
            ) : (
              <span className="text-xs text-muted">{t('expiry.scan.title')}</span>
            )}
          </div>
        )}
        {open && (
          <VaultPicker
            caseId={caseId}
            requirementId={req.id}
            compact
            onAdded={async (checks) => {
              setLastChecks(checks);
              await onChanged();
            }}
          />
        )}
        {checkDialog}
      </div>
    </li>
  );
};

/** Requirement checklist of one stage (INITIAL or EMBASSY), with upload, delete and submit actions. */
export const CaseDocuments = ({
  data,
  stage,
  onChanged,
}: {
  data: CaseDetail;
  stage: UploadStage;
  onChanged: () => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const onError = useApiError();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toDelete, setToDelete] = useState<CaseDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reqs = data.requirements.filter((r) => r.stage === stage).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!reqs.length) return null;

  const open = UPLOAD_STAGE[data.status] === stage;
  const required = reqs.filter((r) => r.required);
  const missing = required.filter((r) => !isSatisfied(r));
  const doneCount = required.length - missing.length;
  const pct = required.length ? Math.round((doneCount / required.length) * 100) : 100;

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/cases/${data.id}/submit`);
      toast.success(t('portal.events.DOCUMENTS_SUBMITTED'));
      setConfirmSubmit(false);
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/cases/${data.id}/documents/${toDelete.id}`);
      setToDelete(null);
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section id={`docs-${stage.toLowerCase()}`} className="card scroll-mt-28 lg:scroll-mt-36 p-5 sm:p-6" aria-labelledby={`docs-title-${stage}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`docs-title-${stage}`} className="text-xl font-bold text-navy-900">
            {stage === 'INITIAL' ? t('portal.docs.initialTitle') : t('portal.docs.embassyTitle')}
          </h3>
          {open ? (
            <p className="mt-1 text-xs text-muted">{t('portal.docs.formats')}</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" aria-hidden />
              {t('portal.docs.locked')}
            </p>
          )}
        </div>
        {required.length > 0 && (
          <div className="w-full sm:w-48">
            <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
              <span>{t('common.required')}</span>
              <span className="text-navy-900">
                {doneCount}/{required.length}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <motion.div
                className={clsx('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-brand-600')}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {reqs.map((r) => (
          <RequirementCard key={r.id} req={r} caseId={data.id} open={open} onChanged={onChanged} onDelete={setToDelete} />
        ))}
      </ul>

      {open && (
        <div className="mt-6 flex flex-col gap-4 rounded-xl bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 text-sm">
            {missing.length > 0 ? (
              <>
                <p className="flex items-center gap-2 font-semibold text-warning">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  {t('portal.docs.missing')}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t('portal.docs.missingList')} {missing.map((r) => tr(r.title)).join(', ')}
                </p>
              </>
            ) : (
              <p className="flex items-start gap-2 font-medium text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t(`portal.statusHelp.${data.status}`)}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-primary w-full shrink-0 sm:w-auto"
            disabled={missing.length > 0 || submitting}
            onClick={() => setConfirmSubmit(true)}
          >
            <Send className="size-4" aria-hidden />
            {t('portal.docs.submit')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title={t('portal.docs.submit')}
        confirmLabel={t('portal.docs.submit')}
        busy={submitting}
        onConfirm={submit}
        onClose={() => setConfirmSubmit(false)}
      >
        {t('portal.docs.submitConfirm')}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!toDelete}
        title={t('portal.docs.deleteConfirm')}
        confirmLabel={t('common.delete')}
        danger
        busy={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      >
        <span className="break-all">{toDelete?.originalName}</span>
      </ConfirmDialog>
    </section>
  );
};

export default CaseDocuments;
