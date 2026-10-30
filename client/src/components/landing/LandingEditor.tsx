import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, ExternalLink, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { StatusPill } from '@/components/ui/Badge';
import { ICON_NAMES } from '@/components/ui/Icon';
import { Panel, Switch } from '@/components/admin/ui';
import { ImageField } from '@/components/admin/ImageField';
import { api, errorCode } from '@/lib/api';
import { SITE_LANGUAGE_NAMES } from '@/lib/siteLocale';
import { LandingRenderer } from './LandingRenderer';
import {
  DEFAULT_FORM_CONFIG,
  FORM_FIELDS,
  SECTION_TYPES,
  emptySection,
  videoEmbedUrl,
  type AdminLanding,
  type FormConfig,
  type LandingSection,
  type ResolvedTestimonial,
  type SectionType,
} from '@/components/marketing/api';

/** Landing pages are edited by STAFF too: their images go through the marketing upload (the CMS one is ADMIN-only). */
const LANDING_UPLOAD = '/admin/marketing/upload';

/**
 * Landing page editor: settings, sections (add / reorder / remove, a form per section type), the page
 * form and SEO, with a live preview rendered by the public LandingRenderer. Staff edit drafts; publishing,
 * unpublishing and deleting are ADMIN+ (server-enforced, buttons hidden for staff).
 */

const LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
const COUNTRIES = ['', 'AZ', 'TR', 'UA', 'DE', 'OTHER'] as const;

interface Draft {
  title: string;
  slug: string;
  locale: (typeof LOCALES)[number];
  country: string;
  campaignId: string;
  sections: LandingSection[];
  formConfig: FormConfig;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
}

const emptyDraft = (): Draft => ({
  title: '',
  slug: '',
  locale: 'az',
  country: '',
  campaignId: '',
  sections: [emptySection('hero'), emptySection('benefits'), emptySection('form')],
  formConfig: DEFAULT_FORM_CONFIG,
  seoTitle: '',
  seoDescription: '',
  ogImage: '',
});

const draftOf = (p: AdminLanding): Draft => ({
  title: p.title,
  slug: p.slug,
  locale: (LOCALES as readonly string[]).includes(p.locale) ? (p.locale as Draft['locale']) : 'az',
  country: p.country ?? '',
  campaignId: p.campaignId ?? '',
  sections: p.sections,
  formConfig: p.formConfig,
  seoTitle: p.seoTitle ?? '',
  seoDescription: p.seoDescription ?? '',
  ogImage: p.ogImage ?? '',
});

const Text = ({ label, value, onChange, max = 200, multiline = false, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; max?: number; multiline?: boolean; rows?: number; hint?: ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {multiline ? (
      <textarea className="input resize-y" rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input className="input" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    )}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

/** CTA target: page form, booking, or a custom link. */
const TargetInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const kind = !value || value === '#form' ? 'form' : value === '/booking' ? 'booking' : 'custom';
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="label">{t('mk.landing.editor.f.ctaTarget')}</span>
        <select className="input" value={kind} onChange={(e) => onChange(e.target.value === 'form' ? '#form' : e.target.value === 'booking' ? '/booking' : 'https://')}>
          {(['form', 'booking', 'custom'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`mk.landing.editor.f.targets.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {kind === 'custom' && <Text label={t('mk.landing.editor.f.customUrl')} value={value} max={500} onChange={onChange} />}
    </div>
  );
};

/** Generic repeatable list editor (benefits, steps, faq, stats, custom testimonials). */
const ItemList = <T extends Record<string, string>>({ items, onChange, empty, render }: { items: T[]; onChange: (items: T[]) => void; empty: T; render: (item: T, set: (patch: Partial<T>) => void) => ReactNode }) => {
  const { t } = useTranslation();
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="label">{t('mk.landing.editor.f.items')}</p>
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-line bg-sunken p-3">
          <div className="mb-2 flex justify-end gap-1">
            <IconButton icon={ArrowUp} label={t('mk.common.up')} size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label={t('mk.common.down')} size="sm" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={Trash2} label={t('mk.common.remove')} size="sm" variant="danger" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">{render(it, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
        </div>
      ))}
      {items.length < 12 && (
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => onChange([...items, { ...empty }])}>
          {t('mk.landing.editor.f.addItem')}
        </Button>
      )}
    </div>
  );
};

const SectionFields = ({ s, onChange, testimonials, locale }: { s: LandingSection; onChange: (s: LandingSection) => void; testimonials: ResolvedTestimonial[]; locale: string }) => {
  const { t } = useTranslation();
  const f = (k: string) => t(`mk.landing.editor.f.${k}`);
  const set = <S extends LandingSection>(patch: Partial<S['data']>) => onChange({ ...s, data: { ...s.data, ...patch } } as LandingSection);
  switch (s.type) {
    case 'hero':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <Text label={f('subtitle')} value={s.data.subtitle} max={600} multiline rows={2} onChange={(v) => set({ subtitle: v })} />
          <ImageField
            label={f('image')}
            value={s.data.image}
            onChange={(v) => set({ image: v })}
            kind="photo"
            alt={s.data.imageAlt ?? ''}
            onAltChange={(v) => set({ imageAlt: v })}
            altFallback={s.data.title || undefined}
            uploadUrl={LANDING_UPLOAD}
          />
          <Text label={f('ctaLabel')} value={s.data.ctaLabel} max={60} onChange={(v) => set({ ctaLabel: v })} />
          <TargetInput value={s.data.ctaTarget} onChange={(v) => set({ ctaTarget: v })} />
        </div>
      );
    case 'text':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <Text label={f('body')} value={s.data.body} max={10000} multiline rows={8} onChange={(v) => set({ body: v })} />
        </div>
      );
    case 'benefits':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <ItemList
            items={s.data.items}
            empty={{ icon: 'BadgeCheck', title: '', text: '' }}
            onChange={(items) => set({ items })}
            render={(it, up) => (
              <>
                <label className="block">
                  <span className="label">{f('icon')}</span>
                  <select className="input" value={it.icon} onChange={(e) => up({ icon: e.target.value })}>
                    {ICON_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <Text label={f('title')} value={it.title} max={120} onChange={(v) => up({ title: v })} />
                <div className="sm:col-span-2">
                  <Text label={f('text')} value={it.text} max={400} multiline rows={2} onChange={(v) => up({ text: v })} />
                </div>
              </>
            )}
          />
        </div>
      );
    case 'steps':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <ItemList
            items={s.data.items}
            empty={{ title: '', text: '' }}
            onChange={(items) => set({ items })}
            render={(it, up) => (
              <>
                <Text label={f('title')} value={it.title} max={120} onChange={(v) => up({ title: v })} />
                <Text label={f('text')} value={it.text} max={400} onChange={(v) => up({ text: v })} />
              </>
            )}
          />
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <ItemList
            items={s.data.items}
            empty={{ q: '', a: '' }}
            onChange={(items) => set({ items })}
            render={(it, up) => (
              <>
                <div className="sm:col-span-2">
                  <Text label={f('q')} value={it.q} max={300} onChange={(v) => up({ q: v })} />
                </div>
                <div className="sm:col-span-2">
                  <Text label={f('a')} value={it.a} max={2000} multiline rows={3} onChange={(v) => up({ a: v })} />
                </div>
              </>
            )}
          />
        </div>
      );
    case 'testimonials': {
      const pickL = (v: Record<string, string>) => v[locale] || v.az || v.en || '';
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <div>
            <p className="label">{f('pick')}</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {testimonials.map((tm) => {
                const on = s.data.ids.includes(tm.id);
                return (
                  <li key={tm.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-sunken">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={on}
                        disabled={!on && s.data.ids.length >= 12}
                        onChange={() => set({ ids: on ? s.data.ids.filter((x) => x !== tm.id) : [...s.data.ids, tm.id] })}
                      />
                      <span>
                        <span className="font-semibold text-ink">{pickL(tm.author as unknown as Record<string, string>)}</span>
                        <span className="line-clamp-1 text-xs text-muted">{pickL(tm.quote as unknown as Record<string, string>)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="label">{f('custom')}</p>
          <ItemList
            items={s.data.custom}
            empty={{ name: '', role: '', text: '', photo: '' }}
            onChange={(custom) => set({ custom })}
            render={(it, up) => (
              <>
                <Text label={f('name')} value={it.name} max={120} onChange={(v) => up({ name: v })} />
                <Text label={f('role')} value={it.role} max={120} onChange={(v) => up({ role: v })} />
                <div className="sm:col-span-2">
                  <Text label={f('text')} value={it.text} max={800} multiline rows={3} onChange={(v) => up({ text: v })} />
                </div>
                <div className="sm:col-span-2">
                  <ImageField label={f('photo')} value={it.photo} onChange={(v) => up({ photo: v })} kind="avatar" uploadUrl={LANDING_UPLOAD} />
                </div>
              </>
            )}
          />
        </div>
      );
    }
    case 'stats':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <ItemList
            items={s.data.items}
            empty={{ value: '', label: '' }}
            onChange={(items) => set({ items: items.slice(0, 8) })}
            render={(it, up) => (
              <>
                <Text label={f('value')} value={it.value} max={30} onChange={(v) => up({ value: v })} />
                <Text label={f('label')} value={it.label} max={120} onChange={(v) => up({ label: v })} />
              </>
            )}
          />
        </div>
      );
    case 'video':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <Text label={f('videoUrl')} value={s.data.url} max={500} onChange={(v) => set({ url: v.trim() })} hint={s.data.url && !videoEmbedUrl(s.data.url) ? <span className="text-danger-fg">{f('videoInvalid')}</span> : undefined} />
        </div>
      );
    case 'cta':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <Text label={f('text')} value={s.data.text} max={600} multiline rows={2} onChange={(v) => set({ text: v })} />
          <Text label={f('ctaLabel')} value={s.data.label} max={60} onChange={(v) => set({ label: v })} />
          <TargetInput value={s.data.target} onChange={(v) => set({ target: v })} />
        </div>
      );
    case 'form':
      return (
        <div className="space-y-3">
          <Text label={f('title')} value={s.data.title} onChange={(v) => set({ title: v })} />
          <Text label={f('text')} value={s.data.text} max={600} multiline rows={2} onChange={(v) => set({ text: v })} />
          <p className="text-xs text-muted">{f('formHint')}</p>
        </div>
      );
  }
};

export const LandingEditor = ({ id, canPublish }: { id: string | null; canPublish: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id;
  const { data: page } = useQuery({
    queryKey: ['admin', 'landing', id],
    queryFn: async () => (await api.get<{ page: AdminLanding }>(`/admin/marketing/landing-pages/${id}`)).data.page,
    enabled: !isNew,
  });
  const { data: pool } = useQuery({
    queryKey: ['admin', 'landing', 'testimonials'],
    queryFn: async () => (await api.get<{ items: ResolvedTestimonial[] }>('/admin/marketing/landing-pages/testimonials')).data.items,
    staleTime: 5 * 60 * 1000,
  });
  const [draft, setDraft] = useState<Draft | null>(isNew ? emptyDraft() : null);
  const [saved, setSaved] = useState<string>('');
  const [tab, setTab] = useState<'content' | 'form' | 'seo' | 'settings'>(isNew ? 'settings' : 'content');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [addType, setAddType] = useState<SectionType>('text');

  useEffect(() => {
    if (page && !draft) {
      const d = draftOf(page);
      setDraft(d);
      setSaved(JSON.stringify(d));
    }
  }, [page, draft]);

  const poolMap = useMemo(() => new Map((pool ?? []).map((p) => [p.id, p])), [pool]);
  const dirty = !!draft && JSON.stringify(draft) !== saved;

  const body = (d: Draft) => ({
    title: d.title.trim(),
    ...(d.slug.trim() ? { slug: d.slug.trim().toLowerCase() } : {}),
    locale: d.locale,
    country: d.country || null,
    campaignId: d.campaignId.trim() || null,
    sections: d.sections,
    formConfig: d.formConfig,
    seoTitle: d.seoTitle.trim() || null,
    seoDescription: d.seoDescription.trim() || null,
    ogImage: d.ogImage.trim() || null,
  });
  const onError = (err: unknown) => {
    const code = errorCode(err);
    toast.error(t(`mk.landing.editor.errors.${code}`, { defaultValue: t('mk.common.error') }));
  };
  const save = useMutation({
    mutationFn: async (d: Draft) =>
      isNew ? (await api.post<{ page: AdminLanding }>('/admin/marketing/landing-pages', body(d))).data.page : (await api.put<{ page: AdminLanding }>(`/admin/marketing/landing-pages/${id}`, body(d))).data.page,
    onSuccess: (p) => {
      toast.success(t('mk.common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'landing'] });
      if (isNew) navigate(`/admin/landing-pages/${p.id}`, { replace: true });
      else if (draft) {
        const d = { ...draft, slug: p.slug };
        setDraft(d);
        setSaved(JSON.stringify(d));
      }
    },
    onError,
  });
  const status = useMutation({
    mutationFn: (s: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') => api.post(`/admin/marketing/landing-pages/${id}/status`, { status: s }),
    onSuccess: (_r, s) => {
      toast.success(s === 'PUBLISHED' ? t('mk.landing.published') : t('mk.landing.unpublished'));
      void qc.invalidateQueries({ queryKey: ['admin', 'landing'] });
    },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: async () => (await api.post<{ page: AdminLanding }>(`/admin/marketing/landing-pages/${id}/duplicate`)).data.page,
    onSuccess: (p) => {
      toast.success(t('mk.landing.duplicated'));
      void qc.invalidateQueries({ queryKey: ['admin', 'landing'] });
      setDraft(null);
      navigate(`/admin/landing-pages/${p.id}`);
    },
    onError,
  });

  if (!draft) return <p className="py-10 text-center text-sm text-muted">{t('mk.common.loading')}</p>;
  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setSection = (i: number, s: LandingSection) => up({ sections: draft.sections.map((x, j) => (j === i ? s : x)) });
  const moveSection = (i: number, d: -1 | 1) => {
    const next = [...draft.sections];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    up({ sections: next });
  };
  const fc = draft.formConfig;
  const formValid = fc.fields.name.show && (fc.fields.email.show || fc.fields.phone.show);
  const valid = draft.title.trim().length >= 2 && formValid && draft.sections.every((s) => s.type !== 'video' || !s.data.url || !!videoEmbedUrl(s.data.url));
  const url = `${window.location.origin}/l/${draft.slug || '…'}`;
  const published = page?.status === 'PUBLISHED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/landing-pages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t('mk.landing.editor.back')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {page && <StatusPill domain="publication" status={page.status} label={t(`mk.landing.statuses.${page.status}`)} />}
          {dirty && <span className="text-xs font-semibold text-warning-fg">{t('mk.landing.editor.unsaved')}</span>}
          {!isNew && (
            <Button variant="secondary" size="sm" icon={Copy} loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
              {t('mk.landing.actions.duplicate')}
            </Button>
          )}
          {published && (
            <a href={`/l/${page!.slug}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <ExternalLink className="size-4" aria-hidden /> {t('mk.landing.actions.view')}
            </a>
          )}
          {canPublish && page && (
            <Button
              variant={published ? 'outline' : 'secondary'}
              size="sm"
              icon={Eye}
              disabled={dirty}
              title={dirty ? t('mk.landing.editor.saveFirst') : undefined}
              loading={status.isPending}
              onClick={() => status.mutate(published ? 'DRAFT' : 'PUBLISHED')}
            >
              {published ? t('mk.landing.actions.unpublish') : t('mk.landing.actions.publish')}
            </Button>
          )}
          <Button size="sm" icon={Save} loading={save.isPending} disabled={!valid || (!dirty && !isNew)} onClick={() => save.mutate(draft)}>
            {t('mk.common.save')}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-4">
          <Tabs
            label={page?.title ?? t('mk.landing.editor.newTitle')}
            items={(['content', 'form', 'seo', 'settings'] as const).map((k) => ({ key: k, label: t(`mk.landing.editor.tabs.${k}`) }))}
            value={tab}
            onChange={setTab}
          />

          {tab === 'settings' && (
            <Panel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Text label={t('mk.landing.editor.pageTitle')} value={draft.title} onChange={(v) => up({ title: v })} />
                </div>
                <div className="sm:col-span-2">
                  <Text
                    label={t('mk.landing.editor.slug')}
                    value={draft.slug}
                    max={120}
                    onChange={(v) => up({ slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-') })}
                    hint={published && !canPublish ? t('mk.landing.editor.slugLocked') : t('mk.landing.editor.slugHint', { url })}
                  />
                </div>
                <label className="block">
                  <span className="label">{t('mk.landing.editor.locale')}</span>
                  <select className="input" value={draft.locale} onChange={(e) => up({ locale: e.target.value as Draft['locale'] })}>
                    {LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {SITE_LANGUAGE_NAMES[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">{t('mk.landing.editor.country')}</span>
                  <select className="input" value={draft.country} onChange={(e) => up({ country: e.target.value })}>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c ? t(`mk.landing.editor.countries.${c}`) : '—'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <Text label={t('mk.landing.editor.campaign')} value={draft.campaignId} max={40} onChange={(v) => up({ campaignId: v })} />
                </div>
              </div>
            </Panel>
          )}

          {tab === 'content' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1">
                  <span className="label">{t('mk.landing.editor.addSection')}</span>
                  <select className="input" value={addType} onChange={(e) => setAddType(e.target.value as SectionType)}>
                    {SECTION_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {t(`mk.landing.editor.sectionNames.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  icon={Plus}
                  disabled={draft.sections.length >= 30}
                  onClick={() => {
                    const s = emptySection(addType);
                    up({ sections: [...draft.sections, s] });
                    setOpenSection(s.id);
                  }}
                >
                  {t('mk.common.add')}
                </Button>
              </div>
              {draft.sections.length === 0 && <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{t('mk.landing.editor.noSections')}</p>}
              <ol className="space-y-2">
                {draft.sections.map((s, i) => {
                  const open = openSection === s.id;
                  const heading = ('title' in s.data && s.data.title) || '';
                  return (
                    <li key={s.id} className="rounded-xl border border-line bg-card">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpenSection(open ? null : s.id)}>
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-bold text-muted">{i + 1}</span>
                          <span className="text-sm font-semibold text-ink">{t(`mk.landing.editor.sectionNames.${s.type}`)}</span>
                          {heading && <span className="truncate text-xs text-muted">· {heading}</span>}
                        </button>
                        <IconButton icon={ArrowUp} label={t('mk.common.up')} size="sm" variant="ghost" disabled={i === 0} onClick={() => moveSection(i, -1)} />
                        <IconButton icon={ArrowDown} label={t('mk.common.down')} size="sm" variant="ghost" disabled={i === draft.sections.length - 1} onClick={() => moveSection(i, 1)} />
                        <IconButton icon={Trash2} label={t('mk.common.remove')} size="sm" variant="danger" onClick={() => up({ sections: draft.sections.filter((x) => x.id !== s.id) })} />
                      </div>
                      {open && (
                        <div className="border-t border-line p-3">
                          <SectionFields s={s} onChange={(next) => setSection(i, next)} testimonials={pool ?? []} locale={draft.locale} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {tab === 'form' && (
            <Panel>
              <div className="space-y-4">
                <label className="block max-w-xs">
                  <span className="label">{t('mk.landing.editor.form.kind')}</span>
                  <select className="input" value={fc.kind} onChange={(e) => up({ formConfig: { ...fc, kind: e.target.value as FormConfig['kind'] } })}>
                    {(['contact', 'company'] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`mk.landing.editor.form.kinds.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="label">{t('mk.landing.editor.form.fields')}</p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {FORM_FIELDS.map((k) => {
                      const r = fc.fields[k];
                      const setRule = (patch: Partial<typeof r>) => {
                        const next = { ...r, ...patch };
                        if (!next.show) next.required = false;
                        up({ formConfig: { ...fc, fields: { ...fc.fields, [k]: next } } });
                      };
                      return (
                        <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="text-ink">{t(`mk.lp.fields.${k}`)}</span>
                          <span className="flex items-center gap-4 text-xs text-muted">
                            <span className="flex items-center gap-2">
                              {t('mk.landing.editor.form.show')}
                              <Switch checked={r.show} label={`${t(`mk.lp.fields.${k}`)}: ${t('mk.landing.editor.form.show')}`} onChange={(v) => setRule({ show: v })} />
                            </span>
                            <span className="flex items-center gap-2">
                              {t('mk.landing.editor.form.required')}
                              <Switch checked={r.required} disabled={!r.show} label={`${t(`mk.lp.fields.${k}`)}: ${t('mk.landing.editor.form.required')}`} onChange={(v) => setRule({ required: v })} />
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className={clsx('mt-2 text-xs', formValid ? 'text-muted' : 'text-danger-fg')}>{t('mk.landing.editor.form.rule')}</p>
                </div>
                <Text label={t('mk.landing.editor.form.submitLabel')} value={fc.submitLabel} max={60} onChange={(v) => up({ formConfig: { ...fc, submitLabel: v } })} />
                <Text label={t('mk.landing.editor.form.successText')} value={fc.successText} max={400} multiline rows={2} onChange={(v) => up({ formConfig: { ...fc, successText: v } })} />
              </div>
            </Panel>
          )}

          {tab === 'seo' && (
            <Panel>
              <div className="space-y-4">
                <Text label={t('mk.landing.editor.seoTitle')} value={draft.seoTitle} max={200} onChange={(v) => up({ seoTitle: v })} hint={`${draft.seoTitle.length} / 60`} />
                <Text label={t('mk.landing.editor.seoDescription')} value={draft.seoDescription} max={400} multiline rows={3} onChange={(v) => up({ seoDescription: v })} hint={`${draft.seoDescription.length} / 155`} />
                <ImageField label={t('mk.landing.editor.ogImage')} value={draft.ogImage} onChange={(v) => up({ ogImage: v })} kind="og" uploadUrl={LANDING_UPLOAD} />
                <p className="text-xs text-muted">{t('mk.landing.editor.seoHint')}</p>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-4">
          <p className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
            <span className="font-semibold tracking-wide uppercase">{t('mk.landing.editor.preview')}</span>
            <span>{t('mk.landing.editor.previewHint')}</span>
          </p>
          <div className="max-h-[80vh] overflow-y-auto overscroll-contain rounded-xl border border-line bg-canvas shadow-[var(--tv-shadow-card)]">
            <LandingRenderer slug={draft.slug || 'preview'} locale={draft.locale} sections={draft.sections} formConfig={draft.formConfig} preview testimonialPool={poolMap} />
          </div>
        </div>
      </div>
    </div>
  );
};
