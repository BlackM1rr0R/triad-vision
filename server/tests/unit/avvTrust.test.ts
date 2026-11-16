import { describe, expect, it } from 'vitest';
import { avvCompanySchema, buildAvvText } from '../../src/lib/avv/template.js';
import { MEASURES } from '../../src/lib/trust/measures.js';
import { AVV_TEMPLATE_VERSION, avvApproved } from '../../src/lib/trust/settings.js';
import { subprocessorList, type SubState } from '../../src/lib/trust/subprocessors.js';

const company = avvCompanySchema.parse({
  legalName: 'Muster Logistik GmbH',
  street: 'Musterstraße 1',
  postalCode: '28195',
  city: 'Bremen',
  representative: 'Max Mustermann',
  privacyContactName: 'Erika Musterfrau',
  privacyContactEmail: 'Datenschutz@Example.com',
  signatoryName: 'Max Mustermann',
});
const base: SubState = { dataLocation: '', whatsapp: false, sms: null, calls: 'none', ai: false, smtpHost: 'mail' };

const text = (dataLocation = '', subs = subprocessorList(base)) =>
  buildAvvText({
    controller: company,
    processor: { name: 'Triad Vision', address: '', representative: '', email: '', dpo: '' },
    subprocessors: subs,
    dataLocation,
    backupLocation: '',
    retentionMonths: 12,
    version: AVV_TEMPLATE_VERSION,
    date: new Date('2026-11-16T00:00:00Z'),
  });

describe('AVV template (Art. 28 DSGVO)', () => {
  it('covers the mandatory contents of Art. 28 Abs. 3 lit. a–h and the annexes', () => {
    const t = text();
    for (const lit of ['a', 'b', 'c', 'e', 'f', 'g', 'h']) expect(t).toContain(`Art. 28 Abs. 3 lit. ${lit} DSGVO`);
    expect(t).toContain('Art. 28 Abs. 2 DSGVO'); // sub-processor approval / objection (lit. d)
    expect(t).toContain('Art. 28 Abs. 4 DSGVO');
    for (const annex of ['Anlage 1', 'Anlage 2', 'Anlage 3', 'Anlage 4']) expect(t).toContain(`## ${annex}`);
    expect(t).toContain('Reisepass');
    expect(t).toContain('12 Monate nach Abschluss');
    expect(t).toContain('datenschutz@example.com');
  });

  it('does not claim what the code cannot verify: placeholders until the owner fills them', () => {
    const t = text();
    expect(t).toContain('[Standort des Rechenzentrums – vom Auftragnehmer zu ergänzen]');
    expect(t).toContain('Festplattenverschlüsselung');
    expect(t).not.toMatch(/ISO 27001|zertifiziert nach/);
    expect(text('Frankfurt am Main, Deutschland')).toContain('Standort: Frankfurt am Main, Deutschland');
  });

  it('lists every implemented measure in the TOMs annex', () => {
    const t = text();
    for (const m of MEASURES) expect(t).toContain(m.de);
  });

  it('rejects incomplete company data', () => {
    expect(avvCompanySchema.safeParse({ legalName: 'X' }).success).toBe(false);
  });
});

describe('sub-processors (one source for AVV + Trust Center)', () => {
  it('lists only what is configured, optional ones marked', () => {
    expect(subprocessorList(base).map((s) => s.key)).toEqual(['hosting', 'cloudflare', 'expo']);
    expect(subprocessorList(base).find((s) => s.key === 'expo')?.optional).toBe(true);
    const all = subprocessorList({ dataLocation: 'Frankfurt', whatsapp: true, sms: 'twilio', calls: 'sipgate', ai: true, smtpHost: 'smtp.relay.example' });
    expect(all.map((s) => s.key)).toEqual(['hosting', 'cloudflare', 'expo', 'whatsapp', 'sms', 'calls', 'openrouter', 'smtp']);
    expect(all.find((s) => s.key === 'openrouter')?.optional).toBe(true);
    expect(all[0].locationDe).toContain('Frankfurt');
    expect(subprocessorList(base)[0].locationDe).toContain('[vom Auftragnehmer zu bestätigen]');
    for (const host of ['', 'localhost', 'mail', 'stalwart']) expect(subprocessorList({ ...base, smtpHost: host }).some((s) => s.key === 'smtp')).toBe(false);
  });
});

describe('AVV approval', () => {
  it('is off by default and bound to the template version', () => {
    expect(avvApproved({ approved: false, approvedVersion: null, approvedAt: null, approvedById: null })).toBe(false);
    expect(avvApproved({ approved: true, approvedVersion: AVV_TEMPLATE_VERSION, approvedAt: 'x', approvedById: 'u' })).toBe(true);
    expect(avvApproved({ approved: true, approvedVersion: 'AVV-2020-01-v0', approvedAt: 'x', approvedById: 'u' })).toBe(false);
  });
});
