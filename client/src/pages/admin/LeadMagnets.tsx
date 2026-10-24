import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookOpen, ExternalLink, Eye, FileUp, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy, SITE_LOCALES, type SiteLocale } from '@/i18n';
import { pagesDiscoverAdmin } from '@/i18n/pagesDiscoverAdmin';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { ImageField } from '@/components/admin/ImageField';
import { L10nInput, emptyL10n, fillFromAz } from '@/components/admin/L10nInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import type { L10n } from '@/lib/types';
import { withLocale } from '@/lib/siteLocale';

registerCopy(pagesDiscoverAdmin);

type Text6 = L10n & { tr?: string; uk?: string };

interface Magnet {
  id: string;
  slug: string;
  title: Text6;
  description: Text6 | null;
  coverUrl: string | null;
  files: Partial<Record<SiteLocale, string>>;
  published: boolean;
  downloads: number;
  leads: number;
}

interface Draft {
  id?: string;
  slug: string;
  title: Text6;
  description: Text6;
  coverUrl: string;
  published: boolean;
}

const LIST_KEY = ['admin', 'lead-magnets'];
const emptyDraft = (): Draft => ({ slug: '', title: { ...emptyL10n(), tr: '', uk: '' }, description: { ...emptyL10n(), tr: '', uk: '' }, coverUrl: '', published: true });
const asText6 = (v: Text6 | null | undefined): Text6 => ({ ...emptyL10n(), tr: '', uk: '', ...(v ?? {}) });
const payloadText = (v: Text6) => ({ ...fillFromAz(v), ...(v.tr?.trim() ? { tr: v.tr.trim() } : {}), ...(v.uk?.trim() ? { uk: v.uk.trim() } : {}) });

/** Admin → Lead magnets: e-books (PDF per language behind an e-mail form) and the generated starter e-book. */
export default function AdminLeadMagnets() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const m = (k: string, o?: Record<string, unknown>) => t(`discoverAdmin.leadMagnets.${k}`, o);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ items: Magnet[] }>('/admin/site-features/lead-magnets')).data.items });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Magnet | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ id: string; lng: SiteLocale } | null>(null);
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof L10n;
  const refresh = () => qc.invalidateQueries({ queryKey: LIST_KEY });

  const save = async () => {
    if (!draft) return;
    if (!draft.slug.trim() || !draft.title.az.trim()) return void toast.error(m('required'));
    setBusy('save');
    try {
      const body = {
        slug: draft.slug.trim().toLowerCase(),
        title: payloadText(draft.title),
        description: draft.description.az.trim() ? payloadText(draft.description) : null,
        coverUrl: draft.coverUrl.trim() || null,
        published: draft.published,
      };
      if (draft.id) await api.put(`/admin/site-features/lead-magnets/${draft.id}`, body);
      else await api.post('/admin/site-features/lead-magnets', body);
      toast.success(draft.id ? m('saved') : m('created'));
      setDraft(null);
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('starter');
    try {
      const { data: res } = await api.post<{ generated: string[] }>('/admin/site-features/lead-magnets/starter');
      toast.success(res.generated.length ? m('starterDone', { langs: res.generated.join(', ').toUpperCase() }) : m('starterNone'));
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const togglePublished = async (item: Magnet, published: boolean) => {
    try {
      await api.put(`/admin/site-features/lead-magnets/${item.id}`, { published });
      await refresh();
    } catch (err) {
      toastError(err);
    }
  };

  const pickFile = (id: string, lng: SiteLocale) => {
    uploadTarget.current = { id, lng };
    fileRef.current?.click();
  };

  const upload = async (file: File) => {
    const target = uploadTarget.current;
    if (!target) return;
    setBusy(`file:${target.id}:${target.lng}`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/admin/site-features/lead-magnets/${target.id}/files/${target.lng}`, fd);
      toast.success(m('uploaded'));
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeFile = async (id: string, lng: SiteLocale) => {
    setBusy(`file:${id}:${lng}`);
    try {
      await api.delete(`/admin/site-features/lead-magnets/${id}/files/${lng}`);
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy('delete');
    try {
      await api.delete(`/admin/site-features/lead-magnets/${deleting.id}`);
      toast.success(m('deleted'));
      setDeleting(null);
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const optionalText = (key: 'title' | 'description', lng: 'tr' | 'uk') => (
    <div>
      <label htmlFor={`lm-${key}-${lng}`} className="label">
        {m(`${lng}${key === 'title' ? 'Title' : 'Description'}`)}
      </label>
      <input
        id={`lm-${key}-${lng}`}
        className="input"
        maxLength={key === 'title' ? 200 : 1000}
        value={draft?.[key][lng] ?? ''}
        onChange={(e) => setDraft((d) => (d ? { ...d, [key]: { ...d[key], [lng]: e.target.value } } : d))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHead
        title={m('title')}
        subtitle={m('subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" disabled={busy === 'starter'} onClick={() => void generate()} title={m('starterHint')}>
              {busy === 'starter' ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />} {m('starter')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" aria-hidden /> {m('new')}
            </button>
          </div>
        }
      />
      <p className="text-xs text-muted">{m('starterHint')}</p>

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />

      {draft && (
        <Panel
          title={draft.id ? m('edit') : m('new')}
          icon={BookOpen}
          actions={
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)} aria-label={m('cancel')}>
              <X className="size-4" aria-hidden />
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="lm-slug" className="label">
                {m('slug')}
              </label>
              <input
                id="lm-slug"
                className="input font-mono text-[13px]"
                value={draft.slug}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              />
              <p className="mt-1 text-[11px] text-muted">{m('slugHint')}</p>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium">
              <Switch checked={draft.published} onChange={(v) => setDraft({ ...draft, published: v })} label={m('published')} />
              {m('published')}
            </label>
            <div className="md:col-span-2">
              <L10nInput label={m('titleField')} value={draft.title} onChange={(v) => setDraft({ ...draft, title: { ...draft.title, ...v } })} required />
            </div>
            {optionalText('title', 'tr')}
            {optionalText('title', 'uk')}
            <div className="md:col-span-2">
              <L10nInput label={m('description')} value={draft.description} onChange={(v) => setDraft({ ...draft, description: { ...draft.description, ...v } })} multiline rows={3} />
            </div>
            {optionalText('description', 'tr')}
            {optionalText('description', 'uk')}
            <div className="md:col-span-2">
              <ImageField label={m('cover')} value={draft.coverUrl} onChange={(url) => setDraft({ ...draft, coverUrl: url })} />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" disabled={busy === 'save'} onClick={() => void save()}>
              {m('save')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              {m('cancel')}
            </button>
          </div>
        </Panel>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState icon={BookOpen} title={m('empty')} />
      ) : (
        <ul className="space-y-4">
          {data.map((item) => (
            <li key={item.id}>
              <Panel bodyClassName="p-5 sm:p-6">
                <div className="flex flex-col gap-5 md:flex-row">
                  <div className="w-24 shrink-0">
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="grid aspect-[3/4] w-full place-items-center rounded-lg bg-navy-900 text-brand-300" aria-hidden>
                        <BookOpen className="size-7" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-bold text-navy-900">{item.title[ui] || item.title.az}</h2>
                        <p className="font-mono text-xs text-muted">/ebook/{item.slug}</p>
                        <p className="mt-1 text-xs text-muted">
                          {m('downloads', { count: item.downloads })} · {m('leads', { count: item.leads })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Switch checked={item.published} onChange={(v) => void togglePublished(item, v)} label={m('published')} />
                        <a href={withLocale(`/ebook/${item.slug}`, 'az')} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={m('open')}>
                          <ExternalLink className="size-4" aria-hidden />
                        </a>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          aria-label={m('edit')}
                          onClick={() => setDraft({ id: item.id, slug: item.slug, title: asText6(item.title), description: asText6(item.description), coverUrl: item.coverUrl ?? '', published: item.published })}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button type="button" className="btn-ghost btn-sm text-red-700" aria-label={m('delete')} onClick={() => setDeleting(item)}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <p className="mt-4 text-xs font-semibold text-navy-900">{m('files')}</p>
                    <p className="text-[11px] text-muted">{m('filesHint')}</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {SITE_LOCALES.map((lng) => {
                        const has = !!item.files[lng];
                        const working = busy === `file:${item.id}:${lng}`;
                        return (
                          <li key={lng} className={clsx('flex items-center justify-between gap-2 rounded-lg border px-3 py-2', has ? 'border-emerald-200 bg-emerald-50/60' : 'border-dashed border-line')}>
                            <span className="text-xs font-bold text-navy-900 uppercase">
                              {lng} <span className="font-normal text-muted normal-case">{has ? 'PDF' : m('noFile')}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              {working && <Spinner className="size-3.5" />}
                              {has && (
                                <a href={`/api/admin/site-features/lead-magnets/${item.id}/files/${lng}`} target="_blank" rel="noreferrer" className="rounded p-1 text-muted hover:text-brand-700" aria-label={`${m('preview')} ${lng}`}>
                                  <Eye className="size-4" aria-hidden />
                                </a>
                              )}
                              <button type="button" className="rounded p-1 text-muted hover:text-brand-700" disabled={working} onClick={() => pickFile(item.id, lng)} aria-label={`${has ? m('replace') : m('upload')} ${lng}`}>
                                <FileUp className="size-4" aria-hidden />
                              </button>
                              {has && (
                                <button type="button" className="rounded p-1 text-muted hover:text-red-700" disabled={working} onClick={() => void removeFile(item.id, lng)} aria-label={`${m('remove')} ${lng}`}>
                                  <X className="size-4" aria-hidden />
                                </button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} title={m('deleteTitle')} message={m('deleteText')} confirmLabel={m('delete')} danger loading={busy === 'delete'} />
    </div>
  );
}
