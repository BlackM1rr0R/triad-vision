/**
 * Guided tours. Mount <TourHost/> once in a layout; start with startTour(id).
 *
 *   import { TourHost, startTour } from '@/components/onboarding';
 *   <TourHost autoStart="admin" />                       // shows once after the first login
 *   <button onClick={() => startTour('admin')}>Tour</button>
 */
export { TourHost } from './TourHost';
export { TourRestartButton } from './TourRestartButton';
export {
  registerTour,
  startTour,
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
export { CLIENT_TOUR, STAFF_TOUR } from './tours';
