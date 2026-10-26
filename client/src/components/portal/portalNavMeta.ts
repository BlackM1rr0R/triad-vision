import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpen,
  BookOpenCheck,
  Briefcase,
  Compass,
  FileSignature,
  FileText,
  FileUser,
  FolderOpen,
  Gift,
  GraduationCap,
  Hourglass,
  House,
  KeyRound,
  Languages,
  LayoutDashboard,
  MailQuestion,
  MessageCircle,
  MessageCircleQuestion,
  PenLine,
  PlaneLanding,
  ShieldCheck,
  UserRound,
  Users,
  Vault,
  Video,
  Wallet,
} from 'lucide-react';
import type { SectionKey, SubKey } from '@/lib/portalStage';

/** Icons and labels of the portal sections / sub-tabs (copy: i18n/pagesPortalNav — register it where used). */
export const SECTION_ICON: Record<SectionKey, LucideIcon> = {
  home: House,
  documents: FolderOpen,
  messages: MessageCircle,
  learn: GraduationCap,
  profile: UserRound,
};

export const SUB_ICON: Record<SubKey, LucideIcon> = {
  overview: LayoutDashboard,
  application: Briefcase,
  arrival: PlaneLanding,
  onboarding: Compass,
  housing: KeyRound,
  caseDocs: FileText,
  signatures: FileSignature,
  payments: Wallet,
  vault: Vault,
  translations: Languages,
  letterExplain: MailQuestion,
  chat: MessageCircle,
  notifications: Bell,
  course: BookOpenCheck,
  waitingRoom: Hourglass,
  german: GraduationCap,
  interviewPrep: MessageCircleQuestion,
  interviews: Video,
  jobs: Briefcase,
  cv: FileUser,
  letters: PenLine,
  guides: BookOpen,
  personal: UserRound,
  family: Users,
  privacy: ShieldCheck,
  referral: Gift,
};

/** Tour targets kept from the old tab bar (components/onboarding/tours.ts). */
export const SECTION_TOUR: Record<SectionKey, string> = {
  home: 'portal-tab-home',
  documents: 'portal-tab-docs',
  messages: 'portal-tab-messages',
  learn: 'portal-tab-learn',
  profile: 'portal-tab-profile',
};

export const sectionLabel = (t: TFunction, s: SectionKey) => t(`pnav.sections.${s}`);

export const subLabel = (t: TFunction, sub: SubKey, caseCount = 0) =>
  sub === 'application' && caseCount > 1 ? t('pnav.subs.applications') : t(`pnav.subs.${sub}`);
