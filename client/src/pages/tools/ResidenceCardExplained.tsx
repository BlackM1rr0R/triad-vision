import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, ExternalLink, FileText, KeyRound, Landmark, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { SpecimenCard } from '@/components/residenceCard/SpecimenCard';
import { registerCopy } from '@/i18n';
import { pagesResidenceCard } from '@/i18n/pagesResidenceCard';
import { usePageTitle } from '@/lib/usePageTitle';
import { CARD_H, CARD_HOTSPOTS, CARD_W, PERMIT_KEYS, RESIDENCE_CARD_AS_OF, RESIDENCE_CARD_SOURCES, cardHotspotNumber, type CardSide, type PermitKey } from '@/lib/residenceCard/card';

registerCopy(pagesResidenceCard);

/**
 * /residence-card-explained — the German eAT explained on a self-drawn SPECIMEN (fictional holder, no security
 * features): front / back with numbered hotspot buttons, an example-permit switcher (§ 18g / § 18a / § 18b /
 * settlement permit), then the Zusatzblatt, the PIN letter, what to do before expiry (link to
 * /permanent-residence) and a lost card. State in the URL (?side=back&field=mrz&permit=18a), so it is shareable.
 */
export default function ResidenceCardExplainedPage() {
  const { t } = useTranslation();
  usePageTitle(t('eat.heroTitle'));
  const [params, setParams] = useSearchParams();
  const side: CardSide = params.get('side') === 'back' ? 'back' : 'front';
  const permit: PermitKey = (PERMIT_KEYS as string[]).includes(params.get('permit') ?? '') ? (params.get('permit') as PermitKey) : '18g';
  const field = CARD_HOTSPOTS.find((h) => h.id === params.get('field')) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  const update = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const sideName = (s: CardSide) => t(`eat.${s}`);

  return (
    <>
      <PageHero title={t('eat.heroTitle')} subtitle={t('eat.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <p className="flex items-start gap-2 rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg" role="note">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{t('eat.specimenBanner')}.</strong> {t('eat.specimenNote')}
            </span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div role="radiogroup" aria-label={t('eat.flip')} className="inline-flex rounded-xl border border-line bg-sunken p-1">
              {(['front', 'back'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => update({ side: s === 'front' ? null : s, field: null })} className={clsx('min-h-10 rounded-lg px-4 text-sm font-semibold', side === s ? 'bg-primary text-primary-contrast shadow-sm' : 'text-muted hover:text-ink')}>
                  {sideName(s)}
                </button>
              ))}
            </div>
            <div className="min-w-0 sm:w-80">
              <label htmlFor="eat-permit" className="label">
                {t('eat.permitLabel')}
              </label>
              <select id="eat-permit" className="input" value={permit} onChange={(e) => update({ permit: e.target.value === '18g' ? null : e.target.value })}>
                {PERMIT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`eat.permits.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => update({ side: side === 'front' ? 'back' : null, field: null })} className={buttonClass({ variant: 'ghost' })}>
              <RefreshCw className="size-4" aria-hidden /> {t('eat.flip')}
            </button>
          </div>
          <p className="text-sm text-muted">{t('eat.howTo')}</p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
            <div className="relative mx-auto w-full max-w-3xl" role="group" aria-label={t('eat.cardLabel', { side: sideName(side) })}>
              <div className="drop-shadow-xl">
                <SpecimenCard side={side} permit={permit} specimen={t('eat.specimenBanner')} />
              </div>
              {CARD_HOTSPOTS.filter((h) => h.side === side).map((h) => {
                const n = cardHotspotNumber(h.id);
                const active = field?.id === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${n}. ${t(`eat.hotspots.${h.id}.title`)}`}
                    title={t(`eat.hotspots.${h.id}.title`)}
                    onClick={() => {
                      update({ field: h.id });
                      requestAnimationFrame(() => panelRef.current?.focus());
                    }}
                    className={clsx(
                      'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold shadow-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none sm:size-8 sm:text-sm',
                      active ? 'scale-125 bg-highlight text-highlight-contrast' : 'bg-primary text-primary-contrast hover:scale-110',
                    )}
                    style={{ left: `${(h.x / CARD_W) * 100}%`, top: `${(h.y / CARD_H) * 100}%` }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <div ref={panelRef} tabIndex={-1} aria-live="polite" className="rounded-3xl border border-line bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-5 lg:sticky lg:top-24">
              {field ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {sideName(field.side)} · {t('eat.point', { n: cardHotspotNumber(field.id), total: CARD_HOTSPOTS.length })}
                  </p>
                  <h2 className="font-display text-xl font-semibold text-ink">{t(`eat.hotspots.${field.id}.title`)}</h2>
                  <p className="text-sm text-ink/85">{t(`eat.hotspots.${field.id}.text`)}</p>
                  {field.glossary.length > 0 && <GlossaryChips slugs={field.glossary} className="flex flex-wrap gap-2 pt-1" />}
                </div>
              ) : (
                <p className="text-sm text-muted">{t('eat.empty')}</p>
              )}
            </div>
          </div>

          {/* All fields as a list (crawlable, and usable without the picture) */}
          <ol className="grid gap-3 md:grid-cols-2">
            {CARD_HOTSPOTS.map((h) => (
              <li key={h.id} className="rounded-2xl border border-line bg-card p-4">
                <p className="text-xs font-semibold text-muted">
                  {cardHotspotNumber(h.id)} · {sideName(h.side)}
                </p>
                <h3 className="mt-0.5 font-semibold text-ink">{t(`eat.hotspots.${h.id}.title`)}</h3>
                <p className="mt-1 text-sm text-ink/80">{t(`eat.hotspots.${h.id}.text`)}</p>
              </li>
            ))}
          </ol>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="eat-zusatz" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 id="eat-zusatz" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <FileText className="size-5 text-primary" aria-hidden /> {t('eat.sections.zusatzTitle')}
              </h2>
              <p className="mt-2 text-sm text-ink/85">{t('eat.sections.zusatzText')}</p>
            </section>
            <section aria-labelledby="eat-pin" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 id="eat-pin" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <KeyRound className="size-5 text-primary" aria-hidden /> {t('eat.sections.pinTitle')}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink/85">
                {(['pin1', 'pin2', 'pin3', 'pin4'] as const).map((k) => (
                  <li key={k}>{t(`eat.sections.${k}`)}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="eat-expiry" className="rounded-3xl border border-highlight/40 bg-highlight-bg p-4 sm:p-5">
              <h2 id="eat-expiry" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <CalendarClock className="size-5" aria-hidden /> {t('eat.sections.expiryTitle')}
              </h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink/85">
                {(['expiry1', 'expiry2', 'expiry3', 'expiry4'] as const).map((k) => (
                  <li key={k}>{t(`eat.sections.${k}`)}</li>
                ))}
              </ol>
              <Link to="/permanent-residence" className={buttonClass({ className: 'mt-3 w-full sm:w-auto' })}>
                <Landmark className="size-4" aria-hidden /> {t('eat.sections.expiryLink')}
              </Link>
            </section>
            <section aria-labelledby="eat-lost" className="rounded-3xl border border-danger-border bg-danger-bg p-4 sm:p-5">
              <h2 id="eat-lost" className="flex items-center gap-2 font-display text-lg font-semibold text-danger-fg">
                <AlertTriangle className="size-5" aria-hidden /> {t('eat.sections.lostTitle')}
              </h2>
              <p className="mt-2 text-sm text-danger-fg">{t('eat.sections.lostText')}</p>
              <a href="tel:116116" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-danger-border bg-card px-4 font-semibold text-danger-fg">
                116 116
              </a>
            </section>
          </div>

          <section aria-labelledby="eat-sources" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <h2 id="eat-sources" className="font-display text-lg font-semibold text-ink">
              {t('eat.sourcesTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink/85">{t('eat.sourcesText', { asOf: RESIDENCE_CARD_AS_OF })}</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {RESIDENCE_CARD_SOURCES.map((s) => (
                <li key={s.key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline hover:text-link-hover">
                    {t(`eat.sources.${s.key}`)} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-semibold text-ink">{t('eat.glossaryTitle')}</h3>
            <GlossaryChips slugs={['elektronischer-aufenthaltstitel', 'aufenthaltstitel', 'blaue-karte-eu', 'niederlassungserlaubnis', 'fiktionsbescheinigung', 'auslaenderbehoerde', 'nebenbestimmung']} className="mt-2 flex flex-wrap gap-2" />
          </section>
        </div>
      </section>
      <RelatedGuides tool="/residence-card-explained" />
    </>
  );
}
