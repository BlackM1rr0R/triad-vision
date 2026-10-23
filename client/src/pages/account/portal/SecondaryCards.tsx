import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BellRing, CalendarDays, FileUp, Gift, GraduationCap, Hourglass, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useGermanOverview } from '@/components/german/api';
import { levelLabel } from '@/components/german/types';
import type { ActiveCase } from '@/components/portal/accountTypes';

const Teaser = ({ icon: Icon, title, text, to, action, children }: { icon: LucideIcon; title: string; text?: string; to: string; action: string; children?: ReactNode }) => (
  <section className="card card-body flex flex-col">
    <h2 className="type-card-title flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-4" aria-hidden />
      </span>
      {title}
    </h2>
    {text && <p className="type-small mt-3">{text}</p>}
    {children}
    <Link to={to} className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">
      {action}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  </section>
);

/** German progress (only when a level is required or a plan / course exists). */
export function GermanTeaser() {
  const { t } = useTranslation();
  const { data } = useGermanOverview();
  if (!data || (!data.plan && !data.courses.length && !data.exams.length && !data.requiredLevel)) return null;
  const pct = Math.max(0, Math.min(100, Math.round(data.progress.percent)));
  return (
    <Teaser icon={GraduationCap} title={t('pux.cards.german.title')} to="/account/german" action={t('pux.cards.german.open')}>
      <p className="type-small mt-3">{t('pux.cards.german.level', { current: levelLabel(data.progress.current), target: levelLabel(data.progress.target) })}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('pux.cards.german.title')}>
        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </Teaser>
  );
}

/** Referral teaser (only when the programme is enabled). Same query as the referral page. */
export function ReferralTeaser() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['growth', 'referral'],
    queryFn: async () => (await api.get<{ enabled: boolean }>('/growth/referral')).data,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data?.enabled) return null;
  return <Teaser icon={Gift} title={t('pux.cards.referral.title')} text={t('pux.cards.referral.text')} to="/account/referral" action={t('pux.cards.referral.open')} />;
}

/** "Your application in numbers" (moved from the portal home to the case page's "Other" tab). */
export function CaseNumbers({ c }: { c: ActiveCase }) {
  const { t } = useTranslation();
  const items: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: CalendarDays, label: t('accountPage.dash.numbers.age'), value: c.stats.ageDays },
    { icon: Hourglass, label: t('accountPage.dash.numbers.step'), value: c.stats.daysInStatus },
    { icon: FileUp, label: t('accountPage.dash.numbers.uploads'), value: c.stats.uploads },
    { icon: MessageCircle, label: t('accountPage.dash.numbers.messages'), value: c.stats.messages },
    { icon: BellRing, label: t('accountPage.dash.numbers.updates'), value: c.stats.events },
  ];
  return (
    <section className="card" aria-label={t('accountPage.dash.numbers.title')}>
      <ul className="grid grid-cols-2 divide-y divide-line sm:grid-cols-5 sm:divide-x sm:divide-y-0 [&>*]:min-w-0">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 px-4 py-3 sm:flex-col sm:items-start sm:gap-1.5 sm:px-5 sm:py-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <it.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xl leading-tight font-extrabold text-ink">{it.value}</span>
              <span className="block truncate text-[11px] font-medium text-muted">{it.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
