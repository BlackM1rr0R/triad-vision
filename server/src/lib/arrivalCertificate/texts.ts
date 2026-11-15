/** Texts of the "Welcome to Germany" arrival certificate PDF (az / de / en / ru). */

export const CERT_LOCALES = ['az', 'de', 'en', 'ru'] as const;
export type CertLocale = (typeof CERT_LOCALES)[number];
export const asCertLocale = (v: unknown): CertLocale => ((CERT_LOCALES as readonly unknown[]).includes(v) ? (v as CertLocale) : 'de');

export const DATE_LOCALE: Record<CertLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

export interface CertTexts {
  kicker: string;
  heading: string;
  intro: string;
  arrived: (city: string, date: string) => string;
  arrivedNoCity: (date: string) => string;
  profession: (p: string) => string;
  employer: (e: string) => string;
  date: string;
  number: string;
  verify: string;
  team: string;
  signature: string;
  note: string;
  country: string;
}

export const CERT_TEXTS: Record<CertLocale, CertTexts> = {
  az: {
    kicker: 'Gəliş sertifikatı',
    heading: 'Almaniyaya xoş gəlmisiniz!',
    intro: 'Bu sertifikat təsdiq edir ki,',
    arrived: (city, date) => `${date} tarixində Almaniyaya, ${city} şəhərinə gəlib`,
    arrivedNoCity: (date) => `${date} tarixində Almaniyaya gəlib`,
    profession: (p) => `və «${p}» peşəsində yeni həyat səhifəsinə başlayır`,
    employer: (e) => `İşəgötürən: ${e}`,
    date: 'Gəliş tarixi',
    number: 'Sertifikat nömrəsi',
    verify: 'Yoxlama',
    team: 'Triad Vision komandası',
    signature: 'İmza',
    note: 'Xatirə sertifikatı — rəsmi sənəd deyil. Həqiqiliyini QR kodla yoxlamaq olar.',
    country: 'Almaniya',
  },
  de: {
    kicker: 'Ankunftsurkunde',
    heading: 'Willkommen in Deutschland!',
    intro: 'Hiermit bestätigen wir, dass',
    arrived: (city, date) => `am ${date} in ${city} angekommen ist`,
    arrivedNoCity: (date) => `am ${date} in Deutschland angekommen ist`,
    profession: (p) => `und als ${p} ein neues Kapitel beginnt`,
    employer: (e) => `Arbeitgeber: ${e}`,
    date: 'Ankunftsdatum',
    number: 'Urkundennummer',
    verify: 'Echtheit prüfen',
    team: 'Das Triad Vision Team',
    signature: 'Unterschrift',
    note: 'Erinnerungsurkunde — kein amtliches Dokument. Die Echtheit lässt sich über den QR-Code prüfen.',
    country: 'Deutschland',
  },
  en: {
    kicker: 'Arrival certificate',
    heading: 'Welcome to Germany!',
    intro: 'This is to certify that',
    arrived: (city, date) => `arrived in ${city}, Germany on ${date}`,
    arrivedNoCity: (date) => `arrived in Germany on ${date}`,
    profession: (p) => `to begin a new chapter as ${p}`,
    employer: (e) => `Employer: ${e}`,
    date: 'Arrival date',
    number: 'Certificate number',
    verify: 'Verify',
    team: 'The Triad Vision team',
    signature: 'Signature',
    note: 'A keepsake certificate — not an official document. Its authenticity can be checked with the QR code.',
    country: 'Germany',
  },
  ru: {
    kicker: 'Сертификат о прибытии',
    heading: 'Добро пожаловать в Германию!',
    intro: 'Настоящим подтверждаем, что',
    arrived: (city, date) => `${date} прибыл(а) в Германию, город ${city},`,
    arrivedNoCity: (date) => `${date} прибыл(а) в Германию,`,
    profession: (p) => `чтобы начать новую главу в профессии «${p}»`,
    employer: (e) => `Работодатель: ${e}`,
    date: 'Дата прибытия',
    number: 'Номер сертификата',
    verify: 'Проверка',
    team: 'Команда Triad Vision',
    signature: 'Подпись',
    note: 'Памятный сертификат — не является официальным документом. Подлинность можно проверить по QR-коду.',
    country: 'Германия',
  },
};
