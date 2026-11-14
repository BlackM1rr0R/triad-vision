import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, FileText, Send, X } from 'lucide-react';
import i18n, { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesGermanyJobs } from '@/i18n/pagesGermanyJobs';
import { pagesJobs } from '@/i18n/pagesJobs';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadVisitorId } from '@/lib/leadVisitor';
import { isListingUrl, listingHost, type GermanyJobSource, type GermanyJobType } from '@/lib/germanyJobs';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PhoneInput, phoneInvalid } from '@/components/ui/PhoneInput';
import { useJobLabels } from '@/components/jobs/labels';
import { GERMAN_LEVELS } from '@/components/jobs/types';

registerCopy(pagesJobs);
registerCopy(pagesGermanyJobs);

/** The listing the visitor applies for: a search result (prefilled) or a pasted link. */
export interface ExternalListing {
  provider: GermanyJobSource | 'link';
  url: string;
  externalId?: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  type?: GermanyJobType;
}

const CV_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CV_MAX_MB = 5;
const CV_TYPES = /\.(pdf|docx?)$/i;

const errorText = (err: unknown) => {
  const code = errorCode(err);
  const key = `gj.apply.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('gj.apply.errors.generic'));
};

/**
 * "Apply via Triad Vision" for a vacancy on another site (POST /api/germany-jobs/apply, multipart). Signed-in
 * clients get their profile prefilled and the lead is attached to their account on the server. Opened from a
 * click only, so it never takes part in the server-rendered markup.
 */
export const ApplyDialog = ({ listing, onClose }: { listing: ExternalListing | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const L = useJobLabels();
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const client = user?.role === 'CLIENT' ? user : null;
  const empty = { url: '', title: '', company: '', name: '', email: '', phone: '', germanLevel: '', profession: '', experience: '', message: '', consent: false, website: '' };
  const [f, setF] = useState(empty);
  const [cv, setCv] = useState<File | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A new listing opens a fresh form (prefilled from the listing and, when signed in, the client profile).
  useEffect(() => {
    if (!listing) return;
    setF({
      ...empty,
      url: listing.url,
      title: listing.title ?? '',
      company: listing.company ?? '',
      name: client ? `${client.firstName} ${client.lastName}`.trim() : '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      germanLevel: client?.germanLevel && (GERMAN_LEVELS as readonly string[]).includes(client.germanLevel) ? client.germanLevel : '',
      profession: client?.profession ?? '',
      experience: client?.experienceYears != null ? String(client.experienceYears) : '',
    });
    setCv(null);
    setCvError(null);
    setError(null);
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing, client?.id]);

  useEffect(() => {
    if (done) doneRef.current?.focus({ preventScroll: true });
  }, [done]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const urlOk = isListingUrl(f.url);
  const phoneBad = phoneInvalid(f.phone, { current: client?.phone });

  const pickCv = (file: File | null) => {
    setCvError(null);
    if (!file) return setCv(null);
    if (!CV_TYPES.test(file.name)) {
      setCvError(t('gj.apply.errors.UNSUPPORTED_FILE_TYPE'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > CV_MAX_MB * 1024 * 1024) {
      setCvError(t('gj.apply.errors.FILE_TOO_LARGE'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setCv(file);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!listing || sending || !urlOk || phoneBad) return;
    const fd = new FormData();
    fd.set('provider', listing.provider !== 'link' && f.url === listing.url ? listing.provider : 'link');
    if (listing.externalId && f.url === listing.url) fd.set('externalId', listing.externalId);
    fd.set('listingUrl', f.url.trim());
    if (f.title.trim()) fd.set('listingTitle', f.title.trim());
    if (f.company.trim()) fd.set('listingCompany', f.company.trim());
    if (listing.location) fd.set('listingLocation', listing.location);
    if (listing.type) fd.set('jobType', listing.type);
    fd.set('name', f.name.trim());
    fd.set('email', f.email.trim());
    fd.set('phone', f.phone.trim());
    fd.set('germanLevel', f.germanLevel);
    fd.set('profession', f.profession.trim());
    if (f.experience.trim()) fd.set('experienceYears', f.experience.trim());
    if (f.message.trim()) fd.set('message', f.message.trim());
    fd.set('consent', f.consent ? 'true' : '');
    fd.set('lng', currentSiteLocale());
    if (f.website) fd.set('website', f.website);
    const visitorId = leadVisitorId();
    if (visitorId) fd.set('visitorId', visitorId);
    if (cv) fd.set('cv', cv);
    setSending(true);
    setError(null);
    try {
      await api.post('/germany-jobs/apply', fd);
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const host = listingHost(f.url);
  const form = `${uid}-form`;

  return (
    <Modal
      open={!!listing}
      onClose={onClose}
      title={done ? t('gj.apply.doneTitle') : t('gj.apply.title')}
      description={done ? undefined : t('gj.apply.description')}
      size="lg"
      mobile="full"
      busy={sending}
      footer={
        done ? (
          <Button onClick={onClose}>{t('gj.apply.cancel')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              {t('gj.apply.cancel')}
            </Button>
            <Button type="submit" form={form} loading={sending} icon={Send} disabled={!urlOk || phoneBad || !f.consent}>
              {sending ? t('gj.apply.sending') : t('gj.apply.submit')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col items-center py-8 text-center outline-none">
          <span className="grid size-16 place-items-center rounded-full bg-success-bg text-success">
            <CheckCircle2 className="size-8" aria-hidden />
          </span>
          <p className="mt-4 max-w-sm text-muted">{t('gj.apply.doneText')}</p>
        </div>
      ) : (
        <form id={form} onSubmit={submit} className="space-y-6" noValidate={false}>
          {/* honeypot for bots */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={f.website} onChange={(e) => set('website', e.target.value)} />

          <fieldset className="space-y-3 rounded-xl border border-line bg-sunken/60 p-4">
            <legend className="px-1 text-sm font-semibold text-ink">{t('gj.apply.listing')}</legend>
            <div>
              <label className="label" htmlFor={id('url')}>
                {t('gj.apply.listingUrl')} <span aria-hidden>*</span>
              </label>
              <input
                id={id('url')}
                type="url"
                inputMode="url"
                required
                maxLength={1000}
                className="input"
                value={f.url}
                onChange={(e) => set('url', e.target.value)}
                aria-invalid={(!!f.url && !urlOk) || undefined}
                aria-describedby={f.url && !urlOk ? id('url-err') : undefined}
              />
              {f.url && !urlOk ? (
                <p id={id('url-err')} className="mt-1 text-xs text-danger">
                  {t('gj.link.invalid')}
                </p>
              ) : (
                host && (
                  <a href={f.url} target="_blank" rel="nofollow noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-link hover:underline">
                    {host} <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">{t('gj.card.newTab')}</span>
                  </a>
                )
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={id('title')}>{t('gj.apply.listingTitle')}</label>
                <input id={id('title')} maxLength={300} className="input" value={f.title} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={id('company')}>{t('gj.apply.listingCompany')}</label>
                <input id={id('company')} maxLength={200} className="input" value={f.company} onChange={(e) => set('company', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-ink">{t('gj.apply.you')}</legend>
            {client && <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-muted">{t('gj.apply.prefilled')}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={id('name')}>
                  {t('gj.apply.name')} <span aria-hidden>*</span>
                </label>
                <input id={id('name')} required minLength={2} maxLength={120} autoComplete="name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={id('email')}>
                  {t('gj.apply.email')} <span aria-hidden>*</span>
                </label>
                <input id={id('email')} type="email" required maxLength={190} autoComplete="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={id('phone')}>
                  {t('gj.apply.phone')} <span aria-hidden>*</span>
                </label>
                <PhoneInput id={id('phone')} required value={f.phone} current={client?.phone} onChange={(v) => set('phone', v)} />
              </div>
              <div>
                <label className="label" htmlFor={id('german')}>
                  {t('gj.apply.germanLevel')} <span aria-hidden>*</span>
                </label>
                <select id={id('german')} required className="input" value={f.germanLevel} onChange={(e) => set('germanLevel', e.target.value)}>
                  <option value="" disabled>
                    —
                  </option>
                  {GERMAN_LEVELS.map((g) => (
                    <option key={g} value={g}>
                      {L.german(g)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={id('profession')}>
                  {t('gj.apply.profession')} <span aria-hidden>*</span>
                </label>
                <input id={id('profession')} required minLength={2} maxLength={160} className="input" value={f.profession} onChange={(e) => set('profession', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={id('experience')}>{t('gj.apply.experience')}</label>
                <input id={id('experience')} type="number" inputMode="numeric" min={0} max={50} className="input" value={f.experience} onChange={(e) => set('experience', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor={id('cv')}>{t('gj.apply.cv')}</label>
              {cv ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">{cv.name}</span>
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                    onClick={() => {
                      setCv(null);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    aria-label={t('gj.apply.cvRemove')}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <input
                  ref={fileRef}
                  id={id('cv')}
                  type="file"
                  accept={CV_ACCEPT}
                  className="input file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:text-ink"
                  onChange={(e) => pickCv(e.target.files?.[0] ?? null)}
                  aria-describedby={`${id('cv-hint')}${cvError ? ` ${id('cv-err')}` : ''}`}
                  aria-invalid={!!cvError || undefined}
                />
              )}
              <p id={id('cv-hint')} className="mt-1 text-xs text-muted">
                {t('gj.apply.cvHint', { mb: CV_MAX_MB })}
              </p>
              {cvError && (
                <p id={id('cv-err')} className="mt-1 text-xs text-danger" role="alert">
                  {cvError}
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor={id('message')}>{t('gj.apply.message')}</label>
              <textarea id={id('message')} rows={3} maxLength={3000} className="input resize-y" value={f.message} onChange={(e) => set('message', e.target.value)} />
            </div>

            <label className="flex items-start gap-2.5 text-sm text-muted">
              <input type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>
                {t('gj.apply.consent')}{' '}
                <Link to="/privacy" target="_blank" className="text-link underline">
                  {t('gj.apply.privacyLink')}
                </Link>
              </span>
            </label>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};
