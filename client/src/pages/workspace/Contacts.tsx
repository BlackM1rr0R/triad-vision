import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BookUser, Building2, CheckSquare, Lock, Merge, Plus, Search, Sparkles, Upload, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWorkspace } from '@/i18n/pagesWorkspace';
import { usePageTitle } from '@/lib/usePageTitle';
import { type Contact, useContacts, useTags } from '@/components/workspace/api';
import { ContactDrawer } from '@/components/workspace/ContactDrawer';
import { NewContactDialog } from '@/components/workspace/ContactForm';
import { ImportExportDialog, MergeDialog, SuggestionsPanel } from '@/components/workspace/ContactDialogs';
import { Avatar, Chip, Empty, Skeleton, fullName } from '@/components/workspace/ui';

registerCopy(pagesWorkspace);

const SORTS = ['name', 'recent', 'company', 'lastContact'] as const;
type Sort = (typeof SORTS)[number];
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const PAGE = 100;

const letterOf = (c: Contact) => {
  const ch = (c.lastName || c.firstName).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : ch ? ch.normalize('NFD').replace(/[^A-Z]/g, '') || ch : '#';
};

/** Shared address book: search, filters, tag chips, company grouping, letter index, detail drawer. */
export default function WorkspaceContacts() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  usePageTitle(t('ws.contacts.title'));

  const q = sp.get('q') ?? '';
  const tag = sp.get('tag') ?? '';
  const shared = sp.get('shared') ?? '';
  const sort: Sort = SORTS.find((s) => s === sp.get('sort')) ?? 'name';
  const letter = sp.get('letter') ?? '';
  const group = sp.get('group') === '1';
  const selectedId = sp.get('c');
  const [search, setSearch] = useState(q);
  const [pages, setPages] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'new' | 'import' | 'merge' | 'suggest' | null>(sp.get('new') === '1' ? 'new' : null);
  const searchRef = useRef<HTMLInputElement>(null);

  const patch = useCallback(
    (p: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(p)) {
            if (v === null || v === '') n.delete(k);
            else n.set(k, v);
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  // Debounced search → URL.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (search.trim() !== q) patch({ q: search.trim() || null, letter: null });
    }, 250);
    return () => window.clearTimeout(id);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPages(1), [q, tag, shared, sort, letter]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(el?.tagName ?? '') && !dialog) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: String(PAGE * pages), sort };
    if (q) p.q = q;
    if (tag) p.tag = tag;
    if (shared) p.shared = shared;
    if (letter && letter !== '#') p.letter = letter;
    return p;
  }, [q, tag, shared, sort, letter, pages]);
  const list = useContacts(params);
  const tags = useTags();
  const items = useMemo(() => {
    const all = list.data?.items ?? [];
    return letter === '#' ? all.filter((c) => letterOf(c) === '#') : all;
  }, [list.data, letter]);
  const total = list.data?.total ?? 0;
  const hasMore = !!list.data && list.data.items.length < list.data.total;
  const anyFilter = !!(q || tag || shared || letter);
  const letters = useMemo(() => new Set(items.map(letterOf)), [items]);

  const groups = useMemo(() => {
    if (!group) return null;
    const m = new Map<string, Contact[]>();
    for (const c of items) {
      const k = c.company?.trim() || '';
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));
  }, [items, group]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const selectedContacts = items.filter((c) => selected.has(c.id));

  const row = (c: Contact) => {
    const active = c.id === selectedId;
    return (
      <li key={c.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => (selecting ? toggleSelect(c.id) : patch({ c: c.id }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (selecting) toggleSelect(c.id);
              else patch({ c: c.id });
            }
          }}
          className={clsx('flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-sunken lg:px-6', active && 'bg-primary/[0.06]', selected.has(c.id) && 'bg-primary/[0.06]')}
        >
          {selecting && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} onClick={(e) => e.stopPropagation()} className="size-4 accent-primary" aria-label={t('ws.contacts.actions.select')} />}
          <Avatar id={c.id} person={c} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
              {fullName(c)}
              {!c.shared && <Lock className="size-3 text-muted" aria-label={t('ws.contacts.drawer.privateHint')} />}
            </p>
            <p className="truncate text-xs text-muted">{[c.position, c.company, c.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
            {c.tags.slice(0, 3).map((x) => (
              <Chip key={x} tone={tag.toLowerCase() === x.toLowerCase() ? 'brand' : 'neutral'} className="text-[0.65rem]">
                {x}
              </Chip>
            ))}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b border-line bg-card px-4 pt-4 pb-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-10 place-items-center rounded-xl bg-primary text-primary-contrast shadow-[var(--tv-shadow-card)] sm:grid">
              <BookUser className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 type-page-title">
                {t('ws.contacts.title')}
                {list.data && <span className="rounded-full bg-sunken px-2 py-0.5 font-sans text-xs font-semibold text-muted tabular-nums ring-1 ring-line">{total}</span>}
              </h1>
              <p className="hidden truncate text-xs text-muted sm:block">{t('ws.contacts.subtitle')}</p>
            </div>
          </div>
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ws.contacts.search')} aria-label={t('ws.common.search')} className="input h-9 pr-8 pl-9" />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink" aria-label={t('ws.common.close')}>
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selecting ? (
              <>
                <span className="text-xs font-semibold text-muted">{t('ws.contacts.selected', { count: selected.size })}</span>
                <button type="button" onClick={() => setDialog('merge')} disabled={selected.size < 2} className="btn-primary btn-sm h-9 px-3">
                  <Merge className="size-4" /> {t('ws.contacts.actions.merge')}
                </button>
                <button type="button" onClick={stopSelecting} className="btn-secondary btn-sm h-9 border border-line px-3">
                  {t('ws.common.cancel')}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setSelecting(true)} className="btn-secondary btn-sm h-9 border border-line px-3" title={t('ws.contacts.actions.merge')}>
                  <CheckSquare className="size-4" /> <span className="hidden md:inline">{t('ws.contacts.actions.merge')}</span>
                </button>
                <button type="button" onClick={() => setDialog('suggest')} className="btn-secondary btn-sm h-9 border border-line px-3" title={t('ws.contacts.actions.suggestions')}>
                  <Sparkles className="size-4" /> <span className="hidden md:inline">{t('ws.contacts.actions.suggestions')}</span>
                </button>
                <button type="button" onClick={() => setDialog('import')} className="btn-secondary btn-sm h-9 border border-line px-3" title={t('ws.contacts.actions.import')}>
                  <Upload className="size-4" /> <span className="hidden md:inline">{t('ws.contacts.actions.import')}</span>
                </button>
                <button type="button" onClick={() => setDialog('new')} className="btn-primary btn-sm h-9 px-4">
                  <Plus className="size-4" /> <span className="hidden sm:inline">{t('ws.contacts.new')}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-sunken p-0.5">
            {(['', 'true', 'false'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={shared === v} onClick={() => patch({ shared: v || null })} className={clsx('rounded-md px-2.5 py-1 text-xs font-semibold', shared === v ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink')}>
                {v === '' ? t('ws.contacts.filters.all') : v === 'true' ? t('ws.contacts.filters.shared') : t('ws.contacts.filters.private')}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => patch({ sort: e.target.value === 'name' ? null : e.target.value })} aria-label={t('ws.contacts.filters.sort')} className="input h-8 w-auto py-0 text-xs">
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`ws.contacts.filters.sort${s[0].toUpperCase()}${s.slice(1)}`)}
              </option>
            ))}
          </select>
          <button type="button" aria-pressed={group} onClick={() => patch({ group: group ? null : '1' })} className={clsx('inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold', group ? 'border-line-strong bg-primary/[0.06] text-link' : 'border-line bg-sunken text-muted hover:text-ink')}>
            <Building2 className="size-3.5" /> {t('ws.contacts.filters.group')}
          </button>
          {(tags.data ?? []).slice(0, 12).map((x) => (
            <button key={x.tag} type="button" aria-pressed={tag.toLowerCase() === x.tag.toLowerCase()} onClick={() => patch({ tag: tag.toLowerCase() === x.tag.toLowerCase() ? null : x.tag })} className={clsx('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold', tag.toLowerCase() === x.tag.toLowerCase() ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-sunken text-muted hover:text-ink')}>
              {x.tag} <span className="opacity-70 tabular-nums">{x.count}</span>
            </button>
          ))}
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                patch({ q: null, tag: null, shared: null, letter: null });
              }}
              className="inline-flex h-7 items-center gap-1 text-xs font-semibold text-link hover:underline"
            >
              <X className="size-3.5" /> {t('ws.contacts.filters.clear')}
            </button>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 bg-sunken">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="space-y-2 p-4 lg:p-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !items.length ? (
            <Empty icon={BookUser} className="py-16">
              {anyFilter ? t('ws.contacts.emptySearch') : t('ws.contacts.empty')}
            </Empty>
          ) : groups ? (
            <div className="divide-y divide-line">
              {groups.map(([company, rows]) => (
                <section key={company || '__none'}>
                  <h2 className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-card px-4 py-1.5 text-xs font-bold text-muted uppercase lg:px-6">
                    <Building2 className="size-3.5" aria-hidden /> {company || t('ws.contacts.noCompany')} <span className="font-normal tabular-nums">· {rows.length}</span>
                  </h2>
                  <ul className="divide-y divide-line bg-card">{rows.map(row)}</ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line bg-card">{items.map(row)}</ul>
          )}
          {hasMore && !list.isLoading && (
            <div className="p-4 text-center">
              <button type="button" onClick={() => setPages((p) => p + 1)} className="btn-secondary btn-sm">
                {t('ws.common.more')}
              </button>
            </div>
          )}
        </div>

        <nav className="hidden w-7 shrink-0 flex-col items-center justify-center gap-0 border-l border-line bg-card py-2 sm:flex" aria-label={t('ws.contacts.letters')}>
          {LETTERS.map((L) => {
            const present = letters.has(L) || !!(letter && letter === L);
            return (
              <button
                key={L}
                type="button"
                onClick={() => patch({ letter: letter === L ? null : L })}
                disabled={!present && !letter}
                aria-pressed={letter === L}
                className={clsx('grid h-[1.15rem] w-5 place-items-center rounded text-[0.62rem] font-bold leading-none transition', letter === L ? 'bg-primary text-primary-contrast' : present ? 'text-ink hover:bg-primary/[0.06]' : 'text-muted opacity-60')}
              >
                {L}
              </button>
            );
          })}
        </nav>

        <ContactDrawer id={selectedId} onClose={() => patch({ c: null })} />
      </div>

      <NewContactDialog
        open={dialog === 'new'}
        onClose={() => {
          setDialog(null);
          if (sp.get('new')) patch({ new: null });
        }}
        onCreated={(c) => patch({ c: c.id })}
      />
      <ImportExportDialog open={dialog === 'import'} onClose={() => setDialog(null)} />
      <MergeDialog open={dialog === 'merge'} onClose={() => setDialog(null)} contacts={selectedContacts} onMerged={stopSelecting} />
      <SuggestionsPanel open={dialog === 'suggest'} onClose={() => setDialog(null)} onAdded={(c) => patch({ c: c.id })} />
    </div>
  );
}
