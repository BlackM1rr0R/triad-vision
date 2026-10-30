import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, ExternalLink, FileText, Globe, ImagePlus, MessageCircle, Printer, Send, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { registerCopy } from '@/i18n';
import { pagesReferralShare } from '@/i18n/pagesReferralShare';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';

registerCopy(pagesReferralShare);

/**
 * Client portal "Refer a friend" sharing tools: ready messages per profession (WhatsApp / Telegram / copy),
 * the printable QR card (PDF), the opt-in personal landing page /r/<slug> and the link to the terms.
 */

interface ShareData {
  link: string | null;
  landing: { enabled: boolean; slug: string | null; quote: string; photoUrl: string | null; url: string | null };
  templates: { key: string; label: L10n; text: L10n }[];
}
const KEY = ['growth', 'referral', 'share'] as const;
const LANDING_ERRORS = ['INVALID_SLUG', 'SLUG_TAKEN', 'SLUG_REQUIRED', 'INVALID_IMAGE', 'IMAGE_TOO_LARGE'];

const ShareMessages = ({ data }: { data: ShareData }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [key, setKey] = useState(data.templates[0]?.key ?? '');
  const tpl = data.templates.find((x) => x.key === key) ?? data.templates[0];
  if (!tpl || !data.link) return null;
  const text = tr(tpl.text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('rs.share.copied'));
    } catch {
      // clipboard blocked: the text stays selectable
    }
  };
  return (
    <section className="card card-pad">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <MessageCircle className="size-5 text-primary" aria-hidden /> {t('rs.share.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('rs.share.text')}</p>
      <label className="mt-3 block max-w-xs">
        <span className="label">{t('rs.share.profession')}</span>
        <select className="input" value={tpl.key} onChange={(e) => setKey(e.target.value)}>
          {data.templates.map((x) => (
            <option key={x.key} value={x.key}>
              {tr(x.label)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 rounded-xl border border-line bg-sunken/60 p-3 text-sm whitespace-pre-line text-ink">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1f8a4c] px-3.5 text-sm font-semibold text-white hover:bg-[#1a7541]">
          <MessageCircle className="size-3.5" aria-hidden /> {t('gp.ref.whatsapp')}
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(text.split(data.link).join('').trim())}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#1f7fb8] px-3.5 text-sm font-semibold text-white hover:bg-[#1a6c9d]"
        >
          <Send className="size-3.5" aria-hidden /> {t('gp.ref.telegram')}
        </a>
        <button type="button" className="btn-secondary min-h-11" onClick={copy}>
          <Copy className="size-3.5" aria-hidden /> {t('rs.share.copy')}
        </button>
      </div>
    </section>
  );
};

const LandingSettings = ({ data }: { data: ShareData }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ enabled: data.landing.enabled, slug: data.landing.slug ?? '', quote: data.landing.quote });
  useEffect(() => setForm({ enabled: data.landing.enabled, slug: data.landing.slug ?? '', quote: data.landing.quote }), [data.landing.enabled, data.landing.slug, data.landing.quote]);
  const fail = (e: unknown) => {
    const code = errorCode(e);
    toast.error(code && LANDING_ERRORS.includes(code) ? t(`rs.landing.errors.${code}`) : t('gp.common.error'));
  };
  const refresh = () => void qc.invalidateQueries({ queryKey: ['growth', 'referral'] });
  const save = useMutation({
    mutationFn: () => api.put('/growth/referral/landing', { enabled: form.enabled, slug: form.slug.trim() || null, quote: form.quote }),
    onSuccess: () => {
      toast.success(t('rs.landing.saved'));
      refresh();
    },
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/growth/referral/landing/photo', fd);
    },
    onSuccess: refresh,
    onError: fail,
  });
  const removePhoto = useMutation({ mutationFn: () => api.delete('/growth/referral/landing/photo'), onSuccess: refresh, onError: fail });

  return (
    <section className="card card-pad">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Globe className="size-5 text-primary" aria-hidden /> {t('rs.landing.title')}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">{t('rs.landing.text')}</p>
      <div className="mt-4 space-y-4">
        <Switch showLabel checked={form.enabled} label={t('rs.landing.enabled')} onChange={(v) => setForm({ ...form, enabled: v })} />
        <label className="block max-w-md">
          <span className="label">{t('rs.landing.slug')}</span>
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-sm text-muted">/r/</span>
            <input className="input" maxLength={40} value={form.slug} placeholder="ali-baku" onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <span className="mt-1 block text-xs text-muted">{t('rs.landing.slugHint')}</span>
        </label>
        <label className="block max-w-xl">
          <span className="label">{t('rs.landing.quote')}</span>
          <textarea className="input" rows={2} maxLength={280} value={form.quote} placeholder={t('rs.landing.quotePlaceholder')} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
        </label>
        <div>
          <span className="label">{t('rs.landing.photo')}</span>
          <div className="flex flex-wrap items-center gap-3">
            {data.landing.photoUrl && <img src={data.landing.photoUrl} alt="" className="size-16 rounded-full object-cover" />}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn-secondary btn-sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-3.5" aria-hidden /> {t('rs.landing.photoUpload')}
            </button>
            {data.landing.photoUrl && (
              <button type="button" className="btn-ghost btn-sm" disabled={removePhoto.isPending} onClick={() => removePhoto.mutate()}>
                <Trash2 className="size-3.5" aria-hidden /> {t('rs.landing.photoRemove')}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{t('rs.landing.photoHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('rs.landing.save')}
          </button>
          {data.landing.enabled && data.landing.url && (
            <a href={data.landing.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
              <ExternalLink className="size-3.5" aria-hidden /> {t('rs.landing.open')}
            </a>
          )}
        </div>
      </div>
    </section>
  );
};

export const PortalReferralShare = () => {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<ShareData>('/growth/referral/share')).data });
  if (!data || !data.link) return null;
  const lang = i18n.language.slice(0, 2);
  const card = (layout: 'single' | 'sheet') => `/api/growth/referral/card.pdf?layout=${layout}${['az', 'de', 'en', 'ru'].includes(lang) ? `&lang=${lang}` : ''}`;
  return (
    <>
      <ShareMessages data={data} />
      <section className="card card-pad">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Printer className="size-5 text-primary" aria-hidden /> {t('rs.card.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('rs.card.text')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={card('single')} className="btn-secondary btn-sm" download>
            <FileText className="size-3.5" aria-hidden /> {t('rs.card.single')}
          </a>
          <a href={card('sheet')} className="btn-secondary btn-sm" download>
            <FileText className="size-3.5" aria-hidden /> {t('rs.card.sheet')}
          </a>
        </div>
      </section>
      <LandingSettings data={data} />
    </>
  );
};

/** Link to the public programme terms. */
export const ReferralTermsLink = () => {
  const { t } = useTranslation();
  return (
    <Link to="/referral-terms" className="font-semibold text-link hover:underline">
      {t('rs.terms.link')}
    </Link>
  );
};
