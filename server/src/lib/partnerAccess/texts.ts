import type { Locale } from '@prisma/client';

/** E-mails and notifications of partner team members and partner messages (az is the source language). */
export interface PartnerAccessText {
  memberInviteTitle: string;
  memberInviteBody: (name: string, partner: string) => string;
  memberInviteCta: string;
  replyTitle: string;
  replyBody: (text: string) => string;
  replyCta: string;
}

export const PARTNER_ACCESS_TEXT: Record<Locale, PartnerAccessText> = {
  az: {
    memberInviteTitle: 'Triad Vision partnyor kabinetinə dəvət',
    memberInviteBody: (n, p) =>
      `Hörmətli ${n}, «${p}» sizi Triad Vision partnyor kabinetinə komanda üzvü kimi əlavə etdi. Kabinetdə yalnız sizə icazə verilən bölmələri görəcəksiniz.\n\nŞifrənizi təyin etmək üçün aşağıdakı düyməyə basın. Link 7 gün etibarlıdır.`,
    memberInviteCta: 'Şifrəni təyin et',
    replyTitle: 'Triad Vision komandasından cavab',
    replyBody: (t) => t,
    replyCta: 'Mesajlara bax',
  },
  de: {
    memberInviteTitle: 'Einladung zum Triad-Vision-Partnerportal',
    memberInviteBody: (n, p) =>
      `Hallo ${n}, „${p}“ hat Sie als Teammitglied zum Triad-Vision-Partnerportal hinzugefügt. Sie sehen dort nur die Bereiche, die für Sie freigegeben sind.\n\nKlicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.`,
    memberInviteCta: 'Passwort festlegen',
    replyTitle: 'Antwort vom Triad-Vision-Team',
    replyBody: (t) => t,
    replyCta: 'Nachrichten ansehen',
  },
  en: {
    memberInviteTitle: 'Invitation to the Triad Vision partner portal',
    memberInviteBody: (n, p) =>
      `Hello ${n}, "${p}" added you as a team member to the Triad Vision partner portal. You will only see the areas you have been given access to.\n\nClick the button below to set your password. The link is valid for 7 days.`,
    memberInviteCta: 'Set your password',
    replyTitle: 'Reply from the Triad Vision team',
    replyBody: (t) => t,
    replyCta: 'View messages',
  },
  ru: {
    memberInviteTitle: 'Приглашение в партнёрский кабинет Triad Vision',
    memberInviteBody: (n, p) =>
      `Здравствуйте, ${n}! «${p}» добавил(а) вас в партнёрский кабинет Triad Vision как члена команды. Вы увидите только разделы, к которым вам открыт доступ.\n\nНажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.`,
    memberInviteCta: 'Задать пароль',
    replyTitle: 'Ответ команды Triad Vision',
    replyBody: (t) => t,
    replyCta: 'Открыть сообщения',
  },
};
