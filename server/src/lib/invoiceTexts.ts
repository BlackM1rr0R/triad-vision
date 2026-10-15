/** Invoice email / notification texts for employers (4 languages) and the internal staff notes. */
export type InvoiceLocale = 'az' | 'de' | 'en' | 'ru';

export const asInvoiceLocale = (l: string | null | undefined): InvoiceLocale =>
  l === 'az' || l === 'en' || l === 'ru' || l === 'de' ? l : 'de';

const INTL: Record<InvoiceLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Integer cents → "1.234,56 €" (always German number format: the invoice itself is German). */
export const formatEur = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/[  ]/g, ' ');

/** Calendar date in Berlin, e.g. "15.10.2026" (de) / "15 October 2026" (en). */
export const formatInvoiceDate = (d: Date, locale: InvoiceLocale = 'de') =>
  new Intl.DateTimeFormat(INTL[locale], locale === 'de' ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);

interface Ctx {
  number: string;
  company: string;
  amount: string;
  due: string;
  days?: number;
  note?: string | null;
}

interface Msg {
  title: string;
  body: string;
}

interface Catalogue {
  sent: (c: Ctx) => Msg;
  overdue: (c: Ctx) => Msg;
  reminder: (c: Ctx) => Msg;
  cancelled: (c: Ctx) => Msg;
  cta: string;
}

const az: Catalogue = {
  sent: (c) => ({ title: `Yeni hesab-faktura ${c.number}`, body: `Hörmətli ${c.company} komandası,\n\n${c.number} nömrəli hesab-faktura əlavə olunub.\n\nMəbləğ: ${c.amount}\nÖdəniş tarixi: ${c.due}\n\nÖdəniş zamanı təyinatda hesab-faktura nömrəsini qeyd edin. Hesab-fakturalarınızı şirkət kabinetində də görə bilərsiniz.` }),
  overdue: (c) => ({ title: `Ödəniş gecikir: ${c.number}`, body: `Hörmətli ${c.company} komandası,\n\n${c.number} nömrəli hesab-fakturanın (${c.amount}) ödəniş müddəti ${c.due} tarixində bitib. Zəhmət olmasa ödənişi ən qısa zamanda edin. Artıq ödəmisinizsə, bu məktubu nəzərə almayın.` }),
  reminder: (c) => ({ title: `Xatırlatma: ${c.number} ödənilməyib`, body: `Hörmətli ${c.company} komandası,\n\n${c.number} nömrəli hesab-faktura (${c.amount}) hələ ödənilməyib — ödəniş tarixi ${c.due} idi (${c.days} gün əvvəl). Zəhmət olmasa ödənişi edin və ya bizimlə əlaqə saxlayın.` }),
  cancelled: (c) => ({ title: `Hesab-faktura ləğv edildi: ${c.number}`, body: `Hörmətli ${c.company} komandası,\n\n${c.number} nömrəli hesab-faktura (${c.amount}) ləğv edildi (Stornorechnung). Ödəniş tələb olunmur.${c.note ? `\n\nQeyd: ${c.note}` : ''}` }),
  cta: 'Hesab-fakturalara bax',
};

const de: Catalogue = {
  sent: (c) => ({ title: `Neue Rechnung ${c.number}`, body: `Sehr geehrtes Team von ${c.company},\n\nanbei erhalten Sie unsere Rechnung ${c.number}.\n\nBetrag: ${c.amount}\nFällig am: ${c.due}\n\nBitte geben Sie bei der Zahlung die Rechnungsnummer als Verwendungszweck an. Alle Rechnungen finden Sie auch im Unternehmensbereich.` }),
  overdue: (c) => ({ title: `Zahlung überfällig: ${c.number}`, body: `Sehr geehrtes Team von ${c.company},\n\ndie Rechnung ${c.number} über ${c.amount} war am ${c.due} fällig. Bitte begleichen Sie den Betrag zeitnah. Sollten Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.` }),
  reminder: (c) => ({ title: `Zahlungserinnerung: ${c.number}`, body: `Sehr geehrtes Team von ${c.company},\n\ndie Rechnung ${c.number} über ${c.amount} ist weiterhin offen (fällig seit ${c.due}, ${c.days} Tage). Bitte überweisen Sie den Betrag oder melden Sie sich bei Rückfragen.` }),
  cancelled: (c) => ({ title: `Rechnung storniert: ${c.number}`, body: `Sehr geehrtes Team von ${c.company},\n\ndie Rechnung ${c.number} über ${c.amount} wurde storniert (Stornorechnung). Es ist keine Zahlung erforderlich.${c.note ? `\n\nHinweis: ${c.note}` : ''}` }),
  cta: 'Rechnungen ansehen',
};

const en: Catalogue = {
  sent: (c) => ({ title: `New invoice ${c.number}`, body: `Dear ${c.company} team,\n\nplease find attached our invoice ${c.number}.\n\nAmount: ${c.amount}\nDue date: ${c.due}\n\nPlease quote the invoice number as the payment reference. All invoices are also available in your company area.` }),
  overdue: (c) => ({ title: `Payment overdue: ${c.number}`, body: `Dear ${c.company} team,\n\ninvoice ${c.number} for ${c.amount} was due on ${c.due}. Please settle it as soon as possible. If you have already paid, please disregard this message.` }),
  reminder: (c) => ({ title: `Payment reminder: ${c.number}`, body: `Dear ${c.company} team,\n\ninvoice ${c.number} for ${c.amount} is still open (due since ${c.due}, ${c.days} days). Please transfer the amount or contact us if you have any questions.` }),
  cancelled: (c) => ({ title: `Invoice cancelled: ${c.number}`, body: `Dear ${c.company} team,\n\ninvoice ${c.number} for ${c.amount} has been cancelled (credit note). No payment is required.${c.note ? `\n\nNote: ${c.note}` : ''}` }),
  cta: 'View invoices',
};

const ru: Catalogue = {
  sent: (c) => ({ title: `Новый счёт ${c.number}`, body: `Уважаемая команда ${c.company},\n\nво вложении наш счёт ${c.number}.\n\nСумма: ${c.amount}\nСрок оплаты: ${c.due}\n\nПожалуйста, укажите номер счёта в назначении платежа. Все счета также доступны в кабинете компании.` }),
  overdue: (c) => ({ title: `Оплата просрочена: ${c.number}`, body: `Уважаемая команда ${c.company},\n\nсрок оплаты счёта ${c.number} на сумму ${c.amount} истёк ${c.due}. Пожалуйста, оплатите его в ближайшее время. Если вы уже оплатили, просто проигнорируйте это письмо.` }),
  reminder: (c) => ({ title: `Напоминание об оплате: ${c.number}`, body: `Уважаемая команда ${c.company},\n\nсчёт ${c.number} на сумму ${c.amount} всё ещё не оплачен (срок — ${c.due}, ${c.days} дн. назад). Пожалуйста, переведите сумму или свяжитесь с нами.` }),
  cancelled: (c) => ({ title: `Счёт аннулирован: ${c.number}`, body: `Уважаемая команда ${c.company},\n\nсчёт ${c.number} на сумму ${c.amount} аннулирован (Stornorechnung). Оплата не требуется.${c.note ? `\n\nПримечание: ${c.note}` : ''}` }),
  cta: 'Открыть счета',
};

export const invoiceTexts: Record<InvoiceLocale, Catalogue> = { az, de, en, ru };

/** Internal notes for admins (Azerbaijani, like the other staff notifications). */
export const staffInvoiceTexts = {
  overdue: (c: Ctx) => ({ title: `Hesab-faktura gecikir: ${c.number}`, body: `${c.company} — ${c.amount}, ödəniş tarixi ${c.due} idi. Status OVERDUE olaraq dəyişdirildi.` }),
  reminder: (c: Ctx) => ({ title: `Hələ ödənilməyib: ${c.number}`, body: `${c.company} — ${c.amount}, ${c.days} gündür gecikir. Şirkətə xatırlatma göndərildi.` }),
};
