import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesEmergencyWallpaper } from '@/i18n/pagesEmergencyWallpaper';
import { usePageTitle } from '@/lib/usePageTitle';
import { AZ_PLACES, VERIFIED_ON } from '@/lib/azInGermany/data';
import { WallpaperBuilder, WallpaperHowTo } from '@/components/emergencyWallpaper/WallpaperBuilder';
import { GlossaryLinks, Sources, ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';

registerCopy(pagesEmergencyWallpaper);

const embassySources = AZ_PLACES.find((p) => p.id === 'embassy')?.sources ?? [];

const WALLPAPER_SOURCES = [
  { label: '116117.de – Ärztlicher Bereitschaftsdienst (Kassenärztliche Bundesvereinigung)', url: 'https://www.116117.de/' },
  { label: 'Europäische Kommission – 112, die europaweite Notrufnummer', url: 'https://digital-strategy.ec.europa.eu/en/policies/112' },
  ...embassySources,
];

/**
 * /emergency-wallpaper — public lock-screen emergency wallpaper generator, no personal data prefilled.
 * The client portal has the same builder prefilled from the case (/account/emergency-wallpaper).
 */
export default function EmergencyWallpaperPage() {
  const { t } = useTranslation();
  usePageTitle(t('ewp.heroTitle'));
  const faq = useFaq('ewp.faq');
  return (
    <>
      <PageHero title={t('ewp.heroTitle')} subtitle={t('ewp.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <WallpaperBuilder />
          <WallpaperHowTo />
          <GlossaryLinks
            terms={[
              { slug: 'notruf', label: 'Notruf' },
              { slug: 'krankenkasse', label: 'Krankenkasse' },
              { slug: 'elektronische-gesundheitskarte', label: 'eGK' },
              { slug: 'anmeldung', label: 'Anmeldung' },
            ]}
          />
          <Sources checked={VERIFIED_ON} items={WALLPAPER_SOURCES} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/emergency-wallpaper" />
    </>
  );
}
