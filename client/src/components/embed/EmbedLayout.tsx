import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesEmbeds } from '@/i18n/pagesEmbeds';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { EMBED_HEIGHT_MESSAGE, EMBED_TOOL_PATH, embedUtm, type EmbedWidget } from '@/lib/embeds';

registerCopy(pagesEmbeds);

/**
 * Link back to a site page with the embed utm parameters (opens in a new tab, outside the iframe; relative URLs
 * resolve to our origin inside the iframe). The embedding host (document.referrer) is only read after mount, so
 * the server-rendered and the hydrated markup are identical.
 */
export const useEmbedLink = (widget: EmbedWidget) => {
  const [referrer, setReferrer] = useState('');
  useEffect(() => setReferrer(document.referrer), []);
  return (path: string, extraQuery = '') => `${localePath(path)}?${[extraQuery, embedUtm(referrer, widget)].filter(Boolean).join('&')}`;
};

/**
 * Chrome of an embeddable widget (/embed/*): a title, the widget, a link to the full tool and the "Powered by"
 * link (dofollow on purpose: it is the attribution the embedding site agrees to). No site header / footer /
 * cookie banner (the route lives outside SiteLayout, nothing here needs consent). Reports its height to the
 * parent window (postMessage {type: 'tv-embed-height', widget, height}) so the snippet can size the iframe.
 */
export const EmbedLayout = ({ widget, children, fullQuery }: { widget: EmbedWidget; children: ReactNode; fullQuery?: string }) => {
  const { t } = useTranslation();
  const brand = useBrand();
  const ref = useRef<HTMLDivElement>(null);
  const link = useEmbedLink(widget);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window || typeof ResizeObserver === 'undefined') return;
    let last = 0;
    const post = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      // The target origin is unknown (any site may embed us); the message carries nothing but the height.
      window.parent.postMessage({ type: EMBED_HEIGHT_MESSAGE, widget, height }, '*');
    };
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, [widget]);

  return (
    <div ref={ref} className="bg-canvas text-ink">
      <main className="mx-auto max-w-xl p-3 sm:p-4">
        <h1 className="font-display text-base font-semibold leading-snug text-ink sm:text-lg">{t(`embeds.names.${widget}`)}</h1>
        <div className="mt-3">{children}</div>
        <a href={link(EMBED_TOOL_PATH[widget], fullQuery)} target="_blank" rel="noopener" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          {t('embeds.openFull')} <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <p className="mt-1 border-t border-line pt-2 text-[11px] text-muted">
          <a href={link('/')} target="_blank" rel="noopener" className="font-semibold text-muted hover:text-ink hover:underline">
            {t('embeds.poweredBy', { name: brand.name })}
          </a>
          {' · '}
          {t('embeds.estimate')}
        </p>
      </main>
    </div>
  );
};
