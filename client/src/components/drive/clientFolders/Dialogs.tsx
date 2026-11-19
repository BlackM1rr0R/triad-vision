import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, ChevronDown, FileText, Handshake, PenLine, Search, SendHorizontal, XCircle } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime } from '@/components/admin/labels';
import { formatBytes } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { usePartnerOptions } from '@/components/partners/api';
import { stageLabel } from '@/components/caseProcessing/api';
import { moveStages, refreshAfter, reasonOf, requestError, sendReady, setPartner, useReadyDocs, type BulkResponse, type FolderTarget } from './api';

/** Names of the folders a dialog works on (one line, or a short list). */
const TargetsLine = ({ targets }: { targets: FolderTarget[] }) => {
  const { t } = useTranslation();
  if (targets.length === 1) return <>{`${targets[0].name}${targets[0].number ? ` · ${targets[0].number}` : ''}`}</>;
  return <>{t('driveProcessing.dialog.folders', { count: targets.length })}</>;
};

const TargetList = ({ targets }: { targets: FolderTarget[] }) =>
  targets.length > 1 ? (
    <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg bg-sunken px-3 py-2 text-xs text-ink/80">
      {targets.map((x) => (
        <li key={x.caseId} className="truncate">
          {x.name} {x.number && <span className="text-muted">· {x.number}</span>}
        </li>
      ))}
    </ul>
  ) : null;

/** Runs a bulk call, refreshes, toasts and hands the answer on (the summary dialog shows failures). */
const useRun = (onResult: (r: BulkResponse) => void) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (call: () => Promise<BulkResponse>) => {
    setBusy(true);
    try {
      const r = await call();
      refreshAfter(qc);
      if (!r.summary.failed) toast.success(t('clientFolders.toasts.done', { count: r.summary.succeeded + r.summary.skipped }));
      else toast.warning(t('clientFolders.toasts.partial', { ok: r.summary.succeeded + r.summary.skipped, total: r.summary.total }));
      onResult(r);
      return true;
    } catch (e) {
      toast.error(requestError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
};

// ─── Partner ──────────────────────────────────────────────────────────

/** "Partnyor təyin et / Partnyoru dəyiş": searchable partner list + optional note. */
export const PartnerPickerDialog = ({ targets, onClose, onResult }: { targets: FolderTarget[]; onClose: () => void; onResult: (r: BulkResponse) => void }) => {
  const { t } = useTranslation();
  const partners = usePartnerOptions();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { busy, run } = useRun(onResult);
  const current = new Set(targets.map((x) => x.partner?.id).filter(Boolean));
  const changing = targets.some((x) => x.partner);
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return (partners.data ?? [])
      .filter((p) => p.active || current.has(p.id))
      .filter((p) => !needle || [p.name, p.phone, p.email].some((v) => v?.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners.data, q]);
  const formId = 'cf-partner';
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t(changing ? 'clientFolders.partner.changeTitle' : 'clientFolders.partner.pickTitle')}
      description={<TargetsLine targets={targets} />}
      icon={<Handshake className="size-5" />}
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('clientFolders.cancel')}
          </button>
          <button type="submit" form={formId} className="btn-primary btn-sm" disabled={busy || !picked}>
            {busy && <Spinner className="size-3.5" />} {t('clientFolders.partner.submit')}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (picked) void run(() => setPartner(targets.map((x) => x.caseId), picked, note.trim() || undefined)).then((ok) => ok && onClose());
        }}
      >
        <TargetList targets={targets} />
        <label className="relative block">
          <span className="sr-only">{t('clientFolders.partner.searchPh')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('clientFolders.partner.searchPh')} autoFocus />
        </label>
        <div role="radiogroup" aria-label={t('clientFolders.partner.pickTitle')} className="max-h-64 overflow-y-auto rounded-lg border border-line">
          {partners.isLoading ? (
            <div className="grid place-items-center p-4">
              <Spinner className="size-5" />
            </div>
          ) : !list.length ? (
            <p className="p-4 text-center text-sm text-muted">{t('clientFolders.partner.empty')}</p>
          ) : (
            list.map((p) => (
              <label key={p.id} className={clsx('flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-sm last:border-b-0 hover:bg-sunken', picked === p.id && 'bg-primary/[0.06]')}>
                <input type="radio" name="partner" className="size-4 accent-primary" checked={picked === p.id} onChange={() => setPicked(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{p.name}</span>
                  {(p.phone || p.email) && <span className="block truncate text-xs text-muted">{[p.phone, p.email].filter(Boolean).join(' · ')}</span>}
                </span>
                {current.has(p.id) && <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10px] font-semibold text-muted">{t('clientFolders.partner.current')}</span>}
                {!p.active && <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10px] font-semibold text-muted">{t('clientFolders.partner.inactive')}</span>}
              </label>
            ))
          )}
        </div>
        {changing && (
          <label className="block">
            <span className="sr-only">{t('clientFolders.partner.notePh')}</span>
            <textarea className="input min-h-16" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('clientFolders.partner.notePh')} />
          </label>
        )}
        <p className="text-xs text-muted">{t('clientFolders.partner.hint')}</p>
      </form>
    </Modal>
  );
};

/** "Partnyorluqdan çıxart" with confirmation. */
export const RemovePartnerDialog = ({ targets, onClose, onResult }: { targets: FolderTarget[]; onClose: () => void; onResult: (r: BulkResponse) => void }) => {
  const { t } = useTranslation();
  const { busy, run } = useRun(onResult);
  const one = targets.length === 1 ? targets[0] : null;
  return (
    <Modal
      open
      role="alertdialog"
      onClose={() => !busy && onClose()}
      title={t('clientFolders.partner.removeTitle')}
      description={<TargetsLine targets={targets} />}
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('clientFolders.cancel')}
          </button>
          <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={() => void run(() => setPartner(targets.map((x) => x.caseId), null)).then((ok) => ok && onClose())}>
            {busy && <Spinner className="size-3.5" />} {t('clientFolders.partner.removeConfirm')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink">
        {one ? t('clientFolders.partner.removeOne', { name: one.name, partner: one.partner?.name ?? '—' }) : t('clientFolders.partner.removeMany', { count: targets.length })}
      </p>
      <div className="mt-3">
        <TargetList targets={targets} />
      </div>
    </Modal>
  );
};

// ─── Bulk stage ───────────────────────────────────────────────────────

/** "Schon geschrieben kimi işarələ" for one or several folders: next admin + note, the server's move rules per case. */
export const BulkStageDialog = ({
  targets,
  onClose,
  onResult,
  quick,
  skipped = 0,
}: {
  targets: FolderTarget[];
  onClose: () => void;
  onResult: (r: BulkResponse) => void;
  /** The toolbar / tile "Schon geschrieben" quick action: one confirm button; next admin + note folded away (default none). */
  quick?: boolean;
  /** Selected items left out (already WRITTEN, not a client folder). */
  skipped?: number;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const staff = useStaffOptions();
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(!quick);
  const submitRef = useRef<HTMLButtonElement>(null);
  const { busy, run } = useRun(onResult);
  const formId = 'cf-stage';
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={t('clientFolders.stage.bulkTitle')}
      description={<TargetsLine targets={targets} />}
      busy={busy}
      size={quick ? 'sm' : undefined}
      initialFocus={quick ? submitRef : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('clientFolders.cancel')}
          </button>
          <button ref={submitRef} type="submit" form={formId} className="btn-primary btn-sm" disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : quick && <PenLine className="size-3.5" aria-hidden />} {t(quick ? 'clientFolders.stage.quickConfirm' : 'driveProcessing.dialog.send')}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => moveStages(targets.map((x) => x.caseId), 'WRITTEN', assigneeId || null, note.trim() || null)).then((ok) => ok && onClose());
        }}
      >
        {targets.length > 1 && (
          <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg bg-sunken px-3 py-2 text-xs text-ink/80">
            {targets.map((x) => (
              <li key={x.caseId} className="flex items-center gap-2 truncate">
                <span className="truncate">{x.name}</span>
                <span className="shrink-0 text-muted">· {stageLabel(x.stage)}</span>
              </li>
            ))}
          </ul>
        )}
        {skipped > 0 && <p className="text-xs text-muted">{t('clientFolders.stage.quickSkipped', { count: skipped })}</p>}
        {more ? (
          <>
            <label className="block">
              <span className="label">{t('driveProcessing.dialog.nextAdmin')}</span>
              <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">{t('driveProcessing.dialog.nobody')}</option>
                {(staff.data ?? [])
                  .filter((s) => s.id !== user?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.firstName} ${s.lastName}`.trim()}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('driveProcessing.dialog.noteOptional')}</span>
              <textarea className="input min-h-16" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('driveProcessing.dialog.notePh')} />
            </label>
          </>
        ) : (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline" aria-expanded={false} onClick={() => setMore(true)}>
            <ChevronDown className="size-3.5" aria-hidden /> {t('clientFolders.stage.quickMore')}
          </button>
        )}
        <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('clientFolders.stage.bulkHint')}</p>
      </form>
    </Modal>
  );
};

// ─── Fertig → client ──────────────────────────────────────────────────

/**
 * "Müştəriyə göndər": one folder shows its Fertig files (new / already sent) and the earlier sends — a second
 * send needs the explicit "yes, again"; several folders are sent together (already sent ones only when ticked).
 */
export const SendReadyDialog = ({ targets, onClose, onResult }: { targets: FolderTarget[]; onClose: () => void; onResult: (r: BulkResponse) => void }) => {
  const { t } = useTranslation();
  const one = targets.length === 1 ? targets[0] : null;
  const view = useReadyDocs(one?.caseId ?? null);
  const [resend, setResend] = useState(false);
  const { busy, run } = useRun(onResult);
  const data = view.data;
  const sentBefore = one ? !!data?.sends.length : targets.some((x) => x.readySentAt);
  const blocked = one ? !data || data.stage !== 'DONE' || !data.files.length || (data.sends.length > 0 && (!resend || data.newCount === 0)) : false;
  const last = data?.sends[0];
  return (
    <Modal
      open
      size="lg"
      onClose={() => !busy && onClose()}
      title={t('clientFolders.send.title')}
      description={<TargetsLine targets={targets} />}
      icon={<SendHorizontal className="size-5" />}
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {t('clientFolders.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy || blocked}
            onClick={() => void run(() => sendReady(targets.map((x) => x.caseId), resend)).then((ok) => ok && onClose())}
          >
            {busy && <Spinner className="size-3.5" />} {t('clientFolders.send.submit')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {one ? (
          view.isLoading ? (
            <div className="grid place-items-center p-6">
              <Spinner className="size-5" />
            </div>
          ) : view.isError ? (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg" role="alert">
              {requestError(view.error)}
            </p>
          ) : data ? (
            <>
              <p className="text-muted">{t('clientFolders.send.explain', { folder: data.folder?.name ?? one.name })}</p>
              {data.stage !== 'DONE' && (
                <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg" role="alert">
                  {t('clientFolders.send.notDone')} ({stageLabel(data.stage)})
                </p>
              )}
              {data.files.length === 0 ? (
                <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('clientFolders.send.noFiles')}</p>
              ) : (
                <section aria-labelledby="cf-files">
                  <h3 id="cf-files" className="mb-1 text-xs font-semibold text-muted">
                    {t('clientFolders.send.filesTitle')} ({data.files.length})
                  </h3>
                  <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {data.files.map((f) => (
                      <li key={f.nodeId} className="flex items-center gap-2.5 px-3 py-2">
                        <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">{f.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {[f.path, f.size != null ? formatBytes(f.size) : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className={clsx('shrink-0 rounded px-1.5 py-px text-[10px] font-semibold', f.sent ? 'bg-success-bg text-success-fg' : 'bg-info-bg text-info-fg')}>
                          {f.sent ? t('clientFolders.send.sent') : t('clientFolders.send.fresh')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {last && (
                <div className="space-y-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg" role="status">
                  <p className="font-semibold">{t('clientFolders.send.already', { date: fmtDateTime(last.at), by: last.by ? ` · ${last.by}` : '' })}</p>
                  <p>{t('clientFolders.send.resendHint')}</p>
                  <label className="inline-flex items-center gap-2 font-semibold">
                    <input type="checkbox" className="size-4 accent-primary" checked={resend} onChange={(e) => setResend(e.target.checked)} />
                    {t('clientFolders.send.resendCheck')}
                  </label>
                </div>
              )}
            </>
          ) : null
        ) : (
          <>
            <p className="text-muted">{t('clientFolders.send.bulk', { count: targets.length })}</p>
            <TargetList targets={targets} />
            {sentBefore && (
              <div className="space-y-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg">
                <p>{t('clientFolders.send.resendHint')}</p>
                <label className="inline-flex items-center gap-2 font-semibold">
                  <input type="checkbox" className="size-4 accent-primary" checked={resend} onChange={(e) => setResend(e.target.checked)} />
                  {t('clientFolders.send.bulkResend')}
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

// ─── Result ───────────────────────────────────────────────────────────

/** Summary of a bulk action: n succeeded / unchanged / failed, and each failure with its reason. */
export const ResultDialog = ({ result, onClose }: { result: BulkResponse; onClose: () => void }) => {
  const { t } = useTranslation();
  const failed = result.results.filter((r) => !r.ok);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('clientFolders.result.title')}
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t('clientFolders.result.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-fg">
            <CheckCircle2 className="size-3.5" aria-hidden /> {t('clientFolders.result.ok', { count: result.summary.succeeded })}
          </span>
          {result.summary.skipped > 0 && <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-xs font-semibold text-neutral-fg">{t('clientFolders.result.skipped', { count: result.summary.skipped })}</span>}
          {failed.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger-fg">
              <XCircle className="size-3.5" aria-hidden /> {t('clientFolders.result.failed', { count: failed.length })}
            </span>
          )}
        </p>
        {failed.length > 0 && (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line" role="list">
            {failed.map((r) => (
              <li key={r.caseId} className="px-3 py-2">
                <p className="truncate font-medium text-ink">
                  {r.name ?? r.caseId}
                  {r.number && <span className="text-muted"> · {r.number}</span>}
                </p>
                <p className="text-xs text-danger-fg">{reasonOf(r.error)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
