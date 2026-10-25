import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Copy, Download, Link2, Pencil, Share2, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, buttonClass } from '@/components/ui/Button';
import { Checkbox, Radio } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Success } from '@/components/illustrations';
import { registerCopy } from '@/i18n';
import { pagesSuccessShare } from '@/i18n/pagesSuccessShare';
import { getBrand } from '@/lib/brand';

registerCopy(pagesSuccessShare);

/*
 * Visa approved: congratulations card in the client portal (case overview + home) with "Share my success".
 * The dialog asks for explicit consent first (DSGVO: nothing is public before), then shows the branded
 * card (post 1080×1350 / story 1080×1920, rendered by the API), download, native share (Web Share API with
 * the image file where supported) and the public link /success/:token — which the client can revoke.
 */

type Format = 'post' | 'story';
type NameStyle = 'first' | 'initials';
const CARD_LANGS = ['az', 'de', 'en', 'ru'] as const;
const LANG_NAMES: Record<(typeof CARD_LANGS)[number], string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' };

interface Share {
  token: string;
  nameStyle: NameStyle;
  showReferral: boolean;
  allowIndexing: boolean;
  locale: (typeof CARD_LANGS)[number];
  leads: number;
  url: string;
  cards: Record<Format, string>;
}
interface Item {
  caseId: string;
  number: string;
  decisionAt: string | null;
  visaLine: string;
  share: Share | null;
}
interface Data {
  referralEnabled: boolean;
  items: Item[];
}

const KEY = ['account', 'success-share'];
const DISMISS = (caseId: string) => `tv_share_hidden:${caseId}`;
const readHidden = (caseId: string) => {
  try {
    return localStorage.getItem(DISMISS(caseId)) === '1';
  } catch {
    return false;
  }
};

const initials = (first: string, last: string, lng: string) =>
  [first, last]
    .map((s) => s.trim()[0]?.toLocaleUpperCase(lng))
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');

const ShareDialog = ({ open, onClose, item, referralEnabled }: { open: boolean; onClose: () => void; item: Item; referralEnabled: boolean }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const uiLang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const share = item.share;
  const [editing, setEditing] = useState(!share);
  const [nameStyle, setNameStyle] = useState<NameStyle>(share?.nameStyle ?? 'first');
  const [showReferral, setShowReferral] = useState(share?.showReferral ?? referralEnabled);
  const [allowIndexing, setAllowIndexing] = useState(share?.allowIndexing ?? false);
  const [locale, setLocale] = useState<(typeof CARD_LANGS)[number]>(share?.locale ?? ((CARD_LANGS as readonly string[]).includes(uiLang) ? (uiLang as (typeof CARD_LANGS)[number]) : 'en'));
  const [consent, setConsent] = useState(false);
  const [format, setFormat] = useState<Format>('post');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [sharing, setSharing] = useState(false);
  const ids = { lang: useId(), name: useId() };
  const p = (k: string, o?: Record<string, unknown>) => String(t(`successShare.portal.${k}`, o));

  useEffect(() => {
    if (!open) return;
    setEditing(!item.share);
    setConsent(false);
  }, [open, item.share]);

  const save = useMutation({
    mutationFn: async () => (await api.post<{ share: Share }>('/account/success-share', { caseId: item.caseId, consent: true, nameStyle, showReferral: referralEnabled && showReferral, allowIndexing, locale })).data,
    onSuccess: () => {
      toast.success(p('created'));
      setEditing(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(p('error')),
  });
  const revoke = useMutation({
    mutationFn: async (token: string) => (await api.delete(`/account/success-share/${token}`)).data,
    onSuccess: () => {
      toast.success(p('revoked'));
      setConfirmRevoke(false);
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: () => toast.error(p('error')),
  });

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(p('copied'));
    } catch {
      toast.error(p('error'));
    }
  };

  /** Web Share API with the image file where supported (phones), else the link, else copy. */
  const nativeShare = async (s: Share) => {
    setSharing(true);
    try {
      const blob = await (await fetch(s.cards[format], { credentials: 'same-origin' })).blob();
      const file = new File([blob], `triad-vision-${format}.png`, { type: 'image/png' });
      const text = `${p('shareText')} ${s.url}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: getBrand().name, text });
      else if (navigator.share) await navigator.share({ title: getBrand().name, text: p('shareText'), url: s.url });
      else await copyLink(s.url);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast.error(p('error'));
    } finally {
      setSharing(false);
    }
  };

  const firstName = user?.firstName.trim().split(/\s+/)[0] ?? '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <>
      <Modal open={open} onClose={onClose} title={p('dialogTitle')} description={item.visaLine} size={editing ? 'md' : 'lg'} closeLabel={p('close')} busy={save.isPending}>
        {editing ? (
          <form
            id="tv-share-form"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (consent) save.mutate();
            }}
          >
            <p className="rounded-lg bg-sunken p-3 text-sm text-muted">{p('privacyNote')}</p>
            <fieldset>
              <legend className="label">{p('nameLabel')}</legend>
              <div className="mt-1 space-y-2">
                <Radio name={ids.name} checked={nameStyle === 'first'} onChange={() => setNameStyle('first')} label={p('nameFirst', { name: firstName })} />
                <Radio name={ids.name} checked={nameStyle === 'initials'} onChange={() => setNameStyle('initials')} label={p('nameInitials', { name: initials(user?.firstName ?? '', user?.lastName ?? '', locale) })} />
              </div>
            </fieldset>
            <div className="space-y-3">
              {referralEnabled && <Checkbox checked={showReferral} onChange={(e) => setShowReferral(e.target.checked)} label={p('referral')} hint={p('referralHint')} />}
              <Checkbox checked={allowIndexing} onChange={(e) => setAllowIndexing(e.target.checked)} label={p('indexing')} hint={p('indexingHint')} />
            </div>
            <div>
              <label htmlFor={ids.lang} className="label">
                {p('language')}
              </label>
              <select id={ids.lang} className="input" value={locale} onChange={(e) => setLocale(e.target.value as (typeof CARD_LANGS)[number])}>
                {CARD_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAMES[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-warning-border bg-highlight-bg p-3">
              <Checkbox required checked={consent} onChange={(e) => setConsent(e.target.checked)} label={p('consent')} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {share && (
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  {p('cancel')}
                </Button>
              )}
              <Button type="submit" disabled={!consent} loading={save.isPending}>
                {share ? p('save') : p('create')}
              </Button>
            </div>
          </form>
        ) : share ? (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div role="group" aria-label={p('formatLabel')} className="mb-3 inline-flex rounded-full border border-line bg-sunken p-1">
                {(['post', 'story'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={format === f}
                    onClick={() => setFormat(f)}
                    className={clsx('min-h-10 rounded-full px-4 text-sm font-semibold transition-colors', format === f ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink')}
                  >
                    {f === 'post' ? p('formatPost') : p('formatStory')}
                  </button>
                ))}
              </div>
              <img
                key={`${share.cards[format]}:${share.nameStyle}:${share.locale}:${share.showReferral}`}
                src={`${share.cards[format]}?v=${encodeURIComponent(`${share.nameStyle}${share.locale}${share.showReferral}`)}`}
                alt={p('previewAlt', { format: format === 'post' ? p('formatPost') : p('formatStory') })}
                width={1080}
                height={format === 'post' ? 1350 : 1920}
                className={clsx('mx-auto h-auto w-full rounded-xl border border-line bg-sunken shadow-sm', format === 'post' ? 'max-w-xs' : 'max-w-[13rem]')}
              />
            </div>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                {canShare && (
                  <Button icon={Share2} loading={sharing} onClick={() => void nativeShare(share)}>
                    {p('share')}
                  </Button>
                )}
                <a href={`${share.cards[format]}?download=1`} download={`triad-vision-${format}.png`} className={buttonClass({ variant: canShare ? 'secondary' : 'primary' })}>
                  <Download className="size-4" aria-hidden /> {p('download')}
                </a>
                <Button variant="secondary" icon={Copy} onClick={() => void copyLink(share.url)}>
                  {p('copy')}
                </Button>
              </div>
              <div className="rounded-lg bg-sunken p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <Link2 className="size-4" aria-hidden /> {p('linkLabel')}
                </p>
                <a href={share.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-link hover:underline">
                  {share.url}
                </a>
                <p className="mt-2 text-muted">
                  {p('active')} · {p('leads', { count: share.leads })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                  {p('edit')}
                </Button>
                <Button variant="ghost" size="sm" icon={Trash2} className="text-danger-fg" onClick={() => setConfirmRevoke(true)}>
                  {p('revoke')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
      {share && (
        <ConfirmDialog
          open={confirmRevoke}
          onClose={() => setConfirmRevoke(false)}
          onConfirm={() => revoke.mutate(share.token)}
          title={p('revokeTitle')}
          message={p('revokeText')}
          confirmLabel={p('revoke')}
          cancelLabel={p('cancel')}
          loading={revoke.isPending}
          zIndex={90}
        />
      )}
    </>
  );
};

/**
 * Congratulations + "Share my success" for an approved case. `caseId`: that case (case view); without it the
 * most recent approved case (portal home, where the client may hide the card). Renders nothing otherwise.
 */
export const SuccessShareCard = ({ caseId, dismissible = false }: { caseId?: string; dismissible?: boolean }) => {
  const { t } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => String(t(`successShare.portal.${k}`, o));
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Data>('/account/success-share')).data, staleTime: 60_000 });
  const item = caseId ? data?.items.find((i) => i.caseId === caseId) : data?.items[0];
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (item && dismissible) setHidden(readHidden(item.caseId));
  }, [item, dismissible]);

  if (!data || !item || hidden) return null;

  return (
    <section aria-labelledby={`share-${item.caseId}`} className="relative overflow-hidden rounded-3xl border border-success-border bg-success-bg/60 p-5 sm:p-6">
      {dismissible && (
        <button
          type="button"
          className="absolute top-2 right-2 grid size-10 place-items-center rounded-lg text-muted hover:bg-card hover:text-ink"
          aria-label={p('dismiss')}
          title={p('dismiss')}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISS(item.caseId), '1');
            } catch {
              /* storage blocked: hidden for this visit only */
            }
          }}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Success className="w-28 shrink-0 self-center sm:w-32" />
        <div className="min-w-0 flex-1">
          <h2 id={`share-${item.caseId}`} className="font-display text-xl font-semibold text-ink sm:text-2xl">
            {p('title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{p('text')}</p>
          {item.share && <p className="mt-1 text-xs font-semibold text-success-fg">{p('active')}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Share2} onClick={() => setOpen(true)}>
              {item.share ? p('openCard') : p('shareCta')}
            </Button>
          </div>
        </div>
      </div>
      <ShareDialog open={open} onClose={() => setOpen(false)} item={item} referralEnabled={data.referralEnabled} />
    </section>
  );
};

export default SuccessShareCard;
