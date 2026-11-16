import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BookA, ExternalLink, HelpCircle, Info } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesCalcCommon } from '@/i18n/pagesCalcCommon';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { useContentLocale } from '@/components/seo/ContentArticle';
import { useEurAzn } from '@/components/tools/AznEquivalent';
import { formatEuro, type ContentLocale } from '@/lib/seoContent/types';

registerCopy(pagesCalcCommon);

/**
 * Small building blocks shared by the public calculators of lib/publicCalc (tax refund, shift pay, rent check,
 * holiday planner, grade converter): number fields, money + manat, FAQ with FAQPage JSON-LD, sources box.
 */

export const useLng = (): ContentLocale => useContentLocale();

export const useMoney = () => {
  const lng = useLng();
  return (n: number, cents = false) => formatEuro(n, lng, cents);
};

/** "1.5" / "1,5" in the visitor's style. */
export const decimal = (n: number, lng: ContentLocale, digits = 1) => {
  const s = n.toFixed(digits);
  return lng === 'en' ? s : s.replace('.', ',');
};

/** "15.11.2026" from an ISO date (deterministic, the same on server and client). */
export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const parseNum = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/** Labelled number input that keeps the typed text and reports only valid numbers. */
export const NumField = ({
  label,
  value,
  onChange,
  min = 0,
  max,
  hint,
  suffix,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  suffix?: string;
  className?: string;
}) => {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText((t) => (parseNum(t) === value ? t : String(value))), [value]);
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={clsx('input tabular-nums', suffix && 'pr-12')}
          inputMode="decimal"
          value={text}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseNum(e.target.value);
            if (e.target.value.trim() === '') onChange(min);
            else if (Number.isFinite(v) && v >= min && (max == null || v <= max)) onChange(v);
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11px] leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
};

/** Two-option toggle (radio group styled as buttons). */
export const Toggle = ({ legend, value, onChange, yes, no }: { legend: string; value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string }) => {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((v) => (
          <label
            key={String(v)}
            className={clsx(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
              v === value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
            )}
          >
            <input type="radio" className="sr-only" name={name} checked={v === value} onChange={() => onChange(v)} />
            {v ? (yes ?? t('calcCommon.yes')) : (no ?? t('calcCommon.no'))}
          </label>
        ))}
      </div>
    </fieldset>
  );
};

/** "≈ 1 234 ₼" at the CBAR rate (GET /api/life/rate), with the rate's date; nothing while loading or without a rate. */
export const Manat = ({ eur, className }: { eur: number; className?: string }) => {
  const { t } = useTranslation();
  const lng = useLng();
  const q = useEurAzn();
  const rate = q.data;
  if (!rate) return null;
  const amount = Math.round(Math.abs(eur) * rate.rate)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lng === 'en' ? ',' : lng === 'de' || lng === 'tr' ? '.' : ' ');
  return (
    <p className={clsx('text-xs text-muted', className)}>
      {t('calcCommon.azn', { amount: `${eur < 0 ? '−' : ''}${amount} ₼`, date: dmy(rate.date) })}
    </p>
  );
};

export const EstimateBadge = () => {
  const { t } = useTranslation();
  return <span className="rounded-full border border-warning-border bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-fg">{t('calcCommon.estimate')}</span>;
};

export const Disclaimer = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="note">
    <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{children}</span>
  </p>
);

/** Sources with the "as of" date (official links open in a new tab). */
export const Sources = ({ checked, items }: { checked: string; items: { label: string; url: string }[] }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-line bg-card p-4 text-sm">
      <p className="font-semibold text-ink">
        {t('calcCommon.sources')} · <span className="font-normal text-muted">{t('calcCommon.asOf', { date: dmy(checked) })}</span>
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              {s.label} <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Links to glossary terms (/glossary/:slug); labels are the German terms. */
export const GlossaryLinks = ({ terms }: { terms: { slug: string; label: string }[] }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 font-semibold text-ink">
        <BookA className="size-4" aria-hidden /> {t('calcCommon.glossary')}:
      </span>
      {terms.map((g) => (
        <Link key={g.slug} to={`/glossary/${g.slug}`} className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken" translate="no">
          {g.label}
        </Link>
      ))}
    </div>
  );
};

/** Always-visible FAQ + its FAQPage JSON-LD (rendered in the page, so it is in the SSR HTML). */
export const ToolFaq = ({ items }: { items: { q: string; a: string }[] }) => {
  const { t } = useTranslation();
  const lng = useLng();
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  return (
    <section className="section bg-sunken" aria-labelledby="tool-faq-h">
      <div className="container-x max-w-3xl">
        <h2 id="tool-faq-h" className="h-section section-head flex items-center gap-2 text-ink">
          <HelpCircle className="size-6 text-primary" aria-hidden /> {t('calcCommon.faq')}
        </h2>
        <div className="space-y-3">
          {list.map((f) => (
            <div key={f.q} className="rounded-2xl border border-line bg-card p-4">
              <h3 className="font-display text-base font-semibold text-ink">{f.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.a}</p>
            </div>
          ))}
        </div>
        <FaqJsonLd items={list} lng={lng} />
      </div>
    </section>
  );
};

/** FAQ items of a copy key (an array in the i18n module). */
export const useFaq = (key: string) => {
  const { t } = useTranslation();
  const v = t(key, { returnObjects: true }) as unknown;
  return Array.isArray(v) ? (v as { q: string; a: string }[]) : [];
};
