import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookOpenText, Copy, Eye, FolderPlus, Pencil, Pin, PinOff, Plus, Save, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDateTime, fullName } from '@/components/admin/labels';
import { Markdown, markdownToText } from '@/components/ops/Markdown';
import { copyText, toastOpsError } from '@/components/ops/shared';

registerCopy(pagesOps);

interface Category { id: string; name: string; sortOrder: number; articles: number }
interface ArticleRow {
  id: string;
  categoryId: string | null;
  title: string;
  tags: string[];
  pinned: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  updatedBy: { id: string; firstName: string; lastName: string } | null;
}
interface Article extends ArticleRow { body: string }
interface SearchHit extends ArticleRow { excerpt: string }

type Selection = { kind: 'all' } | { kind: 'pinned' } | { kind: 'none' } | { kind: 'cat'; id: string };

const useDebounced = (value: string, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
};

// ─── Editor ─────────────────────────────────────────────────────────────

const Editor = ({ article, categories, isAdmin, onSaved, onCancel }: { article: Article | null; categories: Category[]; isAdmin: boolean; onSaved: (a: Article) => void; onCancel: () => void }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? '');
  const [tags, setTags] = useState(article?.tags.join(', ') ?? '');
  const [published, setPublished] = useState(article?.published ?? true);
  const [pinned, setPinned] = useState(article?.pinned ?? false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        body,
        categoryId: categoryId || null,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
        published,
        ...(isAdmin ? { pinned } : {}),
      };
      const res = article ? await api.patch<{ article: Article }>(`/admin/ops/kb/articles/${article.id}`, payload) : await api.post<{ article: Article }>('/admin/ops/kb/articles', payload);
      return res.data.article;
    },
    onSuccess: (a) => {
      toast.success(t('ops.kb.saved'));
      onSaved(a);
    },
    onError: toastOpsError,
  });

  return (
    <form
      className="flex h-full flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim().length >= 2) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div>
          <label className="label" htmlFor="kb-title">{t('ops.kb.editor.title')}</label>
          <input id="kb-title" data-autofocus className="input text-base font-semibold" required minLength={2} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="kb-cat">{t('ops.kb.editor.category')}</label>
          <select id="kb-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('ops.kb.editor.noCategory')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">{t('ops.kb.editor.body')}</span>
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            {(['write', 'preview'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setTab(v)} className={clsx('inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold', tab === v ? 'bg-navy-900 text-white' : 'text-ink/70')}>
                {v === 'write' ? <Pencil className="size-3" /> : <Eye className="size-3" />} {t(`ops.kb.editor.${v}`)}
              </button>
            ))}
          </div>
        </div>
        {tab === 'write' ? (
          <textarea className="input min-h-80 font-mono text-[13px] leading-relaxed" value={body} maxLength={100_000} placeholder={t('ops.kb.editor.bodyPh')} onChange={(e) => setBody(e.target.value)} />
        ) : (
          <div className="min-h-80 rounded-lg border border-line bg-white p-4">{body.trim() ? <Markdown source={body} /> : <p className="text-sm text-muted">{t('ops.kb.editor.emptyPreview')}</p>}</div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="kb-tags">{t('ops.kb.editor.tags')}</label>
          <input id="kb-tags" className="input" value={tags} placeholder={t('ops.kb.editor.tagsHint')} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="size-4" checked={published} onChange={(e) => setPublished(e.target.checked)} /> {published ? t('ops.kb.editor.published') : t('ops.kb.editor.draft')}</label>
          {isAdmin && <label className="inline-flex items-center gap-2"><input type="checkbox" className="size-4" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t('ops.kb.editor.pinned')}</label>}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>{t('ops.common.cancel')}</button>
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || title.trim().length < 2}>
          {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('ops.common.save')}
        </button>
      </div>
    </form>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  usePageTitle(t('ops.kb.title'));
  const qc = useQueryClient();
  const [sel, setSel] = useState<Selection>({ kind: 'all' });
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [articleId, setArticleId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [catModal, setCatModal] = useState<{ id?: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'article' | 'category'; id: string } | null>(null);

  const cats = useQuery({ queryKey: ['kb-categories'], queryFn: async () => (await api.get<{ categories: Category[] }>('/admin/ops/kb/categories')).data.categories });
  const listQs = sel.kind === 'cat' ? `?categoryId=${sel.id}` : sel.kind === 'none' ? '?categoryId=none' : sel.kind === 'pinned' ? '?pinned=true' : '';
  const list = useQuery({ queryKey: ['kb-articles', listQs], queryFn: async () => (await api.get<{ items: ArticleRow[] }>(`/admin/ops/kb/articles${listQs}`)).data.items });
  const search = useQuery({
    queryKey: ['kb-search', dq],
    queryFn: async () => (await api.get<{ items: SearchHit[]; mode: string }>(`/admin/ops/kb/search?q=${encodeURIComponent(dq)}`)).data,
    enabled: dq.length >= 1,
  });
  const article = useQuery({
    queryKey: ['kb-article', articleId],
    queryFn: async () => (await api.get<{ article: Article }>(`/admin/ops/kb/articles/${articleId}`)).data.article,
    enabled: !!articleId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['kb-articles'] });
    void qc.invalidateQueries({ queryKey: ['kb-categories'] });
    void qc.invalidateQueries({ queryKey: ['kb-search'] });
    if (articleId) void qc.invalidateQueries({ queryKey: ['kb-article', articleId] });
  };

  const saveCategory = useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) => (id ? api.patch(`/admin/ops/kb/categories/${id}`, { name }) : api.post('/admin/ops/kb/categories', { name })),
    onSuccess: () => {
      setCatModal(null);
      invalidate();
    },
    onError: toastOpsError,
  });
  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: 'article' | 'category'; id: string }) => api.delete(kind === 'article' ? `/admin/ops/kb/articles/${id}` : `/admin/ops/kb/categories/${id}`),
    onSuccess: (_r, v) => {
      setConfirm(null);
      if (v.kind === 'article') {
        toast.success(t('ops.kb.deleted'));
        setArticleId(null);
      } else if (sel.kind === 'cat' && sel.id === v.id) setSel({ kind: 'all' });
      invalidate();
    },
    onError: toastOpsError,
  });
  const togglePin = useMutation({
    mutationFn: (a: Article) => api.patch(`/admin/ops/kb/articles/${a.id}`, { pinned: !a.pinned }),
    onSuccess: invalidate,
    onError: toastOpsError,
  });

  const rows = useMemo(() => {
    const items = list.data ?? [];
    return tag ? items.filter((a) => a.tags.includes(tag)) : items;
  }, [list.data, tag]);
  const allTags = useMemo(() => [...new Set((list.data ?? []).flatMap((a) => a.tags))].sort(), [list.data]);
  const canEdit = (a: ArticleRow) => isAdmin || a.updatedBy?.id === user?.id;

  const open = (id: string) => {
    setArticleId(id);
    setMode('view');
    setQ('');
  };
  const copyAnswer = async (a: Article) => {
    if (await copyText(markdownToText(a.body))) toast.success(t('ops.kb.copied'));
  };

  const current = article.data && article.data.id === articleId ? article.data : null;

  return (
    <div className="space-y-5">
      <PageHead
        title={t('ops.kb.title')}
        subtitle={t('ops.kb.subtitle')}
        actions={
          <>
            {isAdmin && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCatModal({ name: '' })}>
                <FolderPlus className="size-3.5" /> {t('ops.kb.newCategory')}
              </button>
            )}
            <button type="button" className="btn-primary btn-sm" onClick={() => { setArticleId(null); setMode('new'); }}>
              <Plus className="size-3.5" /> {t('ops.kb.newArticle')}
            </button>
          </>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-10" placeholder={t('ops.kb.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('ops.common.search')} />
        {q && (
          <button type="button" className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface" onClick={() => setQ('')} aria-label={t('ops.common.close')}>
            <X className="size-4" />
          </button>
        )}
        {dq && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
            {search.isLoading ? (
              <p className="px-4 py-3 text-sm text-muted">…</p>
            ) : !search.data?.items.length ? (
              <p className="px-4 py-3 text-sm text-muted">{t('ops.kb.noResults', { q: dq })}</p>
            ) : (
              <ul className="divide-y divide-line">
                <li className="px-4 py-1.5 text-[11px] font-semibold text-muted uppercase">{t('ops.kb.results', { count: search.data.items.length })}</li>
                {search.data.items.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="block w-full px-4 py-2.5 text-left hover:bg-surface" onClick={() => open(h.id)}>
                      <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">{h.pinned && <Pin className="size-3 text-amber-600" />}{h.title}{!h.published && <span className="badge bg-neutral-bg text-neutral-fg">{t('ops.kb.draftBadge')}</span>}</span>
                      <span className="mt-0.5 block text-xs text-muted">{h.excerpt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr] xl:grid-cols-[16rem_20rem_1fr]">
        {/* Categories */}
        <aside className="space-y-1 rounded-xl border border-line bg-white p-2">
          <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ops.kb.categories')}</p>
          {[
            { key: 'all', label: t('ops.kb.allArticles'), s: { kind: 'all' } as Selection },
            { key: 'pinned', label: t('ops.kb.pinned'), s: { kind: 'pinned' } as Selection },
          ].map((row) => (
            <button key={row.key} type="button" onClick={() => { setSel(row.s); setTag(''); }} className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', sel.kind === row.s.kind ? 'bg-navy-900 text-white' : 'text-ink/80 hover:bg-surface')}>
              {row.key === 'pinned' ? <Pin className="size-3.5" /> : <BookOpenText className="size-3.5" />} {row.label}
            </button>
          ))}
          {cats.data?.map((c) => (
            <div key={c.id} className="group flex items-center">
              <button type="button" onClick={() => { setSel({ kind: 'cat', id: c.id }); setTag(''); }} className={clsx('flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm', sel.kind === 'cat' && sel.id === c.id ? 'bg-navy-900 text-white' : 'text-ink/80 hover:bg-surface')}>
                <span className="truncate">{c.name}</span>
                <span className="text-[11px] opacity-70 tabular-nums">{c.articles}</span>
              </button>
              {isAdmin && (
                <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" className="grid size-7 place-items-center rounded text-muted hover:text-navy-900" onClick={() => setCatModal({ id: c.id, name: c.name })} aria-label={t('ops.kb.renameCategory')}><Pencil className="size-3" /></button>
                  <button type="button" className="grid size-7 place-items-center rounded text-muted hover:text-danger" onClick={() => setConfirm({ kind: 'category', id: c.id })} aria-label={t('ops.kb.deleteCategory')}><Trash2 className="size-3" /></button>
                </span>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setSel({ kind: 'none' }); setTag(''); }} className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', sel.kind === 'none' ? 'bg-navy-900 text-white' : 'text-muted hover:bg-surface')}>
            {t('ops.kb.uncategorised')}
          </button>
          {allTags.length > 0 && (
            <div className="border-t border-line pt-2">
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ops.kb.editor.tags')}</p>
              <div className="flex flex-wrap gap-1 px-1.5">
                {allTags.map((tg) => (
                  <button key={tg} type="button" onClick={() => setTag(tag === tg ? '' : tg)} className={clsx('rounded-full border px-2 py-0.5 text-[11px]', tag === tg ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-muted hover:text-navy-900')}>
                    #{tg}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Article list */}
        <section className="min-w-0 rounded-xl border border-line bg-white xl:max-h-[70vh] xl:overflow-y-auto">
          {list.isLoading ? (
            <LoadingBlock className="min-h-40" />
          ) : list.error ? (
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={BookOpenText} title={t('ops.kb.empty')} />
          ) : (
            <ul className="divide-y divide-line">
              <li className="px-4 py-2 text-[11px] font-semibold text-muted">{t('ops.kb.articles', { count: rows.length })}{tag && ` · ${t('ops.kb.tagFilter', { tag })}`}</li>
              {rows.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => open(a.id)} className={clsx('block w-full px-4 py-3 text-left transition hover:bg-surface', a.id === articleId && 'bg-brand-50/60')}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
                      {a.pinned && <Pin className="size-3 shrink-0 text-amber-600" />}
                      <span className="truncate">{a.title}</span>
                      {!a.published && <span className="badge shrink-0 bg-neutral-bg text-neutral-fg">{t('ops.kb.draftBadge')}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {a.category?.name ?? t('ops.kb.uncategorised')} · {fmtDateTime(a.updatedAt)}{a.tags.length ? ` · ${a.tags.map((x) => `#${x}`).join(' ')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reader / editor */}
        <section className="min-w-0 rounded-xl border border-line bg-white p-5 lg:col-span-2 xl:col-span-1 sm:p-6">
          {mode === 'new' || (mode === 'edit' && current) ? (
            <Editor
              key={mode === 'new' ? 'new' : current!.id}
              article={mode === 'new' ? null : current}
              categories={cats.data ?? []}
              isAdmin={isAdmin}
              onCancel={() => setMode('view')}
              onSaved={(a) => {
                invalidate();
                setArticleId(a.id);
                setMode('view');
              }}
            />
          ) : !articleId ? (
            <EmptyState icon={BookOpenText} title={t('ops.kb.selectArticle')} />
          ) : article.isLoading ? (
            <LoadingBlock className="min-h-40" />
          ) : article.error || !current ? (
            <ErrorBlock error={article.error} onRetry={() => article.refetch()} />
          ) : (
            <article>
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold text-navy-900">
                    {current.pinned && <Pin className="size-4 text-amber-600" />}
                    {current.title}
                    {!current.published && <span className="badge bg-neutral-bg text-neutral-fg">{t('ops.kb.draftBadge')}</span>}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {current.category?.name ?? t('ops.kb.uncategorised')} · {t('ops.kb.lastEdited', { name: current.updatedBy ? fullName(current.updatedBy) : '—', date: fmtDateTime(current.updatedAt) })}
                  </p>
                  {current.tags.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                      <Tag className="size-3" /> {current.tags.map((x) => <span key={x} className="rounded-full bg-surface px-2 py-0.5">#{x}</span>)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-primary btn-sm" onClick={() => void copyAnswer(current)}>
                    <Copy className="size-3.5" /> {t('ops.kb.copyAnswer')}
                  </button>
                  {canEdit(current) && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('edit')}>
                      <Pencil className="size-3.5" /> {t('ops.common.edit')}
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button type="button" className="btn-secondary btn-sm" disabled={togglePin.isPending} onClick={() => togglePin.mutate(current)}>
                        {current.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} {current.pinned ? t('ops.kb.unpin') : t('ops.kb.pin')}
                      </button>
                      <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => setConfirm({ kind: 'article', id: current.id })}>
                        <Trash2 className="size-3.5" /> {t('ops.common.delete')}
                      </button>
                    </>
                  )}
                </div>
              </header>
              <Markdown source={current.body} />
            </article>
          )}
        </section>
      </div>

      <Modal
        open={!!catModal}
        onClose={() => setCatModal(null)}
        size="sm"
        title={catModal?.id ? t('ops.kb.renameCategory') : t('ops.kb.newCategory')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCatModal(null)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!catModal?.name.trim() || saveCategory.isPending} onClick={() => catModal && saveCategory.mutate({ id: catModal.id, name: catModal.name.trim() })}>
              {saveCategory.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('ops.common.save')}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="kb-cat-name">{t('ops.kb.categoryName')}</label>
        <input id="kb-cat-name" data-autofocus className="input" maxLength={80} value={catModal?.name ?? ''} onChange={(e) => setCatModal((c) => (c ? { ...c, name: e.target.value } : c))} onKeyDown={(e) => { if (e.key === 'Enter' && catModal?.name.trim()) saveCategory.mutate({ id: catModal.id, name: catModal.name.trim() }); }} />
      </Modal>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm)}
        title={confirm?.kind === 'category' ? t('ops.kb.deleteCategory') : t('ops.kb.confirmDelete')}
        message={confirm?.kind === 'category' ? t('ops.kb.deleteCategoryText') : undefined}
        loading={remove.isPending}
      />
    </div>
  );
}
