import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ExternalLink, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { TONE_CLASS } from '@/components/ui/status';

registerCopy(pagesRecognition);

// GET /api/admin/recognition/deadlines (server lib/recognition/deadlines.ts upcomingDeadlines)
interface Row {
  source: 'RECOGNITION' | 'ACCELERATED';
  id: string;
  caseId: string;
  kind: string;
  at: string;
  note: string | null;
  daysLeft: number;
  case: { id: string; number: string; status: CaseStatus };
  client: { id: string; name: string };
  staff: { id: string; name: string } | null;
}

/** Extra section of /admin/expiring: recognition and § 81a deadlines in the period (overdue ones first). */
export const RecognitionDeadlineSection = ({ days, staffId }: { days: number; staffId: string }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['admin-recognition-deadlines', days, staffId],
    queryFn: async () => (await api.get<{ items: Row[] }>('/admin/recognition/deadlines', { params: { days, staffId: staffId || undefined } })).data.items,
    placeholderData: keepPreviousData,
  });
  const rows = q.data;
  if (!rows) return null;
  return (
    <div className={clsx('mt-6', q.isFetching && 'opacity-70')}>
      <Panel title={t('recognition.expiring.title')} icon={GraduationCap} bodyClassName="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">{t('recognition.expiring.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const anchor = r.source === 'RECOGNITION' ? 'case-recognition' : 'case-81a';
              const what = r.source === 'RECOGNITION' ? t(r.kind === 'ADAPTATION' ? 'recognition.deadline.adaptation' : 'recognition.deadline.title') : t(`accel.deadlines.kind.${r.kind}`);
              const tone = r.daysLeft < 0 ? 'danger' : r.daysLeft <= 7 ? 'warning' : 'neutral';
              return (
                <li key={`${r.source}-${r.id}-${r.kind}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className={clsx('badge whitespace-nowrap tabular-nums', TONE_CLASS[tone])}>{fmtDate(r.at)}</span>
                  <span className="badge bg-sunken text-muted">{t(r.source === 'RECOGNITION' ? 'recognition.expiring.recognition' : 'recognition.expiring.accelerated')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{what}</span>
                    <span className="block truncate text-xs text-muted">{[r.client.name, r.case.number, r.note, r.staff?.name].filter(Boolean).join(' · ')}</span>
                  </span>
                  <StatusBadge status={r.case.status} />
                  <Link to={`/admin/cases/${r.case.id}#${anchor}`} className="grid size-9 place-items-center rounded-lg text-link transition hover:bg-primary/[0.06]" aria-label={r.case.number}>
                    <ExternalLink className="size-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default RecognitionDeadlineSection;
