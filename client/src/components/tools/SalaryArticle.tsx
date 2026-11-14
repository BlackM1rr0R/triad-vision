import { useMemo } from 'react';
import { ContentArticle, ContentTable, useContentLocale } from '@/components/seo/ContentArticle';
import { calculateSalary, CURRENT_PARAMS, DEFAULT_INPUT, STATE_NAMES, type TaxClass } from '@/lib/salary';
import { SALARY_EXAMPLES, salaryContent } from '@/lib/seoContent/salary';
import { CONTENT_CHECKED, formatEuro, formatPercent, MONTH_YEAR, type ContentLocale } from '@/lib/seoContent/types';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** Every {{placeholder}} of lib/seoContent/salary.ts, from the payroll parameters and the payroll engine. */
export const salaryVars = (lng: ContentLocale): Record<string, string> => {
  const P = CURRENT_PARAMS.payroll;
  const costs = CURRENT_PARAMS.costs;
  const eur = (n: number, cents = false) => formatEuro(n, lng, cents);
  const net = (taxClass: TaxClass) => calculateSalary({ ...DEFAULT_INPUT, gross: 3_000, period: 'month', taxClass, state: 'NW' }).monthly.net;
  const n1 = net(1);
  const n6 = net(6);
  return {
    gfb: eur(P.tax.gfb),
    anp: eur(P.tax.anp),
    soliFree: eur(P.soli.freigrenze),
    bbgRv: eur(P.social.bbgRvAlvYear),
    bbgRvMonth: eur(P.social.bbgRvAlvYear / 12, P.social.bbgRvAlvYear % 12 !== 0),
    bbgKv: eur(P.social.bbgKvPvYear),
    bbgKvMonth: eur(P.social.bbgKvPvYear / 12, P.social.bbgKvPvYear % 12 !== 0),
    jaeg: eur(P.social.jaegYear),
    jaegMonth: eur(P.social.jaegYear / 12, P.social.jaegYear % 12 !== 0),
    minijob: eur(P.minijobUpTo),
    midijob: eur(P.midijobUpTo),
    zusatz: formatPercent(P.social.averageZusatzbeitrag, lng),
    zusatzHalf: formatPercent(P.social.averageZusatzbeitrag / 2, lng, 2),
    kindergeld: eur(costs.kindergeld),
    gross3000: eur(3_000),
    net3000: eur(Math.round(n1)),
    net3000VI: eur(Math.round(n6)),
    diffVI: eur(Math.round(n1) - Math.round(n6)),
    share3000: formatPercent(n1 / 3_000, lng, 0),
    checked: MONTH_YEAR[lng](CONTENT_CHECKED.month, CONTENT_CHECKED.year),
  };
};

/** Article under the net salary calculator; the examples table is computed with the calculator's own engine. */
export const SalaryArticle = () => {
  const lng = useContentLocale();
  const vars = useMemo(() => salaryVars(lng), [lng]);
  const l = salaryContent[lng].labels!;
  const rows = SALARY_EXAMPLES.map((ex) => {
    const r = calculateSalary({ ...DEFAULT_INPUT, gross: ex.gross, period: 'month', taxClass: ex.taxClass, state: ex.state, children: ex.children, age: ex.age });
    const situation = `${l.class} ${ROMAN[ex.taxClass]} · ${STATE_NAMES[ex.state]} · ${ex.children ? l.child : l.noChild}`;
    return [l[ex.id], situation, formatEuro(ex.gross, lng), formatEuro(r.monthly.net, lng, true), formatPercent(r.deductionRate, lng)];
  });
  return (
    <ContentArticle
      content={salaryContent}
      vars={vars}
      slots={{ examples: <ContentTable head={[l.job, l.situation, l.gross, l.net, l.deductions]} rows={rows} /> }}
    />
  );
};
