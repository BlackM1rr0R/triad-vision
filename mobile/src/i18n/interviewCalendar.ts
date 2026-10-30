import i18n from 'i18next';

/**
 * Mobile strings for picking an interview time from the employer's free slots
 * (features/interviews/InviteCard.tsx). Keys under m.ivcal.*, error codes under m.errors.*.
 */
const az = {
  m: {
    ivcal: {
      pickTitle: 'Müsahibə vaxtını seçin',
      changeTitle: 'Müsahibənin vaxtını dəyişin',
      from: '{{company}} şirkətindən dəvət',
      hint: 'Vaxtlar Bakı vaxtı ilə, altında Almaniya vaxtı göstərilir.',
      pick: 'Vaxt seç',
      change: 'Vaxtı dəyiş',
      book: 'Rezerv et',
      close: 'Bağla',
      minutes: '{{count}} dəq',
      noSlots: 'Hazırda boş vaxt yoxdur — sizinlə əlaqə saxlayacağıq.',
      booked: 'Müsahibə rezerv edildi — təsdiq və təqvim dəvəti göndərilir.',
      moved: 'Müsahibənin vaxtı dəyişdirildi.',
      germany: 'Almaniya',
      movesLeft: 'Qalan dəyişiklik sayı: {{count}}',
    },
    errors: {
      SLOT_UNAVAILABLE: 'Bu vaxt artıq boş deyil. Zəhmət olmasa başqa vaxt seçin.',
      INVITE_CLOSED: 'Bu dəvət artıq aktiv deyil.',
      RESCHEDULE_TOO_LATE: 'Bu müsahibəni onlayn dəyişmək üçün artıq gecdir.',
      RESCHEDULE_LIMIT: 'Bu müsahibənin vaxtını icazə verilən qədər dəyişmisiniz.',
      CANCEL_TOO_LATE: 'Bu müsahibəni onlayn ləğv etmək üçün artıq gecdir — zəhmət olmasa bizə yazın.',
    },
  },
};

type Copy = typeof az;

const de: Copy = {
  m: {
    ivcal: {
      pickTitle: 'Interviewtermin wählen',
      changeTitle: 'Interviewtermin ändern',
      from: 'Einladung von {{company}}',
      hint: 'Zeiten in Baku-Zeit, darunter die deutsche Zeit.',
      pick: 'Termin wählen',
      change: 'Termin ändern',
      book: 'Buchen',
      close: 'Schließen',
      minutes: '{{count}} Min.',
      noSlots: 'Zurzeit keine freien Termine — wir melden uns bei Ihnen.',
      booked: 'Termin gebucht — Bestätigung und Kalendereinladung sind unterwegs.',
      moved: 'Termin verschoben.',
      germany: 'Deutschland',
      movesLeft: 'Verbleibende Änderungen: {{count}}',
    },
    errors: {
      SLOT_UNAVAILABLE: 'Dieser Termin ist nicht mehr frei. Bitte wählen Sie einen anderen.',
      INVITE_CLOSED: 'Diese Einladung ist nicht mehr offen.',
      RESCHEDULE_TOO_LATE: 'Für eine Online-Änderung ist es zu spät.',
      RESCHEDULE_LIMIT: 'Sie haben diesen Termin bereits so oft wie erlaubt geändert.',
      CANCEL_TOO_LATE: 'Für eine Online-Absage ist es zu spät — bitte schreiben Sie uns.',
    },
  },
};

const en: Copy = {
  m: {
    ivcal: {
      pickTitle: 'Pick your interview time',
      changeTitle: 'Change your interview time',
      from: 'Invitation from {{company}}',
      hint: 'Times in Baku time, German time below.',
      pick: 'Pick a time',
      change: 'Change time',
      book: 'Book',
      close: 'Close',
      minutes: '{{count}} min',
      noSlots: 'No free times at the moment — we will get in touch with you.',
      booked: 'Interview booked — the confirmation and calendar invite are on their way.',
      moved: 'Interview moved.',
      germany: 'Germany',
      movesLeft: 'Changes left: {{count}}',
    },
    errors: {
      SLOT_UNAVAILABLE: 'This time is no longer free. Please pick another one.',
      INVITE_CLOSED: 'This invitation is no longer open.',
      RESCHEDULE_TOO_LATE: 'It is too late to change this interview online.',
      RESCHEDULE_LIMIT: 'You have already changed this interview as often as allowed.',
      CANCEL_TOO_LATE: 'It is too late to cancel this interview online — please write to us.',
    },
  },
};

const ru: Copy = {
  m: {
    ivcal: {
      pickTitle: 'Выберите время собеседования',
      changeTitle: 'Измените время собеседования',
      from: 'Приглашение от {{company}}',
      hint: 'Время по Баку, ниже — время в Германии.',
      pick: 'Выбрать время',
      change: 'Изменить время',
      book: 'Забронировать',
      close: 'Закрыть',
      minutes: '{{count}} мин',
      noSlots: 'Сейчас свободного времени нет — мы свяжемся с вами.',
      booked: 'Собеседование забронировано — подтверждение и приглашение в календарь уже в пути.',
      moved: 'Собеседование перенесено.',
      germany: 'Германия',
      movesLeft: 'Осталось изменений: {{count}}',
    },
    errors: {
      SLOT_UNAVAILABLE: 'Это время уже занято. Пожалуйста, выберите другое.',
      INVITE_CLOSED: 'Это приглашение больше не действует.',
      RESCHEDULE_TOO_LATE: 'Изменить это собеседование онлайн уже поздно.',
      RESCHEDULE_LIMIT: 'Вы уже меняли время этого собеседования максимальное число раз.',
      CANCEL_TOO_LATE: 'Отменить это собеседование онлайн уже поздно — пожалуйста, напишите нам.',
    },
  },
};

const mobileInterviewCalendar = { az, de, en, ru };

let registered = false;
/** Adds the strings to i18next without overwriting existing keys (idempotent). */
export const registerInterviewCalendarCopy = () => {
  if (registered) return;
  const add = () => {
    if (registered) return;
    registered = true;
    (Object.keys(mobileInterviewCalendar) as (keyof typeof mobileInterviewCalendar)[]).forEach((lng) =>
      i18n.addResourceBundle(lng, 'translation', mobileInterviewCalendar[lng], true, false),
    );
  };
  if (i18n.store) add();
  else i18n.on('initialized', add);
};
