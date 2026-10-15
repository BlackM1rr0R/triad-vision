import { describe, expect, it } from 'vitest';
import { dedupeAddresses, formatAddress, parseAddress, parseAddressList, splitName } from '../../src/lib/mail/address.js';
import { forwardSubject, normalizeSubject, parseReferences, replySubject, threadCandidates, threadKeyOf } from '../../src/lib/mail/thread.js';
import { htmlToText, sanitizeMailHtml, snippetOf, textToHtml } from '../../src/lib/mail/sanitize.js';
import { parseActions, ruleMatches } from '../../src/lib/mail/rules.js';
import { snoozeUntil } from '../../src/lib/mail/snooze.js';
import { presetFor, providerForEmail } from '../../src/lib/mail/providers.js';
import { roleOfFolder } from '../../src/lib/mail/sync.js';

describe('mail: address parsing', () => {
  it('parses bare, bracketed and quoted forms', () => {
    expect(parseAddress('a@b.de')).toEqual({ name: '', address: 'a@b.de' });
    expect(parseAddress('<A@Example.COM>')).toEqual({ name: '', address: 'A@example.com' });
    expect(parseAddress('Aysel Mammadova <aysel@example.com>')).toEqual({ name: 'Aysel Mammadova', address: 'aysel@example.com' });
    expect(parseAddress('"Müller, Hans" <hans@example.de>')).toEqual({ name: 'Müller, Hans', address: 'hans@example.de' });
    expect(parseAddress('not an address')).toBeNull();
  });

  it('splits lists on commas and semicolons but not inside quotes', () => {
    const list = parseAddressList('"Müller, Hans" <hans@x.de>; Aysel <aysel@x.az>, plain@x.com');
    expect(list.map((a) => a.address)).toEqual(['hans@x.de', 'aysel@x.az', 'plain@x.com']);
    expect(list[0]!.name).toBe('Müller, Hans');
  });

  it('formats names with specials quoted and dedupes case-insensitively', () => {
    expect(formatAddress({ name: 'Aysel Mammadova', address: 'a@b.de' })).toBe('Aysel Mammadova <a@b.de>');
    expect(formatAddress({ name: 'Müller, Hans', address: 'h@b.de' })).toBe('"Müller, Hans" <h@b.de>');
    expect(formatAddress({ name: '', address: 'x@y.z' })).toBe('x@y.z');
    const d = dedupeAddresses([{ name: 'A', address: 'A@b.de' }, { name: 'a', address: 'a@b.de' }, { name: 'me', address: 'me@b.de' }], ['me@b.de']);
    expect(d).toEqual([{ name: 'A', address: 'A@b.de' }]);
  });

  it('derives first/last names for the address book', () => {
    expect(splitName({ name: 'Aysel Mammadova', address: 'a@b.de' })).toEqual({ firstName: 'Aysel', lastName: 'Mammadova' });
    expect(splitName({ name: 'Mammadova, Aysel', address: 'a@b.de' })).toEqual({ firstName: 'Aysel', lastName: 'Mammadova' });
    expect(splitName({ name: '', address: 'kamran.aliyev@b.de' })).toEqual({ firstName: 'Kamran', lastName: 'Aliyev' });
    expect(splitName({ name: '', address: 'info@b.de' })).toEqual({ firstName: 'Info', lastName: null });
  });
});

describe('mail: thread keys', () => {
  it('uses the root of References, then In-Reply-To, then the own Message-ID', () => {
    expect(threadCandidates({ messageId: '<c@x>', inReplyTo: '<b@x>', references: '<a@x> <b@x>' })).toEqual(['a@x', 'b@x', 'c@x']);
    expect(threadKeyOf({ messageId: '<c@x>', inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'] })).toBe('a@x');
    expect(threadKeyOf({ messageId: '<c@x>', inReplyTo: '<b@x>' })).toBe('b@x');
    expect(threadKeyOf({ messageId: '<c@x>' })).toBe('c@x');
  });

  it('falls back to a subject + sender hash and hashes over-long ids', () => {
    const a = threadKeyOf({ subject: 'Re: Visa documents', fromAddr: 'a@x.de' });
    const b = threadKeyOf({ subject: 'AW: visa documents', fromAddr: 'A@X.de' });
    expect(a).toBe(b);
    expect(a.startsWith('s:')).toBe(true);
    const long = threadKeyOf({ messageId: `<${'x'.repeat(300)}@x>` });
    expect(long.length).toBeLessThanOrEqual(190);
    expect(long.startsWith('h:')).toBe(true);
  });

  it('parses references and normalises subjects', () => {
    expect(parseReferences('<a@x>\r\n <b@x>')).toEqual(['a@x', 'b@x']);
    expect(parseReferences(null)).toEqual([]);
    expect(normalizeSubject('Re: Fwd: AW[2]: Hello')).toBe('hello');
    expect(replySubject('Hello')).toBe('Re: Hello');
    expect(replySubject('Re: Hello')).toBe('Re: Hello');
    expect(forwardSubject('Hello')).toBe('Fwd: Hello');
    expect(forwardSubject('FW: Hello')).toBe('FW: Hello');
  });
});

describe('mail: html sanitiser', () => {
  it('removes scripts, styles, forms, frames and event handlers', () => {
    const out = sanitizeMailHtml(
      '<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><p onclick="x()">Hi <b>there</b></p><form><input></form><iframe src="https://x"></iframe><object></object></body></html>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('color:red');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('onclick');
    expect(out).toContain('<b>there</b>');
  });

  it('blocks remote images (data-src) and rewrites cid: images to the inline route', () => {
    const inline = new Map([['img1@mail', '/api/mail/inline/att1']]);
    const out = sanitizeMailHtml('<img src="https://tracker.example/p.gif"><img src="cid:img1@mail"><img src="cid:missing@mail"><img src="javascript:alert(1)">', { inlineUrls: inline });
    expect(out).toContain('data-src="https://tracker.example/p.gif"');
    expect(out).not.toMatch(/ src="https:/);
    expect(out).toContain('src="/api/mail/inline/att1"');
    expect(out).not.toContain('cid:');
    expect(out).not.toContain('javascript:');
    const kept = sanitizeMailHtml('<img src="https://x.example/a.png">', { keepRemoteImages: true });
    expect(kept).toContain('src="https://x.example/a.png"');
    expect(kept).not.toContain('data-src');
  });

  it('keeps layout styles but strips url() and expression()', () => {
    const out = sanitizeMailHtml('<div style="color:#333; background:url(https://x/y.png); width:100px">x</div><p style="width:expression(alert(1))">y</p>');
    expect(out).toContain('color:#333');
    expect(out).toContain('width:100px');
    expect(out).not.toContain('url(');
    expect(out).not.toContain('expression');
  });

  it('forces links to open in a new tab and drops unsafe schemes', () => {
    const out = sanitizeMailHtml('<a href="https://triad-vision.de">site</a><a href="javascript:void(0)">bad</a><a href="mailto:a@b.de">m</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="mailto:a@b.de"');
  });

  it('builds snippets and text versions', () => {
    expect(snippetOf(null, '<p>Hello&nbsp;<b>world</b></p><script>x</script>')).toBe('Hello world');
    expect(snippetOf('line\n> quoted\nmore', null)).toBe('line more');
    expect(snippetOf('x'.repeat(300), null).length).toBe(200);
    expect(htmlToText('<p>One</p><p>Two &amp; three</p><ul><li>a</li></ul>')).toBe('One\nTwo & three\n• a');
    expect(textToHtml('see https://x.de/a <b>')).toContain('<a href="https://x.de/a"');
    expect(textToHtml('see https://x.de/a <b>')).toContain('&lt;b&gt;');
  });
});

describe('mail: rules', () => {
  const msg = { fromAddr: 'embassy@auswaertiges-amt.de', fromName: 'Botschaft Baku', subject: 'Termin bestätigt', toList: [{ name: '', address: 'me@triad.az' }], hasAttachments: true };

  it('matches on from / subject / to / attachment with all or any semantics', () => {
    expect(ruleMatches({ from: 'auswaertiges' }, msg)).toBe(true);
    expect(ruleMatches({ from: 'Botschaft' }, msg)).toBe(true);
    expect(ruleMatches({ subject: 'TERMIN' }, msg)).toBe(true);
    expect(ruleMatches({ to: 'triad.az' }, msg)).toBe(true);
    expect(ruleMatches({ hasAttachment: true }, msg)).toBe(true);
    expect(ruleMatches({ hasAttachment: false }, msg)).toBe(false);
    expect(ruleMatches({ from: 'auswaertiges', subject: 'nope' }, msg)).toBe(false);
    expect(ruleMatches({ match: 'any', from: 'nope', subject: 'termin' }, msg)).toBe(true);
  });

  it('rejects empty or malformed conditions and actions', () => {
    expect(ruleMatches({}, msg)).toBe(false);
    expect(ruleMatches({ from: 123 }, msg)).toBe(false);
    expect(ruleMatches('x', msg)).toBe(false);
    expect(parseActions({})).toBeNull();
    expect(parseActions({ markRead: true })).toEqual({ markRead: true });
    expect(parseActions({ unknown: true })).toBeNull();
  });
});

describe('mail: snooze presets', () => {
  // Wednesday 2026-10-14 10:30 Baku (UTC+4 → offset -240) = 06:30 UTC
  const now = new Date('2026-10-14T06:30:00.000Z');
  const tz = -240;

  it('later today = +3 h rounded up to the full hour', () => {
    expect(snoozeUntil('laterToday', now, tz).toISOString()).toBe('2026-10-14T10:00:00.000Z');
    const evening = new Date('2026-10-14T15:30:00.000Z'); // 19:30 Baku → tomorrow morning
    expect(snoozeUntil('laterToday', evening, tz).toISOString()).toBe('2026-10-15T05:00:00.000Z');
  });

  it('tomorrow / weekend / next week land on 09:00 local', () => {
    expect(snoozeUntil('tomorrow', now, tz).toISOString()).toBe('2026-10-15T05:00:00.000Z');
    expect(snoozeUntil('thisWeekend', now, tz).toISOString()).toBe('2026-10-17T05:00:00.000Z');
    expect(snoozeUntil('nextWeek', now, tz).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    // On a Monday "next week" is the following Monday, in UTC
    expect(snoozeUntil('nextWeek', new Date('2026-10-19T12:00:00.000Z'), 0).toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });
});

describe('mail: providers and folder roles', () => {
  it('guesses the provider from the address and exposes presets', () => {
    expect(providerForEmail('x@gmail.com')).toBe('GMAIL');
    expect(providerForEmail('x@hotmail.com')).toBe('OUTLOOK');
    expect(providerForEmail('x@mail.ru')).toBe('MAILRU');
    expect(providerForEmail('x@triad-vision.de')).toBe('CUSTOM');
    expect(presetFor('OUTLOOK')).toMatchObject({ smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false });
    expect(presetFor('GMAIL').hint).toContain('App Password');
  });

  it('detects folder roles from special-use flags and localized names', () => {
    expect(roleOfFolder({ path: 'INBOX', name: 'INBOX' })).toBe('INBOX');
    expect(roleOfFolder({ path: '[Gmail]/Sent Mail', name: 'Sent Mail', specialUse: '\\Sent' })).toBe('SENT');
    expect(roleOfFolder({ path: 'Gesendet', name: 'Gesendet' })).toBe('SENT');
    expect(roleOfFolder({ path: 'Корзина', name: 'Корзина' })).toBe('TRASH');
    expect(roleOfFolder({ path: 'Qaralamalar', name: 'Qaralamalar' })).toBe('DRAFTS');
    expect(roleOfFolder({ path: 'Spam', name: 'Spam' })).toBe('JUNK');
    expect(roleOfFolder({ path: 'Projects/2026', name: '2026' })).toBe('OTHER');
  });
});
