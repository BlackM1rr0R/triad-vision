import type { SyntheticEvent } from 'react';
import { markMorph, transitionsEnabled, vtName } from '@/lib/viewTransition';

/**
 * Shared-element morph "cases list row → case header" (lib/viewTransition.ts): when a row / card is opened,
 * its case-number element (marked data-vt-part="title") gets the same view-transition-name as the case
 * page's title, so the number grows into the header instead of the page just cross-fading.
 */
export const morphCaseRow = (e: SyntheticEvent<HTMLElement>, id: string) => {
  if (!transitionsEnabled()) return;
  const row = e.currentTarget.closest('tr, li') ?? e.currentTarget;
  const el = row.querySelector<HTMLElement>('[data-vt-part="title"]');
  if (el) {
    el.style.setProperty('view-transition-name', vtName('case', id, 'title'));
    el.style.setProperty('view-transition-class', 'vt-text');
  }
  markMorph('case', id);
};
