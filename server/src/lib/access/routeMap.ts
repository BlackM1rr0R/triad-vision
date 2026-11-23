import type { Action, Area } from './types.js';

/**
 * Central route → permission table for every staff API route. Paths are relative to /api (the guard is
 * mounted there): '/admin/cases/:id', '/drive/...', '/files/:docId'.
 *
 *  - action from the method: GET / HEAD = view, POST / PUT / PATCH = edit, DELETE = delete; any download
 *    (export, csv, xlsx, pdf, …) = export; a few POST endpoints that only read (preview / resolve) = view.
 *  - 'self' = personal or neutral pages every staff member keeps (own nav, own time, presence, training, …)
 *    and routers that check access themselves (the Access Center).
 *  - The first matching rule wins, so specific sub-paths come before their router prefix.
 *
 * Role checks in the routes (ADMIN+ / SUPER_ADMIN pages) stay as they are, on top of this table.
 * tests/unit/accessRouteMap.test.ts walks the mounted admin router and fails on any route this table misses.
 */

export type RouteTarget = Area | 'self';

interface Rule {
  re: RegExp;
  target: RouteTarget;
  /** Only for these methods (else the rule is skipped). */
  methods?: string[];
  /** Fixed action instead of the method rule (e.g. reveal = view). */
  action?: Action;
}

const seg = (path: string) => new RegExp(`^${path}(?:/|$)`);
const r = (path: string, target: RouteTarget, extra: Omit<Rule, 're' | 'target'> = {}): Rule => ({ re: seg(path), target, ...extra });

/** Admin router (/api/admin/*): sub-paths first, then one rule per mounted router. */
const ADMIN_RULES: Rule[] = [
  // Own permissions + the Access Center (its routers check canManageAccess / break-glass themselves)
  r('/admin/me/permissions', 'self'),
  r('/admin/access', 'self'),
  // Staff picker (assignee drop-downs everywhere) stays open; the rest of user management is settings.
  r('/admin/users/staff', 'self'),
  r('/admin/users/clients\\.xlsx', 'clients'),
  // Case sub-resources
  r('/admin/cases/[^/]+/(?:documents|upload-links|official-forms|embassy-package|ezb-wizard)', 'documents'),
  r('/admin/cases/[^/]+/(?:messages|typing)', 'communications'),
  r('/admin/bulk/cases', 'cases'),
  r('/admin/bulk/(?:inquiries|candidates)', 'clients'),
  r('/admin/ai-staff/mail', 'communications'),
  r('/admin/ai-staff/content', 'content'),
  r('/admin/ai-staff', 'cases'),
  r('/admin/journey/(?:cases|onboarding)', 'cases'),
  r('/admin/journey', 'content'),
  r('/admin/ops/kb', 'self', { methods: ['GET', 'HEAD'] }), // knowledge base: everyone reads
  r('/admin/ops/kb', 'content'),
  r('/admin/ops/(?:api-keys|webhooks)', 'settings'),
  r('/admin/ops', 'cases'), // kanban, workload
  r('/admin/growth/referrals', 'clients'),
  r('/admin/growth', 'content'),
  r('/admin/marketing/inquiries', 'clients'),
  r('/admin/marketing', 'content'),
  r('/admin/reveal', 'clients', { action: 'view' }), // masked field reveal (reason + log in lib/privacy)
  r('/admin/sensitive', 'settings'),
  r('/admin/impersonate', 'clients'),
  // Signature request deletion (POST bulk / cleanup endpoints are deletes; the routes also require ADMIN+)
  r('/admin/signatures/(?:delete-many|cleanup-orphans)', 'documents', { action: 'delete' }),
  // Drive client folder actions (routes/admin/clientFolders): partner = partners, Fertig → portal = documents, stage = cases (segment)
  r('/admin/client-folders/partner', 'partners'),
  r('/admin/client-folders/(?:ready-docs|cases/[^/]+/ready-docs)', 'documents'),
];

/** One area per mounted admin router (first path segment). */
const ADMIN_SEGMENTS: Record<string, RouteTarget> = {
  // personal / neutral
  dashboard: 'self', // the handler hides case data from users without cases:view and applies the case scope
  me: 'self',
  nav: 'self',
  presence: 'self',
  'command-search': 'self', // results filtered per area + case scope in the handler
  'my-work': 'self',
  'canned-replies': 'self',
  time: 'self',
  kpi: 'self',
  'staff-ops': 'self',
  training: 'self',
  'whats-new': 'self',
  'training-checklist': 'self',
  shifts: 'self',
  'handover-notes': 'self',
  // cases
  cases: 'cases',
  workload: 'cases',
  'ops-calendar': 'cases',
  assignment: 'cases',
  'check-ins': 'cases',
  renewals: 'cases',
  permits: 'cases',
  recognition: 'cases',
  accelerated: 'cases',
  authorities: 'cases',
  'four-eyes': 'cases',
  'case-processing': 'cases',
  'client-folders': 'cases', // /client-folders/processing (bulk team workflow stage) and /return ("Geri qaytar"); partner / ready-docs above
  arrivals: 'cases',
  'arrival-certificates': 'cases',
  housing: 'cases',
  'case-forms': 'cases',
  'data-quality': 'cases',
  // clients
  clients: 'clients',
  'client-process': 'clients',
  'access-log': 'clients',
  german: 'clients',
  privacy: 'clients',
  ready: 'clients',
  'skill-videos': 'clients',
  register: 'clients',
  'germany-jobs': 'clients',
  'external-applications': 'clients',
  candidates: 'clients',
  booking: 'clients',
  inquiries: 'clients',
  duplicates: 'clients',
  // documents
  review: 'documents',
  requirements: 'documents',
  translations: 'documents',
  'contract-templates': 'documents',
  'case-contracts': 'documents',
  signatures: 'documents',
  'official-forms': 'documents',
  expiring: 'documents',
  'upload-links': 'documents',
  'cover-letter-templates': 'documents',
  countersign: 'documents',
  // finance
  'client-billing': 'finance',
  finance: 'finance',
  profitability: 'finance',
  settlements: 'finance',
  invoices: 'finance',
  packages: 'finance',
  accounting: 'finance',
  quotes: 'finance',
  // employers
  'employer-checklist': 'employers',
  'real-salaries': 'employers',
  placement: 'employers',
  'interview-prep': 'employers',
  'candidate-requests': 'employers',
  'candidate-pool': 'employers',
  ai: 'employers', // /ai/employer
  companies: 'employers',
  'employer-reports': 'employers',
  vacancies: 'employers',
  'job-feeds': 'employers',
  // partners
  'public-api-keys': 'partners',
  agents: 'partners',
  partners: 'partners',
  'partner-records': 'partners',
  'partner-schools': 'partners',
  // content
  course: 'content',
  'city-costs': 'content',
  life: 'content',
  'data-freshness': 'content',
  'past-placements': 'content',
  legal: 'content',
  'waiting-room': 'content',
  'doc-guides': 'content',
  study: 'content',
  reviews: 'content',
  upload: 'content',
  content: 'content',
  guides: 'content',
  'site-features': 'content',
  // settings
  brand: 'settings',
  license: 'settings',
  whitelabel: 'settings',
  'saas-leads': 'settings',
  onboarding: 'settings',
  history: 'settings',
  automation: 'settings',
  'setup-checklist': 'settings',
  'case-ai': 'settings',
  users: 'settings',
  trust: 'settings',
  settings: 'settings',
  // reports / analytics
  'quarterly-report': 'reports',
  reports: 'reports',
  'tv-display': 'analytics',
  'year-review': 'analytics',
  oversight: 'analytics',
  mgmt: 'analytics',
  'search-console': 'analytics',
  analytics: 'analytics',
  'tool-analytics': 'analytics',
  // communications
  inbox: 'communications',
  campaigns: 'communications',
  messaging: 'communications',
  surveys: 'communications',
  translate: 'communications',
  'rule-changes': 'communications',
  mailboxes: 'communications',
};

/**
 * Staff-facing routers outside /api/admin. The guard applies them to STAFF / ADMIN users only, so the client,
 * employer and partner use of mixed routers (/files, /documents, /family, …) is untouched.
 */
const OTHER_RULES: Rule[] = [
  r('/drive', 'drive'), // /drive, /drive/sheets, /drive/create, /drive/pdf-tools, /drive/intel, /drive/collab
  r('/files', 'documents'),
  r('/documents', 'documents'),
  r('/originals', 'documents'),
  r('/ai-docs', 'documents'),
  r('/upload-ai', 'documents'),
  r('/scan', 'documents'),
  r('/cases/[^/]+/documents', 'documents'),
  r('/cases/[^/]+/(?:messages|typing)', 'communications'),
  r('/cases', 'cases'),
  r('/family', 'cases'),
  r('/journey', 'cases'),
  r('/mail', 'communications'),
  r('/mailbox', 'communications'),
  r('/ai-mail', 'communications'),
  r('/chat', 'communications'),
  r('/calls', 'communications'),
  r('/contacts', 'communications'),
  r('/livechat', 'communications'),
  r('/messaging-plus', 'communications'),
  r('/messaging', 'communications'),
  r('/tasks', 'self'), // team tasks: case-linked tasks follow the case scope in the handler
  r('/workspace', 'self'),
  r('/calendar', 'self'),
  r('/events', 'self'),
];

const EXPORT_RE = /(?:^|\/)(?:export|exports|download|pdf|xrechnung|datev|zip|receipt|datasheet)(?:\/|$)|\.(?:csv|xlsx|xls|pdf|xml|zip|ics)$/i;
const READ_ONLY_POST_RE = /\/(?:preview|resolve)$/;

export const actionFor = (method: string, path: string, query?: Record<string, unknown>): Action => {
  const m = method.toUpperCase();
  if (EXPORT_RE.test(path) || (m === 'GET' && query && (query.download || query.format === 'csv' || query.format === 'xlsx'))) return 'export';
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'view';
  if (m === 'DELETE') return 'delete';
  if (m === 'POST' && READ_ONLY_POST_RE.test(path)) return 'view';
  return 'edit';
};

export type RouteClass = { area: Area; action: Action } | { self: true } | null;

const matchRules = (rules: Rule[], method: string, path: string, query?: Record<string, unknown>): RouteClass | undefined => {
  for (const rule of rules) {
    if (rule.methods && !rule.methods.includes(method.toUpperCase())) continue;
    if (!rule.re.test(path)) continue;
    return rule.target === 'self' ? { self: true } : { area: rule.target, action: rule.action ?? actionFor(method, path, query) };
  }
  return undefined;
};

const normalize = (path: string) => {
  const p = path.split('?')[0].replace(/\/+/g, '/');
  return p.length > 1 ? p.replace(/\/$/, '') : p;
};

/**
 * Area + action of a staff request. `path` is relative to /api. null = not a staff route this table knows:
 * outside /admin that is normal (public, account, auth, …); inside /admin it means an unmapped route (the
 * guard lets it through as today and the unit test reports it).
 */
export const classifyRoute = (method: string, rawPath: string, query?: Record<string, unknown>): RouteClass => {
  const path = normalize(rawPath);
  if (path === '/admin' || path.startsWith('/admin/')) {
    const hit = matchRules(ADMIN_RULES, method, path, query);
    if (hit) return hit;
    const first = path.split('/')[2] ?? '';
    const target = Object.prototype.hasOwnProperty.call(ADMIN_SEGMENTS, first) ? ADMIN_SEGMENTS[first] : undefined;
    if (!target) return null;
    return target === 'self' ? { self: true } : { area: target, action: actionFor(method, path, query) };
  }
  return matchRules(OTHER_RULES, method, path, query) ?? null;
};
