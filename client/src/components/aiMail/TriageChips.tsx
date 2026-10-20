import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { AI_FILTERS, CATEGORY_TONE, URGENCY_TONE, type AiFilter, type TriageCategory, type TriageChip, type TriageUrgency } from './api';

export const CategoryChip = ({ category, className }: { category: TriageCategory; className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold', CATEGORY_TONE[category], className)}>{t(`aiMail.category.${category}`)}</span>;
};

export const UrgencyChip = ({ urgency, className }: { urgency: TriageUrgency; className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold', URGENCY_TONE[urgency], className)}>{t(`aiMail.urgency.${urgency}`)}</span>;
};

/** Small chips on a mail list row: urgent first, then the category (nothing for skipped / failed). */
export const TriageRowChips = ({ ai }: { ai: TriageChip | null | undefined }) => {
  if (!ai || !ai.category || !['NEW', 'ACTIONED', 'DISMISSED'].includes(ai.status)) return null;
  const faded = ai.status !== 'NEW';
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1', faded && 'opacity-60')}>
      {ai.urgency === 'URGENT' && <UrgencyChip urgency="URGENT" className="px-1 py-0 text-[0.6rem]" />}
      {ai.category !== 'OTHER' && <CategoryChip category={ai.category} className="px-1 py-0 text-[0.6rem]" />}
    </span>
  );
};

/** "AI: Urgent / Candidates / Employers / …" filter chips above the mail list (one active at a time). */
export const AiFilterChips = ({ value, onChange }: { value: AiFilter | null; onChange: (v: AiFilter | null) => void }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('aiMail.title')}>
      <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-muted">
        <Sparkles className="size-3 text-brand-600" aria-hidden /> {t('aiMail.filter.label')}
      </span>
      {AI_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(value === f ? null : f)}
          aria-pressed={value === f}
          className={clsx('rounded-full border px-2 py-0.5 text-xs font-semibold', value === f ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-muted hover:text-ink')}
        >
          {t(`aiMail.filter.${f}`)}
        </button>
      ))}
    </div>
  );
};
