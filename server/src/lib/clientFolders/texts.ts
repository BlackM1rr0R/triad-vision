import type { Locale } from '@prisma/client';

/**
 * Client notification of "Müştəriyə göndər" (finished documents sent to the portal), in the client's language.
 * The client prepares the application and goes to the embassy themself — we only prepare the documents.
 */
interface ReadyDocsText {
  title: (count: number) => string;
  body: (p: { name: string; number: string; count: number; resend: boolean; nextEmbassy?: boolean }) => string;
  cta: string;
}

export const READY_DOCS_TEXT: Record<Locale, ReadyDocsText> = {
  az: {
    title: (n) => (n === 1 ? 'Hazır sənədiniz kabinetdədir' : `Hazır sənədləriniz kabinetdədir (${n})`),
    body: (p) =>
      `${p.name ? `Hörmətli ${p.name}, ` : ''}${p.resend ? 'yenilənmiş ' : ''}hazır sənədlər müraciət ${p.number} üzrə şəxsi kabinetinizə yükləndi. ` +
      'Onları "Sənədlər" bölməsində "Sizin üçün fayllar" hissəsində açıb yükləyə bilərsiniz. Sualınız olarsa, müraciətdəki mesajlara yazın.' +
      (p.nextEmbassy ? ' Almaniya sənədləriniz hazırdır. Növbəti addım: səfirlik üçün tələb olunan sənədləri kabinetinizdə yükləyin.' : ''),
    cta: 'Sənədlərə bax',
  },
  de: {
    title: (n) => (n === 1 ? 'Ihr fertiges Dokument ist im Portal' : `Ihre fertigen Dokumente sind im Portal (${n})`),
    body: (p) =>
      `${p.name ? `Hallo ${p.name}, ` : ''}die ${p.resend ? 'aktualisierten ' : ''}fertigen Dokumente zu Ihrem Antrag ${p.number} liegen jetzt in Ihrem Kundenportal. ` +
      'Sie finden sie unter „Dokumente“ → „Dateien für Sie“ zum Öffnen und Herunterladen. Bei Fragen schreiben Sie uns in den Nachrichten des Antrags.' +
      (p.nextEmbassy ? ' Ihre deutschen Unterlagen sind fertig. Nächster Schritt: Laden Sie die für die Botschaft erforderlichen Dokumente in Ihrem Portal hoch.' : ''),
    cta: 'Dokumente ansehen',
  },
  en: {
    title: (n) => (n === 1 ? 'Your finished document is in your account' : `Your finished documents are in your account (${n})`),
    body: (p) =>
      `${p.name ? `Hello ${p.name}, ` : ''}the ${p.resend ? 'updated ' : ''}finished documents for your application ${p.number} are now in your client account. ` +
      'Open or download them under "Documents" → "Files for you". If you have questions, write to us in the application messages.' +
      (p.nextEmbassy ? ' Your German documents are ready. Next step: upload the documents required by the embassy in your account.' : ''),
    cta: 'View documents',
  },
  ru: {
    title: (n) => (n === 1 ? 'Ваш готовый документ в кабинете' : `Ваши готовые документы в кабинете (${n})`),
    body: (p) =>
      `${p.name ? `Здравствуйте, ${p.name}! ` : ''}${p.resend ? 'Обновлённые г' : 'Г'}отовые документы по заявке ${p.number} загружены в ваш личный кабинет. ` +
      'Откройте или скачайте их в разделе «Документы» → «Файлы для вас». Если есть вопросы, напишите нам в сообщениях заявки.' +
      (p.nextEmbassy ? ' Ваши немецкие документы готовы. Следующий шаг: загрузите в кабинете документы, необходимые для посольства.' : ''),
    cta: 'Открыть документы',
  },
};
