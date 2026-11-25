import { describe, expect, it } from 'vitest';
import { canDelete, canRead, canSend, resolveMailAccess } from '../../src/lib/mail/access.js';
import { classifyRoute } from '../../src/lib/access/routeMap.js';
import { mailAccessText } from '../../src/lib/mail/accessTexts.js';

/** Shared workspace mailboxes (lib/mail/access): who may open / send from which mailbox. */
describe('resolveMailAccess', () => {
  const owner = 'u-owner';

  it('gives the owner full access, whatever the role', () => {
    for (const role of ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const) expect(resolveMailAccess({ id: owner, role }, owner, null)).toBe('OWNER');
  });

  it('keeps colleagues out without a grant (STAFF and ADMIN alike)', () => {
    expect(resolveMailAccess({ id: 'x', role: 'STAFF' }, owner, null)).toBeNull();
    expect(resolveMailAccess({ id: 'x', role: 'ADMIN' }, owner, undefined)).toBeNull();
  });

  it('lets a SUPER_ADMIN read every mailbox, and send only with a SEND grant', () => {
    expect(resolveMailAccess({ id: 'sa', role: 'SUPER_ADMIN' }, owner, null)).toBe('READ');
    expect(resolveMailAccess({ id: 'sa', role: 'SUPER_ADMIN' }, owner, 'READ')).toBe('READ');
    expect(resolveMailAccess({ id: 'sa', role: 'SUPER_ADMIN' }, owner, 'SEND')).toBe('SEND');
  });

  it('follows the grant level for staff and admins', () => {
    expect(resolveMailAccess({ id: 'x', role: 'STAFF' }, owner, 'READ')).toBe('READ');
    expect(resolveMailAccess({ id: 'x', role: 'ADMIN' }, owner, 'SEND')).toBe('SEND');
  });

  it('never opens a mailbox to non-staff roles, even with a stale grant', () => {
    for (const role of ['CLIENT', 'COMPANY', 'AGENT'] as const) {
      expect(resolveMailAccess({ id: 'x', role }, owner, 'SEND')).toBeNull();
      expect(resolveMailAccess({ id: owner, role }, owner, null)).toBeNull();
    }
  });

  it('separates reading from sending', () => {
    expect([canRead('READ'), canSend('READ')]).toEqual([true, false]);
    expect([canRead('SEND'), canSend('SEND')]).toEqual([true, true]);
    expect([canRead('OWNER'), canSend('OWNER')]).toEqual([true, true]);
    expect([canRead(null), canSend(null)]).toEqual([false, false]);
  });
});

describe('deleting in a shared mailbox', () => {
  it('stays with the owner: a SEND grant may not trash or delete', () => {
    expect([canDelete('OWNER'), canDelete('SEND'), canDelete('READ'), canDelete(null)]).toEqual([true, false, false, false]);
    expect(canDelete(resolveMailAccess({ id: 'x', role: 'ADMIN' }, 'u-owner', 'SEND'))).toBe(false);
    expect(canDelete(resolveMailAccess({ id: 'u-owner', role: 'STAFF' }, 'u-owner', null))).toBe(true);
  });
});

describe('shared mailboxes: routes and texts', () => {
  it('maps the grant routes to the self-checking Access Center and the mail routes to communications', () => {
    expect(classifyRoute('POST', '/admin/access/mailboxes/grants')).toEqual({ self: true });
    expect(classifyRoute('GET', '/mail/mailboxes')).toEqual({ area: 'communications', action: 'view' });
    expect(classifyRoute('GET', '/mail/accounts/abc/access')).toEqual({ area: 'communications', action: 'view' });
  });

  it('has the notices in every server language (az default)', () => {
    expect(mailAccessText('de').level.SEND).toBe('Lesen und senden');
    expect(mailAccessText('xx').level.READ).toBe('Oxu');
    expect(mailAccessText(null).userGrantedTitle('a@b.az')).toContain('a@b.az');
  });
});
