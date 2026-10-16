import type { Locale, SignerRole } from '@prisma/client';

/**
 * Copy for the e-signature module: emails and in-app notifications in the four portal languages
 * (formal German "Sie", Russian "вы"). PDF labels live in pdf.ts (German + English).
 */

const fmt: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** "16 October 2026, 14:05 (UTC)" in the reader's language. */
export const formatUtc = (d: Date, locale: Locale) =>
  `${new Intl.DateTimeFormat(fmt[locale], { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(d)} (UTC)`;

export const formatDay = (d: Date, locale: Locale) => new Intl.DateTimeFormat(fmt[locale], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);

export interface EsignCopy {
  role: Record<SignerRole, string>;
  inviteSubject: (title: string) => string;
  inviteTitle: string;
  inviteBody: (p: { sender: string; title: string; message?: string | null; until?: string | null }) => string;
  reminderSubject: (title: string) => string;
  reminderTitle: string;
  reminderBody: (p: { title: string; until?: string | null }) => string;
  cta: string;
  linkNote: string;
  legalNote: string;
  otpSubject: string;
  otpTitle: string;
  otpBody: (code: string, title: string) => string;
  completedSubject: (title: string) => string;
  completedTitle: string;
  completedBody: (p: { title: string; sha: string }) => string;
  declinedSubject: (title: string) => string;
  declinedTitle: string;
  declinedBody: (p: { title: string; name: string; reason: string }) => string;
  closedSubject: (title: string) => string;
  closedTitle: string;
  closedBody: (p: { title: string }) => string;
  expiredTitle: string;
  expiredBody: (p: { title: string }) => string;
  signedTitle: string;
  signedBody: (p: { title: string; name: string; done: number; total: number }) => string;
  portalTitle: string;
  portalBody: (p: { title: string }) => string;
}

const az: EsignCopy = {
  role: { CANDIDATE: 'Namizəd', COMPANY: 'İşəgötürən', STAFF: 'Triad Vision', OTHER: 'Digər tərəf' },
  inviteSubject: (t) => `Triad Vision · İmza tələbi: ${t}`,
  inviteTitle: 'Sənədi imzalamağınız xahiş olunur',
  inviteBody: (p) =>
    `${p.sender} (Triad Vision) sizdən "${p.title}" sənədini onlayn imzalamağınızı xahiş edir.` +
    (p.message ? `\n\n${p.message}` : '') +
    (p.until ? `\n\nSon tarix: ${p.until}.` : ''),
  reminderSubject: (t) => `Triad Vision · Xatırlatma: ${t}`,
  reminderTitle: 'Xatırlatma: sənəd imzanızı gözləyir',
  reminderBody: (p) => `"${p.title}" sənədi hələ də imzanızı gözləyir.` + (p.until ? `\n\nSon tarix: ${p.until}.` : ''),
  cta: 'Sənədə bax və imzala',
  linkNote:
    'Bu link şəxsidir — onu heç kimə göndərməyin. Açdıqdan sonra şəxsiyyətinizi bu e-poçt ünvanına göndərilən 6 rəqəmli kodla təsdiqləyəcəksiniz. Əvvəlki linklər artıq etibarlı deyil.',
  legalNote: 'Bu, sadə elektron imzadır (eIDAS Art. 25(1)), audit izi ilə qeydə alınır; kvalifikasiyalı elektron imza deyil.',
  otpSubject: 'Triad Vision · İmza üçün təsdiq kodu',
  otpTitle: 'Təsdiq kodunuz',
  otpBody: (c, t) =>
    `"${t}" sənədini imzalamaq üçün təsdiq kodunuz: ${c}\n\nKod 10 dəqiqə etibarlıdır və yalnız bir dəfə istifadə oluna bilər. Kodu heç kimə deməyin.`,
  completedSubject: (t) => `Triad Vision · İmzalandı: ${t}`,
  completedTitle: 'Bütün tərəflər imzaladı',
  completedBody: (p) =>
    `"${p.title}" sənədi bütün tərəflər tərəfindən imzalandı. İmzalanmış sənəd imza səhifəsi və audit sertifikatı ilə birlikdə əlavədədir.\n\nYekun faylın SHA-256 cəmi: ${p.sha}`,
  declinedSubject: (t) => `Triad Vision · İmzadan imtina: ${t}`,
  declinedTitle: 'İmzalamaqdan imtina edildi',
  declinedBody: (p) => `${p.name} "${p.title}" sənədini imzalamaqdan imtina etdi.\n\nSəbəb: ${p.reason}`,
  closedSubject: (t) => `Triad Vision · İmza tələbi bağlandı: ${t}`,
  closedTitle: 'İmza tələbi bağlandı',
  closedBody: (p) => `"${p.title}" üçün imza tələbi artıq aktiv deyil. Heç bir əməliyyat tələb olunmur. Suallarınız olarsa, bizimlə əlaqə saxlayın.`,
  expiredTitle: 'İmza tələbinin vaxtı bitdi',
  expiredBody: (p) => `"${p.title}" üçün imza tələbinin müddəti bitdi və bütün tərəflər imzalamadı.`,
  signedTitle: 'Yeni imza',
  signedBody: (p) => `${p.name} "${p.title}" sənədini imzaladı (${p.done}/${p.total}).`,
  portalTitle: 'İmzalanacaq sənəd',
  portalBody: (p) => `"${p.title}" sənədi imzanızı gözləyir. Kabinetinizdə və ya e-poçtdakı link ilə imzalaya bilərsiniz.`,
};

const de: EsignCopy = {
  role: { CANDIDATE: 'Kandidat/in', COMPANY: 'Arbeitgeber', STAFF: 'Triad Vision', OTHER: 'Weitere Partei' },
  inviteSubject: (t) => `Triad Vision · Bitte unterschreiben: ${t}`,
  inviteTitle: 'Bitte unterschreiben Sie ein Dokument',
  inviteBody: (p) =>
    `${p.sender} (Triad Vision) bittet Sie, das Dokument „${p.title}" online zu unterschreiben.` +
    (p.message ? `\n\n${p.message}` : '') +
    (p.until ? `\n\nBitte unterschreiben Sie bis zum ${p.until}.` : ''),
  reminderSubject: (t) => `Triad Vision · Erinnerung: ${t}`,
  reminderTitle: 'Erinnerung: Ein Dokument wartet auf Ihre Unterschrift',
  reminderBody: (p) => `Das Dokument „${p.title}" wartet noch auf Ihre Unterschrift.` + (p.until ? `\n\nBitte unterschreiben Sie bis zum ${p.until}.` : ''),
  cta: 'Dokument ansehen und unterschreiben',
  linkNote:
    'Dieser Link ist persönlich – bitte leiten Sie ihn nicht weiter. Nach dem Öffnen bestätigen Sie Ihre Identität mit einem 6-stelligen Code, den wir an diese E-Mail-Adresse senden. Frühere Links sind nicht mehr gültig.',
  legalNote: 'Es handelt sich um eine einfache elektronische Signatur (eIDAS Art. 25 Abs. 1) mit Prüfprotokoll, nicht um eine qualifizierte elektronische Signatur.',
  otpSubject: 'Triad Vision · Ihr Bestätigungscode zum Unterschreiben',
  otpTitle: 'Ihr Bestätigungscode',
  otpBody: (c, t) =>
    `Ihr Bestätigungscode zum Unterschreiben von „${t}": ${c}\n\nDer Code ist 10 Minuten gültig und kann nur einmal verwendet werden. Geben Sie den Code an niemanden weiter.`,
  completedSubject: (t) => `Triad Vision · Vollständig unterschrieben: ${t}`,
  completedTitle: 'Alle Parteien haben unterschrieben',
  completedBody: (p) =>
    `Das Dokument „${p.title}" wurde von allen Parteien unterschrieben. Im Anhang finden Sie das unterschriebene Dokument mit Unterschriftenseite und Abschlusszertifikat.\n\nSHA-256 der finalen Datei: ${p.sha}`,
  declinedSubject: (t) => `Triad Vision · Unterschrift abgelehnt: ${t}`,
  declinedTitle: 'Unterschrift abgelehnt',
  declinedBody: (p) => `${p.name} hat die Unterschrift von „${p.title}" abgelehnt.\n\nGrund: ${p.reason}`,
  closedSubject: (t) => `Triad Vision · Signaturanfrage geschlossen: ${t}`,
  closedTitle: 'Signaturanfrage geschlossen',
  closedBody: (p) => `Die Signaturanfrage für „${p.title}" ist nicht mehr aktiv. Sie müssen nichts weiter tun. Bei Fragen wenden Sie sich bitte an uns.`,
  expiredTitle: 'Signaturanfrage abgelaufen',
  expiredBody: (p) => `Die Signaturanfrage für „${p.title}" ist abgelaufen, bevor alle Parteien unterschrieben haben.`,
  signedTitle: 'Neue Unterschrift',
  signedBody: (p) => `${p.name} hat „${p.title}" unterschrieben (${p.done}/${p.total}).`,
  portalTitle: 'Dokument zur Unterschrift',
  portalBody: (p) => `Das Dokument „${p.title}" wartet auf Ihre Unterschrift. Sie können in Ihrem Portal oder über den Link in der E-Mail unterschreiben.`,
};

const en: EsignCopy = {
  role: { CANDIDATE: 'Candidate', COMPANY: 'Employer', STAFF: 'Triad Vision', OTHER: 'Other party' },
  inviteSubject: (t) => `Triad Vision · Please sign: ${t}`,
  inviteTitle: 'Please sign a document',
  inviteBody: (p) =>
    `${p.sender} (Triad Vision) asks you to sign "${p.title}" online.` +
    (p.message ? `\n\n${p.message}` : '') +
    (p.until ? `\n\nPlease sign by ${p.until}.` : ''),
  reminderSubject: (t) => `Triad Vision · Reminder: ${t}`,
  reminderTitle: 'Reminder: a document is waiting for your signature',
  reminderBody: (p) => `"${p.title}" is still waiting for your signature.` + (p.until ? `\n\nPlease sign by ${p.until}.` : ''),
  cta: 'Review and sign',
  linkNote:
    'This link is personal — please do not forward it. After opening it you confirm your identity with a 6-digit code we send to this email address. Earlier links no longer work.',
  legalNote: 'This is a simple electronic signature (eIDAS Art. 25(1)) with an audit trail, not a qualified electronic signature.',
  otpSubject: 'Triad Vision · Your signing code',
  otpTitle: 'Your confirmation code',
  otpBody: (c, t) => `Your confirmation code to sign "${t}": ${c}\n\nThe code is valid for 10 minutes and can be used once. Never share it.`,
  completedSubject: (t) => `Triad Vision · Completed: ${t}`,
  completedTitle: 'All parties have signed',
  completedBody: (p) =>
    `"${p.title}" has been signed by all parties. The signed document with the signature page and the certificate of completion is attached.\n\nSHA-256 of the final file: ${p.sha}`,
  declinedSubject: (t) => `Triad Vision · Signature declined: ${t}`,
  declinedTitle: 'Signature declined',
  declinedBody: (p) => `${p.name} declined to sign "${p.title}".\n\nReason: ${p.reason}`,
  closedSubject: (t) => `Triad Vision · Signature request closed: ${t}`,
  closedTitle: 'Signature request closed',
  closedBody: (p) => `The signature request for "${p.title}" is no longer active. You don't need to do anything. Contact us if you have questions.`,
  expiredTitle: 'Signature request expired',
  expiredBody: (p) => `The signature request for "${p.title}" expired before all parties signed.`,
  signedTitle: 'New signature',
  signedBody: (p) => `${p.name} signed "${p.title}" (${p.done}/${p.total}).`,
  portalTitle: 'Document to sign',
  portalBody: (p) => `"${p.title}" is waiting for your signature. You can sign in your portal or with the link in the email.`,
};

const ru: EsignCopy = {
  role: { CANDIDATE: 'Кандидат', COMPANY: 'Работодатель', STAFF: 'Triad Vision', OTHER: 'Другая сторона' },
  inviteSubject: (t) => `Triad Vision · Просьба подписать: ${t}`,
  inviteTitle: 'Пожалуйста, подпишите документ',
  inviteBody: (p) =>
    `${p.sender} (Triad Vision) просит вас подписать документ «${p.title}» онлайн.` +
    (p.message ? `\n\n${p.message}` : '') +
    (p.until ? `\n\nПожалуйста, подпишите до ${p.until}.` : ''),
  reminderSubject: (t) => `Triad Vision · Напоминание: ${t}`,
  reminderTitle: 'Напоминание: документ ждёт вашей подписи',
  reminderBody: (p) => `Документ «${p.title}» всё ещё ждёт вашей подписи.` + (p.until ? `\n\nПожалуйста, подпишите до ${p.until}.` : ''),
  cta: 'Просмотреть и подписать',
  linkNote:
    'Это персональная ссылка — не пересылайте её. После открытия вы подтвердите личность 6-значным кодом, который мы отправим на этот адрес. Прежние ссылки больше не действуют.',
  legalNote: 'Это простая электронная подпись (eIDAS ст. 25(1)) с журналом аудита, а не квалифицированная электронная подпись.',
  otpSubject: 'Triad Vision · Код подтверждения для подписи',
  otpTitle: 'Ваш код подтверждения',
  otpBody: (c, t) => `Ваш код подтверждения для подписания «${t}»: ${c}\n\nКод действителен 10 минут и может быть использован один раз. Никому не сообщайте код.`,
  completedSubject: (t) => `Triad Vision · Подписано: ${t}`,
  completedTitle: 'Все стороны подписали',
  completedBody: (p) =>
    `Документ «${p.title}» подписан всеми сторонами. Подписанный документ со страницей подписей и сертификатом завершения во вложении.\n\nSHA-256 итогового файла: ${p.sha}`,
  declinedSubject: (t) => `Triad Vision · Отказ от подписи: ${t}`,
  declinedTitle: 'Отказ от подписи',
  declinedBody: (p) => `${p.name} отказался(-ась) подписать «${p.title}».\n\nПричина: ${p.reason}`,
  closedSubject: (t) => `Triad Vision · Запрос на подпись закрыт: ${t}`,
  closedTitle: 'Запрос на подпись закрыт',
  closedBody: (p) => `Запрос на подпись «${p.title}» больше не активен. Вам ничего не нужно делать. Если у вас есть вопросы, свяжитесь с нами.`,
  expiredTitle: 'Срок запроса на подпись истёк',
  expiredBody: (p) => `Срок запроса на подпись «${p.title}» истёк до того, как все стороны подписали.`,
  signedTitle: 'Новая подпись',
  signedBody: (p) => `${p.name} подписал(а) «${p.title}» (${p.done}/${p.total}).`,
  portalTitle: 'Документ на подпись',
  portalBody: (p) => `Документ «${p.title}» ждёт вашей подписи. Подписать можно в личном кабинете или по ссылке из письма.`,
};

export const ESIGN_TEXTS: Record<Locale, EsignCopy> = { az, de, en, ru };
export const esignText = (locale: Locale | string | null | undefined): EsignCopy => ESIGN_TEXTS[(locale as Locale) ?? 'az'] ?? ESIGN_TEXTS.az;
