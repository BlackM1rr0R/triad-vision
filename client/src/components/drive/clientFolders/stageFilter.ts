import type { ProcessingStage } from '@/components/caseProcessing/api';
import type { DriveItem } from '../types';

/** A status chip of the client-folder filter bar: a workflow stage, or "not in the workflow". */
export type StageFilter = ProcessingStage | 'NONE';

/** Order of the "sort by status" view: the open work first. */
const STAGE_ORDER: Record<string, number> = { WRITTEN: 0, IN_PROGRESS: 1, DONE: 2, REFUSED: 3, NONE: 4 };

/** The workflow stage of a client folder ('NONE' when not in the workflow); null for anything else. */
export const stageKey = (i: DriveItem): string | null => (i.kind === 'FOLDER' && i.caseId ? (i.caseInfo?.processing?.stage ?? 'NONE') : null);

/**
 * Status filter + sort of a listing. Only listings that hold client folders are filtered: inside a client folder (files,
 * sub-folders) or a category folder the filter is dormant, so an active chip never makes an opened folder look empty
 * while the bar (and its "clear" button) is hidden there.
 */
export const applyStageFilter = (items: DriveItem[], filter: readonly StageFilter[], byStage: boolean): DriveItem[] => {
  if (!items.some((i) => stageKey(i) !== null)) return items;
  let out = items;
  if (filter.length) out = out.filter((i) => {
    const k = stageKey(i);
    return k !== null && filter.includes(k as StageFilter);
  });
  if (byStage) {
    out = [...out].sort((a, b) => {
      const ka = stageKey(a);
      const kb = stageKey(b);
      if (ka === null || kb === null) return ka === kb ? 0 : ka === null ? 1 : -1;
      return STAGE_ORDER[ka] - STAGE_ORDER[kb];
    });
  }
  return out;
};
