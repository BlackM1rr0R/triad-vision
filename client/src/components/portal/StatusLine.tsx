import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Hourglass } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStatusLine } from '@/i18n/pagesStatusLine';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { useNextStep, type NextAction, type StatusLineData } from './usePortalNav';
import { useActionCopy } from '@/pages/account/portal/NextStepCard';

registerCopy(pagesStatusLine);

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
 * The cabinet's plain status line (GET /api/account/next-step → statusLine; server lib/account/statusLine.ts): what
 * happens in the current stage and whether — and what — the client has to do. Shown in the header of every cabinet
 * page, next to "Profili tamamla".
 */
export function StatusLine({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const { tr, date } = useL10n();
  const actionCopy = useActionCopy();
  const next = useNextStep();
  const s = next.data?.statusLine;
  if (!s) return null;
  const detailText = s.detail ? (typeof s.detail === 'string' ? (s.stage === 'APPOINTMENT' ? '' : s.detail) : tr(s.detail as L10n)) : '';
  const dateText = s.stage === 'APPOINTMENT' && typeof s.detail === 'string' ? date(s.detail, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const action: NextAction | null = s.action ? { kind: s.action.kind, detail: s.action.detail, to: s.action.to, count: 1, dueAt: null, overdue: false } : null;
  const sentence = statusSentence(s, (k, v) => t(k, v) as string, (k) => i18n.exists(k), detailText, dateText, action ? actionCopy(action).title : null);
  const needs = s.required || !!action;
  const Icon = needs ? AlertCircle : s.stage === 'APPROVED' ? CheckCircle2 : Hourglass;
  return (
    <p
      role="status"
      className={clsx(
        'flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm',
        needs ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-sunken text-ink',
        className,
      )}
      data-testid="cabinet-status-line"
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="sr-only">{t('pstatus.label')}: </span>
        {sentence}
        {s.to && (
          <>
            {' '}
            <Link to={s.to} className="font-semibold underline underline-offset-2">
              {t('pstatus.open')}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}
