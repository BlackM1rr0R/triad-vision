import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** Types and queries of the growth & marketing features (mirrors server/src/lib/marketing/*). */

// ─── Lead scoring ──────────────────────────────────────────────────────

export type LeadLevel = 'COLD' | 'WARM' | 'HOT';
export const LEAD_LEVELS: LeadLevel[] = ['HOT', 'WARM', 'COLD'];

export interface ScoreReason {
  code: string;
  key?: string;
  points: number;
  n?: number;
}

export const SOURCE_KEYS = ['contact', 'company', 'event', 'landing', 'quiz', 'calculator', 'booking', 'advisor', 'livechat', 'whatsapp', 'callback', 'other'] as const;
export const EVENT_KEYS = ['quiz_done', 'cost_calc', 'start_calc', 'booking_open', 'booking_done', 'event_register', 'landing_view', 'whatsapp_click'] as const;

export interface LeadScoringSettings {
  enabled: boolean;
  sources: Record<(typeof SOURCE_KEYS)[number], number>;
  events: Record<(typeof EVENT_KEYS)[number], number>;
  eventRepeat: number;
  pageView: number;
  pageViewCap: number;
  visitorCap: number;
  quiz: { high: number; medium: number; low: number };
  company: { base: number; perWorker: number; cap: number };
  recency: { d1: number; d7: number; d30: number; older: number };
  contact: { phone: number; email: number; message: number };
  estimate: number;
  thresholds: { warm: number; hot: number };
  notifyHot: boolean;
  notifyUserIds: string[];
}

export interface LeadScoringResponse {
  settings: LeadScoringSettings;
  defaults: LeadScoringSettings;
  staff: { id: string; firstName: string; lastName: string; role: string }[];
}

export const useLeadScoring = () =>
  useQuery({ queryKey: ['admin', 'lead-scoring'], queryFn: async () => (await api.get<LeadScoringResponse>('/admin/marketing/lead-scoring')).data, staleTime: 60_000 });

export interface LeadDetails {
  score: number;
  level: LeadLevel | null;
  reasons: ScoreReason[];
  scoredAt: string | null;
  preview: { score: number; level: LeadLevel; reasons: ScoreReason[] };
  visitor: {
    firstSeenAt: string;
    lastSeenAt: string;
    visits: number;
    pageViews: number;
    events: Record<string, number>;
    source: string | null;
    utm: Record<string, string> | null;
    locale: string | null;
  } | null;
  utm: Record<string, string> | null;
  quizResult: { path?: string; fit?: string; score?: number } | null;
  estimate: { category?: { slug: string; visaLabel?: string }; oneTime?: [number, number]; refundable?: [number, number]; input?: Record<string, unknown> } | null;
  landing: { id: string; slug: string; title: string } | null;
}

// ─── Landing pages ─────────────────────────────────────────────────────

export const SECTION_TYPES = ['hero', 'text', 'benefits', 'steps', 'faq', 'testimonials', 'stats', 'video', 'cta', 'form'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const FORM_FIELDS = ['name', 'phone', 'email', 'profession', 'germanLevel', 'country', 'message'] as const;
export type FormField = (typeof FORM_FIELDS)[number];
export type LandingStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** imageAlt: alt text of the hero image (empty = the hero title is used). */
export interface HeroData { title: string; subtitle: string; image: string; imageAlt?: string; ctaLabel: string; ctaTarget: string }
export interface TextData { title: string; body: string }
export interface BenefitsData { title: string; items: { icon: string; title: string; text: string }[] }
export interface StepsData { title: string; items: { title: string; text: string }[] }
export interface FaqData { title: string; items: { q: string; a: string }[] }
export interface TestimonialsData { title: string; ids: string[]; custom: { name: string; role: string; text: string; photo: string }[] }
export interface StatsData { title: string; items: { value: string; label: string }[] }
export interface VideoData { title: string; url: string }
export interface CtaData { title: string; text: string; label: string; target: string }
export interface FormSectionData { title: string; text: string }

export interface SectionDataMap {
  hero: HeroData;
  text: TextData;
  benefits: BenefitsData;
  steps: StepsData;
  faq: FaqData;
  testimonials: TestimonialsData;
  stats: StatsData;
  video: VideoData;
  cta: CtaData;
  form: FormSectionData;
}

export type LandingSection = { [K in SectionType]: { id: string; type: K; data: SectionDataMap[K]; resolved?: unknown } }[SectionType];

export interface FormConfig {
  fields: Record<FormField, { show: boolean; required: boolean }>;
  kind: 'contact' | 'company';
  submitLabel: string;
  successText: string;
}

export interface ResolvedTestimonial {
  id: string;
  quote: L10n;
  author: L10n;
  role: L10n;
  authorPhoto?: string | null;
}

export interface PublicLanding {
  id: string;
  slug: string;
  locale: 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
  title: string;
  country: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  sections: LandingSection[];
  formConfig: FormConfig;
}

export interface LandingRow {
  id: string;
  slug: string;
  locale: string;
  title: string;
  status: LandingStatus;
  country: string | null;
  campaignId: string | null;
  views: number;
  submissions: number;
  rate: number | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminLanding extends LandingRow {
  sections: LandingSection[];
  formConfig: FormConfig;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
}

export const DEFAULT_FORM_CONFIG: FormConfig = {
  fields: {
    name: { show: true, required: true },
    phone: { show: true, required: true },
    email: { show: true, required: false },
    profession: { show: true, required: false },
    germanLevel: { show: true, required: false },
    country: { show: false, required: false },
    message: { show: true, required: false },
  },
  kind: 'contact',
  submitLabel: '',
  successText: '',
};

export const newSectionId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Empty data of a new section. */
export const emptySection = (type: SectionType): LandingSection => {
  const id = newSectionId();
  switch (type) {
    case 'hero':
      return { id, type, data: { title: '', subtitle: '', image: '', imageAlt: '', ctaLabel: '', ctaTarget: '#form' } };
    case 'text':
      return { id, type, data: { title: '', body: '' } };
    case 'benefits':
      return { id, type, data: { title: '', items: [{ icon: 'BadgeCheck', title: '', text: '' }] } };
    case 'steps':
      return { id, type, data: { title: '', items: [{ title: '', text: '' }] } };
    case 'faq':
      return { id, type, data: { title: '', items: [{ q: '', a: '' }] } };
    case 'testimonials':
      return { id, type, data: { title: '', ids: [], custom: [] } };
    case 'stats':
      return { id, type, data: { title: '', items: [{ value: '', label: '' }] } };
    case 'video':
      return { id, type, data: { title: '', url: '' } };
    case 'cta':
      return { id, type, data: { title: '', text: '', label: '', target: '#form' } };
    case 'form':
      return { id, type, data: { title: '', text: '' } };
  }
};

const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/i;
const VIMEO = /^https:\/\/(www\.|player\.)?vimeo\.com\/(video\/)?(\d{5,12})/i;

/** Same rule as the server: YouTube / Vimeo URL → privacy-friendly embed URL (null otherwise). */
export const videoEmbedUrl = (url: string) => {
  const y = YOUTUBE.exec(url);
  if (y) return `https://www.youtube-nocookie.com/embed/${y[4]}`;
  const v = VIMEO.exec(url);
  if (v) return `https://player.vimeo.com/video/${v[3]}?dnt=1`;
  return null;
};

// ─── Cost calculator ───────────────────────────────────────────────────

export type Money = [number, number];
export type Currency = 'AZN' | 'TRY' | 'UAH';
export const CURRENCIES: Currency[] = ['AZN', 'TRY', 'UAH'];
export const COST_ITEMS = ['visaFee', 'translation', 'apostille', 'recognition', 'language', 'healthInsurance', 'flight', 'serviceFee', 'blockedAccount'] as const;
export type CostItemKey = (typeof COST_ITEMS)[number];

export interface CostCategory {
  id: string;
  slug: string;
  title: L10n;
  icon: string;
  visaLabel: string;
  germanLevel: string | null;
  defaults: { documents: number; apostilles: number; recognition: boolean; language: boolean; blockedAccount: boolean };
}

export interface CostConfig {
  enabled: boolean;
  rates: Record<Currency, number>;
  ratesUpdatedAt: string | null;
  categories: CostCategory[];
}

export interface CostEstimate {
  category: { id: string; slug: string };
  input: { adults: number; children: number; documents: number; apostilles: number; recognition: boolean; language: boolean };
  items: { key: CostItemKey; amount: Money; qty: number; unitPrice: number | null; refundable: boolean }[];
  oneTime: Money;
  refundable: Money;
  total: Money;
  converted: Record<'oneTime' | 'refundable' | 'total', Record<Currency, Money>>;
  ratesUpdatedAt: string | null;
}

export const useCostConfig = () =>
  useQuery({ queryKey: ['growth', 'cost-calculator'], queryFn: async () => (await api.get<CostConfig>('/growth/cost-calculator')).data, staleTime: 5 * 60 * 1000 });

export interface Fees {
  visaFeeAdult: number;
  visaFeeChild: number;
  translationDocs: number;
  apostilleDocs: number;
  recognition: number;
  recognitionDefault: boolean;
  languageCourse: number;
  languageExam: number;
  blockedAccount: number;
  healthInsurance: number;
  flight: number;
  serviceFeeMin: number;
  serviceFeeMax: number;
}

export interface CostSettings {
  enabled: boolean;
  translationPrice: number | null;
  apostillePrice: number | null;
  blockedAccountAmount: number;
  defaults: Fees;
  categories: Record<string, Partial<Fees>>;
  rates: Record<Currency, number>;
  ratesUpdatedAt: string;
}

/** "1 234" with a thin no-break space, in the UI language. */
export const fmtMoney = (n: number, locale: string) =>
  new Intl.NumberFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'az-Latn-AZ', { maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

// ─── Origin map ────────────────────────────────────────────────────────

export type OriginCountry = 'AZ' | 'TR' | 'UA';

export interface PublicOrigins {
  enabled: boolean;
  minPerPoint: number;
  countries: Record<OriginCountry, number>;
  origins: { key: string; country: OriginCountry; city: string | null; lat: number; lng: number; count: number }[];
  flows: { from: string; to: string; count: number }[];
}

export const usePublicOrigins = () =>
  useQuery({ queryKey: ['growth', 'origins'], queryFn: async () => (await api.get<PublicOrigins>('/growth/origins')).data, staleTime: 10 * 60 * 1000 });

export interface AdminOrigins {
  origins: PublicOrigins['origins'];
  flows: { from: string; to: string; toCity: string; count: number }[];
  countries: Record<OriginCountry, number>;
  unknown: number;
  clients: number;
}
