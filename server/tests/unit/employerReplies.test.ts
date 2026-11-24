import { describe, expect, it } from 'vitest';
import { classifyReply, matchByDomain, referencedIds, stripQuoted, type ReplyCandidate } from '../../src/lib/germanyJobs/replyRules.js';
import { adjustHealth, DEFAULT_HEALTH, effectiveDailyLimit, readHealth } from '../../src/lib/deliverability/health.js';

describe('employer reply classification (keyword rules, no AI)', () => {
  it('interview invitations', () => {
    expect(classifyReply('Einladung zum Vorstellungsgespräch', 'Wir möchten Sie gerne kennenlernen. Passt Ihnen ein Termin am Montag?')).toMatchObject({ classification: 'INTERVIEW', suggestedStatus: 'INTERVIEW' });
    expect(classifyReply('Your application', 'We would like to invite you to an interview next week.')).toMatchObject({ classification: 'INTERVIEW', suggestedStatus: 'INTERVIEW' });
  });

  it('rejections, also when they mention a Termin', () => {
    expect(classifyReply('Ihre Bewerbung', 'leider müssen wir Ihnen mitteilen, dass wir Ihre Bewerbung nicht berücksichtigen können.')).toMatchObject({ classification: 'REJECTION', suggestedStatus: 'REJECTED' });
    expect(classifyReply('Absage', 'Der Termin für die Stelle ist bereits vergeben.')).toMatchObject({ classification: 'REJECTION' });
    expect(classifyReply('Re: Application', 'Unfortunately we have decided not to proceed with your application.')).toMatchObject({ classification: 'REJECTION', suggestedStatus: 'REJECTED' });
  });

  it('requests for documents have no status suggestion', () => {
    expect(classifyReply('Rückfrage', 'Bitte reichen Sie die Zeugnisse und Nachweise nach (nachreichen bis Freitag).')).toMatchObject({ classification: 'DOCUMENTS', suggestedStatus: null });
  });

  it('other mail and quoted history', () => {
    expect(classifyReply('Eingangsbestätigung', 'Vielen Dank für Ihre Bewerbung. Wir melden uns.')).toMatchObject({ classification: 'OTHER', suggestedStatus: null });
    // Our own application quoted below the answer does not count.
    const text = 'Danke, wir melden uns.\n\nAm 20.11.2026 um 10:00 schrieb Triad Vision <no-reply@triad-vision.de>:\n> Einladung Vorstellungsgespräch Zeugnisse Unterlagen nachreichen';
    expect(stripQuoted(text)).toBe('Danke, wir melden uns.\n');
    expect(classifyReply('AW: Bewerbung', text).classification).toBe('OTHER');
  });
});

describe('employer reply matching', () => {
  const candidates: ReplyCandidate[] = [
    { id: 'a1', employerEmail: 'jobs@spedition-muster.de', listingTitle: 'Berufskraftfahrer (m/w/d) CE', contactName: 'Elvin Məmmədov' },
    { id: 'a2', employerEmail: 'jobs@spedition-muster.de', listingTitle: 'Lagerhelfer', contactName: 'Nigar Aliyeva' },
    { id: 'a3', employerEmail: 'chef@gmail.com', listingTitle: 'Koch', contactName: 'Rauf Həsənov' },
  ];

  it('In-Reply-To / References ids', () => {
    expect(referencedIds('<xapp.A.1@triad-vision.de>', '<root@x.de> <xapp.A.1@triad-vision.de>')).toEqual(['xapp.a.1@triad-vision.de', 'root@x.de']);
    expect(referencedIds(null, null)).toEqual([]);
  });

  it('same company domain + listing title or candidate name', () => {
    expect(matchByDomain({ fromAddr: 'personal@hr.spedition-muster.de', subject: 'Ihre Bewerbung als Berufskraftfahrer (m/w/d) CE', text: '' }, candidates)).toBe('a1');
    expect(matchByDomain({ fromAddr: 'm.meier@spedition-muster.de', subject: 'Bewerbung', text: 'Sehr geehrte Frau Nigar Aliyeva, …' }, candidates)).toBe('a2');
  });

  it('nothing named or ambiguous → no match', () => {
    expect(matchByDomain({ fromAddr: 'm.meier@spedition-muster.de', subject: 'Bewerbung', text: 'Danke' }, candidates)).toBeNull();
    expect(matchByDomain({ fromAddr: 'x@spedition-muster.de', subject: 'Lagerhelfer und Berufskraftfahrer (m/w/d) CE', text: '' }, candidates)).toBeNull();
  });

  it('free-mail domains only match the exact address', () => {
    expect(matchByDomain({ fromAddr: 'someone@gmail.com', subject: 'Koch', text: 'Rauf Həsənov' }, candidates)).toBeNull();
    expect(matchByDomain({ fromAddr: 'chef@gmail.com', subject: 'Re: Bewerbung Koch', text: '' }, candidates)).toBe('a3');
  });
});

describe('automatic daily limit (bounce / failure rate)', () => {
  const t0 = new Date('2026-11-20T10:00:00Z');
  const later = (h: number) => new Date(t0.getTime() + h * 3600_000);

  it('halves above 5 % with enough mail, at most once a day, down to 1/8', () => {
    let s = adjustHealth(DEFAULT_HEALTH, { sent: 40, hardBounces: 3, failures: 0 }, t0);
    expect(s).toMatchObject({ factor: 0.5, reason: 'BOUNCES' });
    expect(adjustHealth(s, { sent: 40, hardBounces: 3, failures: 0 }, later(5)).factor).toBe(0.5); // cooldown
    s = adjustHealth(s, { sent: 40, hardBounces: 3, failures: 1 }, later(25));
    expect(s.factor).toBe(0.25);
    s = adjustHealth(s, { sent: 40, hardBounces: 5, failures: 0 }, later(50));
    s = adjustHealth(s, { sent: 40, hardBounces: 5, failures: 0 }, later(75));
    expect(s.factor).toBe(0.125);
  });

  it('small samples and low rates do not lower it', () => {
    expect(adjustHealth(DEFAULT_HEALTH, { sent: 5, hardBounces: 2, failures: 0 }, t0).factor).toBe(1);
    expect(adjustHealth(DEFAULT_HEALTH, { sent: 100, hardBounces: 5, failures: 0 }, t0).factor).toBe(1); // exactly 5 %
  });

  it('recovers slowly (+1/4 every 3 days) when the rate is low', () => {
    const low = { factor: 0.25, changedAt: t0.toISOString(), reason: 'BOUNCES' as const, last: null };
    expect(adjustHealth(low, { sent: 30, hardBounces: 0, failures: 0 }, later(48)).factor).toBe(0.25);
    const up = adjustHealth(low, { sent: 30, hardBounces: 0, failures: 0 }, later(73));
    expect(up).toMatchObject({ factor: 0.5, reason: 'BOUNCES' });
    const full = adjustHealth({ ...up, factor: 0.75 }, { sent: 30, hardBounces: 0, failures: 0 }, later(150));
    expect(full).toMatchObject({ factor: 1, reason: null });
    // 3 % (between the thresholds): stays
    expect(adjustHealth(low, { sent: 100, hardBounces: 3, failures: 0 }, later(100)).factor).toBe(0.25);
  });

  it('effective limit and stored values', () => {
    expect(effectiveDailyLimit(30, 1)).toBe(30);
    expect(effectiveDailyLimit(30, 0.5)).toBe(15);
    expect(effectiveDailyLimit(5, 0.125)).toBe(1);
    expect(effectiveDailyLimit(0, 1)).toBe(0);
    expect(readHealth({ factor: 7 }).factor).toBe(1);
    expect(readHealth('x')).toEqual(DEFAULT_HEALTH);
  });
});
