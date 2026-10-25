import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Minus, X } from 'lucide-react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useL10n } from '@/lib/l10n';
import type { VisaCategory } from '@/lib/types';
import { hasProcessing, hasSalary, isTrainee, useEuro } from './utils';

export const FamilyBadge = ({ value, className }: { value: boolean | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (value === true)
    return (
      <span className={clsx('badge bg-success-bg text-success-fg', className)}>
        <Check className="size-3.5" /> {t('visaDetail.facts.yes')}
      </span>
    );
  if (value === false)
    return (
      <span className={clsx('badge bg-neutral-bg text-neutral-fg', className)}>
        <X className="size-3.5" /> {t('visaDetail.facts.no')}
      </span>
    );
  return (
    <span className={clsx('badge bg-warning-bg text-warning-fg', className)}>
      <Minus className="size-3.5" /> {t('visaDetail.facts.depends')}
    </span>
  );
};

/** Visa comparison: a real table from lg up, stacked cards on phones. */
export const ComparisonTable = ({ visas }: { visas: VisaCategory[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { range } = useEuro();
  const salary = (v: VisaCategory) => (hasSalary(v) ? `${range(v.salaryMin, v.salaryMax)}${isTrainee(v) ? '*' : ''}` : t('visaDetail.facts.na'));
  const weeks = (v: VisaCategory) =>
    hasProcessing(v)
      ? t('visaDetail.facts.weeks', {
          min: v.processingMin,
          max: v.processingMax,
        })
      : t('visaDetail.facts.na');
  const c = (k: string) => t(`visasPage.compare.cols.${k}`);

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)] lg:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('visasPage.compare.caption')}</caption>
          <thead className="border-b border-line bg-sunken text-xs tracking-wide text-muted uppercase">
            <tr>
              {['visa', 'basis', 'level', 'salary', 'processing', 'family'].map((k) => (
                <th key={k} scope="col" className="px-4 py-3.5 font-semibold lg:px-5">
                  {c(k)}
                </th>
              ))}
              <th scope="col" className="w-10 px-2">
                <span className="sr-only">{t('visasPage.compare.open')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visas.map((v) => (
              <tr key={v.id} className="group transition-colors hover:bg-sunken">
                <th scope="row" className="px-4 py-3.5 lg:px-5">
                  <Link to={`/visas/${v.slug}`} className="flex items-center gap-3 font-semibold text-ink group-hover:text-link">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl chip-sky">
                      <Icon name={v.icon} className="size-4.5" />
                    </span>
                    {tr(v.title)}
                  </Link>
                </th>
                <td className="px-4 py-3.5 lg:px-5">
                  <span className="badge bg-sunken font-mono text-[11px] text-ink">{v.visaLabel}</span>
                </td>
                <td className="px-4 py-3.5 font-semibold text-ink lg:px-5">{v.germanLevel || t('visaDetail.facts.na')}</td>
                <td className="px-4 py-3.5 whitespace-nowrap text-ink tabular-nums lg:px-5">{salary(v)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap text-ink tabular-nums lg:px-5">{weeks(v)}</td>
                <td className="px-4 py-3.5 lg:px-5">
                  <FamilyBadge value={v.familyReunion} />
                </td>
                <td className="px-2">
                  <Link
                    to={`/visas/${v.slug}`}
                    aria-label={`${t('visasPage.compare.open')}: ${tr(v.title)}`}
                    className="grid size-9 place-items-center rounded-full text-link transition group-hover:bg-primary group-hover:text-primary-contrast"
                  >
                    <ArrowRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {visas.map((v) => (
          <li key={v.id}>
            <Link to={`/visas/${v.slug}`} className="card card-interactive block p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sky">
                  <Icon name={v.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{tr(v.title)}</p>
                  <p className="font-mono text-[11px] text-muted">{v.visaLabel}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-3 text-xs">
                <div>
                  <dt className="text-muted">{c('level')}</dt>
                  <dd className="font-semibold text-ink">{v.germanLevel || t('visaDetail.facts.na')}</dd>
                </div>
                <div>
                  <dt className="text-muted">{c('processing')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{weeks(v)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{c('salary')}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{salary(v)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{c('family')}</dt>
                  <dd>
                    <FamilyBadge value={v.familyReunion} className="mt-0.5 px-1.5" />
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};
