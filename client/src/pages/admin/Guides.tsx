import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookOpen, ExternalLink, Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy, SITE_LOCALES, type SiteLocale } from '@/i18n';
import { pagesSeoAdmin } from '@/i18n/pagesSeoAdmin';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { CharCount, SeoSnippet } from '@/components/admin/SeoSnippet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Flag } from '@/components/ui/Flag';
import { useL10n } from '@/lib/l10n';

registerCopy(pagesSeoAdmin);

interface ListItem {
  id: string;
  key: string;
  locale: SiteLocale;
  slug: string;
  title: string;
  description: string;
  published: boolean;
  updatedAt: string;
  path: string;
}

interface Draft {
  id?: string;
  key: string;
  locale: SiteLocale;
  slug: string;
  title: string;
  description: string;
  body: string;
  faq: { q: string; a: string }[];
  published: boolean;
}

const LIST_KEY = ['admin', 'guides'];
const empty = (key = '', locale: SiteLocale = 'az'): Draft => ({ key, locale, slug: '', title: '', description: '', body: '', faq: [], published: true });

/** Lowercase ASCII slug from a title (Azerbaijani, Turkish, German, Cyrillic transliterated). */
const slugify = (s: string) => {
  const map: Record<string, string> = {
    ə: 'e', ı: 'i', ğ: 'g', ş: 's', ç: 'c', ö: 'o', ü: 'u', ä: 'a', ß: 'ss', а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
    ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '',
  };
  return s
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
};

/** Admin → Guides: topic guides per key and language (markdown editor with server-rendered preview). */
export default function AdminGuides() {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ items: ListItem[] }>('/admin/guides')).data.items });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const keys = useMemo(() => [...new Set((data ?? []).map((g) => g.key))], [data]);
  const byKey = (key: string) => (data ?? []).filter((g) => g.key === key);
  const g = (k: string) => t(`seoAdmin.guides.${k}`);

  const open = async (id: string) => {
    try {
      const { item } = (await api.get<{ item: Draft & { faq: unknown } }>(`/admin/guides/${id}`)).data;
      setDraft({ ...item, faq: Array.isArray(item.faq) ? (item.faq as Draft['faq']) : [] });
      setPreview(null);
    } catch (err) {
      toastError(err);
    }
  };
  const startLanguage = (key: string, locale: SiteLocale) => {
    setDraft(empty(key, locale));
    setPreview(null);
  };
  const copyFrom = async (id: string) => {
    try {
      const { item } = (await api.get<{ item: Draft & { faq: unknown } }>(`/admin/guides/${id}`)).data;
      setDraft((d) => (d ? { ...d, title: item.title, description: item.description, body: item.body, faq: Array.isArray(item.faq) ? (item.faq as Draft['faq']) : [] } : d));
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    if (!preview || !draft) return;
    const id = window.setTimeout(async () => {
      try {
        setPreview((await api.post<{ html: string }>('/admin/guides/preview', { body: draft.body, locale: draft.locale })).data);
      } catch {
        /* keep the last preview */
      }
    }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.body, draft?.locale, !!preview]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const body = { ...draft, faq: draft.faq.filter((f) => f.q.trim() && f.a.trim()) };
    delete (body as { id?: string }).id;
    try {
      const res = draft.id ? await api.put<{ item: Draft }>(`/admin/guides/${draft.id}`, body) : await api.post<{ item: Draft }>('/admin/guides', body);
      setDraft((d) => (d ? { ...d, id: res.data.item.id } : d));
      await qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: ['guides'] });
      toast.success(g('saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api.delete(`/admin/guides/${draft.id}`);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: LIST_KEY });
      toast.success(g('deleted'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const sitePath = draft ? `${draft.locale === 'az' ? '' : `/${draft.locale}`}/guides/${draft.slug || '…'}` : '';
  const siblings = draft ? byKey(draft.key).filter((x) => x.locale !== draft.locale) : [];

  return (
    <div className="space-y-6">
      <PageHead
        title={g('title')}
        subtitle={g('subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => startLanguage('', 'az')}>
            <Plus className="size-4" aria-hidden /> {g('newGuide')}
          </button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title={g('title')} icon={BookOpen}>
          {!keys.length ? (
            <EmptyState icon={BookOpen} title={g('empty')} />
          ) : (
            <ul className="space-y-4">
              {keys.map((key) => (
                <li key={key}>
                  <p className="font-mono text-xs font-semibold text-muted">{key}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SITE_LOCALES.map((l) => {
                      const item = byKey(key).find((x) => x.locale === l);
                      const active = draft?.key === key && draft.locale === l;
                      return (
                        <button
                          key={l}
                          type="button"
                          onClick={() => (item ? open(item.id) : startLanguage(key, l))}
                          title={item ? item.title : `${g('addLanguage')} (${l})`}
                          className={clsx(
                            'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold',
                            active ? 'border-brand-500 bg-brand-50 text-brand-700' : item ? 'border-line text-ink hover:border-brand-400' : 'border-dashed border-line text-muted hover:text-ink',
                            item && !item.published && 'opacity-60',
                          )}
                        >
                          <Flag code={l} className="w-4" /> {l.toUpperCase()}
                          {!item && <Plus className="size-3" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {draft && (
          <Panel
            title={draft.id ? draft.title || draft.key : g('newGuide')}
            icon={Pencil}
            actions={
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)} aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="guide-key">
                    {g('key')}
                  </label>
                  <input id="guide-key" className="input font-mono" value={draft.key} disabled={!!draft.id} onChange={(e) => set('key', slugify(e.target.value))} placeholder="chancenkarte" />
                </div>
                <div>
                  <label className="label" htmlFor="guide-locale">
                    {g('locale')}
                  </label>
                  <select id="guide-locale" className="input" value={draft.locale} disabled={!!draft.id} onChange={(e) => set('locale', e.target.value as SiteLocale)}>
                    {SITE_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {l.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="guide-slug">
                    {g('slug')}
                  </label>
                  <input id="guide-slug" className="input font-mono" value={draft.slug} onChange={(e) => set('slug', slugify(e.target.value))} onFocus={() => !draft.slug && draft.title && set('slug', slugify(draft.title))} />
                </div>
              </div>

              {!draft.id && siblings.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {g('copyFrom')}:
                  {siblings.map((s) => (
                    <button key={s.id} type="button" className="btn-ghost btn-sm" onClick={() => copyFrom(s.id)}>
                      <Flag code={s.locale} className="w-4" /> {s.locale.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="guide-title">
                    {g('titleField')}
                  </label>
                  <CharCount value={draft.title} max={60} label={(count, max) => t('seoAdmin.guides.chars', { count, max })} />
                </div>
                <input id="guide-title" className="input" value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="guide-desc">
                    {g('description')}
                  </label>
                  <CharCount value={draft.description} max={155} label={(count, max) => t('seoAdmin.guides.chars', { count, max })} />
                </div>
                <textarea id="guide-desc" className="input min-h-20" value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={400} />
              </div>
              <SeoSnippet title={draft.title} description={draft.description} url={sitePath} caption={t('seoAdmin.seo.snippet')} />

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="label" htmlFor="guide-body">
                    {g('body')}
                  </label>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setPreview(preview ? null : { html: '' })}>
                    {preview ? <Pencil className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {preview ? g('edit') : g('preview')}
                  </button>
                </div>
                <p className="mb-2 text-[11px] leading-snug text-muted">{g('bodyHelp')}</p>
                {preview ? (
                  // Rendered by the server's safe markdown renderer (all text escaped), exactly like the site.
                  <div className="prose-guide max-h-[70vh] overflow-y-auto rounded-xl border border-line p-5" dangerouslySetInnerHTML={{ __html: preview.html }} />
                ) : (
                  <textarea id="guide-body" className="input min-h-[28rem] font-mono text-sm leading-relaxed" value={draft.body} onChange={(e) => set('body', e.target.value)} spellCheck />
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="label">{g('faq')}</legend>
                {draft.faq.map((f, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <input className="input" placeholder={g('question')} value={f.q} onChange={(e) => set('faq', draft.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                      <textarea className="input min-h-16" placeholder={g('answer')} value={f.a} onChange={(e) => set('faq', draft.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                    </div>
                    <button type="button" className="btn-ghost btn-sm self-start text-red-600" onClick={() => set('faq', draft.faq.filter((_, j) => j !== i))} aria-label="Remove">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-ghost btn-sm" onClick={() => set('faq', [...draft.faq, { q: '', a: '' }])} disabled={draft.faq.length >= 20}>
                  <Plus className="size-4" aria-hidden /> {g('addFaq')}
                </button>
              </fieldset>

              <Switch checked={draft.published} onChange={(v) => set('published', v)} label={g('published')} />

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <button type="button" className="btn-primary" onClick={save} disabled={busy || !draft.key || !draft.slug || !draft.title || !draft.description}>
                  <Save className="size-4" aria-hidden /> {draft.id ? g('save') : g('create')}
                </button>
                {draft.id && (
                  <a href={sitePath} target="_blank" rel="noreferrer" className="btn-ghost">
                    <ExternalLink className="size-4" aria-hidden /> {g('open')}
                  </a>
                )}
                {draft.id && (
                  <button type="button" className="btn-ghost ml-auto text-red-600" onClick={() => setConfirm(true)} disabled={busy}>
                    <Trash2 className="size-4" aria-hidden /> {g('delete')}
                  </button>
                )}
              </div>
              {draft.id && byKey(draft.key).find((x) => x.locale === draft.locale) && (
                <p className="text-xs text-muted">{t('seoAdmin.guides.updated', { date: date(byKey(draft.key).find((x) => x.locale === draft.locale)!.updatedAt) })}</p>
              )}
            </div>
          </Panel>
        )}
      </div>

      <ConfirmDialog open={confirm} title={g("confirmDelete")} onClose={() => setConfirm(false)} onConfirm={remove} loading={busy} />
    </div>
  );
}
