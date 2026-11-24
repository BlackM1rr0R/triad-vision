import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { FIELD_DEFS, type VidexField } from '../../src/lib/ai/features/caseAi/videx.js';
import { missingRequired, renderVidexSheet, videxSheetFileName, videxSheetRows } from '../../src/lib/docTemplates/videxSheet.js';
import { SHEET_LANGS, SHEET_TEXT, asSheetLang, hintLang } from '../../src/lib/docTemplates/texts.js';
import { kindAvailable } from '../../src/lib/docTemplates/index.js';

const fields = (values: Record<string, string>): VidexField[] =>
  FIELD_DEFS.map((d) => ({ key: d.key, section: d.section, label: d.label, value: values[d.key] ?? '', source: values[d.key] ? 'profile' : null, confidence: null, documentId: null, required: d.required, askClient: !!d.askClient }));

describe('VIDEX preparation sheet rows', () => {
  const f = fields({ surname: 'MAMMADOVA', givenNames: 'AYSEL', employerName: 'Muster GmbH', employerAddress: 'Berlin' });

  it('German label + hint in the client language, missing marked', () => {
    const rows = videxSheetRows(f, { lang: 'az', employerRevealed: true });
    const surname = rows.find((r) => r.key === 'surname')!;
    expect(surname).toMatchObject({ labelDe: 'Familienname', hint: 'Soyad', value: 'MAMMADOVA', missing: false });
    expect(rows.find((r) => r.key === 'birthDate')).toMatchObject({ missing: true, required: true });
    expect(missingRequired(rows)).toContain('birthDate');
    expect(missingRequired(rows)).not.toContain('surname');
  });

  it('employer data stays hidden from the client until it is revealed (not counted as missing)', () => {
    const rows = videxSheetRows(f, { lang: 'az', employerRevealed: false });
    const employer = rows.filter((r) => r.section === 'employer');
    expect(employer.every((r) => r.value === '' && r.employerHidden && !r.missing)).toBe(true);
    expect(missingRequired(rows)).not.toContain('employerName');
    expect(videxSheetRows(f, { lang: 'az', employerRevealed: true }).find((r) => r.key === 'employerName')?.value).toBe('Muster GmbH');
  });

  it('tr / uk read the English hint; unknown languages fall back to az', () => {
    expect(hintLang('tr')).toBe('en');
    expect(hintLang('uk')).toBe('en');
    expect(videxSheetRows(f, { lang: 'uk', employerRevealed: true }).find((r) => r.key === 'surname')?.hint).toBe('Surname');
    expect(asSheetLang('xx')).toBe('az');
    expect(asSheetLang('de')).toBe('de');
  });

  it('every language says we do not submit and the embassy decides', () => {
    for (const l of SHEET_LANGS) expect(SHEET_TEXT[l].disclaimer).toMatch(/videx\.diplo\.de/);
  });

  it('renders a PDF (Azerbaijani letters via the embedded font)', async () => {
    const rows = videxSheetRows(fields({ surname: 'MƏMMƏDOVA', street: 'Şəki küçəsi 5' }), { lang: 'az', employerRevealed: false });
    const pdf = await renderVidexSheet(rows, { lang: 'az', caseNumber: 'TV-1', clientName: 'Aysel Məmmədova', date: new Date('2026-11-24T00:00:00Z') });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(videxSheetFileName('TV 1/2', 'de')).toBe('VIDEX-hazirliq-TV-1-2-de.pdf');
  });
});

describe('template availability', () => {
  it('Lebenslauf / Anschreiben only on the account holder’s own case', () => {
    expect(kindAvailable({ familyMember: true }, 'videx')).toBe(true);
    expect(kindAvailable({ familyMember: true }, 'lebenslauf')).toBe(false);
    expect(kindAvailable({ familyMember: false }, 'anschreiben')).toBe(true);
  });
});
