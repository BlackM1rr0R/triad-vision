import { describe, expect, it } from 'vitest';
import { dropRefusal, undoMovePlan } from './dnd';
import { isQuickPreviewable, peekPosition, quickKind, stepPreview } from './QuickPreview';

const it_ = (id: string, parentId: string | null) => ({ id, parentId });

describe('dropRefusal', () => {
  it('refuses a drop onto one of the dragged items', () => {
    expect(dropRefusal([it_('a', 'root'), it_('b', 'root')], 'b', false)).toBe('self');
    expect(dropRefusal([it_('a', 'root')], 'a', true)).toBe('self');
  });

  it('refuses a folder below a dragged folder (tree targets know their ancestors)', () => {
    // a/x/y: dragging "a" onto "y" (ancestors root → a → x)
    expect(dropRefusal([it_('a', 'root')], 'y', false, ['root', 'a', 'x'])).toBe('descendant');
    expect(dropRefusal([it_('a', 'root')], 'y', true, ['root', 'a', 'x'])).toBe('descendant');
    // a sibling branch is fine
    expect(dropRefusal([it_('a', 'root')], 'y', false, ['root', 'b', 'x'])).toBeNull();
  });

  it('a move into the folder the items already live in is a no-op, a copy is not', () => {
    expect(dropRefusal([it_('a', 'f'), it_('b', 'f')], 'f', false)).toBe('noop');
    expect(dropRefusal([it_('a', 'f'), it_('b', 'f')], 'f', true)).toBeNull();
    // mixed origins: the items from elsewhere still move
    expect(dropRefusal([it_('a', 'f'), it_('b', 'g')], 'f', false)).toBeNull();
  });
});

describe('undoMovePlan', () => {
  it('groups the moved items by the folder they came from', () => {
    const items = [it_('a', 'p1'), it_('b', 'p2'), it_('c', 'p1'), it_('d', 'p2')];
    expect(undoMovePlan(items, ['a', 'b', 'c', 'd'])).toEqual([
      { targetId: 'p1', ids: ['a', 'c'] },
      { targetId: 'p2', ids: ['b', 'd'] },
    ]);
  });

  it('leaves out items that failed to move and items without a parent', () => {
    const items = [it_('a', 'p1'), it_('b', 'p1'), it_('r', null)];
    expect(undoMovePlan(items, ['b', 'r'])).toEqual([{ targetId: 'p1', ids: ['b'] }]);
    expect(undoMovePlan(items, [])).toEqual([]);
  });
});

describe('quick look helpers', () => {
  const file = (mimeType: string | null, previewable = true, kind: 'FILE' | 'FOLDER' = 'FILE') => ({ kind, previewable, mimeType });

  it('previews images and PDFs the server marks inline-viewable', () => {
    expect(quickKind(file('image/png'))).toBe('image');
    expect(quickKind(file('application/pdf'))).toBe('pdf');
    expect(isQuickPreviewable(file('application/pdf', false))).toBe(false);
    expect(isQuickPreviewable(file('text/plain'))).toBe(false);
    expect(isQuickPreviewable(file(null))).toBe(false);
    expect(isQuickPreviewable(file('image/png', true, 'FOLDER'))).toBe(false);
  });

  it('steps through the previewable files and wraps around', () => {
    expect(stepPreview(['a', 'b', 'c'], 'b', 1)).toBe('c');
    expect(stepPreview(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(stepPreview(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(stepPreview(['a'], 'a', 1)).toBeNull();
    expect(stepPreview(['a', 'b'], 'gone', 1)).toBe('a');
  });

  it('keeps the peek card inside the viewport', () => {
    const vp = { width: 1200, height: 800 };
    expect(peekPosition({ left: 100, right: 260, top: 200 }, vp)).toEqual({ left: 270, top: 200 });
    // no room on the right: flipped to the left of the anchor
    expect(peekPosition({ left: 1000, right: 1150, top: 200 }, vp).left).toBe(1000 - 10 - 288);
    // near the bottom: lifted up
    expect(peekPosition({ left: 100, right: 260, top: 700 }, vp).top).toBe(800 - 320 - 8);
  });
});
