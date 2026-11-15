import { useMemo } from 'react';
import { ContentArticle, useContentLocale } from '@/components/seo/ContentArticle';
import { lifeContent } from '@/lib/seoContent/life';
import { CONTENT_CHECKED, MONTH_YEAR, formatEuro } from '@/lib/seoContent/types';
import { formatAzn, type LifeConfig } from './api';

/** Fallbacks while the config is not there (same values as server/src/lib/budget/params.ts, life/settings.ts). */
const FALLBACK = { deutschlandticket: 63, rundfunk: 18.36, kindergeld: 259 };
const NATIONAL_FALLBACK = { grossAzn: 1_102.9, year: 2025 };

/** Text and FAQ under the simulator; figures from the simulator's config (server-rendered with the page). */
export const LifeArticle = ({ config }: { config: LifeConfig | undefined }) => {
  const lng = useContentLocale();
  const vars = useMemo(() => {
    const p = config?.params ?? FALLBACK;
    const nat = config?.baku.nationalAverage.grossAzn ? config.baku.nationalAverage : NATIONAL_FALLBACK;
    return {
      ticket: formatEuro(p.deutschlandticket, lng),
      rundfunk: formatEuro(p.rundfunk, lng, true),
      kindergeld: formatEuro(p.kindergeld, lng),
      avgAzn: formatAzn(nat.grossAzn ?? NATIONAL_FALLBACK.grossAzn, lng),
      avgYear: String(nat.year),
      checked: MONTH_YEAR[lng](CONTENT_CHECKED.month, CONTENT_CHECKED.year),
    };
  }, [config, lng]);
  return <ContentArticle content={lifeContent} vars={vars} className="section border-t border-line" />;
};
