import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, Grid3X3 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/components/admin/labels';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import type { ProgressMatrix as Matrix } from '../api';

/** Admin: who completed which course, with progress, average quiz score and attempts per cell. */
export const ProgressMatrix = () => {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['training', 'admin', 'progress'], queryFn: async () => (await api.get<Matrix>('/admin/training/progress')).data });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  if (!data.courses.length) return <EmptyState icon={Grid3X3} title={t('team.training.noCoursesAdmin')} />;
  return (
    <Panel title={t('team.training.matrixTitle')} icon={Grid3X3} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b border-line bg-surface/70 text-xs font-medium text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-sunken px-4 py-2">{t('team.kpi.staff')}</th>
              {data.courses.map((c) => (
                <th key={c.id} className="max-w-48 px-3 py-2 align-bottom">
                  <span className="line-clamp-2 normal-case">{c.title}</span>
                  {c.required && <span className={clsx('mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px]', TONE_CLASS.warning)}>{t('team.training.required')}</span>}
                  {!c.published && <span className={clsx('mt-1 ml-1 inline-block rounded-full px-1.5 py-0.5 text-[9px]', TONE_CLASS.neutral)}>{t('team.training.draft')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((r) => (
              <tr key={r.user.id}>
                <td className="sticky left-0 z-10 bg-card px-4 py-2 font-semibold whitespace-nowrap text-ink">
                  {r.user.firstName} {r.user.lastName}
                  <span className="ml-1 font-normal text-muted">· {t(`team.roles.${r.user.role}`)}</span>
                </td>
                {data.courses.map((c) => {
                  const cell = r.cells[c.id];
                  if (!cell?.applies) return <td key={c.id} className="px-3 py-2 text-muted">—</td>;
                  return (
                    <td key={c.id} className="px-3 py-2">
                      {cell.complete ? (
                        <span className={clsx('inline-flex items-center gap-1 font-semibold', TONE_TEXT.success)} title={cell.completedAt ? fmtDate(cell.completedAt) : undefined}>
                          <CheckCircle2 className="size-3.5" aria-hidden /> {t('team.training.completed')}
                        </span>
                      ) : (
                        <span className={clsx('font-semibold tabular-nums', cell.completed === 0 && c.required ? TONE_TEXT.danger : 'text-ink')}>
                          {cell.completed}/{cell.lessons}
                        </span>
                      )}
                      <span className="block text-[11px] text-muted">
                        {cell.avgScore !== null ? t('team.training.avgScore', { score: cell.avgScore }) : ''}
                        {cell.attempts ? `${cell.avgScore !== null ? ' · ' : ''}${t('team.training.attempts', { count: cell.attempts })}` : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};
