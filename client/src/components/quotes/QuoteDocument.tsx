import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock3, Download, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';

/** The quote as the employer sees it (GET /api/angebot/:token, GET /api/company/quotes/:id). */
export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED';

export interface CustomerQuote {
  id?: string;
  number: string | null;
  status: QuoteStatus;
  title: string;
  salutation: string;
  introText: string | null;
  closingText: string | null;
  contactName: string | null;
  items: { pos: number; description: string; quantity: number; unit: string; unitLabel: string; unitPriceCents: number; totalCents: number; vatRate: number }[];
  discount: { type: 'NONE' | 'PERCENT' | 'AMOUNT'; value: number; label: string | null };
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatBreakdown: { rate: number; netCents: number; vatCents: number }[];
  date: string;
  validUntil: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  smallBusiness: boolean;
  company: { name: string; legalForm: string | null; address: string | null; city: string | null };
  seller: { name: string; street: string; zipCity: string; email: string; phone: string; website: string };
  acceptedAt: string | null;
  acceptedByName: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  canRespond: boolean;
}

export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = toneClasses(STATUS_TONES.quote);

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtEur = (cents: number) => eur.format(cents / 100);
/** The document is German: dates always dd.mm.yyyy in Berlin. */
export const deDate = (iso: string) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(iso));
const qtyFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** German quote document (labels are German on purpose: it mirrors the PDF). */
export const QuoteDocument = ({ q, pdfHref }: { q: CustomerQuote; pdfHref: string }) => {
  const { t } = useTranslation();
  const mixed = q.vatBreakdown.length > 1;
  return (
    <article className="card overflow-hidden" lang="de">
      <div className="h-1.5 bg-brand-600" aria-hidden />
      <div className="p-5 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-navy-900">{q.seller.name || 'Triad Vision'}</p>
            <p className="text-xs text-muted">{[q.seller.street, q.seller.zipCity].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-extrabold tracking-wide text-navy-900">ANGEBOT</p>
            <a href={pdfHref} className="btn-white btn-sm mt-2 border border-line" download>
              <Download className="size-3.5" aria-hidden /> {t('quotePublic.download')}
            </a>
          </div>
        </header>

        <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_auto]">
          <address className="text-sm leading-relaxed text-ink not-italic">
            <strong className="text-navy-900">{[q.company.name, q.company.legalForm && !q.company.name.includes(q.company.legalForm) ? q.company.legalForm : ''].filter(Boolean).join(' ')}</strong>
            {q.contactName && (
              <>
                <br />z. Hd. {q.contactName}
              </>
            )}
            {(q.company.address ?? '').split(/\r?\n/).filter(Boolean).map((l) => (
              <span key={l}>
                <br />
                {l}
              </span>
            ))}
            {q.company.city && !(q.company.address ?? '').includes(q.company.city) && (
              <>
                <br />
                {q.company.city}
              </>
            )}
          </address>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Angebotsnummer</dt>
            <dd className="text-right font-semibold text-navy-900 tabular-nums">{q.number}</dd>
            <dt className="text-muted">Angebotsdatum</dt>
            <dd className="text-right tabular-nums">{deDate(q.date)}</dd>
            <dt className="text-muted">Gültig bis</dt>
            <dd className="text-right tabular-nums">{deDate(q.validUntil)}</dd>
          </dl>
        </div>

        <h2 className="mt-8 font-display text-lg font-bold text-navy-900 sm:text-xl">
          Angebot Nr. {q.number}: {q.title}
        </h2>
        <p className="mt-4 text-sm text-ink">{q.salutation}</p>
        {q.introText && <p className="mt-2 text-sm whitespace-pre-line text-ink">{q.introText}</p>}

        {/* Items: table from sm, cards below */}
        <div className="mt-6 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="hidden bg-surface text-left text-xs text-muted sm:table-header-group">
              <tr>
                <th className="px-3 py-2 font-semibold">Pos.</th>
                <th className="px-3 py-2 font-semibold">Bezeichnung</th>
                <th className="px-3 py-2 text-right font-semibold">Menge</th>
                <th className="px-3 py-2 font-semibold">Einheit</th>
                <th className="px-3 py-2 text-right font-semibold">Einzelpreis</th>
                <th className="px-3 py-2 text-right font-semibold">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.items.map((l) => (
                <tr key={l.pos} className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-3 sm:table-row sm:p-0">
                  <td className="hidden text-muted tabular-nums sm:table-cell sm:px-3 sm:py-2.5">{l.pos}</td>
                  <td className="basis-full text-ink sm:basis-auto sm:px-3 sm:py-2.5">
                    {l.description}
                    {mixed && <span className="block text-[11px] text-muted">USt. {l.vatRate} %</span>}
                  </td>
                  <td className="text-muted tabular-nums sm:px-3 sm:py-2.5 sm:text-right sm:text-ink">{qtyFmt.format(l.quantity)}</td>
                  <td className="text-muted sm:px-3 sm:py-2.5 sm:text-ink">{l.unitLabel}</td>
                  <td className="text-muted tabular-nums sm:px-3 sm:py-2.5 sm:text-right sm:text-ink">
                    <span className="sm:hidden">× </span>
                    {fmtEur(l.unitPriceCents)}
                  </td>
                  <td className="ml-auto font-semibold text-navy-900 tabular-nums sm:ml-0 sm:px-3 sm:py-2.5 sm:text-right">{fmtEur(l.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm tabular-nums">
          {q.discountCents > 0 && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Zwischensumme</dt>
                <dd>{fmtEur(q.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">abzgl. Rabatt{q.discount.label ? ` ${q.discount.label}` : ''}</dt>
                <dd>-{fmtEur(q.discountCents)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Nettobetrag</dt>
            <dd>{fmtEur(q.netCents)}</dd>
          </div>
          {q.smallBusiness ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Umsatzsteuer</dt>
              <dd>{fmtEur(0)}</dd>
            </div>
          ) : (
            q.vatBreakdown.map((g) => (
              <div key={g.rate} className="flex justify-between gap-4">
                <dt className="text-muted">zzgl. {g.rate} % USt.</dt>
                <dd>{fmtEur(g.vatCents)}</dd>
              </div>
            ))
          )}
          <div className="flex justify-between gap-4 border-t border-line pt-1.5 text-base font-bold text-navy-900">
            <dt>Gesamtbetrag</dt>
            <dd>{fmtEur(q.grossCents)}</dd>
          </div>
        </dl>

        <div className="mt-6 space-y-4 text-sm text-ink">
          {q.smallBusiness && <p>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</p>}
          {q.paymentTerms && (
            <div>
              <p className="font-semibold text-navy-900">Zahlungsbedingungen</p>
              <p className="whitespace-pre-line">{q.paymentTerms}</p>
            </div>
          )}
          {q.deliveryTerms && (
            <div>
              <p className="font-semibold text-navy-900">Lieferbedingungen</p>
              <p className="whitespace-pre-line">{q.deliveryTerms}</p>
            </div>
          )}
          <p>Dieses Angebot ist gültig bis zum {deDate(q.validUntil)}.</p>
          {q.closingText && <p className="whitespace-pre-line">{q.closingText}</p>}
          <p>
            Mit freundlichen Grüßen
            <br />
            <strong className="text-navy-900">{q.seller.name || 'Triad Vision'}</strong>
          </p>
        </div>
      </div>
    </article>
  );
};

/** Status banner + accept / decline forms (UI in the visitor's language). */
export const QuoteRespond = ({
  q,
  busy,
  error,
  onAccept,
  onDecline,
}: {
  q: CustomerQuote;
  busy: boolean;
  error: string | null;
  onAccept: (name: string) => void;
  onDecline: (reason: string) => void;
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'accept' | 'decline' | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');

  if (q.status === 'ACCEPTED' || q.status === 'CONVERTED') {
    return (
      <Banner tone="good" icon={CheckCircle2} title={q.status === 'CONVERTED' ? t('quotePublic.convertedTitle') : t('quotePublic.acceptedTitle')}>
        {q.acceptedAt && t('quotePublic.acceptedText', { date: deDate(q.acceptedAt), name: q.acceptedByName ?? '' })}
      </Banner>
    );
  }
  if (q.status === 'DECLINED') {
    return (
      <Banner tone="muted" icon={XCircle} title={t('quotePublic.declinedTitle')}>
        {t('quotePublic.declinedText')}
      </Banner>
    );
  }
  if (q.status === 'EXPIRED' || !q.canRespond) {
    return (
      <Banner tone="warn" icon={Clock3} title={t('quotePublic.expiredTitle')}>
        {t('quotePublic.expiredText')}
      </Banner>
    );
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="quote-respond-title">
      <h2 id="quote-respond-title" className="font-display text-lg font-bold text-navy-900">
        {t('quotePublic.respondTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {t('quotePublic.validUntil')} {deDate(q.validUntil)} · {fmtEur(q.grossCents)}
      </p>
      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {mode === null && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => setMode('accept')}>
            <ThumbsUp className="size-4" aria-hidden /> {t('quotePublic.accept')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMode('decline')}>
            <ThumbsDown className="size-4" aria-hidden /> {t('quotePublic.decline')}
          </button>
        </div>
      )}

      {mode === 'accept' && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && confirm) onAccept(name.trim());
          }}
        >
          <div>
            <label className="label" htmlFor="quote-accept-name">
              {t('quotePublic.name')}
            </label>
            <input id="quote-accept-name" className="input" autoComplete="name" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>{t('quotePublic.confirm')}</span>
          </label>
          <p className="text-[11px] text-muted">{t('quotePublic.legal')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2 || !confirm}>
              {busy && <Spinner className="size-4" />} {t('quotePublic.acceptCta')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setMode(null)} disabled={busy}>
              {t('quotePublic.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'decline' && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) onDecline(reason.trim());
          }}
        >
          <div>
            <label className="label" htmlFor="quote-decline-reason">
              {t('quotePublic.reason')}
            </label>
            <textarea id="quote-decline-reason" className="input resize-y" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
            <p className="mt-1 text-[11px] text-muted">{t('quotePublic.reasonHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 3}>
              {busy && <Spinner className="size-4" />} {t('quotePublic.declineCta')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setMode(null)} disabled={busy}>
              {t('quotePublic.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

const Banner = ({ tone, icon: Icon, title, children }: { tone: 'good' | 'warn' | 'muted'; icon: typeof CheckCircle2; title: string; children?: ReactNode }) => (
  <div
    className={clsx(
      'flex items-start gap-3 rounded-2xl border p-4 sm:p-5',
      tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-line bg-surface text-ink',
    )}
    role="status"
  >
    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-0.5 text-sm opacity-90">{children}</p>}
    </div>
  </div>
);
