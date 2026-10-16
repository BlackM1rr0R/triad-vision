import type { Locale, PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';

/** Request type names as the person reads them (emails, in-app notifications). */
export const TYPE_NAME: Record<Locale, Record<PrivacyRequestType, string>> = {
  az: {
    EXPORT: 'Məlumatların surəti (ixrac)',
    DELETION: 'Məlumatların silinməsi',
    RECTIFICATION: 'Məlumatların düzəldilməsi',
    RESTRICTION: 'Emalın məhdudlaşdırılması',
    OBJECTION: 'Emala etiraz',
  },
  de: {
    EXPORT: 'Datenauskunft (Export)',
    DELETION: 'Löschung der Daten',
    RECTIFICATION: 'Berichtigung der Daten',
    RESTRICTION: 'Einschränkung der Verarbeitung',
    OBJECTION: 'Widerspruch gegen die Verarbeitung',
  },
  en: {
    EXPORT: 'Copy of your data (export)',
    DELETION: 'Deletion of your data',
    RECTIFICATION: 'Correction of your data',
    RESTRICTION: 'Restriction of processing',
    OBJECTION: 'Objection to processing',
  },
  ru: {
    EXPORT: 'Копия данных (экспорт)',
    DELETION: 'Удаление данных',
    RECTIFICATION: 'Исправление данных',
    RESTRICTION: 'Ограничение обработки',
    OBJECTION: 'Возражение против обработки',
  },
};

const fmtDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);

type Texts = { title: string; body: string };

/** Confirmation that a request was received (Art. 12(3): answer within one month). */
export const receivedText = (locale: Locale, type: PrivacyRequestType, dueAt: Date): Texts => {
  const name = TYPE_NAME[locale][type];
  const due = fmtDay(dueAt, locale);
  switch (locale) {
    case 'de':
      return {
        title: `Ihre Datenschutzanfrage ist eingegangen: ${name}`,
        body: `Wir haben Ihre Anfrage „${name}“ erhalten und bearbeiten sie spätestens bis zum ${due} (Art. 12 Abs. 3 DSGVO).\n\nDen Stand sehen Sie jederzeit in Ihrem Konto unter „Datenschutz“. Wenn Sie diese Anfrage nicht gestellt haben, antworten Sie bitte auf diese E-Mail.`,
      };
    case 'en':
      return {
        title: `We received your privacy request: ${name}`,
        body: `We received your request "${name}" and will answer it by ${due} at the latest (Art. 12(3) GDPR).\n\nYou can follow its status in your account under "Privacy". If you did not make this request, please reply to this email.`,
      };
    case 'ru':
      return {
        title: `Ваш запрос о данных получен: ${name}`,
        body: `Мы получили ваш запрос «${name}» и ответим на него не позднее ${due} (ст. 12(3) GDPR).\n\nСтатус можно посмотреть в личном кабинете в разделе «Конфиденциальность». Если вы не отправляли этот запрос, ответьте на это письмо.`,
      };
    default:
      return {
        title: `Məxfilik sorğunuz qəbul edildi: ${name}`,
        body: `"${name}" sorğunuzu aldıq və ən gec ${due} tarixinədək cavablandıracağıq (GDPR, maddə 12(3)).\n\nSorğunun vəziyyətini kabinetinizdə "Məxfilik" bölməsində izləyə bilərsiniz. Bu sorğunu siz göndərməmisinizsə, bu məktuba cavab yazın.`,
      };
  }
};

/** The request was completed or rejected (with the reason). */
export const decidedText = (locale: Locale, type: PrivacyRequestType, status: PrivacyRequestStatus, note?: string | null): Texts => {
  const name = TYPE_NAME[locale][type];
  const done = status === 'COMPLETED';
  const reason = note?.trim() ? `\n\n${note.trim()}` : '';
  switch (locale) {
    case 'de':
      return done
        ? { title: `Ihre Datenschutzanfrage ist erledigt: ${name}`, body: `Ihre Anfrage „${name}“ wurde bearbeitet und abgeschlossen.${reason}` }
        : {
            title: `Ihre Datenschutzanfrage wurde abgelehnt: ${name}`,
            body: `Ihre Anfrage „${name}“ konnte nicht umgesetzt werden.${reason}\n\nSie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).`,
          };
    case 'en':
      return done
        ? { title: `Your privacy request is complete: ${name}`, body: `Your request "${name}" has been handled and closed.${reason}` }
        : {
            title: `Your privacy request was declined: ${name}`,
            body: `We could not carry out your request "${name}".${reason}\n\nYou have the right to lodge a complaint with a data protection supervisory authority (Art. 77 GDPR).`,
          };
    case 'ru':
      return done
        ? { title: `Ваш запрос о данных выполнен: ${name}`, body: `Ваш запрос «${name}» обработан и закрыт.${reason}` }
        : {
            title: `Ваш запрос о данных отклонён: ${name}`,
            body: `Мы не смогли выполнить ваш запрос «${name}».${reason}\n\nВы вправе подать жалобу в надзорный орган по защите данных (ст. 77 GDPR).`,
          };
    default:
      return done
        ? { title: `Məxfilik sorğunuz icra edildi: ${name}`, body: `"${name}" sorğunuza baxıldı və bağlandı.${reason}` }
        : {
            title: `Məxfilik sorğunuz rədd edildi: ${name}`,
            body: `"${name}" sorğunuzu icra edə bilmədik.${reason}\n\nMəlumatların qorunması üzrə nəzarət orqanına şikayət etmək hüququnuz var (GDPR, maddə 77).`,
          };
  }
};

/** Self-service export downloaded (security notice: someone with access to the account downloaded the data). */
export const exportedText = (locale: Locale): Texts => {
  switch (locale) {
    case 'de':
      return { title: 'Ihre Daten wurden heruntergeladen', body: 'Aus Ihrem Konto wurde soeben eine Kopie Ihrer Daten (JSON) heruntergeladen. Waren Sie das nicht, ändern Sie bitte sofort Ihr Passwort.' };
    case 'en':
      return { title: 'Your data was downloaded', body: 'A copy of your data (JSON) was just downloaded from your account. If this was not you, please change your password right away.' };
    case 'ru':
      return { title: 'Ваши данные скачаны', body: 'Из вашего аккаунта только что скачана копия ваших данных (JSON). Если это были не вы, сразу смените пароль.' };
    default:
      return { title: 'Məlumatlarınız yükləndi', body: 'Hesabınızdan indicə məlumatlarınızın surəti (JSON) yükləndi. Bunu siz etməmisinizsə, dərhal şifrənizi dəyişin.' };
  }
};

/** Staff side (admin panel language is Azerbaijani). */
export const ADMIN_TYPE_NAME: Record<PrivacyRequestType, string> = TYPE_NAME.az;
