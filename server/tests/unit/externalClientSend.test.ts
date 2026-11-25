import { describe, expect, it } from 'vitest';
import { clientCoverEmail, clientRemindMessage, clientSendMessage, clientSubject } from '../../src/lib/germanyJobs/autoTexts.js';
import { SEO_LOCALES } from '../../src/lib/seoCatalogue.js';

/**
 * Client texts of the retired "apply via Triad Vision" sending (lib/germanyJobs/autoTexts.ts). The routing of the
 * removed pipeline (nextStep, clientMaySend in lib/germanyJobs/autoSend.ts) went with it.
 */

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
