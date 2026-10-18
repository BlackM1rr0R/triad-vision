import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Download, ExternalLink, History, Info, RotateCcw, Shield, Users, X } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { docStatusLabel, fmtDateTime, fullName, roleLabel, stageLabel, statusLabel } from '@/components/admin/labels';
import type { CaseStatus, DocStage, DocStatus } from '@/lib/types';
import { contentUrl, driveKeys, versionUrl } from './api';
import { ItemIcon } from './fileIcons';
import { crumbLabel, displayName, typeLabel } from './labels';
import { can, type AccessResponse, type DriveItem, type NodeDetails, type VersionRow } from './types';

const Def = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-xs">
    <dt className="text-muted">{label}</dt>
    <dd className="min-w-0 break-words text-ink">{children}</dd>
  </div>
);

const TextPreview = ({ id }: { id: string }) => {
  const q = useQuery({
    queryKey: ['drive', 'text', id],
    queryFn: async () => (await api.get<string>(contentUrl(id).replace(/^\/api/, ''), { responseType: 'text', transformResponse: (x) => x })).data,
    staleTime: 60_000,
  });
  if (!q.data) return null;
  return <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-surface p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink">{q.data.slice(0, 20_000)}</pre>;
};

export const DetailsPanel = ({
  subject,
  multi,
  myId,
  trashDays,
  onClose,
  onShare,
  onRestoreVersion,
  onPreview,
}: {
  subject: DriveItem | null;
  multi: DriveItem[];
  myId: string;
  trashDays: number;
  onClose: () => void;
  onShare: (item: DriveItem) => void;
  onRestoreVersion: (item: DriveItem, v: VersionRow) => void;
  onPreview: (item: DriveItem) => void;
}) => {
  const { t } = useTranslation();
  const id = subject?.id ?? null;
  const details = useQuery({
    queryKey: driveKeys.node(id ?? ''),
    queryFn: async () => (await api.get<NodeDetails>(`/drive/nodes/${encodeURIComponent(id!)}`)).data,
    enabled: !!id,
  });
  const access = useQuery({
    queryKey: driveKeys.access(id ?? ''),
    queryFn: async () => (await api.get<AccessResponse>(`/drive/nodes/${encodeURIComponent(id!)}/access`)).data,
    enabled: !!id,
  });
  const [imgFailed, setImgFailed] = useState<string | null>(null);

  const header = (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Info className="size-4 text-brand-600" /> {t('drive.details.title')}
      </h2>
      <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('drive.dialogs.close')}>
        <X className="size-4" />
      </button>
    </div>
  );

  if (multi.length > 1) {
    const bytes = multi.reduce((a, i) => a + (i.size ?? 0), 0);
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="p-5 text-sm text-ink">
          <p className="font-semibold">{t('drive.details.multi', { count: multi.length })}</p>
          <p className="mt-1 text-muted">{t('drive.details.totalSize', { size: formatBytes(bytes) })}</p>
        </div>
      </div>
    );
  }
  if (!subject) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <p className="p-6 text-center text-sm text-muted">{t('drive.details.noSelection')}</p>
      </div>
    );
  }

  const item = details.data?.item ?? subject;
  const d = details.data?.details;
  const isImage = item.kind === 'FILE' && item.previewable && item.mimeType?.startsWith('image/');
  const isText = item.kind === 'FILE' && item.previewable && item.mimeType?.startsWith('text/');
  const isPdf = item.kind === 'FILE' && item.mimeType === 'application/pdf';
  const path = details.data?.path ?? [];
  const a = access.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Preview */}
        <div className="border-b border-line bg-surface/60 p-4">
          {isImage && imgFailed !== item.id ? (
            <button type="button" onClick={() => onPreview(item)} className="block w-full">
              <img src={contentUrl(item.id)} alt="" onError={() => setImgFailed(item.id)} className="mx-auto max-h-56 rounded-lg border border-line object-contain shadow-sm" />
            </button>
          ) : isText ? (
            <TextPreview id={item.id} />
          ) : (
            <div className="grid place-items-center py-4">
              <ItemIcon item={item} className="size-20" />
            </div>
          )}
          <p className="mt-3 text-center text-sm font-semibold break-words text-ink">{displayName(item, t, myId)}</p>
          <p className="text-center text-xs text-muted">{typeLabel(item, t)}</p>
          {item.kind === 'FILE' && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {(isPdf || isText) && item.previewable && (
                <a href={contentUrl(item.id)} target="_blank" rel="noopener noreferrer" className="btn-white btn-sm border border-line">
                  <ExternalLink className="size-3.5" /> {t('drive.details.openPreview')}
                </a>
              )}
              {can(item.myAccess, 'DOWNLOAD') && (
                <a href={contentUrl(item.id, true)} className="btn-white btn-sm border border-line" download>
                  <Download className="size-3.5" /> {t('drive.actions.download')}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Properties */}
        <dl className="border-b border-line px-4 py-3">
          {item.caseNumber && (
            <>
              <Def label={t('drive.details.caseNumber')}>{item.caseNumber}</Def>
              {item.caseStatus && <Def label={t('drive.details.caseStatus')}>{statusLabel(item.caseStatus as CaseStatus)}</Def>}
              {item.stage && <Def label={t('drive.details.stage')}>{stageLabel(item.stage as DocStage)}</Def>}
              {item.docStatus && <Def label={t('drive.details.docStatus')}>{docStatusLabel(item.docStatus as DocStatus)}</Def>}
            </>
          )}
          {item.kind === 'FILE' && <Def label={t('drive.details.size')}>{formatBytes(item.size ?? 0)}</Def>}
          {d?.totals && <Def label={t('drive.details.size')}>{`${formatBytes(d.totals.bytes)} · ${t('drive.details.contains', { files: d.totals.files, folders: d.totals.folders })}`}</Def>}
          {path.length > 1 && (
            <Def label={t('drive.details.location')}>
              {path
                .slice(0, -1)
                .map((c) => crumbLabel(c, t, myId))
                .join(' › ')}
            </Def>
          )}
          <Def label={t('drive.details.created')}>{fmtDateTime(item.createdAt)}</Def>
          {item.createdBy && <Def label={t('drive.details.createdBy')}>{fullName(item.createdBy)}</Def>}
          <Def label={t('drive.details.modified')}>{fmtDateTime(item.updatedAt)}</Def>
          {d?.modifiedBy && item.kind === 'FILE' && item.version > 1 && <Def label={t('drive.details.modifiedBy')}>{fullName(d.modifiedBy)}</Def>}
          {item.kind === 'FILE' && <Def label={t('drive.details.version')}>{item.version}</Def>}
          <Def label={t('drive.details.myAccess')}>{t(`drive.levels.${item.myAccess}`)}</Def>
          {d?.deletedAt && <Def label={t('drive.details.deletedAt')}>{fmtDateTime(d.deletedAt)}</Def>}
          {d?.deletedBy && <Def label={t('drive.details.deletedBy')}>{fullName(d.deletedBy)}</Def>}
        </dl>
        {item.caseId && (
          <div className="border-b border-line px-4 py-3 text-xs text-muted">
            <p>{item.kind === 'FILE' ? t('drive.shared.caseDoc', { number: item.caseNumber }) : t('drive.shared.clientFolderBanner', { number: item.caseNumber })}</p>
            <Link to={`/admin/cases/${item.caseId}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
              <ExternalLink className="size-3.5" /> {t('drive.actions.openCase')}
            </Link>
          </div>
        )}

        {/* Access: the whole team edits everything; only people who can manage a folder see the details. */}
        {a && !a.canManage && a.myAccess && (a.myAccess === 'EDIT' || a.myAccess === 'MANAGE') && (
          <p className="flex items-center gap-1.5 border-b border-line px-4 py-3 text-xs text-muted">
            <Users className="size-3.5 shrink-0" /> {t('drive.shared.teamEdits')}
          </p>
        )}
        {a && a.canManage && (
          <section className="border-b border-line px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                <Shield className="size-3.5" /> {t('drive.details.access')}
              </h3>
              <button type="button" onClick={() => onShare(item)} className="text-xs font-semibold text-brand-600 hover:underline">
                {a.canManage ? t('drive.details.manageAccess') : t('drive.details.viewAccess')}
              </button>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center justify-between gap-2">
                <span className="truncate text-ink">{t('drive.share.superAdmins')}</span>
                <span className="shrink-0 text-muted">{t('drive.levels.MANAGE')}</span>
              </li>
              {a.implicit.owner && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">
                    {fullName(a.implicit.owner)} · {t('drive.share.owner')}
                  </span>
                  <span className="shrink-0 text-muted">{t('drive.levels.MANAGE')}</span>
                </li>
              )}
              {a.implicit.assignedStaff && (
                <li className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">
                    {fullName(a.implicit.assignedStaff)} · {t('drive.share.assignedStaff')}
                  </span>
                  <span className="shrink-0 text-muted">{t('drive.levels.DOWNLOAD')}</span>
                </li>
              )}
              {a.entries.slice(0, 8).map((e) => (
                <li key={e.grantId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-ink">
                    {e.role ? <Users className="size-3 shrink-0 text-muted" /> : null}
                    {e.user ? fullName(e.user) : e.role ? t(`drive.share.role${e.role}`, { defaultValue: roleLabel(e.role) }) : '—'}
                    {e.inherited && <span className="truncate text-muted">· {t('drive.share.inherited')}</span>}
                  </span>
                  <span className="shrink-0 text-muted">{t(`drive.levels.${e.access}`)}</span>
                </li>
              ))}
              {a.entries.length > 8 && <li className="text-muted">+{a.entries.length - 8}</li>}
            </ul>
          </section>
        )}

        {/* Versions */}
        {item.kind === 'FILE' && (
          <section className="px-4 py-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
              <History className="size-3.5" /> {t('drive.details.versions')}
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-2 py-1.5 dark:bg-brand-500/10">
                <span className="font-semibold text-ink">
                  {t('drive.details.versionN', { version: item.version })} · {t('drive.details.current')}
                </span>
                <span className="text-muted">{formatBytes(item.size ?? 0)}</span>
              </li>
              {d?.versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{t('drive.details.versionN', { version: v.version })}</span>
                    <span className="block truncate text-muted">
                      {fmtDateTime(v.createdAt)}
                      {v.uploadedBy ? ` · ${fullName(v.uploadedBy)}` : ''} · {formatBytes(v.size)}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {can(item.myAccess, 'DOWNLOAD') && (
                      <a href={versionUrl(item.id, v.id)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-card hover:text-brand-600" title={t('drive.details.downloadVersion')} aria-label={t('drive.details.downloadVersion')}>
                        <Download className="size-3.5" />
                      </a>
                    )}
                    {can(item.myAccess, 'EDIT') && (
                      <button type="button" onClick={() => onRestoreVersion(item, v)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-card hover:text-brand-600" title={t('drive.details.restoreVersion')} aria-label={t('drive.details.restoreVersion')}>
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
              {d && d.versions.length === 0 && <li className={clsx('px-2 text-muted')}>{t('drive.details.noVersions')}</li>}
            </ul>
          </section>
        )}
        {d?.deletedAt && <p className="px-4 py-3 text-xs text-muted">{t('drive.details.trashHint', { days: trashDays })}</p>}
      </div>
    </div>
  );
};
