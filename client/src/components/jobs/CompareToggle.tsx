import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, GitCompareArrows } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesJobCompare } from '@/i18n/pagesJobCompare';
import { useL10n } from '@/lib/l10n';
import { COMPARE_MAX, compareActions, useCompareList } from './compare';
import type { PublicVacancy } from './types';
import { JobCard } from './JobCard';

registerCopy(pagesJobCompare);

/**
 * "Compare" switch of a vacancy (job card footer, vacancy page). A real checkbox for screen readers, styled as
 * a pill; a full list (3) disables the others with a hint.
 */
export const CompareToggle = ({ v, className, size = 'sm' }: { v: Pick<PublicVacancy, 'slug' | 'title' | 'city'>; className?: string; size?: 'sm' | 'md' }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const list = useCompareList();
  const on = list.some((x) => x.slug === v.slug);
  const full = !on && list.length >= COMPARE_MAX;
  return (
    <label
      className={clsx(
        'relative inline-flex cursor-pointer items-center gap-2 rounded-full border font-semibold transition-colors select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card',
        size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-sm',
        on ? 'border-primary bg-primary text-primary-contrast' : 'border-line-strong bg-card text-ink hover:bg-sunken',
        full && 'cursor-not-allowed opacity-60',
        className,
      )}
      title={full ? t('jc.full') : undefined}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        disabled={full}
        aria-describedby={full ? `cmp-full-${v.slug}` : undefined}
        onChange={() => {
          if (!compareActions.toggle({ slug: v.slug, title: v.title, city: v.city })) toast.message(t('jc.full'));
        }}
      />
      {on ? <Check className="size-3.5" aria-hidden /> : <GitCompareArrows className="size-3.5" aria-hidden />}
      <span>{on ? t('jc.added') : t('jc.toggle')}</span>
      <span className="sr-only">: {tr(v.title)}</span>
      {full && (
        <span id={`cmp-full-${v.slug}`} className="sr-only">
          {t('jc.full')}
        </span>
      )}
    </label>
  );
};

/** Job card with the compare switch in its footer strip (outside the card link: no control inside a link). */
export const ComparableJobCard = ({ v }: { v: PublicVacancy }) => (
  <div className="relative h-full">
    <JobCard v={v} className="h-full pb-16 sm:pb-[4.25rem]" />
    <CompareToggle v={v} className="absolute bottom-4 left-5 sm:left-6" />
  </div>
);

export default CompareToggle;
