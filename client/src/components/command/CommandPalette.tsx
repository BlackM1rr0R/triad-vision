import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Briefcase, Building2, Clock, CornerDownLeft, File, Folder, FolderKanban, ListTodo, Loader2, Search, Star, User as UserIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CaseStatus, L10n, Role } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { LOCALES, registerCopy } from '@/i18n';
import { adminCopy } from '@/i18n/admin';
import { workspaceCopy } from '@/i18n/workspace';
import { pagesCalls } from '@/i18n/pagesCalls';
import { pagesTasks } from '@/i18n/pagesTasks';
import { commandPaletteCopy } from '@/i18n/commandPalette';
import { adminNavCopy } from '@/i18n/adminNav';
import { roleLabel, statusLabel } from '@/components/admin/labels';
import { STAFF_NAV, canSee, hrefFor, isVisible, moduleOn, navItemById, type StaffNavItem } from './navRegistry';
import { useStaffNav } from './navPrefs';
import { PALETTE_ACTIONS, type PaletteAction } from './actions';
import { SYNONYMS } from './synonyms';
import { looksLikeRecord, prepHay, queryTokens, scoreMatch, type MatchHay } from './match';
import { clearRecent, pushRecent, readRecent, type RecentEntry, type RecentKind } from './storage';
import { isMacPlatform } from './keys';
import { matchRanges } from '@/components/search/searchUtils';

// Page labels are needed in the workspace too (the admin copy is otherwise registered by AdminLayout).
registerCopy(adminCopy);
registerCopy(workspaceCopy);
registerCopy(pagesCalls);
registerCopy(pagesTasks);
registerCopy(commandPaletteCopy);
registerCopy(adminNavCopy);

// ─── Server search ──────────────────────────────────────────────────────

interface SearchResponse {
  q: string;
  cases: { id: string; number: string; status: CaseStatus; profession: string; clientName: string; exact: boolean }[];
  users: { id: string; name: string; email: string; phone: string | null; role: Role; isActive: boolean }[];
  companies: { id: string; name: string; city: string | null; status: string; vatId: string | null }[];
  vacancies: { id: string; title: L10n; status: string; city: string | null; companyName: string | null }[];
  files: { id: string; name: string; kind: 'FILE' | 'FOLDER'; mimeType: string | null; parentId: string | null; parentName: string | null }[];
  tasks: { id: string; key: string; title: string; status: string; priority: string; dueAt: string | null }[];
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 150;

const useDebounced = (value: string, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(h);
  }, [value, ms]);
  return v;
};

// ─── Entries ────────────────────────────────────────────────────────────

type SectionKey = 'pinned' | 'recent' | 'goto' | 'actions' | 'results';

interface Entry {
  key: string;
  section: SectionKey;
  /** Sub-heading inside "Search results" (cases, users…). */
  type?: keyof Omit<SearchResponse, 'q'>;
  icon: LucideIcon;
  label: string;
  sub?: string;
  meta?: ReactNode;
  href: string;
  recent: RecentEntry;
}

const RESULT_TYPES = ['cases', 'users', 'companies', 'vacancies', 'files', 'tasks'] as const;
const RESULT_ICON: Record<(typeof RESULT_TYPES)[number], LucideIcon> = {
  cases: FolderKanban,
  users: UserIcon,
  companies: Building2,
  vacancies: Briefcase,
  files: File,
  tasks: ListTodo,
};
const RECENT_ICON: Record<RecentKind, LucideIcon> = {
  nav: ArrowRight,
  action: ArrowRight,
  case: FolderKanban,
  user: UserIcon,
  company: Building2,
  vacancy: Briefcase,
  file: File,
  task: ListTodo,
};

const GOTO_EMPTY_LIMIT = 200;
const GOTO_LIMIT = 8;

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role;
  // Favourites (shared with the sidebar) and module toggles: switched-off modules are not offered.
  const { pins, modules, togglePin } = useStaffNav();
  const area: 'admin' | 'workspace' = location.pathname.startsWith('/workspace') ? 'workspace' : 'admin';
  const ids = useId().replace(/:/g, '');
  const listId = `cmdk-list-${ids}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>(() => readRecent(user?.id));
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);

  // Fresh state on every open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setRecent(readRecent(user?.id));
  }, [open, user?.id]);

  const search = useQuery({
    queryKey: ['command-search', debounced],
    queryFn: async ({ signal }) => (await api.get<SearchResponse>('/admin/command-search', { params: { q: debounced }, signal })).data,
    enabled: open && debounced.length >= MIN_CHARS,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Match index: the label in every language + synonyms (rebuilt when the UI language changes).
  const lang = i18n.resolvedLanguage;
  const index = useMemo(() => {
    const others = (key: string, extra: string) =>
      LOCALES.filter((l) => l !== lang)
        .map((l) => i18n.getFixedT(l)(key))
        .concat(extra)
        .join(' , ');
    const nav = STAFF_NAV.filter((n) => isVisible(n, role, modules)).map((item) => ({
      item,
      label: t(item.labelKey),
      hay: { primary: prepHay(t(item.labelKey)), others: prepHay(others(item.labelKey, SYNONYMS[item.id] ?? '')) } as MatchHay,
    }));
    const actions = PALETTE_ACTIONS.filter((a) => canSee(a, role) && moduleOn(modules, a.module)).map((action) => ({
      action,
      label: t(`cmd.actions.${action.id}`),
      hay: { primary: prepHay(t(`cmd.actions.${action.id}`)), others: prepHay(others(`cmd.actions.${action.id}`, SYNONYMS[action.id] ?? '')) } as MatchHay,
    }));
    return { nav, actions };
  }, [i18n, lang, modules, role, t]);

  const navEntry = useCallback(
    (item: StaffNavItem, label: string, section: SectionKey): Entry => {
      const href = hrefFor(item, role);
      // Sub-line: the sidebar group the page lives in.
      const sub = item.area === 'workspace' ? t('cmd.areaWorkspace') : item.group ? t(`admin.nav.groups.${item.group}`) : undefined;
      return { key: `${section}:nav:${item.id}`, section, icon: item.icon, label, sub, href, recent: { key: `nav:${item.id}`, kind: 'nav', id: item.id, label, href } };
    },
    [role, t],
  );
  const actionEntry = useCallback(
    (action: PaletteAction, label: string, section: SectionKey): Entry => {
      const href = action.href(area);
      return {
        key: `${section}:action:${action.id}`,
        section,
        icon: action.icon,
        label,
        sub: action.hint ? t(`cmd.actionHints.${action.id}`) : undefined,
        href,
        recent: { key: `action:${action.id}`, kind: 'action', id: action.id, label, href },
      };
    },
    [area, t],
  );

  const resultEntries = useCallback(
    (data: SearchResponse | undefined): Entry[] => {
      if (!data) return [];
      const tasksBase = area === 'workspace' ? '/workspace/tasks' : '/admin/tasks';
      const out: Entry[] = [];
      const add = (type: Entry['type'] & string, kind: RecentKind, id: string, label: string, sub: string | undefined, href: string, meta?: ReactNode, folder?: boolean) =>
        out.push({
          key: `results:${kind}:${id}`,
          section: 'results',
          type: type as Entry['type'],
          icon: folder ? Folder : RESULT_ICON[type as (typeof RESULT_TYPES)[number]],
          label,
          sub,
          meta,
          href,
          recent: { key: `${kind}:${id}`, kind, id, label, sub, href, folder },
        });
      for (const c of data.cases)
        add('cases', 'case', c.id, `${c.number} · ${c.clientName}`, c.profession, `/admin/cases/${c.id}`, <StatusPill domain="case" status={c.status} label={statusLabel(c.status)} size="sm" />);
      for (const u of data.users)
        add(
          'users',
          'user',
          u.id,
          u.name,
          [roleLabel(u.role), u.email, u.phone, !u.isActive ? t('cmd.inactive') : null].filter(Boolean).join(' · '),
          u.role === 'CLIENT' ? `/admin/candidates?id=${encodeURIComponent(u.id)}` : `/admin/users?search=${encodeURIComponent(u.email)}`,
        );
      for (const c of data.companies) add('companies', 'company', c.id, c.name, [c.city, c.vatId].filter(Boolean).join(' · ') || undefined, `/admin/companies?id=${encodeURIComponent(c.id)}`);
      for (const v of data.vacancies)
        add('vacancies', 'vacancy', v.id, tr(v.title) || '—', [v.companyName, v.city].filter(Boolean).join(' · ') || undefined, `/admin/vacancies?id=${encodeURIComponent(v.id)}`);
      for (const f of data.files) {
        const folder = f.kind === 'FOLDER';
        const target = folder ? f.id : f.parentId;
        add(
          'files',
          'file',
          f.id,
          f.name,
          [folder ? t('cmd.folder') : t('cmd.file'), f.parentName ? t('cmd.inFolder', { name: f.parentName }) : null].filter(Boolean).join(' · '),
          target ? `/workspace/drive/f/${encodeURIComponent(target)}` : '/workspace/drive',
          undefined,
          folder,
        );
      }
      for (const k of data.tasks) add('tasks', 'task', k.id, `${k.key} · ${k.title}`, undefined, `${tasksBase}/${k.key}`, <StatusPill domain="task" status={k.status} label={t(`tasks.status.${k.status}`, { defaultValue: k.status })} size="sm" />);
      return out;
    },
    [area, t, tr],
  );

  const q = query.trim();
  const tokens = useMemo(() => queryTokens(q), [q]);
  const serverReady = debounced.length >= MIN_CHARS && q.length >= MIN_CHARS;

  const entries = useMemo<Entry[]>(() => {
    if (!tokens.length) {
      const rec: Entry[] = recent
        .map((r): Entry | null => {
          // Pages and actions re-translate their label; a page the role lost is dropped.
          if (r.kind === 'nav') {
            const item = navItemById(r.id);
            return item && isVisible(item, role, modules) ? navEntry(item, t(item.labelKey), 'recent') : null;
          }
          if (r.kind === 'action') {
            const action = PALETTE_ACTIONS.find((a) => a.id === r.id);
            return action && canSee(action, role) && moduleOn(modules, action.module) ? actionEntry(action, t(`cmd.actions.${action.id}`), 'recent') : null;
          }
          return { key: `recent:${r.key}`, section: 'recent', icon: r.folder ? Folder : RECENT_ICON[r.kind] ?? Clock, label: r.label, sub: r.sub, href: r.href, recent: r };
        })
        .filter((e): e is Entry => !!e);
      const pinned = pins
        .map(navItemById)
        .filter((i): i is StaffNavItem => !!i && isVisible(i, role, modules))
        .map((i) => navEntry(i, t(i.labelKey), 'pinned'));
      return [
        ...pinned,
        ...rec,
        ...index.actions.map((a) => actionEntry(a.action, a.label, 'actions')),
        ...index.nav.slice(0, GOTO_EMPTY_LIMIT).map((n) => navEntry(n.item, n.label, 'goto')),
      ];
    }
    const rank = <T extends { hay: MatchHay }>(list: T[]) =>
      list
        .map((x) => ({ x, s: scoreMatch(tokens, x.hay) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.x);
    const goto = rank(index.nav)
      .slice(0, GOTO_LIMIT)
      .map((n) => navEntry(n.item, n.label, 'goto'));
    const actions = rank(index.actions).map((a) => actionEntry(a.action, a.label, 'actions'));
    const results = serverReady ? resultEntries(search.data) : [];
    return looksLikeRecord(q) ? [...results, ...goto, ...actions] : [...goto, ...actions, ...results];
  }, [actionEntry, index, modules, navEntry, pins, q, recent, resultEntries, role, search.data, serverReady, t, tokens]);

  // Keep the highlight inside the list as it changes.
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (active >= entries.length) setActive(Math.max(0, entries.length - 1));
  }, [active, entries.length]);

  const optionId = (i: number) => `cmdk-opt-${ids}-${i}`;
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const run = (entry: Entry, newTab = false) => {
    setRecent(pushRecent(user?.id, entry.recent));
    if (newTab) {
      window.open(entry.href, '_blank', 'noopener');
      return;
    }
    onClose();
    navigate(entry.href);
  };

  /** Index of the first entry of the next / previous section (Tab / Shift+Tab). */
  const sectionJump = (dir: 1 | -1) => {
    if (!entries.length) return active;
    const starts = entries.map((e, i) => (i === 0 || entries[i - 1].section !== e.section || entries[i - 1].type !== e.type ? i : -1)).filter((i) => i >= 0);
    const cur = starts.filter((s) => s <= active).pop() ?? 0;
    const pos = starts.indexOf(cur);
    const next = starts[(pos + dir + starts.length) % starts.length];
    return next;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (entries.length) setActive((i) => (i + 1) % entries.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (entries.length) setActive((i) => (i - 1 + entries.length) % entries.length);
        break;
      case 'PageDown':
        e.preventDefault();
        setActive((i) => Math.min(entries.length - 1, i + 8));
        break;
      case 'PageUp':
        e.preventDefault();
        setActive((i) => Math.max(0, i - 8));
        break;
      case 'Enter': {
        const entry = entries[active];
        if (!entry) return;
        e.preventDefault();
        run(entry, e.ctrlKey || e.metaKey);
        break;
      }
      case 'd':
      case 'D': {
        // Ctrl+D / ⌘D (like a browser bookmark): add the highlighted page to the favourites, or remove it.
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) break;
        const entry = entries[active];
        e.preventDefault();
        if (entry?.recent.kind === 'nav') togglePin(entry.recent.id);
        break;
      }
      case 'Tab':
        // Tab moves between sections instead of leaving the field (the modal's focus trap must not see it).
        e.preventDefault();
        e.stopPropagation();
        setActive(sectionJump(e.shiftKey ? -1 : 1));
        break;
      case 'Escape':
        // First Escape clears the query; the next one closes the dialog (handled by the overlay stack).
        if (query) {
          e.preventDefault();
          setQuery('');
        }
        break;
    }
  };

  const status = (() => {
    if (q.length > 0 && q.length < MIN_CHARS) return t('cmd.minChars');
    if (!serverReady) return null;
    if (search.isError) return (search.error as { response?: { status?: number } })?.response?.status === 429 ? t('cmd.tooMany') : t('cmd.error');
    if (search.isFetching && !search.data) return t('cmd.searching');
    if (!entries.length && !search.isFetching) return t('cmd.noResults', { q });
    return null;
  })();

  const sectionTitle = (e: Entry) => (e.section === 'results' && e.type ? t(`cmd.types.${e.type}`) : t(`cmd.sections.${e.section}`));
  const mac = isMacPlatform();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cmd.title')}
      size="lg"
      align="top"
      mobile="full"
      padded={false}
      zIndex={90}
      initialFocus={inputRef}
      className="sm:max-h-[min(80vh,42rem)]"
      footer={
        <div className="hidden w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted sm:flex" aria-hidden>
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('cmd.hints.move')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>{' '}
            {t('cmd.hints.open')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Tab</Kbd> {t('cmd.hints.section')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> {t('cmd.hints.close')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>D</Kbd> <Star className="size-3" /> {t('cmd.pinHint')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>{' '}
            ↗
          </span>
        </div>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-card px-4 py-3 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={entries[active] ? optionId(active) : undefined}
            aria-label={t('cmd.inputLabel')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('cmd.placeholder')}
            className="input h-11 w-full pr-10 pl-9 text-base sm:text-sm"
          />
          {search.isFetching && serverReady && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status ?? (q ? t('cmd.listLabel') + `: ${entries.length}` : '')}
      </div>

      <ul id={listId} role="listbox" aria-label={t('cmd.listLabel')} className="px-2 py-2 sm:px-3">
        {entries.map((e, i) => {
          const head = i === 0 || entries[i - 1].section !== e.section || entries[i - 1].type !== e.type;
          const isActive = i === active;
          return (
            <li key={e.key} role="presentation">
              {head && (
                <div className="flex items-center justify-between px-2 pt-3 pb-1 first:pt-1" role="presentation">
                  <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{sectionTitle(e)}</span>
                  {e.section === 'recent' && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        clearRecent(user?.id);
                        setRecent([]);
                        inputRef.current?.focus();
                      }}
                      className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-link hover:bg-sunken"
                    >
                      {t('cmd.clearRecent')}
                    </button>
                  )}
                </div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={isActive}
                onMouseMove={() => !isActive && setActive(i)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={(ev) => run(e, ev.ctrlKey || ev.metaKey)}
                className={clsx('group/opt flex min-h-10 sm:min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm', isActive ? 'bg-primary/[0.06] text-ink dark:bg-white/10' : 'text-ink')}
              >
                <span className={clsx('grid size-8 shrink-0 place-items-center rounded-md border', isActive ? 'border-primary/25 bg-card text-link' : 'border-line bg-sunken text-muted')}>
                  <e.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    <Highlight text={e.label} tokens={tokens} />
                  </span>
                  {e.sub && <span className="block truncate text-xs text-muted">{e.sub}</span>}
                </span>
                {e.meta && <span className="hidden shrink-0 sm:inline-flex">{e.meta}</span>}
                {e.recent.kind === 'nav' && (
                  // Mouse shortcut for Ctrl+D; keyboard and screen-reader users get the shortcut (option stays one control).
                  <span
                    aria-hidden
                    title={`${pins.includes(e.recent.id) ? t('admin.layout.unpin') : t('admin.layout.pin')} (${mac ? '⌘' : 'Ctrl'}+D)`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      togglePin(e.recent.id);
                    }}
                    className={clsx(
                      'grid size-7 shrink-0 place-items-center rounded-md transition hover:bg-sunken',
                      pins.includes(e.recent.id) ? 'text-warning-fg' : isActive ? 'text-muted' : 'text-transparent group-hover/opt:text-muted',
                    )}
                  >
                    <Star className={clsx('size-3.5', pins.includes(e.recent.id) && 'fill-current')} />
                  </span>
                )}
                {e.recent.kind === 'nav' && pins.includes(e.recent.id) && <span className="sr-only">({t('cmd.sections.pinned')})</span>}
                {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
      {status && <p className="px-5 pb-5 text-center text-sm text-muted" aria-hidden>{status}</p>}
      {serverReady && search.isFetching && !entries.some((e) => e.section === 'results') && !status && (
        <p className="flex items-center justify-center gap-2 px-5 pb-5 text-sm text-muted" aria-hidden>
          <Loader2 className="size-4 animate-spin" /> {t('cmd.searching')}
        </p>
      )}
    </Modal>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-line bg-card px-1 py-0.5 font-sans text-[11px] leading-none font-semibold text-muted">{children}</kbd>
);

/** Bold for the matched parts of a label (diacritic-insensitive). */
const Highlight = ({ text, tokens }: { text: string; tokens: string[] }) => {
  const ranges = useMemo(() => matchRanges(text, tokens), [text, tokens]);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], k) => {
    if (s > pos) parts.push(text.slice(pos, s));
    parts.push(
      <mark key={k} className="bg-transparent font-bold text-link dark:text-brand-300">
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
};
