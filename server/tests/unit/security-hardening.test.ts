import { describe, expect, it } from 'vitest';
import { csvSafe, csvUnsafe } from '../../src/lib/csvSafe.js';
import { contactsToCsv, csvToRecords, type ContactOut } from '../../src/lib/workspace/contacts.js';
import { buildCsv } from '../../src/lib/reports/export.js';
import { renderHead, type SeoData } from '../../src/lib/seo.js';
import { renderBody } from '../../src/lib/seoBody.js';
import { TEMPLATE_DELIMITER_RE, templateSafe } from '../../src/routes/seo.js';

describe('CSV formula injection guard', () => {
  it('neutralises formula cells, keeps numbers and phone numbers', () => {
    for (const evil of ['=HYPERLINK("http://x","y")', '+cmd|" /C calc"!A0', '-2+3+cmd|x', '@SUM(A1)', '\t=1', '\r=1']) expect(csvSafe(evil)).toBe(`'${evil}`);
    for (const plain of ['Leyla', '1372,10', '-12,50', '+49 30 1234', '+994 (50) 123-45-67', '-', '', 'a=b']) expect(csvSafe(plain)).toBe(plain);
    expect(csvUnsafe(csvSafe('=1+1'))).toBe('=1+1');
    expect(csvUnsafe("'quoted")).toBe("'quoted");
  });

  it('contacts export is guarded and the import restores the original value', () => {
    const base = {
      id: '1', lastName: null, email: null, extraEmails: [], phone: '+49 30 1234', company: null, position: null, tags: [], address: null, notes: null,
      companyId: null, shared: true, source: 'MANUAL' as const, lastContactAt: null, userId: null, createdById: null, createdAt: new Date(), updatedAt: new Date(),
      canEdit: true, canDelete: true,
    };
    const csv = contactsToCsv([{ ...base, firstName: '=HYPERLINK("http://evil","x")' } as unknown as ContactOut]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain(',+49 30 1234,');
    expect(csvToRecords(csv).records[0]).toMatchObject({ firstName: '=HYPERLINK("http://evil","x")', phone: '+49 30 1234' });
  });

  it('report builder CSV is guarded', () => {
    const out = buildCsv(
      { columns: [{ key: 'name', label: { az: 'Ad', de: 'Name', en: 'Name', ru: 'Имя' }, type: 'string' }], rows: [{ name: '=cmd|x' }, { name: '-12.50' }], totals: null, truncated: false, records: 2 } as never,
      'de',
    ).toString('utf8');
    expect(out).toContain("'=cmd|x");
    expect(out).toContain('\r\n-12.50');
  });
});

describe('Caddy template include guard', () => {
  it('drops fragments that contain a template delimiter, passes everything else', () => {
    expect(templateSafe('<meta data-seo name="x" content="y">')).toBe('<meta data-seo name="x" content="y">');
    expect(templateSafe('<p><!--tv: env "JWT_SECRET" :tv--></p>')).toBe('');
    expect(templateSafe('x :tv--> y')).toBe('');
  });

  it('hostile CMS text never yields a delimiter in the rendered head / body', () => {
    const evil = '<!--tv: include "/etc/passwd" :tv--> {{ .Req }} </script>';
    const data: SeoData = {
      visas: [{ slug: 'x', title: { az: evil, en: evil }, summary: { az: evil, en: evil }, image: '', updatedAt: new Date() }],
      services: [],
      posts: [],
      faqs: [{ question: { az: evil }, answer: { az: evil } }],
      jobs: [],
      settings: {},
      rating: null,
    } as unknown as SeoData;
    for (const path of ['/visas/x', '/visas', '/faq', `/visas/${encodeURIComponent(evil)}`]) {
      expect(renderHead(path, null, data)).not.toMatch(TEMPLATE_DELIMITER_RE);
      expect(renderBody(path, data)).not.toMatch(TEMPLATE_DELIMITER_RE);
    }
  });
});
