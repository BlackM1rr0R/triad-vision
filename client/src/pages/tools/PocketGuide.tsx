import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BookOpen, Download, FileText, Printer, UserRound } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';
import { registerCopy } from '@/i18n';
import { pagesPocketGuide } from '@/i18n/pagesPocketGuide';
import { usePageTitle } from '@/lib/usePageTitle';
import { deutschlandticketAt, minimumWageAt } from '../../../../server/src/lib/budget/params';

registerCopy(pagesPocketGuide);

/** Same as server/src/lib/pocketGuide/content.ts POCKET_GUIDE_CHECKED (the date printed in the PDF). */
export const POCKET_GUIDE_CHECKED = '2026-11-22';
export const POCKET_LANGS = ['az', 'ru', 'en', 'de'] as const;
export type PocketLang = (typeof POCKET_LANGS)[number];
export type PocketLayout = 'a5' | 'booklet';

export const POCKET_SOURCES = [
  { label: 'gesetze-im-internet.de — BMG § 17 (Anmeldung)', url: 'https://www.gesetze-im-internet.de/bmg/__17.html' },
  { label: 'gesetze-im-internet.de — ArbZG §§ 3–5', url: 'https://www.gesetze-im-internet.de/arbzg/' },
  { label: 'gesetze-im-internet.de — EntgFG §§ 3, 5', url: 'https://www.gesetze-im-internet.de/entgfg/' },
  { label: 'gesetze-im-internet.de — BGB § 551 (Kaution)', url: 'https://www.gesetze-im-internet.de/bgb/__551.html' },
  { label: 'gesetze-im-internet.de — SGB V § 61 (Zuzahlung)', url: 'https://www.gesetze-im-internet.de/sgb_5/__61.html' },
  { label: 'Sperr-Notruf 116 116', url: 'https://www.sperr-notruf.de' },
  { label: 'Auswärtiges Amt — Vertretungen Aserbaidschans', url: 'https://www.auswaertiges-amt.de/de/service/laender/aserbaidschan-node/vertretungenaserbaidschan/201896' },
  { label: 'verwaltung.bund.de — Wohnsitz anmelden', url: 'https://verwaltung.bund.de/leistungsverzeichnis/de/leistung/99115005104000' },
];

/** Download links of the PDF (server routes/pocketGuide.ts); `mine` = the personalised portal version. */
export const pocketPdfUrl = (lng: PocketLang, layout: PocketLayout, mine = false) => `/api/pocket-guide/${mine ? 'mine' : 'pdf'}?lng=${lng}&layout=${layout}`;

export const PocketDownloads = ({ mine = false }: { mine?: boolean }) => {
  const { t } = useTranslation();
  const site = useLng();
  const [lang, setLang] = useState<PocketLang>(site === 'tr' ? 'az' : site === 'uk' ? 'ru' : site);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">{t('pocketGuide.language')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POCKET_LANGS.map((l) => (
            <label
              key={l}
              className={clsx(
                'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                lang === l ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
              )}
            >
              <input type="radio" name="pocket-lang" className="sr-only" checked={lang === l} onChange={() => setLang(l)} />
              <span lang={l}>{t(`pocketGuide.languages.${l}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['a5', FileText],
            ['booklet', BookOpen],
          ] as const
        ).map(([layout, Icon]) => (
          <div key={layout} className="flex flex-col rounded-2xl border border-line bg-sunken p-4">
            <h3 className="flex items-center gap-2 font-semibold text-ink">
              <Icon className="size-5 text-primary" aria-hidden /> {t(`pocketGuide.${layout}Title`)}
            </h3>
            <p className="mt-1 flex-1 text-sm text-muted">{t(`pocketGuide.${layout}Text`)}</p>
            <a href={pocketPdfUrl(lang, layout, mine)} download className={buttonClass({ className: 'mt-3' })} rel="nofollow">
              <Download className="size-4" aria-hidden /> {t('pocketGuide.download')}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * /pocket-guide — the printable 16-page "Germany pocket guide" (server lib/pocketGuide: pdf-lib, A5 pages or an
 * A4 booklet imposition) in az / ru / en / de. The page is static (server-rendered); the PDF is generated and cached
 * on the server. A personalised version (name, employer, city Bürgeramt link) lives in the portal.
 */
export default function PocketGuidePage() {
  const { t } = useTranslation();
  usePageTitle(t('pocketGuide.heroTitle'));
  const money = useMoney();
  const faq = useFaq('pocketGuide.faq');
  const contents = t('pocketGuide.contents', { returnObjects: true, wage: money(minimumWageAt(), true), ticket: money(deutschlandticketAt(), true) }) as unknown;
  const print = t('pocketGuide.print', { returnObjects: true }) as unknown;
  const d = POCKET_GUIDE_CHECKED.split('-').reverse().join('.');

  return (
    <>
      <PageHero title={t('pocketGuide.heroTitle')} subtitle={t('pocketGuide.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-label={t('pocketGuide.download')}>
              <PocketDownloads />
              <p className="mt-4 text-xs text-muted">{t('pocketGuide.asOf', { date: d })}</p>
            </section>

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="pg-contents-h">
              <h2 id="pg-contents-h" className="font-display text-lg font-semibold text-ink">
                {t('pocketGuide.contentsTitle')}
              </h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">{Array.isArray(contents) && contents.map((c, i) => <li key={i}>{String(c)}</li>)}</ol>
            </section>

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="pg-print-h">
              <h2 id="pg-print-h" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Printer className="size-5 text-primary" aria-hidden /> {t('pocketGuide.printTitle')}
              </h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">{Array.isArray(print) && print.map((c, i) => <li key={i}>{String(c)}</li>)}</ol>
            </section>

            <GlossaryLinks
              terms={[
                { slug: 'anmeldung', label: 'Anmeldung' },
                { slug: 'wohnungsgeberbestaetigung', label: 'Wohnungsgeberbestätigung' },
                { slug: 'steuer-id', label: 'Steuer-ID' },
                { slug: 'krankenkasse', label: 'Krankenkasse' },
                { slug: 'deutschlandticket', label: 'Deutschlandticket' },
                { slug: 'mindestlohn', label: 'Mindestlohn' },
                { slug: 'arbeitsunfaehigkeitsbescheinigung', label: 'AU' },
                { slug: 'kaution', label: 'Kaution' },
                { slug: 'nebenkosten', label: 'Nebenkosten' },
                { slug: 'pfand', label: 'Pfand' },
              ]}
            />
            <Sources checked={POCKET_GUIDE_CHECKED} items={POCKET_SOURCES} />
            <Disclaimer>{t('pocketGuide.faq.1.a')}</Disclaimer>
          </div>

          <aside className="rounded-3xl border border-line bg-card p-5 lg:sticky lg:top-24" aria-labelledby="pg-personal-h">
            <h2 id="pg-personal-h" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <UserRound className="size-5 text-primary" aria-hidden /> {t('pocketGuide.personalTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t('pocketGuide.personalText')}</p>
            <Link to="/account/pocket-guide" className={buttonClass({ variant: 'outline', className: 'mt-4' })}>
              {t('pocketGuide.personalCta')}
            </Link>
          </aside>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/pocket-guide" />
    </>
  );
}
