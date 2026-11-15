import type { Loc } from '../employerWorkers/texts.js';

/** Labels of the candidate one-pager PDF for employers (de / en / az / ru; employer portal languages). */

export interface OnePagerTexts {
  poolKicker: string;
  workerKicker: string;
  preparedFor: (company: string) => string;
  generated: (date: string) => string;
  qrPool: string;
  qrWorker: string;
  notePool: string;
  noteWorker: string;
  years: (n: number) => string;
  none: string;
  anyRegion: string;
  germanNone: string;
  immediately: string;
  label: {
    code: string;
    professions: string;
    experience: string;
    germanLevel: string;
    licences: string;
    recognition: string;
    regions: string;
    earliestStart: string;
    name: string;
    position: string;
    profession: string;
    visa: string;
    phase: string;
    stage: string;
    started: string;
    arrival: string;
    contractStart: string;
    probationEnd: string;
    titleValid: string;
    next: string;
    manager: string;
  };
  recognition: Record<string, string>;
}

export const ONE_PAGER_TEXTS: Record<Loc, OnePagerTexts> = {
  de: {
    poolKicker: 'Anonymes Kandidatenprofil',
    workerKicker: 'Mitarbeiterprofil',
    preparedFor: (c) => `Erstellt für ${c}`,
    generated: (d) => `Stand: ${d}`,
    qrPool: 'Profil im Arbeitgeberportal öffnen',
    qrWorker: 'Im Arbeitgeberportal öffnen',
    notePool: 'Anonymes Profil: Name und Kontaktdaten erhalten Sie erst nach Zustimmung des Kandidaten über Triad Vision.',
    noteWorker: 'Vertraulich — nur für die Planung in Ihrem Unternehmen. Enthält nur, was Ihr Mitarbeiterbereich anzeigt.',
    years: (n) => (n === 1 ? '1 Jahr' : `${n} Jahre`),
    none: '—',
    anyRegion: 'Ganz Deutschland',
    germanNone: 'Keine Deutschkenntnisse',
    immediately: 'Sofort',
    label: {
      code: 'Kandidatencode',
      professions: 'Beruf',
      experience: 'Berufserfahrung',
      germanLevel: 'Deutschniveau',
      licences: 'Führerscheine',
      recognition: 'Anerkennung',
      regions: 'Wunschregionen',
      earliestStart: 'Frühester Start',
      name: 'Name',
      position: 'Position',
      profession: 'Beruf',
      visa: 'Visum',
      phase: 'Phase',
      stage: 'Status',
      started: 'Beginn des Verfahrens',
      arrival: 'Ankunft',
      contractStart: 'Vertragsbeginn',
      probationEnd: 'Ende der Probezeit',
      titleValid: 'Visum / Aufenthaltstitel gültig bis',
      next: 'Nächster Meilenstein',
      manager: 'Ihr Ansprechpartner',
    },
    recognition: { NONE: 'Noch nicht begonnen', NOT_REQUIRED: 'Nicht erforderlich', IN_PROGRESS: 'Im Verfahren', PARTIAL: 'Teilweise anerkannt', RECOGNISED: 'Anerkannt' },
  },
  en: {
    poolKicker: 'Anonymous candidate profile',
    workerKicker: 'Worker profile',
    preparedFor: (c) => `Prepared for ${c}`,
    generated: (d) => `As of ${d}`,
    qrPool: 'Open the profile in the employer portal',
    qrWorker: 'Open in the employer portal',
    notePool: 'Anonymous profile: you receive the name and contact details only after the candidate agrees, via Triad Vision.',
    noteWorker: 'Confidential — for planning in your company only. Contains only what your workers panel shows.',
    years: (n) => (n === 1 ? '1 year' : `${n} years`),
    none: '—',
    anyRegion: 'Anywhere in Germany',
    germanNone: 'No German yet',
    immediately: 'Immediately',
    label: {
      code: 'Candidate code',
      professions: 'Profession',
      experience: 'Work experience',
      germanLevel: 'German level',
      licences: 'Driving licences',
      recognition: 'Recognition',
      regions: 'Preferred regions',
      earliestStart: 'Earliest start',
      name: 'Name',
      position: 'Position',
      profession: 'Profession',
      visa: 'Visa',
      phase: 'Phase',
      stage: 'Stage',
      started: 'Process started',
      arrival: 'Arrival',
      contractStart: 'Contract start',
      probationEnd: 'End of probation',
      titleValid: 'Visa / residence title valid until',
      next: 'Next milestone',
      manager: 'Your contact',
    },
    recognition: { NONE: 'Not started yet', NOT_REQUIRED: 'Not required', IN_PROGRESS: 'In progress', PARTIAL: 'Partially recognised', RECOGNISED: 'Recognised' },
  },
  az: {
    poolKicker: 'Anonim namizəd profili',
    workerKicker: 'İşçi profili',
    preparedFor: (c) => `${c} üçün hazırlanıb`,
    generated: (d) => `Tarix: ${d}`,
    qrPool: 'Profili işəgötürən portalında açın',
    qrWorker: 'İşəgötürən portalında açın',
    notePool: 'Anonim profil: ad və əlaqə məlumatları yalnız namizədin razılığından sonra Triad Vision vasitəsilə verilir.',
    noteWorker: 'Məxfi — yalnız şirkətinizdə planlaşdırma üçün. Yalnız işçilər panelinizdə görünən məlumatlar.',
    years: (n) => `${n} il`,
    none: '—',
    anyRegion: 'Bütün Almaniya',
    germanNone: 'Alman dili yoxdur',
    immediately: 'Dərhal',
    label: {
      code: 'Namizəd kodu',
      professions: 'Peşə',
      experience: 'İş təcrübəsi',
      germanLevel: 'Alman dili səviyyəsi',
      licences: 'Sürücülük vəsiqələri',
      recognition: 'Diplomun tanınması',
      regions: 'İstədiyi bölgələr',
      earliestStart: 'Ən tez başlama',
      name: 'Ad',
      position: 'Vəzifə',
      profession: 'Peşə',
      visa: 'Viza',
      phase: 'Faza',
      stage: 'Mərhələ',
      started: 'Prosesin başlanğıcı',
      arrival: 'Gəliş',
      contractStart: 'Müqavilənin başlanğıcı',
      probationEnd: 'Sınaq müddətinin sonu',
      titleValid: 'Viza / yaşayış icazəsi etibarlıdır',
      next: 'Növbəti mərhələ',
      manager: 'Əlaqə şəxsiniz',
    },
    recognition: { NONE: 'Hələ başlanmayıb', NOT_REQUIRED: 'Tələb olunmur', IN_PROGRESS: 'Prosesdədir', PARTIAL: 'Qismən tanınıb', RECOGNISED: 'Tanınıb' },
  },
  ru: {
    poolKicker: 'Анонимный профиль кандидата',
    workerKicker: 'Профиль сотрудника',
    preparedFor: (c) => `Подготовлено для ${c}`,
    generated: (d) => `По состоянию на ${d}`,
    qrPool: 'Открыть профиль в портале работодателя',
    qrWorker: 'Открыть в портале работодателя',
    notePool: 'Анонимный профиль: имя и контакты передаются только с согласия кандидата через Triad Vision.',
    noteWorker: 'Конфиденциально — только для планирования в вашей компании. Только данные из панели сотрудников.',
    years: (n) => `${n} г.`,
    none: '—',
    anyRegion: 'Вся Германия',
    germanNone: 'Без немецкого',
    immediately: 'Сразу',
    label: {
      code: 'Код кандидата',
      professions: 'Профессия',
      experience: 'Опыт работы',
      germanLevel: 'Уровень немецкого',
      licences: 'Водительские права',
      recognition: 'Признание диплома',
      regions: 'Желаемые регионы',
      earliestStart: 'Самое раннее начало',
      name: 'Имя',
      position: 'Должность',
      profession: 'Профессия',
      visa: 'Виза',
      phase: 'Фаза',
      stage: 'Этап',
      started: 'Начало процесса',
      arrival: 'Приезд',
      contractStart: 'Начало договора',
      probationEnd: 'Конец испытательного срока',
      titleValid: 'Виза / ВНЖ действительны до',
      next: 'Следующий этап',
      manager: 'Ваш контакт',
    },
    recognition: { NONE: 'Ещё не начато', NOT_REQUIRED: 'Не требуется', IN_PROGRESS: 'В процессе', PARTIAL: 'Частично признан', RECOGNISED: 'Признан' },
  },
};

/** German state names (Bundesland codes of the pool), the same in every language. */
export const REGION_NAMES: Record<string, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};
