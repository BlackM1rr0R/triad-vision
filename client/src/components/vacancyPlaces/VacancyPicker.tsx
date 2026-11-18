import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, Info } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesVacancyPlaces } from '@/i18n/pagesVacancyPlaces';
import { isFull } from './api';

registerCopy(pagesVacancyPlaces);

/** One entry of GET /api/vacancies/options (open vacancies, full ones last). */
export interface VacancyOption {
  id: string;
  slug: string;
  title: L10n;
  city: string | null;
  employmentType?: string;
  /** Visa category the vacancy belongs to (GET /api/vacancies/options). */
  visaCategoryId?: string | null;
  positions: number;
  filled?: number;
  free?: number;
}

/** "Fahrer · Hamburg · 3 boş yer" / "Fahrer · Hamburg — yer qalmayıb". */
export const useVacancyOptionLabel = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (v: VacancyOption) => {
    const base = `${tr(v.title)}${v.city ? ` · ${v.city}` : ''}`;
    if (isFull(v)) return t('vacPlaces.start.fullOption', { title: base });
    return v.free !== undefined ? `${base} · ${t('vacPlaces.left', { count: v.free })}` : base;
  };
};

/**
 * The client's only choice when "clients can only apply to active vacancies" is on: one of our open vacancies with a
 * free place (full ones are listed but cannot be picked). The visa type comes from the vacancy on the server.
 */
export const VacancyOnlyPicker = ({
  id,
  vacancies,
  loading,
  hasOpen,
  value,
  onChange,
}: {
  id: string;
  vacancies: VacancyOption[];
  loading: boolean;
  hasOpen: boolean;
  value: string;
  onChange: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const label = useVacancyOptionLabel();
  if (loading) return <Spinner className="size-5 text-primary" />;
  if (!hasOpen) {
    return (
      <div className="rounded-2xl border border-line bg-sunken p-4 text-sm text-ink" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <Info className="size-4 text-muted" aria-hidden /> {t('vacPlaces.start.none')}
        </p>
        <Link to="/jobs" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-link hover:text-link-hover">
          <Briefcase className="size-4" aria-hidden /> {t('vacPlaces.start.seeJobs')}
        </Link>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="label">
        {t('vacPlaces.start.label')}
      </label>
      <select id={id} className="input" value={value} required onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`}>
        <option value="">{t('vacPlaces.start.choose')}</option>
        {vacancies.map((v) => (
          <option key={v.id} value={v.id} disabled={isFull(v)}>
            {label(v)}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-muted">
        {t('vacPlaces.start.hint')}{' '}
        <Link to="/jobs" className="font-semibold text-link hover:text-link-hover">
          {t('vacPlaces.start.seeJobs')}
        </Link>
      </p>
    </div>
  );
};
