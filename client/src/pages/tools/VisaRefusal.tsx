import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ClipboardCheck, Copy, Download, FileText, Gavel, Printer, RefreshCw, Scale } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesVisaRefusal } from '@/i18n/pagesVisaRefusal';
import { usePageTitle } from '@/lib/usePageTitle';
import { downloadText, printDocument } from '@/lib/printDocument';
import { buildLetter, escapeHtml, REASONS, REFUSAL_AS_OF, VISA_PURPOSES, type LetterInput, type Reason, type VisaPurpose } from '@/lib/visaRefusal/letter';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';

registerCopy(pagesVisaRefusal);

const SOURCES = [
  { label: 'Auswärtiges Amt – Abschaffung des Remonstrationsverfahrens zum 1. Juli 2025', url: 'https://www.auswaertiges-amt.de/de/2715934-2715934' },
  { label: 'Deutsche Botschaft Baku – Allgemeine Hinweise zum nationalen Visum (FAQ: Ablehnung)', url: 'https://baku.diplo.de/az-de/konsularservice/visa-und-einreise/2810744-2810744' },
  { label: 'Verwaltungsgericht Berlin – Visumsverfahren', url: 'https://www.berlin.de/gerichte/verwaltungsgericht/service/visumsverfahren/' },
  { label: '§ 58 VwGO – Rechtsbehelfsbelehrung, Jahresfrist', url: 'https://www.gesetze-im-internet.de/vwgo/__58.html' },
  { label: '§ 67 VwGO – Vertretung vor Gericht (kein Anwaltszwang beim VG)', url: 'https://www.gesetze-im-internet.de/vwgo/__67.html' },
  { label: 'Deutsche Botschaft Amman – Merkblatt Abschaffung der Remonstration (Gerichtskosten, Stand 12/2025)', url: 'https://amman.diplo.de/resource/blob/2770682/55b61411b8cda90109c29d2c50b15386/merkblatt-abschaffung-remo-data.pdf' },
];

type Fields = Omit<LetterInput, 'fixes' | 'today' | 'purpose'>;
const EMPTY: Fields = { name: '', birthDate: '', passportNo: '', address: '', contact: '', previousDate: '', refusalDate: '', reference: '', enclosures: '' };

/**
 * /visa-refusal — why German national visas are refused, the options since remonstration was abolished
 * (1 July 2025: new application or lawsuit at the VG Berlin), a "what to fix" checklist and a German cover
 * letter for the new application, generated in the browser (print / PDF / .txt). Nothing is sent anywhere.
 */
export default function VisaRefusalPage() {
  const { t } = useTranslation();
  usePageTitle(t('visaRefusal.heroTitle'));
  const faq = useFaq('visaRefusal.faq');
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [purpose, setPurpose] = useState<VisaPurpose>('skilled');
  const [selected, setSelected] = useState<Reason[]>([]);
  const [fixes, setFixes] = useState<Partial<Record<Reason, string>>>({});
  const [today, setToday] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

  const letter = useMemo(
    () => buildLetter({ ...fields, purpose, today, fixes: Object.fromEntries(selected.map((r) => [r, fixes[r] ?? ''])) }),
    [fields, purpose, today, fixes, selected],
  );
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (r: Reason) => setSelected((s) => (s.includes(r) ? s.filter((x) => x !== r) : REASONS.filter((x) => x === r || s.includes(x))));
  const fixList = (r: Reason) => {
    const v = t(`visaRefusal.reasons.${r}.fix`, { returnObjects: true }) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  };

  const print = () => printDocument('Antrag – Anschreiben', `<pre>${escapeHtml(letter)}</pre>`, letter, 'anschreiben-neuer-visumantrag.txt');
  const printChecklist = () => {
    const body = `<h1>${escapeHtml(t('visaRefusal.fixTitle'))}</h1>${selected
      .map((r) => `<h2>${escapeHtml(t(`visaRefusal.reasons.${r}.title`))}</h2><ul>${fixList(r).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`)
      .join('')}<p class="muted">triad-vision.de/visa-refusal</p>`;
    const text = selected.map((r) => [t(`visaRefusal.reasons.${r}.title`), ...fixList(r).map((f) => `[ ] ${f}`)].join('\n')).join('\n\n');
    printDocument(t('visaRefusal.fixTitle'), body, text, 'checklist.txt');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the preview can still be selected by hand */
    }
  };

  const options = [
    { key: 'newApp', icon: RefreshCw },
    { key: 'court', icon: Gavel },
    { key: 'advice', icon: Scale },
  ] as const;

  return (
    <>
      <PageHero title={t('visaRefusal.heroTitle')} subtitle={t('visaRefusal.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-8">
          <div className="flex items-start gap-3 rounded-3xl border border-warning-border bg-warning-bg p-4 sm:p-5" role="note">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-fg" aria-hidden />
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{t('visaRefusal.statusTitle')}</h2>
              <p className="mt-1 text-sm text-ink">{t('visaRefusal.statusText')}</p>
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{t('visaRefusal.optionsTitle')}</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {options.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-2xl border border-line bg-card p-4">
                  <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                    <Icon className="size-5 text-primary" aria-hidden /> {t(`visaRefusal.options.${key}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`visaRefusal.options.${key}.text`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{t('visaRefusal.reasonsTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('visaRefusal.reasonsIntro')}</p>
            <div className="mt-3 space-y-2">
              {REASONS.map((r) => (
                <details key={r} className="group rounded-2xl border border-line bg-card p-4 open:shadow-sm">
                  <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
                    <span className="inline-flex items-center gap-2">
                      <FileText className="size-4 text-primary" aria-hidden /> {t(`visaRefusal.reasons.${r}.title`)}
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">{t('visaRefusal.means')}:</span> {t(`visaRefusal.reasons.${r}.means`)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">{t('visaRefusal.whatToDo')}:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                    {fixList(r).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="vr-letter-h">
              <div>
                <h2 id="vr-letter-h" className="font-display text-xl font-semibold text-ink">
                  {t('visaRefusal.letter.title')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('visaRefusal.letter.intro')}</p>
              </div>
              <fieldset>
                <legend className="label">{t('visaRefusal.letter.reasonsLegend')}</legend>
                <div className="mt-1 space-y-2">
                  {REASONS.map((r) => (
                    <div key={r}>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                        <input type="checkbox" className="size-5" checked={selected.includes(r)} onChange={() => toggle(r)} /> {t(`visaRefusal.reasons.${r}.title`)}
                      </label>
                      {selected.includes(r) && (
                        <textarea
                          className="input mt-1 min-h-20"
                          lang="de"
                          aria-label={`${t(`visaRefusal.reasons.${r}.title`)} – ${t('visaRefusal.letter.fixPlaceholder')}`}
                          placeholder={t('visaRefusal.letter.fixPlaceholder')}
                          value={fixes[r] ?? ''}
                          maxLength={800}
                          onChange={(e) => setFixes((f) => ({ ...f, [r]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="vr-purpose" className="label">
                  {t('visaRefusal.letter.purpose')}
                </label>
                <select id="vr-purpose" className="input" value={purpose} onChange={(e) => setPurpose(e.target.value as VisaPurpose)}>
                  {VISA_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {t(`visaRefusal.letter.purposes.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="vr-name" label={t('visaRefusal.letter.name')} value={fields.name} onChange={set('name')} autoComplete="name" />
                <Field id="vr-birth" label={t('visaRefusal.letter.birthDate')} value={fields.birthDate} onChange={set('birthDate')} type="date" />
                <Field id="vr-pass" label={t('visaRefusal.letter.passport')} value={fields.passportNo} onChange={set('passportNo')} />
                <Field id="vr-contact" label={t('visaRefusal.letter.contact')} value={fields.contact} onChange={set('contact')} />
                <Field id="vr-prev" label={t('visaRefusal.letter.previousDate')} value={fields.previousDate} onChange={set('previousDate')} type="date" />
                <Field id="vr-refusal" label={t('visaRefusal.letter.refusalDate')} value={fields.refusalDate} onChange={set('refusalDate')} type="date" />
                <Field id="vr-ref" label={t('visaRefusal.letter.reference')} value={fields.reference} onChange={set('reference')} />
                <Field id="vr-address" label={t('visaRefusal.letter.address')} value={fields.address} onChange={set('address')} autoComplete="street-address" />
              </div>
              <div>
                <label htmlFor="vr-encl" className="label">
                  {t('visaRefusal.letter.enclosures')}
                </label>
                <textarea id="vr-encl" className="input min-h-24" lang="de" value={fields.enclosures} maxLength={2000} onChange={set('enclosures')} />
              </div>
            </form>

            <div className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <ClipboardCheck className="size-5 text-primary" aria-hidden /> {t('visaRefusal.fixTitle')}
                </h2>
                {selected.length ? (
                  <>
                    {selected.map((r) => (
                      <div key={r} className="mt-3">
                        <p className="text-sm font-semibold text-ink">{t(`visaRefusal.reasons.${r}.title`)}</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                          {fixList(r).map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <button type="button" className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-3' })} onClick={printChecklist}>
                      <Printer className="size-4" aria-hidden /> {t('visaRefusal.letter.print')}
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">{t('visaRefusal.fixEmpty')}</p>
                )}
              </div>
              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('visaRefusal.letter.preview')}</h2>
                <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-sunken p-3 font-sans text-sm text-ink" lang="de" translate="no">
                  {letter}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass({})} onClick={print}>
                    <Printer className="size-4" aria-hidden /> {t('visaRefusal.letter.print')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => downloadText(letter, 'anschreiben-neuer-visumantrag.txt')}>
                    <Download className="size-4" aria-hidden /> {t('visaRefusal.letter.download')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={copy} aria-live="polite">
                    <Copy className="size-4" aria-hidden /> {copied ? t('visaRefusal.letter.copied') : t('visaRefusal.letter.copy')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-primary bg-card p-5">
            <p className="text-sm text-ink">{t('visaRefusal.ourRole')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/register" className={buttonClass({})}>
                {t('visaRefusal.ctaRegister')}
              </Link>
              <Link to="/visa-document-checklist" className={buttonClass({ variant: 'outline' })}>
                {t('visaRefusal.checklistLink')}
              </Link>
              <Link to="/booking" className={buttonClass({ variant: 'ghost' })}>
                {t('visaRefusal.ctaBooking')}
              </Link>
            </div>
          </div>

          <GlossaryLinks
            terms={[
              { slug: 'nationales-visum', label: 'Nationales Visum' },
              { slug: 'vorabzustimmung', label: 'Vorabzustimmung' },
              { slug: 'zustimmung-der-bundesagentur', label: 'Zustimmung der BA' },
              { slug: 'anerkennung', label: 'Anerkennung' },
              { slug: 'sperrkonto', label: 'Sperrkonto' },
              { slug: 'apostille', label: 'Apostille' },
            ]}
          />
          <Disclaimer>{t('visaRefusal.disclaimer')}</Disclaimer>
          <Sources checked={REFUSAL_AS_OF} items={SOURCES} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/visa-refusal" />
    </>
  );
}

const Field = ({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  type?: 'text' | 'date';
  autoComplete?: string;
}) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    <input id={id} type={type} className="input" value={value} maxLength={200} autoComplete={autoComplete ?? 'off'} onChange={onChange} />
  </div>
);
