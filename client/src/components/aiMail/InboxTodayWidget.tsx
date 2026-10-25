import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowUpRight, Inbox, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useInboxToday, type AiFilter, type TriageCategory } from './api';

const LINKS: { key: TriageCategory; filter: AiFilter; tone: string }[] = [
  { key: 'CANDIDATE', filter: 'candidate', tone: 'bg-primary/10 text-link' },
  { key: 'EMPLOYER', filter: 'employer', tone: 'bg-accent-bg text-accent-fg' },
  { key: 'PARTNER', filter: 'partner', tone: 'bg-info-bg text-info-fg' },
  { key: 'EXISTING_CLIENT', filter: 'client', tone: 'bg-success-bg text-success-fg' },
  { key: 'SPAM', filter: 'spam', tone: 'bg-sunken text-muted' },
];

const mailLink = (filter?: AiFilter) => `/workspace/mail${filter ? `?ai=${filter}` : ''}`;

/**
 * "Inbox today: 12 new — 3 urgent, 5 candidates, 2 employers" with click-through filters. Shown only
 * to staff who have a mailbox with automatic AI triage (e.g. info@) connected.
 */
export const InboxTodayWidget = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useInboxToday();
  if (!data || !data.enabled || !data.mailboxes.length) return null;
  const notAnalysed = Math.max(0, data.total - data.analysed);

  return (
    <section className={clsx('rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]', className)} aria-label={t('aiMail.today.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-link">
          <Inbox className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{t('aiMail.today.title')}</h2>
          <p className="truncate text-xs text-muted">{data.mailboxes.join(', ')}</p>
        </div>
        {user?.role === 'SUPER_ADMIN' && (
          <Link to="/admin/ai/mail-triage" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <Settings className="size-3.5" aria-hidden /> {t('aiMail.today.settings')}
          </Link>
        )}
        <Link to={mailLink()} className="inline-flex items-center gap-0.5 text-xs font-semibold text-link hover:underline">
          {t('aiMail.today.openMail')} <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {data.total === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('aiMail.today.none')}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Link to={mailLink()} className="mr-1 text-lg font-bold text-ink tabular-nums hover:underline">
            {t('aiMail.today.line', { count: data.total })}
          </Link>
          {data.urgent > 0 && (
            <Link to={mailLink('urgent')} className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger-fg hover:underline">
              {t('aiMail.today.urgent', { count: data.urgent })}
            </Link>
          )}
          {LINKS.filter((l) => (data.byCategory[l.key] ?? 0) > 0).map((l) => (
            <Link key={l.key} to={mailLink(l.filter)} className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold hover:underline', l.tone)}>
              {data.byCategory[l.key]} {t(`aiMail.category.${l.key}`)}
            </Link>
          ))}
          {data.open > 0 && (
            <Link to={mailLink('open')} className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:text-ink">
              {t('aiMail.today.open', { count: data.open })}
            </Link>
          )}
          {notAnalysed > 0 && <span className="text-xs text-muted">· {t('aiMail.today.notAnalysed', { count: notAnalysed })}</span>}
        </div>
      )}
    </section>
  );
};

export default InboxTodayWidget;
