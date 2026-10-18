import { SCAN_MAX_PAGES, addPage, canMove, movePage, overallProgress, removePage, replacePage, scanPdfName } from '@/features/case/scanPages';

const list = (n: number, current = 0) => ({ pages: Array.from({ length: n }, (_, i) => `p${i + 1}`), current });

describe('scanner page list', () => {
  it('adds pages up to the server limit and selects the new one', () => {
    expect(addPage(list(2), 'x')).toEqual({ pages: ['p1', 'p2', 'x'], current: 2 });
    const full = list(SCAN_MAX_PAGES, 3);
    expect(addPage(full, 'x')).toBe(full);
    expect(SCAN_MAX_PAGES).toBe(20);
  });

  it('replaces a page in place', () => {
    expect(replacePage(list(3, 1), 1, 'new')).toEqual({ pages: ['p1', 'new', 'p3'], current: 1 });
  });

  it('removes pages and keeps a sensible selection', () => {
    expect(removePage(list(3, 2), 2)).toEqual({ pages: ['p1', 'p2'], current: 1 });
    expect(removePage(list(3, 0), 0)).toEqual({ pages: ['p2', 'p3'], current: 0 });
    expect(removePage(list(3, 2), 0)).toEqual({ pages: ['p2', 'p3'], current: 1 });
    expect(removePage(list(3, 0), 2)).toEqual({ pages: ['p1', 'p2'], current: 0 });
    expect(removePage(list(1), 0)).toEqual({ pages: [], current: 0 });
    const l = list(2);
    expect(removePage(l, 5)).toBe(l);
  });

  it('moves pages earlier / later, never out of range', () => {
    expect(movePage(list(3, 2), 2, -1)).toEqual({ pages: ['p1', 'p3', 'p2'], current: 1 });
    expect(movePage(list(3, 0), 0, 1)).toEqual({ pages: ['p2', 'p1', 'p3'], current: 1 });
    const l = list(3);
    expect(movePage(l, 0, -1)).toBe(l);
    expect(movePage(l, 2, 1)).toBe(l);
    expect(canMove(3, 0, -1)).toBe(false);
    expect(canMove(3, 1, 1)).toBe(true);
    expect(canMove(3, 2, 1)).toBe(false);
  });

  it('names the PDF after the requirement', () => {
    expect(scanPdfName('Pasport (bütün səhifələr)')).toBe('Pasport (bütün səhifələr)');
    expect(scanPdfName('a/b:c*?')).toBe('a b c');
    expect(scanPdfName('  ', new Date(Date.UTC(2026, 9, 18)))).toBe('scan-2026-10-18');
  });

  it('weights rendering and uploading in the overall progress', () => {
    expect(overallProgress('render', 0, 4)).toBe(0);
    expect(overallProgress('render', 4, 4)).toBeCloseTo(0.3);
    expect(overallProgress('upload', 0.5, 1)).toBeCloseTo(0.65);
    expect(overallProgress('upload', 1, 1)).toBe(1);
    expect(overallProgress('upload', 1, 0)).toBe(0);
  });
});
