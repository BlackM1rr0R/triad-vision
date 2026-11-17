import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ATTACHMENTS, ATTACHMENT_DE, disclosureSchema, stageIncludes } from '../../src/lib/rentalDisclosure/schema.js';
import { disclosureFilename, renderDisclosurePdf } from '../../src/lib/rentalDisclosure/pdf.js';
import { REFERENCE_GROSS } from '../../src/lib/publicAi/pathFinder.js';
import { cvPdfText as pdfText } from './cvPdfText';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientModule = async <T>(rel: string) => (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src', rel)).href)) as T;

describe('Mieterselbstauskunft (DSK-permissible fields only)', () => {
  it('accepts the client form defaults and keeps the attachment keys in step', async () => {
    const client = await clientModule<{ DEFAULT_DISCLOSURE: Record<string, unknown>; ATTACHMENT_KEYS: readonly string[] }>('lib/rentalDisclosure.ts');
    const d = disclosureSchema.parse({ ...client.DEFAULT_DISCLOSURE, name: 'Aliyev, Elvin' });
    expect(d.stage).toBe('B');
    expect([...client.ATTACHMENT_KEYS]).toEqual([...ATTACHMENTS]);
    for (const a of ATTACHMENTS) expect(ATTACHMENT_DE[a]).toBeTruthy();
  });

  it('rejects impermissible fields (nationality, religion, birth date, marital status) and a missing name', () => {
    for (const extra of [{ nationality: 'AZ' }, { religion: 'x' }, { birthDate: '1990-01-01' }, { maritalStatus: 'married' }, { previousLandlord: 'x' }]) {
      expect(disclosureSchema.safeParse({ name: 'A', ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    expect(disclosureSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(disclosureSchema.safeParse({ name: 'A', adults: 0 }).success).toBe(false);
  });

  it('orders the stages A < B < C', () => {
    expect(stageIncludes('A', 'B')).toBe(false);
    expect(stageIncludes('B', 'B')).toBe(true);
    expect(stageIncludes('C', 'A')).toBe(true);
  });

  it('renders a German A4 PDF for every stage, with long and special-character input', async () => {
    for (const stage of ['A', 'B', 'C'] as const) {
      const d = disclosureSchema.parse({
        stage,
        name: 'Məmmədov, Ülvi',
        address: 'Hauptstraße 1, 60311 Frankfurt am Main',
        email: 'ulvi@example.com',
        employer: 'Spedition Müller GmbH',
        occupation: 'Berufskraftfahrer',
        net: 2150,
        socialHousing: true,
        wbs: 'yes',
        petsAsked: true,
        pets: 'eine Katze',
        insolvency: 'no',
        eviction: 'no',
        terminated: 'yes',
        terminatedWhat: 'x'.repeat(600),
        reasons: 'Zeile 1\nZeile 2\twith tab',
        attachments: ['payslips', 'bonityCheck'],
        place: 'Frankfurt',
        date: '17.11.2026',
      });
      const bytes = await renderDisclosurePdf(d);
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
      const doc = await PDFDocument.load(bytes);
      expect(doc.getTitle()).toBe('Mieterselbstauskunft');
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  it('prints only the stages up to the chosen one, in German', async () => {
    const base = { name: 'Aliyev, Elvin', employer: 'Geheim GmbH', net: 2100, arrearsTwoMonths: 'no' as const };
    const a = await pdfText(Buffer.from(await renderDisclosurePdf(disclosureSchema.parse({ ...base, stage: 'A' }))));
    expect(a).toContain('Besichtigungstermin');
    expect(a).toContain('Aliyev, Elvin');
    expect(a).not.toContain('Geheim GmbH');
    expect(a).not.toContain('Nettoeinkommen');
    const b = await pdfText(Buffer.from(await renderDisclosurePdf(disclosureSchema.parse({ ...base, stage: 'B' }))));
    expect(b).toContain('Geheim GmbH');
    expect(b).toContain('2.100 €');
    expect(b).not.toContain('Mietrückstand');
    const c = await pdfText(Buffer.from(await renderDisclosurePdf(disclosureSchema.parse({ ...base, stage: 'C' }))));
    expect(c).toContain('Mietrückstand');
    expect(c).toContain('☒ Nein');
  }, 30_000);

  it('builds a safe file name', () => {
    expect(disclosureFilename({ name: 'Aliyev, Elvin' })).toBe('Mieterselbstauskunft-Aliyev-Elvin.pdf');
    expect(disclosureFilename({ name: '../../etc' })).toBe('Mieterselbstauskunft-etc.pdf');
  });
});

describe('5-year time machine data', () => {
  it('mirrors the path-finder reference salaries (REFERENCE_GROSS)', async () => {
    const client = await clientModule<{ FY_REFERENCE_GROSS: Record<string, readonly [number, number]>; FY_PROFESSIONS: readonly string[] }>('lib/fiveYears/calc.ts');
    for (const p of client.FY_PROFESSIONS) expect(client.FY_REFERENCE_GROSS[p], p).toEqual(REFERENCE_GROSS[p as keyof typeof REFERENCE_GROSS]);
  });
});
