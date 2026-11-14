// Referral partner profile: the "Panel" tab (components/partners/hub/DashboardTab.tsx, GET /admin/partners/:id/dashboard).
// Registered with registerCopy(pagesPartnerDashboard) by the tab; `partnerHub.tabs.dashboard` is merged into the hub copy.
const az = {
  partnerHub: { tabs: { dashboard: 'Panel' } },
  partnerDash: {
    kpi: {
      clients: 'Müştərilər',
      newClients: 'Yeni müştərilər (12 ay)',
      refusalRate: 'İmtina faizi',
      refusalHint: '{{refused}} imtina / {{decided}} qərar',
      noDecision: 'Hələ qərar yoxdur',
      commissions: 'Komissiya (12 ay)',
      revenue: 'Ödənişlər (12 ay)',
    },
    status: { title: 'Müraciətlər statusa görə', aria: 'Partnyorun müraciətləri statusa görə', empty: 'Partnyora hələ müraciət bağlanmayıb.' },
    newClients: { title: 'Aylıq yeni müştərilər', aria: 'Son 12 ayda aylıq yeni müştərilər' },
    commissions: { title: 'Aylıq komissiya', aria: 'Son 12 ayda aylıq komissiya', note: 'Ləğv olunanlar daxil deyil.' },
    revenue: { title: 'Müştəri ödənişləri', aria: 'Son 12 ayda partnyorun müştərilərindən daxil olan ödənişlər', note: 'Yalnız admin görür.' },
    otherCurrency: '{{count}} qeyd başqa valyutada — qrafikə daxil deyil.',
    quota: { title: 'Kvota', none: 'Kvota təyin olunmayıb.', set: 'Kvotanı partnyor formasında təyin edin.' },
    activity: {
      title: 'Son fəaliyyət',
      empty: 'Hələ fəaliyyət yoxdur.',
      case: 'Yeni müraciət: {{client}}',
      status: '{{client}}: {{status}}',
      commission: 'Komissiya: {{amount}}',
      note: { NOTE: 'Qeyd', CALL: 'Zəng', MEETING: 'Görüş', EMAIL: 'E-poçt', TASK: 'Tapşırıq' },
      commissionStatus: { PENDING: 'gözləyir', APPROVED: 'təsdiqlənib', PAID: 'ödənilib', CANCELLED: 'ləğv olunub' },
      more: 'Bütün tarixçə',
    },
  },
};

const de: typeof az = {
  partnerHub: { tabs: { dashboard: 'Übersicht' } },
  partnerDash: {
    kpi: {
      clients: 'Kunden',
      newClients: 'Neue Kunden (12 Monate)',
      refusalRate: 'Ablehnungsquote',
      refusalHint: '{{refused}} Ablehnungen / {{decided}} Entscheidungen',
      noDecision: 'Noch keine Entscheidung',
      commissions: 'Provision (12 Monate)',
      revenue: 'Zahlungen (12 Monate)',
    },
    status: { title: 'Anträge nach Status', aria: 'Anträge des Partners nach Status', empty: 'Dem Partner sind noch keine Anträge zugeordnet.' },
    newClients: { title: 'Neue Kunden pro Monat', aria: 'Neue Kunden pro Monat, letzte 12 Monate' },
    commissions: { title: 'Provision pro Monat', aria: 'Provision pro Monat, letzte 12 Monate', note: 'Ohne stornierte.' },
    revenue: { title: 'Kundenzahlungen', aria: 'Zahlungen der Kunden des Partners, letzte 12 Monate', note: 'Nur für Admins sichtbar.' },
    otherCurrency: '{{count}} Einträge in anderer Währung — nicht im Diagramm.',
    quota: { title: 'Kontingent', none: 'Kein Kontingent festgelegt.', set: 'Kontingent im Partnerformular festlegen.' },
    activity: {
      title: 'Letzte Aktivität',
      empty: 'Noch keine Aktivität.',
      case: 'Neuer Antrag: {{client}}',
      status: '{{client}}: {{status}}',
      commission: 'Provision: {{amount}}',
      note: { NOTE: 'Notiz', CALL: 'Anruf', MEETING: 'Termin', EMAIL: 'E-Mail', TASK: 'Aufgabe' },
      commissionStatus: { PENDING: 'offen', APPROVED: 'freigegeben', PAID: 'bezahlt', CANCELLED: 'storniert' },
      more: 'Gesamter Verlauf',
    },
  },
};

const en: typeof az = {
  partnerHub: { tabs: { dashboard: 'Dashboard' } },
  partnerDash: {
    kpi: {
      clients: 'Clients',
      newClients: 'New clients (12 months)',
      refusalRate: 'Refusal rate',
      refusalHint: '{{refused}} refused / {{decided}} decided',
      noDecision: 'No decision yet',
      commissions: 'Commission (12 months)',
      revenue: 'Payments (12 months)',
    },
    status: { title: 'Cases by status', aria: "The partner's cases by status", empty: 'No cases linked to this partner yet.' },
    newClients: { title: 'New clients per month', aria: 'New clients per month, last 12 months' },
    commissions: { title: 'Commission per month', aria: 'Commission per month, last 12 months', note: 'Cancelled ones excluded.' },
    revenue: { title: 'Client payments', aria: "Payments received from the partner's clients, last 12 months", note: 'Visible to admins only.' },
    otherCurrency: '{{count}} entries in another currency — not in the chart.',
    quota: { title: 'Quota', none: 'No quota set.', set: 'Set the quota in the partner form.' },
    activity: {
      title: 'Latest activity',
      empty: 'No activity yet.',
      case: 'New case: {{client}}',
      status: '{{client}}: {{status}}',
      commission: 'Commission: {{amount}}',
      note: { NOTE: 'Note', CALL: 'Call', MEETING: 'Meeting', EMAIL: 'Email', TASK: 'Task' },
      commissionStatus: { PENDING: 'pending', APPROVED: 'approved', PAID: 'paid', CANCELLED: 'cancelled' },
      more: 'Full history',
    },
  },
};

const ru: typeof az = {
  partnerHub: { tabs: { dashboard: 'Обзор' } },
  partnerDash: {
    kpi: {
      clients: 'Клиенты',
      newClients: 'Новые клиенты (12 мес.)',
      refusalRate: 'Доля отказов',
      refusalHint: '{{refused}} отказов / {{decided}} решений',
      noDecision: 'Решений пока нет',
      commissions: 'Комиссия (12 мес.)',
      revenue: 'Платежи (12 мес.)',
    },
    status: { title: 'Заявки по статусам', aria: 'Заявки партнёра по статусам', empty: 'К партнёру ещё не привязаны заявки.' },
    newClients: { title: 'Новые клиенты по месяцам', aria: 'Новые клиенты по месяцам за последние 12 месяцев' },
    commissions: { title: 'Комиссия по месяцам', aria: 'Комиссия по месяцам за последние 12 месяцев', note: 'Без отменённых.' },
    revenue: { title: 'Платежи клиентов', aria: 'Платежи клиентов партнёра за последние 12 месяцев', note: 'Видно только администраторам.' },
    otherCurrency: '{{count}} записей в другой валюте — не на графике.',
    quota: { title: 'Квота', none: 'Квота не задана.', set: 'Задайте квоту в форме партнёра.' },
    activity: {
      title: 'Последняя активность',
      empty: 'Активности пока нет.',
      case: 'Новая заявка: {{client}}',
      status: '{{client}}: {{status}}',
      commission: 'Комиссия: {{amount}}',
      note: { NOTE: 'Заметка', CALL: 'Звонок', MEETING: 'Встреча', EMAIL: 'E-mail', TASK: 'Задача' },
      commissionStatus: { PENDING: 'ожидает', APPROVED: 'одобрена', PAID: 'выплачена', CANCELLED: 'отменена' },
      more: 'Вся история',
    },
  },
};

export const pagesPartnerDashboard = { az, de, en, ru };
export default pagesPartnerDashboard;
