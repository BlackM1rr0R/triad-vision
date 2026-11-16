import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, FileText, Info, Plus, Trash2, Users, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Handshake } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesFamilyCheck } from '@/i18n/pagesFamilyCheck';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesFamilyCheck);

/** Shapes of GET /api/family-check (server/src/lib/family/publicCheck.ts). */
const TITLES = ['BLUE_CARD', 'SKILLED', 'ICT', 'RESEARCH', 'AUSBILDUNG', 'STUDY', 'JOB_SEEKER', 'SETTLEMENT', 'OTHER'] as const;
type Title = (typeof TITLES)[number];
type Verdict = 'now' | 'likely' | 'after' | 'check' | 'no';
interface Blocker {
  code: string;
  status: 'ok' | 'warn' | 'fail' | 'missing';
  params: Record<string, number | string | boolean | null>;
}
interface PersonResult {
  verdict: Verdict;
  blockers: Blocker[];
}
interface FamilyCheck {
  asOf: string;
  title: { code: Title; paragraph: string; reunion: 'yes' | 'discretion' | 'no' };
  spouseLanguageExempt: boolean;
  livingSpaceExempt: boolean;
  livingSpace: { required: number; actual: number | null; persons: number };
  income: { need: number; available: number | null; estimated: boolean };
  family: Blocker[];
  spouse: PersonResult | null;
  children: (PersonResult & { age: number })[];
  parents: (PersonResult & { count: number }) | null;
  documents: string[];
}

interface Form {
  title: Title;
  net: string;
  gross: string;
  rent: string;
  space: string;
  spouse: boolean;
  spouseAge: string;
  spouseGerman: 'none' | 'a1';
  children: string[];
  parents: number;
  issued: string;
}

const INITIAL: Form = { title: 'SKILLED', net: '', gross: '', rent: '', space: '', spouse: true, spouseAge: '', spouseGerman: 'none', children: [], parents: 0, issued: '' };

const SOURCES = [
  { label: '§ 29 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__29.html' },
  { label: '§ 30 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__30.html' },
  { label: '§ 32 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__32.html' },
  { label: '§ 36 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__36.html' },
];

const digits = (s: string) => s.replace(/[^\d]/g, '').slice(0, 6);

const toQuery = (f: Form) => {
  const q = new URLSearchParams({ title: f.title, spouse: f.spouse ? '1' : '0', spouseGerman: f.spouseGerman });
  if (f.net) q.set('net', f.net);
  else if (f.gross) q.set('gross', f.gross);
  if (f.rent) q.set('rent', f.rent);
  if (f.space) q.set('space', f.space);
  if (f.spouse && f.spouseAge) q.set('spouseAge', String(Math.min(99, Math.max(14, Number(f.spouseAge)))));
  const kids = f.children.filter((c) => c !== '').map((c) => String(Math.min(25, Number(c))));
  if (kids.length) q.set('children', kids.slice(0, 8).join(','));
  if (f.parents) q.set('parents', String(f.parents));
  if (f.parents && /^\d{4}-\d{2}-\d{2}$/.test(f.issued)) q.set('issued', f.issued);
  return q.toString();
};

const VERDICT_STYLE: Record<Verdict, { cls: string; icon: typeof CheckCircle2 }> = {
  now: { cls: 'border-success-border bg-success-bg text-success-fg', icon: CheckCircle2 },
  likely: { cls: 'border-success-border bg-success-bg text-success-fg', icon: CheckCircle2 },
  after: { cls: 'border-warning-border bg-warning-bg text-warning-fg', icon: AlertTriangle },
  check: { cls: 'border-line bg-sunken text-muted', icon: CircleHelp },
  no: { cls: 'border-danger-border bg-danger-bg text-danger-fg', icon: XCircle },
};

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

const Toggle = ({ legend, name, value, onChange, yes, no }: { legend: string; name: string; value: boolean; onChange: (v: boolean) => void; yes: string; no: string }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1">
      {[
        { v: true, l: yes },
        { v: false, l: no },
      ].map((o) => (
        <label key={String(o.v)} className={clsx('flex min-h-10 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus', value === o.v ? 'bg-primary text-primary-contrast' : 'text-muted hover:text-ink')}>
          <input type="radio" className="sr-only" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />
          {o.l}
        </label>
      ))}
    </div>
  </fieldset>
);

const Person = ({ label, r }: { label: string; r: PersonResult }) => {
  const { t } = useTranslation();
  const s = VERDICT_STYLE[r.verdict];
  const gaps = r.blockers.map((b) => ({ key: `${b.code}-${b.status}`, text: t(`fc.gaps.${b.code}.${b.status}`, { ...b.params, issuedFrom: '01.03.2024' }) })).filter((g) => g.text);
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{label}</p>
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', s.cls)}>
          <s.icon className="size-3.5" aria-hidden /> {t(`fc.verdict.${r.verdict}`)}
        </span>
      </div>
      {gaps.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm leading-snug text-ink">
          {gaps.map((g) => (
            <li key={g.key} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" aria-hidden /> {g.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

/**
 * /family-reunification-check — public self-check for people WITHOUT a case: the reunion rules of
 * server/src/lib/family/legal.ts via GET /api/family-check (nothing stored). Answers stay in the page
 * (income and family data are not put into the URL).
 */
export default function FamilyReunificationCheckPage() {
  const { t } = useTranslation();
  usePageTitle(t('fc.heroTitle'));
  const [form, setForm] = useState<Form>(INITIAL);
  const query = useDeferredValue(useMemo(() => toQuery(form), [form]));
  const nobody = !form.spouse && form.children.length === 0 && form.parents === 0;
  const q = useQuery({
    queryKey: ['family-check', query],
    queryFn: async () => (await api.get<FamilyCheck>(`/family-check?${query}`)).data,
    enabled: !nobody,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const faq = t('fc.faq.items', { returnObjects: true }) as unknown as { q: string; a: string }[];
  const r = q.data;

  return (
    <>
      <PageHero title={t('fc.heroTitle')} subtitle={t('fc.heroSubtitle')} illustration={<Handshake />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="fc-form-h">
            <h2 id="fc-form-h" className="font-display text-lg font-semibold text-ink">
              {t('fc.form.title')}
            </h2>
            <Field id="fc-title" label={t('fc.form.titleLabel')}>
              <select id="fc-title" className="input" value={form.title} onChange={(e) => set('title', e.target.value as Title)}>
                {TITLES.map((x) => (
                  <option key={x} value={x}>
                    {t(`fc.form.titles.${x}`)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="fc-net" label={t('fc.form.net')}>
                <input id="fc-net" className="input tabular-nums" inputMode="numeric" value={form.net} onChange={(e) => set('net', digits(e.target.value))} />
              </Field>
              <Field id="fc-gross" label={t('fc.form.gross')}>
                <input id="fc-gross" className="input tabular-nums" inputMode="numeric" value={form.gross} disabled={!!form.net} onChange={(e) => set('gross', digits(e.target.value))} />
              </Field>
            </div>
            {!form.net && form.gross && <p className="-mt-2 text-xs text-muted">{t('fc.form.grossHint')}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field id="fc-rent" label={t('fc.form.rent')}>
                <input id="fc-rent" className="input tabular-nums" inputMode="numeric" value={form.rent} onChange={(e) => set('rent', digits(e.target.value))} />
              </Field>
              <Field id="fc-space" label={t('fc.form.space')}>
                <input id="fc-space" className="input tabular-nums" inputMode="numeric" value={form.space} onChange={(e) => set('space', digits(e.target.value).slice(0, 4))} />
              </Field>
            </div>

            <h3 className="flex items-center gap-2 pt-2 font-display text-base font-semibold text-ink">
              <Users className="size-4 text-primary" aria-hidden /> {t('fc.form.family')}
            </h3>
            <Toggle legend={t('fc.form.spouse')} name="fc-spouse" value={form.spouse} onChange={(v) => set('spouse', v)} yes={t('fc.form.yes')} no={t('fc.form.no')} />
            {form.spouse && (
              <div className="grid grid-cols-2 gap-3">
                <Field id="fc-sage" label={t('fc.form.spouseAge')}>
                  <input id="fc-sage" className="input tabular-nums" inputMode="numeric" value={form.spouseAge} onChange={(e) => set('spouseAge', digits(e.target.value).slice(0, 2))} />
                </Field>
                <Field id="fc-sger" label={t('fc.form.spouseGerman')}>
                  <select id="fc-sger" className="input" value={form.spouseGerman} onChange={(e) => set('spouseGerman', e.target.value as Form['spouseGerman'])}>
                    {(['none', 'a1'] as const).map((g) => (
                      <option key={g} value={g}>
                        {t(`fc.form.spouseGermanOptions.${g}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <fieldset>
              <legend className="label">{t('fc.form.children')}</legend>
              <ul className="space-y-2">
                {form.children.map((c, i) => (
                  <li key={i} className="flex items-end gap-2">
                    <Field id={`fc-child-${i}`} label={t('fc.form.childAge', { n: i + 1 })}>
                      <input id={`fc-child-${i}`} className="input w-24 tabular-nums" inputMode="numeric" value={c} onChange={(e) => set('children', form.children.map((x, j) => (j === i ? digits(e.target.value).slice(0, 2) : x)))} />
                    </Field>
                    <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-sunken hover:text-ink" onClick={() => set('children', form.children.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" aria-hidden /> {t('fc.form.removeChild')}
                    </button>
                  </li>
                ))}
              </ul>
              {form.children.length < 8 && (
                <button type="button" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline" onClick={() => set('children', [...form.children, ''])}>
                  <Plus className="size-4" aria-hidden /> {t('fc.form.addChild')}
                </button>
              )}
            </fieldset>
            <Field id="fc-parents" label={t('fc.form.parents')}>
              <select id="fc-parents" className="input" value={form.parents} onChange={(e) => set('parents', Number(e.target.value))}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            {form.parents > 0 && (
              <Field id="fc-issued" label={t('fc.form.issued')}>
                <input id="fc-issued" type="date" className="input" value={form.issued} onChange={(e) => set('issued', e.target.value)} />
              </Field>
            )}
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            {nobody ? (
              <p className="rounded-2xl border border-line bg-sunken p-4 text-sm text-muted">{t('fc.nothing')}</p>
            ) : r ? (
              <>
                <ul className="space-y-3">
                  {r.spouse && <Person label={t('fc.who.spouse')} r={r.spouse} />}
                  {r.children.map((c, i) => (
                    <Person key={i} label={t('fc.who.child', { age: c.age })} r={c} />
                  ))}
                  {r.parents && <Person label={t('fc.who.parents', { count: r.parents.count })} r={r.parents} />}
                </ul>
                {(r.spouseLanguageExempt || r.livingSpaceExempt) && (
                  <ul className="space-y-1 rounded-2xl border border-success-border bg-success-bg p-3 text-sm text-success-fg">
                    {r.spouseLanguageExempt && form.spouse && <li>{t('fc.exempt.language')}</li>}
                    {r.livingSpaceExempt && <li>{t('fc.exempt.space')}</li>}
                  </ul>
                )}
                <section className="rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="fc-docs-h">
                  <h3 id="fc-docs-h" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <FileText className="size-5 text-primary" aria-hidden /> {t('fc.docs.title')}
                  </h3>
                  <ul className="mt-3 grid gap-1.5 text-sm text-ink sm:grid-cols-2">
                    {r.documents.map((d) => (
                      <li key={d} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t(`fc.docs.items.${d}`)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 rounded-xl bg-sunken p-3 text-xs leading-relaxed text-muted">{t('fc.docs.note')}</p>
                </section>
                <p className="text-xs text-muted">{t('fc.asOf', { date: r.asOf.split('-').reverse().join('.') })}</p>
                <EmailResult
                  tool="family-reunification-check"
                  summary={[
                    ...(r.spouse ? [{ label: t('fc.who.spouse'), value: t(`fc.verdict.${r.spouse.verdict}`) }] : []),
                    ...r.children.slice(0, 5).map((c) => ({ label: t('fc.who.child', { age: c.age }), value: t(`fc.verdict.${c.verdict}`) })),
                    ...(r.parents ? [{ label: t('fc.who.parents', { count: r.parents.count }), value: t(`fc.verdict.${r.parents.verdict}`) }] : []),
                  ]}
                />
              </>
            ) : q.isError ? (
              <div className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg" role="alert">
                {t('fc.error')}{' '}
                <button type="button" className="font-semibold underline" onClick={() => void q.refetch()}>
                  {t('fc.retry')}
                </button>
              </div>
            ) : (
              <p className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted" role="status">
                <Spinner className="size-6 text-primary" />
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="pb-12" aria-labelledby="fc-src-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="fc-src-h" className="font-display text-xl font-semibold">
            {t('fc.sources')}
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  {s.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('fc.disclaimer')}
          </p>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading title={t('fc.faq.title')} />
          </div>
          <Accordion items={Array.isArray(faq) ? faq : []} />
          <FaqJsonLd items={Array.isArray(faq) ? faq : []} lng={currentSiteLocale()} />
        </div>
      </section>
      <RelatedGuides tool="/family-reunification-check" />
      <div className="pt-16 sm:pt-20 lg:pt-28">
        <PageCta icon={<Users className="size-7" />} title={t('fc.cta.title')} text={t('fc.cta.text')} primary={{ to: '/register', label: t('fc.cta.primary') }} secondary={{ to: '/booking', label: t('fc.cta.secondary') }} />
      </div>
    </>
  );
}
