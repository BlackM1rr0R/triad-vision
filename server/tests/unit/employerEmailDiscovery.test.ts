import { describe, expect, it } from 'vitest';
import { SafeFetchError, checkUrl, expandV6, isBlockedIp, resolvePublic, safeGet, type RawResponse, type ResolvedAddress, type SafeResponse } from '../../src/lib/net/safeFetch.js';
import { parseRobots, robotsAllows } from '../../src/lib/germanyJobs/discovery/robots.js';
import { contactLinks, extractCandidates, jsonLdFacts, softRedirect, textAddresses } from '../../src/lib/germanyJobs/discovery/extract.js';
import { acceptCandidate, domainMatchesCompany, isBoardDomain, mailboxRejection, registrableDomain } from '../../src/lib/germanyJobs/discovery/domains.js';
import { FetchLimiter, discoverEmployerEmail, type PageFetcher } from '../../src/lib/germanyJobs/discovery/index.js';
import { FetchBudgetExceeded } from '../../src/lib/net/safeFetch.js';

/**
 * Employer e-mail discovery (lib/germanyJobs/discovery, lib/net/safeFetch): SSRF guard, robots.txt, extraction with
 * obfuscations / JSON-LD / ranking, employer-domain acceptance and the resolver with an injected fetcher.
 */

describe('SSRF guard', () => {
  it('blocks private, loopback, link-local, CGNAT, multicast and their IPv6 forms', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.5']) expect(isBlockedIp(ip), ip).toBe(true);
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2001:db8::1', '[::1]']) expect(isBlockedIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '81.169.145.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8']) expect(isBlockedIp(ip), ip).toBe(false);
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(expandV6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  });

  it('accepts only http(s) on 80 / 443 without credentials or internal names', () => {
    expect(checkUrl('https://karriere.firma.de/jobs?id=1#x').href).toBe('https://karriere.firma.de/jobs?id=1');
    for (const u of ['ftp://firma.de/', 'file:///etc/passwd', 'http://user:pw@firma.de/', 'http://firma.de:8080/', 'http://localhost/', 'http://intranet.local/', 'http://db.internal/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'http://printer/']) {
      expect(() => checkUrl(u), u).toThrow(SafeFetchError);
    }
    expect(checkUrl('https://firma.de:443/').port).toBe('');
  });

  it('a host with any private DNS answer is blocked (DNS rebinding)', async () => {
    const resolver = async (): Promise<ResolvedAddress[]> => [
      { address: '81.169.145.1', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(resolvePublic('evil.example', resolver)).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(resolvePublic('ok.example', async () => [{ address: '81.169.145.1', family: 4 }])).resolves.toEqual({ address: '81.169.145.1', family: 4 });
    await expect(resolvePublic('none.example', async () => [])).rejects.toMatchObject({ code: 'DNS_FAILED' });
  });

  it('checks every redirect hop, pins the checked address and stops after the hop limit', async () => {
    const dns: Record<string, string> = { 'track.example': '81.1.1.1', 'firma.de': '81.2.2.2', 'evil.example': '10.0.0.1' };
    const resolver = async (h: string): Promise<ResolvedAddress[]> => [{ address: dns[h] ?? '81.9.9.9', family: 4 }];
    const used: string[] = [];
    const routes: Record<string, RawResponse> = {
      'https://track.example/c?id=1': { status: 302, location: 'https://firma.de/jobs/1', contentType: '', body: '', truncated: false },
      'https://firma.de/jobs/1': { status: 200, location: null, contentType: 'text/html', body: '<p>ok</p>', truncated: false },
      'https://track.example/bad': { status: 301, location: 'http://evil.example/', contentType: '', body: '', truncated: false },
      'https://track.example/meta': { status: 302, location: 'http://169.254.169.254/latest', contentType: '', body: '', truncated: false },
      'https://track.example/loop': { status: 302, location: '/loop', contentType: '', body: '', truncated: false },
    };
    const transport = async (u: URL, a: ResolvedAddress): Promise<RawResponse> => {
      used.push(`${u.hostname}@${a.address}`);
      return routes[u.href] ?? { status: 404, location: null, contentType: 'text/html', body: '', truncated: false };
    };
    const ok = await safeGet('https://track.example/c?id=1', { resolver, transport });
    expect(ok).toMatchObject({ url: 'https://firma.de/jobs/1', status: 200, hops: ['https://track.example/c?id=1', 'https://firma.de/jobs/1'] });
    expect(used).toEqual(['track.example@81.1.1.1', 'firma.de@81.2.2.2']);
    await expect(safeGet('https://track.example/bad', { resolver, transport })).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(safeGet('https://track.example/meta', { resolver, transport })).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(safeGet('https://track.example/loop', { resolver, transport, maxRedirects: 3 })).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
    // robots.txt / rate limiter refusal
    await expect(safeGet('https://track.example/c?id=1', { resolver, transport, beforeRequest: async (u) => u.hostname !== 'firma.de' })).rejects.toMatchObject({ code: 'POLICY', url: 'https://firma.de/jobs/1' });
  });
});

describe('robots.txt', () => {
  const txt = ['# comment', 'User-agent: *', 'Disallow: /intern/', 'Disallow: /*.pdf$', 'Allow: /intern/jobs/', '', 'User-agent: BadBot', 'Disallow: /'].join('\n');

  it('uses the "*" group, longest match wins, Allow wins a tie, * and $ work', () => {
    const rules = parseRobots(txt);
    expect(robotsAllows(rules, '/jobs/123')).toBe(true);
    expect(robotsAllows(rules, '/intern/x')).toBe(false);
    expect(robotsAllows(rules, '/intern/jobs/1')).toBe(true);
    expect(robotsAllows(rules, '/files/a.pdf')).toBe(false);
    expect(robotsAllows(rules, '/files/a.pdf?x=1')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /a\nAllow: /a'), '/a')).toBe(true);
  });

  it('a group for our bot replaces "*"; empty Disallow allows all; no rules = allowed', () => {
    const own = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: TriadVisionBot\nDisallow: /private\n');
    expect(robotsAllows(own, '/jobs')).toBe(true);
    expect(robotsAllows(own, '/private/1')).toBe(false);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/x')).toBe(true);
    expect(robotsAllows(parseRobots(''), '/x')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n'), '/')).toBe(false);
    // several agents sharing one group
    expect(robotsAllows(parseRobots('User-agent: foo\nUser-agent: *\nDisallow: /jobs\n'), '/jobs/1')).toBe(false);
  });
});

describe('extraction', () => {
  it('finds plain, mailto and obfuscated addresses', () => {
    const found = (s: string) => textAddresses(s).map((a) => a.email);
    expect(found('Bewerbung an bewerbung@nord-logistik.de.')).toEqual(['bewerbung@nord-logistik.de']);
    expect(found('jobs [at] firma-zwei [dot] de')).toEqual(['jobs@firma-zwei.de']);
    expect(found('personal(at)stadtwerke-ulm.de')).toEqual(['personal@stadtwerke-ulm.de']);
    expect(found('karriere at baeckerei-meier dot de')).toEqual(['karriere@baeckerei-meier.de']);
    expect(found('hr {at} pflege-plus (dot) com')).toEqual(['hr@pflege-plus.com']);
    expect(found('m.weber @ spedition-ost.de')).toEqual(['m.weber@spedition-ost.de']);
    expect(found('Bewerben Sie sich at Firma dot com')).toEqual([]); // prose, no mailbox
    const html = '<a href="mailto:Bewerbung@Firma-Drei.de?subject=Job">Mail</a> <span>info&#64;firma-drei&#46;de</span>';
    expect(extractCandidates(html).map((c) => c.email).sort()).toEqual(['bewerbung@firma-drei.de', 'info@firma-drei.de']);
  });

  it('reads JSON-LD JobPosting contacts and the company site', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'JobPosting',
          title: 'Koch (m/w/d)',
          description: '<p>Fragen an <b>kueche [at] hotel-seeblick.de</b></p>',
          applicationContact: { '@type': 'ContactPoint', email: 'mailto:jobs@hotel-seeblick.de' },
          hiringOrganization: { '@type': 'Organization', name: 'Hotel Seeblick GmbH', sameAs: 'https://www.hotel-seeblick.de', email: 'info@hotel-seeblick.de' },
        },
      ],
    })}</script>`;
    const ld = jsonLdFacts(html);
    expect(ld).toMatchObject({ contacts: ['jobs@hotel-seeblick.de'], orgEmails: ['info@hotel-seeblick.de'], orgUrls: ['https://www.hotel-seeblick.de'], orgName: 'Hotel Seeblick GmbH' });
    const ranked = extractCandidates(html);
    expect(ranked[0]).toMatchObject({ email: 'jobs@hotel-seeblick.de', source: 'jsonld-contact' });
    expect(ranked.map((c) => c.email)).toContain('kueche@hotel-seeblick.de');
    expect(jsonLdFacts('<script type="application/ld+json">{broken</script>').contacts).toEqual([]);
  });

  it('ranks application mailboxes and addresses near "Bewerbung" first', () => {
    const html = `
      <footer>Kontakt: info@firma.de · presse@firma.de</footer>
      <section><h2>Ihre Bewerbung</h2><p>Ihr Ansprechpartner: Frau Weber, a.weber@firma.de</p></section>
      <p>Lebenslauf bitte an karriere@firma.de</p>`;
    const order = extractCandidates(html).map((c) => c.email);
    expect(order.indexOf('karriere@firma.de')).toBeLessThan(order.indexOf('info@firma.de'));
    expect(order.indexOf('a.weber@firma.de')).toBeLessThan(order.indexOf('info@firma.de'));
  });

  it('reads soft redirects and same-site contact links without running scripts', () => {
    expect(softRedirect('<meta http-equiv="refresh" content="0; url=https://firma.de/job/1">', 'https://track.example/')).toBe('https://firma.de/job/1');
    expect(softRedirect('<script>window.location.href = "https:\\/\\/firma.de\\/job\\/2";</script>', 'https://track.example/')).toBe('https://firma.de/job/2');
    expect(softRedirect('<script>location.replace("/go")</script>', 'https://track.example/x')).toBe('https://track.example/go');
    expect(softRedirect('<script>location.href="javascript:alert(1)"</script>', 'https://t.example/')).toBeNull();
    expect(softRedirect(`<p>${'x'.repeat(40_000)}</p><meta http-equiv="refresh" content="0;url=/a">`, 'https://t.example/')).toBeNull();
    const links = contactLinks('<a href="/impressum">Impressum</a><a href="https://other.de/karriere">Karriere</a><a href="/karriere/">Karriere</a><a href="/kontakt">Kontakt</a><a href="/produkte">Produkte</a>', 'https://www.firma.de/job/1');
    expect(links).toEqual(['https://www.firma.de/karriere/', 'https://www.firma.de/kontakt', 'https://www.firma.de/impressum']);
  });
});

describe('employer domain', () => {
  it('registrable domains and boards', () => {
    expect(registrableDomain('karriere.nord-logistik.de')).toBe('nord-logistik.de');
    expect(registrableDomain('jobs.firma.co.uk')).toBe('firma.co.uk');
    expect(registrableDomain('www.firma.de')).toBe('firma.de');
    for (const d of ['www.careerjet.de', 'jobviewtrack.com', 'de.jooble.org', 'www.adzuna.de', 'de.indeed.com', 'www.stepstone.de', 'www.arbeitsagentur.de', 'firma.softgarden.io', 'firma.jobs.personio.de', 'jobs.smartrecruiters.com', 'firma.wd3.myworkdayjobs.com', 'career5.successfactors.eu', 'boards.greenhouse.io', 'jobs.lever.co', 'gmail.com']) expect(isBoardDomain(d), d).toBe(true);
    expect(isBoardDomain('nord-logistik.de')).toBe(false);
  });

  it('rejects no-reply, privacy and technical mailboxes, placeholders, boards and files', () => {
    expect(mailboxRejection('noreply@firma.de')).toBe('BAD_MAILBOX');
    expect(mailboxRejection('no-reply@firma.de')).toBe('BAD_MAILBOX');
    expect(mailboxRejection('datenschutz@firma.de')).toBe('BAD_MAILBOX');
    expect(mailboxRejection('privacy@firma.de')).toBe('BAD_MAILBOX');
    expect(mailboxRejection('info@stepstone.de')).toBe('BOARD');
    expect(mailboxRejection('jobs@careerjet.de')).toBe('BOARD');
    expect(mailboxRejection('max.mustermann@firma.de')).toBe('PLACEHOLDER');
    expect(mailboxRejection('logo@2x.png')).toBe('SHAPE');
    expect(mailboxRejection('bewerbung@firma.de')).toBeNull();
    expect(mailboxRejection('info@firma.de')).toBeNull();
  });

  it('matches company names to domains', () => {
    expect(domainMatchesCompany('nord-logistik.de', 'Nord Logistik GmbH')).toBe(true);
    expect(domainMatchesCompany('lidl.de', 'Lidl Vertriebs GmbH & Co. KG')).toBe(true);
    expect(domainMatchesCompany('mail.rewe-group.com', 'REWE Markt GmbH')).toBe(true);
    expect(domainMatchesCompany('baeckerei-mueller.de', 'Bäckerei Müller')).toBe(true);
    expect(domainMatchesCompany('db.de', 'Deutsche Bahn AG')).toBe(true);
    expect(domainMatchesCompany('logistik-jobs.de', 'Nord Logistik GmbH')).toBe(false); // generic word only
    expect(domainMatchesCompany('randstad.de', 'Nord Logistik GmbH')).toBe(false);
    expect(domainMatchesCompany('firma.de', null)).toBe(false);
  });

  it('accepts the page domain on the employer site, only company-name domains on a board / ATS', () => {
    const own = { pageUrl: 'https://karriere.nord-logistik.de/jobs/1', company: 'Nord Logistik GmbH' };
    expect(acceptCandidate({ email: 'bewerbung@nord-logistik.de' }, own)).toBeNull();
    expect(acceptCandidate({ email: 'jobs@other-firm.de' }, own)).toBe('NOT_EMPLOYER');
    const board = { pageUrl: 'https://www.stepstone.de/stellenangebote--x', company: 'Nord Logistik GmbH' };
    expect(acceptCandidate({ email: 'personal@nord-logistik.de' }, board)).toBeNull();
    expect(acceptCandidate({ email: 'service@stepstone.de' }, board)).not.toBeNull();
    expect(acceptCandidate({ email: 'info@randstad.de' }, board)).toBe('NOT_EMPLOYER');
    const ats = { pageUrl: 'https://nordlogistik.jobs.personio.de/job/1', company: 'Nord Logistik GmbH' };
    expect(acceptCandidate({ email: 'jobs@nord-logistik.de' }, ats)).toBeNull();
    expect(acceptCandidate({ email: 'support@personio.de' }, ats)).not.toBeNull();
    // JSON-LD company site
    expect(acceptCandidate({ email: 'hr@nl-gruppe.de' }, { ...board, companyDomains: ['www.nl-gruppe.de'] })).toBeNull();
    // unknown site whose name is not the company's: only the applications mailbox
    const unknown = { pageUrl: 'https://www.regio-stellen.de/anzeige/1', company: 'Nord Logistik GmbH' };
    expect(acceptCandidate({ email: 'info@regio-stellen.de', context: 'Impressum' }, unknown)).toBe('NOT_EMPLOYER');
    expect(acceptCandidate({ email: 'bewerbung@regio-stellen.de', context: '' }, unknown)).toBeNull();
  });
});

describe('resolver with an injected fetcher', () => {
  const page = (url: string, body: string, status = 200): SafeResponse => ({ url, status, contentType: 'text/html; charset=utf-8', body, truncated: false, hops: [url] });

  it('follows the tracking link to the employer page and returns the best accepted address with evidence', async () => {
    const pages: Record<string, SafeResponse> = {
      'https://jobviewtrack.com/de-de/job-1': page('https://www.nord-logistik.de/stellen/fahrer', '<p>Kontakt: datenschutz@nord-logistik.de</p><p>Ihre Bewerbung an bewerbung [at] nord-logistik [dot] de</p><p>Partner: info@stepstone.de</p>'),
    };
    const fetchPage: PageFetcher = async (u) => pages[u] ?? page(u, '', 404);
    const r = await discoverEmployerEmail('https://jobviewtrack.com/de-de/job-1', 'Nord Logistik GmbH', fetchPage);
    expect(r).toMatchObject({ outcome: 'FOUND', email: 'bewerbung@nord-logistik.de', pageUrl: 'https://www.nord-logistik.de/stellen/fahrer', evidenceUrl: 'https://www.nord-logistik.de/stellen/fahrer' });
    expect(r.evidence).toContain('Bewerbung');
  });

  it('follows a meta refresh, then looks at the careers page of the employer site', async () => {
    const pages: Record<string, SafeResponse> = {
      'https://www.adzuna.de/land/ad/1': page('https://www.adzuna.de/land/ad/1', '<meta http-equiv="refresh" content="0;url=https://www.baeckerei-mueller.de/job">'),
      'https://www.baeckerei-mueller.de/job': page('https://www.baeckerei-mueller.de/job', '<h1>Bäcker</h1><a href="/karriere">Karriere</a><a href="/impressum">Impressum</a>'),
      'https://www.baeckerei-mueller.de/karriere': page('https://www.baeckerei-mueller.de/karriere', '<p>Bewerbungen bitte an <a href="mailto:jobs@baeckerei-mueller.de">uns</a></p>'),
    };
    const seen: string[] = [];
    const fetchPage: PageFetcher = async (u) => {
      seen.push(u);
      return pages[u] ?? page(u, '', 404);
    };
    const r = await discoverEmployerEmail('https://www.adzuna.de/land/ad/1', 'Bäckerei Müller', fetchPage);
    expect(r).toMatchObject({ outcome: 'FOUND', email: 'jobs@baeckerei-mueller.de', pageUrl: 'https://www.baeckerei-mueller.de/job', evidenceUrl: 'https://www.baeckerei-mueller.de/karriere' });
    expect(seen).toEqual(['https://www.adzuna.de/land/ad/1', 'https://www.baeckerei-mueller.de/job', 'https://www.baeckerei-mueller.de/karriere']);
  });

  it('robots.txt refusal keeps the direct page; failures and empty pages are quiet results', async () => {
    const robots: PageFetcher = async () => {
      throw new SafeFetchError('POLICY', 'https://www.firma.de/job/9');
    };
    expect(await discoverEmployerEmail('https://jobviewtrack.com/x', 'Firma', robots)).toMatchObject({ outcome: 'ROBOTS', pageUrl: 'https://www.firma.de/job/9', email: null });
    const down: PageFetcher = async () => {
      throw new SafeFetchError('TIMEOUT', 'https://jobviewtrack.com/x');
    };
    expect(await discoverEmployerEmail('https://jobviewtrack.com/x', 'Firma', down)).toMatchObject({ outcome: 'FAILED', pageUrl: null, error: 'TIMEOUT' });
    const empty: PageFetcher = async (u) => page('https://www.stepstone.de/a', '<p>Jetzt bewerben</p><a href="/kontakt">Kontakt</a>');
    expect(await discoverEmployerEmail('https://jobviewtrack.com/y', 'Firma', empty)).toMatchObject({ outcome: 'NOT_FOUND', pageUrl: 'https://www.stepstone.de/a' });
    const gone: PageFetcher = async (u) => page(u, '', 410);
    expect(await discoverEmployerEmail('https://www.firma.de/z', 'Firma', gone)).toMatchObject({ outcome: 'FAILED', error: 'HTTP_410' });
    const budget: PageFetcher = async () => {
      throw new FetchBudgetExceeded();
    };
    await expect(discoverEmployerEmail('https://www.firma.de/z', 'Firma', budget)).rejects.toBeInstanceOf(FetchBudgetExceeded);
  });
});

describe('fetch limiter', () => {
  it('spaces requests per host, caps per minute and gives up past the deadline', async () => {
    let t = 0;
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      t += ms;
    };
    const lim = new FetchLimiter({ perMinute: 3, perHostMs: 5_000, deadline: 70_000, now: () => t, sleep });
    await lim.acquire('a.firma.de');
    await lim.acquire('b.firma.de'); // same registrable domain: waits 5 s
    expect(t).toBe(5_000);
    await lim.acquire('other.de');
    expect(t).toBe(5_000);
    await lim.acquire('third.de'); // 4th in the minute: waits until the first one is a minute old
    expect(t).toBe(60_000);
    await expect(lim.acquire('third.de')).resolves.toBe(true); // 5 s later, still within the deadline
    const tight = new FetchLimiter({ perMinute: 1, perHostMs: 5_000, deadline: 10_000, now: () => t, sleep });
    await tight.acquire('x.de');
    await expect(tight.acquire('y.de')).rejects.toBeInstanceOf(FetchBudgetExceeded);
  });
});
