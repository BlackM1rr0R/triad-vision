import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverMailSettings, isPrivateIp, knownSettings, parseAutoconfigXml, resetAutoconfigCache } from '../../src/lib/mail/autoconfig.js';
import { autodiscoverXml, requestedAddress, thunderbirdXml } from '../../src/routes/mailAutoconfig.js';

// "E-mail + password is enough" for the workspace mail dialog, and the autoconfig files for mail apps.

const XML = `<?xml version="1.0"?>
<clientConfig version="1.1"><emailProvider id="example.org">
  <incomingServer type="pop3"><hostname>pop.example.org</hostname><port>995</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer>
  <incomingServer type="imap"><hostname>imap.example.org</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></incomingServer>
  <incomingServer type="imap"><hostname>IMAP.example.org</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
  <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>25</port><socketType>plain</socketType></outgoingServer>
  <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></outgoingServer>
</emailProvider></clientConfig>`;

const okResponse = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });

beforeEach(() => resetAutoconfigCache());

describe('known settings (no network)', () => {
  it('own domain → our mail server 993/465 SSL, username = address', () => {
    expect(knownSettings(' Anna.K@Triad-Vision.de ')).toEqual({
      source: 'OWN',
      domain: 'triad-vision.de',
      provider: 'CUSTOM',
      hint: 'OWN',
      imapHost: 'mail.triad-vision.de',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'mail.triad-vision.de',
      smtpPort: 465,
      smtpSecure: true,
      username: 'anna.k@triad-vision.de',
    });
  });

  it('well-known providers, username always the full address', () => {
    expect(knownSettings('x@gmail.com')).toMatchObject({ source: 'PRESET', provider: 'GMAIL', hint: 'GMAIL', imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com', username: 'x@gmail.com' });
    expect(knownSettings('x@googlemail.com')?.provider).toBe('GMAIL');
    for (const d of ['outlook.com', 'hotmail.com', 'live.com', 'hotmail.de']) {
      expect(knownSettings(`x@${d}`)).toMatchObject({ provider: 'OUTLOOK', imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false });
    }
    expect(knownSettings('x@yandex.ru')?.provider).toBe('YANDEX');
    expect(knownSettings('x@mail.ru')?.provider).toBe('MAILRU');
    expect(knownSettings('x@icloud.com')).toMatchObject({ provider: 'CUSTOM', hint: 'ICLOUD', imapHost: 'imap.mail.me.com', smtpPort: 587, smtpSecure: false });
    expect(knownSettings('x@yahoo.com')).toMatchObject({ hint: 'YAHOO', imapHost: 'imap.mail.yahoo.com' });
    expect(knownSettings('x@gmx.de')).toMatchObject({ hint: 'GMX', imapHost: 'imap.gmx.net', smtpHost: 'mail.gmx.net' });
    expect(knownSettings('x@web.de')).toMatchObject({ hint: 'WEBDE', imapHost: 'imap.web.de', smtpPort: 587 });
    expect(knownSettings('x@t-online.de')).toMatchObject({ hint: 'TONLINE', imapHost: 'secureimap.t-online.de', smtpHost: 'securesmtp.t-online.de' });
    expect(knownSettings('x@example.org')).toBeNull();
    expect(knownSettings('not-an-email')).toBeNull();
  });
});

describe('autoconfig XML', () => {
  it('prefers IMAP over SSL and the safest SMTP, never plain text; fills the username template', () => {
    expect(parseAutoconfigXml(XML, 'bob@example.org')).toEqual({
      imapHost: 'imap.example.org',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.org',
      smtpPort: 587,
      smtpSecure: false,
      username: 'bob',
    });
    expect(parseAutoconfigXml('<clientConfig/>', 'bob@example.org')).toBeNull();
    // IMAP with STARTTLS only: not usable by the sync client.
    expect(parseAutoconfigXml(XML.replace(/<incomingServer type="imap"><hostname>IMAP[\s\S]*?<\/incomingServer>/, ''), 'bob@example.org')).toBeNull();
  });

  it('private / loopback addresses are recognised (SSRF guard)', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '172.104.149.241', '2a01:4f8::1']) expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('discoverMailSettings', () => {
  it('uses the domain autoconfig first, then the ISPDB, and caches per domain', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => (String(url).startsWith('https://autoconfig.example.org/') ? okResponse(XML) : new Response('', { status: 404 })));
    const resolve = vi.fn(async () => ['93.184.216.34']);
    const s = await discoverMailSettings('bob@example.org', { fetch: fetch as unknown as typeof globalThis.fetch, resolve });
    expect(s).toMatchObject({ source: 'AUTOCONFIG', domain: 'example.org', imapHost: 'imap.example.org', username: 'bob' });
    expect(String(fetch.mock.calls[0]![0])).toBe('https://autoconfig.example.org/mail/config-v1.1.xml?emailaddress=bob%40example.org');
    const again = await discoverMailSettings('eve@example.org', { fetch: fetch as unknown as typeof globalThis.fetch, resolve });
    expect(again.username).toBe('eve');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the ISPDB; skips a domain that resolves to a private address', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => (String(url).startsWith('https://autoconfig.thunderbird.net/v1.1/') ? okResponse(XML) : okResponse('<evil/>')));
    const resolve = vi.fn(async () => ['10.0.0.5']);
    const s = await discoverMailSettings('bob@corp.example', { fetch: fetch as unknown as typeof globalThis.fetch, resolve });
    expect(s.source).toBe('ISPDB');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe('https://autoconfig.thunderbird.net/v1.1/corp.example');
  });

  it('NONE with empty hosts when nothing answers (timeouts / errors are swallowed)', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('timeout');
    });
    const s = await discoverMailSettings('a@nowhere.example', { fetch: fetch as unknown as typeof globalThis.fetch, resolve: async () => ['93.184.216.34'] });
    expect(s).toMatchObject({ source: 'NONE', imapHost: '', smtpHost: '', username: 'a@nowhere.example' });
  });

  it('never goes to the network for our domain or known providers', async () => {
    const fetch = vi.fn();
    expect((await discoverMailSettings('a@triad-vision.de', { fetch: fetch as unknown as typeof globalThis.fetch })).source).toBe('OWN');
    expect((await discoverMailSettings('a@gmail.com', { fetch: fetch as unknown as typeof globalThis.fetch })).source).toBe('PRESET');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('autoconfig files for mail apps', () => {
  it('Thunderbird config-v1.1.xml: IMAP 993 + SMTP 465 SSL, %EMAILADDRESS%', () => {
    const xml = thunderbirdXml();
    expect(xml).toContain('<clientConfig version="1.1">');
    expect(xml).toContain('<domain>triad-vision.de</domain>');
    expect(parseAutoconfigXml(xml, 'anna@triad-vision.de')).toEqual({
      imapHost: 'mail.triad-vision.de',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'mail.triad-vision.de',
      smtpPort: 465,
      smtpSecure: true,
      username: 'anna@triad-vision.de',
    });
  });

  it('Outlook autodiscover: reads the address, answers IMAP + SMTP with the address as login', () => {
    const req = '<?xml version="1.0"?><Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006"><Request><EMailAddress>Anna@Triad-Vision.de</EMailAddress><AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema></Request></Autodiscover>';
    expect(requestedAddress(req)).toBe('anna@triad-vision.de');
    expect(requestedAddress(undefined)).toBe('');
    const xml = autodiscoverXml('anna@triad-vision.de');
    expect(xml).toMatch(/<Type>IMAP<\/Type>\s*<Server>mail\.triad-vision\.de<\/Server>\s*<Port>993<\/Port>/);
    expect(xml).toMatch(/<Type>SMTP<\/Type>\s*<Server>mail\.triad-vision\.de<\/Server>\s*<Port>465<\/Port>/);
    expect(xml.match(/<LoginName>anna@triad-vision\.de<\/LoginName>/g)).toHaveLength(2);
    expect(autodiscoverXml('<x>&')).not.toContain('<x>&');
  });
});
