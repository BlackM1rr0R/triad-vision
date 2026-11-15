/**
 * Illustrated sample forms of the first weeks in Germany (portal › Arrival preparation): a simplified HTML
 * rendition of the official form / letter, filled for a fictional person, every field explained in the client's
 * language (i18n: asample.fields.<slug>.<key>), plus the documents to bring. Labels are the German ones printed
 * on the real forms; they differ a little between cities / banks / health insurers — this is NOT an official form.
 *
 * Sources (as of 2026-11-15): Bundesmeldegesetz §§ 17, 19, 23 (Anmeldung within two weeks, landlord's
 * confirmation, data in the form); Zahlungskontengesetz § 31 (right to a basic account); SGB V § 175 (choosing a
 * Krankenkasse within two weeks of the insurance obligation); BZSt / Berlin service portal (tax ID by letter
 * after the registration).
 */

export type SampleSlug = 'anmeldung' | 'bankkonto' | 'krankenversicherung' | 'steuer-id';
export const SAMPLE_SLUGS: SampleSlug[] = ['anmeldung', 'bankkonto', 'krankenversicherung', 'steuer-id'];
export const isSampleSlug = (s: string): s is SampleSlug => (SAMPLE_SLUGS as string[]).includes(s);

/** The client's data the server sends for the cheat-sheet (lib/account/arrivalPrep: `person`). */
export interface SamplePerson {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  nationality: string | null;
  city: string | null;
  moveInDate: string | null;
}

/** dd.mm.yyyy — the way dates are written on German forms. */
export const deDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

export interface SampleField {
  key: string;
  /** German label as on the form. */
  label: string;
  /** Value for the fictional sample person. */
  sample: string;
  /** The client's own value, when known. */
  mine?: (p: SamplePerson) => string | null;
  wide?: boolean;
}

export interface SampleForm {
  /** German heading of the form / letter. */
  heading: string;
  /** Who issues it (German). */
  issuer: string;
  sections: { label: string; fields: SampleField[] }[];
  /** i18n keys under asample.bring.<slug>.* */
  bring: string[];
  sources: { label: string; url: string }[];
}

export const SAMPLE_NAME = 'Elvin Məmmədov';

const name = {
  last: { key: 'lastName', label: 'Familienname', sample: 'Mammadov', mine: (p: SamplePerson) => p.lastName || null },
  first: { key: 'firstName', label: 'Vorname(n)', sample: 'Elvin', mine: (p: SamplePerson) => p.firstName || null },
  birth: { key: 'birthDate', label: 'Geburtsdatum', sample: '14.03.1994', mine: (p: SamplePerson) => deDate(p.birthDate) },
  birthPlace: { key: 'birthPlace', label: 'Geburtsort', sample: 'Baku (Aserbaidschan)' },
  nationality: { key: 'nationality', label: 'Staatsangehörigkeit(en)', sample: 'aserbaidschanisch', mine: (p: SamplePerson) => p.nationality || null },
  address: { key: 'address', label: 'Anschrift in Deutschland', sample: 'Musterstraße 12, 90402 Nürnberg', mine: (p: SamplePerson) => (p.city ? `…, ${p.city}` : null), wide: true },
} satisfies Record<string, SampleField>;

export const SAMPLE_FORMS: Record<SampleSlug, SampleForm> = {
  anmeldung: {
    heading: 'Anmeldung bei der Meldebehörde',
    issuer: 'Bürgeramt / Einwohnermeldeamt',
    sections: [
      {
        label: 'Neue Wohnung',
        fields: [
          { key: 'moveIn', label: 'Tag des Einzugs', sample: '01.03.2027', mine: (p) => deDate(p.moveInDate) },
          { key: 'newAddress', label: 'PLZ, Gemeinde, Straße, Hausnummer, Zusätze', sample: '90402 Nürnberg, Musterstraße 12, 2. OG links', mine: (p) => (p.city ? `…, ${p.city}` : null), wide: true },
          { key: 'kind', label: 'Die neue Wohnung ist: alleinige Wohnung / Hauptwohnung / Nebenwohnung', sample: '☒ alleinige Wohnung', wide: true },
        ],
      },
      {
        label: 'Bisherige Wohnung',
        fields: [{ key: 'previous', label: 'Bisherige Wohnung (bei Zuzug aus dem Ausland: Staat)', sample: 'Ausland: Aserbaidschan', wide: true }],
      },
      {
        label: 'Angaben zur Person',
        fields: [
          name.last,
          name.first,
          { key: 'sex', label: 'Geschlecht', sample: 'männlich' },
          name.birth,
          name.birthPlace,
          { key: 'marital', label: 'Familienstand', sample: 'ledig' },
          name.nationality,
          { key: 'religion', label: 'Religionsgesellschaft', sample: '—' },
          { key: 'passport', label: 'Pass: Art, Seriennummer, ausstellende Behörde, Datum, gültig bis', sample: 'Reisepass, C01234567, laut Pass, 10.01.2024, 09.01.2034', wide: true },
          { key: 'signature', label: 'Datum, Unterschrift', sample: '03.03.2027, E. Mammadov' },
        ],
      },
    ],
    bring: ['passport', 'landlord', 'contract', 'family'],
    sources: [
      { label: 'BMG § 17 (Anmeldung, 2 Wochen)', url: 'https://www.gesetze-im-internet.de/bmg/__17.html' },
      { label: 'BMG § 19 (Wohnungsgeberbestätigung)', url: 'https://www.gesetze-im-internet.de/bmg/__19.html' },
    ],
  },
  bankkonto: {
    heading: 'Antrag auf Eröffnung eines Girokontos',
    issuer: 'Bank / Sparkasse',
    sections: [
      {
        label: 'Kontoinhaber',
        fields: [name.last, name.first, name.birth, name.birthPlace, name.nationality, name.address, { key: 'contact', label: 'Telefon, E-Mail', sample: '+49 151 …, elvin@…' }],
      },
      {
        label: 'Beruf und Steuern',
        fields: [
          { key: 'job', label: 'Beruf / Arbeitgeber', sample: 'Elektroniker, Muster Elektro GmbH' },
          { key: 'taxId', label: 'Steuerliche Identifikationsnummer', sample: 'wird nachgereicht' },
          { key: 'taxResidence', label: 'Steuerlich ansässig in', sample: 'Deutschland' },
          { key: 'fatca', label: 'US-Steuerpflicht (FATCA)', sample: '☒ nein' },
        ],
      },
      {
        label: 'Konto',
        fields: [
          { key: 'account', label: 'Kontoart', sample: 'Girokonto (ggf. Basiskonto)' },
          { key: 'id', label: 'Legitimation', sample: 'Reisepass + Visum / Aufenthaltstitel', wide: true },
        ],
      },
    ],
    bring: ['passport', 'registration', 'contract', 'phone'],
    sources: [{ label: 'ZKG § 31 (Basiskonto)', url: 'https://www.gesetze-im-internet.de/zkg/__31.html' }],
  },
  krankenversicherung: {
    heading: 'Mitgliedsantrag gesetzliche Krankenversicherung',
    issuer: 'Krankenkasse (z. B. AOK, TK, Barmer …)',
    sections: [
      {
        label: 'Persönliche Angaben',
        fields: [name.last, name.first, name.birth, name.birthPlace, name.nationality, name.address, { key: 'pension', label: 'Rentenversicherungsnummer', sample: 'noch keine' }],
      },
      {
        label: 'Beschäftigung',
        fields: [
          { key: 'employer', label: 'Arbeitgeber (Name, Anschrift)', sample: 'Muster Elektro GmbH, Nürnberg', wide: true },
          { key: 'since', label: 'Beschäftigt seit', sample: '01.03.2027' },
          { key: 'previous', label: 'Bisher versichert bei', sample: 'nicht in Deutschland versichert' },
          { key: 'family', label: 'Familienversicherung für Angehörige', sample: '☐ ja  ☒ nein' },
          { key: 'photo', label: 'Foto für die Gesundheitskarte', sample: 'wird online hochgeladen' },
        ],
      },
    ],
    bring: ['passport', 'contract', 'photo', 'registration'],
    sources: [{ label: 'SGB V § 175 (Wahl der Krankenkasse, 2 Wochen)', url: 'https://www.gesetze-im-internet.de/sgb_5/__175.html' }],
  },
  'steuer-id': {
    heading: 'Mitteilung über Ihre steuerliche Identifikationsnummer',
    issuer: 'Bundeszentralamt für Steuern (BZSt)',
    sections: [
      {
        label: 'Brief des BZSt (Muster)',
        fields: [
          { key: 'idnr', label: 'Identifikationsnummer', sample: '12 345 678 901 (MUSTER)', wide: true },
          name.last,
          name.first,
          name.birth,
          name.birthPlace,
          { key: 'address', label: 'Anschrift (wie bei der Anmeldung)', sample: 'Musterstraße 12, 90402 Nürnberg', mine: (p) => (p.city ? `…, ${p.city}` : null), wide: true },
        ],
      },
    ],
    bring: ['keep', 'employer', 'lost'],
    sources: [
      { label: 'BZSt: Steuerliche Identifikationsnummer', url: 'https://www.bzst.de/DE/Privatpersonen/SteuerlicheIdentifikationsnummer/steuerlicheidentifikationsnummer_node.html' },
      { label: 'Berlin: Steuer-ID Vergabe', url: 'https://service.berlin.de/dienstleistung/329123/' },
    ],
  },
};
