import { describe, expect, it } from 'vitest';
import type { DriveItem } from '../types';
import { applyStageFilter, stageKey, writtenEligible } from './stageFilter';

const base: DriveItem = {
  id: 'x',
  kind: 'FOLDER',
  name: 'x',
  space: 'SHARED',
  parentId: 'p',
  system: false,
  virtual: false,
  color: null,
  mimeType: null,
  size: null,
  version: 1,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  createdBy: null,
  ownerId: null,
  inheritPermissions: true,
  myAccess: 'EDIT',
  previewable: false,
  starred: false,
};

const clientFolder = (id: string, stage?: string): DriveItem =>
  ({ ...base, id, caseId: `c-${id}`, caseInfo: { clientName: id, processing: stage ? { stage } : null } }) as unknown as DriveItem;
const file = (id: string): DriveItem => ({ ...base, id, kind: 'FILE', mimeType: 'application/pdf' });
const plainFolder = (id: string): DriveItem => ({ ...base, id });

describe('drive client folders: status filter', () => {
  it('filters a listing of client folders by stage', () => {
    const items = [clientFolder('a', 'DONE'), clientFolder('b', 'WRITTEN'), clientFolder('c')];
    expect(applyStageFilter(items, ['DONE'], false).map((i) => i.id)).toEqual(['a']);
    expect(applyStageFilter(items, ['NONE'], false).map((i) => i.id)).toEqual(['c']);
    expect(stageKey(items[2])).toBe('NONE');
  });

  it('stays dormant inside a folder without client folders (opened client folder, category folder)', () => {
    const inside = [plainFolder('sub'), file('passport.pdf'), file('diploma.pdf')];
    expect(applyStageFilter(inside, ['DONE'], true)).toEqual(inside);
  });

  it('sorts by stage with non-client items last', () => {
    const items = [clientFolder('a', 'REFUSED'), plainFolder('p'), clientFolder('b', 'WRITTEN'), clientFolder('c', 'DONE')];
    expect(applyStageFilter(items, [], true).map((i) => i.id)).toEqual(['b', 'c', 'a', 'p']);
  });
});

describe('drive client folders: "Schon geschrieben" quick action', () => {
  it('keeps only client folders that are not WRITTEN yet', () => {
    const items = [clientFolder('a', 'WRITTEN'), clientFolder('b', 'IN_PROGRESS'), clientFolder('c'), clientFolder('d', 'DONE'), file('f'), plainFolder('p')];
    expect(writtenEligible(items).map((i) => i.id)).toEqual(['b', 'c', 'd']);
  });

  it('is empty when every selected client folder is already WRITTEN or nothing is a client folder', () => {
    expect(writtenEligible([clientFolder('a', 'WRITTEN'), clientFolder('b', 'WRITTEN')])).toEqual([]);
    expect(writtenEligible([file('f'), plainFolder('p')])).toEqual([]);
    expect(writtenEligible([])).toEqual([]);
  });

  it('ignores a case-linked folder without case info (not a client folder target)', () => {
    expect(writtenEligible([{ ...base, id: 'x', caseId: 'c-x' }])).toEqual([]);
  });
});
