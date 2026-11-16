import { WorkScenePage } from '@/components/workScenes/WorkScenePage';
import { ConstructionSiteArt } from '@/components/workScenes/illustrations/ConstructionSite';
import { CONSTRUCTION_SITE } from '@/lib/workScenes/scenes/constructionSite';

/** Route module of one work scene (own chunk with its texts); page: components/workScenes/WorkScenePage. */
export default function ConstructionSiteScene() {
  return <WorkScenePage scene={CONSTRUCTION_SITE} art={<ConstructionSiteArt />} />;
}
