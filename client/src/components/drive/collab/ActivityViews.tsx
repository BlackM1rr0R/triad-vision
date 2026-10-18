import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowRightLeft,
  Copy,
  FilePlus2,
  FolderPlus,
  History,
  Link2,
  Link2Off,
  ListChecks,
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { DriveItem, StaffPerson } from '../types';
import { ACTIVITY_ACTIONS, collabKeys, fetchActivity, type ActivityFilters, type ActivityRow } from './api';
import { activityHref, activitySentence, timeOf } from './activityText';

registerCopy(driveCollabCopy);

const ICONS: Record<string, LucideIcon> = {
  UPLOAD: Upload,
  UPLOAD_VIA_LINK: Upload,
  NEW_VERSION: History,
  CREATE_FOLDER: FolderPlus,
  CREATE: FilePlus2,
  CONVERT: FilePlus2,
  RENAME: Pencil,
  MOVE: ArrowRightLeft,
  COPY: Copy,
  DELETE: Trash2,
  RESTORE: RotateCcw,
  PURGE: XCircle,
  SHARE_LINK_CREATED: Link2,
  SHARE_LINK_REVOKED: Link2Off,
  COMMENT: MessageSquare,
  TASK_CREATED: ListChecks,
  LOCK: Lock,
  UNLOCK: LockOpen,
  SHEET_SAVE: History,
};

const TONE: Record<string, string> = {
  DELETE: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  PURGE: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  UPLOAD_VIA_LINK: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  SHARE_LINK_CREATED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  COMMENT: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  TASK_CREATED: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

const dayKey = (iso: string) => new Date(iso).toDateString();

/** Paged activity list (newest first) grouped by day, with links to the items. */
export const ActivityList = ({ filters, compact = false, onNavigate }: { filters: ActivityFilters; compact?: boolean; onNavigate?: () => void }) => {
  const { t } = useTranslation();
  const q = useInfiniteQuery({
    queryKey: collabKeys.activity(filters.nodeId ?? filters.folderId ?? 'all', filters),
    queryFn: ({ pageParam }) => fetchActivity(filters, pageParam, compact ? 25 : 50),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const dayLabel = (iso: string) => (dayKey(iso) === today ? t('driveCollab.activity.today') : dayKey(iso) === yesterday ? t('driveCollab.activity.yesterday') : fmtDate(iso));

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!rows.length) return <p className="px-4 py-6 text-center text-xs text-muted">{t('driveCollab.activity.empty')}</p>;

  return (
    <div>
      <ol className={clsx('space-y-0.5', compact ? 'px-3 py-2' : 'px-1')}>
        {rows.map((r: ActivityRow, i) => {
          const Icon = ICONS[r.action] ?? History;
          const href = activityHref(r);
          const newDay = i === 0 || dayKey(rows[i - 1].createdAt) !== dayKey(r.createdAt);
          return (
            <li key={r.id}>
              {newDay && <p className="mt-2 mb-1 px-2 text-[11px] font-bold tracking-wide text-muted uppercase first:mt-0">{dayLabel(r.createdAt)}</p>}
              <div className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface">
                <span className={clsx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', TONE[r.action] ?? 'bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-brand-200')}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <p className="min-w-0 flex-1 text-xs leading-snug break-words text-ink">
                  {href ? (
                    <Link to={href} onClick={onNavigate} className="hover:text-brand-700 hover:underline">
                      {activitySentence(r, t)}
                    </Link>
                  ) : (
                    activitySentence(r, t)
                  )}
                  <span className="text-muted" title={fmtDateTime(r.createdAt)}>
                    {' '}
                    · {timeOf(r.createdAt)}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {q.hasNextPage && (
        <div className="px-4 py-3 text-center">
          <button type="button" className="btn-white btn-sm border border-line" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage && <Spinner className="size-3.5" />} {t('driveCollab.activity.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
};

/** "Fəaliyyət" tab of the details panel: the item's own history (folders: what happened inside). */
export const ActivityTab = ({ item, onOpenJournal }: { item: DriveItem; onOpenJournal?: () => void }) => {
  const { t } = useTranslation();
  const filters = item.kind === 'FOLDER' ? { folderId: item.id } : { nodeId: item.id };
  return (
    <div>
      {item.kind === 'FOLDER' && onOpenJournal && (
        <div className="flex justify-end border-b border-line px-4 py-2">
          <button type="button" onClick={onOpenJournal} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline">
            <History className="size-3.5" /> {t('driveCollab.activity.full')}
          </button>
        </div>
      )}
      <ActivityList filters={filters} compact />
    </div>
  );
};

/** Full journal of a folder with filters by person, action and date. */
export const ActivityJournal = ({ folder, title, onClose }: { folder: DriveItem | null; title: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const people = useQuery({
    queryKey: ['drive', 'people', ''],
    queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people')).data.people,
    enabled: !!folder,
    staleTime: 60_000,
  });
  const filters: ActivityFilters = {
    folderId: folder?.id,
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
  };
  const filtered = !!(actorId || action || from || to);
  return (
    <Modal open={!!folder} onClose={onClose} size="lg" title={t('driveCollab.activity.journalTitle', { name: title })}>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <label className="text-xs font-semibold text-muted">
          {t('driveCollab.activity.person')}
          <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="input mt-1 !py-1.5 !text-xs">
            <option value="">{t('driveCollab.activity.anyPerson')}</option>
            {people.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          {t('driveCollab.activity.action')}
          <select value={action} onChange={(e) => setAction(e.target.value)} className="input mt-1 !py-1.5 !text-xs">
            <option value="">{t('driveCollab.activity.anyAction')}</option>
            {ACTIVITY_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`driveCollab.actions.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          {t('driveCollab.activity.from')}
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="input mt-1 !py-1.5 !text-xs" />
        </label>
        <label className="text-xs font-semibold text-muted">
          {t('driveCollab.activity.to')}
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="input mt-1 !py-1.5 !text-xs" />
        </label>
      </div>
      {filtered && (
        <div className="mb-2 text-right">
          <button
            type="button"
            className="text-xs font-semibold text-brand-600 hover:underline"
            onClick={() => {
              setActorId('');
              setAction('');
              setFrom('');
              setTo('');
            }}
          >
            {t('driveCollab.activity.reset')}
          </button>
        </div>
      )}
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-line py-2">{folder && <ActivityList filters={filters} onNavigate={onClose} />}</div>
    </Modal>
  );
};
