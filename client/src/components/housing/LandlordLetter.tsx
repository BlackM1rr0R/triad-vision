import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Printer } from 'lucide-react';
import { getBrand } from '@/lib/brand';
import { fmtDay } from './api';

/** Official sources the explanation points to (verify before go-live: listed in the feature report). */
export const BMG_19_URL = 'https://www.gesetze-im-internet.de/bmg/__19.html';
export const FORM_TEMPLATE_URL = 'https://service.berlin.de/dienstleistung/120686/';

/** While printing, everything except the sheet is hidden (scoped by a body class, like visa/Checklist). */
const PRINT_CSS = `
.tv-print-landlord{display:none}
@media print{
  body.tv-print-landlord-on > *:not(.tv-print-landlord){display:none !important}
  body.tv-print-landlord-on .tv-print-landlord{display:block !important;color:#0b1f44;font-family:Inter,system-ui,sans-serif;font-size:12pt;line-height:1.5}
  @page{margin:18mm}
}`;

/**
 * Printable explanation of the Wohnungsgeberbestätigung for the landlord: German text (what § 19 BMG asks
 * for), the tenant's name / move-in date filled in, and a translation in the client's language below.
 */
export function LandlordLetter({ tenant, moveInDate }: { tenant: string; moveInDate: string | null }) {
  const { t, i18n } = useTranslation();
  const de = i18n.getFixedT('de');
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const germanLines = de('housing.letter.translation', { returnObjects: true }) as string[];
  const ownLines = t('housing.letter.translation', { returnObjects: true }) as string[];

  useEffect(() => {
    const done = () => document.body.classList.remove('tv-print-landlord-on');
    window.addEventListener('afterprint', done);
    return () => {
      window.removeEventListener('afterprint', done);
      done();
    };
  }, []);

  const print = () => {
    document.body.classList.add('tv-print-landlord-on');
    window.print();
    setTimeout(() => document.body.classList.remove('tv-print-landlord-on'), 500);
  };

  const row = (label: string, value: string | null) => (
    <p style={{ margin: '4px 0' }}>
      <strong>{label}:</strong> {value || de('housing.letter.blank')}
    </p>
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={print} className="btn-secondary btn-sm">
          <Printer className="size-4" aria-hidden /> {t('housing.anmeldung.print')}
        </button>
        <a href={BMG_19_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:text-link-hover">
          <ExternalLink className="size-3.5" aria-hidden /> {t('housing.anmeldung.formLink')}
        </a>
        <a href={FORM_TEMPLATE_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:text-link-hover">
          <ExternalLink className="size-3.5" aria-hidden /> {t('housing.anmeldung.formTemplate')}
        </a>
      </div>
      {createPortal(
        <div className="tv-print-landlord" aria-hidden>
          <p style={{ fontSize: 10, color: '#556' }}>{getBrand().name}</p>
          <h1 style={{ fontSize: 18, margin: '8px 0 12px' }}>{de('housing.letter.heading')}</h1>
          {germanLines.map((l) => (
            <p key={l} style={{ margin: '0 0 8px' }}>
              {l}
            </p>
          ))}
          <div style={{ margin: '16px 0', padding: 12, border: '1px solid #ccd' }}>
            {row(de('housing.letter.tenant'), tenant)}
            {row(de('housing.letter.address'), null)}
            {row(de('housing.letter.moveIn'), moveInDate ? fmtDay(moveInDate, 'de-DE') : null)}
          </div>
          <p style={{ fontSize: 10, color: '#556' }}>
            {de('housing.letter.footer')} · {BMG_19_URL}
          </p>
          {lang !== 'de' && (
            <>
              <h2 style={{ fontSize: 14, margin: '24px 0 8px' }}>{t('housing.letter.translationHeading')}</h2>
              {ownLines.map((l) => (
                <p key={l} style={{ margin: '0 0 6px', fontSize: 11 }}>
                  {l}
                </p>
              ))}
              <p style={{ fontSize: 10, color: '#556' }}>{t('housing.letter.footer')}</p>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
