import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';

export type RequestStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type SignerStatus = 'PENDING' | 'VIEWED' | 'SIGNED' | 'DECLINED';
export type SignerRole = 'CANDIDATE' | 'COMPANY' | 'STAFF' | 'OTHER';
export type SignOrder = 'SEQUENTIAL' | 'PARALLEL';
export type EventType =
  | 'CREATED'
  | 'SENT'
  | 'VIEWED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'SIGNED'
  | 'DECLINED'
  | 'REMINDED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DOWNLOADED';

/** What a party sees on the signing page (other parties: names and statuses only). */
export interface SigningView {
  request: {
    id: string;
    title: string;
    message: string | null;
    status: RequestStatus;
    order: SignOrder;
    expiresAt: string | null;
    completedAt: string | null;
    originalName: string | null;
    pages: number;
    originalSha256: string | null;
    finalSha256: string | null;
    hasFinal: boolean;
    sender: string;
    case: { number: string } | null;
    company: { name: string } | null;
  };
  me: {
    id: string;
    name: string;
    role: SignerRole;
    status: SignerStatus;
    email: string;
    /** Where the signing code goes: SMS (masked number below) or e-mail. */
    codeChannel?: 'sms' | 'email';
    phone?: string | null;
    signedAt: string | null;
    declinedReason: string | null;
    myTurn: boolean;
  };
  signers: { id: string; name: string; role: SignerRole; order: number; status: SignerStatus; signedAt: string | null; isMe: boolean }[];
  auth: { method: 'token' | 'portal'; otpRequired: boolean; verified: boolean };
}

export interface MySignatureItem {
  signerId: string;
  requestId: string;
  title: string;
  status: RequestStatus;
  myStatus: SignerStatus;
  myTurn: boolean;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  case: { id: string; number: string } | null;
  company: { name: string } | null;
  signers: { name: string; role: SignerRole; status: SignerStatus; signedAt: string | null; isMe: boolean }[];
}

export interface StaffSigner {
  id: string;
  role: SignerRole;
  name: string;
  email: string;
  userId: string | null;
  locale: 'az' | 'de' | 'en' | 'ru';
  order: number;
  status: SignerStatus;
  invitedAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  signatureMode: 'DRAW' | 'TYPE' | null;
  authMethod: 'EMAIL_OTP' | 'PORTAL' | null;
  otpVerifiedAt: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface StaffRequest {
  id: string;
  title: string;
  status: RequestStatus;
  order: SignOrder;
  isCaseContract: boolean;
  case: { id: string; number: string } | null;
  company: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  originalName: string;
  originalSha256: string;
  originalSize: number;
  originalPages: number;
  finalSha256: string | null;
  finalSize: number | null;
  hasFinal: boolean;
  message: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  currentTurn: string[];
  signers: StaffSigner[];
}

export interface StaffEvent {
  id: string;
  type: EventType;
  at: string;
  note: string | null;
  ip: string | null;
  userAgent: string | null;
  signer: { id: string; name: string } | null;
  actor: { id: string; name: string } | null;
}

export type StaffRequestDetail = StaffRequest & { events: StaffEvent[] };

export interface SignerDraft {
  role: SignerRole;
  name: string;
  email: string;
  /** Mobile number for the SMS signing code (optional; the account's number is used otherwise). */
  phone?: string | null;
  userId?: string | null;
  locale?: 'az' | 'de' | 'en' | 'ru' | null;
  order?: number | null;
}

export interface Prefill {
  case: { id: string; number: string; status: string; profession: string; contractAllowed: boolean } | null;
  company: { id: string; name: string } | null;
  signers: SignerDraft[];
  staff: SignerDraft;
  documents: { id: string; originalName: string; stage: string; size: number; createdAt: string }[];
  defaults: { expiresInDays: number; maxBytes: number };
}

export const STATUS_TONE: Record<RequestStatus, string> = toneClasses(STATUS_TONES.signature);

export const SIGNER_TONE: Record<SignerStatus, string> = toneClasses(STATUS_TONES.signer);

/** Translated message for an e-signature API error. */
export const useEsignError = () => {
  const { t, i18n } = useTranslation();
  const message = (err: unknown) => {
    const code = errorCode(err);
    return i18n.exists(`esign.errors.${code}`) ? t(`esign.errors.${code}`) : t('esign.errors.generic');
  };
  return { message, toast: (err: unknown) => toast.error(message(err)) };
};

export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 12)}…${h.slice(-8)}` : '—');
