// API fixtures for scripts/ci/visual.mjs: every /api request of a screenshot is answered from here (never
// from a real server), so pages render the same on every run. Unknown requests get 404 — run the visual
// script with --log-api to list what a page asks for (404 = no fixture yet).
//
// A route is [method, path, body] where path is a string ("/api/x", exact, query ignored) or a RegExp,
// and body is a value or a function ({ user, query, match, shot }) => value | { status, body }. The first
// match wins. Dates are fixed and lie before the frozen "now" of the screenshots (2026-01-15 10:00 UTC).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const json = (file) => JSON.parse(fs.readFileSync(path.join(here, file), 'utf8'));

const l10n = (az, de) => ({ az, de, en: de, ru: de });
const base = json('public-content.json');
const [visa0, visa1] = base.visaCategories;
const [svc0, svc1] = base.services;
// Five visa types and four services: the grids get a full row plus a centred, incomplete one.
const publicContent = {
  ...base,
  visaCategories: [
    ...base.visaCategories,
    { ...visa0, id: 'visa-3', slug: 'chancenkarte', icon: 'Plane', visaLabel: '§20a', title: l10n('Chancenkarte', 'Chancenkarte'), summary: l10n('Almaniyada iş axtarmaq üçün xal sistemli viza.', 'Punktebasiertes Visum zur Arbeitssuche.'), germanLevel: 'A1', sortOrder: 3 },
    { ...visa1, id: 'visa-4', slug: 'ausbildung', icon: 'GraduationCap', visaLabel: '§16a', title: l10n('Ausbildung', 'Ausbildung'), summary: l10n('Almaniyada ödənişli peşə təhsili və sonra iş.', 'Bezahlte Berufsausbildung und danach Arbeit.'), germanLevel: 'B1', sortOrder: 4 },
  ],
  services: [
    ...base.services.map((sv) => (sv.icon === 'FileCheck' ? { ...sv, icon: 'FileCheck2' } : sv)), // icon names: client/src/components/ui/Icon.tsx
    { ...svc1, id: 'sv-3', slug: 'recognition', icon: 'Award', title: l10n('Diplomun tanınması', 'Anerkennung'), summary: l10n('Peşə diplomunun Almaniyada tanınması.', 'Anerkennung des Berufsabschlusses.'), sortOrder: 2 },
    { ...svc0, id: 'sv-4', slug: 'relocation', icon: 'House', title: l10n('Köçmə və yaşayış', 'Relocation'), summary: l10n('Mənzil, qeydiyyat və ilk həftələr.', 'Wohnung, Anmeldung und die ersten Wochen.'), sortOrder: 3 },
  ],
};

const security = { emailVerified: true, twoFactorEnabled: true, twoFactorRequired: false, emailOtpEnabled: false };

/** Signed-in users of the shots (shot.user). */
export const USERS = {
  client: {
    id: 'user-client',
    email: 'leyla.mammadova@example.com',
    role: 'CLIENT',
    firstName: 'Leyla',
    lastName: 'Məmmədova',
    phone: '+994 50 123 45 67',
    locale: 'az',
    birthDate: '1994-03-12',
    nationality: 'AZ',
    city: 'Bakı',
    profession: 'Tibb bacısı',
    experienceYears: 6,
    germanLevel: 'B1',
    emailNotifications: true,
    createdAt: '2025-09-01T09:00:00.000Z',
    ...security,
  },
  admin: {
    id: 'user-admin',
    email: 'admin@example.com',
    role: 'SUPER_ADMIN',
    firstName: 'Elvin',
    lastName: 'Əliyev',
    phone: null,
    locale: 'az',
    createdAt: '2024-01-10T09:00:00.000Z',
    ...security,
  },
};

const session = { id: 'sess-1', createdAt: '2026-01-15T09:00:00.000Z', expiresAt: '2026-01-15T11:00:00.000Z' };
const staff = { id: 'user-staff', firstName: 'Nigar', lastName: 'Hüseynova' };
const visaRef = (i) => {
  const v = publicContent.visaCategories[i];
  return { id: v.id, slug: v.slug, title: v.title, visaLabel: v.visaLabel };
};

// ── client portal ───────────────────────────────────────────────────────────
const clientCase = {
  id: 'case-1',
  number: 'TV-2025-0142',
  profession: 'Tibb bacısı',
  visaType: 'WORK',
  status: 'EMBASSY_DOCUMENTS',
  createdAt: '2025-10-02T08:30:00.000Z',
  updatedAt: '2026-01-12T14:10:00.000Z',
  decisionAt: null,
  visaCategory: visaRef(1),
  relation: null,
  parentCaseId: null,
};
const docItems = [
  ['d1', 'Pasport', 'accepted'],
  ['d2', 'Diplom (tərcümə ilə)', 'accepted'],
  ['d3', 'Əmək müqaviləsi', 'pending'],
  ['d4', 'Tibbi sığorta', 'missing'],
  ['d5', 'B1 sertifikatı', 'rejected'],
].map(([id, az, state]) => ({ id, title: l10n(az, az), required: true, state, note: state === 'rejected' ? 'Surət oxunmur, yenidən yükləyin.' : null }));

const accountOverview = ({ user }) => ({
  user,
  profile: { percent: 70, missing: ['address', 'education', 'about'] },
  activeCase: {
    ...clientCase,
    step: 5,
    stepCount: 9,
    percent: 55,
    turn: 'client',
    nextAction: { kind: 'UPLOAD_DOCUMENTS', owner: 'client', anchor: 'documents' },
    staffNote: null,
    documents: { stage: 'EMBASSY', total: 5, required: 5, uploaded: 4, requiredUploaded: 4, accepted: 2, rejected: 1, missingRequired: 1, items: docItems },
    appointment: null,
    manager: { firstName: staff.firstName, lastName: staff.lastName },
    contract: { version: 1, sentAt: '2025-11-03T10:00:00.000Z', signedAt: '2025-11-05T16:20:00.000Z' },
    stats: { ageDays: 105, daysInStatus: 9, messages: 14, events: 23, uploads: 11 },
  },
  cases: [clientCase],
  notifications: {
    unread: 1,
    items: [{ id: 'n1', type: 'DOCUMENT_REJECTED', title: 'Sənəd qəbul edilmədi', body: 'B1 sertifikatı: surət oxunmur.', link: '/account/cases/case-1', readAt: null, createdAt: '2026-01-14T09:12:00.000Z' }],
  },
  lastMessage: { id: 'm1', caseId: 'case-1', caseNumber: clientCase.number, body: 'Salam Leyla, səfirlik üçün sənədlərin siyahısını yenilədik.', createdAt: '2026-01-13T11:40:00.000Z', fromTeam: true, author: { firstName: staff.firstName, lastName: staff.lastName } },
});

const nextStep = {
  case: { id: clientCase.id, number: clientCase.number, status: clientCase.status, visaType: 'WORK', step: 5, stepCount: 9 },
  progress: 55,
  milestone: null,
  arrived: false,
  arrivedAt: null,
  onboarding: null,
  journey: null,
  primary: { kind: 'FIX_DOCS', to: '/account/cases/case-1#documents', dueAt: '2026-01-22T00:00:00.000Z', overdue: false, count: 1, detail: null },
  secondary: [{ kind: 'UPLOAD_DOCS', to: '/account/cases/case-1#documents', dueAt: null, overdue: false, count: 1, detail: null }],
  waiting: null,
  counts: { actions: 2, unreadMessages: 1, unreadNotifications: 1, pendingSignatures: 0, pendingLegal: 0, openCheckIns: 0, openInvoices: 0, hasBilling: false },
};

// ── admin: cases ────────────────────────────────────────────────────────────
const people = [
  ['Leyla', 'Məmmədova', 'Tibb bacısı', 'EMBASSY_DOCUMENTS', 1],
  ['Rəşad', 'Quliyev', 'LKW sürücüsü', 'DOCUMENTS_REVIEW', 0],
  ['Aysel', 'Həsənova', 'Aşpaz', 'CONTRACT_SENT', 2],
  ['Tural', 'Babayev', 'Elektrik', 'APPOINTMENT_SCHEDULED', 2],
  ['Günel', 'İsmayılova', 'Tibb bacısı', 'DECISION_PENDING', 1],
  ['Orxan', 'Nəsirov', 'Qaynaqçı', 'DOCUMENTS_PENDING', 2],
  ['Səbinə', 'Rzayeva', 'Otel işçisi', 'APPROVED', 0],
  ['Kamran', 'Əhmədov', 'LKW sürücüsü', 'EMBASSY_REVIEW', 0],
];
const day = (month, d) => `${month}-${String(d).padStart(2, '0')}T10:00:00.000Z`;
const caseRows = people.map(([firstName, lastName, profession, status, visa], i) => ({
  id: `case-${i + 1}`,
  number: `TV-2025-${String(142 - i * 7).padStart(4, '0')}`,
  profession,
  status,
  createdAt: day(`2025-${String(9 + (i % 3)).padStart(2, '0')}`, 3 + i * 3),
  updatedAt: day('2026-01', 14 - i),
  client: { firstName, lastName, email: `client${i + 1}@example.com`, phone: `+994 50 000 00 ${10 + i}` },
  assignedStaff: i % 3 === 2 ? null : { firstName: staff.firstName, lastName: staff.lastName },
  visaCategory: visaRef(visa),
  lastEvent: { type: 'STATUS_CHANGED', createdAt: day('2026-01', 14 - i), actor: { role: 'STAFF' } },
  messagesCount: (i * 5) % 17,
  pendingDocs: i % 4,
  statusSince: day('2026-01', 6 - (i % 5)),
  daysInStatus: 9 + (i % 5),
  ageDays: 60 + i * 9,
  nextStep: null,
  ballInCourt: null,
  processing: null,
}));
const statusCounts = caseRows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

const caseDoc = (id, name, stage, status, requirementId, createdAt) => ({
  id,
  caseId: 'case-1',
  requirementId,
  stage,
  originalName: name,
  mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
  size: 240_000 + id.length * 31_000,
  status,
  reviewNote: status === 'REJECTED' ? 'Surət oxunmur.' : null,
  uploadedById: 'user-client',
  createdAt,
});
const requirement = (id, stage, az, docs, sortOrder) => ({ id, stage, title: l10n(az, az), description: null, required: true, sortOrder, documents: docs });
const actorStaff = { firstName: staff.firstName, lastName: staff.lastName, role: 'STAFF' };
const caseDetail = {
  case: {
    ...caseRows[0],
    staffNote: 'Diplomun tanınması tamamlandı (Anerkennungsbescheid 12.12.2025).',
    appointmentAt: null,
    appointmentPlace: null,
    decisionAt: null,
    decisionReason: null,
    visaValidFrom: null,
    visaValidTo: null,
    cancelReason: null,
    client: { id: 'user-client', ...caseRows[0].client, locale: 'az' },
    assignedStaff: staff,
    requirements: [
      requirement('r1', 'INITIAL', 'Pasport', [caseDoc('doc-1', 'pasport.pdf', 'INITIAL', 'ACCEPTED', 'r1', '2025-10-03T09:00:00.000Z')], 0),
      requirement('r2', 'INITIAL', 'Diplom (tərcümə ilə)', [caseDoc('doc-2', 'diplom-tercume.pdf', 'INITIAL', 'ACCEPTED', 'r2', '2025-10-04T09:00:00.000Z')], 1),
      requirement('r3', 'EMBASSY', 'B1 sertifikatı', [caseDoc('doc-3', 'b1-sertifikat.jpg', 'EMBASSY', 'REJECTED', 'r3', '2026-01-10T09:00:00.000Z')], 2),
      requirement('r4', 'EMBASSY', 'Tibbi sığorta', [], 3),
    ],
    otherDocuments: [],
    contract: null,
    events: [
      { id: 'e2', type: 'STATUS_CHANGED', fromStatus: 'CONTRACT_SIGNED', toStatus: 'EMBASSY_DOCUMENTS', note: null, visibleToClient: true, createdAt: '2026-01-06T10:00:00.000Z', actor: actorStaff },
      { id: 'e1', type: 'CASE_CREATED', fromStatus: null, toStatus: 'DOCUMENTS_PENDING', note: null, visibleToClient: true, createdAt: '2025-10-02T08:30:00.000Z', actor: { firstName: 'Leyla', lastName: 'Məmmədova', role: 'CLIENT' } },
    ],
    messages: [
      { id: 'msg-1', body: 'Salam, B1 sertifikatını yenidən yüklədim.', createdAt: '2026-01-12T08:00:00.000Z', author: { id: 'user-client', firstName: 'Leyla', lastName: 'Məmmədova', role: 'CLIENT' } },
      { id: 'msg-2', body: 'Təşəkkürlər, yoxlayırıq.', createdAt: '2026-01-12T09:30:00.000Z', author: { id: staff.id, ...actorStaff } },
    ],
  },
  stats: {
    ageDays: 105,
    daysInStatus: 9,
    statusSince: '2026-01-06T10:00:00.000Z',
    statusHistory: [
      { status: 'DOCUMENTS_PENDING', enteredAt: '2025-10-02T08:30:00.000Z', days: 14, current: false },
      { status: 'DOCUMENTS_REVIEW', enteredAt: '2025-10-16T08:30:00.000Z', days: 18, current: false },
      { status: 'CONTRACT_SENT', enteredAt: '2025-11-03T10:00:00.000Z', days: 2, current: false },
      { status: 'CONTRACT_SIGNED', enteredAt: '2025-11-05T16:20:00.000Z', days: 62, current: false },
      { status: 'EMBASSY_DOCUMENTS', enteredAt: '2026-01-06T10:00:00.000Z', days: 9, current: true },
    ],
    statusChanges: 4,
    daysToDecision: null,
    documents: { total: 3, pending: 0, accepted: 2, rejected: 1, bytes: 1_350_000, requiredTotal: 4, requiredAccepted: 2, lastUploadAt: '2026-01-10T09:00:00.000Z' },
    messages: { total: 2, fromClient: 1, fromStaff: 1, lastClientAt: '2026-01-12T08:00:00.000Z', lastStaffAt: '2026-01-12T09:30:00.000Z', awaitingStaffReply: false },
    lastActivity: { type: 'MESSAGE', at: '2026-01-12T09:30:00.000Z', byRole: 'STAFF' },
    eventsTotal: 23,
  },
};

// ── workspace drive ─────────────────────────────────────────────────────────
const node = (id, name, kind, extra = {}) => ({
  id,
  kind,
  name,
  space: 'SHARED',
  parentId: 'drv-shared',
  system: false,
  virtual: false,
  color: null,
  mimeType: null,
  size: null,
  version: 1,
  createdAt: '2025-11-02T09:00:00.000Z',
  updatedAt: '2026-01-12T15:30:00.000Z',
  createdBy: staff,
  ownerId: null,
  inheritPermissions: true,
  myAccess: 'MANAGE',
  previewable: false,
  starred: false,
  tags: [],
  ...extra,
});
const sharedRoot = node('drv-shared', 'Gemeinsame Dokumente', 'FOLDER', { parentId: null, system: true, childCount: 10 });
const sections = {
  cases: node('drv-cases', 'Anträge', 'FOLDER', { system: true, childCount: 42 }),
  partners: node('drv-partners', 'Partner', 'FOLDER', { system: true, childCount: 6 }),
  staff: node('drv-staff', 'Mitarbeiter', 'FOLDER', { system: true, childCount: 5 }),
  templates: node('drv-templates', 'Vorlagen', 'FOLDER', { system: true, childCount: 18 }),
};
const driveItems = [
  ...Object.values(sections),
  node('drv-f1', 'Buchhaltung 2025', 'FOLDER', { color: 'green', childCount: 12 }),
  node('drv-f2', 'Marketing', 'FOLDER', { color: 'violet', childCount: 7 }),
  node('drv-p1', 'Preisliste 2026.pdf', 'FILE', { mimeType: 'application/pdf', size: 482_133 }),
  node('drv-p2', 'Kundenübersicht.xlsx', 'FILE', { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 91_402, starred: true }),
  node('drv-p3', 'Arbeitsvertrag Vorlage.docx', 'FILE', { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 57_310 }),
  node('drv-p4', 'Notizen.txt', 'FILE', { mimeType: 'text/plain', size: 2_310 }),
];
const limits = { maxFileBytes: 50 * 1024 * 1024, trashDays: 30 };
const driveRoots = {
  shared: sharedRoot,
  ...sections,
  clients: null,
  tasks: null,
  sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.id])),
  limits,
};
const rootCrumb = { id: sharedRoot.id, name: sharedRoot.name, space: 'SHARED', system: true, ownerId: null, myAccess: 'MANAGE' };

// ── public vacancies ────────────────────────────────────────────────────────
const vacancy = (i, slug, az, de, sector, city, level, min, max, type, visa) => ({
  id: `vac-${i}`,
  slug,
  title: l10n(az, de),
  description: l10n('Almaniyada stabil iş, mənzil axtarışında dəstək.', 'Feste Stelle in Deutschland, Hilfe bei der Wohnungssuche.'),
  requirements: null,
  benefits: null,
  sector,
  city,
  profession: de,
  germanLevel: level,
  minExperience: 2,
  drivingLicence: sector === 'logistics' ? 'CE' : null,
  salaryMin: min,
  salaryMax: max,
  positions: 1 + (i % 4),
  employmentType: type,
  datePosted: `2026-01-${String(12 - i).padStart(2, '0')}`,
  validThrough: '2026-03-31',
  companyName: null,
  visaCategory: visa === null ? null : visaRef(visa),
});
const vacancies = [
  vacancy(1, 'lkw-fahrer-hamburg', 'LKW sürücüsü (CE)', 'LKW-Fahrer (CE)', 'logistics', 'Hamburg', 'A2', 2800, 3400, 'FULL_TIME', 0),
  vacancy(2, 'pflegefachkraft-muenchen', 'Tibb bacısı', 'Pflegefachkraft', 'healthcare', 'München', 'B1', 3300, 3900, 'FULL_TIME', 1),
  vacancy(3, 'elektriker-berlin', 'Elektrik ustası', 'Elektriker', 'construction', 'Berlin', 'A2', 2900, 3500, 'FULL_TIME', 2),
  vacancy(4, 'koch-koeln', 'Aşpaz', 'Koch', 'hospitality', 'Köln', 'A2', 2500, 2900, 'FULL_TIME', null),
  vacancy(5, 'erntehelfer-bayern', 'Mövsümi kənd təsərrüfatı işçisi', 'Erntehelfer', 'agriculture', 'Bayern', 'none', 2100, 2300, 'SEASONAL', null),
  vacancy(6, 'ausbildung-pflege', 'Ausbildung: tibb bacısı', 'Ausbildung Pflege', 'healthcare', 'Stuttgart', 'B1', 1200, 1400, 'AUSBILDUNG', 4),
];
const facet = (key) => Object.entries(vacancies.reduce((a, v) => ({ ...a, [v[key]]: (a[v[key]] ?? 0) + 1 }), {})).map(([value, count]) => ({ value, count }));

/** @type {[string, string | RegExp, unknown][]} */
const ROUTES = [
  // shared
  ['GET', '/api/public/content', publicContent],
  ['GET', '/api/auth/me', ({ user }) => ({ user, session: user ? session : undefined })],
  ['GET', '/api/notifications', { items: [], unread: 0, total: 0 }],
  ['GET', '/api/legal/me/pending', { pending: [], blocking: false }],
  ['POST', '/api/track', { status: 204, body: '' }],
  ['POST', '/api/admin/me/nav/visit', { status: 204, body: '' }],
  ['POST', /^\/api\/admin\/presence\//, { viewers: [] }],

  // public
  ['GET', '/api/vacancies', { items: vacancies, total: vacancies.length, page: 1, pageSize: 12, facets: { sectors: facet('sector'), cities: facet('city') } }],
  ['GET', '/api/job-alerts/options', { professions: [], germanLevels: ['none', 'A1', 'A2', 'B1', 'B2'], kinds: ['work', 'ausbildung', 'seasonal'], suggested: null }],

  // client portal
  ['GET', '/api/account/overview', accountOverview],
  ['GET', '/api/account/next-step', nextStep],
  ['GET', '/api/signatures/my', { items: [] }],

  // admin / workspace
  ['GET', '/api/admin/cases', { items: caseRows, total: caseRows.length, pageSize: 25, counts: statusCounts }],
  ['GET', '/api/admin/cases/case-1', caseDetail],
  ['GET', '/api/drive/roots', driveRoots],
  ['GET', '/api/drive/stats', { shared: { files: 1284, bytes: 3_912_000_000 }, trash: { files: 12, bytes: 18_000_000 }, total: null, versions: null, limits }],
  ['GET', '/api/drive/tags', { tags: [], colors: ['blue', 'green', 'amber', 'red', 'violet'], canManage: true }],
  ['GET', '/api/drive/smart-folders', { items: [], canManageShared: true }],
  ['GET', '/api/drive/naming', { enabled: false, pattern: '', tokens: [], docTypes: [], canManage: true }],
  ['GET', `/api/drive/nodes/${sharedRoot.id}/children`, { folder: sharedRoot, path: [rootCrumb], truncated: false, items: driveItems }],
];

/** Finds the fixture for one request; returns { status, body } or null (-> 404). */
export const resolveFixture = ({ method, path: p, query, user, shot }) => {
  for (const [m, pattern, body] of ROUTES) {
    if (m !== method) continue;
    const match = typeof pattern === 'string' ? (pattern === p ? [p] : null) : p.match(pattern);
    if (!match) continue;
    const value = typeof body === 'function' ? body({ user, query, match, shot }) : body;
    if (value && typeof value === 'object' && 'status' in value && 'body' in value) return value;
    return { status: 200, body: value };
  }
  return null;
};
