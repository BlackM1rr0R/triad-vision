import { describe, expect, it } from 'vitest';
import { caseStageFolders, isClientDataFolder, looksLikeClientFolderName, matchWorkflowLinks } from '../../src/lib/drive/workflowLinkRules.js';
import { clientFolderBaseName } from '../../src/lib/drive/caseFolders.js';
import { isInsidePartnerFolder } from '../../src/lib/partnerAccess/drive.js';
import { isPureMask, stripMaskedInput } from '../../src/lib/privacy/mask.js';

/**
 * Case links in the drive (lib/drive/workflowLinks + workflowLinkRules): Fertig documents by case id with the name
 * fallback, the by-name backfill, client folders left behind after a case was deleted (partner drive isolation),
 * and masked values never written back (landlord listing / client address forms).
 */

const at = (min: number) => new Date(Date.UTC(2026, 10, 18, 10, min));

describe('workflow stage folders of a case', () => {
  const rows = [
    { id: 'legacy', name: 'Ali Həsənov · Pass-Nr. C1', workflowCaseId: null, createdAt: at(1) },
    { id: 'other', name: 'Ali Həsənov · Pass-Nr. C1', workflowCaseId: 'case-b', createdAt: at(2) },
    { id: 'mine2', name: 'Ali Həsənov (2)', workflowCaseId: 'case-a', createdAt: at(4) },
    { id: 'mine1', name: 'Old name', workflowCaseId: 'case-a', createdAt: at(3) },
  ];

  it('prefers the folders linked to the case (oldest first), whatever their name', () => {
    expect(caseStageFolders(rows, 'case-a', 'Ali Həsənov · Pass-Nr. C1').map((r) => r.id)).toEqual(['mine1', 'mine2']);
  });

  it('falls back to an unlinked legacy copy by the client folder name (ignoring case), never to another case’s', () => {
    expect(caseStageFolders(rows, 'case-c', 'ali həsənov · pass-nr. c1').map((r) => r.id)).toEqual(['legacy']);
    expect(caseStageFolders(rows.filter((r) => r.id !== 'legacy'), 'case-c', 'Ali Həsənov · Pass-Nr. C1')).toEqual([]);
    expect(caseStageFolders(rows, 'case-c', null)).toEqual([]);
  });

  it('backfill links by name only where exactly one case has a client folder of that name', () => {
    const unlinked = [
      { id: 'w1', name: 'Ali Həsənov · Pass-Nr. C1' },
      { id: 'w2', name: 'Leyla Əliyeva · TV-2026-0007' },
      { id: 'w3', name: 'Nobody' },
    ];
    const clientFolders = [
      { caseId: 'a', name: 'ALI HƏSƏNOV · PASS-NR. C1' },
      { caseId: 'b', name: 'Leyla Əliyeva · TV-2026-0007' },
      { caseId: 'c', name: 'leyla əliyeva · tv-2026-0007' },
    ];
    expect(matchWorkflowLinks(unlinked, clientFolders)).toEqual([{ id: 'w1', caseId: 'a' }]);
    // the same case twice under one name is still unambiguous
    expect(matchWorkflowLinks([{ id: 'w', name: 'X' }], [{ caseId: 'a', name: 'X' }, { caseId: 'a', name: 'x' }])).toEqual([{ id: 'w', caseId: 'a' }]);
  });
});

describe('client folders left behind', () => {
  it('recognises the names lib/drive/caseFolders gives client folders', () => {
    const c = { number: 'TV-2026-0012', client: { firstName: 'Ali', lastName: 'Həsənov', passportNumber: null as string | null } };
    expect(looksLikeClientFolderName(clientFolderBaseName(c))).toBe(true);
    expect(looksLikeClientFolderName(clientFolderBaseName({ ...c, client: { ...c.client, passportNumber: 'C01234567' } }))).toBe(true);
    expect(looksLikeClientFolderName('Verträge 2026')).toBe(false);
    expect(looksLikeClientFolderName('Partner · Rechnungen')).toBe(false);
  });

  it('treats a folder that ever was a client folder (or a workflow copy) as client data', () => {
    const none = new Set<string>();
    expect(isClientDataFolder({ id: 'f', clientFolderAt: at(0), workflowCaseId: null }, none)).toBe(true);
    expect(isClientDataFolder({ id: 'f', clientFolderAt: null, workflowCaseId: 'c1' }, none)).toBe(true);
    expect(isClientDataFolder({ id: 'f', clientFolderAt: null, workflowCaseId: null }, new Set(['f']))).toBe(true);
    expect(isClientDataFolder({ id: 'f', clientFolderAt: null, workflowCaseId: null }, none)).toBe(false);
  });

  it('a marked folder in the partner folder hides itself and everything below it', () => {
    const chain = [
      { id: 'file', parentId: 'orphan', deletedAt: null },
      { id: 'orphan', parentId: 'root', deletedAt: null },
      { id: 'root', parentId: 'partners', deletedAt: null },
    ];
    expect(isInsidePartnerFolder(chain, 'root', new Set())).toBe(true);
    expect(isInsidePartnerFolder(chain, 'root', new Set(['orphan']))).toBe(false);
  });
});

describe('masked values are never saved back', () => {
  it('drops masked landlord listing fields and keeps the real changes', () => {
    const body = { name: 'Wohnung Mitte', address: '••••', contactName: '••••', contactPhone: '+49 30 1234', contactEmail: '••••', city: 'Berlin' };
    expect(stripMaskedInput({ ...body }, 0, true)).toEqual({ name: 'Wohnung Mitte', contactPhone: '+49 30 1234', city: 'Berlin' });
  });

  it('drops a masked client address and housing details', () => {
    expect(stripMaskedInput({ address: '••••', city: 'Bakı' }, 0, true)).toEqual({ city: 'Bakı' });
    expect(stripMaskedInput({ housingDetails: '••••', pickupConfirmed: true }, 0, true)).toEqual({ pickupConfirmed: true });
  });
});


describe('masked input before the policy is known (pure masks only)', () => {
  it('recognises the masks this module writes, not texts with a bullet', () => {
    for (const v of ['••••', '•••• 3456', 'A•••', ' •••• T47 ']) expect(isPureMask(v)).toBe(true);
    for (const v of ['Paket • Premium', 'Berlin', '', '•', 'Musterstraße 12 • Hinterhaus']) expect(isPureMask(v)).toBe(false);
  });

  it('drops a pure mask under a sensitive key even without a masking policy, keeps real values', () => {
    expect(stripMaskedInput({ address: '••••', name: 'Paket • Premium', contactName: 'Frau • Schmidt' }, 0, true, true)).toEqual({ name: 'Paket • Premium', contactName: 'Frau • Schmidt' });
  });
});
