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
  /* The frame is sized to the content: html/body must never take the frame's height (a "height: 100%" mail
     would otherwise grow the frame, which grows the page, … without end). */
  html, body { height: auto !important; min-height: 0 !important; overflow: hidden; }
  /* Inside the frame 1vh is a part of the frame's own height: a "min-height: 100vh" block would grow with every
     resize of the frame. Viewport-sized boxes from the mail lose that size. */
  [style*="vh"] { min-height: 0 !important; height: auto !important; max-height: none !important; }
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
  const heightRef = useRef(120);
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
    const timers: number[] = [];
    let creep = 0;
    // Measure the CONTENT (the body's box), never documentElement.scrollHeight: that is at least the frame's
    // own height, so "frame = scrollHeight + 8" grew by 8 px on every resize until the 20 000 px cap.
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      const style = frame.contentWindow?.getComputedStyle(body);
      const margins = style ? parseFloat(style.marginTop) + parseFloat(style.marginBottom) : 0;
      const h = Math.ceil(body.getBoundingClientRect().height + margins);
      const next = Math.min(Math.max(h + 4, 80), 20000);
      // Feedback guard (a <style> block sized in vh that the rule above does not reach): the content keeps
      // growing by a few px right after each resize of the frame — stop following it after 3 such steps.
      const delta = next - heightRef.current;
      creep = delta > 0 && delta <= 24 ? creep + 1 : 0;
      if (creep > 3) return;
      if (h > 0 && Math.abs(next - heightRef.current) > 2) {
        heightRef.current = next;
        setHeight(next);
      }
    };
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      raf = requestAnimationFrame(measure);
      timers.push(window.setTimeout(measure, 300), window.setTimeout(measure, 1200)); // late images / fonts
      // Content changes (images loading) and width changes of the reading pane re-measure; the frame's own
      // height change does not feed back, because only the body box is observed.
      ro?.disconnect();
      const body = frame.contentDocument?.body;
      ro = typeof ResizeObserver !== 'undefined' && body ? new ResizeObserver(measure) : null;
      if (body) ro?.observe(body);
    };
    frame.addEventListener('load', onLoad);
    if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body?.childNodes.length) onLoad();
    return () => {
      frame.removeEventListener('load', onLoad);
      ro?.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  return (
    <div className="min-w-0">
      {blocked && !showImages && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-muted">
          <ImageOff className="size-3.5" aria-hidden />
          <span>{t('mail.actions.imagesBlocked')}</span>
          <button type="button" onClick={onShowImages} className="font-semibold text-link hover:underline">
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
