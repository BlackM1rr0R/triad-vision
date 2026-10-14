import type { Locale } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationType } from '../../src/lib/notifications.js';

const m = vi.hoisted(() => ({
  prisma: {
    case: { findUniqueOrThrow: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  sendMail: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));
vi.mock('../../src/lib/mailer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/mailer.js')>()),
  sendMail: m.sendMail,
}));
vi.mock('../../src/lib/push.js', () => ({ sendPush: m.sendPush, isExpoPushToken: () => true }));

const { notifyClient, notifyStaff, formatDateTime } = await import('../../src/lib/notifications.js');
const { config } = await import('../../src/config.js');

const TYPES = [
  'CASE_CREATED',
  'DOCS_CHANGES_REQUESTED',
  'CONTRACT_SENT',
  'CONTRACT_RESIGN_REQUESTED',
  'EMBASSY_DOCS_REQUESTED',
  'EMBASSY_CHANGES_REQUESTED',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REOPENED',
  'DOCUMENT_ACCEPTED',
  'DOCUMENT_REJECTED',
  'NEW_MESSAGE',
] as const satisfies readonly NotificationType[];
// Compile-time guard: fails type-checking if a NotificationType is added but not listed above.
type Missing = Exclude<NotificationType, (typeof TYPES)[number]>;
const exhaustive: [Missing] extends [never] ? true : false = true;

const LOCALES: Locale[] = ['az', 'de', 'en', 'ru'];
const IN_APP_ONLY = ['DOCUMENT_ACCEPTED', 'DOCUMENT_REJECTED'];

let locale: Locale = 'az';

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.case.findUniqueOrThrow.mockImplementation(async () => ({
    id: 'c1',
    number: 'TV-2026-0007',
    clientId: 'u1',
    client: { email: 'client@test.local', locale },
  }));
});

const render = async (type: NotificationType, l: Locale, params = {}) => {
  locale = l;
  m.prisma.notification.create.mockClear();
  await notifyClient('c1', type, params);
  return m.prisma.notification.create.mock.calls[0][0].data as { title: string; body: string; type: string; link: string; userId: string };
};

describe('notification catalog', () => {
  it('lists every NotificationType', () => {
    expect(exhaustive).toBe(true);
  });

  for (const type of TYPES) {
    it(`${type} has a distinct non-empty title and body in all 4 locales`, async () => {
      const seen = new Set<string>();
      for (const l of LOCALES) {
        const n = await render(type, l, { note: 'N', reason: 'R', date: 'D', place: 'P', doc: 'Doc' });
        expect(n.title.trim().length).toBeGreaterThan(3);
        expect(n.body.trim().length).toBeGreaterThan(10);
        expect(n.title).not.toContain('undefined');
        expect(n.body).not.toContain('undefined');
        expect(n).toMatchObject({ userId: 'u1', type, link: '/account/cases/c1' });
        seen.add(n.title);
      }
      expect(seen.size).toBe(4);
    });
  }

  it.each(LOCALES)('interpolates the case number into CASE_CREATED (%s)', async (l) => {
    expect((await render('CASE_CREATED', l)).title).toContain('TV-2026-0007');
  });

  const noteTypes: NotificationType[] = [
    'DOCS_CHANGES_REQUESTED',
    'CONTRACT_RESIGN_REQUESTED',
    'EMBASSY_CHANGES_REQUESTED',
    'REOPENED',
    'DOCUMENT_REJECTED',
    'APPOINTMENT_SCHEDULED',
  ];
  for (const type of noteTypes) {
    it.each(LOCALES)(`${type} includes the note only when given (%s)`, async (l) => {
      const withNote = await render(type, l, { note: 'Pasportu yenidən yükləyin', date: 'D', place: 'P', doc: 'X' });
      const without = await render(type, l, { date: 'D', place: 'P', doc: 'X' });
      expect(withNote.body).toContain('Pasportu yenidən yükləyin');
      expect(withNote.body.length).toBeGreaterThan(without.body.length);
      expect(without.body).not.toContain('null');
    });
  }

  for (const type of ['APPROVED', 'REJECTED', 'CANCELLED'] as const) {
    it.each(LOCALES)(`${type} interpolates the reason (%s)`, async (l) => {
      expect((await render(type, l, { reason: 'Maliyyə sübutu yoxdur' })).body).toContain('Maliyyə sübutu yoxdur');
    });
  }

  it.each(LOCALES)('APPOINTMENT_SCHEDULED interpolates date and place (%s)', async (l) => {
    const n = await render('APPOINTMENT_SCHEDULED', l, { date: '20.11.2026 09:30', place: 'Nizami küç. 15, Bakı' });
    expect(n.body).toContain('20.11.2026 09:30');
    expect(n.body).toContain('Nizami küç. 15, Bakı');
  });

  it.each(LOCALES)('DOCUMENT_ACCEPTED/REJECTED name the document (%s)', async (l) => {
    expect((await render('DOCUMENT_ACCEPTED', l, { doc: 'Pasport' })).body).toContain('Pasport');
    expect((await render('DOCUMENT_REJECTED', l, { doc: 'Pasport' })).body).toContain('Pasport');
  });
});

describe('notifyClient delivery', () => {
  for (const type of TYPES) {
    it(`${type}: in-app + push${IN_APP_ONLY.includes(type) ? ' only' : ' + email'}`, async () => {
      const n = await render(type, 'de', { note: 'x', doc: 'y', date: 'd', place: 'p' });
      expect(m.sendPush).toHaveBeenCalledWith(['u1'], expect.objectContaining({ title: n.title, data: expect.objectContaining({ caseId: 'c1', type }) }));
      if (IN_APP_ONLY.includes(type)) {
        expect(m.sendMail).not.toHaveBeenCalled();
      } else {
        expect(m.sendMail).toHaveBeenCalledWith('client@test.local', `Triad Vision · ${n.title}`, expect.stringContaining(`${config.clientUrl}/account/cases/c1`));
      }
    });
  }

  it('email body contains the localized call-to-action and is HTML-escaped', async () => {
    await render('DOCS_CHANGES_REQUESTED', 'ru', { note: '<script>alert(1)</script>' });
    const html = m.sendMail.mock.calls[0][2] as string;
    expect(html).toContain('Перейти в кабинет');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('notifyStaff', () => {
  it('stores in-app notifications for admins/assigned staff and emails the admin inbox', async () => {
    m.prisma.user.findMany.mockResolvedValue([{ id: 'a1' }, { id: 's1' }]);
    await notifyStaff('Subject', 'Body', { caseId: 'c1', link: '/admin/cases/c1' });
    expect(m.prisma.user.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, { assignedCases: { some: { id: 'c1' } } }],
      isActive: true,
    });
    expect(m.prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'a1', type: 'STAFF', title: 'Subject', caseId: 'c1' }),
        expect.objectContaining({ userId: 's1', type: 'STAFF' }),
      ],
    });
    expect(m.sendMail).toHaveBeenCalledWith(config.adminNotifyEmail, '[Triad Vision] Subject', expect.stringContaining('/admin/cases/c1'));
  });

  it('without a case only admins are notified, and nothing is stored when there are none', async () => {
    m.prisma.user.findMany.mockResolvedValue([]);
    await notifyStaff('S', 'B');
    expect(m.prisma.user.findMany.mock.calls[0][0].where).toEqual({ role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true });
    expect(m.prisma.notification.createMany).not.toHaveBeenCalled();
    expect(m.sendPush).not.toHaveBeenCalled();
    expect(m.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe('formatDateTime', () => {
  // 05:30 UTC is 09:30 in Baku (UTC+4, no DST)
  const d = new Date('2026-11-20T05:30:00Z');
  const expected: Record<Locale, RegExp> = {
    az: /noyabr/i,
    de: /November/,
    en: /November/,
    ru: /ноября/,
  };
  it.each(LOCALES)('formats in Baku time for %s', (l) => {
    const s = formatDateTime(d, l);
    expect(s).toContain('09:30');
    expect(s).toContain('2026');
    expect(s).toContain('20');
    expect(s).toMatch(expected[l]);
    expect(s.endsWith('(Bakı / GMT+4)')).toBe(true);
  });

  it('produces different strings per locale', () => {
    expect(new Set(LOCALES.map((l) => formatDateTime(d, l))).size).toBe(4);
  });
});
