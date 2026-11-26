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
      contract_triad: 'Müştəri imzaladı — imzalayın və təsdiqləyin',
      contract_approve: 'Müqavilə təsdiq gözləyir',
      vacancy_request: 'Yeni vakansiya sorğusu',
    },
    action: {
      signContract: 'İmzalayın və təsdiqləyin',
      approveContract: 'Təsdiqlə',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi', WORK: 'Əvvəlki İş müqaviləsi' },
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
      contract_triad: 'Kunde hat unterschrieben — gegenzeichnen und freigeben',
      contract_approve: 'Vertrag wartet auf Freigabe',
      vacancy_request: 'Neue Stellenanfrage',
    },
    action: {
      signContract: 'Gegenzeichnen und freigeben',
      approveContract: 'Freigeben',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (Arbeitsvertrag mit Triad Vision)', WORK: 'İş müqaviləsi (Arbeitsvertrag)' },
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
      contract_triad: 'Client signed — countersign and approve',
      contract_approve: 'Contract awaiting approval',
      vacancy_request: 'New vacancy request',
    },
    action: {
      signContract: 'Countersign and approve',
      approveContract: 'Approve',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (employment contract with Triad Vision)', WORK: 'İş müqaviləsi (work contract)' },
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
      contract_triad: 'Клиент подписал — подпишите и утвердите',
      contract_approve: 'Договор ждёт утверждения',
      vacancy_request: 'Новый запрос вакансии',
    },
    action: {
      signContract: 'Подписать и утвердить',
      approveContract: 'Утвердить',
    },
    note: {
      contractStep: { LABOUR: 'Əmək müqaviləsi (трудовой договор с Triad Vision)', WORK: 'İş müqaviləsi (рабочий договор)' },
      vacancyRequestType: { WORK: 'Работа', AUSBILDUNG: 'Ausbildung' },
    },
  },
};

export const pagesTodayQueue = { az, de, en, ru };
export default pagesTodayQueue;
