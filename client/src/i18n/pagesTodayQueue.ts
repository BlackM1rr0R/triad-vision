// "Bu günün işləri" (/admin/today, components/today): queue kinds added for case contracts, "apply via Triad Vision"
// applications and vacancy requests, plus the scope "Mənim sahəm" (every case of the own access scope).
// Registered with registerCopy(pagesTodayQueue) by components/today/kinds.ts. Staff texts: az, de, en, ru.

const az = {
  today: {
    scope: {
      area: 'Mənim sahəm',
      areaHint: 'Sizə açıq olan bütün müraciətlər (giriş icazənizə görə), təkcə Sizə təyin olunanlar yox',
    },
    kind: {
      contract_triad: 'Triad Vision imzalamalıdır',
      contract_approve: 'Müqavilə təsdiq gözləyir',
      external_help: 'Müştəri kömək istədi (Alınmadı)',
      external_ready: 'Göndərməyə hazır müraciət',
      vacancy_request: 'Yeni vakansiya sorğusu',
    },
    action: {
      signContract: 'İmzala',
      approveContract: 'Təsdiqlə',
      sendNow: 'İndi göndər',
      markSent: 'Göndərildi',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi', WORK: 'İş müqaviləsi' },
      externalHelp: 'Müştəri özü göndərə bilmədi',
      externalHasEmail: 'İşəgötürənin e-poçtu var',
      externalNoEmail: 'İşəgötürənin e-poçtu yoxdur',
      vacancyRequestType: { WORK: 'İş', AUSBILDUNG: 'Ausbildung' },
    },
  },
};

const de: typeof az = {
  today: {
    scope: {
      area: 'Mein Bereich',
      areaHint: 'Alle Anträge, die Sie laut Ihren Zugriffsrechten sehen — nicht nur die Ihnen zugewiesenen',
    },
    kind: {
      contract_triad: 'Triad Vision muss unterschreiben',
      contract_approve: 'Vertrag wartet auf Freigabe',
      external_help: 'Kunde bittet um Hilfe („Hat nicht geklappt“)',
      external_ready: 'Bewerbung versandbereit',
      vacancy_request: 'Neue Stellenanfrage',
    },
    action: {
      signContract: 'Unterschreiben',
      approveContract: 'Freigeben',
      sendNow: 'Jetzt senden',
      markSent: 'Gesendet',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (Arbeitsvertrag mit Triad Vision)', WORK: 'İş müqaviləsi (Arbeitsvertrag)' },
      externalHelp: 'Kunde konnte selbst nicht senden',
      externalHasEmail: 'Arbeitgeber-E-Mail vorhanden',
      externalNoEmail: 'Keine Arbeitgeber-E-Mail',
      vacancyRequestType: { WORK: 'Arbeit', AUSBILDUNG: 'Ausbildung' },
    },
  },
};

const en: typeof az = {
  today: {
    scope: {
      area: 'My area',
      areaHint: 'Every case your access allows — not only the ones assigned to you',
    },
    kind: {
      contract_triad: 'Triad Vision to sign',
      contract_approve: 'Contract awaiting approval',
      external_help: 'Client asked for help ("Didn\'t work")',
      external_ready: 'Application ready to send',
      vacancy_request: 'New vacancy request',
    },
    action: {
      signContract: 'Sign',
      approveContract: 'Approve',
      sendNow: 'Send now',
      markSent: 'Sent',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (employment contract with Triad Vision)', WORK: 'İş müqaviləsi (work contract)' },
      externalHelp: 'The client could not send it',
      externalHasEmail: 'Employer e-mail known',
      externalNoEmail: 'No employer e-mail',
      vacancyRequestType: { WORK: 'Work', AUSBILDUNG: 'Ausbildung' },
    },
  },
};

const ru: typeof az = {
  today: {
    scope: {
      area: 'Моя зона',
      areaHint: 'Все заявки, доступные по вашим правам, — не только назначенные вам',
    },
    kind: {
      contract_triad: 'Подпись Triad Vision',
      contract_approve: 'Договор ждёт утверждения',
      external_help: 'Клиент просит помощи («Не получилось»)',
      external_ready: 'Отклик готов к отправке',
      vacancy_request: 'Новый запрос вакансии',
    },
    action: {
      signContract: 'Подписать',
      approveContract: 'Утвердить',
      sendNow: 'Отправить',
      markSent: 'Отправлено',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (трудовой договор с Triad Vision)', WORK: 'İş müqaviləsi (рабочий договор)' },
      externalHelp: 'Клиент не смог отправить сам',
      externalHasEmail: 'E-mail работодателя есть',
      externalNoEmail: 'Нет e-mail работодателя',
      vacancyRequestType: { WORK: 'Работа', AUSBILDUNG: 'Ausbildung' },
    },
  },
};

export const pagesTodayQueue = { az, de, en, ru };
export default pagesTodayQueue;
