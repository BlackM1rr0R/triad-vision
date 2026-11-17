import { describe, expect, it } from 'vitest';
import { STAFF_ROLES, WHATS_NEW_ENTRIES } from '../../src/lib/whatsNew/entries.js';
import { MODAL_MAX, NEW_USER_GRACE_DAYS, allEntries, buildFeed, entryInputSchema, type FeedEntry } from '../../src/lib/whatsNew/service.js';
import { KB_TARGET, MANUAL_REF, TRAINING_TASKS, TRAINING_TASK_IDS, evaluateTraining, matchTrainingPath } from '../../src/lib/staffOnboarding/tasks.js';
import { SETUP_ITEMS, evaluateSetup } from '../../src/lib/ownerSetup/items.js';
import { RELEASE_NOTES } from '../../src/lib/staffUi/index.js';

const LANGS = ['az', 'ru', 'en', 'de'] as const;
const CUID = 'cm3abcdefghijklmnopqrstu';

describe("what's new registry", () => {
  it('has 15–25+ entries with unique ids, all four languages, staff roles and an admin link', () => {
    expect(WHATS_NEW_ENTRIES.length).toBeGreaterThanOrEqual(15);
    const ids = WHATS_NEW_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of WHATS_NEW_ENTRIES) {
      expect(e.id).toMatch(/^[a-zA-Z0-9_.-]{1,40}$/); // fits the Setting "hidden" list and WhatsNewSeen.entryId
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.link).toMatch(/^\/admin/);
      expect(e.roles.length).toBeGreaterThan(0);
      for (const r of e.roles) expect(STAFF_ROLES).toContain(r);
      for (const l of LANGS) {
        expect(e.title[l].trim().length, `${e.id} title ${l}`).toBeGreaterThan(2);
        expect(e.body[l].trim().length, `${e.id} body ${l}`).toBeGreaterThan(20);
      }
    }
    // registry is newest first
    const dates = WHATS_NEW_ENTRIES.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('never claims apostille, translation or embassy appointment booking', () => {
    const all = JSON.stringify(WHATS_NEW_ENTRIES).toLowerCase();
    for (const w of ['apostil', 'termin buchen', 'book an appointment', 'перевод документов']) expect(all).not.toContain(w);
  });
});

describe("what's new feed", () => {
  const overrides = { hidden: [] as string[], extra: [] };
  const custom: FeedEntry = { id: 'custom1', date: '2026-11-20', source: 'custom', title: { az: 'T' }, body: { az: 'B' }, roles: ['STAFF'], link: null };
  const ctx = (o: Partial<Parameters<typeof buildFeed>[1]> = {}) => ({
    role: 'STAFF',
    seenIds: new Set<string>(),
    legacySeen: false,
    userCreatedAt: new Date('2026-11-01T00:00:00Z'),
    ...o,
  });

  it('merges code, custom and older entries newest first and filters by role', () => {
    const entries = allEntries([custom], overrides);
    expect(entries[0].id).toBe('custom1');
    expect(entries.some((e) => e.source === 'legacy' && e.id === RELEASE_NOTES[0].id)).toBe(true);
    const staff = buildFeed(entries, ctx());
    expect(staff.items.some((i) => i.id === '2026-11-data-freshness')).toBe(false); // ADMIN+ only
    expect(staff.items.some((i) => i.id === '2026-11-saas-onboarding')).toBe(false); // SUPER_ADMIN only
    const adminFeed = buildFeed(entries, ctx({ role: 'ADMIN' }));
    expect(adminFeed.items.some((i) => i.id === '2026-11-data-freshness')).toBe(true);
    expect(adminFeed.items.some((i) => i.id === 'custom1')).toBe(false); // custom entry is for STAFF only
  });

  it('marks seen ids, older notes once the old panel was opened, and keeps the modal short', () => {
    const entries = allEntries([], overrides);
    const fresh = buildFeed(entries, ctx());
    expect(fresh.unseen).toBe(fresh.items.length);
    expect(fresh.modal.length).toBe(Math.min(MODAL_MAX, fresh.unseen));
    const seenOne = buildFeed(entries, ctx({ seenIds: new Set(['2026-11-upload-links']) }));
    expect(seenOne.unseen).toBe(fresh.unseen - 1);
    expect(seenOne.items.find((i) => i.id === '2026-11-upload-links')!.seen).toBe(true);
    const legacy = buildFeed(entries, ctx({ legacySeen: true }));
    expect(legacy.items.filter((i) => i.source === 'legacy').every((i) => i.seen)).toBe(true);
  });

  it('does not flood new staff with entries from long before their account', () => {
    const created = new Date('2027-03-01T00:00:00Z');
    const feed = buildFeed(allEntries([custom], overrides), ctx({ userCreatedAt: created }));
    expect(feed.unseen).toBe(0);
    const recent = buildFeed(allEntries([{ ...custom, date: '2027-02-20' }], overrides), ctx({ userCreatedAt: created }));
    expect(recent.unseen).toBe(1); // within NEW_USER_GRACE_DAYS
    expect(NEW_USER_GRACE_DAYS).toBeGreaterThanOrEqual(7);
  });

  it('hides entries listed in the overrides', () => {
    const feed = buildFeed(allEntries([], { hidden: ['2026-11-upload-links'], extra: [] }), ctx());
    expect(feed.items.some((i) => i.id === '2026-11-upload-links')).toBe(false);
  });

  it('validates admin entries (az title required, staff roles, /admin links only)', () => {
    const ok = entryInputSchema.safeParse({ title: { az: 'Yeni' }, body: { az: 'Mətn' }, roles: ['STAFF'], link: '/admin/cases' });
    expect(ok.success).toBe(true);
    expect(entryInputSchema.safeParse({ title: { az: '' }, body: { az: 'x' }, roles: ['STAFF'] }).success).toBe(false);
    expect(entryInputSchema.safeParse({ title: { az: 'a' }, body: { az: 'x' }, roles: ['CLIENT'] }).success).toBe(false);
    expect(entryInputSchema.safeParse({ title: { az: 'a' }, body: { az: 'x' }, roles: ['STAFF'], link: 'https://evil.example' }).success).toBe(false);
    expect(entryInputSchema.safeParse({ title: { az: 'a' }, body: { az: 'x' }, roles: ['STAFF'], link: '//evil.example' }).success).toBe(false);
  });
});

describe('training checklist', () => {
  it('has the ten tasks with texts in four languages and links', () => {
    expect(TRAINING_TASKS).toHaveLength(10);
    expect(TRAINING_TASKS.map((t) => t.id)).toEqual([...TRAINING_TASK_IDS]);
    for (const t of TRAINING_TASKS) {
      expect(t.link).toMatch(/^\/admin/);
      for (const l of LANGS) expect(t.title[l] && t.how[l]).toBeTruthy();
    }
  });

  it('maps successful staff GET paths to tasks', () => {
    expect(matchTrainingPath(`/cases/${CUID}`)).toEqual({ taskId: 'openCase', ref: '' });
    expect(matchTrainingPath(`/clients/${CUID}`)).toEqual({ taskId: 'openCase', ref: '' });
    expect(matchTrainingPath(`/cases/${CUID}/embassy-package`)).toEqual({ taskId: 'embassyPackage', ref: '' });
    expect(matchTrainingPath('/canned-replies/picker?caseId=x')).toEqual({ taskId: 'cannedReply', ref: '' });
    expect(matchTrainingPath('/data-quality')).toEqual({ taskId: 'dataQuality', ref: '' });
    expect(matchTrainingPath('/command-search')).toEqual({ taskId: 'ctrlK', ref: '' });
    expect(matchTrainingPath(`/ops/kb/articles/${CUID}`)).toEqual({ taskId: 'kbArticles', ref: CUID });
    // list endpoints and other pages do not count
    for (const p of ['/cases', '/cases/export', '/cases/stats', `/cases/${CUID}/documents`, '/canned-replies', '/ops/kb/articles', '/ops/kb/search', '/data-qualityx']) expect(matchTrainingPath(p)).toBeNull();
  });

  it('evaluates auto detection, the 3-article KB target and manual ticks', () => {
    const none = evaluateTraining({ events: [], db: {} });
    expect(none).toMatchObject({ done: 0, total: 10, percent: 0, complete: false });
    const r = evaluateTraining({
      events: [
        { taskId: 'openCase', ref: '' },
        { taskId: 'kbArticles', ref: 'a1' },
        { taskId: 'kbArticles', ref: 'a2' },
        { taskId: 'ctrlK', ref: MANUAL_REF },
      ],
      db: { addNote: true, createTask: false },
    });
    const by = Object.fromEntries(r.tasks.map((t) => [t.id, t]));
    expect(by.openCase).toMatchObject({ done: true, auto: true, manual: false });
    expect(by.kbArticles).toMatchObject({ done: false, count: 2, target: KB_TARGET });
    expect(by.ctrlK).toMatchObject({ done: true, auto: false, manual: true });
    expect(by.addNote.done).toBe(true);
    expect(by.createTask.done).toBe(false);
    expect(r.done).toBe(3);
    const kb = evaluateTraining({ events: ['a1', 'a2', 'a3', 'a3'].map((ref) => ({ taskId: 'kbArticles', ref })), db: {} });
    expect(kb.tasks.find((t) => t.id === 'kbArticles')).toMatchObject({ done: true, count: 3 });
    const all = evaluateTraining({ events: TRAINING_TASK_IDS.map((taskId) => ({ taskId, ref: MANUAL_REF })), db: {} });
    expect(all).toMatchObject({ complete: true, percent: 100 });
  });
});

describe('owner setup checklist', () => {
  it('has unique items with four languages; manual items have no auto signal', () => {
    const ids = SETUP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const i of SETUP_ITEMS) {
      for (const l of LANGS) expect(i.title[l] && i.explain[l]).toBeTruthy();
      if (i.link) expect(i.link).toMatch(/^\/admin/);
      if (i.externalUrl) expect(i.externalUrl).toMatch(/^https:\/\//);
    }
    expect(SETUP_ITEMS.find((i) => i.id === 'jooble')!.optional).toBe(true);
  });

  const mark = (itemId: string, state: string) => ({ itemId, state, note: null, markedByName: 'Owner', markedAt: new Date('2026-11-20T10:00:00Z') });

  it('derives the state from signals and marks; optional items do not count', () => {
    const empty = evaluateSetup({}, []);
    expect(empty.items.every((i) => i.state === 'open')).toBe(true);
    expect(empty.total).toBe(SETUP_ITEMS.filter((i) => !i.optional).length);
    expect(empty.percent).toBe(0);

    const r = evaluateSetup(
      { googleReview: { ok: true }, studyProgrammes: { ok: false, detail: { drafts: 8, total: 8 } } },
      [mark('homeStat', 'done'), mark('tvToken', 'notNeeded'), mark('pastPlacements', 'done'), mark('jooble', 'notNeeded')],
    );
    const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(by.googleReview.state).toBe('done');
    expect(by.studyProgrammes).toMatchObject({ state: 'open', detail: { drafts: 8 } });
    expect(by.homeStat.state).toBe('done');
    expect(by.tvToken.state).toBe('notNeeded');
    expect(by.pastPlacements.state).toBe('open'); // auto items cannot be ticked "done" by hand
    expect(by.homeStat.mark).toMatchObject({ by: 'Owner', state: 'done' });
    expect(r.resolved).toBe(3); // googleReview, homeStat, tvToken (jooble is optional)
    expect(r.percent).toBe(Math.round((3 / r.total) * 100));

    const allDone = evaluateSetup(
      Object.fromEntries(SETUP_ITEMS.filter((i) => i.kind === 'auto').map((i) => [i.id, { ok: true }])),
      SETUP_ITEMS.filter((i) => i.kind === 'manual' && !i.optional).map((i) => mark(i.id, 'done')),
    );
    expect(allDone).toMatchObject({ complete: true, percent: 100 });
  });
});
