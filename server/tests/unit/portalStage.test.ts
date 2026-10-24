import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Client portal structure (client/src/lib/portalStage.ts): stage derivation, stage-aware sub-tabs, URL →
 * section mapping and badges. The client has no test runner; the module is pure and loaded by URL so the
 * server type-check does not pull client sources in.
 */

type Stage = 'LEAD' | 'PREPARING' | 'AT_EMBASSY' | 'TRAVEL' | 'IN_GERMANY' | 'CLOSED';
type Section = 'home' | 'documents' | 'messages' | 'learn' | 'profile';
type Ctx = { hasCase: boolean; hasOpenCase: boolean; hasSignatures: boolean; openDocActions: boolean };
type Badges = { unreadMessages: number; unreadNotifications: number; pendingSignatures: number; pendingLegal: number; actions: number };
interface PortalStage {
  SECTIONS: readonly Section[];
  SECTION_SUBS: Record<Section, readonly string[]>;
  derivePortalStage: (cases: { status: string; parentCaseId?: string | null }[], arrived: boolean) => Stage;
  visibleSubs: (stage: Stage, ctx: Ctx) => Record<Section, string[]>;
  subOfLocation: (pathname: string, search?: string) => string | null;
  sectionOfLocation: (pathname: string, search?: string) => Section | null;
  subPath: (sub: string, caseId: string | null, caseCount?: number) => string;
  sectionBadge: (section: Section, subs: readonly string[], b: Badges) => number;
}

let m: PortalStage;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/portalStage.ts');
  m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as PortalStage;
});

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ hasCase: true, hasOpenCase: true, hasSignatures: false, openDocActions: false, ...over });

describe('portal stage', () => {
  it('derives the stage from the cases and the arrival', () => {
    expect(m.derivePortalStage([], false)).toBe('LEAD');
    expect(m.derivePortalStage([{ status: 'DOCUMENTS_PENDING' }], false)).toBe('PREPARING');
    expect(m.derivePortalStage([{ status: 'CONTRACT_SIGNED' }], false)).toBe('PREPARING');
    expect(m.derivePortalStage([{ status: 'EMBASSY_DOCUMENTS' }], false)).toBe('PREPARING');
    expect(m.derivePortalStage([{ status: 'EMBASSY_REVIEW' }], false)).toBe('AT_EMBASSY');
    expect(m.derivePortalStage([{ status: 'DECISION_PENDING' }], false)).toBe('AT_EMBASSY');
    expect(m.derivePortalStage([{ status: 'APPROVED' }], false)).toBe('TRAVEL');
    expect(m.derivePortalStage([{ status: 'APPROVED' }], true)).toBe('IN_GERMANY');
    expect(m.derivePortalStage([{ status: 'REJECTED' }, { status: 'CANCELLED' }], false)).toBe('CLOSED');
  });

  it('precedence: Germany > open main case > approval > open family-member case', () => {
    // A renewal case in Germany stays IN_GERMANY.
    expect(m.derivePortalStage([{ status: 'DOCUMENTS_PENDING' }, { status: 'APPROVED' }], true)).toBe('IN_GERMANY');
    // A new main application after an old approval.
    expect(m.derivePortalStage([{ status: 'APPOINTMENT_SCHEDULED' }, { status: 'APPROVED' }], false)).toBe('AT_EMBASSY');
    // Approved main applicant with a spouse still collecting documents: travel preparation.
    expect(m.derivePortalStage([{ status: 'DOCUMENTS_PENDING', parentCaseId: 'a' }, { status: 'APPROVED' }], false)).toBe('TRAVEL');
    expect(m.derivePortalStage([{ status: 'EMBASSY_REVIEW', parentCaseId: 'a' }, { status: 'REJECTED' }], false)).toBe('AT_EMBASSY');
  });

  it('every section keeps at least one page for every stage', () => {
    const stages: Stage[] = ['LEAD', 'PREPARING', 'AT_EMBASSY', 'TRAVEL', 'IN_GERMANY', 'CLOSED'];
    for (const s of stages) {
      const subs = m.visibleSubs(s, ctx({ hasCase: s !== 'LEAD', hasOpenCase: s === 'PREPARING' || s === 'AT_EMBASSY' }));
      for (const sec of m.SECTIONS) expect(subs[sec].length, `${s}/${sec}`).toBeGreaterThan(0);
    }
  });

  it('pre-approval: no arrival / onboarding; waiting room, interview prep and job tools are there', () => {
    const subs = m.visibleSubs('PREPARING', ctx());
    expect(subs.home).toEqual(['overview', 'application']);
    expect(subs.learn).toEqual(expect.arrayContaining(['waitingRoom', 'interviewPrep', 'jobs', 'cv', 'letters', 'german', 'guides']));
    expect(subs.documents).toContain('caseDocs');
    expect(subs.messages).toEqual(['chat', 'notifications']);
  });

  it('travel: arrival plan and onboarding appear, the waiting room goes', () => {
    const subs = m.visibleSubs('TRAVEL', ctx({ hasOpenCase: false }));
    expect(subs.home).toEqual(['overview', 'application', 'arrival', 'onboarding']);
    expect(subs.learn).not.toContain('waitingRoom');
    expect(subs.learn).not.toContain('jobs');
  });

  it('in Germany: onboarding and family, document collection only while something is open', () => {
    const closed = m.visibleSubs('IN_GERMANY', ctx({ hasOpenCase: false }));
    expect(closed.home).toEqual(['overview', 'application', 'onboarding']);
    expect(closed.documents).not.toContain('caseDocs');
    expect(closed.documents).toEqual(expect.arrayContaining(['vault', 'letterExplain']));
    expect(closed.profile).toContain('family');
    expect(closed.learn).toEqual(['german', 'guides']);
    expect(m.visibleSubs('IN_GERMANY', ctx({ hasOpenCase: false, openDocActions: true })).documents).toContain('caseDocs');
    expect(m.visibleSubs('IN_GERMANY', ctx({ hasOpenCase: true })).documents).toContain('caseDocs');
  });

  it('lead: no case pages, signatures only once something was sent', () => {
    const subs = m.visibleSubs('LEAD', ctx({ hasCase: false, hasOpenCase: false }));
    expect(subs.home).toEqual(['overview']);
    expect(subs.messages).toEqual(['notifications']);
    expect(subs.documents).toEqual(['vault', 'translations', 'letterExplain']);
    expect(subs.profile).not.toContain('family');
    expect(m.visibleSubs('LEAD', ctx({ hasCase: false, hasSignatures: true })).documents[0]).toBe('signatures');
  });

  it('maps every portal URL (old ones included) to its section', () => {
    expect(m.sectionOfLocation('/account')).toBe('home');
    expect(m.sectionOfLocation('/account/')).toBe('home');
    expect(m.sectionOfLocation('/account/cases/abc')).toBe('home');
    expect(m.sectionOfLocation('/account/cases/abc', '?tab=docs')).toBe('documents');
    expect(m.subOfLocation('/account/cases/abc', '?tab=messages')).toBe('chat');
    expect(m.sectionOfLocation('/account/cases/abc', '?tab=family')).toBe('profile');
    expect(m.sectionOfLocation('/account/cases/abc/forms/f1')).toBe('home');
    expect(m.sectionOfLocation('/account/letters-explain')).toBe('documents');
    expect(m.sectionOfLocation('/account/letters/new')).toBe('learn');
    expect(m.sectionOfLocation('/account/translations/order/1')).toBe('documents');
    expect(m.sectionOfLocation('/account/signatures/s1')).toBe('documents');
    expect(m.sectionOfLocation('/account/notifications')).toBe('messages');
    expect(m.sectionOfLocation('/account/applications')).toBe('learn');
    expect(m.sectionOfLocation('/account/waiting-room')).toBe('learn');
    expect(m.sectionOfLocation('/account/privacy')).toBe('profile');
    expect(m.sectionOfLocation('/account/referral')).toBe('profile');
    expect(m.sectionOfLocation('/admin')).toBeNull();
    // Every sub-tab's link points back to the same sub-tab.
    for (const sec of m.SECTIONS) {
      for (const sub of m.SECTION_SUBS[sec]) {
        if (sub === 'family') continue; // hash link, resolved by the case page
        const [p, q = ''] = m.subPath(sub, 'c1').split('?');
        expect(m.subOfLocation(p, q ? `?${q}` : ''), sub).toBe(sub);
      }
    }
    expect(m.subPath('application', 'c1', 3)).toBe('/account/cases');
    expect(m.subPath('chat', null)).toBe('/account');
  });

  it('badges: sums per section, messages take the larger count (a chat message is also a notification)', () => {
    const b = { unreadMessages: 2, unreadNotifications: 3, pendingSignatures: 1, pendingLegal: 1, actions: 4 };
    const subs = ['overview', 'chat', 'notifications', 'signatures', 'vault', 'privacy', 'personal'];
    expect(m.sectionBadge('messages', subs, b)).toBe(3);
    expect(m.sectionBadge('documents', subs, b)).toBe(1);
    expect(m.sectionBadge('profile', subs, b)).toBe(1);
    expect(m.sectionBadge('home', subs, b)).toBe(4);
    expect(m.sectionBadge('learn', subs, b)).toBe(0);
    // A hidden sub-tab does not count.
    expect(m.sectionBadge('documents', ['vault'], b)).toBe(0);
  });
});
