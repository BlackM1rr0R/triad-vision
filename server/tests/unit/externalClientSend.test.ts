import { describe, expect, it } from 'vitest';
import { clientMaySend, nextStep } from '../../src/lib/germanyJobs/autoSend.js';
import { clientCoverEmail, clientRemindMessage, clientSendMessage, clientSubject } from '../../src/lib/germanyJobs/autoTexts.js';
import { SEO_LOCALES } from '../../src/lib/seoCatalogue.js';

/**
 * MIXED mode of "apply via Triad Vision" (lib/germanyJobs/autoSend.ts): send in our name when the address is known
 * and the client consented, otherwise look for the address first, then hand the package to the client.
 */

const base = { consent: true, employerEmail: null as string | null, emailRejected: false, discoveryDone: false, discoveryOn: true, state: null as string | null };

describe('routing after a passed check', () => {
  it('sends in our name only with consent and a usable address', () => {
    expect(nextStep({ ...base, employerEmail: 'jobs@firma.de' })).toBe('SEND');
    expect(nextStep({ ...base, employerEmail: 'jobs@firma.de', consent: false })).toBe('CLIENT');
    expect(nextStep({ ...base, employerEmail: 'jobs@firma.de', emailRejected: true })).toBe('CLIENT');
    expect(nextStep({ ...base, employerEmail: 'jobs@firma.de', emailRejected: true, state: 'READY' })).toBe('STAFF');
  });

  it('looks for the address once, then hands it to the client', () => {
    expect(nextStep(base)).toBe('SEARCH');
    expect(nextStep({ ...base, consent: false })).toBe('SEARCH'); // the found page / address helps the client too
    expect(nextStep({ ...base, discoveryDone: true })).toBe('CLIENT');
    expect(nextStep({ ...base, discoveryOn: false })).toBe('CLIENT');
    expect(nextStep({ ...base, state: 'CLIENT_SEND', discoveryDone: true })).toBe('CLIENT');
  });

  it('a help request stays with staff until they act; a staff address then sends', () => {
    expect(nextStep({ ...base, state: 'READY', discoveryDone: true })).toBe('STAFF');
    expect(nextStep({ ...base, state: 'READY' })).toBe('STAFF');
    expect(nextStep({ ...base, state: 'READY', employerEmail: 'personal@firma.de' })).toBe('SEND');
  });

  it('the client may confirm / ask for help only while nothing went out', () => {
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: null, autoState: 'CLIENT_SEND' })).toBe(true);
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: null, autoState: 'READY' })).toBe(true);
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: null, autoState: null })).toBe(true);
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: null, autoState: 'SENDING' })).toBe(false);
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: new Date(), autoState: 'SENT' })).toBe(false);
    expect(clientMaySend({ status: 'FORWARDED', autoSentAt: null, autoState: null })).toBe(false);
    expect(clientMaySend({ status: 'SUBMITTED', autoSentAt: null, autoState: 'DUPLICATE' })).toBe(false);
  });
});

describe('texts for the client', () => {
  it('subject "Bewerbung als <title>" without the gender suffix; German cover e-mail', () => {
    expect(clientSubject('Berufskraftfahrer CE (m/w/d)', null)).toBe('Bewerbung als Berufskraftfahrer CE');
    expect(clientSubject(null, 'Bewerbung um eine Stelle')).toBe('Bewerbung um eine Stelle');
    expect(clientSubject(null, null)).toBe('Bewerbung');
    const mail = clientCoverEmail({ title: 'Koch (m/w/d)', company: 'Hotel Seeblick', pageUrl: 'https://www.hotel-seeblick.de/jobs/koch', name: 'Əli Məmmədov', phone: '+994501234567', email: 'ali@example.com' });
    expect(mail).toContain('Sehr geehrte Damen und Herren');
    expect(mail).toContain('„Koch (m/w/d)“ bei Hotel Seeblick');
    expect(mail).toContain('https://www.hotel-seeblick.de/jobs/koch');
    expect(mail.endsWith('Mit freundlichen Grüßen\nƏli Məmmədov\n+994501234567\nali@example.com')).toBe(true);
  });

  it('hand-over and reminder exist in all six languages', () => {
    for (const lng of SEO_LOCALES) {
      const m = clientSendMessage(lng, 'Koch');
      const r = clientRemindMessage(lng, 'Koch');
      expect(m.title && m.body && m.cta && r.title && r.body, lng).toBeTruthy();
      expect(m.body).toContain('Koch');
    }
    expect(clientSendMessage('az', 'Koch').title).toContain('özünüz göndərin');
    expect(clientSendMessage('az', 'Koch').body).toContain('Göndərdim');
  });
});
