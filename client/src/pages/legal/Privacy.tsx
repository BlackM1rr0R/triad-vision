import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, ShieldCheck } from 'lucide-react';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { useLegalDocument } from '@/components/legal/api';
import { LegalDocumentView } from './LegalDocument';
import { Reveal } from '@/components/motion';
import { usePageTitle } from '@/lib/usePageTitle';
import { currentLocale, registerCopy, type Locale } from '@/i18n';
import { pagesLegal, type PolicySection } from '@/i18n/pagesLegal';
import { pagesLegalPolicy } from '@/i18n/pagesLegalPolicy';
import { useLegalSettings, type LegalInfo } from './legalData';

registerCopy(pagesLegal);
registerCopy(pagesLegalPolicy);

const HERO_IMAGE = 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=2000&q=70';

/** Square-bracket notes in the template ("[prüfen]") are highlighted so they cannot be overlooked. */
const withMarks = (text: string): ReactNode[] =>
  text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={i} className="rounded bg-warning/15 px-1 font-semibold text-warning [box-decoration-break:clone]">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

const fill = (text: string, vars: Record<string, string>) => text.replace(/\[\[(\w+)\]\]/g, (_, k: string) => vars[k] ?? '');

/** Admin-provided text: blank line = paragraph, "## " = heading, "- " = list item. */
const CustomText = ({ text }: { text: string }) => (
  <div className="space-y-4">
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block.split('\n');
      if (block.startsWith('## ')) {
        return (
          <h2 key={i} className="pt-4 font-display text-xl font-bold text-navy-900 sm:text-2xl">
            {block.slice(3)}
          </h2>
        );
      }
      if (lines.every((l) => l.startsWith('- '))) {
        return (
          <ul key={i} className="list-disc space-y-1.5 pl-5">
            {lines.map((l, j) => (
              <li key={j}>{withMarks(l.slice(2))}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={i} className="whitespace-pre-line">
          {withMarks(block)}
        </p>
      );
    })}
  </div>
);

const ControllerBlock = ({ legal, placeholder }: { legal: LegalInfo; placeholder: (k: keyof LegalInfo) => string }) => {
  const v = (k: keyof LegalInfo) => legal[k] || placeholder(k);
  return (
    <address className="rounded-xl border border-line bg-surface p-4 not-italic sm:p-5">
      <p className="font-semibold text-navy-900">{withMarks(`${v('companyName')} ${v('legalForm')}`)}</p>
      <p>{withMarks(v('street'))}</p>
      <p>{withMarks(`${v('postalCode')} ${v('city')}`)}</p>
      <p>{withMarks(v('country'))}</p>
      <p className="mt-2">{withMarks(v('representative'))}</p>
      <p className="mt-2 break-all">{withMarks(v('email'))}</p>
      <p>{withMarks(v('phone'))}</p>
    </address>
  );
};

/**
 * /privacy: the published PRIVACY legal document (Admin → Legal texts) when one exists, otherwise the
 * generated policy below (template + Settings → privacy), so nothing changes until a version is published.
 */
export default function Privacy() {
  const { data, isLoading } = useLegalDocument('PRIVACY');
  if (isLoading) return <PageHeroSkeleton />;
  if (data && !data.fallback) return <LegalDocumentView kind="PRIVACY" />;
  return <PrivacyTemplate />;
}

function PrivacyTemplate() {
  const { t, i18n } = useTranslation();
  const uiLang = currentLocale();
  const [showGerman, setShowGerman] = useState(false);
  const lang: Locale = showGerman ? 'de' : uiLang;
  const tl = useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
  const { legal, privacy, retention } = useLegalSettings();
  usePageTitle(t('legalPages.privacy.title'));

  const placeholder = (k: keyof LegalInfo) => tl(`legalPages.impressum.placeholders.${k}`);
  const vars = {
    months: String(retention.months),
    email: legal.email || placeholder('email'),
    supervisory: privacy.supervisoryAuthority || tl('legalPages.privacy.supervisoryFallback'),
  };
  // A custom text replaces the template once at least the binding German version exists.
  const custom = privacy.text.de ? privacy.text[lang] || privacy.text.de : '';
  const sections = tl('legalPages.privacy.sections', { returnObjects: true }) as PolicySection[];
  const date = privacy.effectiveDate
    ? new Intl.DateTimeFormat(lang === 'az' ? 'az-Latn-AZ' : lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${privacy.effectiveDate}T00:00:00Z`))
    : null;

  const all: PolicySection[] = [{ id: 'controller', title: tl('legalPages.privacy.controllerTitle'), body: [] }, ...sections];

  return (
    <>
      <PageHero title={t('legalPages.privacy.title')} subtitle={t('legalPages.privacy.subtitle')} image={HERO_IMAGE} />
      <section className="section">
        <div className="container-x">
          {uiLang !== 'de' && (
            <div className="mb-8 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-ink/85">
                <Languages className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                {t('legalPages.common.germanPrevails')}
              </p>
              <button type="button" className="btn-ghost btn-sm shrink-0 self-start sm:self-center" onClick={() => setShowGerman((s) => !s)} aria-pressed={showGerman}>
                {showGerman ? t('legalPages.common.showTranslation') : t('legalPages.common.showGerman')}
              </button>
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12" lang={lang}>
            {!custom && (
              <nav aria-label={tl('legalPages.common.contents')} className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
                <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">{tl('legalPages.common.contents')}</p>
                <ol className="mt-3 max-h-[calc(100vh-10rem)] space-y-1 overflow-y-auto pr-2 text-sm">
                  {all.map((s, i) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="flex gap-2 rounded-md px-2 py-1 text-muted hover:bg-surface hover:text-navy-900">
                        <span className="w-5 shrink-0 text-right tabular-nums">{i + 1}.</span>
                        <span>{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <article className={`min-w-0 text-[0.95rem] leading-relaxed text-ink/85 ${custom ? 'lg:col-span-2 lg:max-w-4xl' : ''}`}>
              {date && <p className="mb-6 text-sm font-semibold text-muted">{tl('legalPages.common.asOf', { date })}</p>}
              {custom ? (
                <CustomText text={fill(custom, vars)} />
              ) : (
                <div className="space-y-10">
                  {all.map((s, i) => (
                    <Reveal key={s.id}>
                      <section id={s.id} className="scroll-mt-28">
                        <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">
                          {i + 1}. {s.title}
                        </h2>
                        <div className="mt-3 space-y-3">
                          {s.id === 'controller' && (
                            <>
                              <p>{tl('legalPages.privacy.controllerIntro')}</p>
                              <ControllerBlock legal={legal} placeholder={placeholder} />
                            </>
                          )}
                          {s.id === 'dpo' && privacy.dpo ? (
                            <>
                              <p>{tl('legalPages.privacy.dpoNamed')}</p>
                              <p className="whitespace-pre-line">{privacy.dpo}</p>
                            </>
                          ) : (
                            s.body.map((b, j) =>
                              Array.isArray(b) ? (
                                <ul key={j} className="space-y-1.5">
                                  {b.map((item) => (
                                    <li key={item} className="flex gap-2.5">
                                      <ShieldCheck className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden />
                                      <span>{withMarks(fill(item, vars))}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p key={j}>{withMarks(fill(b, vars))}</p>
                              ),
                            )
                          )}
                        </div>
                      </section>
                    </Reveal>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
