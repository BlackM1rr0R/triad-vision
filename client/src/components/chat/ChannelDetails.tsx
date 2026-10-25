import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive, BellOff, Bell, Briefcase, Crown, Download, FileText, Hash, Info, LogOut, Pencil, Pin, UserPlus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { attachmentUrl, usePinned, useSharedFiles } from './api';
import { Avatar } from './bits';
import type { Channel, Message } from './types';
import { fmtDateTime, formatBytes, fullName } from './utils';

type Tab = 'about' | 'pinned' | 'files';

/** Right pane: about / members, pinned messages and shared files of the active channel. */
export const ChannelDetails = ({
  channel,
  meId,
  canManage,
  initialTab = 'about',
  onClose,
  onAddMembers,
  onRemoveMember,
  onRename,
  onLeave,
  onArchive,
  onMute,
  onJump,
}: {
  channel: Channel;
  meId: string;
  canManage: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onAddMembers: () => void;
  onRemoveMember: (userId: string) => void;
  onRename: () => void;
  onLeave: () => void;
  onArchive: () => void;
  onMute: () => void;
  onJump: (m: Message) => void;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  const pinned = usePinned(channel.id, tab === 'pinned');
  const files = useSharedFiles(channel.id, tab === 'files');
  const isDm = channel.kind === 'DM';
  const isGeneral = channel.kind === 'PUBLIC' && channel.name === 'general';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'about', label: t('chat.details.about') },
    { id: 'pinned', label: t('chat.details.pinned') },
    { id: 'files', label: t('chat.details.files') },
  ];
  const Action = ({ icon: Icon, label, onClick, danger = false }: { icon: typeof Info; label: string; onClick: () => void; danger?: boolean }) => (
    <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium', danger ? 'text-danger-fg hover:bg-danger-bg' : 'text-ink hover:bg-sunken')}>
      <Icon className="size-4 shrink-0" /> {label}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Info className="size-4 text-link" />
        <h2 className="min-w-0 truncate text-sm font-bold text-ink">{t('chat.details.title')}</h2>
        <button type="button" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('chat.actions.close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-line px-2 pt-2">
        {tabs.map((x) => (
          <button key={x.id} type="button" onClick={() => setTab(x.id)} className={clsx('rounded-t-lg px-3 py-1.5 text-xs font-semibold', tab === x.id ? 'border-b-2 border-primary text-link' : 'text-muted hover:text-ink')}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {tab === 'about' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                {isDm ? <Avatar person={channel.peer} size="lg" /> : <span className="grid size-9 place-items-center rounded-xl bg-sunken text-muted"><Hash className="size-4" /></span>}
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-bold text-ink">{isDm ? channel.name : `#${channel.name}`}</span>
                  <span className="block text-xs text-muted">{t('chat.header.members', { count: channel.memberCount })}</span>
                </span>
              </div>
              {!isDm && (
                <p className="mt-3 text-sm text-ink">
                  <span className="label">{t('chat.details.topic')}</span>
                  {channel.topic || <span className="text-muted">{t('chat.details.noTopic')}</span>}
                </p>
              )}
              {channel.case && (
                <p className="mt-2 text-sm">
                  <span className="label">{t('chat.details.case')}</span>
                  <Link to={`/admin/cases/${channel.case.id}`} className="inline-flex items-center gap-1.5 font-semibold text-link hover:underline">
                    <Briefcase className="size-3.5" /> {channel.case.number}
                  </Link>
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                {t('chat.details.createdAt')}: {fmtDateTime(channel.createdAt)}
              </p>
            </div>
            {!isDm && (
              <div className="space-y-0.5 rounded-xl border border-line p-1">
                {channel.isMember && <Action icon={channel.muted ? Bell : BellOff} label={channel.muted ? t('chat.actions.unmute') : t('chat.actions.mute')} onClick={onMute} />}
                {canManage && !channel.archivedAt && <Action icon={Pencil} label={t('chat.actions.rename')} onClick={onRename} />}
                {channel.isMember && !isGeneral && !channel.archivedAt && <Action icon={LogOut} label={t('chat.actions.leave')} onClick={onLeave} danger />}
                {canManage && !isGeneral && !channel.archivedAt && <Action icon={Archive} label={t('chat.actions.archive')} onClick={onArchive} danger />}
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">{t('chat.details.members')}</span>
                {!isDm && channel.isMember && !channel.archivedAt && (channel.kind === 'PUBLIC' || canManage) && (
                  <button type="button" onClick={onAddMembers} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                    <UserPlus className="size-3.5" /> {t('chat.actions.addMembers')}
                  </button>
                )}
              </div>
              <ul className="space-y-0.5">
                {channel.members.map((m) => (
                  <li key={m.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-sunken">
                    <Avatar person={m} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {fullName(m)} {m.id === meId && <span className="text-xs text-muted">({t('chat.sidebar.you')})</span>}
                    </span>
                    {m.memberRole === 'OWNER' && <Crown className="size-3.5 text-warning-fg" aria-label={t('chat.details.owner')} />}
                    {!isDm && canManage && m.id !== meId && (
                      <button type="button" onClick={() => onRemoveMember(m.id)} className="hidden size-6 place-items-center rounded-md text-muted group-hover:grid hover:bg-danger-bg hover:text-danger-fg" aria-label={t('chat.actions.removeMember')} title={t('chat.actions.removeMember')}>
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {tab === 'pinned' && (
          <ul className="space-y-1.5">
            {(pinned.data ?? []).map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onJump(m)} className="block w-full rounded-lg border border-line px-2.5 py-2 text-left hover:bg-sunken">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Pin className="size-3 text-warning-fg" />
                    <span className="font-semibold text-ink">{fullName(m.author)}</span>
                    <span className="ml-auto">{fmtDateTime(m.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-3 text-sm text-ink">{m.body || m.attachments[0]?.filename}</span>
                </button>
              </li>
            ))}
            {pinned.data && !pinned.data.length && <li className="py-6 text-center text-sm text-muted">{t('chat.details.noPinned')}</li>}
          </ul>
        )}
        {tab === 'files' && (
          <ul className="space-y-1">
            {(files.data ?? []).map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2">
                <FileText className="size-4 shrink-0 text-link" />
                <span className="min-w-0 flex-1">
                  <a href={attachmentUrl(f.id)} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                    {f.filename}
                  </a>
                  <span className="block text-xs text-muted">
                    {fullName(f.author)} · {fmtDateTime(f.createdAt)} · {formatBytes(f.size)}
                  </span>
                </span>
                <a href={attachmentUrl(f.id, true)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={t('chat.actions.download')}>
                  <Download className="size-3.5" />
                </a>
              </li>
            ))}
            {files.data && !files.data.length && <li className="py-6 text-center text-sm text-muted">{t('chat.details.noFiles')}</li>}
          </ul>
        )}
      </div>
    </div>
  );
};
