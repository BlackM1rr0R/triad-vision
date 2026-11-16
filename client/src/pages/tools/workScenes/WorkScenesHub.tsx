import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { GameLinks } from '@/components/games/GameLinks';
import { registerCopy } from '@/i18n';
import { pagesWorkScenes } from '@/i18n/pagesWorkScenes';
import { usePageTitle } from '@/lib/usePageTitle';
import { SCENE_META } from '@/lib/workScenes/meta';
import { RestaurantKitchenArt } from '@/components/workScenes/illustrations/RestaurantKitchen';
import { TruckCabArt } from '@/components/workScenes/illustrations/TruckCab';
import { HospitalWardArt } from '@/components/workScenes/illustrations/HospitalWard';
import { ConstructionSiteArt } from '@/components/workScenes/illustrations/ConstructionSite';
import { ElectricalPanelArt } from '@/components/workScenes/illustrations/ElectricalPanel';
import type { SceneId } from '@/lib/workScenes/types';

registerCopy(pagesWorkScenes);

const ART: Record<SceneId, ComponentType> = {
  'restaurant-kitchen': RestaurantKitchenArt,
  'truck-cab': TruckCabArt,
  'hospital-ward': HospitalWardArt,
  'construction-site': ConstructionSiteArt,
  'electrical-panel': ElectricalPanelArt,
};

/** /work-scenes — the five interactive workplaces (cards with the scene drawing) and the learning games. */
export default function WorkScenesHub() {
  const { t } = useTranslation();
  usePageTitle(t('ws.hubTitle'));
  return (
    <>
      <PageHero title={t('ws.hubTitle')} subtitle={t('ws.hubSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-8">
          <p className="max-w-[70ch] text-ink/85">{t('ws.hubIntro')}</p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SCENE_META.map((m) => {
              const Art = ART[m.id];
              return (
                <li key={m.id}>
                  <Link to={m.path} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
                    <div className="pointer-events-none border-b border-line">
                      <Art />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h2 className="font-display text-lg font-semibold text-ink">{t(`ws.scenes.${m.id}.title`)}</h2>
                      <p className="mt-1 flex-1 text-sm text-muted">{t(`ws.scenes.${m.id}.teaser`)}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        {t('ws.open')} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <GameLinks />
        </div>
      </section>
    </>
  );
}
