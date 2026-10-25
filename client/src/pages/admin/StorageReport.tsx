import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, Database, FolderOpen, HardDrive, ShieldCheck } from 'lucide-react';
import { api, errorCode, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOriginals } from '@/i18n/pagesOriginals';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, LoadingBlock, PageHead, Panel, StatTile, Switch } from '@/components/admin/ui';
import { BarChart, BarList } from '@/components/admin/charts';
import { driveFolderHref } from '@/components/originals/api';

registerCopy(pagesOriginals);

interface Report {
  totals: { bytes: number; files: number; folders: number; versionsBytes: number; versions: number; trashBytes: number; allBytes: number };
  sections: { key: string; id: string; name: string; bytes: number; files: number }[];
  topFolders: { id: string; name: string; path: string; bytes: number; files: number }[];
  byUploader: { id: string | null; name: string | null; bytes: number; files: number }[];
  byType: { type: string; bytes: number; files: number }[];
  largestFiles: { id: string; name: string; parentId: string | null; path: string; bytes: number; createdBy: string | null }[];
  trash: { files: number; bytes: number };
  versions: { bytes: number; count: number };
  growth: { month: string; bytes: number; files: number }[];
}

interface RetentionRow {
  caseId: string;
  caseNumber: string;
  clientName: string;
  folderId: string;
  folderName: string;
  closedAt: string;
  archiveAt: string;
  purgeAt: string;
  legalHold: boolean;
  skipReason: string | null;
}

interface Preview {
  settings: { archiveMonths: number; deleteMonths: number };
  caseDocuments: { months: number };
  days: number;
  archive: RetentionRow[];
  purge: RetentionRow[];
  archivedTotal: number;
  legalHolds: number;
}

const TONES = ['bg-chart-1', 'bg-chart-3', 'bg-chart-2', 'bg-chart-4', 'bg-chart-5', 'bg-chart-7', 'bg-chart-8', 'bg-chart-6'];

const RetentionSection = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['retention-drive-preview'], queryFn: async () => (await api.get<Preview>('/originals/retention/preview')).data });
  const [form, setForm] = useState({ archiveMonths: 6, deleteMonths: 36 });
  useEffect(() => {
    if (preview.data) setForm(preview.data.settings);
  }, [preview.data]);
  const save = useMutation({
    mutationFn: async () => api.put('/originals/retention/settings', form),
    onSuccess: () => {
      toast.success(t('originals.saved'));
      void qc.invalidateQueries({ queryKey: ['retention-drive-preview'] });
    },
    onError: (err) => toast.error(errorCode(err) === 'VALIDATION' ? t('originals.retention.invalid') : t('originals.error')),
  });
  const hold = useMutation({
    mutationFn: async (v: { folderId: string; hold: boolean }) => api.put('/originals/retention/legal-hold', v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['retention-drive-preview'] }),
    onError: () => toast.error(t('originals.error')),
  });
  const p = preview.data;
  const valid = form.deleteMonths > form.archiveMonths;

  const table = (rows: RetentionRow[], dateKey: 'archiveAt' | 'purgeAt') =>
    rows.length === 0 ? (
      <p className="text-sm text-muted">{t('originals.retention.none')}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-semibold">{t('originals.cols.client')}</th>
              <th className="py-2 pr-3 font-semibold">{t('originals.retention.closedAt')}</th>
              <th className="py-2 pr-3 font-semibold">{t(`originals.retention.${dateKey}`)}</th>
              <th className="py-2 pr-3 font-semibold">{t('originals.retention.hold')}</th>
              <th className="py-2 font-semibold">
                <span className="sr-only">{t('originals.storage.open')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.folderId}>
                <td className="py-2 pr-3">
                  <Link to={`/admin/cases/${r.caseId}`} className="font-medium text-ink hover:underline">
                    {r.clientName}
                  </Link>
                  <span className="block code-id text-[11px] text-muted">{r.caseNumber}</span>
                  {r.skipReason && <span className="block text-[11px] text-warning-fg">{t(`originals.retention.skip.${r.skipReason}`)}</span>}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{date(r.closedAt)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{date(r[dateKey])}</td>
                <td className="py-2 pr-3">
                  <Switch checked={r.legalHold} disabled={hold.isPending} onChange={(v) => hold.mutate({ folderId: r.folderId, hold: v })} label={`${t('originals.retention.hold')}: ${r.clientName}`} />
                </td>
                <td className="py-2">
                  <Link to={driveFolderHref(r.folderId)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline">
                    <FolderOpen className="size-3.5" aria-hidden /> {t('originals.storage.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <Panel id="retention" title={t('originals.retention.title')} icon={ShieldCheck}>
      <p className="mb-4 text-sm text-muted">{t('originals.retention.subtitle')}</p>
      {preview.isLoading ? (
        <LoadingBlock className="min-h-[10vh]" />
      ) : preview.error || !p ? (
        <ErrorBlock error={preview.error} onRetry={() => void preview.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="label mb-1 block">{t('originals.retention.archiveMonths')}</span>
              <input className="input" type="number" min={1} max={120} value={form.archiveMonths} onChange={(e) => setForm((f) => ({ ...f, archiveMonths: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="label mb-1 block">{t('originals.retention.deleteMonths')}</span>
              <input className="input" type="number" min={2} max={240} value={form.deleteMonths} onChange={(e) => setForm((f) => ({ ...f, deleteMonths: Number(e.target.value) }))} />
            </label>
            <button type="button" className="btn-primary btn-sm min-h-10" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {t('originals.retention.save')}
            </button>
          </div>
          {!valid && <p className="text-xs text-danger-fg">{t('originals.retention.invalid')}</p>}
          <div className="rounded-lg bg-surface/60 p-3 text-xs text-muted">
            <p className="font-semibold text-ink">{t('originals.retention.caseDocs', { count: p.caseDocuments.months })}</p>
            <p>{t('originals.retention.caseDocsHint')}</p>
            {form.deleteMonths < p.caseDocuments.months && <p className="mt-1 font-semibold text-warning-fg">{t('originals.retention.tooShort')}</p>}
            <p className="mt-1">
              {t('originals.retention.archivedTotal', { count: p.archivedTotal })} · {t('originals.retention.legalHolds', { count: p.legalHolds })}
            </p>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Archive className="size-4 text-muted" aria-hidden /> {t('originals.retention.toArchive')} · {t('originals.retention.preview', { count: p.days })}
            </h3>
            {table(p.archive, 'archiveAt')}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('originals.retention.toPurge')} · {t('originals.retention.preview', { count: p.days })}
            </h3>
            {table(p.purge, 'purgeAt')}
          </div>
        </div>
      )}
    </Panel>
  );
};

/** /admin/storage — drive storage report (ADMIN+) and the drive retention settings / preview. */
const StorageReport = () => {
  const { t } = useTranslation();
  usePageTitle(t('originals.storage.title'));
  const q = useQuery({ queryKey: ['storage-report'], queryFn: async () => (await api.get<Report>('/originals/storage-report')).data, staleTime: 60_000 });
  const r = q.data;

  return (
    <div className="space-y-6">
      <PageHead title={t('originals.storage.title')} subtitle={t('originals.storage.subtitle')} />
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error || !r ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t('originals.storage.total')} value={formatBytes(r.totals.bytes)} hint={t('originals.storage.files', { count: r.totals.files })} />
            <StatTile label={t('originals.storage.versions')} value={formatBytes(r.versions.bytes)} hint={t('originals.storage.files', { count: r.versions.count })} />
            <StatTile label={t('originals.storage.trash')} value={formatBytes(r.trash.bytes)} hint={t('originals.storage.files', { count: r.trash.files })} />
            <StatTile label={t('originals.storage.all')} value={formatBytes(r.totals.allBytes)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={t('originals.storage.sections')} icon={HardDrive}>
              <BarList
                format={formatBytes}
                rows={r.sections
                  .filter((s) => s.bytes > 0 || s.key !== 'other')
                  .map((s, i) => ({
                    key: s.key,
                    label: s.id ? (
                      <Link to={driveFolderHref(s.id)} className="hover:underline">
                        {s.name || t(`originals.storage.sectionNames.${s.key}`, { defaultValue: s.key })}
                      </Link>
                    ) : (
                      t(`originals.storage.sectionNames.${s.key}`, { defaultValue: s.key })
                    ),
                    value: s.bytes,
                    tone: TONES[i % TONES.length],
                  }))}
              />
            </Panel>
            <Panel title={t('originals.storage.types')} icon={Database}>
              <BarList format={formatBytes} rows={r.byType.map((x, i) => ({ key: x.type, label: `${t(`originals.storage.typeNames.${x.type}`, { defaultValue: x.type })} · ${x.files}`, value: x.bytes, tone: TONES[i % TONES.length] }))} />
            </Panel>
            <Panel title={t('originals.storage.uploaders')}>
              <BarList format={formatBytes} rows={r.byUploader.slice(0, 15).map((u, i) => ({ key: u.id ?? 'none', label: `${u.name ?? t('originals.storage.unknown')} · ${u.files}`, value: u.bytes, tone: TONES[i % TONES.length] }))} />
            </Panel>
            <Panel title={t('originals.storage.growth')}>
              <BarChart bars={r.growth.map((g) => ({ label: g.month.slice(2), title: g.month, value: g.bytes }))} format={formatBytes} axisFormat={formatBytes} ariaLabel={t('originals.storage.growth')} tableLabel={t('originals.storage.size')} />
            </Panel>
          </div>

          <Panel title={t('originals.storage.topFolders')} icon={FolderOpen} bodyClassName="p-0">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-sunken text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('originals.storage.name')}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t('originals.storage.size')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.topFolders.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-2">
                        <Link to={driveFolderHref(f.id)} className="font-medium text-ink hover:underline">
                          {f.name}
                        </Link>
                        <span className="block truncate text-[11px] text-muted">{f.path}</span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                        {formatBytes(f.bytes)}
                        <span className="block text-[11px] text-muted">{t('originals.storage.files', { count: f.files })}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={t('originals.storage.largest')} bodyClassName="p-0">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-sunken text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('originals.storage.name')}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t('originals.storage.size')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.largestFiles.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-2">
                        {f.parentId ? (
                          <Link to={`${driveFolderHref(f.parentId)}?${new URLSearchParams({ item: f.id })}`} className="font-medium text-ink hover:underline">
                            {f.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{f.name}</span>
                        )}
                        <span className="block truncate text-[11px] text-muted">
                          {f.path}
                          {f.createdBy ? ` · ${f.createdBy}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{formatBytes(f.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      <RetentionSection />
    </div>
  );
};

export default StorageReport;
