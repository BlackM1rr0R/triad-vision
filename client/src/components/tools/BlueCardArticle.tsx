import { ContentArticle, ContentTable, useContentLocale } from '@/components/seo/ContentArticle';
import { calculateSalary, CURRENT_PARAMS, DEFAULT_INPUT } from '@/lib/salary';
import { BLUE_CARD_HISTORY, blueCardContent } from '@/lib/seoContent/blueCard';
import { CONTENT_CHECKED, formatEuro, MONTH_YEAR, type ContentLocale } from '@/lib/seoContent/types';

/** § 18g Abs. 1 / 2 AufenthG: 50 % and 45.3 % of the yearly pension contribution ceiling; § 18 Abs. 2 Nr. 5: 55 %. */
export const blueCardThresholds = (bbg: number) => ({
  standard: Math.round(bbg * 0.5 * 100) / 100,
  shortage: Math.round(bbg * 0.453 * 100) / 100,
  older: Math.round(bbg * 0.55 * 100) / 100,
});

const money = (n: number, lng: ContentLocale) => formatEuro(n, lng, !Number.isInteger(n));

/** Placeholders of lib/seoContent/blueCard.ts for the current year's ceiling. */
export const blueCardVars = (lng: ContentLocale): Record<string, string> => {
  const bbg = CURRENT_PARAMS.payroll.social.bbgRvAlvYear;
  const t = blueCardThresholds(bbg);
  const net = calculateSalary({ ...DEFAULT_INPUT, gross: t.standard, period: 'year', taxClass: 1 }).monthly.net;
  return {
    bbg: money(bbg, lng),
    standard: money(t.standard, lng),
    shortage: money(t.shortage, lng),
    older: money(t.older, lng),
    standardMonth: formatEuro(t.standard / 12, lng, t.standard % 12 !== 0),
    shortageMonth: formatEuro(t.shortage / 12, lng, true),
    netStandard: formatEuro(Math.round(net), lng),
    checked: MONTH_YEAR[lng](CONTENT_CHECKED.month, CONTENT_CHECKED.year),
  };
};

/** Thresholds 2026, how they are derived (with earlier years), shortage groups and FAQ under the Blue Card check. */
export const BlueCardArticle = () => {
  const lng = useContentLocale();
  const l = blueCardContent[lng].labels!;
  const years = [...BLUE_CARD_HISTORY, { year: CURRENT_PARAMS.payroll.year, bbg: CURRENT_PARAMS.payroll.social.bbgRvAlvYear }];
  const rows = years.map(({ year, bbg }) => {
    const t = blueCardThresholds(bbg);
    return [String(year), money(bbg, lng), money(t.standard, lng), money(t.shortage, lng)];
  });
  return (
    <ContentArticle
      content={blueCardContent}
      vars={blueCardVars(lng)}
      slots={{ history: <ContentTable head={[l.year, l.bbg, l.standard, l.shortage]} rows={rows} /> }}
      className="section bg-sunken"
    />
  );
};
