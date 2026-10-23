/**
 * Quote e-mails for the employer (German, optional English; the document itself is always German)
 * and the internal staff notes (Azerbaijani, like the other staff notifications).
 */
export type QuoteMailLocale = 'de' | 'en';

export const asQuoteLocale = (l: string | null | undefined): QuoteMailLocale => (l === 'en' ? 'en' : 'de');

interface Ctx {
  number: string;
  title: string;
  company: string;
  amount: string;
  validUntil: string;
  salutation: string;
  seller: string;
  name?: string;
  days?: number;
}

interface Msg {
  title: string;
  body: string;
}

interface Catalogue {
  sent: (c: Ctx) => Msg;
  reminder: (c: Ctx) => Msg;
  accepted: (c: Ctx) => Msg;
  cta: string;
  portalCta: string;
}

const de: Catalogue = {
  sent: (c) => ({
    title: `Angebot ${c.number}: ${c.title}`,
    body: `${c.salutation}\n\nanbei erhalten Sie unser Angebot ${c.number} „${c.title}“ über ${c.amount}.\n\nDas Angebot ist gültig bis zum ${c.validUntil}. Über die Schaltfläche unten können Sie es online ansehen und verbindlich annehmen oder ablehnen. Das Angebot als PDF finden Sie im Anhang.\n\nMit freundlichen Grüßen\n${c.seller}`,
  }),
  reminder: (c) => ({
    title: `Erinnerung: Angebot ${c.number} gilt bis ${c.validUntil}`,
    body: `${c.salutation}\n\nwir möchten Sie freundlich daran erinnern, dass unser Angebot ${c.number} „${c.title}“ über ${c.amount} nur noch bis zum ${c.validUntil} gültig ist.\n\nSie können es jederzeit online annehmen oder uns bei Fragen gern kontaktieren.\n\nMit freundlichen Grüßen\n${c.seller}`,
  }),
  accepted: (c) => ({
    title: `Vielen Dank: Angebot ${c.number} angenommen`,
    body: `${c.salutation}\n\nvielen Dank für Ihr Vertrauen. Das Angebot ${c.number} „${c.title}“ über ${c.amount} wurde von ${c.name} verbindlich angenommen. Eine Kopie finden Sie im Anhang.\n\nWir melden uns in Kürze mit den nächsten Schritten.\n\nMit freundlichen Grüßen\n${c.seller}`,
  }),
  cta: 'Angebot ansehen',
  portalCta: 'Angebote ansehen',
};

const en: Catalogue = {
  sent: (c) => ({
    title: `Quotation ${c.number}: ${c.title}`,
    body: `Dear Sir or Madam,\n\nplease find our quotation ${c.number} "${c.title}" for ${c.amount}. The document itself is in German.\n\nThe quotation is valid until ${c.validUntil}. Use the button below to view it online and accept or decline it. The PDF is attached.\n\nKind regards\n${c.seller}`,
  }),
  reminder: (c) => ({
    title: `Reminder: quotation ${c.number} is valid until ${c.validUntil}`,
    body: `Dear Sir or Madam,\n\na friendly reminder that our quotation ${c.number} "${c.title}" for ${c.amount} is valid until ${c.validUntil} only.\n\nYou can accept it online at any time or contact us with any questions.\n\nKind regards\n${c.seller}`,
  }),
  accepted: (c) => ({
    title: `Thank you: quotation ${c.number} accepted`,
    body: `Dear Sir or Madam,\n\nthank you for your trust. Quotation ${c.number} "${c.title}" for ${c.amount} was accepted by ${c.name}. A copy is attached.\n\nWe will be in touch shortly with the next steps.\n\nKind regards\n${c.seller}`,
  }),
  cta: 'View quotation',
  portalCta: 'View quotations',
};

export const quoteTexts: Record<QuoteMailLocale, Catalogue> = { de, en };

interface StaffCtx {
  number: string;
  company: string;
  amount: string;
  name?: string | null;
  reason?: string | null;
  date?: string;
}

/** Internal notes for admins. */
export const staffQuoteTexts = {
  viewed: (c: StaffCtx) => ({ title: `Təklif açıldı: ${c.number}`, body: `${c.company} təklifə (${c.amount}) baxdı.` }),
  accepted: (c: StaffCtx) => ({ title: `Təklif qəbul edildi: ${c.number}`, body: `${c.company} — ${c.amount}. Qəbul edən: ${c.name}. İndi hesab-fakturaya çevirə bilərsiniz.` }),
  declined: (c: StaffCtx) => ({ title: `Təklif rədd edildi: ${c.number}`, body: `${c.company} — ${c.amount}.${c.reason ? ` Səbəb: ${c.reason}` : ''}` }),
  expired: (c: StaffCtx) => ({ title: `Təklifin müddəti bitdi: ${c.number}`, body: `${c.company} — ${c.amount}, etibarlılıq ${c.date} tarixində bitdi.` }),
};
