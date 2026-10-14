export type L10n = { az: string; de: string; en: string; ru: string };
export type L10nList = { az: string[]; de: string[]; en: string[]; ru: string[] };

export type Role = 'CLIENT' | 'STAFF' | 'ADMIN';

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
