import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regression (owner report "in the client cabinet the notifications do not open"): the bell's panel lives inside the
 * portal header, which is its own stacking context (view-transition-name: portal-header). Without a z-index on the
 * header, the page content below (next-step card, …) was painted over the open panel, so clicks on a notification
 * hit the card underneath and nothing opened. Reproduced and verified in headless Chrome (desktop 1366 px and
 * phone 390 px). No DOM test environment in this suite, so the guard checks the classes the fix depends on.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(here, rel), 'utf8');

describe('client portal header layering', () => {
  it('the portal header is lifted above the page content (z-index below the fixed site header z-50)', () => {
    const header = read('./AccountLayout.tsx')
      .split('\n')
      .find((l) => l.includes('vt-portal-header'));
    expect(header).toBeTruthy();
    const z = /\bz-(\d+)\b/.exec(header!);
    expect(z, 'portal header needs a z-index class').not.toBeNull();
    expect(Number(z![1])).toBeGreaterThan(0);
    expect(Number(z![1])).toBeLessThan(50);
  });

  it('the bell panel keeps clear of the phone tab bar', () => {
    expect(read('../../components/notifications/center/NotificationCenter.tsx')).toMatch(/max-h-\[calc\(100dvh-[^\]]*var\(--bnav-h/);
  });
});
