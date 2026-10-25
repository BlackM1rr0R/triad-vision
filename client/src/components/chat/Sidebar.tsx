import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { BellOff, ChevronDown, ChevronRight, Hash, Lock, MessageSquarePlus, Pin, Plus, Search } from 'lucide-react';
import type { Channel } from './types';
import { avatarTone, fmtShort, initials } from './utils';

const byActivity = (a: Channel, b: Channel) => {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const ta = a.lastMessage?.createdAt ?? a.createdAt;
  const tb = b.lastMessage?.createdAt ?? b.createdAt;
  return tb.localeCompare(ta);
};

const Row = ({ c, active, meId, online, onSelect }: { c: Channel; active: boolean; meId: string; online?: boolean; onSelect: () => void }) => {
  const { t } = useTranslation();
  const bold = c.isMember && c.unread > 0 && !c.muted;
  const preview = c.lastMessage ? `${c.lastMessage.authorId === meId ? `${t('chat.sidebar.you')}: ` : c.kind !== 'DM' && c.lastMessage.authorName ? `${c.lastMessage.authorName.split(' ')[0]}: ` : ''}${c.lastMessage.body}` : (c.topic ?? '');
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx('group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors', active ? 'bg-primary text-primary-contrast' : 'hover:bg-sunken', c.archivedAt && 'opacity-60')}
    >
      {c.kind === 'DM' ? (
        <span className="relative shrink-0">
          <span className={clsx('inline-grid size-7 place-items-center rounded-full text-[0.6rem] font-bold', active ? 'bg-primary-contrast/20 text-primary-contrast' : avatarTone(c.peer?.id ?? c.id))}>{initials(c.peer)}</span>
          {online !== undefined && <span className={clsx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2', online ? 'bg-success' : 'bg-line-strong', active ? 'ring-focus' : 'ring-card')} />}
        </span>
      ) : (
        <span className={clsx('grid size-7 shrink-0 place-items-center rounded-lg', active ? 'bg-primary-contrast/20 text-primary-contrast' : 'bg-sunken text-muted')}>{c.kind === 'PRIVATE' ? <Lock className="size-3.5" /> : <Hash className="size-3.5" />}</span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          <span className={clsx('truncate text-sm', bold ? 'font-bold' : 'font-medium', active ? 'text-primary-contrast' : bold ? 'text-ink' : 'text-ink/85')}>{c.name}</span>
          {c.pinned && <Pin className={clsx('size-3 shrink-0', active ? 'text-primary-contrast/80' : 'text-muted')} aria-hidden />}
          {c.muted && <BellOff className={clsx('size-3 shrink-0', active ? 'text-primary-contrast/80' : 'text-muted')} aria-hidden />}
        </span>
        {preview && <span className={clsx('block truncate text-xs', active ? 'text-primary-contrast/75' : bold ? 'text-ink/80' : 'text-muted')}>{preview}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {c.lastMessage && <span className={clsx('text-[0.65rem]', active ? 'text-primary-contrast/70' : 'text-muted')}>{fmtShort(c.lastMessage.createdAt)}</span>}
        {c.isMember && c.mentions > 0 ? (
          <span className={clsx('grid min-w-5 place-items-center rounded-full px-1.5 text-[0.65rem] font-bold leading-5', active ? 'bg-card text-link' : 'bg-danger text-white')}>@{c.mentions}</span>
        ) : c.isMember && c.unread > 0 && !c.muted ? (
          <span className={clsx('grid min-w-5 place-items-center rounded-full px-1.5 text-[0.65rem] font-bold leading-5', active ? 'bg-card text-link' : 'bg-primary text-primary-contrast')}>{c.unread > 99 ? '99+' : c.unread}</span>
        ) : null}
      </span>
    </button>
  );
};

const Section = ({ title, action, actionLabel, open, onToggle, children }: { title: string; action?: () => void; actionLabel?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) => (
  <div>
    <div className="group/sec flex items-center justify-between px-2 pt-3 pb-1">
      <button type="button" onClick={onToggle} className="flex items-center gap-1 text-[0.68rem] font-bold tracking-[0.12em] text-muted uppercase hover:text-ink">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {action && (
        <button type="button" onClick={action} className="grid size-6 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label={actionLabel} title={actionLabel}>
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
    {open && <div className="space-y-0.5">{children}</div>}
  </div>
);

export const Sidebar = ({
  channels,
  activeId,
  meId,
  presence,
  onSelect,
  onNewChannel,
  onNewDm,
}: {
  channels: Channel[];
  activeId: string | null;
  meId: string;
  /** online user ids (undefined when presence is unavailable) */
  presence?: Set<string>;
  onSelect: (c: Channel) => void;
  onNewChannel: () => void;
  onNewDm: () => void;
}) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ channels: true, dms: true, browse: false });
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (c: Channel) => !s || (c.name ?? '').toLowerCase().includes(s) || (c.topic ?? '').toLowerCase().includes(s);
    const mine = channels.filter((c) => c.isMember && !c.archivedAt && match(c));
    return {
      channels: mine.filter((c) => c.kind !== 'DM').sort(byActivity),
      dms: mine.filter((c) => c.kind === 'DM').sort(byActivity),
      browse: channels.filter((c) => !c.isMember && !c.archivedAt && match(c)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      archived: channels.filter((c) => c.isMember && c.archivedAt && match(c)),
    };
  }, [channels, q]);
  const nothing = !groups.channels.length && !groups.dms.length && !groups.browse.length && !groups.archived.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <h1 className="font-display text-base font-semibold text-ink">{t('chat.title')}</h1>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onNewDm} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('chat.sidebar.newDm')} title={t('chat.sidebar.newDm')}>
            <MessageSquarePlus className="size-4" />
          </button>
          <button type="button" onClick={onNewChannel} className="grid size-8 place-items-center rounded-lg bg-primary text-primary-contrast hover:bg-primary" aria-label={t('chat.sidebar.newChannel')} title={t('chat.sidebar.newChannel')}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <label className="relative m-2 block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.sidebar.search')} className="input py-1.5 pl-8 text-sm" aria-label={t('chat.sidebar.search')} />
      </label>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3" aria-label={t('chat.title')}>
        <Section title={t('chat.sidebar.channels')} action={onNewChannel} actionLabel={t('chat.sidebar.newChannel')} open={open.channels} onToggle={() => toggle('channels')}>
          {groups.channels.map((c) => (
            <Row key={c.id} c={c} meId={meId} active={c.id === activeId} onSelect={() => onSelect(c)} />
          ))}
        </Section>
        <Section title={t('chat.sidebar.dms')} action={onNewDm} actionLabel={t('chat.sidebar.newDm')} open={open.dms} onToggle={() => toggle('dms')}>
          {groups.dms.map((c) => (
            <Row key={c.id} c={c} meId={meId} active={c.id === activeId} online={presence && c.peer ? presence.has(c.peer.id) : undefined} onSelect={() => onSelect(c)} />
          ))}
        </Section>
        {groups.browse.length > 0 && (
          <Section title={t('chat.sidebar.browse')} open={open.browse || !!q} onToggle={() => toggle('browse')}>
            {groups.browse.map((c) => (
              <Row key={c.id} c={c} meId={meId} active={c.id === activeId} onSelect={() => onSelect(c)} />
            ))}
          </Section>
        )}
        {groups.archived.length > 0 && (
          <Section title={t('chat.sidebar.archived')} open={!!q} onToggle={() => setQ(q ? '' : ' ')}>
            {groups.archived.map((c) => (
              <Row key={c.id} c={c} meId={meId} active={c.id === activeId} onSelect={() => onSelect(c)} />
            ))}
          </Section>
        )}
        {nothing && <p className="px-3 py-6 text-center text-sm text-muted">{t('chat.sidebar.noResults')}</p>}
      </nav>
    </div>
  );
};
