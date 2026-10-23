import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useL10n } from '@/lib/l10n';
import type { Service } from '@/lib/types';
import { servicePhase } from '@/components/visa/utils';

const Mark = ({ on, label }: { on: boolean; label: string }) => (
  <span
    className={clsx('inline-grid size-7 place-items-center rounded-full', on ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-300')}
    title={label}
  >
    {on ? <Check className="size-4" strokeWidth={3} /> : <Minus className="size-4" />}
    <span className="sr-only">{label}</span>
  </span>
);

/** Which services are for companies vs. candidates, with stage and duration. Table from md up, cards below. */
export const ServiceMatrix = ({ services }: { services: Service[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const phases = t('servicesPage.journey.phases', { returnObjects: true }) as {
    title: string;
  }[];
  const forCompany = (s: Service) => s.audience !== 'candidate';
  const forCandidate = (s: Service) => s.audience !== 'company';
  const inc = t('servicesPage.matrix.included');
  const exc = t('servicesPage.matrix.notIncluded');
  const col = (k: string) => t(`servicesPage.matrix.cols.${k}`);

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_30px_-12px_rgba(11,31,68,0.18)] md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('servicesPage.matrix.caption')}</caption>
          <thead>
            <tr className="border-b border-line bg-surface text-xs tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-3.5 font-semibold">
                {col('service')}
              </th>
              <th scope="col" className="px-3 py-3.5 text-center font-semibold">
                {col('company')}
              </th>
              <th scope="col" className="px-3 py-3.5 text-center font-semibold">
                {col('candidate')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold">
                {col('phase')}
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold">
                {col('duration')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {services.map((s) => {
              const p = servicePhase(s.slug);
              return (
                <tr key={s.id} className="group transition-colors hover:bg-brand-50/50">
                  <th scope="row" className="px-5 py-3">
                    <Link to={`/services/${s.slug}`} className="flex items-center gap-3 font-bold text-navy-900 group-hover:text-brand-700">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-900 text-white">
                        <Icon name={s.icon} className="size-4" />
                      </span>
                      {tr(s.title)}
                    </Link>
                  </th>
                  <td className="px-3 py-3 text-center">
                    <Mark on={forCompany(s)} label={forCompany(s) ? inc : exc} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Mark on={forCandidate(s)} label={forCandidate(s) ? inc : exc} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-navy-900">
                      <span className="flex gap-0.5" aria-hidden>
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className={clsx('h-1.5 w-3 rounded-full', i === p ? 'bg-brand-600' : i < p ? 'bg-brand-200' : 'bg-line')} />
                        ))}
                      </span>
                      {phases[p]?.title}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{tr(s.duration) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {services.map((s) => (
          <li key={s.id}>
            <Link to={`/services/${s.slug}`} className="card flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-900 text-white">
                <Icon name={s.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy-900">{tr(s.title)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {phases[servicePhase(s.slug)]?.title}
                  {tr(s.duration) && ` · ${tr(s.duration)}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {forCompany(s) && <span className="badge bg-brand-50 text-brand-700">{col('company')}</span>}
                  {forCandidate(s) && <span className="badge bg-success-bg text-success-fg">{col('candidate')}</span>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};
