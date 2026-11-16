/**
 * Embeddable widgets (/embed/<widget>, configurator on /widgets). Plain data + pure helpers (unit-tested in
 * embeds.test.ts), no React.
 *
 * An embed page is a compact version of a public tool for other websites' iframes: no site header / footer /
 * cookie banner, a "Powered by" link back and a link to the full tool. Framing is allowed only for /embed/*
 * (deploy/Caddyfile: frame-ancestors * there, X-Frame-Options DENY everywhere else). The pages are noindex with a
 * canonical to the full tool (server seoCatalogue STATIC_PAGES).
 */

export const EMBED_WIDGETS = ['salary-calculator', 'blue-card-check', 'which-city'] as const;
export type EmbedWidget = (typeof EMBED_WIDGETS)[number];

export const isEmbedWidget = (s: unknown): s is EmbedWidget => typeof s === 'string' && (EMBED_WIDGETS as readonly string[]).includes(s);

/** The full tool page of a widget (= its tool-analytics slug without the leading slash). */
export const EMBED_TOOL_PATH: Record<EmbedWidget, string> = {
  'salary-calculator': '/salary-calculator',
  'blue-card-check': '/blue-card-check',
  'which-city': '/which-city',
};

export const EMBED_LOCALES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type EmbedLocale = (typeof EMBED_LOCALES)[number];
export const EMBED_THEMES = ['auto', 'light', 'dark'] as const;
export type EmbedTheme = (typeof EMBED_THEMES)[number];

export interface EmbedSize {
  id: 'small' | 'medium' | 'responsive';
  width: number | '100%';
  height: number;
}

/** Height presets per widget (the iframe can also follow the content with the resize script). */
export const EMBED_SIZES: Record<EmbedWidget, EmbedSize[]> = {
  'salary-calculator': [
    { id: 'small', width: 360, height: 640 },
    { id: 'medium', width: 420, height: 600 },
    { id: 'responsive', width: '100%', height: 600 },
  ],
  'blue-card-check': [
    { id: 'small', width: 360, height: 680 },
    { id: 'medium', width: 420, height: 640 },
    { id: 'responsive', width: '100%', height: 640 },
  ],
  'which-city': [
    { id: 'small', width: 360, height: 560 },
    { id: 'medium', width: 420, height: 540 },
    { id: 'responsive', width: '100%', height: 540 },
  ],
};

/** Message an embed posts to its parent window whenever its height changes. */
export const EMBED_HEIGHT_MESSAGE = 'tv-embed-height';

/** Path of a widget in a language (az lives at the root, like every public page). */
export const embedPath = (widget: EmbedWidget, lng: EmbedLocale) => `${lng === 'az' ? '' : `/${lng}`}/embed/${widget}`;

/** Absolute URL of a widget with its theme (auto = follows the visitor's system setting, no parameter). */
export const embedUrl = (origin: string, widget: EmbedWidget, lng: EmbedLocale, theme: EmbedTheme) =>
  `${origin.replace(/\/+$/, '')}${embedPath(widget, lng)}${theme === 'auto' ? '' : `?theme=${theme}`}`;

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The copy-paste HTML: an iframe (lazy, no border) and, optionally, a tiny script that resizes it to the content
 * height. The script only trusts messages from our own origin and only touches iframes pointing at it.
 */
export const embedSnippet = (o: { origin: string; widget: EmbedWidget; lng: EmbedLocale; theme: EmbedTheme; size: EmbedSize; title: string; autoResize: boolean }) => {
  const origin = o.origin.replace(/\/+$/, '');
  const width = o.size.width === '100%' ? '100%' : String(o.size.width);
  const style = `border:0;max-width:100%;${o.size.width === '100%' ? 'width:100%;' : ''}`;
  const iframe = `<iframe src="${attr(embedUrl(origin, o.widget, o.lng, o.theme))}" title="${attr(o.title)}" width="${width}" height="${o.size.height}" style="${style}" loading="lazy" data-tv-embed="${o.widget}"></iframe>`;
  if (!o.autoResize) return iframe;
  const script = `<script>(function(){window.addEventListener("message",function(e){if(e.origin!==${JSON.stringify(origin)}||!e.data||e.data.type!=="${EMBED_HEIGHT_MESSAGE}")return;var f=document.querySelectorAll('iframe[data-tv-embed="'+e.data.widget+'"]');for(var i=0;i<f.length;i++){if(f[i].contentWindow===e.source)f[i].style.height=Math.min(4000,Math.max(200,Number(e.data.height)||0))+"px";}});})();</script>`;
  return `${iframe}\n${script}`;
};

/** utm parameters of the links back to the site: campaign = the embedding site's host (when the browser tells it). */
export const embedUtm = (referrer: string, widget: EmbedWidget) => {
  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.replace(/^www\./, '').slice(0, 100) : '';
  } catch {
    host = '';
  }
  const p = new URLSearchParams({ utm_source: 'embed', utm_medium: 'widget', utm_campaign: host || 'unknown', utm_content: widget });
  return p.toString();
};
