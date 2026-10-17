import { matchPath } from 'react-router-dom';

/**
 * Every admin page that has a guide. The texts live in `adminHelp.<key>` (client/src/i18n/adminHelp/*),
 * in four languages: { title, summary, who, steps[], tips[] }.
 */
export const HELP_KEYS = [
  'general',
  'dashboard',
  'oversight',
  'cases',
  'signatures',
  'workspace',
  'inquiries',
  'users',
  'mailboxes',
  'candidates',
  'vacancies',
  'companies',
  'bookings',
  'invoices',
  'reviews',
  'analytics',
  'security',
  'kanban',
  'messaging',
  'interviews',
  'journey',
  'requirements',
  'kb',
  'agents',
  'translations',
  'privacyRequests',
  'integrations',
  'content',
  'settings',
  'docsAudit',
] as const;

export type HelpKey = (typeof HELP_KEYS)[number];

/** Groups for the help centre, in the order of the admin menu. */
export const HELP_GROUPS: { id: string; keys: HelpKey[] }[] = [
  { id: 'start', keys: ['general', 'dashboard', 'oversight', 'workspace'] },
  { id: 'clients', keys: ['cases', 'signatures', 'kanban', 'requirements', 'journey', 'translations', 'inquiries', 'bookings', 'reviews'] },
  { id: 'jobs', keys: ['candidates', 'vacancies', 'companies', 'interviews', 'agents', 'invoices'] },
  { id: 'communication', keys: ['messaging', 'mailboxes', 'kb'] },
  { id: 'system', keys: ['users', 'security', 'privacyRequests', 'docsAudit', 'analytics', 'integrations', 'content', 'settings'] },
];

const ROUTES: [string, HelpKey][] = [
  ['/admin', 'dashboard'],
  ['/admin/help', 'general'],
  ['/admin/tasks/*', 'workspace'],
  ['/admin/announcements', 'workspace'],
  ['/admin/oversight/*', 'oversight'],
  ['/admin/cases/*', 'cases'],
  ['/admin/signatures/*', 'signatures'],
  ['/admin/inquiries/*', 'inquiries'],
  ['/admin/users/*', 'users'],
  ['/admin/mailboxes/*', 'mailboxes'],
  ['/admin/candidates/*', 'candidates'],
  ['/admin/vacancies/*', 'vacancies'],
  ['/admin/companies/*', 'companies'],
  ['/admin/bookings/*', 'bookings'],
  ['/admin/invoices/*', 'invoices'],
  ['/admin/reviews/*', 'reviews'],
  ['/admin/analytics/*', 'analytics'],
  ['/admin/security/*', 'security'],
  ['/admin/kanban/*', 'kanban'],
  ['/admin/messaging/*', 'messaging'],
  ['/admin/interviews/*', 'interviews'],
  ['/admin/journey/*', 'journey'],
  ['/admin/requirements/*', 'requirements'],
  ['/admin/kb/*', 'kb'],
  ['/admin/agents/*', 'agents'],
  ['/admin/translations/*', 'translations'],
  ['/admin/privacy-requests/*', 'privacyRequests'],
  ['/admin/integrations/*', 'integrations'],
  ['/admin/content/*', 'content'],
  ['/admin/settings/*', 'settings'],
  ['/admin/docs/audit', 'docsAudit'],
];

/** The guide for the admin page at `pathname` (the general guide when the page has none). */
export const helpKeyFor = (pathname: string): HelpKey => {
  for (const [pattern, key] of ROUTES) if (matchPath(pattern, pathname)) return key;
  return 'general';
};
