/** Server texts of shared mailboxes (lib/mail/access): in-app notices to the mailbox owner and the colleague. */
type Locale = 'az' | 'de' | 'en' | 'ru';
type Level = 'READ' | 'SEND';

interface Texts {
  level: Record<Level, string>;
  ownerGrantedTitle: (who: string, mailbox: string) => string;
  ownerGrantedBody: (who: string, level: string) => string;
  ownerRevokedTitle: (who: string, mailbox: string) => string;
  userGrantedTitle: (mailbox: string) => string;
  userGrantedBody: (owner: string, level: string) => string;
  userRevokedTitle: (mailbox: string) => string;
}

const texts: Record<Locale, Texts> = {
  az: {
    level: { READ: 'Oxu', SEND: 'Oxu və göndər' },
    ownerGrantedTitle: (who, mailbox) => `${who} sizin ${mailbox} poçt qutunuza giriş aldı`,
    ownerGrantedBody: (who, level) => `Giriş səviyyəsi: ${level}. Super admin bu girişi verib. Kimin girişi olduğunu poçtun parametrlərində görə bilərsiniz.`,
    ownerRevokedTitle: (who, mailbox) => `${who} artıq ${mailbox} poçt qutunuzu görmür`,
    userGrantedTitle: (mailbox) => `Sizə ${mailbox} poçt qutusuna giriş verildi`,
    userGrantedBody: (owner, level) => `Qutunun sahibi: ${owner}. Giriş səviyyəsi: ${level}. Qutu poçtda "Paylaşılan" kimi görünür.`,
    userRevokedTitle: (mailbox) => `${mailbox} poçt qutusuna girişiniz bağlandı`,
  },
  de: {
    level: { READ: 'Lesen', SEND: 'Lesen und senden' },
    ownerGrantedTitle: (who, mailbox) => `${who} hat Zugriff auf Ihr Postfach ${mailbox} erhalten`,
    ownerGrantedBody: (who, level) => `Zugriffsstufe: ${level}. Ein Super-Admin hat den Zugriff erteilt. Wer Zugriff hat, sehen Sie in den Mail-Einstellungen.`,
    ownerRevokedTitle: (who, mailbox) => `${who} hat keinen Zugriff mehr auf Ihr Postfach ${mailbox}`,
    userGrantedTitle: (mailbox) => `Sie haben Zugriff auf das Postfach ${mailbox} erhalten`,
    userGrantedBody: (owner, level) => `Inhaber: ${owner}. Zugriffsstufe: ${level}. Das Postfach erscheint in der Mail als „Geteilt“.`,
    userRevokedTitle: (mailbox) => `Ihr Zugriff auf das Postfach ${mailbox} wurde entzogen`,
  },
  en: {
    level: { READ: 'Read', SEND: 'Read and send' },
    ownerGrantedTitle: (who, mailbox) => `${who} was given access to your mailbox ${mailbox}`,
    ownerGrantedBody: (who, level) => `Access level: ${level}. A super admin gave this access. You can see who has access in the mail settings.`,
    ownerRevokedTitle: (who, mailbox) => `${who} no longer has access to your mailbox ${mailbox}`,
    userGrantedTitle: (mailbox) => `You were given access to the mailbox ${mailbox}`,
    userGrantedBody: (owner, level) => `Owner: ${owner}. Access level: ${level}. The mailbox appears in Mail as "Shared".`,
    userRevokedTitle: (mailbox) => `Your access to the mailbox ${mailbox} was removed`,
  },
  ru: {
    level: { READ: 'Чтение', SEND: 'Чтение и отправка' },
    ownerGrantedTitle: (who, mailbox) => `${who} получил(а) доступ к вашему почтовому ящику ${mailbox}`,
    ownerGrantedBody: (who, level) => `Уровень доступа: ${level}. Доступ выдал супер-админ. Кто имеет доступ, видно в настройках почты.`,
    ownerRevokedTitle: (who, mailbox) => `${who} больше не имеет доступа к вашему ящику ${mailbox}`,
    userGrantedTitle: (mailbox) => `Вам открыт доступ к почтовому ящику ${mailbox}`,
    userGrantedBody: (owner, level) => `Владелец: ${owner}. Уровень доступа: ${level}. Ящик виден в почте как «Общий».`,
    userRevokedTitle: (mailbox) => `Ваш доступ к почтовому ящику ${mailbox} закрыт`,
  },
};

export const mailAccessText = (locale: string | null | undefined): Texts => texts[(locale as Locale) in texts ? (locale as Locale) : 'az'];
