import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const docs = await import('../../src/lib/docs.js');
const { config } = await import('../../src/config.js');

describe('slugify', () => {
  it.each([
    ['Nəriman', 'neriman'],
    ['Nəriman Abdullayev', 'neriman-abdullayev'],
    ['Aynur Qəhrəmanova', 'aynur-qehremanova'],
    ['Müller, Jürgen', 'muller-jurgen'],
    ['Иван Петров', 'ivan-petrov'],
    ['  Ad   Soyad  ', 'ad-soyad'],
    ['İlqar Şükürov', 'ilqar-sukurov'],
    ['!!!', 'user'],
    ['a'.repeat(80), 'a'.repeat(40)],
  ])('%s → %s', (input, slug) => {
    expect(docs.slugify(input)).toBe(slug);
  });
});

describe('checkSegment / normalizePath', () => {
  it('accepts ordinary names including unicode and spaces inside', () => {
    expect(docs.checkSegment('Hesabatlar 2026', 'DIR')).toBe('Hesabatlar 2026');
    expect(docs.checkSegment('Büdcə Q1.xlsx', 'FILE')).toBe('Büdcə Q1.xlsx');
  });

  it.each(['', '.', '..', '.hidden', 'name.', ' lead', 'trail ', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'CON', 'lpt1.txt', 'x\u0000y', 'a'.repeat(151)])(
    'rejects %j',
    (name) => {
      expect(() => docs.checkSegment(name, 'DIR')).toThrow();
    },
  );

  it('normalises and validates relative paths', () => {
    expect(docs.normalizePath(undefined)).toBe('');
    expect(docs.normalizePath('')).toBe('');
    expect(docs.normalizePath('/a//b/')).toBe('a/b');
    expect(docs.normalizePath('a\\b')).toBe('a/b');
    expect(() => docs.normalizePath('../x')).toThrow();
    expect(() => docs.normalizePath('a/../b')).toThrow();
    expect(() => docs.normalizePath(Array.from({ length: 11 }, (_, i) => `d${i}`).join('/'))).toThrow();
  });
});

describe('safeFileName', () => {
  it('strips directories and dangerous characters but keeps the extension', () => {
    expect(docs.safeFileName('../../etc/passwd')).toBe('passwd');
    expect(docs.safeFileName('C:\\Users\\x\\report:final?.pdf')).toBe('report_final_.pdf');
    expect(docs.safeFileName('...hidden.txt')).toBe('hidden.txt');
    expect(docs.safeFileName('CON.txt')).toBe('_CON.txt');
    expect(docs.safeFileName('')).toBe('file');
    const long = docs.safeFileName(`${'x'.repeat(200)}.docx`);
    expect(long.length).toBe(150);
    expect(long.endsWith('.docx')).toBe(true);
  });
});

describe('absPath', () => {
  const folder = { slug: 'ali-veli' };
  const root = path.join(config.docs.dir, 'ali-veli');

  it('stays inside the workspace', () => {
    expect(docs.absPath(folder, '')).toBe(root);
    expect(docs.absPath(folder, 'a/b', 'c.pdf')).toBe(path.join(root, 'a', 'b', 'c.pdf'));
  });

  it('refuses anything that resolves outside', () => {
    expect(() => docs.absPath(folder, '..')).toThrow();
    expect(() => docs.absPath(folder, 'a', '../../x')).toThrow();
    expect(() => docs.absPath(folder, '', '../other-user/secret.pdf')).toThrow();
  });
});

describe('access levels', () => {
  it('OWNER ≥ EDIT ≥ DOWNLOAD ≥ VIEW; null never allows', () => {
    expect(docs.allows('OWNER', 'EDIT')).toBe(true);
    expect(docs.allows('EDIT', 'EDIT')).toBe(true);
    expect(docs.allows('DOWNLOAD', 'EDIT')).toBe(false);
    expect(docs.allows('DOWNLOAD', 'DOWNLOAD')).toBe(true);
    expect(docs.allows('VIEW', 'DOWNLOAD')).toBe(false);
    expect(docs.allows('VIEW', 'VIEW')).toBe(true);
    expect(docs.allows(null, 'VIEW')).toBe(false);
  });
});
