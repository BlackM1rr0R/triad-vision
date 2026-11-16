import { WorkScenePage } from '@/components/workScenes/WorkScenePage';
import { ElectricalPanelArt } from '@/components/workScenes/illustrations/ElectricalPanel';
import { ELECTRICAL_PANEL } from '@/lib/workScenes/scenes/electricalPanel';

/** Route module of one work scene (own chunk with its texts); page: components/workScenes/WorkScenePage. */
export default function ElectricalPanelScene() {
  return <WorkScenePage scene={ELECTRICAL_PANEL} art={<ElectricalPanelArt />} />;
}
