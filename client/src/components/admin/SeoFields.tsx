import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { registerCopy, LOCALES, type Locale } from '@/i18n';
import { pagesSeoAdmin } from '@/i18n/pagesSeoAdmin';
import { ImageField } from './ImageField';
import { CharCount, SeoSnippet } from './SeoSnippet';
import { Switch } from './ui';
import { Flag } from '../ui/Flag';
import { getBrand } from '@/lib/brand';

registerCopy(pagesSeoAdmin);

type Texts = Partial<Record<Locale, string>>;

export interface SeoValue {
  seoTitle: Texts;
  seoDescription: Texts;
  ogImage: string;
  noindex: boolean;
}

/** CMS resources with per-item SEO overrides (server: routes/admin/content.ts → seoFields). */
export const SEO_RESOURCES = new Set(['posts', 'services', 'visa-categories']);

const texts = (v: unknown): Texts =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(LOCALES.map((l) => [l, typeof (v as Record<string, unknown>)[l] === 'string' ? ((v as Record<string, string>)[l] as string) : '']))
    : {};

export const seoFromItem = (item: Record<string, unknown> | null): SeoValue => ({
  seoTitle: texts(item?.seoTitle),
  seoDescription: texts(item?.seoDescription),
  ogImage: typeof item?.ogImage === 'string' ? item.ogImage : '',
  noindex: item?.noindex === true,
});

const clean = (t: Texts) => {
  const out = Object.fromEntries(LOCALES.map((l) => [l, (t[l] ?? '').trim()]));
  return Object.values(out).some(Boolean) ? out : null;
};

/** Payload fragment for PUT/POST /admin/content/:resource. */
export const seoPayload = (v: SeoValue) => ({
  seoTitle: clean(v.seoTitle),
  seoDescription: clean(v.seoDescription),
  ogImage: v.ogImage.trim() || null,
  noindex: v.noindex,
});

const PATH: Record<string, string> = { posts: '/news', services: '/services', 'visa-categories': '/visas' };

/**
 * "SEO" section of the content editor: per-language title / meta description overrides with character
 * counters and a Google-like preview, the social image (og:image) and noindex.
 */
export const SeoFields = ({
  resource,
  value,
  onChange,
  fallbackTitle,
  fallbackDescription,
  slug,
}: {
  resource: string;
  value: SeoValue;
  onChange: (v: SeoValue) => void;
  /** The item's own title / summary per language (what the site uses when the override is empty). */
  fallbackTitle: Texts;
  fallbackDescription: Texts;
  slug: string;
}) => {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Locale>('az');
  const s = (k: string) => t(`seoAdmin.seo.${k}`);
  const chars = (count: number, max: number) => t('seoAdmin.guides.chars', { count, max });
  const title = value.seoTitle[lang] ?? '';
  const description = value.seoDescription[lang] ?? '';
  const shownTitle = title.trim() || `${(fallbackTitle[lang] || fallbackTitle.az || '').trim()} | ${getBrand().name}`;
  const shownDescription = description.trim() || fallbackDescription[lang] || fallbackDescription.az || '';
  const url = `${lang === 'az' ? '' : `/${lang}`}${PATH[resource] ?? ''}/${slug || '…'}`;

  return (
    <section className="space-y-4 sm:col-span-2">
      <h3 className="mt-3 flex items-center gap-2 border-t border-line pt-5 text-xs font-bold tracking-wider text-ink uppercase">
        <Search className="size-3.5" aria-hidden /> {s('section')}
      </h3>
      <p className="-mt-2 text-[11px] text-muted">{s('hint')}</p>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lang === l}
            onClick={() => setLang(l)}
            className={clsx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold', lang === l ? 'border-primary bg-primary/[0.06] text-link' : 'border-line text-muted hover:text-ink')}
          >
            <Flag code={l} className="w-4" /> {l.toUpperCase()}
            {(value.seoTitle[l] || value.seoDescription[l]) && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="seo-title">
            {s('seoTitle')}
          </label>
          <CharCount value={title} max={60} label={chars} />
        </div>
        <input id="seo-title" className="input" maxLength={120} value={title} placeholder={shownTitle} onChange={(e) => onChange({ ...value, seoTitle: { ...value.seoTitle, [lang]: e.target.value } })} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="seo-desc">
            {s('seoDescription')}
          </label>
          <CharCount value={description} max={155} label={chars} />
        </div>
        <textarea
          id="seo-desc"
          className="input min-h-20"
          maxLength={320}
          value={description}
          placeholder={shownDescription.slice(0, 200)}
          onChange={(e) => onChange({ ...value, seoDescription: { ...value.seoDescription, [lang]: e.target.value } })}
        />
      </div>
      <SeoSnippet title={shownTitle} description={shownDescription} url={url} caption={s('snippet')} />
      <div>
        <ImageField label={s('ogImage')} value={value.ogImage} onChange={(v) => onChange({ ...value, ogImage: v })} kind="og" />
        <p className="mt-1 text-[11px] text-muted">{s('ogImageHelp')}</p>
      </div>
      <label className="flex min-h-10 sm:min-h-9 cursor-pointer items-center gap-3 rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium">
        <Switch checked={value.noindex} onChange={(v) => onChange({ ...value, noindex: v })} label={s('noindex')} />
        {s('noindex')}
      </label>
    </section>
  );
};
