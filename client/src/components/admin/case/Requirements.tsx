import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, CheckCheck, ClipboardList, Plus, Trash2, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseDetail, CaseDocument, Requirement } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '../ConfirmDialog';
import { L10nInput, emptyL10n, fillFromAz } from '../L10nInput';
import { Modal } from '../Modal';
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, STAGE_LABEL, toastError } from '../labels';
import { Panel, Switch } from '../ui';
import { DocIcon, DocLinks, DocMeta, isAccepted, stageRequirements, uploadCaseDocument, useCaseRefresh } from './shared';

type Stage = 'INITIAL' | 'EMBASSY';

const reqState = (r: Requirement) => {
  if (isAccepted(r)) return { label: 'Qəbul edilib', tone: 'bg-emerald-100 text-emerald-800' };
  if (r.documents.some((d) => d.status === 'PENDING')) return { label: 'Yoxlanılmalıdır', tone: 'bg-amber-100 text-amber-800' };
  if (r.documents.length > 0) return { label: 'Rədd edilib', tone: 'bg-red-100 text-red-700' };
  return { label: 'Yüklənməyib', tone: 'bg-slate-100 text-slate-600' };
};

// ─── Document row with review controls ─────────────────────────────────

const DocRow = ({ c, doc }: { c: CaseDetail; doc: CaseDocument }) => {
  const refresh = useCaseRefresh(c.id);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'ACCEPTED' | 'REJECTED' | null>(null);

  const review = async (status: 'ACCEPTED' | 'REJECTED') => {
    setBusy(status);
    try {
      await api.post(`/admin/cases/${c.id}/documents/${doc.id}/review`, { status, note: status === 'REJECTED' ? note.trim() : undefined });
      await refresh();
      toast.success(status === 'ACCEPTED' ? 'Sənəd qəbul edildi.' : 'Sənəd rədd edildi, müştəriyə bildiriş göndərildi.');
      setRejecting(false);
      setNote('');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
          <DocIcon mime={doc.mimeType} className="size-4 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink" title={doc.originalName}>
              {doc.originalName}
            </p>
            <DocMeta doc={doc} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={clsx('badge whitespace-nowrap', DOC_STATUS_TONE[doc.status])}>{DOC_STATUS_LABEL[doc.status]}</span>
        <DocLinks doc={doc} />
        <div className="flex gap-1.5">
          {doc.status !== 'ACCEPTED' && (
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-emerald-800 lg:min-h-8 transition hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => review('ACCEPTED')}
              disabled={!!busy}
            >
              {busy === 'ACCEPTED' ? <Spinner className="size-3" /> : <Check className="size-3" />} Qəbul et
            </button>
          )}
          {doc.status !== 'REJECTED' && (
            <button
              type="button"
              aria-expanded={rejecting}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-red-700 lg:min-h-8 transition hover:bg-red-100 disabled:opacity-50"
              onClick={() => setRejecting((v) => !v)}
              disabled={!!busy}
            >
              <X className="size-3" /> Rədd et
            </button>
          )}
        </div>
        </div>
      </div>
      {doc.status === 'REJECTED' && doc.reviewNote && (
        <p className="border-t border-line bg-red-50/50 px-3 py-1.5 text-xs text-red-800">
          <span className="font-semibold">Rədd səbəbi:</span> {doc.reviewNote}
        </p>
      )}
      <AnimatePresence initial={false}>
        {rejecting && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form
              className="space-y-2 border-t border-line bg-red-50/40 px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) void review('REJECTED');
              }}
            >
              <label htmlFor={`rej-${doc.id}`} className="label text-red-800">
                Rədd səbəbi (müştəriyə göstəriləcək)
              </label>
              <textarea
                id={`rej-${doc.id}`}
                className="input"
                rows={2}
                value={note}
                autoFocus
                onChange={(e) => setNote(e.target.value)}
                placeholder="Məs.: Şəkil bulanıqdır, yenidən skan edin."
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-danger btn-sm" disabled={!note.trim() || !!busy}>
                  {busy === 'REJECTED' && <Spinner className="size-3" />} Rədd et
                </button>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setRejecting(false)}>
                  Bağla
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
      toast.success('Fayl müştəri adından yükləndi və qəbul edildi.');
    } catch (err) {
      toastError(err, 'Fayl yüklənmədi.');
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
      toast.success('Tələb silindi.');
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
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy-900">
            {r.title.az}
            {r.required ? (
              <span className="badge bg-navy-900/90 text-[10px] whitespace-nowrap text-white">Mütləq</span>
            ) : (
              <span className="badge bg-slate-100 text-[10px] whitespace-nowrap text-slate-600">İstəyə bağlı</span>
            )}
            <span className={clsx('badge text-[10px] whitespace-nowrap', state.tone)}>{state.label}</span>
          </p>
          {r.description?.az && <p className="mt-0.5 text-xs text-muted">{r.description.az}</p>}
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <span className="mr-1 flex items-center gap-2 text-[11px] text-muted">
            Mütləq
            <Switch checked={r.required} onChange={toggleRequired} disabled={toggling} label="Mütləq sənəd" />
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
            className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-white hover:text-brand-700 lg:size-8"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Müştəri adından yüklə (avtomatik qəbul edilir)"
            aria-label="Müştəri adından yüklə"
          >
            {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted transition hover:bg-white hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 lg:size-8"
            onClick={() => setConfirmDelete(true)}
            disabled={r.documents.length > 0}
            title={r.documents.length > 0 ? 'Sənədi olan tələbi silmək olmaz' : 'Tələbi sil'}
            aria-label="Tələbi sil"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {r.documents.length > 0 && (
        <ul className="mt-3 space-y-2">
          {r.documents.map((d) => (
            <DocRow key={d.id} c={c} doc={d} />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        title="Tələb silinsin?"
        message={`“${r.title.az}” tələbi müştərinin siyahısından silinəcək.`}
        confirmLabel="Sil"
      />
    </motion.li>
  );
};

// ─── Add requirement ────────────────────────────────────────────────────

const AddRequirementModal = ({ c, stage, open, onClose }: { c: CaseDetail; stage: Stage; open: boolean; onClose: () => void }) => {
  const refresh = useCaseRefresh(c.id);
  const [title, setTitle] = useState(emptyL10n);
  const [description, setDescription] = useState(emptyL10n);
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.az.trim()) return;
    setBusy(true);
    try {
      const hasDesc = description.az.trim() || description.de.trim() || description.en.trim() || description.ru.trim();
      await api.post(`/admin/cases/${c.id}/requirements`, {
        stage,
        title: fillFromAz(title),
        description: hasDesc ? fillFromAz(description) : undefined,
        required,
      });
      await refresh();
      toast.success('Yeni sənəd tələbi əlavə edildi.');
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
      title={`Sənəd tələbi əlavə et — ${STAGE_LABEL[stage]}`}
      description="Boş buraxılan dillər üçün Azərbaycan mətni istifadə olunacaq. Müştəri tələbi öz dilində görəcək."
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            İmtina et
          </button>
          <button type="submit" form="add-req-form" className="btn-primary btn-sm" disabled={!title.az.trim() || busy}>
            {busy && <Spinner className="size-3.5" />} Əlavə et
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
        <L10nInput label="Başlıq" value={title} onChange={setTitle} required />
        <L10nInput label="Təsvir (istəyə bağlı)" value={description} onChange={setDescription} multiline rows={2} />
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3.5 py-3 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
          Mütləq sənəddir (növbəti mərhələyə keçmək üçün qəbul edilməlidir)
        </label>
      </form>
    </Modal>
  );
};

// ─── Section ────────────────────────────────────────────────────────────

export const RequirementsSection = ({ c, stage }: { c: CaseDetail; stage: Stage }) => {
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
      toastError(first.status === 'rejected' ? first.reason : null, `${failed.length} sənəd qəbul edilmədi.`);
    } else {
      toast.success(`${pending.length} sənəd qəbul edildi.`);
    }
  };

  return (
    <Panel
      title={
        <>
          {STAGE_LABEL[stage]}
          {required.length > 0 && (
            <span
              className={clsx(
                'badge ml-1 tabular-nums',
                acceptedRequired === required.length ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
              )}
              title="Qəbul edilmiş mütləq sənədlər"
            >
              {acceptedRequired}/{required.length}
            </span>
          )}
        </>
      }
      icon={ClipboardList}
      actions={
        <>
          {pending.length > 0 && (
            <button type="button" className="btn-white btn-sm border border-emerald-200 text-emerald-800" onClick={() => setBulkOpen(true)}>
              <CheckCheck className="size-3.5" /> Hamısını qəbul et ({pending.length})
            </button>
          )}
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Tələb əlavə et
          </button>
        </>
      }
    >
      {reqs.length === 0 ? (
        <p className="text-sm text-muted">
          {stage === 'EMBASSY'
            ? 'Səfirlik mərhələsi üçün tələblər müqavilə təsdiqləndikdə avtomatik yaradılır. İstəsəniz, indi əlavə edə bilərsiniz.'
            : 'Bu mərhələ üçün sənəd tələbi yoxdur.'}
        </p>
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
        title="Bütün gözləyən sənədlər qəbul edilsin?"
        message={`${STAGE_LABEL[stage]} bölməsində ${pending.length} yoxlanılmamış sənəd qəbul ediləcək. Hər biri üçün müştəriyə bildiriş göndəriləcək.`}
        confirmLabel="Hamısını qəbul et"
      />
    </Panel>
  );
};
