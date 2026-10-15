import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
import { textToHtml } from './utils';

/**
 * Renders a (server-sanitised) message body inside a sandboxed iframe: no scripts, no forms, no
 * navigation, a CSP that only allows our own inline images, and remote images blocked until the
 * reader allows them (the server moved their `src` to `data-src`). `allow-same-origin` (without
 * `allow-scripts`, so nothing can ever execute) is the one permission kept: it lets the parent read
 * the document height and size the frame to its content.
 */
const CSP = "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src 'none'";
const CSP_REMOTE = "default-src 'none'; img-src 'self' data: blob: https: http:; style-src 'unsafe-inline'; font-src 'none'";

const baseCss = (dark: boolean) => `
  :root { color-scheme: ${dark ? 'dark' : 'light'}; }
  body { margin: 0; padding: 4px 2px 12px; font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: ${dark ? '#e6ecf7' : '#0b1f44'}; background: transparent; word-wrap: break-word; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1565e8; }
  blockquote { border-left: 2px solid ${dark ? '#3a4a66' : '#c7d2e3'}; margin: 8px 0; padding-left: 12px; color: ${dark ? '#9fb0c8' : '#5b6b88'}; }
  pre { white-space: pre-wrap; }
  ${dark ? 'body, body * { background-color: transparent !important; }' : ''}
`;

export const hasRemoteImages = (html: string | null) => !!html && /\sdata-src="/i.test(html);

export const MailBody = ({ html, text, showImages, onShowImages }: { html: string | null; text: string | null; showImages: boolean; onShowImages: () => void }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const blocked = hasRemoteImages(html);

  const doc = useMemo(() => {
    let body = html ?? (text ? textToHtml(text) : '');
    if (showImages) body = body.replace(/<img([^>]*?)\ssrc="data:image\/gif;base64,[^"]*"([^>]*?)\sdata-src="([^"]+)"/gi, '<img$1 src="$3"$2').replace(/<img([^>]*?)\sdata-src="([^"]+)"/gi, '<img$1 src="$2"');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${showImages ? CSP_REMOTE : CSP}"><base target="_blank"><style>${baseCss(dark)}</style></head><body>${body}</body></html>`;
  }, [html, text, showImages, dark]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let raf = 0;
    const measure = () => {
      const h = frame.contentDocument?.documentElement?.scrollHeight ?? frame.contentDocument?.body?.scrollHeight;
      if (h && Math.abs(h - height) > 2) setHeight(Math.min(Math.max(h + 8, 80), 20000));
    };
    const onLoad = () => {
      measure();
      raf = requestAnimationFrame(measure);
      window.setTimeout(measure, 300);
      window.setTimeout(measure, 1200);
    };
    frame.addEventListener('load', onLoad);
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => {
      frame.removeEventListener('load', onLoad);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  return (
    <div className="min-w-0">
      {blocked && !showImages && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
          <ImageOff className="size-3.5" aria-hidden />
          <span>{t('mail.actions.imagesBlocked')}</span>
          <button type="button" onClick={onShowImages} className="font-semibold text-brand-600 hover:underline">
            {t('mail.actions.showImages')}
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title="message"
        sandbox="allow-same-origin"
        srcDoc={doc}
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height, colorScheme: dark ? 'dark' : 'light' }}
        scrolling="no"
      />
    </div>
  );
};
