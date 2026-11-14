import type { Locale } from '@prisma/client';

/**
 * Notification texts for the ARCHIVED translation orders (Triad Vision no longer offers translation or apostille;
 * clients cannot order any more, staff only close orders received earlier), in the four portal languages.
 */

export type TranslationNoticeKind = 'READY' | 'DELIVERED' | 'CANCELLED' | 'ASSIGNED' | 'OVERDUE';

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
  READY: (p) => ({
    title: `Sifarişiniz hazırdır (${p.number})`,
    body:
      (p.delivery === 'PICKUP' ? 'Sənədlərinizi ofisimizdən götürə bilərsiniz.' : p.delivery === 'COURIER' ? 'Sənədləriniz kuryerə təhvil verilməyə hazırdır.' : 'Əməkdaşımız hazır sənədləri sizə göndərəcək.') +
      line('Qeyd', p.note),
  }),
  DELIVERED: (p) => ({ title: `Sifariş təhvil verildi (${p.number})`, body: 'Sifarişiniz təhvil verildi.' + line('İzləmə nömrəsi', p.tracking) + line('Qeyd', p.note) }),
  CANCELLED: (p) => ({
    title: `Sifariş ləğv edildi (${p.number})`,
    body: 'Tərcümə sifarişiniz ləğv edildi. Biz tərcümə və apostil xidməti göstərmirik — bunları özünüz etdirirsiniz (məs., ASAN xidmətdə və and içmiş tərcüməçidə).' + line('Səbəb', p.note),
  }),
  ASSIGNED: (p) => ({ title: `Sizə tərcümə sifarişi (arxiv) təyin edildi: ${p.number}`, body: `Müştəri: ${p.client}` + line('Son tarix', p.due) }),
  OVERDUE: (p) => ({ title: `Tərcümə sifarişi (arxiv) gecikir: ${p.number}`, body: `Son tarix keçib (${p.due}). Müştəri: ${p.client}` }),
};

const de: Texts = {
  READY: (p) => ({
    title: `Ihr Auftrag ist fertig (${p.number})`,
    body:
      (p.delivery === 'PICKUP' ? 'Sie können Ihre Dokumente in unserem Büro abholen.' : p.delivery === 'COURIER' ? 'Ihre Dokumente sind bereit für den Kurier.' : 'Unser Team schickt Ihnen die fertigen Dokumente zu.') +
      line('Hinweis', p.note),
  }),
  DELIVERED: (p) => ({ title: `Auftrag zugestellt (${p.number})`, body: 'Ihr Auftrag wurde zugestellt.' + line('Sendungsnummer', p.tracking) + line('Hinweis', p.note) }),
  CANCELLED: (p) => ({
    title: `Auftrag storniert (${p.number})`,
    body: 'Ihr Übersetzungsauftrag wurde storniert. Wir bieten keine Übersetzungen und Apostillen an – Apostille und beglaubigte Übersetzungen lassen Sie selbst anfertigen.' + line('Grund', p.note),
  }),
  ASSIGNED: (p) => ({ title: `Übersetzungsauftrag (Archiv) zugewiesen: ${p.number}`, body: `Kunde: ${p.client}` + line('Frist', p.due) }),
  OVERDUE: (p) => ({ title: `Übersetzungsauftrag (Archiv) überfällig: ${p.number}`, body: `Die Frist ist abgelaufen (${p.due}). Kunde: ${p.client}` }),
};

const en: Texts = {
  READY: (p) => ({
    title: `Your order is ready (${p.number})`,
    body:
      (p.delivery === 'PICKUP' ? 'You can collect your documents at our office.' : p.delivery === 'COURIER' ? 'Your documents are ready to be handed to the courier.' : 'Our team will send you the finished documents.') +
      line('Note', p.note),
  }),
  DELIVERED: (p) => ({ title: `Order delivered (${p.number})`, body: 'Your order has been delivered.' + line('Tracking number', p.tracking) + line('Note', p.note) }),
  CANCELLED: (p) => ({
    title: `Order cancelled (${p.number})`,
    body: 'Your translation order was cancelled. We do not offer translation or apostille services – you have the apostille and sworn translations done yourself.' + line('Reason', p.note),
  }),
  ASSIGNED: (p) => ({ title: `Translation order (archive) assigned to you: ${p.number}`, body: `Client: ${p.client}` + line('Due', p.due) }),
  OVERDUE: (p) => ({ title: `Translation order (archive) overdue: ${p.number}`, body: `The due date has passed (${p.due}). Client: ${p.client}` }),
};

const ru: Texts = {
  READY: (p) => ({
    title: `Ваш заказ готов (${p.number})`,
    body:
      (p.delivery === 'PICKUP' ? 'Документы можно забрать в нашем офисе.' : p.delivery === 'COURIER' ? 'Документы готовы к передаче курьеру.' : 'Наш сотрудник отправит вам готовые документы.') +
      line('Примечание', p.note),
  }),
  DELIVERED: (p) => ({ title: `Заказ доставлен (${p.number})`, body: 'Ваш заказ доставлен.' + line('Трек-номер', p.tracking) + line('Примечание', p.note) }),
  CANCELLED: (p) => ({
    title: `Заказ отменён (${p.number})`,
    body: 'Ваш заказ на перевод отменён. Мы не оказываем услуги перевода и апостиля — апостиль и заверенный перевод вы оформляете самостоятельно.' + line('Причина', p.note),
  }),
  ASSIGNED: (p) => ({ title: `Вам назначен заказ на перевод (архив): ${p.number}`, body: `Клиент: ${p.client}` + line('Срок', p.due) }),
  OVERDUE: (p) => ({ title: `Заказ на перевод (архив) просрочен: ${p.number}`, body: `Срок истёк (${p.due}). Клиент: ${p.client}` }),
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
