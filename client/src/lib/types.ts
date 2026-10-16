export type L10n = { az: string; de: string; en: string; ru: string };
export type L10nList = { az: string[]; de: string[]; en: string[]; ru: string[] };

export type Role = 'CLIENT' | 'COMPANY' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

/** Role hierarchy: every role includes the permissions of the ones below it. */
export const ROLE_RANK: Record<Role, number> = { CLIENT: 0, COMPANY: 0, STAFF: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export const hasMinRole = (role: Role | null | undefined, min: Role) => !!role && ROLE_RANK[role] >= ROLE_RANK[min];
export const isStaffRole = (role: Role | null | undefined) => hasMinRole(role, 'STAFF');

/** Why the server rejected a session token (401 / `GET /auth/me`). */
export type AuthFailure = 'UNAUTHENTICATED' | 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'INVALID_TOKEN';

export interface SessionInfo {
  id: string;
  expiresAt: string;
}

export interface UserSession {
  id: string;
  client: 'web' | 'mobile';
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

/** Shared password rule (server: PASSWORD_TOO_WEAK): 8–128 chars with at least one letter and one digit. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const isStrongPassword = (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX && /[A-Za-z]/.test(p) && /\d/.test(p);

export interface User {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  locale: 'az' | 'de' | 'en' | 'ru';
  // candidate profile (optional)
  birthDate?: string | null;
  nationality?: string | null;
  city?: string | null;
  address?: string | null;
  profession?: string | null;
  experienceYears?: number | null;
  germanLevel?: string | null;
  education?: string | null;
  drivingLicence?: string | null;
  about?: string | null;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  createdAt?: string;
}

export interface VisaCategory {
  id: string;
  slug: string;
  icon: string;
  image: string;
  visaLabel: string;
  title: L10n;
  summary: L10n;
  items: L10nList;
  body: L10n;
  germanLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  processingMin?: number | null;
  processingMax?: number | null;
  familyReunion?: boolean | null;
  requirements?: L10nList | null;
  documents?: L10nList | null;
  faq?: { q: L10n; a: L10n }[] | null;
  sortOrder: number;
  published: boolean;
}

export interface Service {
  id: string;
  slug: string;
  icon: string;
  image: string;
  audience: 'all' | 'company' | 'candidate';
  title: L10n;
  summary: L10n;
  body: L10n;
  features: L10nList;
  steps?: L10nList | null;
  duration?: L10n | null;
  sortOrder: number;
  published: boolean;
}

export type PartnerSector = 'logistics' | 'courier' | 'industry' | 'construction' | 'hospitality' | 'healthcare' | 'agriculture' | 'other';

export interface Partner {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  sector?: PartnerSector | null;
  city?: string | null;
  description?: L10n | null;
  featured?: boolean;
  sortOrder: number;
  published: boolean;
}

export interface VisaSample {
  id: string;
  image: string;
  profession: L10n;
  visaLabel: string;
  dateLabel: L10n;
  sortOrder: number;
  published: boolean;
}

export interface Testimonial {
  id: string;
  quote: L10n;
  author: L10n;
  role: L10n;
  kind: 'company' | 'candidate';
  sortOrder: number;
  published: boolean;
}

export interface Stat {
  id: string;
  icon: string;
  value: number;
  prefix: string;
  suffix: string;
  label: L10n;
  sortOrder: number;
}

export interface Faq {
  id: string;
  question: L10n;
  answer: L10n;
  audience: 'all' | 'company' | 'candidate';
  sortOrder: number;
  published: boolean;
}

export interface PostSummary {
  id: string;
  slug: string;
  cover: string;
  title: L10n;
  excerpt: L10n;
  publishedAt: string;
}

export interface Post extends PostSummary {
  body: L10n;
  published: boolean;
}

export interface Office {
  city: L10n;
  address: string;
  lat: number;
  lng: number;
}

export interface SiteSettings {
  contact?: {
    phone: string;
    whatsapp: string;
    email: string;
    hours: L10n;
    offices: Office[];
  };
  social?: Record<string, string>;
}

export interface SiteContent {
  stats: Stat[];
  visaCategories: VisaCategory[];
  services: Service[];
  partners: Partner[];
  samples: VisaSample[];
  testimonials: Testimonial[];
  faqs: Faq[];
  posts: PostSummary[];
  settings: SiteSettings;
}

// ─── Visa case workflow ────────────────────────────────────────────────

export type CaseStatus =
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_REVIEW'
  | 'CONTRACT_SENT'
  | 'CONTRACT_SIGNED'
  | 'EMBASSY_DOCUMENTS'
  | 'EMBASSY_REVIEW'
  | 'APPOINTMENT_SCHEDULED'
  | 'DECISION_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type DocStage = 'INITIAL' | 'EMBASSY' | 'CONTRACT' | 'CONTRACT_SIGNED' | 'VISA' | 'OTHER';
export type DocStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface CaseDocument {
  id: string;
  caseId: string;
  requirementId: string | null;
  stage: DocStage;
  originalName: string;
  mimeType: string;
  size: number;
  status: DocStatus;
  reviewNote: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface Requirement {
  id: string;
  stage: DocStage;
  title: L10n;
  description: L10n | null;
  required: boolean;
  sortOrder: number;
  documents: CaseDocument[];
}

export interface CaseEvent {
  id: string;
  type: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  note: string | null;
  visibleToClient: boolean;
  createdAt: string;
  actor: { firstName: string; lastName: string; role: Role } | null;
}

export interface CaseMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; role: Role };
}

export interface Contract {
  id: string;
  version: number;
  sentAt: string;
  signedAt: string | null;
  signerName: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  file: CaseDocument | null;
  signedFile: CaseDocument | null;
  /** Set when the contract is signed through the multi-party e-signature module. */
  signatureRequestId?: string | null;
}

export interface CaseSummary {
  id: string;
  number: string;
  profession: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  visaCategory: { title: L10n; visaLabel: string } | null;
}

export interface CaseDetail extends CaseSummary {
  staffNote: string | null;
  appointmentAt: string | null;
  appointmentPlace: string | null;
  decisionAt: string | null;
  decisionReason: string | null;
  visaValidFrom: string | null;
  visaValidTo: string | null;
  cancelReason: string | null;
  client: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: string };
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  visaCategory: { id: string; slug: string; title: L10n; visaLabel: string } | null;
  requirements: Requirement[];
  otherDocuments: CaseDocument[];
  contract: Contract | null;
  events: CaseEvent[];
  messages: CaseMessage[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// ─── Staff document workspaces ─────────────────────────────────────────

export type DocAccess = 'VIEW' | 'DOWNLOAD' | 'EDIT';
export type DocEffectiveAccess = DocAccess | 'OWNER';

export const DOC_ACCESS_RANK: Record<DocEffectiveAccess, number> = { VIEW: 1, DOWNLOAD: 2, EDIT: 3, OWNER: 4 };
export const docAllows = (have: DocEffectiveAccess | null | undefined, need: DocAccess) => !!have && DOC_ACCESS_RANK[have] >= DOC_ACCESS_RANK[need];

export interface DocOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface DocFolderSummary {
  id: string;
  slug: string;
  owner: DocOwner;
  access: DocEffectiveAccess;
  fileCount: number;
  totalSize: number;
  lastUploadAt: string | null;
  createdAt: string;
}

/** Fixed layout of every workspace: `<rootDir>/<company>/<companyDocsDir>`. */
export interface DocStructure {
  rootDir: string;
  companyDocsDir: string;
  maxFileBytes: number;
}

export interface DocFoldersResponse {
  folders: DocFolderSummary[];
  structure: DocStructure;
}

/** One company (firm) folder inside a workspace's root directory. */
export interface DocCompany {
  name: string;
  /** `<rootDir>/<name>` */
  path: string;
  /** `<rootDir>/<name>/<companyDocsDir>` */
  docsPath: string;
  files: number;
  bytes: number;
  lastUploadAt: string | null;
  createdAt: string;
}

export interface DocCompaniesResponse {
  access: DocEffectiveAccess;
  rootDir: string;
  companies: DocCompany[];
}

export interface DocDir {
  name: string;
  path: string;
  createdAt: string;
}

export interface DocFile {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  version: number;
  previewable: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface DocDirListing {
  folder: { id: string; slug: string; owner: DocOwner };
  access: DocEffectiveAccess;
  path: string;
  dirs: DocDir[];
  files: DocFile[];
}

/** One directory of a workspace as returned by `GET /docs/folders/:id/tree`. */
export interface DocTreeNode {
  path: string;
  name: string;
  /** Files directly inside this directory (not counting sub-directories). */
  files: number;
  bytes: number;
  lastUploadAt: string | null;
  /** Standard directory (`<rootDir>` or a company's `<companyDocsDir>`): cannot be renamed or deleted. */
  fixed: boolean;
}

export interface DocTreeDir extends DocTreeNode {
  /** Parent directory path; '' for top-level directories. */
  parent: string;
  createdAt: string;
}

export interface DocTreeResponse {
  folder: { id: string; slug: string; owner: DocOwner };
  access: DocEffectiveAccess;
  root: DocTreeNode;
  /** Every directory of the workspace (nested paths included). */
  dirs: DocTreeDir[];
  totals: { files: number; bytes: number };
}

export interface DocGrant {
  user: DocOwner;
  access: DocAccess;
  updatedAt: string;
}

export interface DocGrantsResponse {
  folder: { id: string; slug: string; owner: DocOwner };
  grants: DocGrant[];
  candidates: DocOwner[];
}

export interface AuditItem {
  id: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
}
