import type { Locale } from '@prisma/client';

/** Agent-facing and admin-facing copy for the partner programme (az is the source language). */

const intlLocale: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export const formatMoney = (cents: number, currency: string, locale: Locale) => {
  try {
    return new Intl.NumberFormat(intlLocale[locale] ?? 'en-GB', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

export const EVENT_LABEL: Record<Locale, Record<string, string>> = {
  az: { CASE_CREATED: 'müraciət yaradıldı', CONTRACT_SIGNED: 'müqavilə imzalandı', VISA_APPROVED: 'viza təsdiqləndi', INVOICE_PAID: 'faktura ödənildi', EMPLOYER_APPROVED: 'işəgötürən təsdiqləndi', MANUAL: 'əl ilə əlavə' },
  de: { CASE_CREATED: 'Antrag erstellt', CONTRACT_SIGNED: 'Vertrag unterschrieben', VISA_APPROVED: 'Visum erteilt', INVOICE_PAID: 'Rechnung bezahlt', EMPLOYER_APPROVED: 'Arbeitgeber freigeschaltet', MANUAL: 'manuell' },
  en: { CASE_CREATED: 'application created', CONTRACT_SIGNED: 'contract signed', VISA_APPROVED: 'visa approved', INVOICE_PAID: 'invoice paid', EMPLOYER_APPROVED: 'employer approved', MANUAL: 'manual' },
  ru: { CASE_CREATED: 'заявка создана', CONTRACT_SIGNED: 'договор подписан', VISA_APPROVED: 'виза одобрена', INVOICE_PAID: 'счёт оплачен', EMPLOYER_APPROVED: 'работодатель одобрен', MANUAL: 'вручную' },
};

export const AGENT_TEXT: Record<
  Locale,
  {
    earnedTitle: (amount: string) => string;
    earnedBody: (event: string, client: string) => string;
    paidTitle: (amount: string) => string;
    paidBody: (count: number, ref: string) => string;
    inviteTitle: string;
    inviteBody: (code: string) => string;
    inviteCta: string;
    cta: string;
  }
> = {
  az: {
    earnedTitle: (a) => `Yeni komissiya: ${a}`,
    earnedBody: (e, c) => `Tövsiyə etdiyiniz müştəri (${c}) üçün komissiya yazıldı: ${e}. Komissiya təsdiq gözləyir.`,
    paidTitle: (a) => `Komissiya ödənildi: ${a}`,
    paidBody: (n, r) => `${n} komissiya ödənildi.${r ? ` Ödəniş arayışı: ${r}` : ''}`,
    inviteTitle: 'Triad Vision tərəfdaş kabinetinə dəvət',
    inviteBody: (code) => `Sizin üçün Triad Vision tərəfdaş (agent) kabineti yaradıldı. Referal kodunuz: ${code}.\n\nŞifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.`,
    inviteCta: 'Şifrəni təyin et',
    cta: 'Qazanclara bax',
  },
  de: {
    earnedTitle: (a) => `Neue Provision: ${a}`,
    earnedBody: (e, c) => `Für einen von Ihnen geworbenen Kunden (${c}) wurde eine Provision erfasst: ${e}. Die Provision wartet auf Freigabe.`,
    paidTitle: (a) => `Provision ausgezahlt: ${a}`,
    paidBody: (n, r) => `${n} Provision(en) wurden ausgezahlt.${r ? ` Zahlungsreferenz: ${r}` : ''}`,
    inviteTitle: 'Einladung zum Triad-Vision-Partnerportal',
    inviteBody: (code) => `Für Sie wurde ein Zugang zum Triad-Vision-Partnerportal (Agenten) angelegt. Ihr Empfehlungscode: ${code}.\n\nKlicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`,
    inviteCta: 'Passwort festlegen',
    cta: 'Einnahmen ansehen',
  },
  en: {
    earnedTitle: (a) => `New commission: ${a}`,
    earnedBody: (e, c) => `A commission was recorded for a client you referred (${c}): ${e}. It is waiting for approval.`,
    paidTitle: (a) => `Commission paid: ${a}`,
    paidBody: (n, r) => `${n} commission(s) were paid out.${r ? ` Payment reference: ${r}` : ''}`,
    inviteTitle: 'Invitation to the Triad Vision partner portal',
    inviteBody: (code) => `A Triad Vision partner (agent) account was created for you. Your referral code: ${code}.\n\nClick the button below to set your password. The link is valid for 7 days.`,
    inviteCta: 'Set your password',
    cta: 'View earnings',
  },
  ru: {
    earnedTitle: (a) => `Новая комиссия: ${a}`,
    earnedBody: (e, c) => `По приглашённому вами клиенту (${c}) начислена комиссия: ${e}. Комиссия ожидает подтверждения.`,
    paidTitle: (a) => `Комиссия выплачена: ${a}`,
    paidBody: (n, r) => `Выплачено комиссий: ${n}.${r ? ` Номер платежа: ${r}` : ''}`,
    inviteTitle: 'Приглашение в партнёрский кабинет Triad Vision',
    inviteBody: (code) => `Для вас создан партнёрский (агентский) кабинет Triad Vision. Ваш реферальный код: ${code}.\n\nНажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`,
    inviteCta: 'Задать пароль',
    cta: 'Открыть доходы',
  },
};

export const ADMIN_UNPAID_TEXT: Record<Locale, { title: (n: number) => string; body: (n: number, total: string) => string }> = {
  az: { title: (n) => `${n} təsdiqlənmiş agent komissiyası ödənilməyib`, body: (n, t) => `${n} komissiya 14 gündən çoxdur təsdiqlənib, lakin hələ ödənilməyib (cəmi ${t}).` },
  de: { title: (n) => `${n} freigegebene Agentenprovision(en) unbezahlt`, body: (n, t) => `${n} Provision(en) sind seit über 14 Tagen freigegeben, aber noch nicht ausgezahlt (gesamt ${t}).` },
  en: { title: (n) => `${n} approved agent commission(s) unpaid`, body: (n, t) => `${n} commission(s) were approved more than 14 days ago and are still unpaid (total ${t}).` },
  ru: { title: (n) => `Не выплачено одобренных комиссий агентов: ${n}`, body: (n, t) => `${n} комиссий одобрены более 14 дней назад, но ещё не выплачены (всего ${t}).` },
};
