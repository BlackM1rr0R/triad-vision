/**
 * Catalogue of every client portal tool for the stage-based portal: route, group and search words.
 * Which tools a client sees prominently is decided on the server (server/src/lib/account/portalStage.ts,
 * `portal.featured` of GET /api/account/next-step); everything is listed on /account/all.
 *
 * Pure and dependency-free (no imports): the server test suite loads this file directly to keep the tool
 * keys in sync with the server list (server/tests/unit/portalStage.server.test.ts).
 */

export const PORTAL_TOOL_KEYS = [
  'cases',
  'documents',
  'checklist',
  'signatures',
  'payments',
  'messages',
  'family',
  'german',
  'germanyReady',
  'interviewPrep',
  'course',
  'waitingRoom',
  'readiness',
  'badges',
  'guides',
  'interviews',
  'jobs',
  'savedJobs',
  'externalJobs',
  'cv',
  'letters',
  'arrivalPrep',
  'arrivalPlan',
  'arrivalCard',
  'housing',
  'budget',
  'futureLetter',
  'pocketGuide',
  'emergencyWallpaper',
  'visaStory',
  'onboarding',
  'payslip',
  'letterExplain',
  'rateAlerts',
  'vault',
  'ruleChanges',
  'residenceCard',
  'profile',
  'notifications',
  'privacy',
  'referral',
] as const;
export type PortalToolKey = (typeof PORTAL_TOOL_KEYS)[number];

export type PortalStageKey = 'EXPLORING' | 'APPLYING' | 'DEPARTURE' | 'IN_GERMANY' | 'CLOSED';

/** Groups of the "All tools" page, in display order. */
export const TOOL_GROUPS = ['application', 'prepare', 'jobs', 'departure', 'germany', 'account'] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export interface ToolLinkContext {
  /** The case the portal is about (family switcher / next step). */
  caseId: string | null;
  /** Number of cases (> 1 opens the case list). */
  caseCount: number;
  /** The approved case (visa story). */
  approvedCaseId?: string | null;
}

interface ToolDef {
  group: ToolGroup;
  /** Route; null = not available for this client (e.g. the visa story without an approved case). */
  to: (c: ToolLinkContext) => string | null;
  /** Extra search words in any language (official German terms, common spellings). */
  words?: string;
  /** A public page outside the portal (opens in the site layout). */
  publicPage?: boolean;
}

const caseTo = (c: ToolLinkContext, suffix = '') => (c.caseId ? `/account/cases/${c.caseId}${suffix}` : null);

export const PORTAL_TOOLS: Record<PortalToolKey, ToolDef> = {
  cases: { group: 'application', to: (c) => (c.caseCount > 1 || !c.caseId ? '/account/cases' : `/account/cases/${c.caseId}`), words: 'Antrag application müraciət заявка' },
  documents: { group: 'application', to: (c) => caseTo(c, '?tab=docs') ?? '/account/checklist', words: 'Unterlagen upload yüklə sənəd документы' },
  checklist: { group: 'application', to: () => '/account/checklist', words: 'Checkliste siyahı список' },
  signatures: { group: 'application', to: () => '/account/signatures', words: 'Unterschrift sign imza подпись Vertrag contract müqavilə' },
  payments: { group: 'application', to: () => '/account/payments', words: 'Rechnung invoice hesab счёт ödəniş оплата' },
  messages: { group: 'application', to: (c) => caseTo(c, '?tab=messages') ?? '/account/notifications', words: 'Chat Nachricht mesaj сообщение manager menecer' },
  family: { group: 'application', to: (c) => caseTo(c, '#family-members') ?? '/account/profile', words: 'Familiennachzug ailə семья spouse child' },
  german: { group: 'prepare', to: () => '/account/german', words: 'Deutsch Vokabeln Wortschatz alman dili немецкий games oyun A1 A2 B1' },
  germanyReady: { group: 'prepare', to: () => '/account/germany-ready', words: 'Germany Ready Challenge Punkte xal certificate sertifikat' },
  interviewPrep: { group: 'prepare', to: () => '/account/interview-prep', words: 'Interview Botschaft embassy səfirlik müsahibə собеседование' },
  course: { group: 'prepare', to: () => '/account/course', words: 'Kurs kurs курс lesson dərs' },
  waitingRoom: { group: 'prepare', to: () => '/account/waiting-room', words: 'Wartezeit gözləmə ожидание' },
  readiness: { group: 'prepare', to: () => '/account/readiness', words: 'Score hazırlıq готовность' },
  badges: { group: 'prepare', to: () => '/account/badges', words: 'Abzeichen nişan значки achievements' },
  guides: { group: 'prepare', to: () => '/account/guides', words: 'Ratgeber bələdçi гид tips' },
  interviews: { group: 'jobs', to: () => '/account/interviews', words: 'Vorstellungsgespräch işəgötürən employer работодатель' },
  jobs: { group: 'jobs', to: () => '/account/applications', words: 'Bewerbung vakansiya вакансия' },
  savedJobs: { group: 'jobs', to: () => '/account/saved-jobs', words: 'Stellen jobs iş вакансии alert' },
  externalJobs: { group: 'jobs', to: () => '/account/job-applications', words: 'Bewerbung extern xarici' },
  cv: { group: 'jobs', to: () => '/account/cv', words: 'Lebenslauf CV резюме tərcümeyi-hal' },
  letters: { group: 'jobs', to: () => '/account/letters', words: 'Anschreiben motivasiya мотивационное письмо cover letter' },
  arrivalPrep: { group: 'departure', to: () => '/account/arrival-prep', words: 'Ankunft gəliş приезд packing çanta' },
  arrivalPlan: { group: 'departure', to: () => '/account/arrival', words: 'Flug uçuş рейс flight pickup' },
  arrivalCard: { group: 'departure', to: () => '/account/arrival-card', words: 'Ankunftskarte kart offline' },
  housing: { group: 'departure', to: () => '/account/housing', words: 'Wohnung Anmeldung mənzil квартира' },
  budget: { group: 'departure', to: () => '/account/budget', words: 'Budget büdcə бюджет Geld' },
  futureLetter: { group: 'departure', to: () => '/account/future-letter', words: 'Brief məktub письмо future gələcək' },
  pocketGuide: { group: 'departure', to: () => '/account/pocket-guide', words: 'PDF print çap печать pocket' },
  emergencyWallpaper: { group: 'departure', to: () => '/account/emergency-wallpaper', words: 'Notfall 112 təcili экстренный wallpaper' },
  visaStory: { group: 'departure', to: (c) => (c.approvedCaseId ? `/account/visa-story/${c.approvedCaseId}` : null), words: 'Visum viza виза story hekayə' },
  onboarding: { group: 'germany', to: () => '/account/onboarding', words: 'erste 30 Tage first days ilk addımlar первые шаги Anmeldung Steuer-ID' },
  payslip: { group: 'germany', to: () => '/payslip-explained', publicPage: true, words: 'Gehaltsabrechnung Lohn maaş зарплата payslip' },
  letterExplain: { group: 'germany', to: () => '/account/letters-explain', words: 'Brief Behörde məktub письмо' },
  rateAlerts: { group: 'germany', to: () => '/account/rate-alerts', words: 'EUR AZN Kurs məzənnə курс' },
  vault: { group: 'germany', to: () => '/account/vault', words: 'Tresor seyf сейф documents' },
  ruleChanges: { group: 'germany', to: () => '/account/rule-changes', words: 'Gesetz qayda правила changes' },
  residenceCard: { group: 'germany', to: () => '/residence-card-explained', publicPage: true, words: 'Aufenthaltstitel eAT Blaue Karte icazə ВНЖ residence permit' },
  profile: { group: 'account', to: () => '/account/profile', words: 'Profil профиль passport pasport' },
  notifications: { group: 'account', to: () => '/account/notifications', words: 'Benachrichtigung bildiriş уведомления' },
  privacy: { group: 'account', to: () => '/account/privacy', words: 'Datenschutz DSGVO məxfilik конфиденциальность' },
  referral: { group: 'account', to: () => '/account/referral', words: 'Freunde dost друг invite dəvət' },
};

export const toolsOfGroup = (g: ToolGroup): PortalToolKey[] => PORTAL_TOOL_KEYS.filter((k) => PORTAL_TOOLS[k].group === g);

export const toolPath = (key: PortalToolKey, c: ToolLinkContext) => PORTAL_TOOLS[key].to(c);

const CASE_PAGE = /^\/account\/cases\/[^/]+\/?$/;

/** Page segment under /account/ → tool. */
const SEGMENT: Record<string, PortalToolKey> = {
  cases: 'cases',
  checklist: 'checklist',
  signatures: 'signatures',
  payments: 'payments',
  german: 'german',
  'germany-ready': 'germanyReady',
  'interview-prep': 'interviewPrep',
  course: 'course',
  'waiting-room': 'waitingRoom',
  readiness: 'readiness',
  badges: 'badges',
  guides: 'guides',
  interviews: 'interviews',
  applications: 'jobs',
  'saved-jobs': 'savedJobs',
  'job-applications': 'externalJobs',
  cv: 'cv',
  letters: 'letters',
  'arrival-prep': 'arrivalPrep',
  arrival: 'arrivalPlan',
  'arrival-card': 'arrivalCard',
  housing: 'housing',
  budget: 'budget',
  'future-letter': 'futureLetter',
  'pocket-guide': 'pocketGuide',
  'emergency-wallpaper': 'emergencyWallpaper',
  'visa-story': 'visaStory',
  onboarding: 'onboarding',
  'letters-explain': 'letterExplain',
  'rate-alerts': 'rateAlerts',
  vault: 'vault',
  'rule-changes': 'ruleChanges',
  profile: 'profile',
  notifications: 'notifications',
  privacy: 'privacy',
  referral: 'referral',
};

/** Where am I? 'home' / 'all' for the portal home and the "All tools" page, a tool key, or null. */
export const toolOfLocation = (pathname: string, search = ''): PortalToolKey | 'home' | 'all' | null => {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/account') return 'home';
  if (p === '/account/all') return 'all';
  if (!p.startsWith('/account/')) return null;
  if (CASE_PAGE.test(pathname)) {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'docs') return 'documents';
    if (tab === 'messages') return 'messages';
    if (tab === 'family') return 'family';
    return 'cases';
  }
  return SEGMENT[p.split('/')[2] ?? ''] ?? null;
};

export interface ToolBadges {
  unreadMessages: number;
  unreadNotifications: number;
  pendingSignatures: number;
  pendingLegal: number;
  openInvoices?: number;
}

/** Counter on a tool's link (0 = none). */
export const toolBadge = (key: PortalToolKey, b: ToolBadges): number => {
  switch (key) {
    case 'messages':
      return b.unreadMessages;
    case 'notifications':
      return b.unreadNotifications;
    case 'signatures':
      return b.pendingSignatures;
    case 'payments':
      return b.openInvoices ?? 0;
    case 'privacy':
      return b.pendingLegal;
    default:
      return 0;
  }
};

/**
 * Counter on the "All tools" link: what is waiting in tools the navigation does not feature (so nothing
 * hides behind it). Messages and notifications: the larger one (a chat message also notifies).
 */
export const hiddenBadge = (featured: readonly PortalToolKey[], b: ToolBadges): number => {
  const hidden = PORTAL_TOOL_KEYS.filter((k) => !featured.includes(k));
  const msg = Math.max(hidden.includes('messages') ? b.unreadMessages : 0, hidden.includes('notifications') ? b.unreadNotifications : 0);
  return msg + hidden.filter((k) => k !== 'messages' && k !== 'notifications').reduce((n, k) => n + toolBadge(k, b), 0);
};

/** Lower-case, without accents; Azerbaijani / Turkish / German letters folded to Latin (ə→e, ı→i, ß→ss). */
export const foldSearch = (s: string) =>
  s
    .toLocaleLowerCase('en')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Does a tool match the query? Every word of the query must occur in the tool's text. */
export const matchesQuery = (text: string, query: string) => {
  const hay = foldSearch(text);
  return foldSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};
