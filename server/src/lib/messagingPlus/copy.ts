import type { Locale } from '@prisma/client';

/**
 * Notification texts of the three-party threads, in the recipient's language (az / de / en / ru).
 * Notifications never quote message content (privacy + no translation cost): they only say where to look.
 */

type Params = { title: string };
type Text = (p: Params) => { title: string; body: string };
export type PartyNotice = 'OPENED' | 'NEW_MESSAGE' | 'HELD' | 'REJECTED' | 'CLOSED';

const az: Record<PartyNotice, Text> = {
  OPENED: (p) => ({ title: `Yeni söhbət: ${p.title}`, body: 'Triad Vision namizəd, işəgötürən və komandamız üçün ortaq söhbət açdı. Suallarınızı orada yaza bilərsiniz.' }),
  NEW_MESSAGE: (p) => ({ title: `Yeni mesaj: ${p.title}`, body: 'Ortaq söhbətdə yeni mesaj var.' }),
  HELD: (p) => ({ title: `Yoxlama gözləyən mesaj: ${p.title}`, body: 'Söhbətdə əlaqə məlumatı və ya səsli mesaj olan bir mesaj yoxlamanı gözləyir.' }),
  REJECTED: (p) => ({ title: `Mesaj çatdırılmadı: ${p.title}`, body: 'Mesajınız əlaqə məlumatlarına görə çatdırılmadı. Əlaqə Triad Vision vasitəsilə saxlanılır.' }),
  CLOSED: (p) => ({ title: `Söhbət bağlandı: ${p.title}`, body: 'Triad Vision bu söhbəti bağladı. Mesajlar oxunmaq üçün qalır.' }),
};

const de: Record<PartyNotice, Text> = {
  OPENED: (p) => ({ title: `Neues Gespräch: ${p.title}`, body: 'Triad Vision hat ein gemeinsames Gespräch für Kandidat, Arbeitgeber und unser Team eröffnet. Sie können Ihre Fragen dort stellen.' }),
  NEW_MESSAGE: (p) => ({ title: `Neue Nachricht: ${p.title}`, body: 'Im gemeinsamen Gespräch gibt es eine neue Nachricht.' }),
  HELD: (p) => ({ title: `Nachricht zur Prüfung: ${p.title}`, body: 'Eine Nachricht mit Kontaktdaten oder eine Sprachnachricht wartet auf Prüfung.' }),
  REJECTED: (p) => ({ title: `Nachricht nicht zugestellt: ${p.title}`, body: 'Ihre Nachricht wurde wegen Kontaktdaten nicht zugestellt. Der Kontakt läuft über Triad Vision.' }),
  CLOSED: (p) => ({ title: `Gespräch geschlossen: ${p.title}`, body: 'Triad Vision hat dieses Gespräch geschlossen. Die Nachrichten bleiben lesbar.' }),
};

const en: Record<PartyNotice, Text> = {
  OPENED: (p) => ({ title: `New conversation: ${p.title}`, body: 'Triad Vision opened a shared conversation for the candidate, the employer and our team. You can ask your questions there.' }),
  NEW_MESSAGE: (p) => ({ title: `New message: ${p.title}`, body: 'There is a new message in the shared conversation.' }),
  HELD: (p) => ({ title: `Message awaiting review: ${p.title}`, body: 'A message with contact details or a voice message is waiting for review.' }),
  REJECTED: (p) => ({ title: `Message not delivered: ${p.title}`, body: 'Your message was not delivered because it contains contact details. Contact goes through Triad Vision.' }),
  CLOSED: (p) => ({ title: `Conversation closed: ${p.title}`, body: 'Triad Vision closed this conversation. The messages stay readable.' }),
};

const ru: Record<PartyNotice, Text> = {
  OPENED: (p) => ({ title: `Новый чат: ${p.title}`, body: 'Triad Vision открыл общий чат для кандидата, работодателя и нашей команды. Вы можете задать там свои вопросы.' }),
  NEW_MESSAGE: (p) => ({ title: `Новое сообщение: ${p.title}`, body: 'В общем чате новое сообщение.' }),
  HELD: (p) => ({ title: `Сообщение на проверке: ${p.title}`, body: 'Сообщение с контактными данными или голосовое сообщение ожидает проверки.' }),
  REJECTED: (p) => ({ title: `Сообщение не доставлено: ${p.title}`, body: 'Ваше сообщение не доставлено, так как содержит контактные данные. Связь идёт через Triad Vision.' }),
  CLOSED: (p) => ({ title: `Чат закрыт: ${p.title}`, body: 'Triad Vision закрыл этот чат. Сообщения остаются доступными для чтения.' }),
};

const CATALOG: Record<Locale, Record<PartyNotice, Text>> = { az, de, en, ru };

export const partyNotice = (kind: PartyNotice, locale: Locale, params: Params) => CATALOG[locale][kind]({ title: params.title.slice(0, 120) });

/** "Employer" / "Candidate" labels used in notification titles when a name may not be shown. */
export const EMPLOYER_LABEL: Record<Locale, string> = { az: 'İşəgötürən', de: 'Arbeitgeber', en: 'Employer', ru: 'Работодатель' };
