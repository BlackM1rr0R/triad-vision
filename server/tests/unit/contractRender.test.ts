import { describe, expect, it } from 'vitest';
import { BLANK, INPUT_KEYS, PLACEHOLDERS, renderContract, renderTemplate, stripComments, usedKeys } from '../../src/lib/contracts/render.js';
import { fmtContractDate } from '../../src/lib/contracts/values.js';
import { DEFAULT_CONTRACT_TEMPLATES } from '../../prisma/seed/contractTemplates.js';

describe('contract template renderer', () => {
  it('fills placeholders, tolerating spaces inside the braces', () => {
    const r = renderTemplate('Zwischen {{company.name}} und {{ client.fullName }}.', { 'company.name': 'Müller GmbH', 'client.fullName': 'Əli Məmmədov' });
    expect(r.text).toBe('Zwischen Müller GmbH und Əli Məmmədov.');
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it('renders missing values as blanks and lists each missing key once, in order', () => {
    const r = renderTemplate('{{salary}} / {{startDate}} / {{salary}} / {{client.email}}', { salary: '  ', 'client.email': 'a@b.c' });
    expect(r.text).toBe(`${BLANK} / ${BLANK} / ${BLANK} / a@b.c`);
    expect(r.missing).toEqual(['salary', 'startDate']);
  });

  it('reports unknown keys separately and never fills them', () => {
    const r = renderTemplate('A {{client.secret}} B {{nope}}', { 'client.secret': 'x', nope: 'y' });
    expect(r.text).toBe(`A ${BLANK} B ${BLANK}`);
    expect(r.unknown).toEqual(['client.secret', 'nope']);
    expect(r.missing).toEqual([]);
  });

  it('returns segments that rebuild the text (for highlighting)', () => {
    const r = renderTemplate('Hallo {{client.firstName}}, Beginn {{startDate}}!', { 'client.firstName': 'Aynur' });
    expect(r.segments).toEqual([
      { text: 'Hallo ' },
      { key: 'client.firstName', value: 'Aynur' },
      { text: ', Beginn ' },
      { key: 'startDate', value: null },
      { text: '!' },
    ]);
    expect(r.segments.map((s) => ('text' in s ? s.text : (s.value ?? BLANK))).join('')).toBe(r.text);
  });

  it('numbers are rendered as text; text without placeholders is unchanged', () => {
    expect(renderTemplate('{{probationMonths}} Monate', { probationMonths: 6 }).text).toBe('6 Monate');
    expect(renderTemplate('{ not } {{ }} text', {}).text).toBe('{ not } {{ }} text');
  });

  it('strips // editor notes before rendering', () => {
    const body = '// VORLAGE {{salary}}\n// keine Rechtsberatung\n# Titel\n  // eingerückt\nText {{salary}}';
    expect(stripComments(body)).toBe('# Titel\nText {{salary}}');
    const r = renderContract(body, {});
    expect(r.text).toBe(`# Titel\nText ${BLANK}`);
    expect(r.missing).toEqual(['salary']);
  });

  it('lists used keys and documents the input keys', () => {
    expect(usedKeys('{{a.b}} {{ c }} {{a.b}}')).toEqual(['a.b', 'c']);
    expect(INPUT_KEYS).toEqual(['startDate', 'salary', 'workingHours', 'probationMonths']);
    expect(PLACEHOLDERS.map((p) => p.key)).toEqual(expect.arrayContaining(['client.passportNumber', 'company.contactPerson', 'vacancy.salaryMax', 'triad.address', 'today']));
  });

  it('seed templates only use documented placeholders and carry the review note', () => {
    expect(DEFAULT_CONTRACT_TEMPLATES.map((t) => t.kind)).toEqual(['WORK', 'AUSBILDUNG', 'SERVICE']);
    for (const t of DEFAULT_CONTRACT_TEMPLATES) {
      expect(renderContract(t.body, {}).unknown).toEqual([]);
      expect(t.body).toMatch(/^\/\/ VORLAGE/);
      expect(t.body).toContain('keine Rechtsberatung');
    }
  });

  it('formats dates per template language (UTC)', () => {
    expect(fmtContractDate(new Date('2026-03-05T00:00:00Z'), 'de')).toBe('05.03.2026');
    expect(fmtContractDate('2026-03-05T00:00:00Z', 'en')).toBe('05/03/2026');
    expect(fmtContractDate(null, 'de')).toBe('');
    expect(fmtContractDate('garbage', 'de')).toBe('');
  });
});
