/**
 * What the field history tracks. An allowlist on purpose: a new column is not recorded until it is listed
 * here, so secrets (password hashes, TOTP seeds, tokens, recovery codes, session data) can never leak into
 * the history by accident. Noise (updatedAt, lastLoginAt, counters, sync timestamps, presence) stays out too.
 */
export type HistoryEntity = 'CASE' | 'USER' | 'COMPANY';
export const HISTORY_ENTITIES: HistoryEntity[] = ['CASE', 'USER', 'COMPANY'];

/** How a value is shown (and parsed back when it is reverted). */
export type FieldKind =
  | 'text'
  | 'date'
  | 'bool'
  | 'number'
  | 'enum'
  | 'json'
  | 'user'
  | 'company'
  | 'vacancy'
  | 'visaCategory'
  | 'case'
  | 'partner'
  | 'agent';

export interface FieldMeta {
  kind: FieldKind;
  /** Passport / ID / IBAN / tax numbers: stored encrypted, shown masked. */
  sensitive?: boolean;
  /** Enum name for the UI's label helpers (CaseStatus, VisaType, Role, CompanyStatus, Locale). */
  enumName?: string;
}

export interface EntityConfig {
  entity: HistoryEntity;
  /** Prisma client delegate name. */
  delegate: 'case' | 'user' | 'company';
  fields: Record<string, FieldMeta>;
  /** Relation keys of an update's `data` that set a tracked foreign key (connect / disconnect). */
  relations: Record<string, string>;
  /** Json columns diffed key by key (field = "column.key"). */
  expand: string[];
}

export const ENTITY_CONFIG: Record<HistoryEntity, EntityConfig> = {
  CASE: {
    entity: 'CASE',
    delegate: 'case',
    fields: {
      status: { kind: 'enum', enumName: 'CaseStatus' },
      assignedStaffId: { kind: 'user' },
      clientId: { kind: 'user' },
      visaCategoryId: { kind: 'visaCategory' },
      profession: { kind: 'text' },
      visaType: { kind: 'enum', enumName: 'VisaType' },
      staffNote: { kind: 'text' },
      appointmentAt: { kind: 'date' },
      appointmentPlace: { kind: 'text' },
      decisionAt: { kind: 'date' },
      decisionReason: { kind: 'text' },
      visaValidFrom: { kind: 'date' },
      visaValidTo: { kind: 'date' },
      cancelReason: { kind: 'text' },
      companyId: { kind: 'company' },
      vacancyId: { kind: 'vacancy' },
      parentCaseId: { kind: 'case' },
      relation: { kind: 'text' },
      partnerId: { kind: 'partner' },
      registerData: { kind: 'json' },
    },
    relations: {
      assignedStaff: 'assignedStaffId',
      client: 'clientId',
      visaCategory: 'visaCategoryId',
      company: 'companyId',
      vacancy: 'vacancyId',
      parentCase: 'parentCaseId',
      partner: 'partnerId',
    },
    expand: ['registerData'],
  },
  USER: {
    entity: 'USER',
    delegate: 'user',
    fields: {
      email: { kind: 'text' },
      role: { kind: 'enum', enumName: 'Role' },
      firstName: { kind: 'text' },
      lastName: { kind: 'text' },
      phone: { kind: 'text' },
      locale: { kind: 'enum', enumName: 'Locale' },
      isActive: { kind: 'bool' },
      birthDate: { kind: 'date' },
      nationality: { kind: 'text' },
      city: { kind: 'text' },
      address: { kind: 'text' },
      profession: { kind: 'text' },
      experienceYears: { kind: 'number' },
      germanLevel: { kind: 'text' },
      education: { kind: 'text' },
      drivingLicence: { kind: 'text' },
      about: { kind: 'text' },
      emailNotifications: { kind: 'bool' },
      pushNotifications: { kind: 'bool' },
      whatsappOptIn: { kind: 'bool' },
      smsNotifications: { kind: 'bool' },
      passportExpiry: { kind: 'date' },
      passportNumber: { kind: 'text', sensitive: true },
      companyId: { kind: 'company' },
      referredByAgentId: { kind: 'agent' },
    },
    relations: { company: 'companyId', referredByAgent: 'referredByAgentId' },
    expand: [],
  },
  COMPANY: {
    entity: 'COMPANY',
    delegate: 'company',
    fields: {
      name: { kind: 'text' },
      legalForm: { kind: 'text' },
      sector: { kind: 'text' },
      city: { kind: 'text' },
      address: { kind: 'text' },
      vatId: { kind: 'text', sensitive: true },
      website: { kind: 'text' },
      contactName: { kind: 'text' },
      phone: { kind: 'text' },
      email: { kind: 'text' },
      status: { kind: 'enum', enumName: 'CompanyStatus' },
      note: { kind: 'text' },
      // Legal data (lib/partnerRecords/legal.ts); bank data and the tax number are stored sealed, shown masked.
      betriebsnummer: { kind: 'text' },
      registerNumber: { kind: 'text' },
      registerCourt: { kind: 'text' },
      taxNumber: { kind: 'text', sensitive: true },
      street: { kind: 'text' },
      postalCode: { kind: 'text' },
      country: { kind: 'text' },
      managingDirector: { kind: 'text' },
      signatoryName: { kind: 'text' },
      signatoryRole: { kind: 'text' },
      fax: { kind: 'text' },
      foundedYear: { kind: 'number' },
      employeeCount: { kind: 'number' },
      collectiveAgreement: { kind: 'text' },
      bankName: { kind: 'text', sensitive: true },
      bankAccountHolder: { kind: 'text', sensitive: true },
      iban: { kind: 'text', sensitive: true },
      bic: { kind: 'text', sensitive: true },
    },
    relations: {},
    expand: [],
  },
};

/** Prisma model name (as the query extension sees it) → entity. */
export const MODEL_ENTITY: Record<string, HistoryEntity> = { Case: 'CASE', User: 'USER', Company: 'COMPANY' };

/** Meta of a (possibly dotted) field path: "registerData.col1" is a plain value inside the registerData column. */
export const fieldMeta = (entity: HistoryEntity, field: string): FieldMeta | undefined => {
  const cfg = ENTITY_CONFIG[entity];
  const column = field.split('.')[0]!;
  const meta = cfg.fields[column];
  if (!meta) return undefined;
  return field.includes('.') ? { kind: 'text' } : meta;
};

/** Tracked columns an update's `data` touches (relation writes mapped to their foreign key). */
export const touchedColumns = (cfg: EntityConfig, data: unknown): string[] => {
  if (!data || typeof data !== 'object') return [];
  const out = new Set<string>();
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === undefined) continue;
    const column = cfg.relations[key] ?? key;
    if (cfg.fields[column]) out.add(column);
  }
  return [...out];
};
