import type { Locale } from '@prisma/client';

/**
 * Client-facing texts of the next-step actions and the embassy package (always in the client's language;
 * formal address: German "Sie", Russian "вы", Azerbaijani "Siz"). Staff edit the drafts before sending.
 */

const list = (items: string[]) => items.map((x) => `• ${x}`).join('\n');

export const MESSAGE_TEXT: Record<
  Locale,
  {
    greet: (name: string) => string;
    docs: (items: string[]) => string;
    sign: string;
    idle: string;
    passport: (date: string) => string;
    appointment: (date: string, place: string | null) => string;
    translation: (doc: string) => string;
    thanks: string;
  }
> = {
  az: {
    greet: (n) => `Hörmətli ${n},`,
    docs: (i) => `müraciətinizin davam etməsi üçün bu sənədləri kabinetinizdə yükləməyinizi xahiş edirik:\n${list(i)}`,
    sign: 'müqavilə sizə imza üçün göndərilib, lakin hələ imzalanmayıb. Zəhmət olmasa kabinetinizdə müqaviləni yoxlayıb imzalayın. Sualınız varsa, buraya yazın.',
    idle: 'bir müddətdir sizdən xəbər almırıq. Müraciətinizlə bağlı sualınız və ya çətinliyiniz varsa, zəhmət olmasa bizə yazın — kömək etməyə hazırıq.',
    passport: (d) => `pasportunuzun etibarlılıq müddəti ${d} tarixində bitir. Səfirlik pasportun Almaniyaya planlaşdırılan girişdən sonra ən azı 6 ay etibarlı olmasını tələb edir. Zəhmət olmasa yeni pasport üçün müraciət edin və hazır olduqda onu kabinetinizdə yükləyin.`,
    appointment: (d, p) => `xatırladırıq: səfirlik görüşünüz ${d}${p ? `, ${p}` : ''} tarixindədir. Zəhmət olmasa pasportunuzu və bütün sənədlərin orijinallarını götürün, 15 dəqiqə tez gəlin.`,
    translation: (doc) => `səfirlik üçün "${doc}" sənədinin alman dilinə təsdiqlənmiş tərcüməsi lazımdır. Zəhmət olmasa tərcüməni kabinetinizdə yükləyin və ya tərcüməni bizdən sifariş edin.`,
    thanks: 'Hörmətlə,\nTriad Vision',
  },
  de: {
    greet: (n) => `Guten Tag ${n},`,
    docs: (i) => `damit wir Ihren Antrag weiter bearbeiten können, laden Sie bitte folgende Unterlagen in Ihrem Kundenbereich hoch:\n${list(i)}`,
    sign: 'wir haben Ihnen den Vertrag zur Unterschrift gesendet, er ist aber noch nicht unterschrieben. Bitte prüfen und unterschreiben Sie den Vertrag in Ihrem Kundenbereich. Bei Fragen schreiben Sie uns gerne hier.',
    idle: 'wir haben schon eine Weile nichts von Ihnen gehört. Wenn Sie Fragen zu Ihrem Antrag haben oder Hilfe brauchen, schreiben Sie uns bitte – wir helfen Ihnen gerne.',
    passport: (d) => `Ihr Reisepass ist nur bis ${d} gültig. Die Botschaft verlangt, dass der Pass nach der geplanten Einreise noch mindestens 6 Monate gültig ist. Bitte beantragen Sie einen neuen Reisepass und laden Sie ihn hoch, sobald Sie ihn haben.`,
    appointment: (d, p) => `wir erinnern Sie an Ihren Termin bei der Botschaft am ${d}${p ? `, ${p}` : ''}. Bitte bringen Sie Ihren Reisepass und alle Unterlagen im Original mit und seien Sie 15 Minuten früher da.`,
    translation: (doc) => `für die Botschaft benötigen wir eine beglaubigte deutsche Übersetzung von „${doc}“. Bitte laden Sie die Übersetzung hoch oder beauftragen Sie die Übersetzung bei uns.`,
    thanks: 'Mit freundlichen Grüßen\nTriad Vision',
  },
  en: {
    greet: (n) => `Dear ${n},`,
    docs: (i) => `to continue with your application, please upload the following documents in your account:\n${list(i)}`,
    sign: 'we sent you the contract for signature, but it has not been signed yet. Please review and sign it in your account. If you have any questions, just reply here.',
    idle: 'we have not heard from you for a while. If you have any questions about your application or need help, please write to us — we are happy to help.',
    passport: (d) => `your passport is valid only until ${d}. The embassy requires the passport to remain valid for at least 6 months after the planned entry. Please apply for a new passport and upload it as soon as you have it.`,
    appointment: (d, p) => `a reminder of your embassy appointment on ${d}${p ? `, ${p}` : ''}. Please bring your passport and the originals of all documents and arrive 15 minutes early.`,
    translation: (doc) => `for the embassy we need a certified German translation of "${doc}". Please upload the translation or order it from us.`,
    thanks: 'Kind regards,\nTriad Vision',
  },
  ru: {
    greet: (n) => `Здравствуйте, ${n}!`,
    docs: (i) => `чтобы мы могли продолжить работу по вашему заявлению, пожалуйста, загрузите в личном кабинете следующие документы:\n${list(i)}`,
    sign: 'мы отправили вам договор на подпись, но он ещё не подписан. Пожалуйста, проверьте и подпишите договор в личном кабинете. Если у вас есть вопросы, напишите нам здесь.',
    idle: 'мы давно не получали от вас известий. Если у вас есть вопросы по заявлению или нужна помощь, пожалуйста, напишите нам — мы с радостью поможем.',
    passport: (d) => `ваш паспорт действителен только до ${d}. Посольство требует, чтобы паспорт был действителен не менее 6 месяцев после планируемого въезда. Пожалуйста, оформите новый паспорт и загрузите его, как только получите.`,
    appointment: (d, p) => `напоминаем о вашей записи в посольство ${d}${p ? `, ${p}` : ''}. Пожалуйста, возьмите паспорт и оригиналы всех документов и приходите на 15 минут раньше.`,
    translation: (doc) => `для посольства нужен заверенный перевод на немецкий язык документа «${doc}». Пожалуйста, загрузите перевод или закажите его у нас.`,
    thanks: 'С уважением,\nTriad Vision',
  },
};

export const message = (locale: Locale, firstName: string, body: string) => {
  const t = MESSAGE_TEXT[locale] ?? MESSAGE_TEXT.de;
  return `${t.greet(firstName)}\n\n${body}\n\n${t.thanks}`;
};

/** One combined notification for several requested documents. */
export const REQUEST_BATCH: Record<Locale, { title: string; body: (items: string[]) => string }> = {
  az: { title: 'Sənədlər tələb olunur', body: (i) => `Zəhmət olmasa kabinetinizdə bu sənədləri yükləyin:\n${list(i)}` },
  de: { title: 'Unterlagen angefordert', body: (i) => `Bitte laden Sie in Ihrem Kundenbereich folgende Unterlagen hoch:\n${list(i)}` },
  en: { title: 'Documents requested', body: (i) => `Please upload these documents in your account:\n${list(i)}` },
  ru: { title: 'Запрошены документы', body: (i) => `Пожалуйста, загрузите в личном кабинете следующие документы:\n${list(i)}` },
};

/** Note of REQUEST_CHANGES (shown to the client) listing the rejected documents and why. */
export const CHANGES_NOTE: Record<Locale, (items: string[]) => string> = {
  az: (i) => `Bu sənədləri yenidən yükləməyinizi xahiş edirik:\n${list(i)}`,
  de: (i) => `Bitte laden Sie diese Unterlagen erneut hoch:\n${list(i)}`,
  en: (i) => `Please upload these documents again:\n${list(i)}`,
  ru: (i) => `Пожалуйста, загрузите эти документы заново:\n${list(i)}`,
};

/** Title of the requirement created by "request translation". */
export const TRANSLATION_TITLE = (doc: { az: string; de: string; en: string; ru: string }) => ({
  az: `${doc.az} — alman dilinə təsdiqlənmiş tərcümə`,
  de: `${doc.de} – beglaubigte deutsche Übersetzung`,
  en: `${doc.en} — certified German translation`,
  ru: `${doc.ru} — заверенный перевод на немецкий`,
});

export const fmtDate = (d: Date, locale: Locale) =>
  d.toLocaleDateString({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'de-DE', { timeZone: 'Asia/Baku', day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtDateTime = (d: Date, locale: Locale) =>
  d.toLocaleString({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale] ?? 'de-DE', { timeZone: 'Asia/Baku', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
