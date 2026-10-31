import { useTranslation } from 'react-i18next';
import { DatabaseBackup } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffOps } from '@/i18n/pagesStaffOps';
import { ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/ui/Badge';
import { fmtDateTime } from '@/components/admin/labels';
import { useBackupCheck } from './api';

registerCopy(pagesStaffOps);

/** Last weekly backup restore test (deploy/backup-verify.sh → lib/ops/backupCheck), ADMIN+ (Admin → Security). */
export const BackupCheckCard = () => {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useBackupCheck();
  const check = data?.check ?? null;

  return (
    <Panel
      id="backup-check"
      title={t('staffOps.backup.title')}
      icon={DatabaseBackup}
      actions={
        check ? (
          data?.stale ? (
            <Badge tone="warning" dot>
              {t('staffOps.backup.stale', { days: data.staleDays })}
            </Badge>
          ) : (
            <Badge tone={check.status === 'ok' ? 'success' : 'danger'} dot>
              {check.status === 'ok' ? t('staffOps.backup.ok') : t('staffOps.backup.failed')}
            </Badge>
          )
        ) : undefined
      }
    >
      <p className="text-sm text-muted">{t('staffOps.backup.intro')}</p>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !check ? (
        <p className="mt-4 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm leading-relaxed text-warning-fg">{t('staffOps.backup.never')}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Item label={t('staffOps.backup.checkedAt')} value={fmtDateTime(check.checkedAt)} />
            <Item label={t('staffOps.backup.backupFile')} value={check.backupFile ?? '—'} mono />
            <Item label={t('staffOps.backup.backupAt')} value={check.backupAt ? fmtDateTime(check.backupAt) : '—'} />
            <Item
              label={`${t('staffOps.backup.tables')} · ${t('staffOps.backup.duration')}`}
              value={`${check.tables ?? '—'} · ${check.durationSec != null ? t('staffOps.backup.seconds', { count: Math.round(check.durationSec) }) : '—'}`}
            />
          </dl>
          {check.error && (
            <p className="mt-4 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg" role="alert">
              <span className="font-semibold">{t('staffOps.backup.error')}:</span> {check.error}
            </p>
          )}
          {check.counts && Object.keys(check.counts).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-xs">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">{t('staffOps.backup.table')}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{t('staffOps.backup.restored')}</th>
                    <th className="py-1.5 text-right font-medium">{t('staffOps.backup.live')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(check.counts).map(([table, c]) => (
                    <tr key={table}>
                      <td className="py-1.5 pr-3 font-mono text-ink">{table}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{c.restored.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-muted tabular-nums">{c.live != null ? c.live.toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};

const Item = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className={mono ? 'truncate font-mono text-xs text-ink' : 'font-semibold text-ink'} title={value}>
      {value}
    </dd>
  </div>
);
