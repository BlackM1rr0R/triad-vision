import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { digestHtml } = await import('../../src/lib/germanyJobs/alerts.js');

// PUB-1: with "apply via Triad Vision" off, the digest links to the original ad instead of the switched-off apply flow.
const alert = { q: 'Koch', place: '', radius: 25, jobType: 'job', workTime: 'any', remote: false, visa: false };
const job = {
  id: 'arbeitnow:koch-1',
  source: 'arbeitnow',
  title: 'Koch (m/w/d)',
  company: 'Hotel Adler',
  location: 'Berlin',
  url: 'https://www.arbeitnow.com/jobs/koch-1?x=1&y=2',
} as unknown as Parameters<typeof digestHtml>[1][number];
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('Germany job alert digest', () => {
  it('links to our apply flow when external applications are allowed', () => {
    const html = digestHtml(alert, [job], 'de', true);
    expect(html).toContain('Über Triad Vision bewerben');
    for (const h of hrefs(html)) expect(h).toContain('/de/jobs/germany/search?');
    expect(hrefs(html)[0]).toContain('apply=arbeitnow');
  });

  it('links to the original ad and drops the apply line when external applications are off', () => {
    const html = digestHtml(alert, [job], 'de', false);
    expect(html).not.toContain('Über Triad Vision bewerben');
    expect(html).toContain('Originalanzeige öffnen');
    expect(hrefs(html)).toEqual([job.url, job.url]);
    expect(html).not.toContain('apply=');
  });

  it('never puts a non-http listing link into the mail', () => {
    const html = digestHtml(alert, [{ ...job, url: 'javascript:alert(1)' }], 'en', false);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Open the original ad');
    expect(hrefs(html)[0]).toContain('/en/jobs/germany/search?');
  });
});
