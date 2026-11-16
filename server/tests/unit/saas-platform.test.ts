import { describe, expect, it } from 'vitest';
import { demoLocale, demoRequestSchema, demoSummary, sellsPlatform, staffLocaleOf } from '../../src/lib/saas/demoRequest.js';
import { canMove, customerStatusFor, isStage, stageCounts, leadPatchSchema } from '../../src/lib/saas/pipeline.js';
import {
  REQUIRED_STEPS,
  STEP_KEYS,
  StepError,
  applyStep,
  missingBeforeGoLive,
  nextOpenStep,
  normalizeSteps,
  onboardingApplicable,
  progressOf,
  senderOnDomain,
} from '../../src/lib/saas/onboarding.js';
import type { LicenseState } from '../../src/lib/license/index.js';

const license = (role: 'owner' | 'customer'): LicenseState => ({ role, status: role === 'owner' ? 'owner' : 'valid', mode: 'normal', domain: 'x.example', modules: null, staffLimit: null, checkedAt: '2026-11-16T00:00:00.000Z' });

const valid = { agencyName: 'Acme Visa', contactName: 'Anna Muster', email: 'Anna@Acme.example', consent: true };

describe('demo request input', () => {
  it('requires consent === true and the agency / contact / e-mail', () => {
    expect(demoRequestSchema.safeParse(valid).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, consent: 'true' }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, agencyName: 'A' }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
  });

  it('normalises: lower-case e-mail, de-duplicated interests, empty optional fields dropped, bad team size ignored', () => {
    const r = demoRequestSchema.parse({ ...valid, interests: ['crm', 'crm', 'seo'], phone: '  ', teamSize: '1000+' });
    expect(r.email).toBe('anna@acme.example');
    expect(r.interests).toEqual(['crm', 'seo']);
    expect(r.phone).toBeUndefined();
    expect(r.teamSize).toBeUndefined();
    expect(demoRequestSchema.safeParse({ ...valid, interests: ['payments'] }).success).toBe(false);
  });

  it('summary lists the given fields only; locales fall back to English and map to staff languages', () => {
    const lines = demoSummary(demoRequestSchema.parse({ ...valid, country: 'Georgia', teamSize: '6-20', interests: ['whiteLabel'] }), 'de');
    expect(lines[0]).toContain('SaaS');
    expect(lines).toContain('Agentlik: Acme Visa');
    expect(lines).toContain('Ölkə: Georgia');
    expect(lines.some((l) => l.startsWith('Telefon'))).toBe(false);
    expect(lines.find((l) => l.startsWith('Maraq'))).toContain('white-label');
    expect(demoLocale('xx')).toBe('en');
    expect(demoLocale('uk')).toBe('uk');
    expect(staffLocaleOf('tr')).toBe('az');
    expect(staffLocaleOf('uk')).toBe('ru');
  });

  it('only the owner instance sells the platform', () => {
    expect(sellsPlatform(license('owner'))).toBe(true);
    expect(sellsPlatform(license('customer'))).toBe(false);
  });
});

describe('SaaS pipeline', () => {
  it('moves one stage at a time, and to / from lost', () => {
    expect(canMove('demo_requested', 'demo_done')).toBe(true);
    expect(canMove('demo_done', 'demo_requested')).toBe(true);
    expect(canMove('demo_requested', 'trial')).toBe(false);
    expect(canMove('demo_requested', 'customer')).toBe(false);
    expect(canMove('trial', 'customer')).toBe(true);
    expect(canMove('customer', 'lost')).toBe(true);
    expect(canMove('lost', 'demo_done')).toBe(true);
    expect(canMove('trial', 'trial')).toBe(false);
  });

  it('maps trial / customer to the white-label customer status', () => {
    expect(customerStatusFor('trial')).toBe('trial');
    expect(customerStatusFor('customer')).toBe('active');
    expect(customerStatusFor('demo_done')).toBeNull();
    expect(customerStatusFor('lost')).toBeNull();
  });

  it('counts per stage, ignoring unknown stages; patch schema is strict', () => {
    expect(stageCounts([{ stage: 'trial' }, { stage: 'trial' }, { stage: 'x' }])).toEqual({ demo_requested: 0, demo_done: 0, trial: 2, customer: 0, lost: 0 });
    expect(isStage('customer')).toBe(true);
    expect(leadPatchSchema.safeParse({ stage: 'won' }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ customerId: 'x' }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ demoAt: null, staffNotes: 'ok' }).success).toBe(true);
  });
});

describe('onboarding wizard state', () => {
  it('normalises stored JSON: every step present, junk dropped', () => {
    const s = normalizeSteps({ brand: { status: 'done', at: '2026-11-16T10:00:00.000Z' }, modules: { status: 'weird' }, bogus: { status: 'done' } });
    expect(Object.keys(s)).toEqual([...STEP_KEYS]);
    expect(s.brand.status).toBe('done');
    expect(s.modules.status).toBe('open');
    expect(normalizeSteps(null).golive.status).toBe('open');
    expect(normalizeSteps([1, 2]).brand.status).toBe('open');
  });

  it('applies steps: done / skipped / reopened; required steps cannot be skipped', () => {
    let s = normalizeSteps({});
    s = applyStep(s, 'brand', { status: 'done', data: { name: 'Acme' } }, 'u1', new Date('2026-11-16T10:00:00Z'));
    expect(s.brand).toEqual({ status: 'done', at: '2026-11-16T10:00:00.000Z', by: 'u1', data: { name: 'Acme' } });
    s = applyStep(s, 'modules', { status: 'skipped' }, 'u1');
    expect(s.modules.status).toBe('skipped');
    expect(() => applyStep(s, 'email', { status: 'skipped' }, 'u1')).toThrow(StepError);
    for (const k of REQUIRED_STEPS) expect(() => applyStep(s, k, { status: 'skipped' }, 'u1')).toThrow();
    s = applyStep(s, 'brand', { status: 'open' }, 'u1');
    expect(s.brand.status).toBe('open');
    expect(s.brand.data).toEqual({ name: 'Acme' }); // data kept when reopened
  });

  it('progress, next open step and go-live gate', () => {
    let s = normalizeSteps({});
    expect(nextOpenStep(s)).toBe('brand');
    expect(progressOf(s)).toMatchObject({ finished: 0, total: STEP_KEYS.length, percent: 0, next: 'brand' });
    for (const k of STEP_KEYS.filter((x) => x !== 'golive')) s = applyStep(s, k, { status: REQUIRED_STEPS.includes(k) ? 'done' : 'skipped' }, 'u');
    expect(missingBeforeGoLive(s)).toEqual([]);
    expect(nextOpenStep(s)).toBe('golive');
    expect(missingBeforeGoLive(applyStep(s, 'staff', { status: 'open' }, 'u'))).toEqual(['staff']);
  });

  it('is pushed on customer instances only', () => {
    expect(onboardingApplicable(license('customer'))).toBe(true);
    expect(onboardingApplicable(license('owner'))).toBe(false);
  });

  it('checks the sender address against the instance domain', () => {
    expect(senderOnDomain('Acme <no-reply@acme-visa.de>', 'acme-visa.de')).toBe(true);
    expect(senderOnDomain('no-reply@mail.acme-visa.de', 'www.acme-visa.de')).toBe(true);
    expect(senderOnDomain('Triad Vision <no-reply@triad-vision.de>', 'acme-visa.de')).toBe(false);
    expect(senderOnDomain('broken', 'acme-visa.de')).toBe(false);
  });
});
