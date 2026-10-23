import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, FileCheck2, MessageSquare, Route } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import { STATUS_BAR_TONE } from '@/lib/caseStatus';
import { actorSideLabel, eventLabel, fmtDate, fmtDateTime, fmtDays, fmtRelative, statusLabel } from '../labels';
import type { CaseStatus } from '@/lib/types';
import type { CaseStats as Stats } from '../types';
import { DefRow, Panel } from '../ui';
import { WorkflowStepper } from './WorkflowStepper';

const Mini = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' | 'danger' }) => (
  <div className="rounded-lg border border-line bg-surface/60 px-3 py-2.5">
    <p className="text-[11px] text-muted">{label}</p>
    <p className={clsx('mt-0.5 text-lg font-bold tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-amber-700' : 'text-navy-900')}>{value}</p>
    {hint && <p className="text-[11px] text-muted">{hint}</p>}
  </div>
);

/**
 * Status timeline of one case (Ümumi tab): the workflow stepper, how long each step took, document and message
 * balance, last activity. `onOpenMessages` opens the messages on the Ünsiyyət tab.
 */
export const CaseStatsPanel = ({ stats, status, onOpenMessages, id }: { stats: Stats; status?: CaseStatus; onOpenMessages?: () => void; id?: string }) => {
  const { t } = useTranslation();
  const d = stats.documents;
  const m = stats.messages;
  const totalDays = Math.max(1, stats.statusHistory.reduce((a, h) => a + h.days, 0));
  const inStatusTone = stats.daysInStatus >= 7 ? 'danger' : stats.daysInStatus >= 3 ? 'warn' : undefined;

  return (
    <Panel id={id} title={t('caseLayout.statusTitle')} icon={BarChart3} actions={<span className="text-[11px] text-muted tabular-nums">{t('admin.case.stats.events', { count: stats.eventsTotal })}</span>}>
      {status && (
        <div className="mb-5">
          <WorkflowStepper status={status} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label={t('admin.case.stats.age')} value={fmtDays(stats.ageDays)} />
        <Mini label={t('admin.case.stats.inStatus')} value={fmtDays(stats.daysInStatus)} hint={t('admin.case.stats.since', { date: fmtDate(stats.statusSince) })} tone={inStatusTone} />
        <Mini label={t('admin.case.stats.statusChanges')} value={String(stats.statusChanges)} />
        <Mini
          label={t('admin.case.stats.decisionTime')}
          value={fmtDays(stats.daysToDecision)}
          hint={stats.daysToDecision === null ? t('admin.case.stats.noDecision') : t('admin.case.stats.fromToDecision')}
        />
      </div>

      {/* Status history: one segment per step, width ∝ days spent */}
      <section className="mt-5" aria-label={t('admin.case.stats.history')}>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
          <Route className="size-3.5 text-muted" aria-hidden /> {t('admin.case.stats.history')}
        </h3>
        {stats.statusHistory.length === 0 ? (
          <p className="text-xs text-muted">{t('admin.case.stats.noHistory')}</p>
        ) : (
          <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {stats.statusHistory.map((h, i) => (
              <li
                key={`${h.status}-${i}`}
                className={clsx('min-w-[7.5rem] shrink-0 rounded-lg border p-2', h.current ? 'border-brand-400 bg-brand-50/60' : 'border-line')}
                style={{ flexGrow: Math.max(0.5, h.days) / totalDays }}
                aria-current={h.current ? 'step' : undefined}
              >
                <span className={clsx('block h-1.5 rounded-full', STATUS_BAR_TONE[h.status])} aria-hidden />
                <p className="mt-1.5 truncate text-[11px] font-semibold text-navy-900" title={statusLabel(h.status)}>
                  {statusLabel(h.status)}
                </p>
                <p className="text-[11px] text-muted tabular-nums">
                  {fmtDays(h.days)}
                  {h.current && t('admin.case.stats.now')}
                </p>
                <p className="text-[10px] text-muted/80">{fmtDate(h.enteredAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section aria-label={t('admin.case.stats.docBalance')}>
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
            <FileCheck2 className="size-3.5 text-muted" aria-hidden /> {t('admin.case.stats.documents')}
          </h3>
          <div className="mb-2 flex items-center gap-3">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100" aria-hidden>
              <span className="block h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${d.requiredTotal ? (d.requiredAccepted / d.requiredTotal) * 100 : 0}%` }} />
            </span>
            <span className="text-xs font-semibold text-navy-900 tabular-nums">{t('admin.case.stats.required', { accepted: d.requiredAccepted, total: d.requiredTotal })}</span>
          </div>
          <dl className="divide-y divide-line">
            <DefRow label={t('admin.case.stats.pendingRejected')}>
              <span className={clsx(d.pending > 0 && 'text-amber-700')}>{d.pending}</span> / <span className={clsx(d.rejected > 0 && 'text-danger')}>{d.rejected}</span>
            </DefRow>
            <DefRow label={t('admin.case.stats.totalFiles')}>
              {d.total} · {formatBytes(d.bytes)}
            </DefRow>
            <DefRow label={t('admin.case.stats.lastUpload')}>{d.lastUploadAt ? fmtRelative(d.lastUploadAt) : '—'}</DefRow>
          </dl>
        </section>

        <section aria-label={t('admin.case.stats.msgBalance')}>
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
            <MessageSquare className="size-3.5 text-muted" aria-hidden /> {t('admin.common.messages')}
          </h3>
          {m.awaitingStaffReply && (
            <button
              type="button"
              onClick={onOpenMessages}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-left text-xs font-semibold text-warning-fg transition hover:brightness-95"
            >
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {t('admin.case.stats.awaiting')}
              {m.lastClientAt && <span className="ml-auto font-normal">{fmtRelative(m.lastClientAt)}</span>}
            </button>
          )}
          <dl className="divide-y divide-line">
            <DefRow label={t('admin.case.stats.total')}>{m.total}</DefRow>
            <DefRow label={t('admin.case.stats.clientStaff')}>
              {m.fromClient} / {m.fromStaff}
            </DefRow>
            <DefRow label={t('admin.case.stats.lastClient')}>{m.lastClientAt ? fmtRelative(m.lastClientAt) : '—'}</DefRow>
            <DefRow label={t('admin.case.stats.lastStaff')}>{m.lastStaffAt ? fmtRelative(m.lastStaffAt) : '—'}</DefRow>
          </dl>
        </section>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
        {t('admin.case.stats.lastActivity')}{' '}
        {stats.lastActivity ? (
          <>
            <span className="font-semibold text-ink/80">{eventLabel(stats.lastActivity.type)}</span> · {actorSideLabel(stats.lastActivity.byRole)} ·{' '}
            <span title={fmtDateTime(stats.lastActivity.at)}>{fmtRelative(stats.lastActivity.at)}</span>
          </>
        ) : (
          '—'
        )}
      </p>
    </Panel>
  );
};
