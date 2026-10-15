import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, FileText, Mail, Phone, Scale, UserRound } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { useLegalSettings, type LegalInfo } from './legalData';

registerCopy(pagesLegal);

const HERO_IMAGE = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=2000&q=70';

/** A value from the legal settings, or a clearly marked placeholder while it is missing. */
const Val = ({ value, placeholder }: { value: string; placeholder: string }) =>
  value ? (
    <>{value}</>
  ) : (
    <mark className="rounded bg-warning/15 px-1 font-semibold text-warning [box-decoration-break:clone]">{placeholder}</mark>
  );

const Block = ({ icon: Icon, title, children }: { icon: typeof Building2; title: string; children: ReactNode }) => (
  <div className="card card-pad min-w-0">
    <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900">
      <Icon className="size-5 shrink-0 text-brand-600" aria-hidden /> {title}
    </h2>
    <div className="mt-3 space-y-1 leading-relaxed break-words text-ink/85">{children}</div>
  </div>
);

export default function Impressum() {
  const { t, i18n } = useTranslation();
  const { legal } = useLegalSettings();
  usePageTitle(t('legalPages.impressum.title'));
  const ph = (k: keyof LegalInfo) => t(`legalPages.impressum.placeholders.${k}`);
  const v = (k: keyof LegalInfo) => <Val value={legal[k]} placeholder={ph(k)} />;
  const hasPlaceholders = (['companyName', 'street', 'postalCode', 'city', 'representative', 'email', 'phone', 'responsibleForContent'] as const).some(
    (k) => !legal[k],
  );
  const isGerman = (i18n.resolvedLanguage ?? 'az').startsWith('de');

  return (
    <>
      <PageHero title={t('legalPages.impressum.title')} subtitle={t('legalPages.impressum.subtitle')} image={HERO_IMAGE} />
      <section className="section">
        <div className="container-x max-w-5xl">
          {(!isGerman || hasPlaceholders) && (
            <div className="mb-6 space-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
              {!isGerman && <p>{t('legalPages.common.germanPrevails')}</p>}
              {hasPlaceholders && <p>{t('legalPages.common.placeholderNote')}</p>}
            </div>
          )}

          <Reveal>
            <div className="grid gap-5 md:grid-cols-2">
              <Block icon={Building2} title={t('legalPages.impressum.provider')}>
                <p className="font-semibold text-navy-900">
                  {v('companyName')} {v('legalForm')}
                </p>
                <p>{v('street')}</p>
                <p>
                  {v('postalCode')} {v('city')}
                </p>
                <p>{v('country')}</p>
              </Block>

              <Block icon={UserRound} title={t('legalPages.impressum.representedBy')}>
                <p>{v('representative')}</p>
              </Block>

              <Block icon={Mail} title={t('legalPages.impressum.contact')}>
                <p className="flex flex-wrap items-center gap-x-2">
                  <Phone className="size-4 text-muted" aria-hidden />
                  <span className="text-muted">{t('legalPages.impressum.phone')}:</span>
                  {legal.phone ? (
                    <a href={`tel:${legal.phone.replace(/[^\d+]/g, '')}`} className="text-brand-600 hover:underline">
                      {legal.phone}
                    </a>
                  ) : (
                    v('phone')
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-2">
                  <Mail className="size-4 text-muted" aria-hidden />
                  <span className="text-muted">{t('legalPages.impressum.email')}:</span>
                  {legal.email ? (
                    <a href={`mailto:${legal.email}`} className="break-all text-brand-600 hover:underline">
                      {legal.email}
                    </a>
                  ) : (
                    v('email')
                  )}
                </p>
              </Block>

              <Block icon={FileText} title={t('legalPages.impressum.register')}>
                <p>
                  <span className="text-muted">{t('legalPages.impressum.registerCourt')}:</span> {v('registerCourt')}
                </p>
                <p>
                  <span className="text-muted">{t('legalPages.impressum.registerNumber')}:</span> {v('registerNumber')}
                </p>
                <p className="pt-2">
                  <span className="text-muted">{t('legalPages.impressum.vatLabel')}:</span> {v('vatId')}
                </p>
              </Block>

              <Block icon={UserRound} title={t('legalPages.impressum.responsible')}>
                <p className="whitespace-pre-line">{v('responsibleForContent')}</p>
              </Block>

              {legal.supervisoryNote && (
                <Block icon={Scale} title={t('legalPages.impressum.supervisory')}>
                  <p className="whitespace-pre-line">{legal.supervisoryNote}</p>
                </Block>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="mt-10 space-y-8 text-[0.95rem] leading-relaxed text-ink/85">
              {(
                [
                  ['dispute', 'disputeText'],
                  ['liabilityContent', 'liabilityContentText'],
                  ['liabilityLinks', 'liabilityLinksText'],
                  ['copyright', 'copyrightText'],
                ] as const
              ).map(([title, text]) => (
                <div key={title}>
                  <h2 className="font-display text-xl font-bold text-navy-900">{t(`legalPages.impressum.${title}`)}</h2>
                  <p className="mt-2">{t(`legalPages.impressum.${text}`)}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
