import { useState, type ReactNode } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckSquare, ClipboardPen, Download, ListChecks, MessageSquareText, UserCog, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { pagesCaseProcessing } from '@/i18n/pagesCaseProcessing';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fullName, inquiryStatusLabel, INQUIRY_STATUSES, statusLabel, toastError, type InquiryStatus } from '@/components/admin/labels';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { PROCESSING_STAGES, stageLabel, type ProcessingStage } from '@/components/caseProcessing/api';
import { delayedCommit, undoToast } from '@/lib/undo';
import { BULK_MAX, downloadCsv, type BulkResponse, type BulkSelection, type CaseBulkAction, type CaseResolve } from './api';
import type { RowSelection } from './selection';

registerCopy(pagesStaffPower);
registerCopy(pagesCaseProcessing);

/** Translated reason of a per-item failure (admin.errors.<CODE>, else sp.bulk.errors.<CODE>, else the code). */
const useErrorText = () => {
  const { t, i18n } = useTranslation();
  return (code?: string) => {
    if (!code) return t('admin.common.opFailed');
    if (i18n.exists(`sp.bulk.errors.${code}`)) return t(`sp.bulk.errors.${code}`);
    if (i18n.exists(`admin.errors.${code}`)) return t(`admin.errors.${code}`);
    return code;
  };
};

/** Result of a bulk request: success toast, and the per-item failures in a dialog. */
const useBulkReport = () => {
  const { t } = useTranslation();
  const [failures, setFailures] = useState<{ label: string; reason: string }[] | null>(null);
  const reason = useErrorText();
  const report = (res: BulkResponse, labelOf: (id: string) => string, okKey = 'sp.bulk.done') => {
    if (res.ok) toast.success(t(okKey, { count: res.ok }));
    const failed = res.results.filter((r) => !r.ok);
    if (failed.length) {
      toast.error(t('sp.bulk.partial', { count: failed.length }), {
        duration: 10_000,
        action: { label: t('sp.bulk.details'), onClick: () => setFailures(failed.map((f) => ({ label: labelOf(f.id), reason: reason(f.error) }))) },
      });
    }
  };
  const dialog = (
    <Modal open={!!failures} onClose={() => setFailures(null)} title={t('sp.bulk.failedTitle', { count: failures?.length ?? 0 })} size="md">
      <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
        {(failures ?? []).map((f, i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0 truncate font-medium text-ink">{f.label}</span>
            <span className="shrink-0 text-right text-xs text-danger-fg">{f.reason}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
  return { report, dialog };
};

/** Toolbar shown while rows are selected: count, "select all N matching", clear, then the page's actions. */
export const BulkBarShell = ({ sel, pageCount, total, canSelectAll = true, children }: { sel: RowSelection; pageCount: number; total: number; canSelectAll?: boolean; children: ReactNode }) => {
  const { t } = useTranslation();
  if (!sel.count && !sel.allMatching) return null;
  const n = sel.allMatching ? Math.min(total, BULK_MAX) : sel.count;
  return (
    <div className="sticky top-[60px] z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-sunken px-3 py-2 text-sm shadow-[var(--tv-shadow-card)]" role="region" aria-label={t('sp.bulk.region')} data-tour="sp-bulkbar">
      <span className="inline-flex items-center gap-1.5 font-semibold text-ink" aria-live="polite">
        <CheckSquare className="size-4 text-link" aria-hidden />
        {sel.allMatching ? t('sp.select.allMatching', { count: n }) : t('sp.select.selected', { count: n })}
      </span>
      {canSelectAll && sel.allOnPage && !sel.allMatching && total > pageCount && (
        <button type="button" className="text-xs font-semibold text-link hover:underline" onClick={() => sel.setAllMatching(true)}>
          {t('sp.select.selectAllMatching', { count: Math.min(total, BULK_MAX) })}
          {total > BULK_MAX && <span className="font-normal text-muted"> · {t('sp.select.capped', { max: BULK_MAX })}</span>}
        </button>
      )}
      <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-line/60 hover:text-ink" onClick={sel.clear}>
        <X className="size-3.5" aria-hidden /> {t('sp.select.clear')}
      </button>
      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
};

const BarButton = ({ icon: Icon, children, onClick, disabled }: { icon: typeof X; children: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold whitespace-nowrap text-ink/85 transition hover:border-line-strong disabled:opacity-50"
  >
    <Icon className="size-3.5" aria-hidden /> {children}
  </button>
);

/** Staff picker dialog shared by the "assign" actions. */
const AssignDialog = ({ open, onClose, onApply, busy, count }: { open: boolean; onClose: () => void; onApply: (staffId: string | null) => void; busy: boolean; count: number }) => {
  const { t } = useTranslation();
  const { data: staff } = useStaffOptions();
  const [target, setTarget] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={t('sp.bulk.assignTitle', { count })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
          <Button onClick={() => onApply(target || null)} loading={busy}>
            {t('sp.bulk.apply')}
          </Button>
        </>
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.staff')}</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} data-autofocus>
          <option value="">{t('sp.bulk.unassign')}</option>
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s)}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
};

/** Template field with {{variable}} chips (inserted at the cursor). */
const TemplateField = ({ value, onChange, vars, label, rows = 6 }: { value: string; onChange: (v: string) => void; vars: string[]; label: string; rows?: number }) => {
  const { t } = useTranslation();
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  const insert = (v: string) => {
    const token = `{{${v}}}`;
    if (!el) return onChange(value + token);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + token + value.slice(e));
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };
  return (
    <div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
        <textarea ref={setEl} className="input min-h-32" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={4000} />
      </label>
      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
        <span>{t('sp.bulk.variables')}</span>
        {vars.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink hover:bg-line">
            {`{{${v}}}`}
          </button>
        ))}
      </p>
    </div>
  );
};

const STATUS_NEEDS = { REQUEST_CHANGES: 'note', CANCEL: 'reason', REOPEN: 'to' } as const;

// ─── Cases ──────────────────────────────────────────────────────────────

export interface CasesBulkBarProps {
  sel: RowSelection;
  /** List filters (for "all matching"). */
  filters: Record<string, string | undefined>;
  total: number;
  pageCount: number;
  labelOf: (id: string) => string;
  /** Query keys refreshed after a change. */
  invalidate: QueryKey[];
}

export const CasesBulkBar = ({ sel, filters, total, pageCount, labelOf, invalidate }: CasesBulkBarProps) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { report, dialog } = useBulkReport();
  const [open, setOpen] = useState<null | 'assign' | 'status' | 'processing' | 'message'>(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<CaseResolve | null>(null);
  const [action, setAction] = useState<CaseBulkAction | ''>('');
  const [extra, setExtra] = useState('');
  const [reopenTo, setReopenTo] = useState<'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS'>('DOCUMENTS_PENDING');
  const [stage, setStage] = useState<ProcessingStage>('WRITTEN');
  const [stageAssignee, setStageAssignee] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const { data: staff } = useStaffOptions();

  const selection: BulkSelection = sel.allMatching ? { all: filters } : { ids: sel.picked };
  const n = sel.allMatching ? Math.min(total, BULK_MAX) : sel.count;
  const refresh = () => invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const assign = (staffId: string | null) =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/cases/assign', { selection, staffId })).data;
      setOpen(null);
      refresh();
      const failed = res.results.filter((r) => !r.ok);
      if (res.ok && res.previous?.length) {
        const prev = res.previous;
        undoToast({
          message: t('sp.bulk.assigned', { count: res.ok }),
          undo: async () => {
            await api.post('/admin/bulk/cases/restore-assign', { items: prev.map((p) => ({ id: p.id, staffId: p.staffId ?? null })) });
            refresh();
          },
        });
      }
      if (failed.length) report({ ...res, ok: 0 }, labelOf);
      sel.clear();
    });

  const openStatus = () =>
    run(async () => {
      const r = (await api.post<CaseResolve>('/admin/bulk/cases/resolve', selection)).data;
      setResolved(r);
      setAction(r.actions[0] ?? '');
      setExtra('');
      setOpen('status');
    });

  const applyStatus = () => {
    if (!action || !resolved) return;
    const need = STATUS_NEEDS[action as keyof typeof STATUS_NEEDS];
    if ((need === 'note' || need === 'reason') && extra.trim().length < 3) {
      toast.error(t('sp.bulk.noteRequired'));
      return;
    }
    const body = {
      selection: { ids: resolved.ids },
      action,
      ...(need === 'note' ? { note: extra.trim() } : {}),
      ...(need === 'reason' ? { reason: extra.trim() } : {}),
      ...(need === 'to' ? { to: reopenTo, ...(extra.trim() ? { note: extra.trim() } : {}) } : {}),
    };
    setOpen(null);
    sel.clear();
    // Workflow steps notify the client and mostly have no reverse: nothing is sent until the undo window ends.
    delayedCommit({
      message: t('sp.bulk.statusQueued', { count: resolved.ids.length, action: t(`sp.bulk.actions.${action}`) }),
      commit: async () => (await api.post<BulkResponse>('/admin/bulk/cases/status', body)).data,
      keepalive: { method: 'POST', url: '/admin/bulk/cases/status', body },
      onCommitted: (res) => {
        refresh();
        report(res as BulkResponse, labelOf, 'sp.bulk.statusDone');
      },
    });
  };

  const applyProcessing = () =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/cases/processing', { selection, stage, assigneeId: stageAssignee || null, note: note.trim() || null })).data;
      setOpen(null);
      refresh();
      report(res, labelOf);
      sel.clear();
    });

  const applyMessage = () =>
    run(async () => {
      if (!message.trim()) return;
      const res = (await api.post<BulkResponse>('/admin/bulk/cases/message', { selection, body: message })).data;
      setOpen(null);
      setMessage('');
      refresh();
      report(res, labelOf, 'sp.bulk.messaged');
      sel.clear();
    });

  const exportCsv = () => run(() => downloadCsv('/admin/bulk/cases/export', { selection }, 'cases.csv'));

  const needs = action ? STATUS_NEEDS[action as keyof typeof STATUS_NEEDS] : undefined;
  return (
    <>
      <BulkBarShell sel={sel} pageCount={pageCount} total={total}>
        <BarButton icon={UserCog} onClick={() => setOpen('assign')} disabled={busy}>
          {t('sp.bulk.assign')}
        </BarButton>
        <BarButton icon={ListChecks} onClick={openStatus} disabled={busy}>
          {t('sp.bulk.status')}
        </BarButton>
        <BarButton icon={ClipboardPen} onClick={() => setOpen('processing')} disabled={busy}>
          {t('sp.bulk.processing')}
        </BarButton>
        <BarButton icon={MessageSquareText} onClick={() => setOpen('message')} disabled={busy}>
          {t('sp.bulk.message')}
        </BarButton>
        <BarButton icon={Download} onClick={exportCsv} disabled={busy}>
          {t('sp.bulk.export')}
        </BarButton>
      </BulkBarShell>

      <AssignDialog open={open === 'assign'} onClose={() => setOpen(null)} onApply={assign} busy={busy} count={n} />

      <Modal
        open={open === 'status'}
        onClose={() => setOpen(null)}
        title={t('sp.bulk.statusTitle', { count: resolved?.ids.length ?? n })}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyStatus} disabled={!action}>
              {t('sp.bulk.apply')}
            </Button>
          </>
        }
      >
        {resolved && (
          <div className="space-y-3 text-sm">
            <p className="flex flex-wrap gap-1.5 text-xs text-muted">
              {Object.entries(resolved.statuses).map(([s, c]) => (
                <span key={s} className="rounded bg-sunken px-1.5 py-0.5">
                  {statusLabel(s as never)} · {c}
                </span>
              ))}
            </p>
            {resolved.actions.length === 0 ? (
              <p className="rounded-lg bg-warning-bg px-3 py-2 text-warning-fg">{t('sp.bulk.noCommonStatus')}</p>
            ) : (
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold text-muted">{t('sp.bulk.validForAll')}</legend>
                {resolved.actions.map((a) => (
                  <label key={a} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 hover:border-line-strong">
                    <input type="radio" name="bulk-action" className="mt-0.5 accent-primary" checked={action === a} onChange={() => setAction(a)} />
                    <span>
                      <span className="block font-semibold text-ink">{t(`sp.bulk.actions.${a}`)}</span>
                      <span className="block text-xs text-muted">{t(`sp.bulk.actionHints.${a}`)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {needs === 'to' && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.reopenTo')}</span>
                <select className="input" value={reopenTo} onChange={(e) => setReopenTo(e.target.value as typeof reopenTo)}>
                  <option value="DOCUMENTS_PENDING">{statusLabel('DOCUMENTS_PENDING')}</option>
                  <option value="EMBASSY_DOCUMENTS">{statusLabel('EMBASSY_DOCUMENTS')}</option>
                </select>
              </label>
            )}
            {needs && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{needs === 'reason' ? t('sp.bulk.reason') : t('sp.bulk.note')}</span>
                <textarea className="input min-h-20" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={2000} />
              </label>
            )}
            <p className="text-xs text-muted">{t('sp.bulk.undoHint')}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={open === 'processing'}
        onClose={() => setOpen(null)}
        busy={busy}
        title={t('sp.bulk.processingTitle', { count: n })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyProcessing} loading={busy}>
              {t('sp.bulk.apply')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('caseProcessing.column')}</span>
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value as ProcessingStage)}>
              {PROCESSING_STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.nextAssignee')}</span>
            <select className="input" value={stageAssignee} onChange={(e) => setStageAssignee(e.target.value)}>
              <option value="">—</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.note')}</span>
            <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
        </div>
      </Modal>

      <Modal
        open={open === 'message'}
        onClose={() => setOpen(null)}
        busy={busy}
        title={t('sp.bulk.messageTitle', { count: n })}
        description={t('sp.bulk.messageHintCases')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyMessage} loading={busy} disabled={!message.trim()}>
              {t('sp.bulk.send')}
            </Button>
          </>
        }
      >
        <TemplateField value={message} onChange={setMessage} label={t('sp.bulk.body')} vars={['firstName', 'lastName', 'caseNumber', 'profession', 'staffName']} />
      </Modal>
      {dialog}
    </>
  );
};

// ─── Inquiries ──────────────────────────────────────────────────────────

export const InquiriesBulkBar = ({ sel, total, pageCount, labelOf, invalidate }: { sel: RowSelection; total: number; pageCount: number; labelOf: (id: string) => string; invalidate: QueryKey[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { report, dialog } = useBulkReport();
  const [open, setOpen] = useState<null | 'status' | 'message' | 'assign'>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<InquiryStatus>('IN_PROGRESS');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const ids = sel.picked;
  const refresh = () => invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const applyStatus = () =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/inquiries/status', { ids, status })).data;
      setOpen(null);
      refresh();
      const prev = (res.previous ?? []).filter((p) => p.status && p.status !== status);
      if (res.ok) {
        undoToast({
          message: t('sp.bulk.inquiryStatusDone', { count: res.ok, status: inquiryStatusLabel(status) }),
          undo: async () => {
            if (prev.length) await api.post('/admin/bulk/inquiries/restore-status', { items: prev.map((p) => ({ id: p.id, status: p.status })) });
            refresh();
          },
        });
      }
      if (res.failed) report({ ...res, ok: 0 }, labelOf);
      sel.clear();
    });
  // Owner of the selected leads (POST /admin/bulk/inquiries/assign); "Geri al" restores each lead's previous owner.
  const assign = (staffId: string | null) =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/inquiries/assign', { selection: { ids }, staffId })).data;
      setOpen(null);
      refresh();
      if (res.ok && res.previous?.length) {
        const prev = res.previous;
        undoToast({
          message: t('sp.bulk.assigned', { count: res.ok }),
          undo: async () => {
            await api.post('/admin/bulk/inquiries/restore-assign', { items: prev.map((p) => ({ id: p.id, staffId: p.staffId ?? null })) });
            refresh();
          },
        });
      }
      if (res.failed) report({ ...res, ok: 0 }, labelOf);
      sel.clear();
    });
  const applyMessage = () =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/inquiries/message', { ids, subject, body })).data;
      setOpen(null);
      setBody('');
      report(res, labelOf, 'sp.bulk.mailed');
      sel.clear();
    });
  return (
    <>
      <BulkBarShell sel={sel} pageCount={pageCount} total={total} canSelectAll={false}>
        <BarButton icon={UserCog} onClick={() => setOpen('assign')} disabled={busy}>
          {t('sp.bulk.assign')}
        </BarButton>
        <BarButton icon={ListChecks} onClick={() => setOpen('status')} disabled={busy}>
          {t('sp.bulk.status')}
        </BarButton>
        <BarButton icon={MessageSquareText} onClick={() => setOpen('message')} disabled={busy}>
          {t('sp.bulk.email')}
        </BarButton>
        <BarButton icon={Download} onClick={() => void run(() => downloadCsv('/admin/bulk/inquiries/export', { ids }, 'inquiries.csv'))} disabled={busy}>
          {t('sp.bulk.export')}
        </BarButton>
      </BulkBarShell>
      <AssignDialog open={open === 'assign'} onClose={() => setOpen(null)} onApply={(staffId) => void assign(staffId)} busy={busy} count={ids.length} />
      <Modal
        open={open === 'status'}
        onClose={() => setOpen(null)}
        busy={busy}
        title={t('sp.bulk.statusTitle', { count: ids.length })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyStatus} loading={busy}>
              {t('sp.bulk.apply')}
            </Button>
          </>
        }
      >
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as InquiryStatus)} aria-label={t('sp.bulk.status')}>
          {INQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {inquiryStatusLabel(s)}
            </option>
          ))}
        </select>
      </Modal>
      <Modal
        open={open === 'message'}
        onClose={() => setOpen(null)}
        busy={busy}
        title={t('sp.bulk.emailTitle', { count: ids.length })}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyMessage} loading={busy} disabled={!subject.trim() || !body.trim()}>
              {t('sp.bulk.send')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.subject')}</span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </label>
          <TemplateField value={body} onChange={setBody} label={t('sp.bulk.body')} vars={['contactName', 'companyName', 'staffName']} />
        </div>
      </Modal>
      {dialog}
    </>
  );
};

// ─── Candidates ─────────────────────────────────────────────────────────

const APP_STATUSES = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;

export const CandidatesBulkBar = ({
  sel,
  filters,
  total,
  pageCount,
  labelOf,
  invalidate,
  vacancyId,
  appStatusLabel,
}: {
  sel: RowSelection;
  filters: Record<string, string | undefined>;
  total: number;
  pageCount: number;
  labelOf: (id: string) => string;
  invalidate: QueryKey[];
  vacancyId?: string;
  appStatusLabel: (s: string) => string;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { report, dialog } = useBulkReport();
  const [open, setOpen] = useState<null | 'assign' | 'status' | 'message'>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<(typeof APP_STATUSES)[number]>('SHORTLISTED');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const selection: BulkSelection = sel.allMatching ? { all: filters } : { ids: sel.picked };
  const n = sel.allMatching ? Math.min(total, BULK_MAX) : sel.count;
  const refresh = () => invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const assign = (staffId: string | null) =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/candidates/assign', { selection, staffId })).data;
      setOpen(null);
      refresh();
      if (res.ok && res.previous?.length) {
        const prev = res.previous;
        undoToast({
          message: t('sp.bulk.assigned', { count: res.ok }),
          undo: async () => {
            await api.post('/admin/bulk/cases/restore-assign', { items: prev.map((p) => ({ id: p.id, staffId: p.staffId ?? null })) });
            refresh();
          },
        });
      }
      if (res.failed) report({ ...res, ok: 0 }, labelOf);
      sel.clear();
    });
  const applyStatus = () => {
    if (!vacancyId) return;
    const body = { selection, vacancyId, status };
    setOpen(null);
    sel.clear();
    // Candidates are notified of the new status: delayed until the undo window ends.
    delayedCommit({
      message: t('sp.bulk.appStatusQueued', { count: n, status: appStatusLabel(status) }),
      commit: async () => (await api.post<BulkResponse>('/admin/bulk/candidates/status', body)).data,
      keepalive: { method: 'POST', url: '/admin/bulk/candidates/status', body },
      onCommitted: (res) => {
        refresh();
        report(res as BulkResponse, labelOf, 'sp.bulk.statusDone');
      },
    });
  };
  const applyMessage = () =>
    run(async () => {
      const res = (await api.post<BulkResponse>('/admin/bulk/candidates/message', { selection, title, body })).data;
      setOpen(null);
      setBody('');
      report(res, labelOf, 'sp.bulk.messaged');
      sel.clear();
    });
  return (
    <>
      <BulkBarShell sel={sel} pageCount={pageCount} total={total}>
        <BarButton icon={UserCog} onClick={() => setOpen('assign')} disabled={busy}>
          {t('sp.bulk.assignCase')}
        </BarButton>
        <BarButton icon={ListChecks} onClick={() => (vacancyId ? setOpen('status') : toast(t('sp.bulk.needVacancy')))} disabled={busy}>
          {t('sp.bulk.appStatus')}
        </BarButton>
        <BarButton icon={MessageSquareText} onClick={() => setOpen('message')} disabled={busy}>
          {t('sp.bulk.message')}
        </BarButton>
        <BarButton icon={Download} onClick={() => void run(() => downloadCsv('/admin/bulk/candidates/export', { selection }, 'candidates.csv'))} disabled={busy}>
          {t('sp.bulk.export')}
        </BarButton>
      </BulkBarShell>
      <AssignDialog open={open === 'assign'} onClose={() => setOpen(null)} onApply={assign} busy={busy} count={n} />
      <Modal
        open={open === 'status'}
        onClose={() => setOpen(null)}
        title={t('sp.bulk.appStatusTitle', { count: n })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyStatus}>{t('sp.bulk.apply')}</Button>
          </>
        }
      >
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as (typeof APP_STATUSES)[number])} aria-label={t('sp.bulk.appStatus')}>
          {APP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {appStatusLabel(s)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted">{t('sp.bulk.undoHint')}</p>
      </Modal>
      <Modal
        open={open === 'message'}
        onClose={() => setOpen(null)}
        busy={busy}
        title={t('sp.bulk.messageTitle', { count: n })}
        description={t('sp.bulk.messageHintCandidates')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
              {t('admin.common.cancel')}
            </Button>
            <Button onClick={applyMessage} loading={busy} disabled={!title.trim() || !body.trim()}>
              {t('sp.bulk.send')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.bulk.titleField')}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </label>
          <TemplateField value={body} onChange={setBody} label={t('sp.bulk.body')} vars={['firstName', 'lastName', 'profession', 'staffName']} />
        </div>
      </Modal>
      {dialog}
    </>
  );
};

