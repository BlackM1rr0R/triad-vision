import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Copy, Link2, MessageCircle } from 'lucide-react';

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Referral link with copy buttons and a WhatsApp share link (no QR library is bundled). */
export const ShareBox = ({ link, code, compact = false }: { link: string; code: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const copy = async (what: 'link' | 'code') => {
    if (await copyText(what === 'link' ? link : code)) {
      setCopied(what);
      toast.success(t('agents.dash.share.copied'));
      window.setTimeout(() => setCopied(null), 2000);
    }
  };
  const wa = `https://wa.me/?text=${encodeURIComponent(t('agents.dash.share.whatsappText', { link }))}`;
  return (
    <div className={clsx(!compact && 'rounded-2xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)] sm:p-6')}>
      {!compact && (
        <>
          <p className="type-section-title flex items-center gap-2 text-ink">
            <Link2 className="size-5 text-primary" aria-hidden /> {t('agents.dash.share.title')}
          </p>
          <p className="mt-1 text-sm text-muted">{t('agents.dash.share.text')}</p>
        </>
      )}
      <div className={clsx('flex flex-col gap-2 sm:flex-row', !compact && 'mt-4')}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 font-mono text-xs sm:text-sm"
          aria-label={t('agents.dash.share.title')}
        />
        <button type="button" className="btn-primary shrink-0" onClick={() => copy('link')}>
          {copied === 'link' ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t('agents.dash.share.copy')}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t('agents.dash.share.code')}:</span>
        <code className="rounded-md border border-line bg-sunken px-2 py-1 font-mono text-sm font-bold tracking-wider text-ink">{code}</code>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-link hover:bg-sunken sm:min-h-10"
          onClick={() => copy('code')}
        >
          {copied === 'code' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {t('agents.dash.share.copyCode')}
        </button>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#128C7E] px-3.5 text-sm font-semibold text-white hover:bg-[#0E7468] sm:min-h-10"
        >
          <MessageCircle className="size-3.5" aria-hidden /> {t('agents.dash.share.whatsapp')}
        </a>
      </div>
    </div>
  );
};
