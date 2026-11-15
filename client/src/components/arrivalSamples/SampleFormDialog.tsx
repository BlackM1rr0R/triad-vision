import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ExternalLink, FileText, Printer } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesArrivalSamples } from '@/i18n/pagesArrivalSamples';
import { Modal } from '@/components/ui/Modal';
import { SAMPLE_FORMS, SAMPLE_NAME, type SamplePerson, type SampleSlug } from './forms';

registerCopy(pagesArrivalSamples);

const AS_OF = '2026-11-15';

/** Prints just the sheet: a new window with the page's stylesheets and the sheet's markup. */
const printSheet = (el: HTMLElement | null, title: string) => {
  if (!el) return;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('');
  w.document.write(
    `<!doctype html><html lang="${document.documentElement.lang}" data-theme="light"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>${styles}<style>body{background:#fff;padding:24px}@page{margin:14mm}</style></head><body>${el.outerHTML}</body></html>`,
  );
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 300);
};

/**
 * "Sample form" for a first-weeks task (Anmeldung, bank account, health insurance, tax ID): an illustrated HTML
 * rendition of the form / letter filled for a fictional person — or with the client's own data as a printable
 * cheat-sheet — every field explained in the interface language, the documents to bring, sources. Clearly
 * marked as not an official form.
 */
export const SampleFormDialog = ({ slug, person, open, onClose }: { slug: SampleSlug; person: SamplePerson | null; open: boolean; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { date } = useL10n();
  const [mode, setMode] = useState<'sample' | 'mine'>('sample');
  const sheet = useRef<HTMLDivElement>(null);
  const form = SAMPLE_FORMS[slug];
  const mine = mode === 'mine' && !!person;
  const explain = (key: string) => {
    const own = `asample.fields.${slug}.${key}`;
    return i18n.exists(own) ? t(own) : t(`asample.common.${key}`, { defaultValue: '' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('asample.title', { form: form.heading })}
      description={t(`asample.intro.${slug}`)}
      footer={
        <button type="button" className="btn-secondary btn-sm" onClick={() => printSheet(sheet.current, form.heading)}>
          <Printer className="size-4" aria-hidden /> {t('asample.print')}
        </button>
      }
    >
      {person && (
        <div role="radiogroup" aria-label={t('asample.open')} className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-card p-1.5 sm:inline-grid">
          {(['sample', 'mine'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={clsx('min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors', mode === m ? 'bg-primary text-primary-contrast shadow' : 'text-ink/75 hover:bg-sunken')}
            >
              {m === 'sample' ? t('asample.modeSample', { name: SAMPLE_NAME }) : t('asample.modeMine')}
            </button>
          ))}
        </div>
      )}
      {mine && <p className="mb-3 text-sm text-muted">{t('asample.mineHint')}</p>}

      <div ref={sheet} className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border-2 border-dashed border-danger-border bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('asample.notOfficial')}
        </p>

        {/* The form itself: German labels as printed, a value in "handwriting" blue, the explanation below. */}
        <div className="relative overflow-hidden rounded-lg border border-line-strong bg-white p-4 text-neutral-900 shadow-sm sm:p-6 dark:bg-neutral-50">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 text-6xl font-black tracking-widest whitespace-nowrap text-red-600/10 select-none sm:text-8xl">
            MUSTER
          </span>
          <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-800 pb-2">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">
                <FileText className="size-3.5" aria-hidden /> {t('asample.issuer')}: <span lang="de">{form.issuer}</span>
              </p>
              <p className="mt-0.5 text-lg font-bold" lang="de">
                {form.heading}
              </p>
            </div>
            <span className="rounded border border-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wider text-red-700 uppercase">Muster</span>
          </div>

          {form.sections.map((s) => (
            <fieldset key={s.label} className="mt-4">
              <legend className="mb-2 w-full bg-neutral-200 px-2 py-1 text-xs font-bold tracking-wide text-neutral-800 uppercase" lang="de">
                {s.label}
              </legend>
              <dl className="grid gap-2 sm:grid-cols-2">
                {s.fields.map((f) => {
                  const own = mine ? (f.mine?.(person!) ?? null) : null;
                  const value = mine ? own : f.sample;
                  const text = explain(f.key);
                  return (
                    <div key={f.key} className={clsx('rounded border border-neutral-400 px-2.5 py-1.5', f.wide && 'sm:col-span-2')}>
                      <dt className="text-[10px] font-semibold tracking-wide text-neutral-600 uppercase" lang="de">
                        {f.label}
                      </dt>
                      <dd className={clsx('min-h-6 text-[15px] font-medium', value ? 'text-blue-800' : 'text-neutral-400 italic')} lang="de">
                        {value ?? `… ${t('asample.empty')}`}
                      </dd>
                      {text && <dd className="mt-1 border-t border-dotted border-neutral-300 pt-1 text-xs text-neutral-700">{text}</dd>}
                    </div>
                  );
                })}
              </dl>
            </fieldset>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-sunken p-4">
          <h3 className="text-sm font-semibold text-ink">{t('asample.bringTitle')}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {form.bring.map((b) => (
              <li key={b}>{t(`asample.bring.${slug}.${b}`)}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted">
          {t('asample.sources', { date: date(AS_OF, { day: 'numeric', month: 'long', year: 'numeric' }) })}:{' '}
          {form.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ' · '}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-link hover:underline">
                {s.label} <ExternalLink className="size-3" aria-hidden />
              </a>
            </span>
          ))}
        </p>
      </div>
    </Modal>
  );
};

export default SampleFormDialog;
