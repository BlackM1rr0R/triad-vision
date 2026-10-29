import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { expectStatus } from '../helpers/workflow';

// Workspace mail "add account": settings from the address; autoconfig / autodiscover files for mail apps.

describe('GET /api/mail/autoconfig', () => {
  it('own domain and known providers for staff; clients are refused', async () => {
    const staff = await asStaff();
    const own = expectStatus(await staff.agent.get('/api/mail/autoconfig').query({ email: 'Anna@triad-vision.de' }), 200);
    expect(own.body.settings).toMatchObject({ source: 'OWN', imapHost: 'mail.triad-vision.de', imapPort: 993, smtpPort: 465, smtpSecure: true, username: 'anna@triad-vision.de' });
    const gmail = expectStatus(await staff.agent.get('/api/mail/autoconfig').query({ email: 'x@gmail.com' }), 200);
    expect(gmail.body.settings).toMatchObject({ source: 'PRESET', provider: 'GMAIL', username: 'x@gmail.com' });
    expectStatus(await staff.agent.get('/api/mail/autoconfig').query({ email: 'nope' }), 400);
    const client = await asClient();
    expectStatus(await client.agent.get('/api/mail/autoconfig').query({ email: 'x@gmail.com' }), 403);
  });
});

describe('/api/mail-autoconfig (public)', () => {
  it('serves the Thunderbird config on both paths', async () => {
    for (const path of ['/api/mail-autoconfig/mail/config-v1.1.xml', '/api/mail-autoconfig/.well-known/autoconfig/mail/config-v1.1.xml']) {
      const res = await anon().get(path).query({ emailaddress: 'anna@triad-vision.de' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.text).toContain('<hostname>mail.triad-vision.de</hostname>');
      expect(res.text).toContain('<socketType>SSL</socketType>');
    }
  });

  it('answers Outlook autodiscover POSTs (any path case) for our domain only', async () => {
    const body = (email: string) =>
      `<?xml version="1.0" encoding="utf-8"?><Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006"><Request><EMailAddress>${email}</EMailAddress><AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema></Request></Autodiscover>`;
    const ok = await anon().post('/api/mail-autoconfig/Autodiscover/Autodiscover.xml').set('Content-Type', 'text/xml').send(body('anna@triad-vision.de'));
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('<Type>IMAP</Type>');
    expect(ok.text).toContain('<LoginName>anna@triad-vision.de</LoginName>');
    const other = await anon().post('/api/mail-autoconfig/autodiscover/autodiscover.xml').set('Content-Type', 'text/xml').send(body('x@gmail.com'));
    expect(other.status).toBe(200);
    expect(other.text).toContain('<ErrorCode>600</ErrorCode>');
    expect(other.text).not.toContain('<Type>IMAP</Type>');
  });
});
