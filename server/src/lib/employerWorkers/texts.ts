import type { CheckInState, DateWarn, MilestoneCode, NextAction, Phase, SafeRiskCode } from './panel.js';

/** Labels of the employer worker panel for the CSV export and the monthly PDF report (server side). */

export type Loc = 'az' | 'de' | 'en' | 'ru';

export const pickLoc = (v: unknown): Loc | null => (typeof v === 'string' && ['az', 'de', 'en', 'ru'].includes(v.slice(0, 2)) ? (v.slice(0, 2) as Loc) : null);

interface PanelTexts {
  phase: Record<Phase, string>;
  milestone: Record<MilestoneCode, string>;
  checkIn: Record<CheckInState, string>;
  risk: Record<'LOW' | 'MEDIUM' | 'HIGH', string>;
  riskReason: (code: SafeRiskCode, params?: Record<string, number>) => string;
  action: Record<NextAction, string>;
  warn: Record<DateWarn, string>;
  title: { VISA: string; RESIDENCE: string };
  csvHeaders: string[];
}

export const PANEL_TEXTS: Record<Loc, PanelTexts> = {
  de: {
    phase: { IN_PROCESS: 'Im Verfahren', TRAVELLING: 'Visum erteilt / Anreise', WORKING: 'Angekommen / im Betrieb', LEFT: 'Ausgeschieden', CLOSED: 'Abgeschlossen' },
    milestone: {
      CONTRACT: 'Arbeitsvertrag',
      EMBASSY: 'Botschaftsunterlagen',
      APPOINTMENT: 'Botschaftstermin',
      DECISION: 'Visumentscheidung',
      ARRIVAL: 'Anreise',
      PROBATION_END: 'Ende der Probezeit',
      TITLE_EXPIRY: 'Ablauf Aufenthaltstitel',
      CHECKIN: 'Nächster Check-in',
    },
    checkIn: { OK: 'In Ordnung', ISSUE: 'Problem gemeldet', RESOLVED: 'Problem gelöst', OVERDUE: 'Überfällig', PENDING: 'Offen' },
    risk: { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch' },
    riskReason: (code, p) =>
      ({
        EMPLOYER_FEEDBACK: p?.count ? `Sie haben ${p.count}× ein Problem gemeldet` : 'Sie haben ein Problem gemeldet',
        WORKER_FEEDBACK: 'Der Mitarbeiter hat Gesprächsbedarf signalisiert',
        OPEN_ISSUE: 'Ein Anliegen wird von Triad Vision noch bearbeitet',
        NO_RESPONSE: 'Check-ins wurden nicht beantwortet',
        TREND_WORSE: 'Die letzte Rückmeldung war schlechter als zuvor',
        PROBATION_SOON: p?.days !== undefined ? `Probezeit endet in ${p.days} Tagen` : 'Probezeit endet bald',
      })[code],
    action: {
      SIGN_DOCUMENT: 'Dokument unterschreiben',
      COMPLETE_FORM: 'Formular prüfen und ausfüllen',
      ACCELERATED_STEP: '§ 81a: Vereinbarung unterzeichnen / Gebühr zahlen',
      ANSWER_CHECKIN: 'Check-in beantworten',
      PREPARE_ARRIVAL: 'Ersten Arbeitstag vorbereiten',
      PROBATION_REVIEW: 'Probezeitgespräch führen',
      CONFIRM_EMPLOYMENT: 'Weiterbeschäftigung für die Verlängerung bestätigen',
      TALK_TO_MANAGER: 'Mit Ihrem Triad-Ansprechpartner sprechen',
      NONE: 'Keine Aktion nötig',
    },
    warn: { OK: '', WARN: 'bald', CRITICAL: 'dringend', EXPIRED: 'abgelaufen' },
    title: { VISA: 'Visum', RESIDENCE: 'Aufenthaltstitel' },
    csvHeaders: ['Name', 'Position', 'Phase', 'Status', 'Nächster Meilenstein', 'Datum Meilenstein', 'Ankunft', 'Visum/Aufenthaltstitel gültig bis', 'Ende Probezeit', 'Check-in Arbeitgeber', 'Check-in Mitarbeiter', 'Risiko', 'Offene Punkte', 'Nächste Aktion', 'Ansprechpartner'],
  },
  en: {
    phase: { IN_PROCESS: 'In process', TRAVELLING: 'Visa approved / travelling', WORKING: 'Arrived / working', LEFT: 'Left', CLOSED: 'Closed' },
    milestone: {
      CONTRACT: 'Employment contract',
      EMBASSY: 'Embassy documents',
      APPOINTMENT: 'Embassy appointment',
      DECISION: 'Visa decision',
      ARRIVAL: 'Arrival',
      PROBATION_END: 'End of probation',
      TITLE_EXPIRY: 'Residence title expiry',
      CHECKIN: 'Next check-in',
    },
    checkIn: { OK: 'OK', ISSUE: 'Issue reported', RESOLVED: 'Issue resolved', OVERDUE: 'Overdue', PENDING: 'Open' },
    risk: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' },
    riskReason: (code, p) =>
      ({
        EMPLOYER_FEEDBACK: p?.count ? `You reported a problem ${p.count}×` : 'You reported a problem',
        WORKER_FEEDBACK: 'The worker would like to talk',
        OPEN_ISSUE: 'A concern is still being handled by Triad Vision',
        NO_RESPONSE: 'Check-ins were not answered',
        TREND_WORSE: 'The latest feedback was worse than before',
        PROBATION_SOON: p?.days !== undefined ? `Probation ends in ${p.days} days` : 'Probation ends soon',
      })[code],
    action: {
      SIGN_DOCUMENT: 'Sign document',
      COMPLETE_FORM: 'Review and complete form',
      ACCELERATED_STEP: '§ 81a: sign the agreement / pay the fee',
      ANSWER_CHECKIN: 'Answer check-in',
      PREPARE_ARRIVAL: 'Prepare the first working day',
      PROBATION_REVIEW: 'Hold the probation review',
      CONFIRM_EMPLOYMENT: 'Confirm continued employment for the renewal',
      TALK_TO_MANAGER: 'Talk to your Triad contact',
      NONE: 'No action needed',
    },
    warn: { OK: '', WARN: 'soon', CRITICAL: 'urgent', EXPIRED: 'expired' },
    title: { VISA: 'Visa', RESIDENCE: 'Residence title' },
    csvHeaders: ['Name', 'Position', 'Phase', 'Stage', 'Next milestone', 'Milestone date', 'Arrival', 'Visa / residence title valid until', 'Probation ends', 'Employer check-in', 'Worker check-in', 'Risk', 'Open items', 'Next action', 'Contact'],
  },
  az: {
    phase: { IN_PROCESS: 'Prosesdə', TRAVELLING: 'Viza verilib / yolda', WORKING: 'Gəlib / işləyir', LEFT: 'İşdən çıxıb', CLOSED: 'Bağlanıb' },
    milestone: {
      CONTRACT: 'Əmək müqaviləsi',
      EMBASSY: 'Səfirlik sənədləri',
      APPOINTMENT: 'Səfirlik görüşü',
      DECISION: 'Viza qərarı',
      ARRIVAL: 'Gəliş',
      PROBATION_END: 'Sınaq müddətinin sonu',
      TITLE_EXPIRY: 'Yaşayış icazəsinin bitməsi',
      CHECKIN: 'Növbəti yoxlama',
    },
    checkIn: { OK: 'Qaydasındadır', ISSUE: 'Problem bildirilib', RESOLVED: 'Problem həll olunub', OVERDUE: 'Gecikib', PENDING: 'Gözlənilir' },
    risk: { LOW: 'Aşağı', MEDIUM: 'Orta', HIGH: 'Yüksək' },
    riskReason: (code, p) =>
      ({
        EMPLOYER_FEEDBACK: p?.count ? `Siz ${p.count} dəfə problem bildirmisiniz` : 'Siz problem bildirmisiniz',
        WORKER_FEEDBACK: 'İşçi danışmaq istəyir',
        OPEN_ISSUE: 'Bir məsələ hələ Triad Vision tərəfindən həll edilir',
        NO_RESPONSE: 'Yoxlamalara cavab verilməyib',
        TREND_WORSE: 'Son rəy əvvəlkindən pisdir',
        PROBATION_SOON: p?.days !== undefined ? `Sınaq müddəti ${p.days} gün sonra bitir` : 'Sınaq müddəti tezliklə bitir',
      })[code],
    action: {
      SIGN_DOCUMENT: 'Sənədi imzalayın',
      COMPLETE_FORM: 'Formu yoxlayıb doldurun',
      ACCELERATED_STEP: '§ 81a: razılaşmanı imzalayın / rüsumu ödəyin',
      ANSWER_CHECKIN: 'Yoxlamaya cavab verin',
      PREPARE_ARRIVAL: 'İlk iş gününü hazırlayın',
      PROBATION_REVIEW: 'Sınaq müddəti söhbətini keçirin',
      CONFIRM_EMPLOYMENT: 'Uzatma üçün işin davamını təsdiqləyin',
      TALK_TO_MANAGER: 'Triad menecerinizlə danışın',
      NONE: 'Addım lazım deyil',
    },
    warn: { OK: '', WARN: 'tezliklə', CRITICAL: 'təcili', EXPIRED: 'bitib' },
    title: { VISA: 'Viza', RESIDENCE: 'Yaşayış icazəsi' },
    csvHeaders: ['Ad', 'Vəzifə', 'Faza', 'Mərhələ', 'Növbəti mərhələ', 'Tarix', 'Gəliş', 'Viza / yaşayış icazəsi etibarlıdır', 'Sınaq müddətinin sonu', 'İşəgötürən yoxlaması', 'İşçi yoxlaması', 'Risk', 'Açıq işlər', 'Növbəti addım', 'Menecer'],
  },
  ru: {
    phase: { IN_PROCESS: 'В процессе', TRAVELLING: 'Виза выдана / в пути', WORKING: 'Прибыл / работает', LEFT: 'Уволился', CLOSED: 'Закрыто' },
    milestone: {
      CONTRACT: 'Трудовой договор',
      EMBASSY: 'Документы для посольства',
      APPOINTMENT: 'Запись в посольство',
      DECISION: 'Решение по визе',
      ARRIVAL: 'Приезд',
      PROBATION_END: 'Конец испытательного срока',
      TITLE_EXPIRY: 'Окончание ВНЖ',
      CHECKIN: 'Следующий опрос',
    },
    checkIn: { OK: 'В порядке', ISSUE: 'Есть проблема', RESOLVED: 'Проблема решена', OVERDUE: 'Просрочено', PENDING: 'Ожидается' },
    risk: { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий' },
    riskReason: (code, p) =>
      ({
        EMPLOYER_FEEDBACK: p?.count ? `Вы сообщили о проблеме ${p.count} раз(а)` : 'Вы сообщили о проблеме',
        WORKER_FEEDBACK: 'Сотрудник хотел бы поговорить',
        OPEN_ISSUE: 'Вопрос ещё решается Triad Vision',
        NO_RESPONSE: 'Опросы остались без ответа',
        TREND_WORSE: 'Последний отзыв хуже предыдущего',
        PROBATION_SOON: p?.days !== undefined ? `Испытательный срок заканчивается через ${p.days} дн.` : 'Испытательный срок скоро заканчивается',
      })[code],
    action: {
      SIGN_DOCUMENT: 'Подписать документ',
      COMPLETE_FORM: 'Проверить и заполнить форму',
      ACCELERATED_STEP: '§ 81a: подписать соглашение / оплатить сбор',
      ANSWER_CHECKIN: 'Ответить на опрос',
      PREPARE_ARRIVAL: 'Подготовить первый рабочий день',
      PROBATION_REVIEW: 'Провести беседу по итогам испытательного срока',
      CONFIRM_EMPLOYMENT: 'Подтвердить продолжение работы для продления',
      TALK_TO_MANAGER: 'Связаться с менеджером Triad',
      NONE: 'Действий не требуется',
    },
    warn: { OK: '', WARN: 'скоро', CRITICAL: 'срочно', EXPIRED: 'истёк' },
    title: { VISA: 'Виза', RESIDENCE: 'ВНЖ' },
    csvHeaders: ['Имя', 'Должность', 'Фаза', 'Этап', 'Следующий этап', 'Дата', 'Приезд', 'Виза / ВНЖ действительны до', 'Конец испытательного срока', 'Опрос работодателя', 'Опрос сотрудника', 'Риск', 'Открытые задачи', 'Следующее действие', 'Менеджер'],
  },
};
