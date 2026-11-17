import { describe, expect, it } from 'vitest';
import type { DriveItem } from '../types';
import { reasonOf, targetOf, targetsOf } from './api';

const base: DriveItem = {
  id: 'f1',
  kind: 'FOLDER',
  name: 'Ali Həsənov · C123',
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

describe('drive client folders: targets', () => {
  it('turns a client folder into a target with stage, partner and sent date', () => {
    const item: DriveItem = {
      ...base,
      caseId: 'c1',
      caseNumber: 'TV-1',
      caseInfo: { clientName: 'Ali Həsənov', passportNumber: null, visaType: 'WORK', partner: { id: 'p1', name: 'Rəşad' }, processing: { stage: 'DONE', assigneeId: 'u1' }, readySentAt: '2026-11-02T10:00:00Z' },
    };
    expect(targetOf(item)).toEqual({
      caseId: 'c1',
      folderId: 'f1',
      name: 'Ali Həsənov',
      number: 'TV-1',
      stage: 'DONE',
      assigneeId: 'u1',
      partner: { id: 'p1', name: 'Rəşad' },
      readySentAt: '2026-11-02T10:00:00Z',
    });
  });

  it('ignores files, plain folders and unknown stages', () => {
    expect(targetOf(base)).toBeNull();
    expect(targetOf({ ...base, kind: 'FILE', caseId: 'c1', caseInfo: { clientName: 'X', passportNumber: null, visaType: 'WORK', partner: null } })).toBeNull();
    const odd = targetOf({ ...base, caseId: 'c2', caseInfo: { clientName: '', passportNumber: null, visaType: 'WORK', partner: null, processing: { stage: 'WHATEVER', assigneeId: null } } });
    expect(odd).toMatchObject({ stage: null, name: base.name, partner: null, readySentAt: null });
    expect(targetsOf([base, { ...base, id: 'f2', caseId: 'c3', caseInfo: { clientName: 'Y', passportNumber: null, visaType: 'WORK', partner: null } }]).map((x) => x.caseId)).toEqual(['c3']);
  });

  it('always has a readable reason', () => {
    expect(typeof reasonOf('SOMETHING_UNKNOWN')).toBe('string');
    expect(typeof reasonOf(undefined)).toBe('string');
  });
});
