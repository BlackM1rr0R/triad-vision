import { toast } from 'sonner';
import { errorCode } from '@/lib/api';
import type { CaseStatus, DocStage, DocStatus, Role } from '@/lib/types';

export const STATUS_LABEL: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Sənəd gözlənilir',
  DOCUMENTS_REVIEW: 'Sənədlər yoxlanılır',
  CONTRACT_SENT: 'Müqavilə göndərilib',
  CONTRACT_SIGNED: 'Müqavilə imzalanıb',
  EMBASSY_DOCUMENTS: 'Səfirlik sənədləri gözlənilir',
  EMBASSY_REVIEW: 'Səfirlik sənədləri yoxlanılır',
  APPOINTMENT_SCHEDULED: 'Görüş təyin edilib',
  DECISION_PENDING: 'Qərar gözlənilir',
  APPROVED: 'Təsdiqləndi',
  REJECTED: 'İmtina',
  CANCELLED: 'Ləğv edilib',
};

export const ALL_STATUSES = Object.keys(STATUS_LABEL) as CaseStatus[];

export const STEP_LABEL: Record<string, string> = {
  documents: 'Sənədlər',
  contract: 'Müqavilə',
  embassyDocs: 'Səfirlik sənədləri',
  appointment: 'Görüş',
  decision: 'Qərar',
  result: 'Nəticə',
};

export const STAGE_LABEL: Record<DocStage, string> = {
  INITIAL: 'İlkin sənədlər',
  EMBASSY: 'Səfirlik sənədləri',
  CONTRACT: 'Müqavilə',
  CONTRACT_SIGNED: 'İmzalanmış müqavilə',
  VISA: 'Viza',
  OTHER: 'Digər',
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  PENDING: 'Yoxlanılır',
  ACCEPTED: 'Qəbul edildi',
  REJECTED: 'Rədd edildi',
};

export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
};

export const ROLE_LABEL: Record<Role, string> = {
  CLIENT: 'Müştəri',
  STAFF: 'Əməkdaş',
  ADMIN: 'Administrator',
};

export const ROLE_TONE: Record<Role, string> = {
  CLIENT: 'bg-slate-100 text-slate-700',
  STAFF: 'bg-brand-100 text-brand-700',
  ADMIN: 'bg-violet-100 text-violet-800',
};

export type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  NEW: 'Yeni',
  IN_PROGRESS: 'İcrada',
  DONE: 'Tamamlandı',
  ARCHIVED: 'Arxivdə',
};

export const INQUIRY_STATUS_TONE: Record<InquiryStatus, string> = {
  NEW: 'bg-brand-100 text-brand-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  DONE: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-slate-200 text-slate-600',
};

export const INQUIRY_KIND_LABEL: Record<string, string> = {
  company: 'Şirkət təklifi',
  contact: 'Əlaqə formu',
};

export const EVENT_LABEL: Record<string, string> = {
  CASE_CREATED: 'Müraciət yaradıldı',
  STATUS_CHANGED: 'Status dəyişdi',
  DOCUMENTS_SUBMITTED: 'Sənədlər yoxlamaya göndərildi',
  DOCUMENT_UPLOADED: 'Müştəri sənəd yüklədi',
  DOCUMENT_ACCEPTED: 'Sənəd qəbul edildi',
  DOCUMENT_REJECTED: 'Sənəd rədd edildi',
  DOCUMENT_PENDING: 'Sənəd yenidən yoxlamaya qaytarıldı',
  STAFF_DOCUMENT_UPLOADED: 'Əməkdaş fayl yüklədi',
  CONTRACT_SENT: 'Müqavilə göndərildi',
  CONTRACT_SIGNED: 'Müqavilə imzalandı',
  SIGNATURE_REJECTED: 'İmza rədd edildi',
  CONTRACT_CONFIRMED: 'Müqavilə təsdiqləndi',
  APPOINTMENT_SCHEDULED: 'Səfirlik görüşü təyin edildi',
  APPOINTMENT_RESCHEDULED: 'Görüş vaxtı dəyişdirildi',
  LODGED_AT_EMBASSY: 'Sənədlər səfirliyə təqdim edildi',
  DECISION: 'Qərar qeydə alındı',
  REOPENED: 'Müraciət yenidən açıldı',
  CASE_UPDATED: 'Müraciət məlumatları yeniləndi',
  INTERNAL_NOTE: 'Daxili qeyd',
};

export const eventLabel = (type: string) => EVENT_LABEL[type] ?? type;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TRANSITION: 'Bu əməliyyat müraciətin cari statusunda mümkün deyil. Səhifəni yeniləyin.',
  REQUIRED_DOCUMENTS_NOT_ACCEPTED: 'Bütün mütləq sənədlər qəbul edilməyib.',
  REQUIRED_DOCUMENTS_MISSING: 'Mütləq sənədlərin hamısı yüklənməyib.',
  REASON_REQUIRED: 'İmtina üçün səbəb göstərilməlidir.',
  NOTE_REQUIRED: 'Rədd etmək üçün qeyd yazılmalıdır.',
  CONTRACT_MUST_BE_PDF: 'Müqavilə yalnız PDF formatında ola bilər.',
  CONTRACT_NOT_FOUND: 'Müqavilə tapılmadı.',
  ACTIVE_CASE_EXISTS: 'Müştərinin artıq başqa aktiv müraciəti var.',
  REQUIREMENT_HAS_DOCUMENTS: 'Bu tələbə aid sənədlər var — silmək mümkün deyil.',
  REQUIREMENT_REQUIRED: 'Sənəd tələbi seçilməyib.',
  INVALID_REQUIREMENT: 'Sənəd tələbi bu mərhələyə aid deyil.',
  FILE_TOO_LARGE: 'Fayl çox böyükdür.',
  FILE_REQUIRED: 'Fayl seçilməyib.',
  UNSUPPORTED_FILE_TYPE: 'Bu fayl növü dəstəklənmir.',
  INVALID_STAFF: 'Seçilmiş əməkdaş etibarsızdır.',
  INVALID_VISA_CATEGORY: 'Seçilmiş viza kateqoriyası etibarsızdır.',
  CANNOT_CHANGE_SELF: 'Öz rolunuzu və ya aktivlik statusunuzu dəyişə bilməzsiniz.',
  EMAIL_TAKEN: 'Bu e-poçt ünvanı artıq qeydiyyatdadır.',
  VALIDATION: 'Daxil edilən məlumatlar düzgün deyil.',
  VALUE_REQUIRED: 'Dəyər boş ola bilməz.',
  NOT_FOUND: 'Məlumat tapılmadı.',
  CASE_NOT_FOUND: 'Müraciət tapılmadı.',
  DOCUMENT_NOT_FOUND: 'Sənəd tapılmadı.',
  UNKNOWN_RESOURCE: 'Naməlum məzmun bölməsi.',
  FORBIDDEN: 'Bu əməliyyat üçün icazəniz yoxdur.',
  UNAUTHORIZED: 'Sessiyanın vaxtı bitib. Yenidən daxil olun.',
  NETWORK: 'Serverlə əlaqə qurulmadı. İnternet bağlantısını yoxlayın.',
  INTERNAL: 'Serverdə xəta baş verdi.',
};

export const errorMessage = (err: unknown, fallback = 'Əməliyyat alınmadı.') =>
  ERROR_MESSAGES[errorCode(err)] ?? fallback;

export const toastError = (err: unknown, fallback?: string) => {
  toast.error(errorMessage(err, fallback));
};

// ─── Formatting ─────────────────────────────────────────────────────────

const LOCALE = 'az-Latn-AZ';

export const fmtDate = (iso: string | Date | null | undefined) =>
  iso ? new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—';

export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        new Date(iso),
      )
    : '—';

export const fmtRelative = (iso: string | Date) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'indicə';
  if (diff < 3600) return `${Math.floor(diff / 60)} dəq əvvəl`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat əvvəl`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} gün əvvəl`;
  return fmtDate(iso);
};

export const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

export const fullName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '—';

/** ISO string → value for <input type="datetime-local"> in the browser's local time. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** ISO string → value for <input type="date">. */
export const toDateInput = (iso: string | null | undefined) => toLocalInput(iso).slice(0, 10);
