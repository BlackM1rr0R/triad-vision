import { describe, expect, it, vi } from 'vitest';
import type { DriveAccess, Role } from '@prisma/client';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { DriveAccessCtx } = await import('../../src/lib/drive/access.js');
const { maxLevel, minLevel, allows } = await import('../../src/lib/drive/levels.js');
const { checkName, safeUploadName, pickFreeName } = await import('../../src/lib/drive/names.js');
const { parseVirtualId, caseLevel } = await import('../../src/lib/drive/cases.js');

type G = { userId?: string; role?: Role; access: DriveAccess };
const node = (id: string, parentId: string | null, grants: G[] = [], over: Partial<{ inherit: boolean; space: 'SHARED' | 'PERSONAL' | 'CASES'; ownerId: string | null }> = {}) => ({
  id,
  parentId,
  space: over.space ?? 'SHARED',
  kind: 'FOLDER' as const,
  name: id,
  ownerId: over.ownerId ?? null,
  inheritPermissions: over.inherit ?? true,
  system: parentId === null,
  deletedAt: null,
  grants: grants.map((g, i) => ({ id: `${id}-g${i}`, userId: g.userId ?? null, role: g.role ?? null, access: g.access })),
});

/**
 *   root (STAFF=VIEW)
 *   ├─ hr (u1=EDIT)
 *   │  └─ payroll (inherit=false, ADMIN=DOWNLOAD)
 *   │     └─ 2026 (u2=MANAGE)
 *   └─ open
 *   me (PERSONAL, owner u1)
 *   └─ notes (u3=VIEW)
 */
const tree = [
  node('root', null, [{ role: 'STAFF', access: 'VIEW' }]),
  node('hr', 'root', [{ userId: 'u1', access: 'EDIT' }]),
  node('payroll', 'hr', [{ role: 'ADMIN', access: 'DOWNLOAD' }], { inherit: false }),
  node('2026', 'payroll', [{ userId: 'u2', access: 'MANAGE' }]),
  node('open', 'root'),
  node('me', null, [], { space: 'PERSONAL', ownerId: 'u1' }),
  node('notes', 'me', [{ userId: 'u3', access: 'VIEW' }], { space: 'PERSONAL', ownerId: 'u1' }),
];

const levelsFor = (id: string, role: Role) => {
  const ctx = new DriveAccessCtx({ id, role });
  ctx.add(tree);
  return Object.fromEntries(tree.map((n) => [n.id, ctx.level(n.id)]));
};

describe('drive permission engine', () => {
  it('inherits from parents and takes the best matching grant', () => {
    expect(levelsFor('u1', 'STAFF')).toEqual({ root: 'VIEW', hr: 'EDIT', payroll: null, '2026': null, open: 'VIEW', me: 'MANAGE', notes: 'MANAGE' });
  });

  it('a node without inheritance only counts its own grants (and those below it)', () => {
    expect(levelsFor('u2', 'STAFF')).toEqual({ root: 'VIEW', hr: 'VIEW', payroll: null, '2026': 'MANAGE', open: 'VIEW', me: null, notes: null });
  });

  it('role grants cover higher roles', () => {
    expect(levelsFor('a1', 'ADMIN')).toMatchObject({ root: 'VIEW', payroll: 'DOWNLOAD', '2026': 'DOWNLOAD', me: null });
    expect(levelsFor('c1', 'CLIENT')).toMatchObject({ root: null, hr: null, open: null });
  });

  it('personal trees: only the owner, explicit grants or the super admin', () => {
    expect(levelsFor('u3', 'STAFF')).toMatchObject({ me: null, notes: 'VIEW' });
    expect(Object.values(levelsFor('s1', 'SUPER_ADMIN')).every((l) => l === 'MANAGE')).toBe(true);
  });

  it('chain lists ancestors root first', () => {
    const ctx = new DriveAccessCtx({ id: 'x', role: 'STAFF' });
    ctx.add(tree);
    expect(ctx.chain('2026').map((n) => n.id)).toEqual(['root', 'hr', 'payroll', '2026']);
  });

  it('level helpers', () => {
    expect(maxLevel(null, 'VIEW')).toBe('VIEW');
    expect(maxLevel('EDIT', 'EXPORT')).toBe('EDIT');
    expect(minLevel('MANAGE', 'EXPORT')).toBe('EXPORT');
    expect(minLevel('VIEW', 'EXPORT')).toBe('VIEW');
    expect(allows('EXPORT', 'DOWNLOAD')).toBe(true);
    expect(allows('DOWNLOAD', 'EXPORT')).toBe(false);
    expect(allows(null, 'VIEW')).toBe(false);
  });

  it('case folders: root level or assigned staff, capped at EXPORT', () => {
    expect(caseLevel(null, 'me', 'me')).toBe('DOWNLOAD');
    expect(caseLevel(null, 'other', 'me')).toBeNull();
    expect(caseLevel('MANAGE', null, 'me')).toBe('EXPORT');
    expect(caseLevel('VIEW', 'me', 'me')).toBe('DOWNLOAD');
  });
});

describe('drive names and virtual ids', () => {
  it.each(['', '.', '..', 'a/b', 'a\\b', 'a:b', 'x*y', 'CON', 'lpt1.txt', 'name.', ' lead', 'trail ', 'x\u0000y', 'a'.repeat(201)])('rejects %j', (n) => {
    expect(() => checkName(n)).toThrow();
  });

  it('accepts ordinary unicode names', () => {
    expect(checkName('Müqavilələr 2026')).toBe('Müqavilələr 2026');
    expect(checkName('.hidden-ok')).toBe('.hidden-ok');
  });

  it('makes upload names safe', () => {
    expect(safeUploadName('../../etc/passwd')).toBe('passwd');
    expect(safeUploadName('C:\\Users\\x\\a<b>.pdf')).toBe('a_b_.pdf');
    expect(safeUploadName('...')).toBe('file');
    expect(safeUploadName('nul.txt')).toBe('_nul.txt');
  });

  it('picks "name (n).ext" for clashes, ignoring case', () => {
    const taken = new Set(['report.pdf', 'report (2).pdf', 'docs']);
    expect(pickFreeName(taken, 'Report.pdf', true)).toBe('Report (3).pdf');
    expect(pickFreeName(taken, 'Docs', false)).toBe('Docs (2)');
    expect(pickFreeName(taken, 'new.pdf', true)).toBe('new.pdf');
    expect(taken.has('report (3).pdf')).toBe(true);
  });

  it('parses only well-formed virtual ids', () => {
    expect(parseVirtualId('case:clx1234567890abcdefghij')).toEqual({ kind: 'case', caseId: 'clx1234567890abcdefghij' });
    expect(parseVirtualId('case:clx1234567890abcdefghij:EMBASSY')).toEqual({ kind: 'stage', caseId: 'clx1234567890abcdefghij', stage: 'EMBASSY' });
    expect(parseVirtualId('doc:clx1234567890abcdefghij')).toEqual({ kind: 'doc', docId: 'clx1234567890abcdefghij' });
    for (const bad of ['case:', 'case:../x', 'case:abc:EMBASSY', 'case:clx1234567890abcdefghij:FOO', 'doc:CLX1234567890ABCDEFGHIJ', 'doc:x/y', 'file:abc']) {
      expect(parseVirtualId(bad), bad).toBeNull();
    }
  });
});
