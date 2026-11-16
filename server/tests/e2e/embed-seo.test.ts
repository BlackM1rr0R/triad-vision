import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';

/**
 * Embeddable widgets (/embed/*): the head the HTML shell gets from the API (Caddy include /__seo/head) is noindex
 * with a canonical to the full tool, /__seo/status answers 200. The framing headers themselves (frame-ancestors *
 * and no X-Frame-Options on /embed/* only) are set by Caddy (deploy/Caddyfile, checked by
 * deploy/caddy-redirects-test.sh); the API's own responses keep frame-ancestors 'none'.
 */
const ORIGIN = 'http://localhost:5173';

describe('embed pages: SEO head and status', () => {
  it('serves noindex + canonical to the full tool', async () => {
    const az = await anon().get('/__seo/head').query({ path: '/embed/salary-calculator' });
    expect(az.status).toBe(200);
    expect(az.text).toContain('content="noindex, nofollow"');
    expect(az.text).toContain(`rel="canonical" href="${ORIGIN}/salary-calculator"`);

    const de = await anon().get('/__seo/head').query({ path: '/de/embed/blue-card-check' });
    expect(de.text).toContain('content="noindex, nofollow"');
    expect(de.text).toContain(`rel="canonical" href="${ORIGIN}/de/blue-card-check"`);
  });

  it('answers 200 for known widgets and 404 for unknown ones', async () => {
    for (const path of ['/embed/salary-calculator', '/de/embed/blue-card-check', '/ru/embed/which-city', '/widgets']) {
      const res = await anon().get('/__seo/status').query({ path });
      expect(res.text, path).toBe('');
    }
    expect((await anon().get('/__seo/status').query({ path: '/embed/nope' })).text).toBe('404');
  });

  it('keeps the self-referencing canonical of the full tool and of /widgets', async () => {
    const tool = await anon().get('/__seo/head').query({ path: '/blue-card-check' });
    expect(tool.text).toContain(`rel="canonical" href="${ORIGIN}/blue-card-check"`);
    expect(tool.text).toContain('index, follow');
    const widgets = await anon().get('/__seo/head').query({ path: '/en/widgets' });
    expect(widgets.text).toContain(`rel="canonical" href="${ORIGIN}/en/widgets"`);
  });

  it("does not open the API's own responses to framing", async () => {
    const res = await anon().get('/api/seo/head').query({ path: '/embed/salary-calculator' });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
