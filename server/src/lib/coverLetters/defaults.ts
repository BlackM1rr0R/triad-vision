import type { CoverJobType } from './fill.js';

/**
 * Built-in Anschreiben templates (German). Used for every job type an admin has not customised
 * (CoverLetterTemplate rows override them; "reset" deletes the row). Factual and modest wording — the
 * staff member or the client edits the result before it is sent.
 */

export interface CoverTemplateText {
  name: string;
  subject: string;
  body: string;
}

const CLOSING = `Ich kann die Stelle {{eintritt}} antreten. Über eine Einladung zu einem Vorstellungsgespräch – gerne auch per Video – freue ich mich sehr.

Mit freundlichen Grüßen

{{name}}`;

const GERMAN = `[[Meine Deutschkenntnisse entsprechen dem Niveau {{deutschniveau}} (GER). ]]Ich lerne weiter Deutsch und bereite mich gezielt auf die Arbeit in Deutschland vor. Die Visums- und Anerkennungsformalitäten begleitet die Agentur Triad Vision.`;

export const DEFAULT_COVER_TEMPLATES: Record<CoverJobType, CoverTemplateText> = {
  GENERAL: {
    name: 'Allgemein',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

mit großem Interesse habe ich Ihre Stellenanzeige für die Position {{position}}[[ in {{ort}}]] gelesen und bewerbe mich hiermit[[ bei {{firma}}]].

[[Ich bin {{beruf}} und verfüge über {{berufserfahrung}} Berufserfahrung. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]]Ich arbeite zuverlässig und sorgfältig, bin teamfähig und lerne schnell dazu.

${GERMAN}

${CLOSING}`,
  },
  FAHRER: {
    name: 'Fahrer / Logistik',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

hiermit bewerbe ich mich[[ bei {{firma}}]] um die Stelle als {{position}}[[ in {{ort}}]].

[[Ich verfüge über {{berufserfahrung}} Berufserfahrung als Fahrer. ]][[Ich besitze die Führerscheinklassen {{fuehrerschein}}. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]]Pünktlichkeit, eine vorausschauende und sichere Fahrweise sowie der sorgfältige Umgang mit Fahrzeug und Ladung sind für mich selbstverständlich.

Die Umschreibung meines Führerscheins und die Berufskraftfahrer-Qualifikation nach deutschem Recht gehe ich zielstrebig an.

${GERMAN}

${CLOSING}`,
  },
  PFLEGE: {
    name: 'Pflege / Gesundheit',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

mit großem Interesse bewerbe ich mich[[ bei {{firma}}]] um die Stelle als {{position}}[[ in {{ort}}]].

[[Ich bin {{beruf}} und verfüge über {{berufserfahrung}} Berufserfahrung in der Pflege. ]][[Meine Ausbildung: {{ausbildung}}. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]]Ein respektvoller, einfühlsamer Umgang mit Patientinnen und Patienten sowie die enge Zusammenarbeit im Team sind mir besonders wichtig.

Die Anerkennung meiner Berufsqualifikation in Deutschland ist eingeleitet bzw. in Vorbereitung; ich bin bereit, fehlende Inhalte nachzuholen.

${GERMAN}

${CLOSING}`,
  },
  HANDWERK: {
    name: 'Handwerk / Technik',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

hiermit bewerbe ich mich[[ bei {{firma}}]] um die Stelle als {{position}}[[ in {{ort}}]].

[[Ich bin {{beruf}} und verfüge über {{berufserfahrung}} praktische Berufserfahrung. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]][[Zu meinen Kenntnissen gehören {{kenntnisse}}. ]]Ich arbeite genau und sauber, halte mich an Arbeitsschutzvorschriften und übernehme gerne Verantwortung.

${GERMAN}

${CLOSING}`,
  },
  GASTRO: {
    name: 'Gastronomie / Hotel',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

mit Freude habe ich Ihre Anzeige für die Stelle als {{position}}[[ in {{ort}}]] gelesen und bewerbe mich hiermit[[ bei {{firma}}]].

[[Ich verfüge über {{berufserfahrung}} Berufserfahrung in der Gastronomie. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]]Gastfreundschaft, Sauberkeit und die Einhaltung der Hygieneregeln sind für mich selbstverständlich. Schicht-, Wochenend- und Feiertagsarbeit sind für mich kein Problem.

${GERMAN}

${CLOSING}`,
  },
  BUERO_IT: {
    name: 'Büro / IT',
    subject: 'Bewerbung als {{position}}',
    body: `Sehr geehrte Damen und Herren,

mit großem Interesse habe ich Ihre Stellenausschreibung für die Position {{position}}[[ in {{ort}}]] gelesen und bewerbe mich hiermit[[ bei {{firma}}]].

[[Ich bin {{beruf}} und verfüge über {{berufserfahrung}} Berufserfahrung. ]][[Zuletzt war ich als {{letzte_taetigkeit}} tätig. ]][[Mein Abschluss: {{ausbildung}}. ]][[Zu meinen Kenntnissen gehören {{kenntnisse}}. ]]Ich arbeite strukturiert und selbstständig und arbeite mich schnell in neue Aufgaben und Systeme ein.

[[Sprachkenntnisse: {{sprachen}}. ]]${GERMAN}

${CLOSING}`,
  },
  AUSBILDUNG: {
    name: 'Ausbildung',
    subject: 'Bewerbung um einen Ausbildungsplatz als {{position}}',
    body: `Sehr geehrte Damen und Herren,

hiermit bewerbe ich mich[[ bei {{firma}}]] um einen Ausbildungsplatz als {{position}}[[ in {{ort}}]].

[[Mein letzter Abschluss: {{ausbildung}}. ]][[Erste praktische Erfahrungen habe ich als {{letzte_taetigkeit}} gesammelt. ]]Der Beruf interessiert mich sehr, weil ich gerne praktisch arbeite und eine fundierte Ausbildung nach deutschem Standard anstrebe. Ich bin motiviert, zuverlässig und lernbereit.

${GERMAN}

Ich kann die Ausbildung {{eintritt}} beginnen. Über eine Einladung zu einem Vorstellungsgespräch – gerne auch per Video – freue ich mich sehr.

Mit freundlichen Grüßen

{{name}}`,
  },
};
