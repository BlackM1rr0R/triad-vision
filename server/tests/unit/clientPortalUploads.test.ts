import { describe, expect, it, vi } from 'vitest';
import type { DocStage, DocStatus } from '@prisma/client';

vi.mock('../../src/db.js', () => ({ prisma: {} }));
const { notifyStaff } = vi.hoisted(() => ({ notifyStaff: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock('../../src/lib/notifications.js', () => ({ notifyStaff }));

const { notifyClientUpload, uploadableRequirements } = await import('../../src/lib/clientUploadTarget.js');

const req = (id: string, stage: DocStage, ...statuses: DocStatus[]) => ({ id, stage, documents: statuses.map((status) => ({ status })) });

describe('uploadableRequirements ("use from my vault" suggestions follow the upload rules)', () => {
  const rows = [req('i1', 'INITIAL', 'ACCEPTED'), req('i2', 'INITIAL', 'REJECTED'), req('e1', 'EMBASSY'), req('e2', 'EMBASSY', 'REJECTED')];

  it('the open step (plus replacements for rejected documents of other steps)', () => {
    expect(uploadableRequirements('DOCUMENTS_PENDING', rows, false).map((x) => x.requirement.id)).toEqual(['i1', 'i2', 'e2']);
    expect(uploadableRequirements('DOCUMENTS_PENDING', rows, true).map((x) => x.requirement.id)).toEqual(['i1', 'i2', 'e2']); // not a waiting status
  });

  it('early embassy documents while the case waits for the contract', () => {
    const got = uploadableRequirements('CONTRACT_SENT', rows, true);
    expect(got.map((x) => [x.requirement.id, x.target.early ?? false, x.target.replacement])).toEqual([
      ['i2', false, true],
      ['e1', true, false],
      ['e2', true, false],
    ]);
    // Not waiting (early rule off): only the replacements of rejected documents.
    expect(uploadableRequirements('CONTRACT_SENT', rows, false).map((x) => x.requirement.id)).toEqual(['i2', 'e2']);
  });

  it('replacements for rejected documents after the hand-in; nothing once the case is closed', () => {
    expect(uploadableRequirements('EMBASSY_REVIEW', rows, false).map((x) => x.requirement.id)).toEqual(['i2', 'e2']);
    expect(uploadableRequirements('EMBASSY_DOCUMENTS', rows, false).map((x) => x.requirement.id)).toEqual(['i2', 'e1', 'e2']);
    expect(uploadableRequirements('APPROVED', rows, false)).toEqual([]);
  });
});

describe('notifyClientUpload (scan / vault / case upload tell staff alike)', () => {
  const c = { id: 'c1', number: 'TV-1' };
  const r = { title: { az: 'Sığorta' } };

  it('early embassy upload and replacement notify staff; a normal upload does not', async () => {
    notifyStaff.mockClear();
    await notifyClientUpload(c, { replacement: false, early: true }, r, 'a.pdf');
    await notifyClientUpload(c, { replacement: true }, r, 'b.pdf');
    await notifyClientUpload(c, { replacement: false }, r, 'c.pdf');
    const titles = (notifyStaff.mock.calls as unknown as [string][]).map(([title]) => title);
    expect(titles).toEqual(['TV-1: səfirlik sənədi erkən yükləndi', 'TV-1: rədd edilmiş sənəd yenidən yükləndi']);
  });
});
