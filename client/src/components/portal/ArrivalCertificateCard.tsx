import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Award, Download, ExternalLink } from 'lucide-react';
import { api, getImpersonation } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Field';
import { celebrateOnce } from '@/components/motion/celebrate';
import { registerCopy } from '@/i18n';
import { pagesMilestoneDocs } from '@/i18n/pagesMilestoneDocs';

registerCopy(pagesMilestoneDocs);

/*
 * "Welcome to Germany" certificate (GET /api/account/arrival-certificate): shown on the arrival page once the
 * arrival is confirmed. Download as PDF in az / de / en / ru, optionally without the employer's name; a small
 * confetti burst the first time (per case and device, skipped with reduced motion and while staff view the
 * portal as the client). A certificate revoked by staff shows a notice instead of the download.
 */

interface Certificate {
  caseId: string;
  caseNumber: string;
  number: string;
  issuedAt: string;
  arrivedAt: string;
  city: string | null;
  profession: string;
  employer: string | null;
  revoked: boolean;
  verifyUrl: string | null;
}

const LANGS = ['az', 'de', 'en', 'ru'] as const;
type Lang = (typeof LANGS)[number];
const LANG_NAMES: Record<Lang, string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' };

export function ArrivalCertificateCard({ caseId }: { caseId: string }) {
  const { t, i18n } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => String(t(`milestones.cert.${k}`, o));
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [lang, setLang] = useState<Lang>((LANGS as readonly string[]).includes(ui) ? (ui as Lang) : 'de');
  const [withEmployer, setWithEmployer] = useState(true);
  const [busy, setBusy] = useState(false);
  const langId = useId();
  const { data } = useQuery({
    queryKey: ['account', 'arrival-certificate'],
    queryFn: async () => (await api.get<{ items: Certificate[] }>('/account/arrival-certificate')).data.items,
    staleTime: 60_000,
  });
  const cert = data?.find((c) => c.caseId === caseId) ?? null;

  const certId = cert && !cert.revoked ? cert.number : null;
  useEffect(() => {
    if (!certId || getImpersonation() !== null) return;
    const timer = window.setTimeout(() => celebrateOnce(`arrival-certificate:${certId}`, { count: 90 }), 400);
    return () => window.clearTimeout(timer);
  }, [certId]);

  if (!cert) return null;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { dateStyle: 'long', timeZone: 'Europe/Berlin' }).format(new Date(cert.arrivedAt));

  if (cert.revoked) {
    return (
      <section className="rounded-2xl border border-line bg-sunken p-5 text-sm">
        <p className="font-semibold text-ink">{p('revoked')}</p>
        <p className="mt-1 text-muted">{p('revokedText')}</p>
      </section>
    );
  }

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/account/arrival-certificate/${encodeURIComponent(caseId)}/certificate.pdf?lang=${lang}&employer=${withEmployer ? 1 : 0}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `welcome-to-germany-${cert.number}-${lang}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(p('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`arrival-cert-${caseId}`} className="relative overflow-hidden rounded-3xl border border-highlight/40 bg-highlight-bg p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-card text-ink shadow-sm">
          <Award className="size-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`arrival-cert-${caseId}`} className="font-display text-xl font-semibold text-ink sm:text-2xl">
            {p('title')}
          </h2>
          <p className="mt-1 text-sm text-ink/80">{p('text')}</p>
          <p className="mt-2 text-xs text-muted">
            {p('number', { number: cert.number })} · {p('arrived', { date })}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_auto] sm:items-end">
            <div>
              <label htmlFor={langId} className="label">
                {p('language')}
              </label>
              <select id={langId} className="input" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAMES[l]}
                  </option>
                ))}
              </select>
            </div>
            {cert.employer && <Checkbox checked={withEmployer} onChange={(e) => setWithEmployer(e.target.checked)} label={p('includeEmployer')} />}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Download} loading={busy} onClick={() => void download()}>
              {p('download')}
            </Button>
            {cert.verifyUrl && (
              <a href={cert.verifyUrl} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-link hover:underline">
                <ExternalLink className="size-4" aria-hidden /> {p('verify')}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ArrivalCertificateCard;
