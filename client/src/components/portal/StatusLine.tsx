import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, Hourglass } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStatusLine } from '@/i18n/pagesStatusLine';
import { pagesJourneyMap } from '@/i18n/pagesJourneyMap';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { useNextStep, type NextAction, type NextStep, type StatusLineData } from './usePortalNav';
import { buildMilestones } from './journey';
import { useActionCopy } from '@/pages/account/portal/NextStepCard';
import { caseHref } from '@/pages/account/portal/useNextUp';

registerCopy(pagesStatusLine);
registerCopy(pagesJourneyMap);

/** Pure: the sentence of a status line (stage text + "nothing needed" / "needed: …"). Exported for tests. */
export const statusSentence = (
  s: StatusLineData,
  t: (key: string, vars?: Record<string, unknown>) => string,
  exists: (key: string) => boolean,
  detailText: string,
  dateText: string,
  actionTitle: string | null,
) => {
  const key = `pstatus.stage.${s.stage}`;
  const stage = detailText && exists(`${key}_detail`) ? t(`${key}_detail`, { detail: detailText }) : t(key, { date: dateText });
  if (s.required || (s.stage === 'NO_CASE' && !actionTitle)) return stage;
  return `${stage} — ${actionTitle ? t('pstatus.also', { what: actionTitle }) : t('pstatus.nothing')}`;
};

/**
 * The panel "Bax" opens under the status line: the current stage (same title and text as the case page's current-step
 * card), what is required with a button to it, the stages in one row (journey milestones, the same source as
 * "Sizin yolunuz") and "Müraciətə keç".
 */
function StatusPanel({ id, next, s, required }: { id: string; next: NextStep; s: StatusLineData; required: string | null }) {
  const { t, i18n } = useTranslation();
  const c = next.case!;
  const milestones = useMemo(() => (next.journey ? buildMilestones(next.journey).filter((m) => m.status !== 'skipped') : []), [next.journey]);
  // All documents accepted, contract not sent yet: the card says "Sənədləriniz qəbul edildi" (CaseView CurrentStepPanel).
  const docsAccepted = c.status === 'DOCUMENTS_REVIEW' && s.stage === 'CONTRACT_PREP';
  const contractKey = `journey.forecast.contractByType.${c.visaType}`;
  const labelOf = (key: string) => (key === 'contract' && c.visaType && i18n.exists(contractKey) ? t(contractKey) : t(`jmap.milestones.${key}`));
  return (
    <div id={id} role="region" aria-label={t('pstatus.panel.label')} className="mt-2 rounded-2xl border border-line bg-card p-4 text-sm text-ink sm:p-5" data-testid="cabinet-status-panel">
      <p className="type-overline text-muted">{t('pstatus.panel.current')}</p>
      <p className="mt-1 font-semibold break-words text-ink">{docsAccepted ? t('portal.docsAcceptedTitle') : t(`portal.status.${c.status}`)}</p>
      <p className="mt-1 max-w-[65ch] text-muted">{docsAccepted ? t('portal.docsAcceptedHelp') : t(`portal.statusHelp.${c.status}`)}</p>

      {required ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning-border bg-warning-bg px-3 py-2 text-warning-fg">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{t('pstatus.panel.required')}: </span>
            {required}
          </p>
          {s.to && (
            <Link to={s.to} className="inline-flex min-h-10 items-center gap-1 font-semibold underline underline-offset-2">
              {t('pstatus.panel.act')}
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-muted">{t('pstatus.panel.nothing')}</p>
      )}

      {milestones.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={t('pstatus.panel.stages')}>
          {milestones.map((m) => (
            <li
              key={m.key}
              aria-current={m.status === 'current' ? 'step' : undefined}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                m.status === 'current' ? 'border-highlight bg-highlight-bg text-ink' : m.status === 'done' ? 'border-line bg-sunken text-ink' : 'border-line text-muted',
              )}
            >
              {m.status === 'done' && <Check className="size-3 shrink-0 text-primary" aria-hidden />}
              {labelOf(m.key)}
              {m.status !== 'upcoming' && <span className="sr-only"> ({t(m.status === 'done' ? 'pstatus.panel.done' : 'pstatus.panel.now')})</span>}
            </li>
          ))}
        </ol>
      )}

      <Link to={caseHref(c.id, 'overview')} className="mt-3 inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
        {t('pstatus.panel.goToCase')}
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * The cabinet's plain status line (GET /api/account/next-step → statusLine; server lib/account/statusLine.ts): what
 * happens in the current stage and whether — and what — the client has to do. Shown in the header of every cabinet
 * page, next to "Profili tamamla". "Bax" opens a short panel right below it (no navigation; again = closed); without
 * a case it stays a link (to the vacancies).
 */
export function StatusLine({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const { tr, date } = useL10n();
  const actionCopy = useActionCopy();
  const next = useNextStep();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const s = next.data?.statusLine;
  if (!s || !next.data) return null;
  const detailText = s.detail ? (typeof s.detail === 'string' ? (s.stage === 'APPOINTMENT' ? '' : s.detail) : tr(s.detail as L10n)) : '';
  const dateText = s.stage === 'APPOINTMENT' && typeof s.detail === 'string' ? date(s.detail, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const action: NextAction | null = s.action ? { kind: s.action.kind, detail: s.action.detail, to: s.action.to, count: 1, dueAt: null, overdue: false } : null;
  const actionTitle = action ? actionCopy(action).title : null;
  const tt = (k: string, v?: Record<string, unknown>) => t(k, v) as string;
  const sentence = statusSentence(s, tt, (k) => i18n.exists(k), detailText, dateText, actionTitle);
  const needs = s.required || !!action;
  const Icon = needs ? AlertCircle : s.stage === 'APPROVED' ? CheckCircle2 : Hourglass;
  const hasCase = !!next.data.case && s.stage !== 'NO_CASE';
  // What the panel names as required: the stage itself when it asks for something, else the extra action.
  const required = s.required ? statusSentence({ ...s, action: null }, tt, (k) => i18n.exists(k), detailText, dateText, null) : actionTitle;
  return (
    <div className={className}>
      <p
        role="status"
        className={clsx(
          'flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm',
          needs ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-sunken text-ink',
        )}
        data-testid="cabinet-status-line"
      >
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="sr-only">{t('pstatus.label')}: </span>
          {sentence}
          {hasCase ? (
            <>
              {' '}
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? t('pstatus.close') : t('pstatus.open')}
                <ChevronDown className={clsx('size-3.5 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
              </button>
            </>
          ) : (
            s.to && (
              <>
                {' '}
                <Link to={s.to} className="font-semibold underline underline-offset-2">
                  {t('pstatus.open')}
                </Link>
              </>
            )
          )}
        </span>
      </p>
      {hasCase && (open ? <StatusPanel id={panelId} next={next.data} s={s} required={required} /> : <div id={panelId} hidden />)}
    </div>
  );
}
