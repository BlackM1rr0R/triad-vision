import type { Locale } from '@prisma/client';

/** Partner-portal copy for e-mails and notifications (az is the source language). */
export interface PartnerText {
  inviteTitle: string;
  inviteBody: (name: string) => string;
  inviteCta: string;
  approvedTitle: (client: string) => string;
  approvedBody: (client: string, number: string) => string;
  rejectedTitle: (client: string) => string;
  rejectedBody: (client: string, number: string) => string;
  appointmentTitle: (client: string) => string;
  appointmentBody: (client: string, number: string, date: string) => string;
  paidTitle: (amount: string) => string;
  paidBody: (count: number) => string;
  caseCta: string;
  commissionsCta: string;
}

export const PARTNER_TEXT: Record<Locale, PartnerText> = {
  az: {
    inviteTitle: 'Triad Vision partnyor kabinetinə dəvət',
    inviteBody: (n) => `Hörmətli ${n}, sizin üçün Triad Vision partnyor kabineti yaradıldı. Orada gətirdiyiniz müştərilərin müraciətlərini, sənədlərini və komissiyalarınızı izləyə bilərsiniz.\n\nŞifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.`,
    inviteCta: 'Şifrəni təyin et',
    approvedTitle: (c) => `Viza təsdiqləndi: ${c}`,
    approvedBody: (c, n) => `Müştəriniz ${c} (müraciət ${n}) üçün viza verildi.`,
    rejectedTitle: (c) => `Viza qərarı: imtina — ${c}`,
    rejectedBody: (c, n) => `Təəssüf ki, müştəriniz ${c} (müraciət ${n}) üçün səfirlik imtina qərarı verdi. Əməkdaşımız növbəti addımları müştəri ilə müzakirə edəcək.`,
    appointmentTitle: (c) => `Səfirlik görüşü təyin olundu: ${c}`,
    appointmentBody: (c, n, d) => `Müştəriniz ${c} (müraciət ${n}) üçün səfirlik görüşü təyin olundu: ${d}.`,
    paidTitle: (a) => `Komissiya ödənildi: ${a}`,
    paidBody: (k) => `${k} komissiya ödənildi. Ətraflı məlumat partnyor kabinetindədir.`,
    caseCta: 'Müraciətə bax',
    commissionsCta: 'Komissiyalara bax',
  },
  de: {
    inviteTitle: 'Einladung zum Triad-Vision-Partnerportal',
    inviteBody: (n) => `Hallo ${n}, für Sie wurde ein Zugang zum Triad-Vision-Partnerportal angelegt. Dort sehen Sie die Anträge und Unterlagen der von Ihnen vermittelten Kunden und Ihre Provisionen.\n\nKlicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`,
    inviteCta: 'Passwort festlegen',
    approvedTitle: (c) => `Visum erteilt: ${c}`,
    approvedBody: (c, n) => `Für Ihren Kunden ${c} (Antrag ${n}) wurde das Visum erteilt.`,
    rejectedTitle: (c) => `Visumentscheidung: Ablehnung — ${c}`,
    rejectedBody: (c, n) => `Leider hat die Botschaft das Visum für Ihren Kunden ${c} (Antrag ${n}) abgelehnt. Unser Team bespricht die nächsten Schritte mit dem Kunden.`,
    appointmentTitle: (c) => `Botschaftstermin vereinbart: ${c}`,
    appointmentBody: (c, n, d) => `Für Ihren Kunden ${c} (Antrag ${n}) wurde ein Botschaftstermin vereinbart: ${d}.`,
    paidTitle: (a) => `Provision ausgezahlt: ${a}`,
    paidBody: (k) => `${k} Provision(en) wurden ausgezahlt. Details finden Sie im Partnerportal.`,
    caseCta: 'Antrag ansehen',
    commissionsCta: 'Provisionen ansehen',
  },
  en: {
    inviteTitle: 'Invitation to the Triad Vision partner portal',
    inviteBody: (n) => `Hello ${n}, a Triad Vision partner portal account was created for you. There you can follow the applications and documents of the clients you referred and your commissions.\n\nClick the button below to set your password. The link is valid for 7 days.`,
    inviteCta: 'Set your password',
    approvedTitle: (c) => `Visa approved: ${c}`,
    approvedBody: (c, n) => `The visa for your client ${c} (application ${n}) was approved.`,
    rejectedTitle: (c) => `Visa decision: refused — ${c}`,
    rejectedBody: (c, n) => `Unfortunately the embassy refused the visa for your client ${c} (application ${n}). Our team will discuss the next steps with the client.`,
    appointmentTitle: (c) => `Embassy appointment set: ${c}`,
    appointmentBody: (c, n, d) => `An embassy appointment was set for your client ${c} (application ${n}): ${d}.`,
    paidTitle: (a) => `Commission paid: ${a}`,
    paidBody: (k) => `${k} commission(s) were paid out. See the partner portal for details.`,
    caseCta: 'View application',
    commissionsCta: 'View commissions',
  },
  ru: {
    inviteTitle: 'Приглашение в партнёрский кабинет Triad Vision',
    inviteBody: (n) => `Здравствуйте, ${n}! Для вас создан партнёрский кабинет Triad Vision. В нём вы можете следить за заявками и документами приведённых вами клиентов и своими комиссиями.\n\nНажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`,
    inviteCta: 'Задать пароль',
    approvedTitle: (c) => `Виза одобрена: ${c}`,
    approvedBody: (c, n) => `Вашему клиенту ${c} (заявка ${n}) одобрена виза.`,
    rejectedTitle: (c) => `Решение по визе: отказ — ${c}`,
    rejectedBody: (c, n) => `К сожалению, посольство отказало в визе вашему клиенту ${c} (заявка ${n}). Наш сотрудник обсудит с клиентом дальнейшие шаги.`,
    appointmentTitle: (c) => `Назначена встреча в посольстве: ${c}`,
    appointmentBody: (c, n, d) => `Вашему клиенту ${c} (заявка ${n}) назначена встреча в посольстве: ${d}.`,
    paidTitle: (a) => `Комиссия выплачена: ${a}`,
    paidBody: (k) => `Выплачено комиссий: ${k}. Подробности — в партнёрском кабинете.`,
    caseCta: 'Открыть заявку',
    commissionsCta: 'Открыть комиссии',
  },
};
