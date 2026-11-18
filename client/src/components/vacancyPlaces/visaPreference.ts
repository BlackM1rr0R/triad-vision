/**
 * The visa picked before registering (calculator / visa page → /register?visa=<slug>) while "clients can only apply to
 * active vacancies" is on: the vacancy decides the visa, so the choice is used to put the matching vacancies first
 * and, when exactly one of them has a free place, to preselect it. Full vacancies stay last (not selectable).
 */

export interface VisaMatchable {
  id: string;
  visaCategoryId?: string | null;
}

/** Pure: matching open vacancies first, then the other open ones, full ones last; the order inside each group is kept. */
export const orderForVisa = <V extends VisaMatchable>(vacancies: V[], categoryId: string | null | undefined, isFull: (v: V) => boolean): V[] => {
  if (!categoryId) return vacancies;
  const rank = (v: V) => (isFull(v) ? 2 : v.visaCategoryId === categoryId ? 0 : 1);
  return vacancies.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map((x) => x.v);
};

/** Pure: the vacancy to preselect for that visa (the only matching one with a free place), or ''. */
export const preselectForVisa = <V extends VisaMatchable>(vacancies: V[], categoryId: string | null | undefined, isFull: (v: V) => boolean): string => {
  if (!categoryId) return '';
  const open = vacancies.filter((v) => !isFull(v) && v.visaCategoryId === categoryId);
  return open.length === 1 ? open[0].id : '';
};
