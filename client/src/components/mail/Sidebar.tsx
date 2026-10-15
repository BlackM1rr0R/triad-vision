import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Archive, ChevronDown, Clock, FileText, Flag, Folder, Inbox, Mail, MailOpen, PenSquare, RefreshCw, Send, Settings, ShieldAlert, Trash2 } from 'lucide-react';
import type { FoldersResponse, MailAccount, MailFolder, View } from './types';

export interface Selection {
  accountId: string | null;
  view: View | null;
  folderId: string | null;
  labelId: string | null;
}

const VIEW_ICON: Record<View, LucideIcon> = { inbox: Inbox, unread: MailOpen, flagged: Flag, snoozed: Clock, drafts: FileText, sent: Send, archive: Archive, junk: ShieldAlert, trash: Trash2, all: Mail };
const ROLE_ICON: Record<string, LucideIcon> = { INBOX: Inbox, SENT: Send, DRAFTS: FileText, TRASH: Trash2, JUNK: ShieldAlert, ARCHIVE: Archive, OTHER: Folder };
const TOP_VIEWS: View[] = ['inbox', 'unread', 'flagged', 'snoozed'];

const Row = ({ icon: Icon, label, count, active, onClick, color }: { icon?: LucideIcon; label: string; count?: number; active: boolean; onClick: () => void; color?: string }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors', active ? 'bg-brand-600 text-white' : 'text-ink hover:bg-brand-50')}
  >
    {color ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : Icon ? <Icon className={clsx('size-4 shrink-0', active ? 'text-white' : 'text-muted')} aria-hidden /> : null}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {!!count && <span className={clsx('shrink-0 rounded-full px-1.5 text-[0.68rem] font-bold tabular-nums', active ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700')}>{count > 999 ? '999+' : count}</span>}
  </button>
);

export const folderLabel = (f: MailFolder, t: (k: string) => string) => (f.role !== 'OTHER' ? t(`mail.views.${f.role.toLowerCase()}`) : f.name);

export const MailSidebar = ({
  data,
  selection,
  onSelect,
  onCompose,
  onSettings,
  onSync,
  syncing,
}: {
  data: FoldersResponse | undefined;
  selection: Selection;
  onSelect: (s: Partial<Selection>) => void;
  onCompose: () => void;
  onSettings: () => void;
  onSync: () => void;
  syncing: boolean;
}) => {
  const { t } = useTranslation();
  const accounts = data?.accounts ?? [];
  const account: MailAccount | undefined = accounts.find((a) => a.id === selection.accountId);
  const folders = (data?.folders ?? []).filter((f) => !selection.accountId || f.accountId === selection.accountId);
  const shownFolders = selection.accountId ? folders : folders.filter((f) => f.role === 'OTHER');
  const views = data?.views;
  const viewCount = (v: View) => (v === 'inbox' ? views?.inbox : v === 'unread' ? views?.unread : v === 'flagged' ? views?.flagged : v === 'snoozed' ? views?.snoozed : v === 'drafts' ? views?.drafts : 0);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <button type="button" onClick={onCompose} className="btn-primary btn-sm w-full justify-center py-2.5 text-sm">
        <PenSquare className="size-4" /> {t('mail.composeButton')}
      </button>

      {accounts.length > 0 && (
        <label className="relative block">
          <select value={selection.accountId ?? (accounts.length === 1 ? accounts[0]!.id : '')} onChange={(e) => onSelect({ accountId: e.target.value || null, view: 'inbox', folderId: null, labelId: null })} className="input appearance-none py-2 pr-8 text-sm font-semibold" aria-label={t('mail.sections.accounts')}>
            {accounts.length > 1 && <option value="">{t('mail.allAccounts')}</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        </label>
      )}

      {account?.syncStatus === 'ERROR' && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-xs text-danger" title={account.syncError ?? ''}>
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-3 break-words">{account.syncError}</span>
        </div>
      )}

      <nav className="space-y-0.5" aria-label={t('mail.sections.views')}>
        {TOP_VIEWS.map((v) => (
          <Row key={v} icon={VIEW_ICON[v]} label={t(`mail.views.${v}`)} count={viewCount(v)} active={selection.view === v && !selection.folderId && !selection.labelId} onClick={() => onSelect({ view: v, folderId: null, labelId: null })} />
        ))}
      </nav>

      <div>
        <p className="px-2.5 pt-2 pb-1 text-[0.65rem] font-bold tracking-[0.14em] text-muted uppercase">{t('mail.sections.folders')}</p>
        <nav className="space-y-0.5">
          {selection.accountId
            ? shownFolders
                .filter((f) => f.role !== 'INBOX')
                .map((f) => <Row key={f.id} icon={ROLE_ICON[f.role] ?? Folder} label={folderLabel(f, t)} count={f.role === 'DRAFTS' ? f.total : f.unread} active={selection.folderId === f.id} onClick={() => onSelect({ folderId: f.id, view: null, labelId: null })} />)
            : (['drafts', 'sent', 'archive', 'junk', 'trash', 'all'] as View[]).map((v) => (
                <Row key={v} icon={VIEW_ICON[v]} label={t(`mail.views.${v}`)} count={viewCount(v)} active={selection.view === v && !selection.folderId && !selection.labelId} onClick={() => onSelect({ view: v, folderId: null, labelId: null })} />
              ))}
          {!selection.accountId && shownFolders.map((f) => <Row key={f.id} icon={Folder} label={f.name} count={f.unread} active={selection.folderId === f.id} onClick={() => onSelect({ folderId: f.id, view: null, labelId: null, accountId: f.accountId })} />)}
        </nav>
      </div>

      {(data?.labels.length ?? 0) > 0 && (
        <div>
          <p className="px-2.5 pt-2 pb-1 text-[0.65rem] font-bold tracking-[0.14em] text-muted uppercase">{t('mail.sections.labels')}</p>
          <nav className="space-y-0.5">
            {data!.labels.map((l) => (
              <Row key={l.id} color={l.color} label={l.name} count={l.unread} active={selection.labelId === l.id} onClick={() => onSelect({ labelId: l.id, view: null, folderId: null })} />
            ))}
          </nav>
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-line pt-2">
        <button type="button" onClick={onSync} disabled={syncing || !accounts.length} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-muted hover:bg-brand-50 hover:text-ink disabled:opacity-50" title={t('mail.refresh')}>
          <RefreshCw className={clsx('size-3.5', syncing && 'animate-spin')} /> {t('mail.refresh')}
        </button>
        <button type="button" onClick={onSettings} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-muted hover:bg-brand-50 hover:text-ink" title={t('mail.settingsButton')}>
          <Settings className="size-3.5" /> {t('mail.settingsButton')}
        </button>
      </div>
    </div>
  );
};
