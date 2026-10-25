import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowUp, ChevronRight, File, Folder, Hash, Lock, Search, X } from 'lucide-react';
import { PeopleList } from '@/components/tasks/bits';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, fetchChildren, fetchRoots } from '@/components/drive/api';
import type { DriveItem } from '@/components/drive/types';
import { chatApi, useSearch } from './api';
import { Avatar, Field, Modal } from './bits';
import type { Channel, Message, Person } from './types';
import { channelLabel, errorText, fmtDateTime, formatBytes, fullName } from './utils';

const slugify = (s: string) => s.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');

export const NewChannelDialog = ({ open, onClose, people, onCreated }: { open: boolean; onClose: () => void; people: Person[]; onCreated: (c: Channel) => void }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [members, setMembers] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setTopic('');
      setKind('PUBLIC');
      setMembers([]);
      setBusy(false);
    }
  }, [open]);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const c = await chatApi.createChannel({ kind, name: slugify(name), topic: topic.trim() || null, memberIds: members.map((m) => m.id) });
      toast.success(t('chat.toasts.created'));
      onCreated(c);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.dialogs.newChannel')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            {t('chat.actions.cancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={!name.trim() || busy} className="btn-primary btn-sm">
            {t('chat.dialogs.create')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('chat.dialogs.name')} hint={t('chat.dialogs.nameHint')}>
          <span className="relative block">
            <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('chat.dialogs.namePh')} className="input pl-9" />
          </span>
        </Field>
        <Field label={t('chat.dialogs.topic')}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={250} placeholder={t('chat.dialogs.topicPh')} className="input" />
        </Field>
        <div>
          <span className="label">{t('chat.dialogs.kind')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(['PUBLIC', 'PRIVATE'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={clsx('flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors', kind === k ? 'border-primary bg-primary/[0.06]' : 'border-line hover:border-line-strong')} aria-pressed={kind === k}>
                {k === 'PUBLIC' ? <Hash className="mt-0.5 size-4 shrink-0 text-link" /> : <Lock className="mt-0.5 size-4 shrink-0 text-link" />}
                <span>
                  <span className="block text-sm font-semibold text-ink">{t(`chat.dialogs.${k === 'PUBLIC' ? 'public' : 'private'}`)}</span>
                  <span className="block text-xs text-muted">{t(`chat.dialogs.${k === 'PUBLIC' ? 'publicHint' : 'privateHint'}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('chat.dialogs.members')}</span>
          {members.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pr-1 pl-0.5 text-xs">
                  <Avatar person={m} size="xs" /> {fullName(m)}
                  <button type="button" onClick={() => setMembers((x) => x.filter((y) => y.id !== m.id))} className="grid size-4 place-items-center rounded-full text-muted hover:text-danger-fg" aria-label={t('chat.actions.removeMember')}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-line p-1.5">
            <PeopleList people={people} selected={members.map((m) => m.id)} onToggle={(p) => setMembers((x) => (x.some((y) => y.id === p.id) ? x.filter((y) => y.id !== p.id) : [...x, p]))} autoFocus={false} />
          </div>
        </div>
      </form>
    </Modal>
  );
};

export const RenameChannelDialog = ({ open, onClose, channel, onSaved }: { open: boolean; onClose: () => void; channel: Channel | null; onSaved: (c: Channel) => void }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && channel) {
      setName(channel.name ?? '');
      setTopic(channel.topic ?? '');
    }
  }, [open, channel]);
  const submit = async () => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      onSaved(await chatApi.updateChannel(channel.id, { name: slugify(name), topic: topic.trim() || null }));
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.dialogs.renameChannel')}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            {t('chat.actions.cancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={!name.trim() || busy} className="btn-primary btn-sm">
            {t('chat.actions.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('chat.dialogs.name')} hint={t('chat.dialogs.nameHint')}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input" />
        </Field>
        <Field label={t('chat.dialogs.topic')}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={250} placeholder={t('chat.dialogs.topicPh')} className="input" />
        </Field>
      </div>
    </Modal>
  );
};

export const NewDmDialog = ({ open, onClose, people, onPicked }: { open: boolean; onClose: () => void; people: Person[]; onPicked: (c: Channel) => void }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const pick = async (p: Person) => {
    if (busy) return;
    setBusy(true);
    try {
      onPicked(await chatApi.dm(p.id));
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('chat.dialogs.newDm')} size="sm">
      <p className="mb-2 text-sm text-muted">{t('chat.dialogs.pickPerson')}</p>
      <div className="[&>div]:w-full">
        <PeopleList people={people} selected={[]} onToggle={(p) => void pick(p)} />
      </div>
    </Modal>
  );
};

/** People picker for adding members to an existing channel. */
export const AddMembersDialog = ({ open, onClose, people, exclude, onAdd }: { open: boolean; onClose: () => void; people: Person[]; exclude: string[]; onAdd: (ids: string[]) => Promise<void> }) => {
  const { t } = useTranslation();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSel([]);
  }, [open]);
  const candidates = useMemo(() => people.filter((p) => !exclude.includes(p.id)), [people, exclude]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.actions.addMembers')}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            {t('chat.actions.cancel')}
          </button>
          <button
            type="button"
            disabled={!sel.length || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd(sel);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className="btn-primary btn-sm"
          >
            {t('chat.actions.addMembers')}
          </button>
        </>
      }
    >
      <div className="[&>div]:w-full">
        <PeopleList people={candidates} selected={sel} onToggle={(p) => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} />
      </div>
    </Modal>
  );
};

/** Browses the team drive (roots → folders) to link a file into the chat. */
export const DrivePickerDialog = ({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (nodeId: string, name: string) => void }) => {
  const { t } = useTranslation();
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (open) setPath([]);
  }, [open]);
  const roots = useQuery({ queryKey: driveKeys.roots, queryFn: fetchRoots, enabled: open });
  const current = path[path.length - 1] ?? null;
  const listing = useQuery({ queryKey: driveKeys.children(current?.id ?? ''), queryFn: () => fetchChildren(current!.id), enabled: open && !!current });
  const rootItems: DriveItem[] = useMemo(() => (roots.data ? [roots.data.shared, roots.data.cases, roots.data.partners, roots.data.staff].filter((x): x is DriveItem => !!x) : []), [roots.data]);
  const items = current ? (listing.data?.items ?? []) : rootItems;
  const loading = current ? listing.isLoading : roots.isLoading;
  return (
    <Modal open={open} onClose={onClose} title={t('chat.dialogs.drive')} size="sm">
      <p className="mb-2 text-xs text-muted">{t('chat.dialogs.driveHint')}</p>
      <div className="mb-2 flex items-center gap-1 text-xs text-muted">
        <button type="button" onClick={() => setPath([])} className="rounded px-1 hover:text-ink">
          /
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button type="button" onClick={() => setPath(path.slice(0, i + 1))} className="rounded px-1 hover:text-ink">
              {p.name}
            </button>
          </span>
        ))}
      </div>
      {current && (
        <button type="button" onClick={() => setPath(path.slice(0, -1))} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-sunken">
          <ArrowUp className="size-4" /> {t('chat.dialogs.up')}
        </button>
      )}
      {loading ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  if (it.kind === 'FOLDER') setPath([...path, { id: it.id, name: it.name }]);
                  else {
                    onPick(it.id, it.name);
                    onClose();
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sunken"
              >
                {it.kind === 'FOLDER' ? <Folder className="size-4 shrink-0 text-warning-fg" /> : <File className="size-4 shrink-0 text-link" />}
                <span className="min-w-0 flex-1 truncate text-ink">{it.name}</span>
                {it.kind === 'FOLDER' ? <ChevronRight className="size-3.5 text-muted" /> : it.size !== null && <span className="text-xs text-muted">{formatBytes(it.size)}</span>}
              </button>
            </li>
          ))}
          {!items.length && <li className="py-6 text-center text-sm text-muted">{t('chat.dialogs.emptyFolder')}</li>}
        </ul>
      )}
    </Modal>
  );
};

/** Right-pane message search. */
export const SearchPanel = ({ channel, onClose, onJump }: { channel: Channel | null; onClose: () => void; onJump: (m: Message) => void }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [here, setHere] = useState(!!channel);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);
  const res = useSearch(debounced, here && channel ? channel.id : '');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Search className="size-4 text-muted" />
        <h2 className="text-sm font-bold text-ink">{t('chat.search.title')}</h2>
        <button type="button" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('chat.actions.close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-2 border-b border-line p-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.search.placeholder')} className="input py-2 text-sm" aria-label={t('chat.search.placeholder')} />
        {channel && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} className="accent-primary" /> {t('chat.search.thisChannel')}
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {res.isFetching && (
          <div className="grid place-items-center py-6">
            <Spinner />
          </div>
        )}
        {res.data && !res.isFetching && (
          <>
            <p className="px-2 pb-1 text-xs text-muted">{res.data.messages.length ? t('chat.search.results', { count: res.data.messages.length }) : t('chat.search.none')}</p>
            <ul className="space-y-1">
              {res.data.messages.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onJump(m)} className="block w-full rounded-lg px-2 py-2 text-left hover:bg-sunken">
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Avatar person={m.author} size="xs" />
                      <span className="font-semibold text-ink">{fullName(m.author)}</span>
                      {m.channel && <span>{t('chat.search.in', { name: m.channel.kind === 'DM' ? m.channel.name : m.channel.name })}</span>}
                      <span className="ml-auto">{fmtDateTime(m.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-3 text-sm text-ink">{m.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export { channelLabel };
