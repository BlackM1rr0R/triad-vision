/**
 * Residence card (eAT) explainer (/residence-card-explained): the fictional SPECIMEN shown on the page and the
 * numbered hotspots on its front and back. Card viewBox CARD_W × CARD_H (ID-1 ratio 85.6 × 54 mm).
 *
 * Layout after the BAMF brochure "Der elektronische Aufenthaltstitel" (Stand 01/2020; card model since 11/2019)
 * and § 78 AufenthG: front — card number top right (repeated small top left), photo, name, sex, nationality, date
 * of birth, type of permit and legal basis, remarks, validity, signature bottom centre, CAN bottom right; back —
 * place of birth, eye colour, height, address, issuing authority and date, note on the Zusatzblatt, MRZ at the
 * bottom. Exact captions and positions on real cards may differ; no security features are reproduced.
 */

export const CARD_W = 856;
export const CARD_H = 540;
export const RESIDENCE_CARD_AS_OF = '2026-11-16';

export type CardSide = 'front' | 'back';

export const PERMITS = {
  '18g': { type: 'BLAUE KARTE EU', basis: '§ 18g Abs. 1 AufenthG', validUntil: '31.12.2029', remarks: ['ERWERBSTÄTIGKEIT ERLAUBT', 'SIEHE ZUSATZBLATT'] },
  '18a': { type: 'AUFENTHALTSERLAUBNIS', basis: '§ 18a AufenthG', validUntil: '31.12.2029', remarks: ['ERWERBSTÄTIGKEIT ERLAUBT', 'SIEHE ZUSATZBLATT'] },
  '18b': { type: 'AUFENTHALTSERLAUBNIS', basis: '§ 18b AufenthG', validUntil: '31.12.2029', remarks: ['ERWERBSTÄTIGKEIT ERLAUBT', 'SIEHE ZUSATZBLATT'] },
  ne: { type: 'NIEDERLASSUNGSERLAUBNIS', basis: '§ 18c AufenthG', validUntil: 'UNBEFRISTET', remarks: ['ERWERBSTÄTIGKEIT ERLAUBT'] },
} as const;
export type PermitKey = keyof typeof PERMITS;
export const PERMIT_KEYS = Object.keys(PERMITS) as PermitKey[];

/** Fictional holder (clearly invented; MRZ check digits are deliberately not computed). */
export const SPECIMEN = {
  cardNumber: 'MUSTER001',
  surname: 'MƏMMƏDOV',
  givenNames: 'ELVIN',
  sex: 'M',
  nationality: 'AZE',
  birthDate: '01.01.1990',
  birthPlace: 'BAKU',
  eyes: 'BRAUN',
  height: '178 cm',
  street: 'MUSTERSTRASSE 1',
  city: '12345 MUSTERSTADT',
  authority: 'AUSLÄNDERBEHÖRDE MUSTERSTADT',
  issued: '02.01.2026',
  can: '123456',
  mrz: ['ARD<<MUSTER0010<<<<<<<<<<<<<<<', '9001010M2912310AZE<<<<<<<<<<<0', 'MAMMADOV<<ELVIN<<<<<<<<<<<<<<<'],
} as const;

export interface CardHotspot {
  id: string;
  side: CardSide;
  x: number;
  y: number;
  glossary: string[];
}

export const CARD_HOTSPOTS: CardHotspot[] = [
  { id: 'cardNumber', side: 'front', x: 770, y: 50, glossary: ['elektronischer-aufenthaltstitel'] },
  { id: 'name', side: 'front', x: 590, y: 128, glossary: ['reisepass'] },
  { id: 'permitType', side: 'front', x: 645, y: 282, glossary: ['blaue-karte-eu', 'aufenthaltserlaubnis', 'niederlassungserlaubnis'] },
  { id: 'legalBasis', side: 'front', x: 590, y: 318, glossary: ['aufenthaltsgesetz'] },
  { id: 'remarks', side: 'front', x: 590, y: 384, glossary: ['nebenbestimmung', 'beschaeftigungserlaubnis'] },
  { id: 'validity', side: 'front', x: 248, y: 462, glossary: ['fiktionsbescheinigung', 'niederlassungserlaubnis'] },
  { id: 'photoSignature', side: 'front', x: 140, y: 240, glossary: [] },
  { id: 'can', side: 'front', x: 826, y: 440, glossary: [] },
  { id: 'chip', side: 'front', x: 735, y: 190, glossary: ['elektronischer-aufenthaltstitel'] },
  { id: 'address', side: 'back', x: 380, y: 200, glossary: ['anmeldung', 'ummeldung', 'buergeramt'] },
  { id: 'authority', side: 'back', x: 400, y: 318, glossary: ['auslaenderbehoerde'] },
  { id: 'zusatzHint', side: 'back', x: 700, y: 80, glossary: ['nebenbestimmung'] },
  { id: 'mrz', side: 'back', x: 826, y: 398, glossary: ['reisepass'] },
];

export const cardHotspotNumber = (id: string) => CARD_HOTSPOTS.findIndex((h) => h.id === id) + 1;

export const RESIDENCE_CARD_SOURCES = [
  { key: 'aufenthg78', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__78.html' },
  { key: 'aufenthg81', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__81.html' },
  { key: 'aufenthg18g', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__18g.html' },
  { key: 'aufenthv44', url: 'https://www.gesetze-im-internet.de/aufenthv/__44.html' },
  { key: 'aufenthv45', url: 'https://www.gesetze-im-internet.de/aufenthv/__45.html' },
  { key: 'aufenthv45c', url: 'https://www.gesetze-im-internet.de/aufenthv/__45c.html' },
  { key: 'aufenthv47', url: 'https://www.gesetze-im-internet.de/aufenthv/__47.html' },
  { key: 'bamf', url: 'https://www.bamf.de/SharedDocs/Anlagen/EN/MigrationAufenthalt/ElektronischerAufenthalt/broschuere-eat-a4-en.html' },
  { key: 'bmi', url: 'https://marl.de/fileadmin/user_upload/Virtuelles_Rathaus/Amt_33/2026_01_09_Broschuere_zum_elektronischen_Aufenthaltstitel.pdf' },
] as const;
