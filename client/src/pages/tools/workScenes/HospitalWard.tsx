import { WorkScenePage } from '@/components/workScenes/WorkScenePage';
import { HospitalWardArt } from '@/components/workScenes/illustrations/HospitalWard';
import { HOSPITAL_WARD } from '@/lib/workScenes/scenes/hospitalWard';

/** Route module of one work scene (own chunk with its texts); page: components/workScenes/WorkScenePage. */
export default function HospitalWardScene() {
  return <WorkScenePage scene={HOSPITAL_WARD} art={<HospitalWardArt />} />;
}
