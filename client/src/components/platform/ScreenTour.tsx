import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';

/**
 * Guided click-through tour of the platform (product page /platform).
 *
 * Why screenshots and not a live demo: a live demo would run the real admin pages against an API, and any
 * missing fixture or mis-routed request could reach real data of this instance. The screenshots below are the
 * visual-regression baselines (tests/visual/baseline, rendered by scripts/ci/visual.mjs where EVERY /api call is
 * answered from scripts/ci/visual-fixtures/fixtures.mjs — made-up people, example.com addresses, placeholder
 * phone numbers), converted to WebP into client/public/platform/. No request leaves the browser, so no real
 * client data can ever be shown. To refresh: re-run the visual job and convert the new baselines again.
 */
export const TOUR_STEPS = [
  { key: 'crm', src: '/platform/crm-cases.webp', w: 1366, h: 900 },
  { key: 'case', src: '/platform/case-detail.webp', w: 1366, h: 900 },
  { key: 'documents', src: '/platform/documents.webp', w: 1366, h: 900 },
  { key: 'portal', src: '/platform/client-portal.webp', w: 1366, h: 1300 },
  { key: 'mobile', src: '/platform/client-portal-mobile.webp', w: 390, h: 1500 },
  { key: 'jobs', src: '/platform/job-search.webp', w: 1366, h: 820 },
  { key: 'crmDark', src: '/platform/crm-cases-dark.webp', w: 1366, h: 900 },
] as const;

export const ScreenTour = () => {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const total = TOUR_STEPS.length;
  const step = TOUR_STEPS[i];
  const go = (n: number) => setI((n + total) % total);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  const tall = step.h > step.w;

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]" onKeyDown={onKey}>
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label={t('platform.tour.title')}>
        {TOUR_STEPS.map((s, n) => (
          <li key={s.key} className="shrink-0">
            <button
              type="button"
              onClick={() => go(n)}
              aria-current={n === i ? 'step' : undefined}
              className={clsx(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors',
                n === i ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
              )}
            >
              <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-xs', n === i ? 'bg-white/20' : 'bg-sunken')}>{n + 1}</span>
              <span className="whitespace-nowrap lg:whitespace-normal">{t(`platform.tour.steps.${s.key}.t`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <figure className="min-w-0">
        <div className={clsx('overflow-hidden rounded-2xl border border-line bg-sunken shadow-sm', tall && 'mx-auto max-w-xs')}>
          <div className="flex items-center gap-1.5 border-b border-line bg-card px-3 py-2" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className={clsx(tall ? 'max-h-[34rem]' : 'max-h-[40rem]', 'overflow-y-auto')}>
            <img src={step.src} width={step.w} height={step.h} alt={t(`platform.tour.steps.${step.key}.t`)} loading="lazy" decoding="async" className="block h-auto w-full" />
          </div>
        </div>
        <figcaption className="mt-4" aria-live="polite">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('platform.tour.step', { n: i + 1, total })}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{t(`platform.tour.steps.${step.key}.t`)}</p>
          <p className="mt-1 text-sm text-muted">{t(`platform.tour.steps.${step.key}.d`)}</p>
        </figcaption>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => go(i - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> {t('platform.tour.prev')}
          </button>
          <button type="button" className={buttonClass({})} onClick={() => go(i + 1)}>
            {t('platform.tour.next')} <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t('platform.tour.intro')}
        </p>
      </figure>
    </div>
  );
};
