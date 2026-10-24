import type { Locale } from '@prisma/client';
import type { LineCategory } from './math.js';

/**
 * Client billing copy: e-mails / notifications to clients (4 languages), the second language of the invoice
 * and receipt PDFs (German is always the first; German clients get English as the second line) and the
 * internal staff notes (Azerbaijani, like the other staff notifications).
 */

export type BillingLocale = Locale;
export const asBillingLocale = (l: string | null | undefined): BillingLocale => (l === 'de' || l === 'en' || l === 'ru' || l === 'az' ? l : 'az');

interface Ctx {
  name: string;
  number: string;
  amount: string;
  open?: string;
  due: string;
  days?: number;
  reference?: string;
  bank?: string;
  note?: string | null;
}

interface OrderCtx {
  name: string;
  pkg: string;
  price: string;
  email?: string;
  caseNumber?: string;
}

interface Msg {
  title: string;
  body: string;
}

interface Catalogue {
  sent: (c: Ctx) => Msg;
  reminder1: (c: Ctx) => Msg;
  reminder2: (c: Ctx) => Msg;
  cancelled: (c: Ctx) => Msg;
  paid: (c: Ctx) => Msg;
  partial: (c: Ctx) => Msg;
  cta: string;
  orderReceived: (c: OrderCtx) => Msg;
  orderCta: string;
  orderActive: (c: OrderCtx) => Msg;
  portalCta: string;
  invite: (c: OrderCtx) => Msg;
  inviteCta: string;
}

const bankLine = (label: string, c: Ctx) => (c.bank ? `\n\n${label}:\n${c.bank}\n${c.reference ?? ''}` : '');

const az: Catalogue = {
  sent: (c) => ({ title: `Yeni hesab-faktura ${c.number}`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-faktura əlavə olunub.\n\nMəbləğ: ${c.amount}\nÖdəniş tarixi: ${c.due}${bankLine('Bank köçürməsi', c)}\n\nHesab-fakturalarınızı və ödəniş cədvəlinizi kabinetinizdə "Ödənişlər" bölməsində görə bilərsiniz.` }),
  reminder1: (c) => ({ title: `Xatırlatma: ${c.number} ödənilməyib`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-fakturanın ödəniş müddəti ${c.due} tarixində bitib. Qalıq məbləğ: ${c.open ?? c.amount}.${bankLine('Bank köçürməsi', c)}\n\nArtıq ödəmisinizsə, bu məktubu nəzərə almayın.` }),
  reminder2: (c) => ({ title: `İkinci xatırlatma: ${c.number}`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-faktura hələ də ödənilməyib (${c.days} gün gecikmə, qalıq ${c.open ?? c.amount}). Zəhmət olmasa ödənişi edin və ya sualınız varsa bizimlə əlaqə saxlayın.${bankLine('Bank köçürməsi', c)}` }),
  cancelled: (c) => ({ title: `Hesab-faktura ləğv edildi: ${c.number}`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-faktura (${c.amount}) ləğv edildi (Stornorechnung). Ödəniş tələb olunmur.${c.note ? `\n\nQeyd: ${c.note}` : ''}` }),
  paid: (c) => ({ title: `Ödəniş qəbul edildi: ${c.number}`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-faktura üzrə ${c.amount} məbləğində ödənişiniz qəbul edildi. Hesab-faktura tam ödənilib. Qəbz əlavə olunub. Təşəkkür edirik!` }),
  partial: (c) => ({ title: `Ödəniş qəbul edildi: ${c.number}`, body: `Hörmətli ${c.name},\n\n${c.number} nömrəli hesab-faktura üzrə ${c.amount} məbləğində ödənişiniz qəbul edildi. Qalıq: ${c.open}. Qəbz əlavə olunub.` }),
  cta: 'Ödənişlərə bax',
  orderReceived: (c) => ({ title: `Sifarişiniz qəbul edildi: ${c.pkg}`, body: `Hörmətli ${c.name},\n\n"${c.pkg}" paketi (${c.price}) üzrə sifarişiniz qəbul edildi. Xidmət müqaviləsi ayrıca məktubla ${c.email} ünvanına göndərildi — onu onlayn imzalayın. İmzadan sonra kabinetiniz və müraciətiniz avtomatik açılacaq.\n\nSifarişin statusunu aşağıdakı linkdə izləyə bilərsiniz.` }),
  orderCta: 'Sifarişin statusu',
  orderActive: (c) => ({ title: `Müqavilə imzalandı — müraciətiniz açıldı`, body: `Hörmətli ${c.name},\n\n"${c.pkg}" paketi üzrə müqavilə imzalandı. Müraciətiniz ${c.caseNumber ?? ''} açıldı, ilk hesab-faktura kabinetinizdə "Ödənişlər" bölməsindədir. Komandamız tezliklə sizinlə əlaqə saxlayacaq.` }),
  portalCta: 'Kabinetə keç',
  invite: (c) => ({ title: 'Triad Vision kabinetiniz hazırdır', body: `Hörmətli ${c.name},\n\nSizin üçün Triad Vision kabineti yaradıldı. Şifrənizi təyin etmək üçün aşağıdakı düyməyə klikləyin. Link 7 gün etibarlıdır.` }),
  inviteCta: 'Şifrəni təyin et',
};

const de: Catalogue = {
  sent: (c) => ({ title: `Neue Rechnung ${c.number}`, body: `Hallo ${c.name},\n\nanbei erhalten Sie unsere Rechnung ${c.number}.\n\nBetrag: ${c.amount}\nFällig am: ${c.due}${bankLine('Überweisung', c)}\n\nAlle Rechnungen und Ihren Zahlungsplan finden Sie im Kundenportal unter „Zahlungen“.` }),
  reminder1: (c) => ({ title: `Zahlungserinnerung: ${c.number}`, body: `Hallo ${c.name},\n\ndie Rechnung ${c.number} war am ${c.due} fällig. Offener Betrag: ${c.open ?? c.amount}.${bankLine('Überweisung', c)}\n\nSollten Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.` }),
  reminder2: (c) => ({ title: `Zweite Zahlungserinnerung: ${c.number}`, body: `Hallo ${c.name},\n\ndie Rechnung ${c.number} ist weiterhin offen (${c.days} Tage überfällig, offen: ${c.open ?? c.amount}). Bitte überweisen Sie den Betrag oder melden Sie sich bei Rückfragen.${bankLine('Überweisung', c)}` }),
  cancelled: (c) => ({ title: `Rechnung storniert: ${c.number}`, body: `Hallo ${c.name},\n\ndie Rechnung ${c.number} über ${c.amount} wurde storniert (Stornorechnung). Es ist keine Zahlung erforderlich.${c.note ? `\n\nHinweis: ${c.note}` : ''}` }),
  paid: (c) => ({ title: `Zahlung erhalten: ${c.number}`, body: `Hallo ${c.name},\n\nwir haben Ihre Zahlung über ${c.amount} zur Rechnung ${c.number} erhalten. Die Rechnung ist vollständig bezahlt. Die Quittung finden Sie im Anhang. Vielen Dank!` }),
  partial: (c) => ({ title: `Zahlung erhalten: ${c.number}`, body: `Hallo ${c.name},\n\nwir haben Ihre Zahlung über ${c.amount} zur Rechnung ${c.number} erhalten. Offen: ${c.open}. Die Quittung finden Sie im Anhang.` }),
  cta: 'Zahlungen ansehen',
  orderReceived: (c) => ({ title: `Bestellung erhalten: ${c.pkg}`, body: `Hallo ${c.name},\n\nvielen Dank für Ihre Bestellung des Pakets „${c.pkg}“ (${c.price}). Den Dienstleistungsvertrag haben wir Ihnen in einer separaten E-Mail an ${c.email} geschickt — bitte unterschreiben Sie ihn online. Danach werden Ihr Kundenkonto und Ihr Antrag automatisch eröffnet.\n\nDen Stand Ihrer Bestellung sehen Sie unter dem folgenden Link.` }),
  orderCta: 'Bestellstatus',
  orderActive: (c) => ({ title: 'Vertrag unterschrieben — Ihr Antrag ist eröffnet', body: `Hallo ${c.name},\n\nder Vertrag zum Paket „${c.pkg}“ ist unterschrieben. Ihr Antrag ${c.caseNumber ?? ''} wurde eröffnet; die erste Rechnung finden Sie im Kundenportal unter „Zahlungen“. Unser Team meldet sich in Kürze bei Ihnen.` }),
  portalCta: 'Zum Kundenportal',
  invite: (c) => ({ title: 'Ihr Triad-Vision-Kundenkonto ist bereit', body: `Hallo ${c.name},\n\nfür Sie wurde ein Triad-Vision-Kundenkonto angelegt. Klicken Sie auf die Schaltfläche, um Ihr Passwort festzulegen. Der Link ist 7 Tage gültig.` }),
  inviteCta: 'Passwort festlegen',
};

const en: Catalogue = {
  sent: (c) => ({ title: `New invoice ${c.number}`, body: `Dear ${c.name},\n\nplease find attached our invoice ${c.number}.\n\nAmount: ${c.amount}\nDue date: ${c.due}${bankLine('Bank transfer', c)}\n\nAll invoices and your payment plan are in your portal under "Payments".` }),
  reminder1: (c) => ({ title: `Payment reminder: ${c.number}`, body: `Dear ${c.name},\n\ninvoice ${c.number} was due on ${c.due}. Open amount: ${c.open ?? c.amount}.${bankLine('Bank transfer', c)}\n\nIf you have already paid, please disregard this message.` }),
  reminder2: (c) => ({ title: `Second payment reminder: ${c.number}`, body: `Dear ${c.name},\n\ninvoice ${c.number} is still open (${c.days} days overdue, open: ${c.open ?? c.amount}). Please transfer the amount or contact us if you have any questions.${bankLine('Bank transfer', c)}` }),
  cancelled: (c) => ({ title: `Invoice cancelled: ${c.number}`, body: `Dear ${c.name},\n\ninvoice ${c.number} for ${c.amount} has been cancelled (Stornorechnung). No payment is required.${c.note ? `\n\nNote: ${c.note}` : ''}` }),
  paid: (c) => ({ title: `Payment received: ${c.number}`, body: `Dear ${c.name},\n\nwe have received your payment of ${c.amount} for invoice ${c.number}. The invoice is paid in full. Your receipt is attached. Thank you!` }),
  partial: (c) => ({ title: `Payment received: ${c.number}`, body: `Dear ${c.name},\n\nwe have received your payment of ${c.amount} for invoice ${c.number}. Still open: ${c.open}. Your receipt is attached.` }),
  cta: 'View payments',
  orderReceived: (c) => ({ title: `Order received: ${c.pkg}`, body: `Dear ${c.name},\n\nthank you for ordering the "${c.pkg}" package (${c.price}). We have sent the service contract to ${c.email} in a separate e-mail — please sign it online. Your client account and your application are opened automatically afterwards.\n\nYou can follow your order with the link below.` }),
  orderCta: 'Order status',
  orderActive: (c) => ({ title: 'Contract signed — your application is open', body: `Dear ${c.name},\n\nthe contract for the "${c.pkg}" package is signed. Your application ${c.caseNumber ?? ''} has been opened and the first invoice is in your portal under "Payments". Our team will contact you shortly.` }),
  portalCta: 'Open the portal',
  invite: (c) => ({ title: 'Your Triad Vision account is ready', body: `Dear ${c.name},\n\na Triad Vision client account was created for you. Click the button below to set your password. The link is valid for 7 days.` }),
  inviteCta: 'Set your password',
};

const ru: Catalogue = {
  sent: (c) => ({ title: `Новый счёт ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nВо вложении счёт ${c.number}.\n\nСумма: ${c.amount}\nСрок оплаты: ${c.due}${bankLine('Банковский перевод', c)}\n\nВсе счета и график платежей — в личном кабинете в разделе «Платежи».` }),
  reminder1: (c) => ({ title: `Напоминание об оплате: ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nСрок оплаты счёта ${c.number} истёк ${c.due}. К оплате: ${c.open ?? c.amount}.${bankLine('Банковский перевод', c)}\n\nЕсли вы уже оплатили, просто проигнорируйте это письмо.` }),
  reminder2: (c) => ({ title: `Повторное напоминание: ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nСчёт ${c.number} всё ещё не оплачен (просрочка ${c.days} дн., к оплате ${c.open ?? c.amount}). Пожалуйста, оплатите его или свяжитесь с нами.${bankLine('Банковский перевод', c)}` }),
  cancelled: (c) => ({ title: `Счёт аннулирован: ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nСчёт ${c.number} на сумму ${c.amount} аннулирован (Stornorechnung). Оплата не требуется.${c.note ? `\n\nПримечание: ${c.note}` : ''}` }),
  paid: (c) => ({ title: `Оплата получена: ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nМы получили вашу оплату ${c.amount} по счёту ${c.number}. Счёт оплачен полностью. Квитанция во вложении. Спасибо!` }),
  partial: (c) => ({ title: `Оплата получена: ${c.number}`, body: `Здравствуйте, ${c.name}!\n\nМы получили вашу оплату ${c.amount} по счёту ${c.number}. Остаток: ${c.open}. Квитанция во вложении.` }),
  cta: 'Открыть платежи',
  orderReceived: (c) => ({ title: `Заказ получен: ${c.pkg}`, body: `Здравствуйте, ${c.name}!\n\nСпасибо за заказ пакета «${c.pkg}» (${c.price}). Договор об оказании услуг отправлен отдельным письмом на ${c.email} — подпишите его онлайн. После подписи личный кабинет и заявка откроются автоматически.\n\nСтатус заказа — по ссылке ниже.` }),
  orderCta: 'Статус заказа',
  orderActive: (c) => ({ title: 'Договор подписан — заявка открыта', body: `Здравствуйте, ${c.name}!\n\nДоговор по пакету «${c.pkg}» подписан. Ваша заявка ${c.caseNumber ?? ''} открыта, первый счёт — в личном кабинете в разделе «Платежи». Наша команда скоро свяжется с вами.` }),
  portalCta: 'Перейти в кабинет',
  invite: (c) => ({ title: 'Ваш кабинет Triad Vision готов', body: `Здравствуйте, ${c.name}!\n\nДля вас создан личный кабинет Triad Vision. Нажмите кнопку ниже, чтобы задать пароль. Ссылка действительна 7 дней.` }),
  inviteCta: 'Задать пароль',
};

export const billingTexts: Record<BillingLocale, Catalogue> = { az, de, en, ru };

/** Internal notes for staff (Azerbaijani). */
export const staffBillingTexts = {
  escalation: (c: { number: string; name: string; open: string; days: number }) => ({
    title: `Ödəniş gecikir: ${c.number} (${c.name})`,
    body: `${c.name} — ${c.number}, qalıq ${c.open}, ${c.days} gün gecikmə. İki xatırlatma göndərilib; müştəri ilə əlaqə saxlayın.`,
  }),
  overdue: (c: { number: string; name: string; open: string }) => ({ title: `Müştəri hesab-fakturası gecikir: ${c.number}`, body: `${c.name} — qalıq ${c.open}. Status OVERDUE olaraq dəyişdirildi.` }),
  orderNew: (c: { name: string; pkg: string; price: string; email: string }) => ({ title: `Yeni paket sifarişi: ${c.pkg}`, body: `${c.name} (${c.email}) "${c.pkg}" paketini sifariş etdi (${c.price}). Müqavilə imzaya göndərildi.` }),
  orderActive: (c: { name: string; pkg: string; caseNumber: string }) => ({ title: `Paket müqaviləsi imzalandı: ${c.caseNumber}`, body: `${c.name} "${c.pkg}" paketinin müqaviləsini imzaladı. Müraciət ${c.caseNumber} açıldı, ödəniş planı və ilk hesab-faktura yaradıldı.` }),
  orderFailed: (c: { name: string; pkg: string; error: string }) => ({ title: `Paket sifarişi aktivləşmədi: ${c.name}`, body: `"${c.pkg}" üzrə imzalanmış sifarişi avtomatik aktivləşdirmək mümkün olmadı (${c.error}). Admin → Paketlər → Sifarişlər bölməsində yoxlayın.` }),
};

// ─── PDF second language ─────────────────────────────────────────────

export interface PdfLabels {
  invoice: string;
  cancellation: string;
  receipt: string;
  invoiceNo: string;
  invoiceDate: string;
  serviceDate: string;
  dueDate: string;
  vatId: string;
  taxNo: string;
  client: string;
  pos: string;
  description: string;
  qty: string;
  unitPrice: string;
  amount: string;
  net: string;
  vat: string;
  passThrough: string;
  total: string;
  cancelledTotal: string;
  paid: string;
  open: string;
  terms: (due: string) => string;
  reference: string;
  bank: string;
  smallBusiness: string;
  passThroughNote: string;
  serviceDateIsInvoiceDate: string;
  cancelText: (number: string, date: string) => string;
  intro: string;
  receiptNo: string;
  paymentDate: string;
  method: string;
  forInvoice: string;
  receivedFrom: string;
  receiptText: string;
  remaining: string;
  page: string;
  category: Record<LineCategory, string>;
  methods: Record<'CASH' | 'BANK' | 'CARD' | 'OTHER', string>;
}

export const DE_PDF: PdfLabels = {
  invoice: 'RECHNUNG',
  cancellation: 'STORNORECHNUNG',
  receipt: 'ZAHLUNGSBESTÄTIGUNG',
  invoiceNo: 'Rechnungsnummer',
  invoiceDate: 'Rechnungsdatum',
  serviceDate: 'Leistungsdatum',
  dueDate: 'Fällig am',
  vatId: 'USt-IdNr.',
  taxNo: 'Steuernummer',
  client: 'Kunde',
  pos: 'Pos.',
  description: 'Beschreibung',
  qty: 'Menge',
  unitPrice: 'Einzelpreis',
  amount: 'Gesamt',
  net: 'Nettobetrag',
  vat: 'zzgl. USt.',
  passThrough: 'Durchlaufende Posten (ohne USt.)',
  total: 'Gesamtbetrag',
  cancelledTotal: 'Stornierter Betrag',
  paid: 'Bereits bezahlt',
  open: 'Offener Betrag',
  terms: (due) => `Zahlbar ohne Abzug bis zum ${due}.`,
  reference: 'Verwendungszweck',
  bank: 'Bankverbindung',
  smallBusiness: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).',
  passThroughNote: 'Botschafts- und Visagebühren werden im Namen und für Rechnung des Kunden verauslagt (durchlaufender Posten, § 10 Abs. 1 Satz 6 UStG).',
  serviceDateIsInvoiceDate: 'Das Leistungsdatum entspricht dem Rechnungsdatum.',
  cancelText: (n, d) => `Stornorechnung zu Rechnung Nr. ${n} vom ${d}. Die Rechnung wird hiermit storniert; es ist keine Zahlung erforderlich.`,
  intro: 'Für unsere Leistungen berechnen wir Ihnen wie folgt:',
  receiptNo: 'Beleg-Nr.',
  paymentDate: 'Zahlungsdatum',
  method: 'Zahlungsart',
  forInvoice: 'Zu Rechnung',
  receivedFrom: 'Erhalten von',
  receiptText: 'Hiermit bestätigen wir den Erhalt des folgenden Betrags:',
  remaining: 'Restbetrag der Rechnung',
  page: 'Seite',
  category: { SERVICE_FEE: 'Servicegebühr', TRANSLATION: 'Übersetzung', APOSTILLE: 'Apostille', EMBASSY_FEE: 'Botschaftsgebühr (durchlaufender Posten)', COURIER: 'Kurier', OTHER: 'Sonstiges' },
  methods: { CASH: 'Bar', BANK: 'Überweisung', CARD: 'Karte', OTHER: 'Sonstige' },
};

const EN_PDF: PdfLabels = {
  invoice: 'Invoice',
  cancellation: 'Cancellation invoice',
  receipt: 'Payment receipt',
  invoiceNo: 'Invoice no.',
  invoiceDate: 'Invoice date',
  serviceDate: 'Service date',
  dueDate: 'Due date',
  vatId: 'VAT ID',
  taxNo: 'Tax no.',
  client: 'Client',
  pos: 'Item',
  description: 'Description',
  qty: 'Qty',
  unitPrice: 'Unit price',
  amount: 'Amount',
  net: 'Net amount',
  vat: 'VAT',
  passThrough: 'Pass-through fees (no VAT)',
  total: 'Total amount due',
  cancelledTotal: 'Cancelled amount',
  paid: 'Already paid',
  open: 'Open amount',
  terms: (due) => `Payable without deduction by ${due}.`,
  reference: 'Payment reference',
  bank: 'Bank details',
  smallBusiness: 'No VAT is charged according to § 19 UStG (small business regulation).',
  passThroughNote: 'Embassy and visa fees are paid on behalf of the client and passed on without VAT.',
  serviceDateIsInvoiceDate: 'The service date is the invoice date.',
  cancelText: (n, d) => `Cancellation of invoice no. ${n} of ${d}. No payment is required.`,
  intro: 'For our services we invoice you as follows:',
  receiptNo: 'Receipt no.',
  paymentDate: 'Payment date',
  method: 'Payment method',
  forInvoice: 'For invoice',
  receivedFrom: 'Received from',
  receiptText: 'We confirm receipt of the following amount:',
  remaining: 'Remaining amount of the invoice',
  page: 'Page',
  category: { SERVICE_FEE: 'Service fee', TRANSLATION: 'Translation', APOSTILLE: 'Apostille', EMBASSY_FEE: 'Embassy fee (pass-through)', COURIER: 'Courier', OTHER: 'Other' },
  methods: { CASH: 'Cash', BANK: 'Bank transfer', CARD: 'Card', OTHER: 'Other' },
};

const AZ_PDF: PdfLabels = {
  ...EN_PDF,
  invoice: 'Hesab-faktura',
  cancellation: 'Ləğv hesab-fakturası',
  receipt: 'Ödəniş qəbzi',
  invoiceNo: 'Hesab-faktura №',
  invoiceDate: 'Tarix',
  serviceDate: 'Xidmət tarixi',
  dueDate: 'Ödəniş tarixi',
  vatId: 'ƏDV nömrəsi',
  taxNo: 'Vergi nömrəsi',
  client: 'Müştəri',
  pos: '№',
  description: 'Təsvir',
  qty: 'Say',
  unitPrice: 'Qiymət',
  amount: 'Məbləğ',
  net: 'Xalis məbləğ',
  vat: 'ƏDV',
  passThrough: 'Tranzit ödənişlər (ƏDV-siz)',
  total: 'Ödəniləcək məbləğ',
  cancelledTotal: 'Ləğv edilən məbləğ',
  paid: 'Ödənilib',
  open: 'Qalıq',
  terms: (due) => `${due} tarixinədək tam ödənilməlidir.`,
  reference: 'Ödənişin təyinatı',
  bank: 'Bank rekvizitləri',
  smallBusiness: '§ 19 UStG-yə əsasən ƏDV tutulmur (kiçik sahibkarlıq).',
  passThroughNote: 'Səfirlik və viza rüsumları müştərinin adından ödənilir və ƏDV-siz ötürülür.',
  serviceDateIsInvoiceDate: 'Xidmət tarixi hesab-faktura tarixi ilə eynidir.',
  cancelText: (n, d) => `${d} tarixli ${n} nömrəli hesab-fakturanın ləğvi. Ödəniş tələb olunmur.`,
  intro: 'Xidmətlərimiz üçün hesab:',
  receiptNo: 'Qəbz №',
  paymentDate: 'Ödəniş tarixi',
  method: 'Ödəniş üsulu',
  forInvoice: 'Hesab-faktura',
  receivedFrom: 'Ödəyici',
  receiptText: 'Aşağıdakı məbləğin alındığını təsdiq edirik:',
  remaining: 'Hesab-faktura üzrə qalıq',
  page: 'Səhifə',
  category: { SERVICE_FEE: 'Xidmət haqqı', TRANSLATION: 'Tərcümə', APOSTILLE: 'Apostil', EMBASSY_FEE: 'Səfirlik rüsumu (tranzit)', COURIER: 'Kuryer', OTHER: 'Digər' },
  methods: { CASH: 'Nağd', BANK: 'Bank köçürməsi', CARD: 'Kart', OTHER: 'Digər' },
};

const RU_PDF: PdfLabels = {
  ...EN_PDF,
  invoice: 'Счёт',
  cancellation: 'Сторно-счёт',
  receipt: 'Квитанция об оплате',
  invoiceNo: 'Номер счёта',
  invoiceDate: 'Дата счёта',
  serviceDate: 'Дата услуги',
  dueDate: 'Оплатить до',
  vatId: 'Номер НДС',
  taxNo: 'Налоговый номер',
  client: 'Клиент',
  pos: '№',
  description: 'Описание',
  qty: 'Кол-во',
  unitPrice: 'Цена',
  amount: 'Сумма',
  net: 'Сумма без НДС',
  vat: 'НДС',
  passThrough: 'Транзитные сборы (без НДС)',
  total: 'Итого к оплате',
  cancelledTotal: 'Аннулированная сумма',
  paid: 'Уже оплачено',
  open: 'К оплате',
  terms: (due) => `Оплатить без вычетов до ${due}.`,
  reference: 'Назначение платежа',
  bank: 'Банковские реквизиты',
  smallBusiness: 'НДС не начисляется согласно § 19 UStG (малый бизнес).',
  passThroughNote: 'Консульские и визовые сборы оплачиваются от имени клиента и передаются без НДС.',
  serviceDateIsInvoiceDate: 'Дата оказания услуги совпадает с датой счёта.',
  cancelText: (n, d) => `Аннулирование счёта № ${n} от ${d}. Оплата не требуется.`,
  intro: 'За наши услуги выставляем счёт:',
  receiptNo: 'Номер квитанции',
  paymentDate: 'Дата оплаты',
  method: 'Способ оплаты',
  forInvoice: 'По счёту',
  receivedFrom: 'Плательщик',
  receiptText: 'Подтверждаем получение следующей суммы:',
  remaining: 'Остаток по счёту',
  page: 'Стр.',
  category: { SERVICE_FEE: 'Сервисный сбор', TRANSLATION: 'Перевод', APOSTILLE: 'Апостиль', EMBASSY_FEE: 'Консульский сбор (транзит)', COURIER: 'Курьер', OTHER: 'Прочее' },
  methods: { CASH: 'Наличные', BANK: 'Банковский перевод', CARD: 'Карта', OTHER: 'Другое' },
};

/** Second line of the bilingual PDF: the client's language, English for German-speaking clients. */
export const secondaryPdfLabels = (locale: BillingLocale): PdfLabels => (locale === 'az' ? AZ_PDF : locale === 'ru' ? RU_PDF : EN_PDF);
