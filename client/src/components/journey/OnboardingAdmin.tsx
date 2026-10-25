import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Compass } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { PanelBodySkeleton } from '@/components/admin/case/TabSkeleton';
import { Panel } from '@/components/admin/ui';
import type { OnboardingResponse } from './types';

registerCopy(pagesJourney);

/** Staff view of a client's post-arrival checklist (approved cases). */
export const OnboardingAdminPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-journey', 'onboarding-case', caseId],
    queryFn: async () => (await api.get<OnboardingResponse>(`/admin/journey/onboarding/${caseId}`)).data,
    staleTime: 30_000,
  });
  const progress = data?.progress;
  return (
    <Panel
      title={t('journey.admin.onboardingCase.title')}
      icon={Compass}
      actions={progress && <span className="text-xs font-semibold text-ink">{t('journey.onboarding.progress', { done: progress.done, total: progress.total })}</span>}
      bodyClassName="p-0"
    >
      {isLoading || !data ? (
        <PanelBodySkeleton rows={2} padded />
      ) : (
        <>
          {progress && (
            <div className="h-1.5 bg-line" role="progressbar" aria-label={t('ui.progress')} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
            </div>
          )}
          {data.items.every((i) => !i.done) && <p className="px-5 pt-4 text-xs text-muted">{t('journey.admin.onboardingCase.empty')}</p>}
          <ul className="divide-y divide-line">
            {data.items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className={clsx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', i.done ? 'bg-success text-white' : 'border border-line text-transparent')} aria-hidden>
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate', i.done ? 'text-muted line-through' : 'font-medium text-ink')}>{tr(i.title)}</span>
                  <span className="block text-[11px] text-muted">
                    {i.done && i.doneAt ? t('journey.onboarding.doneAt', { date: date(i.doneAt) }) : i.dueAt ? t('journey.onboarding.due', { date: date(i.dueAt) }) : null}
                  </span>
                  {i.note && (
                    <span className="mt-1 block rounded-md bg-sunken px-2 py-1 text-xs whitespace-pre-line text-ink/80">
                      <span className="font-semibold text-muted">{t('journey.admin.onboardingCase.note')}: </span>
                      {i.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
};
