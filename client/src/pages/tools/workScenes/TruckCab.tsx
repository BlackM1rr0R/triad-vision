import { WorkScenePage } from '@/components/workScenes/WorkScenePage';
import { TruckCabArt } from '@/components/workScenes/illustrations/TruckCab';
import { TRUCK_CAB } from '@/lib/workScenes/scenes/truckCab';

/** Route module of one work scene (own chunk with its texts); page: components/workScenes/WorkScenePage. */
export default function TruckCabScene() {
  return <WorkScenePage scene={TRUCK_CAB} art={<TruckCabArt />} />;
}
