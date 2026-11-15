import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Download, Instagram, Share2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Radio } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesMilestoneDocs } from '@/i18n/pagesMilestoneDocs';
import { getBrand } from '@/lib/brand';

registerCopy(pagesMilestoneDocs);

/*
 * Private Instagram card of an approved case (GET /api/account/success-share/card/:caseId/:format.png).
 * Opt-in by one click: nothing is rendered before "Create card", and the image is only ever shown to the
 * client — download it or hand it to the Web Share API (files) on phones. Nothing becomes public here; the
 * public share link is the separate "Share my success" flow.
 */

type Format = 'story' | 'square';
type NameStyle = 'first' | 'initials' | 'anonymous';
const LANGS = ['az', 'de', 'en', 'ru'] as const;
type Lang = (typeof LANGS)[number];
const LANG_NAMES: Record<Lang, string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' };
const ANON: Record<Lang, string> = { az: 'Triad Vision müştərisi', de: 'Ein Triad Vision Kunde', en: 'A Triad Vision client', ru: 'Клиент Triad Vision' };

const initials = (first: string, last: string, lng: string) =>
  [first, last]
    .map((s) => s.trim()[0]?.toLocaleUpperCase(lng))
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');

export function InstagramCardDialog({ open, onClose, caseId }: { open: boolean; onClose: () => void; caseId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const p = (k: string, o?: Record<string, unknown>) => String(t(`milestones.insta.${k}`, o));
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [format, setFormat] = useState<Format>('story');
  const [nameStyle, setNameStyle] = useState<NameStyle>('first');
  const [lang, setLang] = useState<Lang>((LANGS as readonly string[]).includes(ui) ? (ui as Lang) : 'en');
  const [image, setImage] = useState<{ url: string; blob: Blob; key: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const ids = { name: useId(), lang: useId() };

  const src = `/api/account/success-share/card/${encodeURIComponent(caseId)}/${format}.png?name=${nameStyle}&lang=${lang}`;
  const key = `${format}:${nameStyle}:${lang}`;

  // Free the object URL when it is replaced or the dialog unmounts.
  useEffect(() => () => (image ? URL.revokeObjectURL(image.url) : undefined), [image]);
  useEffect(() => {
    if (!open) setImage(null);
  }, [open]);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(src, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setImage({ url: URL.createObjectURL(blob), blob, key });
    } catch {
      toast.error(p('error'));
    } finally {
      setLoading(false);
    }
  };

  const fileName = `triad-vision-${format}.png`;
  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const file = image ? new File([image.blob], fileName, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const share = async () => {
    if (!file) return;
    setSharing(true);
    try {
      await navigator.share({ files: [file], title: getBrand().name, text: p('shareText') });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast.error(p('error'));
    } finally {
      setSharing(false);
    }
  };

  const firstName = user?.firstName.trim().split(/\s+/)[0] ?? '';
  const stale = !image || image.key !== key;

  return (
    <Modal open={open} onClose={onClose} title={p('title')} description={p('intro')} size="lg" closeLabel={String(t('successShare.portal.close'))}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div role="group" aria-label={p('format')} className="inline-flex rounded-full border border-line bg-sunken p-1">
            {(['story', 'square'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={clsx('min-h-10 rounded-full px-4 text-sm font-semibold transition-colors', format === f ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink')}
              >
                {p(f)}
              </button>
            ))}
          </div>
          <fieldset>
            <legend className="label">{p('nameLabel')}</legend>
            <div className="mt-1 space-y-2">
              <Radio name={ids.name} checked={nameStyle === 'first'} onChange={() => setNameStyle('first')} label={p('nameFirst', { name: firstName })} />
              <Radio name={ids.name} checked={nameStyle === 'initials'} onChange={() => setNameStyle('initials')} label={p('nameInitials', { name: initials(user?.firstName ?? '', user?.lastName ?? '', lang) })} />
              <Radio name={ids.name} checked={nameStyle === 'anonymous'} onChange={() => setNameStyle('anonymous')} label={p('nameAnonymous', { name: ANON[lang] })} />
            </div>
          </fieldset>
          <div>
            <label htmlFor={ids.lang} className="label">
              {p('language')}
            </label>
            <select id={ids.lang} className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </select>
          </div>
          <p className="rounded-lg bg-sunken p-3 text-sm text-muted">{p('privacy')}</p>
          <div className="flex flex-col gap-2">
            {stale ? (
              <Button icon={Instagram} loading={loading} onClick={() => void generate()}>
                {p('generate')}
              </Button>
            ) : (
              <>
                {canShareFile && (
                  <Button icon={Share2} loading={sharing} onClick={() => void share()}>
                    {p('share')}
                  </Button>
                )}
                <Button variant={canShareFile ? 'secondary' : 'primary'} icon={Download} onClick={download}>
                  {p('download')}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="grid place-items-center rounded-xl bg-sunken p-3">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner className="size-4" /> {p('loading')}
            </p>
          ) : image ? (
            <img
              src={image.url}
              alt={p('previewAlt')}
              width={1080}
              height={image.key.startsWith('story') ? 1920 : 1080}
              className={clsx('h-auto w-full rounded-xl border border-line shadow-sm', image.key.startsWith('story') ? 'max-w-[13rem]' : 'max-w-xs', stale && 'opacity-50')}
            />
          ) : (
            <Instagram className="size-16 text-muted/40" aria-hidden />
          )}
        </div>
      </div>
    </Modal>
  );
}

export default InstagramCardDialog;
