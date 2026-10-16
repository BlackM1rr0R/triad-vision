import type { Locale } from '@prisma/client';

/** Notification texts for translation / apostille orders, in the four portal languages. */

export type TranslationNoticeKind = 'QUOTED' | 'READY' | 'DELIVERED' | 'CANCELLED' | 'NEW' | 'ACCEPTED' | 'ASSIGNED' | 'OVERDUE' | 'CLIENT_CANCELLED';

export interface NoticeParams {
  number: string;
  price?: string;
  due?: string;
  note?: string | null;
  client?: string;
  delivery?: 'DIGITAL' | 'PICKUP' | 'COURIER';
  tracking?: string | null;
}

type Texts = Record<TranslationNoticeKind, (p: NoticeParams) => { title: string; body: string }>;

const line = (label: string, v?: string | null) => (v ? `\n\n${label}: ${v}` : '');

const az: Texts = {
  QUOTED: (p) => ({
    title: `Sifarişiniz üçün qiymət hazırdır (${p.number})`,
    body: `Qiymət: ${p.price}` + (p.due ? `\nHazır olma tarixi: ${p.due}` : '') + line('Qeyd', p.note) + '\n\nKabinetinizdə qiyməti qəbul edin ki, işə başlayaq.',
  }),
  READY: (p) => ({
    title: `Sifarişiniz hazırdır (${p.number})`,
    body:
      (p.delivery === 'DIGITAL' ? 'Hazır sənədləri kabinetinizdən yükləyə bilərsiniz.' : p.delivery === 'PICKUP' ? 'Sənədlərinizi ofisimizdən götürə bilərsiniz.' : 'Sənədləriniz kuryerə təhvil verilməyə hazırdır.') +
      line('Qeyd', p.note),
  }),
  DELIVERED: (p) => ({ title: `Sifariş təhvil verildi (${p.number})`, body: 'Sifarişiniz təhvil verildi. Bizi seçdiyiniz üçün təşəkkür edirik.' + line('İzləmə nömrəsi', p.tracking) + line('Qeyd', p.note) }),
  CANCELLED: (p) => ({ title: `Sifariş ləğv edildi (${p.number})`, body: 'Tərcümə sifarişiniz ləğv edildi.' + line('Səbəb', p.note) }),
  NEW: (p) => ({ title: `Yeni tərcümə sifarişi ${p.number}`, body: `${p.client} yeni sifariş göndərdi. Qiymət təklifi hazırlayın.` }),
  ACCEPTED: (p) => ({ title: `Qiymət qəbul edildi: ${p.number}`, body: `${p.client} qiyməti qəbul etdi. İşə başlamaq olar.` }),
  ASSIGNED: (p) => ({ title: `Sizə tərcümə sifarişi təyin edildi: ${p.number}`, body: `Müştəri: ${p.client}` + line('Son tarix', p.due) }),
  OVERDUE: (p) => ({ title: `Tərcümə sifarişi gecikir: ${p.number}`, body: `Son tarix keçib (${p.due}). Müştəri: ${p.client}` }),
  CLIENT_CANCELLED: (p) => ({ title: `Müştəri sifarişi ləğv etdi: ${p.number}`, body: `${p.client} sifarişi ləğv etdi.` + line('Səbəb', p.note) }),
};

const de: Texts = {
  QUOTED: (p) => ({
    title: `Ihr Angebot ist da (${p.number})`,
    body: `Preis: ${p.price}` + (p.due ? `\nFertig bis: ${p.due}` : '') + line('Hinweis', p.note) + '\n\nBitte nehmen Sie das Angebot in Ihrem Kundenbereich an, damit wir beginnen können.',
  }),
  READY: (p) => ({
    title: `Ihr Auftrag ist fertig (${p.number})`,
    body:
      (p.delivery === 'DIGITAL' ? 'Sie können die fertigen Dokumente in Ihrem Kundenbereich herunterladen.' : p.delivery === 'PICKUP' ? 'Sie können Ihre Dokumente in unserem Büro abholen.' : 'Ihre Dokumente sind bereit für den Kurier.') +
      line('Hinweis', p.note),
  }),
  DELIVERED: (p) => ({ title: `Auftrag zugestellt (${p.number})`, body: 'Ihr Auftrag wurde zugestellt. Vielen Dank für Ihr Vertrauen.' + line('Sendungsnummer', p.tracking) + line('Hinweis', p.note) }),
  CANCELLED: (p) => ({ title: `Auftrag storniert (${p.number})`, body: 'Ihr Übersetzungsauftrag wurde storniert.' + line('Grund', p.note) }),
  NEW: (p) => ({ title: `Neuer Übersetzungsauftrag ${p.number}`, body: `${p.client} hat einen neuen Auftrag gesendet. Bitte ein Angebot erstellen.` }),
  ACCEPTED: (p) => ({ title: `Angebot angenommen: ${p.number}`, body: `${p.client} hat das Angebot angenommen. Die Arbeit kann beginnen.` }),
  ASSIGNED: (p) => ({ title: `Übersetzungsauftrag zugewiesen: ${p.number}`, body: `Kunde: ${p.client}` + line('Frist', p.due) }),
  OVERDUE: (p) => ({ title: `Übersetzungsauftrag überfällig: ${p.number}`, body: `Die Frist ist abgelaufen (${p.due}). Kunde: ${p.client}` }),
  CLIENT_CANCELLED: (p) => ({ title: `Kunde hat storniert: ${p.number}`, body: `${p.client} hat den Auftrag storniert.` + line('Grund', p.note) }),
};

const en: Texts = {
  QUOTED: (p) => ({
    title: `Your quote is ready (${p.number})`,
    body: `Price: ${p.price}` + (p.due ? `\nReady by: ${p.due}` : '') + line('Note', p.note) + '\n\nPlease accept the quote in your account so we can start.',
  }),
  READY: (p) => ({
    title: `Your order is ready (${p.number})`,
    body:
      (p.delivery === 'DIGITAL' ? 'You can download the finished documents in your account.' : p.delivery === 'PICKUP' ? 'You can collect your documents at our office.' : 'Your documents are ready to be handed to the courier.') +
      line('Note', p.note),
  }),
  DELIVERED: (p) => ({ title: `Order delivered (${p.number})`, body: 'Your order has been delivered. Thank you for choosing us.' + line('Tracking number', p.tracking) + line('Note', p.note) }),
  CANCELLED: (p) => ({ title: `Order cancelled (${p.number})`, body: 'Your translation order was cancelled.' + line('Reason', p.note) }),
  NEW: (p) => ({ title: `New translation order ${p.number}`, body: `${p.client} submitted a new order. Please prepare a quote.` }),
  ACCEPTED: (p) => ({ title: `Quote accepted: ${p.number}`, body: `${p.client} accepted the quote. Work can start.` }),
  ASSIGNED: (p) => ({ title: `Translation order assigned to you: ${p.number}`, body: `Client: ${p.client}` + line('Due', p.due) }),
  OVERDUE: (p) => ({ title: `Translation order overdue: ${p.number}`, body: `The due date has passed (${p.due}). Client: ${p.client}` }),
  CLIENT_CANCELLED: (p) => ({ title: `Client cancelled: ${p.number}`, body: `${p.client} cancelled the order.` + line('Reason', p.note) }),
};

const ru: Texts = {
  QUOTED: (p) => ({
    title: `Стоимость вашего заказа готова (${p.number})`,
    body: `Цена: ${p.price}` + (p.due ? `\nСрок готовности: ${p.due}` : '') + line('Примечание', p.note) + '\n\nПримите предложение в личном кабинете, чтобы мы начали работу.',
  }),
  READY: (p) => ({
    title: `Ваш заказ готов (${p.number})`,
    body:
      (p.delivery === 'DIGITAL' ? 'Готовые документы можно скачать в личном кабинете.' : p.delivery === 'PICKUP' ? 'Документы можно забрать в нашем офисе.' : 'Документы готовы к передаче курьеру.') +
      line('Примечание', p.note),
  }),
  DELIVERED: (p) => ({ title: `Заказ доставлен (${p.number})`, body: 'Ваш заказ доставлен. Спасибо, что выбрали нас.' + line('Трек-номер', p.tracking) + line('Примечание', p.note) }),
  CANCELLED: (p) => ({ title: `Заказ отменён (${p.number})`, body: 'Ваш заказ на перевод отменён.' + line('Причина', p.note) }),
  NEW: (p) => ({ title: `Новый заказ на перевод ${p.number}`, body: `${p.client} отправил(а) новый заказ. Подготовьте предложение.` }),
  ACCEPTED: (p) => ({ title: `Предложение принято: ${p.number}`, body: `${p.client} принял(а) предложение. Можно начинать работу.` }),
  ASSIGNED: (p) => ({ title: `Вам назначен заказ на перевод: ${p.number}`, body: `Клиент: ${p.client}` + line('Срок', p.due) }),
  OVERDUE: (p) => ({ title: `Заказ на перевод просрочен: ${p.number}`, body: `Срок истёк (${p.due}). Клиент: ${p.client}` }),
  CLIENT_CANCELLED: (p) => ({ title: `Клиент отменил заказ: ${p.number}`, body: `${p.client} отменил(а) заказ.` + line('Причина', p.note) }),
};

const catalogs: Record<Locale, Texts> = { az, de, en, ru };

export const translationNotice = (kind: TranslationNoticeKind, locale: Locale, p: NoticeParams) => (catalogs[locale] ?? az)[kind](p);

const intlLocale: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export const formatMoney = (cents: number, currency: string, locale: Locale) => {
  try {
    return new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

export const formatDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);
