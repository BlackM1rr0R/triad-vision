/**
 * E-mails of the EUR → AZN rate alerts (lib/rateAlerts/service.ts) in az / de / en / ru (Turkish visitors get the
 * Azerbaijani, Ukrainian visitors the Russian e-mails: mailLocale). The consent wording itself is shown by the form
 * (client i18n/pagesRateAlert.ts, key rateAlert.form.consent); CONSENT_VERSION names the wording a subscriber agreed
 * to and is stored with the alert and in the consent log — bump it when that text changes.
 */
export const CONSENT_VERSION = '2026-11-22';

export const MAIL_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];

export const mailLocale = (raw: unknown): MailLocale => {
  const s = String(raw ?? '');
  if ((MAIL_LOCALES as readonly string[]).includes(s)) return s as MailLocale;
  if (s === 'uk') return 'ru';
  return 'az';
};

export interface RateAlertMail {
  /** "≥ 2,0000 AZN" */
  condition: (dir: 'gte' | 'lte', target: string) => string;
  confirmSubject: string;
  confirmBody: (condition: string) => string;
  confirmCta: string;
  firedSubject: (rate: string) => string;
  firedBody: (o: { rate: string; date: string; condition: string }) => string;
  firedCta: string;
  pausedNote: string;
  rearm: string;
  manage: string;
  unsubscribe: string;
  why: string;
  expiredSubject: string;
  expiredBody: (condition: string) => string;
  expiredCta: string;
  source: string;
}

export const RATE_ALERT_MAIL: Record<MailLocale, RateAlertMail> = {
  az: {
    condition: (d, t) => `1 EUR ${d === 'gte' ? '≥' : '≤'} ${t} AZN`,
    confirmSubject: 'Avro məzənnəsi bildirişini təsdiqləyin',
    confirmBody: (c) =>
      `Azərbaycan Mərkəzi Bankının (AMB) rəsmi məzənnəsi bu şərtə çatanda sizə bir məktub göndərməyimizi istədiniz: ${c}. Zəhmət olmasa e-poçt ünvanınızı təsdiqləyin — təsdiq olmadan heç nə göndərmirik və sorğu 7 gündən sonra silinir.\n\nBunu siz etməmisinizsə, bu məktubu sadəcə nəzərə almayın.`,
    confirmCta: 'Bildirişi təsdiqlə',
    firedSubject: (r) => `Məzənnə hədəfinizə çatdı: 1 EUR = ${r} AZN`,
    firedBody: (o) => `AMB-nin ${o.date} tarixli rəsmi məzənnəsi: 1 EUR = ${o.rate} AZN. Hədəfiniz: ${o.condition}.\n\nBank və köçürmə xidmətləri adətən öz məzənnəsini və komissiyasını tətbiq edir — göndərmədən əvvəl yekun məbləği yoxlayın.`,
    firedCta: 'Ailəyə pul kalkulyatoru',
    pausedNote: 'Bildiriş indi dayandırılıb — yenidən xəbər almaq istəsəniz, bir düymə ilə yenidən aktivləşdirin.',
    rearm: 'Yenidən aktivləşdir',
    manage: 'Bildirişi idarə etmək',
    unsubscribe: 'Abunəlikdən çıxmaq',
    why: 'Bu məktubu triad-vision.de saytında avro məzənnəsi bildirişinə abunə olduğunuz üçün alırsınız. Məzənnə məlumat xarakterlidir, maliyyə məsləhəti deyil.',
    expiredSubject: 'Avro məzənnəsi bildirişinizin müddəti bitdi',
    expiredBody: (c) => `Bildirişiniz (${c}) 6 ay aktiv idi və indi avtomatik dayandırıldı. Hələ də lazımdırsa, bir düymə ilə onu daha 6 ay uzadın. Lazım deyilsə, heç nə etməyin — məlumatlar 30 gündən sonra silinir.`,
    expiredCta: 'Daha 6 ay uzat',
    source: 'Mənbə: Azərbaycan Respublikasının Mərkəzi Bankı (cbar.az), rəsmi gündəlik məzənnə.',
  },
  de: {
    condition: (d, t) => `1 EUR ${d === 'gte' ? '≥' : '≤'} ${t} AZN`,
    confirmSubject: 'Bitte bestätigen Sie Ihren Euro-Kursalarm',
    confirmBody: (c) =>
      `Sie möchten eine E-Mail erhalten, sobald der offizielle Kurs der Zentralbank Aserbaidschans (CBAR) diese Bedingung erreicht: ${c}. Bitte bestätigen Sie Ihre E-Mail-Adresse — ohne Bestätigung senden wir nichts, und die Anfrage wird nach 7 Tagen gelöscht.\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail einfach.`,
    confirmCta: 'Kursalarm bestätigen',
    firedSubject: (r) => `Ihr Kursziel ist erreicht: 1 EUR = ${r} AZN`,
    firedBody: (o) => `Offizieller CBAR-Kurs vom ${o.date}: 1 EUR = ${o.rate} AZN. Ihr Ziel: ${o.condition}.\n\nBanken und Überweisungsdienste rechnen meist mit eigenem Kurs und Gebühren — prüfen Sie den Endbetrag vor dem Senden.`,
    firedCta: 'Rechner „Geld für die Familie“',
    pausedNote: 'Der Alarm ist jetzt pausiert — wenn Sie wieder benachrichtigt werden möchten, aktivieren Sie ihn mit einem Klick erneut.',
    rearm: 'Erneut aktivieren',
    manage: 'Alarm verwalten',
    unsubscribe: 'Abmelden',
    why: 'Sie erhalten diese E-Mail, weil Sie auf triad-vision.de einen Euro-Kursalarm abonniert haben. Der Kurs dient der Information und ist keine Finanzberatung.',
    expiredSubject: 'Ihr Euro-Kursalarm ist abgelaufen',
    expiredBody: (c) => `Ihr Alarm (${c}) war 6 Monate aktiv und wurde jetzt automatisch beendet. Wenn Sie ihn weiter brauchen, verlängern Sie ihn mit einem Klick um 6 Monate; sonst müssen Sie nichts tun — die Daten werden nach 30 Tagen gelöscht.`,
    expiredCta: 'Um 6 Monate verlängern',
    source: 'Quelle: Zentralbank der Republik Aserbaidschan (cbar.az), offizieller Tageskurs.',
  },
  en: {
    condition: (d, t) => `1 EUR ${d === 'gte' ? '≥' : '≤'} ${t} AZN`,
    confirmSubject: 'Please confirm your euro rate alert',
    confirmBody: (c) =>
      `You asked us to e-mail you once the official rate of the Central Bank of Azerbaijan (CBAR) reaches: ${c}. Please confirm your e-mail address — we send nothing without it, and the request is deleted after 7 days.\n\nIf this wasn't you, simply ignore this e-mail.`,
    confirmCta: 'Confirm the alert',
    firedSubject: (r) => `Your rate target is reached: 1 EUR = ${r} AZN`,
    firedBody: (o) => `Official CBAR rate of ${o.date}: 1 EUR = ${o.rate} AZN. Your target: ${o.condition}.\n\nBanks and transfer services usually apply their own rate and fees — check the final amount before you send.`,
    firedCta: 'Money for family calculator',
    pausedNote: 'The alert is now paused — re-arm it with one click if you want to hear from us again.',
    rearm: 'Re-arm the alert',
    manage: 'Manage the alert',
    unsubscribe: 'Unsubscribe',
    why: 'You receive this e-mail because you subscribed to a euro rate alert on triad-vision.de. The rate is for information only and is not financial advice.',
    expiredSubject: 'Your euro rate alert has expired',
    expiredBody: (c) => `Your alert (${c}) was active for 6 months and has now ended automatically. If you still need it, extend it by 6 months with one click; otherwise do nothing — the data is deleted after 30 days.`,
    expiredCta: 'Extend by 6 months',
    source: 'Source: Central Bank of the Republic of Azerbaijan (cbar.az), official daily rate.',
  },
  ru: {
    condition: (d, t) => `1 EUR ${d === 'gte' ? '≥' : '≤'} ${t} AZN`,
    confirmSubject: 'Подтвердите уведомление о курсе евро',
    confirmBody: (c) =>
      `Вы попросили написать вам, когда официальный курс Центрального банка Азербайджана (ЦБА) достигнет условия: ${c}. Пожалуйста, подтвердите адрес — без подтверждения мы ничего не отправляем, а запрос удаляется через 7 дней.\n\nЕсли это были не вы, просто проигнорируйте письмо.`,
    confirmCta: 'Подтвердить уведомление',
    firedSubject: (r) => `Курс достиг вашей цели: 1 EUR = ${r} AZN`,
    firedBody: (o) => `Официальный курс ЦБА на ${o.date}: 1 EUR = ${o.rate} AZN. Ваша цель: ${o.condition}.\n\nБанки и сервисы переводов обычно применяют свой курс и комиссии — проверьте итоговую сумму перед отправкой.`,
    firedCta: 'Калькулятор «Деньги семье»',
    pausedNote: 'Уведомление приостановлено — включите его снова одним кликом, если хотите получать письма дальше.',
    rearm: 'Включить снова',
    manage: 'Управлять уведомлением',
    unsubscribe: 'Отписаться',
    why: 'Вы получили это письмо, потому что подписались на уведомление о курсе евро на triad-vision.de. Курс носит информационный характер и не является финансовой консультацией.',
    expiredSubject: 'Срок уведомления о курсе евро истёк',
    expiredBody: (c) => `Ваше уведомление (${c}) работало 6 месяцев и теперь автоматически завершено. Если оно ещё нужно, продлите его на 6 месяцев одним кликом; иначе ничего не делайте — данные удалятся через 30 дней.`,
    expiredCta: 'Продлить на 6 месяцев',
    source: 'Источник: Центральный банк Азербайджанской Республики (cbar.az), официальный дневной курс.',
  },
};
