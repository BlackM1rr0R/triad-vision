import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesVisualPlus } from '@/i18n/pagesVisualPlus';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

registerCopy(pagesVisualPlus);

export interface HomeStats {
  placed: number | null;
  vacancies: number;
}

/** GET /growth/home-stats: counts from the database (placement map total, open vacancies), no personal data. SSR key 'home-stats'. */
export const useHomeStats = () =>
  useQuery({ queryKey: ['home-stats'], queryFn: async () => (await api.get<HomeStats>('/growth/home-stats')).data, staleTime: 5 * 60 * 1000 });

/** "X workers placed, Y active vacancies": the numbers count up once in view. Hidden while there is nothing real to show. */
export const HomeCounters = () => {
  const { t } = useTranslation();
  const { data } = useHomeStats();
  if (!data) return null;
  const items = [
    data.placed ? { key: 'placed', value: data.placed, icon: UsersRound, chip: 'chip-sage' } : null,
    data.vacancies > 0 ? { key: 'vacancies', value: data.vacancies, icon: BriefcaseBusiness, chip: 'chip-sky' } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (!items.length) return null;
  return (
    <section className="container-x mt-4" aria-label={t('vizp.home.aria', { placed: data.placed ?? 0, vacancies: data.vacancies })}>
      <div className="card flex flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5">
        {items.map((it) => (
          <div key={it.key} className="flex min-w-0 items-center gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${it.chip}`}>
              <it.icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AnimatedNumber value={it.value} duration={1800} className="font-display text-2xl font-semibold text-ink num" />
              <p className="text-xs leading-snug text-muted sm:text-sm">{t(`vizp.home.${it.key}`)}</p>
            </div>
          </div>
        ))}
        <Link to={'/jobs'} className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          {t('vizp.home.seeJobs')} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
        <p className="w-full text-xs text-muted">{t('vizp.home.note')}</p>
      </div>
    </section>
  );
};

export default HomeCounters;
