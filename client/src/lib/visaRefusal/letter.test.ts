import { describe, expect, it } from 'vitest';
import { buildLetter, deDate, escapeHtml, REASONS, REASON_DE, type LetterInput } from './letter';

const base: LetterInput = {
  name: 'Ramil Aliyev',
  birthDate: '1992-03-04',
  passportNo: 'C01234567',
  address: 'Nizami küç. 1, Bakı',
  contact: '+994 50 000 00 00',
  purpose: 'skilled',
  previousDate: '2026-05-10',
  refusalDate: '2026-07-01',
  reference: 'RK-123',
  fixes: { baApproval: 'Die Vorabzustimmung der BA liegt jetzt vor.', documents: '  Fehlende Arbeitszeugnisse   ergänzt. ' },
  enclosures: '- Vorabzustimmung der BA\n\n• Arbeitszeugnisse',
  today: '2026-11-16',
};

describe('visa refusal cover letter', () => {
  it('writes a German letter for a new application with the corrected reasons in a fixed order', () => {
    const text = buildLetter(base);
    expect(text).toContain('Erneuter Antrag auf ein nationales Visum zum Zweck der Beschäftigung als Fachkraft');
    expect(text).toContain('Ablehnungsbescheid vom 01.07.2026, Aktenzeichen RK-123');
    expect(text).toContain('geboren am 04.03.1992');
    expect(text).toContain('Baku, 16.11.2026');
    const docs = text.indexOf(REASON_DE.documents);
    const ba = text.indexOf(REASON_DE.baApproval);
    expect(docs).toBeGreaterThan(0);
    expect(ba).toBeGreaterThan(docs);
    expect(text).toContain('– Unvollständige oder fehlerhafte Unterlagen: Fehlende Arbeitszeugnisse ergänzt.');
    expect(text).toContain('– Vorabzustimmung der BA\n– Arbeitszeugnisse');
    expect(text).not.toMatch(/Remonstration/i);
  });

  it('leaves visible blanks for missing fields and omits empty optional lines', () => {
    const text = buildLetter({ ...base, name: '', address: '', contact: '', reference: '', fixes: {}, enclosures: '' });
    expect(text.startsWith('________________')).toBe(true);
    expect(text).not.toContain('Aktenzeichen');
    expect(text).toContain('Anlagen:\n– ________________');
  });

  it('has a German heading for every reason and formats dates', () => {
    for (const r of REASONS) expect(REASON_DE[r].length).toBeGreaterThan(5);
    expect(deDate('2026-01-02')).toBe('02.01.2026');
    expect(deDate(' 3.4.2026 ')).toBe('3.4.2026');
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
