import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Code2, Copy, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { buttonClass } from '@/components/ui/Button';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesEmbeds } from '@/i18n/pagesEmbeds';
import { useBrand } from '@/lib/brand';
import { SITE_LANGUAGE_NAMES } from '@/lib/siteLocale';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  EMBED_LOCALES,
  EMBED_SIZES,
  EMBED_THEMES,
  EMBED_WIDGETS,
  embedPath,
  embedSnippet,
  type EmbedLocale,
  type EmbedTheme,
  type EmbedWidget,
} from '@/lib/embeds';

registerCopy(pagesEmbeds);

/**
 * /widgets — configurator of the embeddable widgets (lib/embeds.ts): widget, size, language, theme, live preview of
 * the real /embed page and the copy-paste snippet (iframe + optional auto-resize script).
 */
export default function Widgets() {
  const { t } = useTranslation();
  usePageTitle(t('embeds.page.title'));
  const id = useId();
  const brand = useBrand();
  const [widget, setWidget] = useState<EmbedWidget>('salary-calculator');
  const [sizeId, setSizeId] = useState<'small' | 'medium' | 'responsive'>('medium');
  const [lng, setLng] = useState<EmbedLocale>(() => currentSiteLocale() as EmbedLocale);
  const [theme, setTheme] = useState<EmbedTheme>('auto');
  const [autoResize, setAutoResize] = useState(true);
  const [copied, setCopied] = useState(false);

  const size = EMBED_SIZES[widget].find((s) => s.id === sizeId) ?? EMBED_SIZES[widget][0];
  // The snippet always points at the public domain (also when the page is opened on a preview host).
  const origin = `https://${brand.domain}`;
  const snippet = useMemo(
    () => embedSnippet({ origin, widget, lng, theme, size, title: t(`embeds.names.${widget}`, { lng }), autoResize }),
    [origin, widget, lng, theme, size, autoResize, t],
  );
  // Preview: the same page on this host (relative URL), so it works on staging too.
  const previewSrc = `${embedPath(widget, lng)}${theme === 'auto' ? '' : `?theme=${theme}`}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success(t('embeds.page.copied'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('embeds.page.copyFailed'));
    }
  };

  const chip = (active: boolean) =>
    clsx(
      'inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
      active ? 'border-primary bg-primary/10 text-ink' : 'border-line bg-card text-ink hover:border-line-strong',
    );

  return (
    <>
      <PageHero title={t('embeds.page.title')} subtitle={t('embeds.page.subtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
          <div className="space-y-5">
            <fieldset>
              <legend className="label">{t('embeds.page.choose')}</legend>
              <div className="grid gap-2">
                {EMBED_WIDGETS.map((w) => (
                  <label key={w} className={clsx(chip(widget === w), 'flex-col items-start gap-0.5')}>
                    <input type="radio" className="sr-only" name={`${id}-w`} checked={widget === w} onChange={() => setWidget(w)} />
                    <span>{t(`embeds.names.${w}`)}</span>
                    <span className="text-xs font-normal text-muted">{t(`embeds.descs.${w}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{t('embeds.page.size')}</legend>
              <div className="flex flex-wrap gap-2">
                {EMBED_SIZES[widget].map((s) => (
                  <label key={s.id} className={chip(sizeId === s.id)}>
                    <input type="radio" className="sr-only" name={`${id}-s`} checked={sizeId === s.id} onChange={() => setSizeId(s.id)} />
                    {t(`embeds.page.sizes.${s.id}`, { w: s.width, h: s.height })}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-lng`} className="label">
                  {t('embeds.page.language')}
                </label>
                <select id={`${id}-lng`} className="input" value={lng} onChange={(e) => setLng(e.target.value as EmbedLocale)}>
                  {EMBED_LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {SITE_LANGUAGE_NAMES[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-theme`} className="label">
                  {t('embeds.page.theme')}
                </label>
                <select id={`${id}-theme`} className="input" value={theme} onChange={(e) => setTheme(e.target.value as EmbedTheme)}>
                  {EMBED_THEMES.map((x) => (
                    <option key={x} value={x}>
                      {t(`embeds.page.themes.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={autoResize} onChange={(e) => setAutoResize(e.target.checked)} />
              <span>
                {t('embeds.page.autoResize')}
                <span className="mt-0.5 block text-xs text-muted">{t('embeds.page.autoResizeHint', { domain: brand.domain })}</span>
              </span>
            </label>

            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Code2 className="size-5 text-primary" aria-hidden /> {t('embeds.page.code')}
              </h2>
              <label htmlFor={`${id}-code`} className="sr-only">
                {t('embeds.page.code')}
              </label>
              <textarea
                id={`${id}-code`}
                readOnly
                value={snippet}
                rows={autoResize ? 8 : 4}
                onFocus={(e) => e.currentTarget.select()}
                className="input mt-2 font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
              <button type="button" onClick={() => void copy()} className={clsx(buttonClass({ block: true }), 'mt-2')}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t('embeds.page.copy')}
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-sunken p-4">
              <h2 className="flex items-center gap-2 font-display font-semibold text-ink">
                <ShieldCheck className="size-5 text-primary" aria-hidden /> {t('embeds.page.rulesTitle')}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {(t('embeds.page.rules', { returnObjects: true, name: brand.name }) as string[]).map((r) => (
                  <li key={r} className="flex gap-2 text-sm leading-relaxed text-muted">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link to="/contact" className="font-semibold text-link hover:underline">
                  {t('embeds.page.contact')}
                </Link>
              </p>
            </div>
          </div>

          <div className="lg:sticky lg:top-28">
            <h2 className="mb-2 font-display text-lg font-semibold text-ink">{t('embeds.page.preview')}</h2>
            <div className="overflow-x-auto rounded-2xl border border-dashed border-line-strong bg-sunken p-3">
              <iframe
                key={previewSrc}
                src={previewSrc}
                title={t(`embeds.names.${widget}`)}
                width={size.width === '100%' ? '100%' : size.width}
                height={size.height}
                loading="lazy"
                className="mx-auto block max-w-full rounded-xl border-0 bg-canvas"
                style={size.width === '100%' ? { width: '100%' } : undefined}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
