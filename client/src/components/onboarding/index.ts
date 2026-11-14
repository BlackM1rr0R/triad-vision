/**
 * Guided tours. Mount <TourHost/> once in a layout; start with startTour(id).
 *
 *   import { TourHost, startTour } from '@/components/onboarding';
 *   <TourHost autoStart="admin" helpTour="admin" />       // shows once after the first login; "Guided tour" in the phone help menu
 *   <button onClick={() => restartTour('admin')}>Tour</button>   // help menu: from step 1, also when finished
 */
export { TourHost } from './TourHost';
export { TourRestartButton } from './TourRestartButton';
export {
  registerTour,
  startTour,
  restartTour,
  loadTourProgress,
  saveTourProgress,
  resumeStep,
  stopTour,
  goToStep,
  getTour,
  isTourActive,
  useTourState,
  useAutoStartTour,
  shouldAutoStart,
  readSeen,
  writeSeen,
  type TourDef,
  type TourStep,
  type TourPlacement,
  type TourOutcome,
} from './tour';
export { ADMIN_TOUR, CLIENT_TOUR, STAFF_TOUR } from './tours';
