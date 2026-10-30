import { registerTour } from '@/components/onboarding/tour';

/**
 * Guided tours of the staff power features, started from the "Yeniliklər" panel ("Göstər"). Same engine as the
 * client / workspace tours (components/onboarding): data-tour targets, a step whose target is missing is
 * skipped after a moment. Copy: i18n/pagesStaffPower.ts (sp.tours.*).
 */

export const TOUR_REVIEW = 'sp-review';
export const TOUR_BULK = 'sp-bulk';
export const TOUR_VIEWS = 'sp-views';
export const TOUR_DOCFLOW = 'sp-docflow';

const step = (tour: string, id: string, target: string | string[], placement: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto') => ({
  id,
  target,
  titleKey: `sp.tours.${tour}.${id}.title`,
  textKey: `sp.tours.${tour}.${id}.text`,
  placement,
});

registerTour({
  id: TOUR_REVIEW,
  route: '/admin/review',
  steps: [
    step('review', 'queue', 'sp-review-filters', 'bottom'),
    step('review', 'viewer', 'sp-review-viewer', 'right'),
    step('review', 'panel', 'sp-review-panel', 'left'),
    step('review', 'actions', 'sp-review-actions', 'top'),
    step('review', 'keys', 'sp-review-help', 'bottom'),
  ],
});

registerTour({
  id: TOUR_BULK,
  route: '/admin/cases',
  steps: [
    step('bulk', 'select', 'sp-select-all', 'right'),
    step('bulk', 'bar', 'sp-bulkbar', 'bottom'),
    step('bulk', 'columns', 'sp-columns', 'bottom'),
  ],
});

registerTour({
  id: TOUR_VIEWS,
  route: '/admin/cases',
  steps: [
    step('views', 'menu', 'sp-views', 'bottom'),
    step('views', 'pinned', 'sp-pinned-views', 'right'),
    step('views', 'columns', 'sp-columns', 'bottom'),
  ],
});

// Team document workflow (Schon geschrieben → Fertig): the stage filter and board on the cases list, and the
// "Sənədlər / Documents" card on a case page (#case-processing, components/caseProcessing/ProcessingCard.tsx).
registerTour({
  id: TOUR_DOCFLOW,
  route: '/admin/cases',
  steps: [
    step('docflow', 'filter', 'sp-docflow-filter', 'bottom'),
    step('docflow', 'board', 'sp-docflow-board', 'bottom'),
    step('docflow', 'card', '#case-processing', 'top'),
  ],
});
