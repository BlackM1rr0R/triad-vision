import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, Keyboard, Mail as MailIcon, Menu, PenSquare } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { api } from '@/lib/api';
import { pagesMail } from '@/i18n/pagesMail';
import { pagesMailAccess } from '@/i18n/pagesMailAccess';
import { useRealtime } from '@/lib/realtime';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { mailKeys, syncAccount, useBulkAction, useFolders, useInvalidateMail, useLabels, useMailboxes, useMessage, useMessageList, useThread, type BulkInput } from '@/components/mail/api';
import { ComposeWindow } from '@/components/mail/Compose';
import { Dialog } from '@/components/mail/Dialog';
import { LabelsMenu, SnoozeMenu } from '@/components/mail/menus';
import { MessageList, type ListFilters } from '@/components/mail/MessageList';
import { ReadingPane, type PaneAction } from '@/components/mail/ReadingPane';
import { MailSettingsDialog, type SettingsTab } from '@/components/mail/SettingsDialog';
import { MailSidebar, folderLabel, type Selection } from '@/components/mail/Sidebar';
import { SHORTCUT_LIST, useMailShortcuts } from '@/components/mail/shortcuts';
import type { ComposeSeed, ListParams, MailAccess, MessageDetail, MessageRow, View } from '@/components/mail/types';
import { VIEWS } from '@/components/mail/types';
import { errorText, subjectOf } from '@/components/mail/utils';
import { TriageCard } from '@/components/aiMail/TriageCard';
import { AI_FILTERS, draftToHtml, useTriageStatus, type AiFilter } from '@/components/aiMail/api';

registerCopy(pagesMail);
registerCopy(pagesMailAccess); // shared mailboxes: switcher, read-only notes

const THREADS_KEY = 'tv-mail-threads';
const readThreads = () => {
  try {
    return localStorage.getItem(THREADS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * URL: /workspace/mail/<accountId|all>/<v-view | f-folderId | l-labelId>/<messageId>?q=&from=&to=&unread=1&att=1
 */
const parsePath = (rest: string): Selection & { messageId: string | null } => {
  const [a = '', b = '', c = ''] = rest.split('/').filter(Boolean);
  const accountId = a && a !== 'all' ? a : null;
  let view: View | null = null;
  let folderId: string | null = null;
  let labelId: string | null = null;
  if (b.startsWith('v-') && (VIEWS as string[]).includes(b.slice(2))) view = b.slice(2) as View;
  else if (b.startsWith('f-')) folderId = b.slice(2);
  else if (b.startsWith('l-')) labelId = b.slice(2);
  else view = 'inbox';
  return { accountId, view, folderId, labelId, messageId: c || null };
};

const buildPath = (s: Selection, messageId: string | null) => {
  const seg = s.folderId ? `f-${s.folderId}` : s.labelId ? `l-${s.labelId}` : `v-${s.view ?? 'inbox'}`;
  return `/workspace/mail/${s.accountId ?? 'all'}/${seg}${messageId ? `/${messageId}` : ''}`;
};

export default function WorkspaceMail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const invalidate = useInvalidateMail();
  usePageTitle(t('mail.title'));

  // ─── URL state ───
  const state = useMemo(() => parsePath(params['*'] ?? ''), [params]);
  const selection: Selection = useMemo(() => ({ accountId: state.accountId, view: state.view, folderId: state.folderId, labelId: state.labelId }), [state]);
  const messageId = state.messageId;
  const filters: ListFilters = useMemo(() => ({ q: sp.get('q') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', unread: sp.get('unread') === '1', hasAttachments: sp.get('att') === '1' }), [sp]);
  const aiParam = sp.get('ai');
  const aiFilter: AiFilter | null = aiParam && (AI_FILTERS as string[]).includes(aiParam) ? (aiParam as AiFilter) : null;
  const setAiFilter = (f: AiFilter | null) => {
    const next = new URLSearchParams(sp);
    if (f) next.set('ai', f);
    else next.delete('ai');
    setSp(next, { replace: true });
  };
  const triageStatus = useTriageStatus();
  const triageOn = !!triageStatus.data?.enabled;
  const [threads, setThreadsState] = useState(readThreads);
  const setThreads = (on: boolean) => {
    setThreadsState(on);
    try {
      localStorage.setItem(THREADS_KEY, on ? '1' : '0');
    } catch {
      /* private mode */
    }
  };

  const go = useCallback(
    (next: Partial<Selection>, nextMessage: string | null = null, replace = false) => {
      navigate({ pathname: buildPath({ ...selection, ...next }, nextMessage), search: sp.toString() ? `?${sp.toString()}` : '' }, { replace });
    },
    [navigate, selection, sp],
  );
  const setFilters = (f: ListFilters) => {
    const next = new URLSearchParams(sp);
    const put = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
    put('q', f.q);
    put('from', f.from);
    put('to', f.to);
    put('unread', f.unread ? '1' : '');
    put('att', f.hasAttachments ? '1' : '');
    setSp(next, { replace: true });
  };
  const openMessage = (id: string | null) => go({}, id, !!messageId);

  // ─── Data ───
  const ownFolders = useFolders();
  const ownAccounts = useMemo(() => ownFolders.data?.accounts ?? [], [ownFolders.data]);
  // Shared mailboxes (server lib/mail/access): a colleague's mailbox opened through a grant, or any for a super admin.
  const mailboxes = useMailboxes();
  const shared = useMemo(() => mailboxes.data?.shared ?? [], [mailboxes.data]);
  const sharedBox = selection.accountId ? shared.find((b) => b.id === selection.accountId) : undefined;
  const sharedFolders = useFolders(sharedBox?.id, !!sharedBox);
  const folders = sharedBox ? sharedFolders : ownFolders;
  const access: MailAccess = sharedBox?.access ?? 'OWNER';
  const readOnly = access === 'READ';
  const sharedAccount = sharedBox ? sharedFolders.data?.accounts.find((a) => a.id === sharedBox.id) : undefined;
  // Accounts the viewer may write from: own ones, plus the shared mailbox when "read + send" was granted.
  const accounts = useMemo(() => (sharedAccount && access === 'SEND' ? [sharedAccount, ...ownAccounts] : ownAccounts), [sharedAccount, access, ownAccounts]);
  const labels = useLabels();
  const myEmails = useMemo(() => new Set([...accounts, ...(sharedAccount ? [sharedAccount] : [])].map((a) => a.email.toLowerCase())), [accounts, sharedAccount]);
  const ownerName = sharedBox ? `${sharedBox.owner.firstName} ${sharedBox.owner.lastName}`.trim() || sharedBox.email : '';
  const listParams: ListParams = useMemo(
    () => ({
      accountId: selection.accountId ?? undefined,
      folderId: selection.folderId ?? undefined,
      view: selection.folderId ? undefined : selection.labelId ? undefined : (selection.view ?? 'inbox'),
      labelId: selection.labelId ?? undefined,
      q: filters.q || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      unread: filters.unread || undefined,
      hasAttachments: filters.hasAttachments || undefined,
      threads: threads || undefined,
      ai: aiFilter ?? undefined,
    }),
    [selection, filters, threads, aiFilter],
  );
  const list = useMessageList(listParams, ownAccounts.length > 0 || !!sharedBox);
  const items: MessageRow[] = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const message = useMessage(messageId);
  const thread = useThread(messageId, threads);
  const bulk = useBulkAction();

  // Opening an unread message marks it read (local first, server mirrors).
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    const m = message.data;
    // Someone else's mailbox stays as its owner left it (unread stays unread).
    if (!m || m.seen || m.isDraft || markedRef.current === m.id || (m.access && m.access !== 'OWNER')) return;
    markedRef.current = m.id;
    bulk.mutate({ ids: [m.id], action: 'read' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.data?.id, message.data?.seen]);

  // No mailbox of one's own but shared ones (e.g. a super admin): open the first shared mailbox.
  useEffect(() => {
    if (ownFolders.isSuccess && !ownAccounts.length && !selection.accountId && shared.length) go({ accountId: shared[0]!.id, view: 'inbox', folderId: null, labelId: null }, null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownFolders.isSuccess, ownAccounts.length, selection.accountId, shared.length]);

  // ─── Realtime ───
  // Lists and counts refresh on every push; the "new mail" toast is shown by the workspace shell
  // (useMailPush), which skips it while this page shows the inbox the message landed in.
  useRealtime('mail.new', () => invalidate());
  useRealtime('mail.updated', (p) => {
    invalidate();
    // AI triage finished in the background: refresh the card and the "Inbox today" counts.
    if ((p as { reason?: string } | undefined)?.reason === 'triage') void qc.invalidateQueries({ queryKey: ['ai-mail'] });
  });

  // ─── Selection (checkboxes) ───
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastToggled = useRef<string | null>(null);
  useEffect(() => setSelected(new Set()), [listParams]);
  const toggle = (id: string, shift?: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (shift && lastToggled.current) {
        const a = items.findIndex((m) => m.id === lastToggled.current);
        const b = items.findIndex((m) => m.id === id);
        if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) n.add(items[i]!.id);
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    lastToggled.current = id;
  };
  const toggleAll = () => setSelected((s) => (items.length && items.every((m) => s.has(m.id)) ? new Set() : new Set(items.map((m) => m.id))));

  // ─── Compose ───
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const seedKey = useRef(0);
  const startCompose = (seed: Omit<ComposeSeed, 'key'>) => {
    if (!accounts.length) {
      toast.error(t('mailAccess.mail.readOnlyError'));
      return;
    }
    // A read-only shared mailbox cannot be the sender: fall back to the default account.
    const accountId = seed.accountId && accounts.some((a) => a.id === seed.accountId) ? seed.accountId : undefined;
    setCompose({ ...seed, accountId, key: String(++seedKey.current) });
  };
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<null | 'label' | 'snooze'>(null);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const run = (input: BulkInput, done?: () => void) =>
    bulk.mutate(input, {
      onSuccess: () => done?.(),
      onError: (err) => toast.error(errorText(err)),
    });

  const afterRemove = (ids: string[]) => {
    if (messageId && ids.includes(messageId)) {
      const idx = items.findIndex((m) => m.id === messageId);
      const next = items[idx + 1] ?? items[idx - 1];
      openMessage(next && !ids.includes(next.id) ? next.id : null);
    }
    setSelected(new Set());
  };

  const act = (a: PaneAction, ids: string[] = messageId ? [messageId] : []) => {
    if (!ids.length) return;
    const m = message.data;
    // Shared mailboxes: read-only access only prints; labels are personal (own mailboxes only). The server checks too.
    if ((readOnly && a.type !== 'print') || (access !== 'OWNER' && a.type === 'label')) {
      toast.error(t('mailAccess.mail.readOnlyError'));
      return;
    }
    switch (a.type) {
      case 'reply':
      case 'replyAll':
      case 'forward':
        if (m) startCompose({ mode: a.type, original: m, accountId: m.accountId });
        return;
      case 'archive':
        run({ ids, action: 'archive' }, () => {
          toast.success(t('mail.toast.archived'));
          afterRemove(ids);
        });
        return;
      case 'trash':
      case 'deleteForever':
        run({ ids, action: a.type === 'trash' ? 'trash' : 'delete' }, () => {
          toast.success(t('mail.toast.deleted'));
          afterRemove(ids);
        });
        return;
      case 'spam':
        run({ ids, action: 'spam' }, () => afterRemove(ids));
        return;
      case 'notSpam':
      case 'move': {
        const folder = a.type === 'move' ? a.folder : folders.data?.folders.find((f) => f.accountId === m?.accountId && f.role === 'INBOX');
        if (!folder) return;
        run({ ids, action: 'move', folderId: folder.id }, () => {
          toast.success(t('mail.toast.moved'));
          afterRemove(ids);
        });
        return;
      }
      case 'flag':
      case 'unflag':
      case 'read':
      case 'unread':
      case 'unsnooze':
        run({ ids, action: a.type });
        return;
      case 'snooze':
        run({ ids, action: 'snooze', preset: a.preset, until: a.until, tzOffset: new Date().getTimezoneOffset() }, () => {
          toast.success(t('mail.toast.snoozed'));
          afterRemove(ids);
        });
        return;
      case 'label':
        run({ ids, action: a.on ? 'label' : 'unlabel', labelId: a.label.id });
        return;
      case 'linkCase':
        if (!m) return;
        void api
          .post(`/mail/messages/${m.id}/link-case`, { caseId: a.caseRef?.id ?? null })
          .then(() => {
            toast.success(a.caseRef ? t('mail.toast.linked') : t('mail.toast.saved'));
            invalidate();
          })
          .catch((err) => toast.error(errorText(err)));
        return;
      case 'print':
        printMessage(m);
        return;
    }
  };

  const bulkFromList = (action: 'read' | 'unread' | 'archive' | 'trash' | 'flag' | 'label' | 'snooze' | 'clear') => {
    const ids = [...selected];
    if (action === 'clear') return setSelected(new Set());
    if (action === 'label' || action === 'snooze') return setBulkMenu(action);
    if (action === 'archive') return act({ type: 'archive' }, ids);
    if (action === 'trash') return act({ type: 'trash' }, ids);
    run({ ids, action }, () => setSelected(new Set()));
  };

  const sync = async () => {
    const targets = sharedAccount ? [sharedAccount] : selection.accountId ? ownAccounts.filter((a) => a.id === selection.accountId) : ownAccounts;
    if (!targets.length) return;
    setSyncing(true);
    try {
      for (const a of targets) {
        const r = await syncAccount(a.id);
        if (!r.ok) toast.error(t('mail.toast.syncFailed', { error: r.error ?? '' }));
      }
      toast.success(t('mail.toast.synced'));
      invalidate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSyncing(false);
    }
  };

  // ─── Keyboard ───
  const moveBy = (delta: number) => {
    if (!items.length) return;
    const idx = messageId ? items.findIndex((m) => m.id === messageId) : -1;
    const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))];
    if (next && next.id !== messageId) openMessage(next.id);
  };
  useMailShortcuts(
    {
      j: () => moveBy(1),
      k: () => moveBy(-1),
      e: () => act({ type: 'archive' }),
      '#': () => act({ type: message.data?.folderRole === 'TRASH' ? 'deleteForever' : 'trash' }),
      r: () => act({ type: 'reply' }),
      a: () => act({ type: 'replyAll' }),
      f: () => act({ type: 'forward' }),
      s: () => act({ type: message.data?.flagged ? 'unflag' : 'flag' }),
      u: () => act({ type: 'unread' }),
      c: () => startCompose({ mode: 'new', accountId: selection.accountId ?? undefined }),
      '/': () => searchRef.current?.focus(),
      Escape: () => (messageId ? openMessage(null) : undefined),
    },
    !compose,
  );

  // ─── Derived ───
  const title = selection.folderId
    ? (() => {
        const f = folders.data?.folders.find((x) => x.id === selection.folderId);
        return f ? folderLabel(f, t) : t('mail.title');
      })()
    : selection.labelId
      ? (folders.data?.labels.find((l) => l.id === selection.labelId)?.name ?? t('mail.title'))
      : t(`mail.views.${selection.view ?? 'inbox'}`);
  const current = message.data;
  const openDraft = (m: MessageRow) => {
    if (m.isDraft) {
      void qc
        .fetchQuery({ queryKey: mailKeys.message(m.id), staleTime: 0, queryFn: async () => (await api.get<{ message: MessageDetail }>(`/mail/messages/${m.id}`)).data.message })
        .then((d) => startCompose({ mode: 'draft', draft: d, accountId: d.accountId }))
        .catch((err) => toast.error(errorText(err)));
      return;
    }
    openMessage(m.id);
  };

  // ─── No account yet ───
  // (A super admin or a colleague with grants but no mailbox of their own still gets the switcher.)
  if (ownFolders.isSuccess && !ownAccounts.length && !sharedBox && !shared.length && !mailboxes.isLoading) {
    return (
      <div className="grid h-full place-items-center bg-canvas p-6">
        <div className="max-w-md text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-xl bg-primary/[0.06] text-link">
            <MailIcon className="size-8" />
          </span>
          <h1 className="type-page-title">{t('mail.empty.noAccounts')}</h1>
          <p className="mt-2 text-sm text-muted">{t('mail.empty.noAccountsBody')}</p>
          <button type="button" className="btn-primary mt-6" onClick={() => setSettings('accounts')}>
            {t('mail.empty.addAccount')}
          </button>
        </div>
        <MailSettingsDialog open={!!settings} onClose={() => setSettings(null)} initialTab={settings ?? 'accounts'} accounts={ownAccounts} />
      </div>
    );
  }

  const showList = !messageId;

  return (
    <div className="flex h-full min-h-0 bg-canvas text-ink">
      {/* Left: accounts / folders / labels */}
      <aside className={clsx('w-60 shrink-0 border-r border-line bg-card', sidebarOpen ? 'fixed inset-y-0 left-0 z-[60] flex flex-col shadow-[var(--tv-shadow-raised)]' : 'hidden lg:flex lg:flex-col')}>
        {shared.length > 0 && (
          <div className="border-b border-line p-3 pb-2">
            <label className="relative block">
              <span className="mb-1 block text-[0.65rem] font-bold tracking-[0.14em] text-muted uppercase">{t('mailAccess.mail.switcher')}</span>
              <select
                value={sharedBox?.id ?? ''}
                onChange={(e) => {
                  setSidebarOpen(false);
                  go({ accountId: e.target.value || null, view: 'inbox', folderId: null, labelId: null }, null);
                }}
                className="input appearance-none py-2 pr-8 text-sm font-semibold"
              >
                <option value="">{t('mailAccess.mail.mine')}</option>
                <optgroup label={t('mailAccess.mail.sharedGroup')}>
                  {shared.map((b) => (
                    <option key={b.id} value={b.id}>
                      {t('mailAccess.mail.shared', { name: `${b.owner.firstName} ${b.owner.lastName}`.trim() || b.email })} · {b.email}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 bottom-3 size-4 text-muted" aria-hidden />
            </label>
            {sharedBox && (
              <p className={clsx('mt-2 rounded-lg px-2.5 py-1.5 text-xs', readOnly ? 'bg-primary/[0.06] text-link' : 'bg-warning-bg text-warning-fg')}>
                {readOnly ? t('mailAccess.mail.readOnlyNote') : t('mailAccess.mail.sendNote', { name: ownerName })}
              </p>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {folders.isLoading ? (
            <div className="grid h-full place-items-center text-link">
              <Spinner />
            </div>
          ) : (
            <MailSidebar
              data={folders.data}
              selection={selection}
              onSelect={(s) => {
                setSidebarOpen(false);
                go(s, null);
              }}
              onCompose={() => {
                setSidebarOpen(false);
                startCompose({ mode: 'new', accountId: selection.accountId ?? undefined });
              }}
              onSettings={() => {
                setSidebarOpen(false);
                setSettings('accounts');
              }}
              onSync={() => void sync()}
              syncing={syncing}
            />
          )}
        </div>
      </aside>
      {sidebarOpen && <button type="button" className="fixed inset-0 z-[55] bg-navy-950/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={t('mail.actions.close')} />}

      {/* Middle: list */}
      <section className={clsx('min-w-0 flex-col border-r border-line bg-card lg:flex lg:w-[24rem] lg:shrink-0 xl:w-[27rem]', showList ? 'flex flex-1 lg:flex-none' : 'hidden')}>
        <div className="flex items-center gap-1 border-b border-line px-2 py-1.5 lg:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} className="grid size-9 place-items-center rounded-lg text-ink" aria-label={t('mail.sections.folders')}>
            <Menu className="size-5" />
          </button>
          <span className="flex-1 truncate text-sm font-bold">{title}</span>
          <button type="button" onClick={() => startCompose({ mode: 'new', accountId: selection.accountId ?? undefined })} className="grid size-9 place-items-center rounded-lg text-link" aria-label={t('mail.composeButton')}>
            <PenSquare className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <MessageList
            items={items}
            view={selection.view}
            loading={list.isLoading}
            error={list.isError}
            hasMore={!!list.hasNextPage}
            fetchingMore={list.isFetchingNextPage}
            onLoadMore={() => void list.fetchNextPage()}
            onRetry={() => void list.refetch()}
            activeId={messageId}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={openDraft}
            filters={filters}
            onFilters={setFilters}
            threads={threads}
            onThreads={setThreads}
            bulk={bulkFromList}
            myEmails={myEmails}
            searchRef={searchRef}
            title={title}
            aiFilter={aiFilter}
            onAiFilter={triageOn || aiFilter ? setAiFilter : undefined}
          />
        </div>
        <div className="relative">
          <LabelsMenu
            open={bulkMenu === 'label'}
            onClose={() => setBulkMenu(null)}
            labels={labels.data ?? []}
            selected={new Set()}
            onToggle={(label) => {
              setBulkMenu(null);
              run({ ids: [...selected], action: 'label', labelId: label.id }, () => setSelected(new Set()));
            }}
            onManage={() => {
              setBulkMenu(null);
              setSettings('labels');
            }}
          />
          <SnoozeMenu
            open={bulkMenu === 'snooze'}
            onClose={() => setBulkMenu(null)}
            onPick={(v) => {
              setBulkMenu(null);
              act({ type: 'snooze', ...v }, [...selected]);
            }}
          />
        </div>
      </section>

      {/* Right: reading pane */}
      <section className={clsx('min-w-0 flex-1 flex-col bg-canvas', showList ? 'hidden lg:flex' : 'flex')}>
        <ReadingPane
          message={current}
          thread={thread.data}
          loading={message.isLoading}
          error={message.isError}
          conversation={threads}
          folders={folders.data?.folders ?? []}
          labels={labels.data ?? []}
          onAction={(a) => act(a)}
          onBack={messageId ? () => openMessage(null) : undefined}
          onClose={() => openMessage(null)}
          access={current?.access ?? access}
          aiSlot={
            current && triageOn && (current.access ?? 'OWNER') === 'OWNER' ? (
              <TriageCard
                message={current}
                onUseDraft={(d) => startCompose({ mode: 'reply', original: current, accountId: current.accountId, subject: d.subject, html: draftToHtml(d.body) })}
                onSpam={() => act({ type: 'spam' })}
              />
            ) : null
          }
        />
        {!messageId && (
          <button type="button" onClick={() => setShortcutsOpen(true)} className="absolute right-3 bottom-3 hidden items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-muted hover:text-ink lg:inline-flex">
            <Keyboard className="size-3.5" /> {t('mail.actions.shortcuts')}
          </button>
        )}
      </section>

      {compose && (
        <ComposeWindow
          seed={compose}
          accounts={accounts}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            invalidate();
          }}
        />
      )}
      <MailSettingsDialog open={!!settings} onClose={() => setSettings(null)} initialTab={settings ?? 'accounts'} accounts={ownAccounts} />
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t('mail.shortcuts.title')} size="sm">
        <ul className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.keys} className="contents">
              <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{s.keys}</kbd>
              <span className="text-muted">{t(`mail.shortcuts.${s.label}`)}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

/** Opens the browser print dialog with the message (sanitised html) in a minimal page. */
const printMessage = (m: MessageDetail | undefined) => {
  if (!m) return;
  const w = window.open('', '_blank', 'noopener,width=800,height=900');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const line = (k: string, v: string) => (v ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : '');
  const body = (m.html ?? `<pre style="white-space:pre-wrap">${esc(m.text ?? '')}</pre>`).replace(/\sdata-src="/g, ' src="');
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subjectOf(m))}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'"><style>body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:18px}.h{color:#555;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:16px}</style></head><body><h1>${esc(subjectOf(m))}</h1><div class="h">${line('From', m.from ? `${m.from.name} <${m.from.address}>` : '')}${line('To', m.to.map((a) => a.address).join(', '))}${line('Cc', m.cc.map((a) => a.address).join(', '))}${line('Date', new Date(m.date).toLocaleString())}</div>${body}</body></html>`,
  );
  w.document.close();
  w.focus();
  window.setTimeout(() => w.print(), 300);
};
