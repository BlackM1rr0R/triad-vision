import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'framer-motion';
import { ArrowDown, Building2, Check, ClipboardList, Clock, FileText, Mail, MessageCircle, Phone, Scale } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Handshake } from '@/components/illustrations';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { InquiryForm } from '@/components/InquiryForm';
import { Accordion, useCopy } from '@/components/about/shared';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesCompany } from '@/i18n/pagesCompany';
import { usePageTitle } from '@/lib/usePageTitle';
import { BookingCta } from '@/components/booking/BookingCta';

registerCopy(pagesCompany);

/* ───────────────────────── Checklist (ticks kept in this browser only) ───────────────────────── */
const STORE_KEY = 'tv_coop_checklist';
const GROUP_ICONS = [Building2, ClipboardList, FileText, Scale];

const Checklist = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const groups = copy<{ title: string; items: string[] }[]>('cooperationPage.checklist.groups');
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(done));
    } catch {
      /* storage unavailable: ticks just don't persist */
    }
  }, [done]);
  const count = groups.reduce((n, g, gi) => n + g.items.filter((_, ii) => done[`${gi}.${ii}`]).length, 0);

  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('cooperationPage.checklist.eyebrow')} title={t('cooperationPage.checklist.title')} subtitle={t('cooperationPage.checklist.subtitle')} />
        <Reveal>
          <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-sunken p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
            <p className="shrink-0 font-display font-semibold text-ink" aria-live="polite">
              {t('cooperationPage.checklist.progress', { done: count, total })}
            </p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-card" role="progressbar" aria-label={t('cooperationPage.checklist.title')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}>
              <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(count / total) * 100}%` }} />
            </div>
            <p className="text-xs text-muted sm:max-w-xs">{t('cooperationPage.checklist.hint')}</p>
          </div>
        </Reveal>
        <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g, gi) => {
            const I = GROUP_ICONS[gi] ?? ClipboardList;
            return (
              <StaggerItem key={g.title}>
                <fieldset className="card card-pad h-full">
                  <legend className="sr-only">{g.title}</legend>
                  <div className="flex items-center gap-3">
                    <span className={clsx('grid size-11 place-items-center rounded-xl', ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'][gi % 4])}>
                      <I className="size-5" />
                    </span>
                    <h3 className="font-display text-lg font-semibold text-ink">{g.title}</h3>
                  </div>
                  <ul className="mt-5 space-y-2">
                    {g.items.map((it, ii) => {
                      const k = `${gi}.${ii}`;
                      const on = !!done[k];
                      return (
                        <li key={it}>
                          <label className={clsx('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2.5 text-sm transition-colors', on ? 'bg-success-bg text-ink' : 'text-ink/85 hover:bg-sunken')}>
                            <input type="checkbox" className="peer sr-only" checked={on} onChange={() => setDone((d) => ({ ...d, [k]: !on }))} />
                            <span
                              className={clsx(
                                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
                                on ? 'border-success bg-success text-white' : 'border-line-strong bg-card',
                              )}
                            >
                              {on && <Check className="size-3" strokeWidth={3.5} />}
                            </span>
                            <span className={clsx(on && 'line-through decoration-success/50')}>{it}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Indicative timeline ───────────────────────── */
// [min, max] weeks per stage; embassy (index 4) uses Triad Vision's 3–8 week average.
const WEEKS: [number, number][] = [[1, 2], [2, 4], [2, 8], [1, 4], [3, 8], [1, 2]];
const SHADES = ['#0b1f44', '#18397a', '#0f4fc4', '#1565e8', '#2f7bff', '#5c9bff'];

const Timeline = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const stages = copy<string[]>('cooperationPage.timeline.stages');
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-60px' });
  const fast = WEEKS.reduce((n, w) => n + w[0], 0);
  const slow = WEEKS.reduce((n, w) => n + w[1], 0);
  const stageMax = Math.max(...WEEKS.map((w) => w[1]));
  const wk = t('cooperationPage.timeline.weeks');
  const ease = 'cubic-bezier(0.22,1,0.36,1)';

  const Stack = ({ label, idx, sum }: { label: string; idx: 0 | 1; sum: number }) => (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-display text-lg font-semibold text-ink">
          {sum} {wk}
        </span>
      </div>
      <div className="flex h-9 gap-0.5 overflow-hidden rounded-lg" style={{ width: on ? `${(sum / slow) * 100}%` : '0%', transition: `width 1.2s ${ease} ${0.3 + idx * 0.2}s` }}>
        {WEEKS.map((w, i) => (
          <span key={i} className="grid min-w-0 place-items-center overflow-hidden text-[0.65rem] font-bold text-white" style={{ flex: w[idx], background: SHADES[i] }} title={`${i + 1}. ${stages[i]}: ${w[idx]} ${wk}`}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section className="section bg-sunken">
      <div className="container-x">
        <SectionHeading
          eyebrow={t('cooperationPage.timeline.eyebrow')}
          title={t('cooperationPage.timeline.title')}
          subtitle={t('cooperationPage.timeline.subtitle')}
          action={<span className="badge bg-warning-bg px-3 py-1.5 text-warning-fg">{t('cooperationPage.timeline.indicative')}</span>}
        />
        <div ref={ref} className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
          <Reveal>
            <div className="card h-full rounded-3xl p-5 sm:p-7">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('cooperationPage.timeline.caption')}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t('cooperationPage.timeline.stage')}</th>
                    <th scope="col">{t('cooperationPage.timeline.range')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s, i) => {
                    const [a, b] = WEEKS[i] ?? [0, 0];
                    return (
                      <tr key={s} className="border-b border-line last:border-0">
                        <th scope="row" className="w-1/2 py-3.5 pr-4 text-left font-medium text-ink">
                          <span className="flex items-center gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold text-primary-contrast" style={{ background: SHADES[i] }}>
                              {i + 1}
                            </span>
                            {s}
                          </span>
                        </th>
                        <td className="py-3.5">
                          <span className="flex items-center justify-end gap-3">
                            <span className="relative hidden h-2.5 flex-1 rounded-full bg-sunken sm:block" aria-hidden>
                              <span
                                className="absolute inset-y-0 rounded-full bg-primary"
                                style={{ left: `${(a / stageMax) * 100}%`, width: on ? `${((b - a) / stageMax) * 100}%` : '0%', minWidth: on ? 8 : 0, transition: `width .9s ${ease} ${0.1 + i * 0.1}s` }}
                              />
                            </span>
                            <span className="w-20 shrink-0 text-right font-display font-semibold whitespace-nowrap text-ink tabular-nums">
                              {a === b ? a : `${a}–${b}`} {t('cooperationPage.timeline.weekShort')}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="card h-full rounded-3xl p-5 sm:p-7">
              <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-highlight-fg uppercase">
                <Clock className="size-4" /> {t('cooperationPage.timeline.total')}
              </p>
              <p className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">
                {fast}–{slow} <span className="text-2xl text-muted">{wk}</span>
              </p>
              <div className="mt-8 space-y-6 rounded-xl bg-sunken p-4 sm:p-5">
                <Stack label={t('cooperationPage.timeline.fastest')} idx={0} sum={fast} />
                <Stack label={t('cooperationPage.timeline.longest')} idx={1} sum={slow} />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default function Cooperation() {
  const { t } = useTranslation();
  usePageTitle(t('cooperationPage.hero.title'));
  const { tr } = useL10n();
  const copy = useCopy();
  const { data } = useSiteContent();
  const contact = data?.settings.contact;
  const after = copy<string[]>('cooperationPage.form.after');
  const wa = contact?.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}` : null;

  return (
    <>
      <PageHero title={t('cooperationPage.hero.title')} subtitle={t('cooperationPage.hero.subtitle')} illustration={<Handshake />}>
        <a href="#form" className="btn-primary btn-lg mt-7">
          {t('cooperationPage.hero.jump')} <ArrowDown className="size-4" />
        </a>
      </PageHero>

      <Checklist />
      <Timeline />

      <section id="form" className="section scroll-mt-20">
        <div className="container-x">
          <SectionHeading eyebrow={t('cooperationPage.form.eyebrow')} title={t('cooperationPage.form.title')} subtitle={t('cooperationPage.form.subtitle')} />
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:gap-8">
            <Reveal>
              <div className="card card-pad rounded-3xl sm:p-10">
                <InquiryForm kind="company" />
              </div>
            </Reveal>
            <div className="space-y-5">
              <Reveal delay={0.05}>
                <div className="rounded-2xl bg-sunken p-5 sm:p-6">
                  <h3 className="font-display font-semibold text-ink">{t('cooperationPage.form.afterTitle')}</h3>
                  <ol className="mt-4 space-y-4">
                    {after.map((s, i) => (
                      <li key={s} className="flex gap-3 text-sm text-ink/85">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-contrast">{i + 1}</span>
                        <span className="pt-1">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
              {contact && (
                <Reveal delay={0.1}>
                  <div className="card p-5 sm:p-6">
                    <h3 className="font-display font-semibold text-ink">{t('cooperationPage.form.direct')}</h3>
                    <ul className="mt-4 space-y-3 text-sm">
                      <li>
                        <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 font-semibold text-ink hover:text-link">
                          <Phone className="size-4 text-muted" /> {contact.phone}
                        </a>
                      </li>
                      <li>
                        <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-3 font-semibold text-ink hover:text-link">
                          <Mail className="size-4 shrink-0 text-muted" /> <span className="truncate">{contact.email}</span>
                        </a>
                      </li>
                      <li className="flex items-center gap-3 text-muted">
                        <Clock className="size-4 text-muted" /> {tr(contact.hours)}
                      </li>
                    </ul>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Free consultation booking (booking stream) */}
      <BookingCta topic="company" />

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading eyebrow={t('cooperationPage.faq.eyebrow')} title={t('cooperationPage.faq.title')} />
          </div>
          <Reveal>
            <Accordion items={copy<{ q: string; a: string }[]>('cooperationPage.faq.items')} />
          </Reveal>
        </div>
      </section>

      {contact && (
        <section className="section">
          <div className="container-x">
            <Reveal>
              <div className="flex flex-col gap-8 rounded-3xl bg-navy-950 p-6 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:rounded-[2rem] lg:p-14">
                <div className="flex items-start gap-5">
                  <span className="hidden size-16 shrink-0 place-items-center rounded-2xl bg-white/10 sm:grid">
                    <Phone className="size-7" />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl leading-tight font-semibold sm:text-3xl">{t('cooperationPage.cta.title')}</h2>
                    <p className="mt-2 max-w-lg text-white/70">{t('cooperationPage.cta.text')}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="btn-primary btn-lg">
                    <Phone className="size-4" /> {t('cooperationPage.cta.call')}
                  </a>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="btn bg-[#25d366] px-6 py-3.5 font-bold text-[#052e16] hover:brightness-105">
                      <MessageCircle className="size-4" /> {t('cooperationPage.cta.whatsapp')}
                    </a>
                  )}
                  <a href={`mailto:${contact.email}`} className="btn-outline btn-lg">
                    <Mail className="size-4" /> {t('cooperationPage.cta.email')}
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}
    </>
  );
}
