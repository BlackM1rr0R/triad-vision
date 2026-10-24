import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Copy, PlaneTakeoff } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPostArrival } from '@/i18n/pagesPostArrival';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toastError } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import type { FamilyOverview } from './types';

registerCopy(pagesPostArrival);

/**
 * Staff: "Familiennachzug-u başlat" on the main case (lib/family/reunion.ts) — opens the cases of the members
 * joining later and copies the reusable documents — plus "copy documents again" for every member case.
 */
export const ReunionPanel = ({ caseId, data, onChanged }: { caseId: string; data: FamilyOverview; onChanged: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'start' | 'copy' | null>(null);
  const r = data.reunion;
  if (!r || data.members.length === 0) return null;

  const start = async () => {
    setBusy('start');
    try {
      const res = (await api.post<{ started: unknown[] }>(`/family/cases/${caseId}/reunion/start`)).data;
      toast.success(t('postArrival.reunion.started', { count: res.started.length }));
      setConfirm(false);
      await onChanged();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    setBusy('copy');
    try {
      const res = (await api.post<{ copied: { copied: number }[] }>(`/family/cases/${caseId}/copy-documents`)).data;
      const n = res.copied.reduce((a, x) => a + x.copied, 0);
      toast.success(n ? t('postArrival.reunion.copied', { count: n }) : t('postArrival.reunion.copiedNone'));
      await onChanged();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-line bg-surface/60 p-3.5" aria-labelledby={`reunion-${caseId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={`reunion-${caseId}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
            <PlaneTakeoff className="size-4 text-brand-600" aria-hidden />
            {t('postArrival.reunion.title')}
            {r.startedAt && <span className={clsx('badge', TONE_CLASS.success)}>{t('postArrival.reunion.startedAt', { date: date(r.startedAt) })}</span>}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {r.startable.length > 0
              ? r.ready
                ? t('postArrival.reunion.startHint', { count: r.startable.length })
                : t('postArrival.reunion.notReady')
              : r.laterCount === 0
                ? t('postArrival.reunion.noLater')
                : t('postArrival.reunion.nothing')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={!!busy} onClick={() => void copy()}>
            <Copy className="size-3.5" aria-hidden /> {t('postArrival.reunion.copy')}
          </button>
          {r.startable.length > 0 && (
            <button type="button" className="btn-primary btn-sm" disabled={!r.ready || !!busy} onClick={() => setConfirm(true)} title={!r.ready ? t('postArrival.reunion.notReady') : undefined}>
              <PlaneTakeoff className="size-3.5" aria-hidden /> {t('postArrival.reunion.start')}
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void start()}
        title={t('postArrival.reunion.confirmTitle')}
        message={t('postArrival.reunion.confirmBody')}
        confirmLabel={t('postArrival.reunion.start')}
        loading={busy === 'start'}
      />
    </section>
  );
};

/** Per member: when the reunion started / documents were copied (small line in the member row). */
export const MemberReunionLine = ({ data, memberCaseId }: { data: FamilyOverview; memberCaseId: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const m = data.reunion?.members.find((x) => x.caseId === memberCaseId);
  if (!m || (!m.startedAt && !m.docsCopiedAt)) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
      {m.startedAt && <span>{t('postArrival.reunion.memberStarted', { date: date(m.startedAt) })}</span>}
      {m.docsCopiedAt && <span>{t('postArrival.reunion.docsCopied', { date: date(m.docsCopiedAt) })}</span>}
    </p>
  );
};

/** Client portal: the state of the family reunion in plain words. */
export const ReunionStatus = ({ data, className }: { data: FamilyOverview; className?: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const r = data.reunion;
  if (!r || r.laterCount === 0) return null;
  const copied = r.members.some((m) => m.docsCopiedAt);
  const text = r.startedAt ? t('postArrival.reunion.client.started', { date: date(r.startedAt) }) : r.ready ? t('postArrival.reunion.client.ready') : t('postArrival.reunion.client.waiting');
  return (
    <div className={clsx('rounded-xl px-4 py-3 text-sm', r.startedAt ? TONE_CLASS.success : TONE_CLASS.info, className)} role="status">
      <p className="flex items-start gap-2">
        <PlaneTakeoff className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">{t('postArrival.reunion.title')}: </span>
          {text}
          {copied && <span className="mt-1 block text-xs opacity-90">{t('postArrival.reunion.client.copied')}</span>}
        </span>
      </p>
    </div>
  );
};

export default ReunionPanel;
