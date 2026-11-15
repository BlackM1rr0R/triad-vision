import { useTranslation } from 'react-i18next';
import { Briefcase, MapPin, PlaneLanding, Stamp } from 'lucide-react';
import { Counter } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { CONTENT_LOCALES, MONTH_YEAR, type ContentLocale } from '@/lib/seoContent/types';
import { registerCopy } from '@/i18n';
import { lifeHomeCopy } from '@/i18n/lifeHome';
import { useLiveNumbers } from './api';

registerCopy(lifeHomeCopy);

/**
 * Live numbers board (home, about): visas granted and people arrived this month, top professions and cities —
 * anonymous aggregates from GET /api/life/live-numbers (figures below 3 are withheld by the server, cached 1 h).
 * Renders nothing when staff switched it off for this place or there is nothing to show yet. Public data, so the
 * server renders it with the page (SSR_QUERY_KEYS 'live-numbers'); numbers count up once in view (AnimatedNumber).
 */
export const LiveNumbers = ({ where, className = 'section bg-sunken' }: { where: 'home' | 'about'; className?: string }) => {
  const { t, i18n } = useTranslation();
  const { data } = useLiveNumbers();
  const d = data?.data;
  if (!data?.enabled || !d || (where === 'home' ? !data.showOnHome : !data.showOnAbout)) return null;
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const lng: ContentLocale = (CONTENT_LOCALES as readonly string[]).includes(ui) ? (ui as ContentLocale) : 'en';
  const [y, m] = d.month.split('-').map(Number);
  const figures = [
    { key: 'visas', value: d.visas, icon: Stamp, chip: 'chip-sage' },
    { key: 'arrivals', value: d.arrivals, icon: PlaneLanding, chip: 'chip-sky' },
  ].filter((f): f is typeof f & { value: number } => f.value != null);
  const lists = [
    { key: 'professions', icon: Briefcase, items: d.professions.map((p) => ({ id: p.key, label: p.labels[ui] ?? p.labels.en ?? p.key, count: p.count })) },
    { key: 'cities', icon: MapPin, items: d.cities.map((c) => ({ id: c.city, label: c.city, count: c.count })) },
  ].filter((l) => l.items.length > 0);

  return (
    <section className={className}>
      <div className="container-x">
        <SectionHeading eyebrow={t('life.live.eyebrow')} title={t(d.period === 'current' ? 'life.live.title' : 'life.live.titlePrevious')} subtitle={MONTH_YEAR[lng](m, y)} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {figures.map((f) => (
            <div key={f.key} className="card flex items-center gap-4 rounded-2xl p-5">
              <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${f.chip}`}>
                <f.icon className="size-6" strokeWidth={1.7} aria-hidden />
              </span>
              <div className="min-w-0">
                <Counter to={f.value} className="font-display text-3xl font-semibold text-ink num" />
                <p className="text-sm leading-snug text-muted">{t(`life.live.${f.key}`)}</p>
              </div>
            </div>
          ))}
          {lists.map((l) => (
            <div key={l.key} className="card rounded-2xl p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <l.icon className="size-4 text-muted" aria-hidden /> {t(`life.live.${l.key}`)}
              </p>
              <ol className="mt-3 space-y-1.5">
                {l.items.map((it, i) => (
                  <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
                      {it.label}
                    </span>
                    <span className="shrink-0 font-semibold text-ink tabular-nums">{it.count}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">{t('life.live.note', { n: d.minCount })}</p>
      </div>
    </section>
  );
};

export default LiveNumbers;
