import { L, type L10n } from './types.js';

/** Enum value labels (az / de / en / ru) used by the report datasets and their exports. */

type Labels = Record<string, L10n>;

export const CASE_STATUS: Labels = {
  DOCUMENTS_PENDING: L('Sənədlər gözlənilir', 'Unterlagen ausstehend', 'Documents pending', 'Ожидаются документы'),
  DOCUMENTS_REVIEW: L('Sənədlər yoxlanılır', 'Unterlagen in Prüfung', 'Documents in review', 'Документы на проверке'),
  CONTRACT_SENT: L('Müqavilə göndərilib', 'Vertrag versendet', 'Contract sent', 'Договор отправлен'),
  CONTRACT_SIGNED: L('Müqavilə imzalanıb', 'Vertrag unterschrieben', 'Contract signed', 'Договор подписан'),
  EMBASSY_DOCUMENTS: L('Səfirlik sənədləri', 'Botschaftsunterlagen', 'Embassy documents', 'Документы для посольства'),
  EMBASSY_REVIEW: L('Səfirlik sənədləri yoxlanılır', 'Botschaftsunterlagen in Prüfung', 'Embassy documents in review', 'Проверка документов для посольства'),
  APPOINTMENT_SCHEDULED: L('Görüş təyin edilib', 'Termin vereinbart', 'Appointment scheduled', 'Назначена встреча'),
  DECISION_PENDING: L('Qərar gözlənilir', 'Entscheidung ausstehend', 'Decision pending', 'Ожидается решение'),
  APPROVED: L('Təsdiqlənib', 'Genehmigt', 'Approved', 'Одобрено'),
  REJECTED: L('İmtina', 'Abgelehnt', 'Rejected', 'Отказ'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменено'),
};

export const VISA_TYPE: Labels = {
  WORK: L('İş vizası', 'Arbeitsvisum', 'Work visa', 'Рабочая виза'),
  AUSBILDUNG: L('Ausbildung', 'Ausbildung', 'Vocational training', 'Ausbildung'),
  WEITERBILDUNG: L('Weiterbildung', 'Weiterbildung', 'Further training', 'Weiterbildung'),
  JOB_SEEKER: L('İş axtarışı', 'Chancenkarte', 'Job seeker', 'Поиск работы'),
  STUDY: L('Təhsil vizası', 'Studienvisum', 'Study visa', 'Учебная виза'),
  FAMILY: L('Ailə birləşməsi', 'Familiennachzug', 'Family reunion', 'Воссоединение семьи'),
  TOURIST: L('Turist vizası', 'Besuchervisum', 'Tourist visa', 'Туристическая виза'),
};

export const DOC_STAGE: Labels = {
  INITIAL: L('İlkin', 'Erstunterlagen', 'Initial', 'Первичные'),
  EMBASSY: L('Səfirlik', 'Botschaft', 'Embassy', 'Посольство'),
  CONTRACT: L('Müqavilə', 'Vertrag', 'Contract', 'Договор'),
  CONTRACT_SIGNED: L('İmzalı müqavilə', 'Unterschriebener Vertrag', 'Signed contract', 'Подписанный договор'),
  VISA: L('Viza', 'Visum', 'Visa', 'Виза'),
  OTHER: L('Digər', 'Sonstiges', 'Other', 'Другое'),
};

export const DOC_STATUS: Labels = {
  PENDING: L('Gözləyir', 'Offen', 'Pending', 'Ожидает'),
  ACCEPTED: L('Qəbul edilib', 'Akzeptiert', 'Accepted', 'Принят'),
  REJECTED: L('Rədd edilib', 'Abgelehnt', 'Rejected', 'Отклонён'),
};

export const TASK_STATUS: Labels = {
  TODO: L('Ediləcək', 'Offen', 'To do', 'К выполнению'),
  IN_PROGRESS: L('İcrada', 'In Arbeit', 'In progress', 'В работе'),
  REVIEW: L('Yoxlamada', 'In Prüfung', 'In review', 'На проверке'),
  DONE: L('Hazır', 'Erledigt', 'Done', 'Готово'),
  CANCELLED: L('Ləğv edilib', 'Abgebrochen', 'Cancelled', 'Отменено'),
};

export const TASK_PRIORITY: Labels = {
  LOW: L('Aşağı', 'Niedrig', 'Low', 'Низкий'),
  NORMAL: L('Normal', 'Normal', 'Normal', 'Обычный'),
  HIGH: L('Yüksək', 'Hoch', 'High', 'Высокий'),
  URGENT: L('Təcili', 'Dringend', 'Urgent', 'Срочно'),
};

export const INQUIRY_STATUS: Labels = {
  NEW: L('Yeni', 'Neu', 'New', 'Новый'),
  IN_PROGRESS: L('İcrada', 'In Bearbeitung', 'In progress', 'В работе'),
  DONE: L('Bağlanıb', 'Erledigt', 'Done', 'Закрыт'),
  ARCHIVED: L('Arxiv', 'Archiviert', 'Archived', 'Архив'),
};

export const INQUIRY_KIND: Labels = {
  company: L('Şirkət', 'Unternehmen', 'Company', 'Компания'),
  contact: L('Əlaqə', 'Kontakt', 'Contact', 'Контакт'),
};

export const BOOKING_STATUS: Labels = {
  BOOKED: L('Bron edilib', 'Gebucht', 'Booked', 'Забронировано'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменено'),
  DONE: L('Keçirilib', 'Durchgeführt', 'Done', 'Проведено'),
  NO_SHOW: L('Gəlmədi', 'Nicht erschienen', 'No-show', 'Не пришёл'),
};

export const APPLICATION_STATUS: Labels = {
  NEW: L('Yeni', 'Neu', 'New', 'Новая'),
  SHORTLISTED: L('Seçilmiş', 'Vorausgewählt', 'Shortlisted', 'В шорт-листе'),
  PROPOSED: L('İşəgötürənə təklif edilib', 'Dem Arbeitgeber vorgeschlagen', 'Proposed to employer', 'Предложен работодателю'),
  INTERVIEW: L('Müsahibə', 'Vorstellungsgespräch', 'Interview', 'Собеседование'),
  ACCEPTED: L('Qəbul edilib', 'Angenommen', 'Accepted', 'Принят'),
  REJECTED: L('Rədd edilib', 'Abgelehnt', 'Rejected', 'Отклонён'),
  WITHDRAWN: L('Geri götürülüb', 'Zurückgezogen', 'Withdrawn', 'Отозвана'),
};

export const VACANCY_STATUS: Labels = {
  DRAFT: L('Qaralama', 'Entwurf', 'Draft', 'Черновик'),
  PENDING: L('Yoxlamada', 'In Prüfung', 'Pending review', 'На проверке'),
  OPEN: L('Açıq', 'Offen', 'Open', 'Открыта'),
  CLOSED: L('Bağlı', 'Geschlossen', 'Closed', 'Закрыта'),
};

export const EMPLOYMENT_TYPE: Labels = {
  FULL_TIME: L('Tam ştat', 'Vollzeit', 'Full time', 'Полная занятость'),
  PART_TIME: L('Yarım ştat', 'Teilzeit', 'Part time', 'Частичная занятость'),
  SEASONAL: L('Mövsümi', 'Saisonarbeit', 'Seasonal', 'Сезонная'),
  AUSBILDUNG: L('Ausbildung', 'Ausbildung', 'Vocational training', 'Ausbildung'),
};

export const INVOICE_STATUS: Labels = {
  DRAFT: L('Qaralama', 'Entwurf', 'Draft', 'Черновик'),
  SENT: L('Göndərilib', 'Versendet', 'Sent', 'Отправлен'),
  PAID: L('Ödənilib', 'Bezahlt', 'Paid', 'Оплачен'),
  OVERDUE: L('Gecikir', 'Überfällig', 'Overdue', 'Просрочен'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменён'),
};

export const SETTLEMENT_STAGE: Labels = {
  NEW: L('Yeni', 'Neu', 'New', 'Новый'),
  IN_PROGRESS: L('Prosesdə', 'In Bearbeitung', 'In progress', 'В процессе'),
  VISA: L('Viza verilib', 'Visum erteilt', 'Visa issued', 'Виза выдана'),
  REFUSED: L('İmtina', 'Abgelehnt', 'Refused', 'Отказ'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменено'),
};

export const COMMISSION_STATUS: Labels = {
  PENDING: L('Gözləyir', 'Offen', 'Pending', 'Ожидает'),
  APPROVED: L('Təsdiqlənib', 'Freigegeben', 'Approved', 'Подтверждена'),
  PAID: L('Ödənilib', 'Bezahlt', 'Paid', 'Выплачена'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменена'),
};

export const SIGNATURE_STATUS: Labels = {
  DRAFT: L('Qaralama', 'Entwurf', 'Draft', 'Черновик'),
  SENT: L('Göndərilib', 'Versendet', 'Sent', 'Отправлен'),
  COMPLETED: L('Tamamlanıb', 'Abgeschlossen', 'Completed', 'Завершён'),
  DECLINED: L('İmtina edilib', 'Abgelehnt', 'Declined', 'Отклонён'),
  CANCELLED: L('Ləğv edilib', 'Storniert', 'Cancelled', 'Отменён'),
  EXPIRED: L('Vaxtı bitib', 'Abgelaufen', 'Expired', 'Истёк'),
};

export const LOCALE: Labels = {
  az: L('Azərbaycan', 'Aserbaidschanisch', 'Azerbaijani', 'Азербайджанский'),
  de: L('Alman', 'Deutsch', 'German', 'Немецкий'),
  en: L('İngilis', 'Englisch', 'English', 'Английский'),
  ru: L('Rus', 'Russisch', 'Russian', 'Русский'),
};

export const COST_CATEGORY: Labels = {
  TRANSLATION: L('Tərcümə', 'Übersetzung', 'Translation', 'Перевод'),
  COURIER: L('Kuryer', 'Kurier', 'Courier', 'Курьер'),
  EMBASSY_FEE: L('Səfirlik rüsumu', 'Botschaftsgebühr', 'Embassy fee', 'Сбор посольства'),
  VISA_FEE: L('Viza rüsumu', 'Visagebühr', 'Visa fee', 'Визовый сбор'),
  AGENT_COMMISSION: L('Agent komissiyası', 'Agentenprovision', 'Agent commission', 'Комиссия агента'),
  PARTNER_COMMISSION: L('Partnyor komissiyası', 'Partnerprovision', 'Partner commission', 'Комиссия партнёра'),
  TRAVEL: L('Yol xərci', 'Reisekosten', 'Travel', 'Дорожные расходы'),
  OTHER: L('Digər', 'Sonstiges', 'Other', 'Другое'),
  LEDGER_EXPENSES: L('Hesablaşma xərcləri (Rasxod)', 'Ausgaben laut Abrechnung', 'Ledger expenses', 'Расходы по расчётам'),
  LABOUR: L('Əmək (iş vaxtı)', 'Personalkosten (Arbeitszeit)', 'Labour (staff time)', 'Труд (рабочее время)'), // time tracking
};

export const NONE_LABEL = L('— (təyin edilməyib)', '— (nicht zugeordnet)', '— (not set)', '— (не указано)');
export const YES = L('bəli', 'ja', 'yes', 'да');
export const NO = L('xeyr', 'nein', 'no', 'нет');
