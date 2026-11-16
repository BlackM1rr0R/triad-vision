/**
 * Visa refusal explainer (/visa-refusal): the refusal reasons and the German cover letter for a NEW application
 * after a refusal. Plain data + pure functions (unit-tested in letter.test.ts).
 *
 * Status checked 2026-11-16: the Auswärtiges Amt abolished the remonstration procedure worldwide on 1 July 2025
 * (Schengen and national visas). The German Embassy Baku states that remonstrations against refusal notices
 * printed from 01.07.2025 have no legal effect and are not answered. What remains: a new application at any time
 * (new fee, complete documents) or a lawsuit at the Verwaltungsgericht Berlin (usually within one month of
 * notification). That is why this page offers NO remonstration template — only a cover letter for a new
 * application, which is optional and helps the officer see what was corrected.
 */

export const REFUSAL_AS_OF = '2026-11-16';

export const REASONS = ['documents', 'qualification', 'baApproval', 'language', 'financing', 'intention', 'falseInfo'] as const;
export type Reason = (typeof REASONS)[number];

/** German heading of each reason in the letter. */
export const REASON_DE: Record<Reason, string> = {
  documents: 'Unvollständige oder fehlerhafte Unterlagen',
  qualification: 'Zweifel an der Qualifikation bzw. fehlende Anerkennung',
  baApproval: 'Fehlende Zustimmung der Bundesagentur für Arbeit',
  language: 'Nicht ausreichend nachgewiesene Sprachkenntnisse',
  financing: 'Nicht gesicherter Lebensunterhalt / Finanzierung',
  intention: 'Zweifel am Aufenthaltszweck',
  falseInfo: 'Unrichtige oder widersprüchliche Angaben',
};

export const VISA_PURPOSES = ['skilled', 'blueCard', 'experience', 'ausbildung', 'recognition', 'chancenkarte', 'family', 'study'] as const;
export type VisaPurpose = (typeof VISA_PURPOSES)[number];

/** German purpose wording ("… zum Zweck der …"). */
export const PURPOSE_DE: Record<VisaPurpose, string> = {
  skilled: 'der Beschäftigung als Fachkraft (§ 18a / § 18b AufenthG)',
  blueCard: 'der Beschäftigung mit einer Blauen Karte EU (§ 18g AufenthG)',
  experience: 'der Beschäftigung mit ausgeprägter berufspraktischer Erfahrung (§ 19c Abs. 2 AufenthG)',
  ausbildung: 'der Berufsausbildung (§ 16a AufenthG)',
  recognition: 'der Anerkennung meiner Berufsqualifikation (§ 16d AufenthG)',
  chancenkarte: 'der Arbeitsplatzsuche mit der Chancenkarte (§ 20a AufenthG)',
  family: 'des Familiennachzugs',
  study: 'des Studiums (§ 16b AufenthG)',
};

export interface LetterInput {
  name: string;
  birthDate: string;
  passportNo: string;
  address: string;
  contact: string;
  purpose: VisaPurpose;
  previousDate: string;
  refusalDate: string;
  reference: string;
  /** What was corrected, per reason named in the refusal notice (only the reasons with text are used). */
  fixes: Partial<Record<Reason, string>>;
  enclosures: string;
  /** Letter date (ISO yyyy-mm-dd). */
  today: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\s]+/, '').trim())
    .filter(Boolean);

/** "2026-11-16" → "16.11.2026"; anything else is returned trimmed. */
export const deDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso.trim();
};

const blank = (s: string, placeholder: string) => clean(s) || placeholder;

/** The German cover letter as plain text (empty fields become visible blanks to fill in by hand). */
export const buildLetter = (i: LetterInput): string => {
  const gap = '________________';
  const fixes = REASONS.filter((r) => clean(i.fixes[r])).map((r) => `– ${REASON_DE[r]}: ${clean(i.fixes[r])}`);
  const enclosures = lines(i.enclosures);
  const ref = clean(i.reference) ? `, Aktenzeichen ${clean(i.reference)}` : '';
  const out = [
    blank(i.name, gap),
    ...(clean(i.address) ? [clean(i.address)] : []),
    ...(clean(i.contact) ? [clean(i.contact)] : []),
    '',
    'Botschaft der Bundesrepublik Deutschland Baku',
    'Rechts- und Konsularabteilung – Visastelle',
    '',
    `Baku, ${deDate(i.today)}`,
    '',
    `Erneuter Antrag auf ein nationales Visum zum Zweck ${PURPOSE_DE[i.purpose]}`,
    `Früherer Antrag vom ${deDate(blank(i.previousDate, gap))}, Ablehnungsbescheid vom ${deDate(blank(i.refusalDate, gap))}${ref}`,
    `Reisepass-Nr. ${blank(i.passportNo, gap)}, geboren am ${deDate(blank(i.birthDate, gap))}`,
    '',
    'Sehr geehrte Damen und Herren,',
    '',
    `hiermit stelle ich einen neuen Antrag auf Erteilung eines nationalen Visums zum Zweck ${PURPOSE_DE[i.purpose]}. Mein früherer Antrag wurde mit Bescheid vom ${deDate(blank(i.refusalDate, gap))} abgelehnt. Ich habe die im Bescheid genannten Gründe geprüft und meine Unterlagen vervollständigt bzw. korrigiert:`,
    '',
    ...(fixes.length ? fixes : [`– ${gap}`]),
    '',
    'Alle Angaben in meinem Antrag sind vollständig und wahrheitsgemäß. Die geänderten bzw. neuen Unterlagen sind unten aufgeführt. Für Rückfragen stehe ich Ihnen gern zur Verfügung.',
    '',
    'Mit freundlichen Grüßen',
    '',
    '',
    '______________________________',
    blank(i.name, gap),
    '',
    'Anlagen:',
    ...(enclosures.length ? enclosures.map((e) => `– ${e}`) : [`– ${gap}`]),
  ];
  return out.join('\n');
};

/** Escapes text for the print window. */
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
