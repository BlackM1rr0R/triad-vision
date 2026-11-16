import { z } from 'zod';
import { MEASURES, TOM_CATEGORY_DE, type Measure, type TomCategory } from '../trust/measures.js';
import type { SubProcessor } from '../trust/subprocessors.js';

/**
 * Text of the Auftragsverarbeitungsvertrag (Art. 28 DSGVO) between an employer (Verantwortlicher / Auftraggeber)
 * and Triad Vision (Auftragsverarbeiter / Auftragnehmer). Own wording, structured along the mandatory contents of
 * Art. 28 Abs. 3 DSGVO (a–h) and the usual German structure (main part + annexes: subject / data / data subjects,
 * TOMs, sub-processors, deletion). It is a TEMPLATE: the owner must have it reviewed by a lawyer and approve it
 * (Setting avvTemplate) before companies can see it. Placeholders in [eckigen Klammern] mark what the code
 * cannot verify. Output conventions of lib/contracts/pdf.ts: "# " title, "## " heading, "- " bullet.
 */

const t = (max: number) => z.string().trim().max(max);

/** What the company enters in the portal (prefilled from the company profile). */
export const avvCompanySchema = z.object({
  legalName: t(200).min(2),
  street: t(200).min(2),
  postalCode: t(20).min(3),
  city: t(100).min(2),
  country: t(100).default('Deutschland'),
  representative: t(200).min(2),
  privacyContactName: t(160).min(2),
  privacyContactEmail: z.string().trim().toLowerCase().email().max(200),
  dpo: t(300).default(''),
  signatoryName: t(160).min(2),
  signatoryRole: t(120).default(''),
});
export type AvvCompanyData = z.infer<typeof avvCompanySchema>;

export interface AvvProcessor {
  name: string;
  address: string;
  representative: string;
  email: string;
  dpo: string;
}

export interface AvvTemplateInput {
  controller: AvvCompanyData;
  processor: AvvProcessor;
  subprocessors: SubProcessor[];
  measures?: Measure[];
  dataLocation: string;
  backupLocation: string;
  /** Months after the case is closed until uploaded documents are deleted (jobs/retention.ts). */
  retentionMonths: number;
  version: string;
  date: Date;
}

const PH = (what: string) => `[${what} – vom Auftragnehmer zu ergänzen]`;
const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
const or = (v: string, what: string) => (v.trim() ? v.trim() : PH(what));

export const buildAvvText = (i: AvvTemplateInput): string => {
  const c = i.controller;
  const p = i.processor;
  const measures = i.measures ?? MEASURES;
  const controllerLine = `${c.legalName}, ${c.street}, ${c.postalCode} ${c.city}, ${c.country || 'Deutschland'}, vertreten durch ${c.representative}`;
  const processorLine = `${or(p.name, 'Firma')}, ${or(p.address, 'Anschrift')}, vertreten durch ${or(p.representative, 'Vertretungsberechtigte Person')}`;
  const L: string[] = [];
  const h = (s: string) => L.push('', `## ${s}`);
  const para = (s: string) => L.push('', s);
  const bullets = (items: string[]) => {
    L.push('');
    for (const x of items) L.push(`- ${x}`);
  };

  L.push('# Vertrag über die Verarbeitung personenbezogener Daten im Auftrag (Art. 28 DSGVO)');
  para(`Vorlage ${i.version} · Stand ${dmy(i.date)}`);
  para(`zwischen\n${controllerLine}\n– nachfolgend „Auftraggeber“ (Verantwortlicher) –`);
  para(`und\n${processorLine}\n– nachfolgend „Auftragnehmer“ (Auftragsverarbeiter) –`);

  h('§ 1 Gegenstand und Dauer');
  para(
    'Der Auftragnehmer unterstützt den Auftraggeber bei der Gewinnung, Auswahl und Einreise von Arbeitskräften aus Drittstaaten (insbesondere Aserbaidschan) und stellt dafür ein Arbeitgeberportal bereit. Soweit er dabei personenbezogene Daten im Auftrag des Auftraggebers verarbeitet, gilt dieser Vertrag. Gegenstand, Art und Zweck der Verarbeitung, Art der Daten und Kategorien betroffener Personen ergeben sich aus Anlage 1.',
  );
  para('Der Vertrag beginnt mit der Unterzeichnung durch beide Parteien und läuft, solange der Auftragnehmer personenbezogene Daten im Auftrag des Auftraggebers verarbeitet. Er endet ohne Kündigung mit der vollständigen Löschung oder Rückgabe dieser Daten nach § 9. Das Recht zur außerordentlichen Kündigung bleibt unberührt.');
  para('Soweit der Auftragnehmer Daten von Kandidatinnen und Kandidaten für eigene Zwecke verarbeitet (eigene Vermittlungs- und Beratungstätigkeit gegenüber den Kandidaten), ist er insoweit selbst Verantwortlicher; dieser Vertrag gilt dafür nicht.');

  h('§ 2 Weisungen des Auftraggebers');
  para(
    'Der Auftragnehmer verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers – auch in Bezug auf die Übermittlung in ein Drittland –, es sei denn, er ist durch Unionsrecht oder das Recht eines Mitgliedstaats hierzu verpflichtet; in diesem Fall teilt er dem Auftraggeber diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das Recht dies nicht verbietet (Art. 28 Abs. 3 lit. a DSGVO). Weisungen erteilt der Auftraggeber in Textform, insbesondere über das Arbeitgeberportal oder per E-Mail.',
  );
  para('Ist der Auftragnehmer der Ansicht, dass eine Weisung gegen datenschutzrechtliche Vorschriften verstößt, informiert er den Auftraggeber unverzüglich und darf die Ausführung bis zur Bestätigung oder Änderung aussetzen.');

  h('§ 3 Vertraulichkeit');
  para('Der Auftragnehmer setzt nur Personen ein, die zur Vertraulichkeit verpflichtet wurden oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen, und die mit den einschlägigen Datenschutzbestimmungen vertraut gemacht wurden (Art. 28 Abs. 3 lit. b DSGVO). Die Verpflichtung gilt auch nach Beendigung der Tätigkeit fort.');

  h('§ 4 Sicherheit der Verarbeitung');
  para('Der Auftragnehmer trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO, die in Anlage 2 beschrieben sind (Art. 28 Abs. 3 lit. c DSGVO). Er darf sie an den technischen Fortschritt anpassen, sofern das Schutzniveau nicht unterschritten wird; wesentliche Änderungen dokumentiert er und teilt sie dem Auftraggeber auf Anfrage mit.');

  h('§ 5 Unterauftragsverarbeiter');
  para(
    'Der Auftraggeber erteilt die allgemeine schriftliche Genehmigung, weitere Auftragsverarbeiter einzusetzen. Die bei Vertragsschluss eingesetzten Unterauftragsverarbeiter sind in Anlage 3 aufgeführt und gelten als genehmigt. Der Auftragnehmer informiert den Auftraggeber vorab in Textform über jede beabsichtigte Änderung; der Auftraggeber kann innerhalb von 14 Tagen aus wichtigem datenschutzrechtlichem Grund widersprechen (Art. 28 Abs. 2 DSGVO). Der Auftragnehmer erlegt jedem Unterauftragsverarbeiter vertraglich dieselben Datenschutzpflichten auf und haftet gegenüber dem Auftraggeber für deren Einhaltung (Art. 28 Abs. 4 DSGVO).',
  );
  para('Eine Übermittlung in ein Drittland erfolgt nur, wenn die Voraussetzungen der Art. 44 ff. DSGVO erfüllt sind (z. B. Angemessenheitsbeschluss einschließlich EU-US Data Privacy Framework oder Standardvertragsklauseln).');

  h('§ 6 Unterstützung bei Betroffenenrechten');
  para('Der Auftragnehmer unterstützt den Auftraggeber mit geeigneten technischen und organisatorischen Maßnahmen dabei, Anträge betroffener Personen auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch zu beantworten (Art. 28 Abs. 3 lit. e DSGVO). Wendet sich eine betroffene Person direkt an den Auftragnehmer, leitet er das Anliegen unverzüglich an den Auftraggeber weiter, soweit es dessen Verarbeitung betrifft.');

  h('§ 7 Weitere Unterstützungspflichten, Meldung von Verletzungen');
  para('Der Auftragnehmer unterstützt den Auftraggeber unter Berücksichtigung der Art der Verarbeitung und der ihm zur Verfügung stehenden Informationen bei der Einhaltung der Pflichten aus Art. 32 bis 36 DSGVO (Sicherheit, Meldung und Benachrichtigung bei Verletzungen, Datenschutz-Folgenabschätzung, vorherige Konsultation; Art. 28 Abs. 3 lit. f DSGVO).');
  para(`Verletzungen des Schutzes personenbezogener Daten meldet der Auftragnehmer dem Auftraggeber unverzüglich, möglichst innerhalb von 24 Stunden nach Kenntnis, mit den Angaben nach Art. 33 Abs. 3 DSGVO, soweit verfügbar, an: ${c.privacyContactName}, ${c.privacyContactEmail}.`);

  h('§ 8 Nachweise und Kontrollen');
  para('Der Auftragnehmer stellt dem Auftraggeber alle erforderlichen Informationen zum Nachweis der Einhaltung der Pflichten aus Art. 28 DSGVO zur Verfügung und ermöglicht Überprüfungen – einschließlich Inspektionen – durch den Auftraggeber oder einen von diesem beauftragten, zur Verschwiegenheit verpflichteten Prüfer und trägt dazu bei (Art. 28 Abs. 3 lit. h DSGVO). Vor-Ort-Kontrollen sind mit angemessener Frist anzukündigen und während der üblichen Geschäftszeiten durchzuführen, ohne den Betriebsablauf unverhältnismäßig zu stören.');

  h('§ 9 Löschung und Rückgabe');
  para('Nach Abschluss der Erbringung der Verarbeitungsleistungen löscht der Auftragnehmer nach Wahl des Auftraggebers alle personenbezogenen Daten, die er im Auftrag verarbeitet hat, oder gibt sie zurück und löscht vorhandene Kopien, sofern nicht nach Unionsrecht oder dem Recht der Mitgliedstaaten eine Pflicht zur Speicherung besteht (Art. 28 Abs. 3 lit. g DSGVO). Einzelheiten und Fristen enthält Anlage 4.');

  h('§ 10 Haftung, Schlussbestimmungen');
  para('Für die Haftung gilt Art. 82 DSGVO. Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform. Bei Widersprüchen zwischen diesem Vertrag und sonstigen Vereinbarungen der Parteien geht dieser Vertrag in Fragen des Datenschutzes vor. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Es gilt das Recht der Bundesrepublik Deutschland.');

  h('Kontakt für Datenschutzfragen');
  bullets([
    `Auftraggeber: ${c.privacyContactName}, ${c.privacyContactEmail}${c.dpo ? `; Datenschutzbeauftragte/r: ${c.dpo}` : ''}`,
    `Auftragnehmer: ${or(p.email, 'E-Mail')}${p.dpo ? `; Datenschutzbeauftragte/r: ${p.dpo}` : ''}`,
  ]);

  // ── Annex 1 ──
  h('Anlage 1 – Gegenstand, Art und Zweck der Verarbeitung, Daten, betroffene Personen');
  para('Gegenstand und Zweck: Bereitstellung des Arbeitgeberportals; Vorschlag, Vorstellung und Auswahl von Kandidatinnen und Kandidaten; Organisation von Vorstellungsgesprächen; Vorbereitung von Arbeitsverträgen und arbeitgeberseitigen Formularen für das Visumverfahren (z. B. „Erklärung zum Beschäftigungsverhältnis“); Begleitung von Einreise und Arbeitsaufnahme; elektronische Signatur von Dokumenten.');
  para('Art der Verarbeitung: Erheben, Erfassen, Speichern, Ordnen, Anpassen, Abfragen, Verwenden, Offenlegen durch Übermittlung an den Auftraggeber und die zuständigen Stellen auf Weisung, Löschen.');
  para('Kategorien personenbezogener Daten:');
  bullets([
    'Stammdaten der Kandidatinnen und Kandidaten (Name, Geburtsdatum und -ort, Staatsangehörigkeit, Geschlecht, Familienstand)',
    'Kontaktdaten (Anschrift, Telefon, E-Mail)',
    'Ausweis- und Reisepassdaten (Passnummer, Gültigkeit, ausstellende Behörde, Kopien)',
    'Bewerbungsunterlagen: Lebenslauf, Zeugnisse, Abschlüsse, Anerkennungsbescheide, Führerscheine, Sprachzertifikate, Berufserfahrung',
    'Vertragsdaten (Tätigkeit, Arbeitsort, Arbeitszeit, Vergütung, Beginn) und Angaben zum Visumverfahren',
    'Kommunikationsdaten (Nachrichten, Termine von Vorstellungsgesprächen) und Signaturdaten (Name, Zeitpunkt, IP-Adresse)',
    'Daten der Ansprechpersonen des Auftraggebers (Name, Funktion, Kontaktdaten, Nutzungsdaten des Portals)',
  ]);
  para('Besondere Kategorien nach Art. 9 DSGVO werden nur verarbeitet, soweit sie in Unterlagen enthalten sind, die die betroffene Person selbst einreicht (z. B. Gesundheitszeugnis, falls für den Beruf erforderlich).');
  para('Kategorien betroffener Personen: Kandidatinnen und Kandidaten, die dem Auftraggeber vorgestellt oder bei ihm beschäftigt werden; deren mitreisende Familienangehörige, soweit für das Visumverfahren erforderlich; Beschäftigte und Ansprechpersonen des Auftraggebers.');

  // ── Annex 2 ──
  h('Anlage 2 – Technische und organisatorische Maßnahmen (Art. 32 DSGVO)');
  para('Die folgenden Maßnahmen sind im System des Auftragnehmers umgesetzt. Angaben in eckigen Klammern sind vom Auftragnehmer vor der Unterzeichnung zu ergänzen bzw. zu bestätigen.');
  const order: TomCategory[] = ['access', 'authorisation', 'transfer', 'input', 'availability', 'separation', 'encryption'];
  for (const cat of order) {
    const items = measures.filter((m) => m.category === cat).map((m) => m.de);
    if (cat === 'access') items.unshift(`Physische Sicherheit der Server: Rechenzentrum des Hosting-Anbieters (Anlage 3), Standort: ${or(i.dataLocation, 'Standort des Rechenzentrums')}; Maßnahmen gemäß den Nachweisen des Anbieters.`);
    if (cat === 'availability') items.push(`Speicherort der Sicherungen: ${or(i.backupLocation, 'Speicherort der Sicherungen')}.`);
    if (cat === 'encryption') items.push(`Verschlüsselung der Datenträger im Ruhezustand: ${PH('Angabe, ob die Festplattenverschlüsselung des Hosting-Anbieters aktiv ist')}.`);
    if (!items.length) continue;
    para(`${TOM_CATEGORY_DE[cat]}:`);
    bullets(items);
  }
  para('Organisatorisch: Verpflichtung der Mitarbeitenden auf Vertraulichkeit; Zugriff nur, soweit für die Aufgabe erforderlich; regelmäßige Überprüfung der Maßnahmen.');

  // ── Annex 3 ──
  h('Anlage 3 – Unterauftragsverarbeiter');
  para('Bei Vertragsschluss eingesetzt (als „optional“ markierte nur, soweit die jeweilige Funktion genutzt wird):');
  bullets(i.subprocessors.map((s) => `${s.name} – ${s.purposeDe}; ${s.locationDe}${s.optional ? ' (optional)' : ''}`));
  para('E-Mails werden über einen eigenen Mailserver des Auftragnehmers versendet, soweit oben kein externer Versanddienst genannt ist.');

  // ── Annex 4 ──
  h('Anlage 4 – Löschung und Aufbewahrung');
  bullets([
    `Hochgeladene Dokumente einer abgeschlossenen Akte (bewilligt, abgelehnt, storniert) werden automatisiert ${i.retentionMonths} Monate nach Abschluss gelöscht; die Akte selbst und ihr Verlauf bleiben zum Nachweis der Bearbeitung erhalten.`,
    'Nach Beendigung dieses Vertrags löscht der Auftragnehmer die im Auftrag verarbeiteten Daten oder gibt sie auf Verlangen zurück, spätestens innerhalb von 30 Tagen, soweit keine gesetzliche Aufbewahrungspflicht besteht (z. B. handels- und steuerrechtliche Pflichten nach § 257 HGB, § 147 AO für Geschäftsunterlagen).',
    'Datensicherungen werden rollierend überschrieben (Aufbewahrung 14 Tage); gelöschte Daten verschwinden damit spätestens nach Ablauf dieser Frist auch aus den Sicherungen.',
    'Signierte Dokumente und deren Prüfpfad werden so lange aufbewahrt, wie es zum Nachweis der Signatur erforderlich ist.',
  ]);

  h('Unterschriften');
  para(`Für den Auftraggeber: ${c.signatoryName}${c.signatoryRole ? `, ${c.signatoryRole}` : ''}`);
  para(`Für den Auftragnehmer: ${or(p.representative, 'Vertretungsberechtigte Person')}`);
  para('Die Unterzeichnung erfolgt elektronisch; Zeitpunkt und Prüfpfad ergeben sich aus der angehängten Signaturseite.');
  return L.join('\n');
};
