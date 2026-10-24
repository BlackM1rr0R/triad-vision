import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRightLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { TONE_CLASS } from '@/components/ui/status';
import type { CaseHandoverInfo } from './api';
import { HandoverCard } from './Handover';

registerCopy(pagesTeam);

/**
 * Case page strip: while the case is covered for an absent colleague, the handover note and checklist (the
 * substitute ticks items here); for two weeks after the return, what changed during the handover.
 * Renders nothing when the case has no handover.
 */
export default function CaseHandoverCard({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['handover-case', caseId],
    queryFn: async () => (await api.get<CaseHandoverInfo>(`/admin/handover-notes/case/${caseId}`)).data,
    staleTime: 30_000,
  });
  const h = data?.active ?? data?.returned;
  if (!h) return null;
  return (
    <section id="case-handover" aria-label={t('team.handover.caseTitle')} className={clsx('scroll-mt-40 rounded-xl p-1', data?.active ? TONE_CLASS.info : TONE_CLASS.neutral)}>
      <p className="flex items-center gap-1.5 px-3 pt-2 pb-1.5 text-xs font-semibold">
        <ArrowRightLeft className="size-3.5" aria-hidden />
        {data?.active ? t('team.handover.caseActive', { name: h.originalName ?? '—' }) : t('team.handover.caseReturned', { name: h.substituteName ?? '—' })}
      </p>
      <HandoverCard h={h} changes={data?.active ? undefined : h.changes} showCase={false} />
    </section>
  );
}
