import { ACTIONS, AREAS, isAction, isArea, type Action, type Area, type PermissionMatrix, type PermissionOverride } from './types.js';

/**
 * Built-in staff role templates. They are seeded by the migration and can be edited in the Access Center;
 * when a row is missing (fresh / test database) the code definition below is used, so the resolver never
 * depends on the seed.
 *
 * ZERO behaviour change: every existing STAFF / ADMIN user is on the legacy template of their role until a
 * SUPER_ADMIN assigns something else. The legacy templates allow every area and action, because today the
 * only limits are the role checks in the routes (requireMinRole('ADMIN') etc.) — and those stay as they are,
 * on top of the permission check.
 */

export type Localized = { az: string; de: string; en: string; ru: string };

export const LEGACY_STAFF = 'legacy_staff';
export const LEGACY_ADMIN = 'legacy_admin';

const ALL: Action[] = [...ACTIONS];
export const FULL_MATRIX: PermissionMatrix = Object.fromEntries(AREAS.map((a) => [a, [...ALL]])) as PermissionMatrix;

export interface BuiltInTemplate {
  key: string;
  name: Localized;
  description: Localized;
  matrix: PermissionMatrix;
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: LEGACY_STAFF,
    name: { az: 'Köhnə STAFF (bugünkü giriş)', de: 'Legacy STAFF (bisheriger Zugriff)', en: 'Legacy STAFF (today’s access)', ru: 'Прежний STAFF (текущий доступ)' },
    description: {
      az: 'Hər STAFF istifadəçisi üçün standart. Bugünkü kimi: bütün bölmələr açıqdır, yalnız ADMIN səhifələri bağlıdır.',
      de: 'Standard für jede STAFF-Rolle. Wie bisher: alle Bereiche offen, nur ADMIN-Seiten gesperrt.',
      en: 'Default for every STAFF user. Same as today: every area open, only ADMIN pages closed.',
      ru: 'По умолчанию для каждого STAFF. Как сейчас: все разделы открыты, закрыты только страницы ADMIN.',
    },
    matrix: FULL_MATRIX,
  },
  {
    key: LEGACY_ADMIN,
    name: { az: 'Köhnə ADMIN (bugünkü giriş)', de: 'Legacy ADMIN (bisheriger Zugriff)', en: 'Legacy ADMIN (today’s access)', ru: 'Прежний ADMIN (текущий доступ)' },
    description: {
      az: 'Hər ADMIN istifadəçisi üçün standart. Bugünkü kimi: bütün bölmələr açıqdır.',
      de: 'Standard für jede ADMIN-Rolle. Wie bisher: alle Bereiche offen.',
      en: 'Default for every ADMIN user. Same as today: every area open.',
      ru: 'По умолчанию для каждого ADMIN. Как сейчас: все разделы открыты.',
    },
    matrix: FULL_MATRIX,
  },
  {
    key: 'manager',
    name: { az: 'Rəhbər / Menecer (hamısı)', de: 'Leitung (alles)', en: 'Manager (all)', ru: 'Руководитель (всё)' },
    description: { az: 'Bütün bölmələr, bütün əməliyyatlar.', de: 'Alle Bereiche, alle Aktionen.', en: 'Every area, every action.', ru: 'Все разделы, все действия.' },
    matrix: FULL_MATRIX,
  },
  {
    key: 'sales',
    name: { az: 'Satış meneceri', de: 'Vertrieb', en: 'Sales manager', ru: 'Менеджер по продажам' },
    description: {
      az: 'Müraciətlər, müştərilər, işəgötürənlər, partnyorlar və yazışma. Maliyyə və parametrlər bağlıdır.',
      de: 'Anfragen, Kunden, Arbeitgeber, Partner und Kommunikation. Finanzen und Einstellungen gesperrt.',
      en: 'Leads, clients, employers, partners and messages. Finance and settings closed.',
      ru: 'Заявки, клиенты, работодатели, партнёры и переписка. Финансы и настройки закрыты.',
    },
    matrix: {
      clients: ['view', 'edit', 'export'],
      cases: ['view', 'edit'],
      employers: ['view', 'edit', 'export'],
      partners: ['view', 'edit'],
      communications: ['view', 'edit'],
      documents: ['view'],
      drive: ['view', 'edit'],
      reports: ['view'],
      analytics: ['view'],
    },
  },
  {
    key: 'documents',
    name: { az: 'Sənəd mütəxəssisi', de: 'Dokumentensachbearbeitung', en: 'Document specialist', ru: 'Специалист по документам' },
    description: {
      az: 'Müraciətlər, sənədlər, disk və müştəri ilə yazışma. Maliyyə və parametrlər bağlıdır.',
      de: 'Fälle, Dokumente, Ablage und Kundenkommunikation. Finanzen und Einstellungen gesperrt.',
      en: 'Cases, documents, drive and client messages. Finance and settings closed.',
      ru: 'Дела, документы, диск и переписка с клиентом. Финансы и настройки закрыты.',
    },
    matrix: {
      cases: ['view', 'edit'],
      clients: ['view', 'edit'],
      documents: ['view', 'edit', 'delete', 'export'],
      communications: ['view', 'edit'],
      drive: ['view', 'edit', 'export'],
      employers: ['view'],
    },
  },
  {
    key: 'accountant',
    name: { az: 'Mühasib', de: 'Buchhaltung', en: 'Accountant', ru: 'Бухгалтер' },
    description: {
      az: 'Maliyyə tam, hesabatlar. Müraciətlərə və müştərilərə yalnız baxış. Sənədlər (pasport və s.) bağlıdır.',
      de: 'Finanzen voll, Berichte. Fälle und Kunden nur lesen. Dokumente (Pass usw.) gesperrt.',
      en: 'Finance in full, reports. Cases and clients read only. Documents (passport etc.) closed.',
      ru: 'Финансы полностью, отчёты. Дела и клиенты только просмотр. Документы (паспорт и т. д.) закрыты.',
    },
    matrix: {
      finance: ['view', 'edit', 'delete', 'export'],
      reports: ['view', 'export'],
      analytics: ['view'],
      clients: ['view'],
      cases: ['view'],
      employers: ['view'],
      partners: ['view'],
    },
  },
  {
    key: 'content',
    name: { az: 'Məzmun redaktoru', de: 'Redaktion', en: 'Content editor', ru: 'Редактор контента' },
    description: {
      az: 'Sayt məzmunu, bələdçilər, statistika. Müştəri və müraciət məlumatları bağlıdır.',
      de: 'Website-Inhalte, Ratgeber, Statistik. Kunden- und Falldaten gesperrt.',
      en: 'Website content, guides, statistics. Client and case data closed.',
      ru: 'Контент сайта, гиды, статистика. Данные клиентов и дел закрыты.',
    },
    matrix: {
      content: ['view', 'edit', 'delete'],
      analytics: ['view'],
      drive: ['view', 'edit'],
      communications: ['view'],
    },
  },
];

export const builtInByKey = (key: string | null | undefined) => BUILT_IN_TEMPLATES.find((t) => t.key === key);

/** Template every user of the role starts on (no settings row). */
export const legacyKeyFor = (role: string) => (role === 'ADMIN' || role === 'SUPER_ADMIN' ? LEGACY_ADMIN : LEGACY_STAFF);

/** Cleans a stored / submitted matrix: known areas and actions only, no duplicates, stable order. */
export const normalizeMatrix = (raw: unknown): PermissionMatrix => {
  const out: PermissionMatrix = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const area of AREAS) {
    const v = (raw as Record<string, unknown>)[area];
    if (!Array.isArray(v)) continue;
    const acts = ACTIONS.filter((a) => v.includes(a));
    if (acts.length) out[area] = acts;
  }
  return out;
};

export const normalizeOverrides = (raw: unknown): PermissionOverride[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, PermissionOverride>();
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const { area, action, effect } = o as Record<string, unknown>;
    if (!isArea(area) || !isAction(action) || (effect !== 'grant' && effect !== 'deny')) continue;
    seen.set(`${area}:${action}`, { area, action, effect }); // the last entry per area × action wins
  }
  return [...seen.values()];
};

export const matrixEquals = (a: PermissionMatrix, b: PermissionMatrix) => {
  const na = normalizeMatrix(a);
  const nb = normalizeMatrix(b);
  return AREAS.every((area: Area) => (na[area] ?? []).join() === (nb[area] ?? []).join());
};
