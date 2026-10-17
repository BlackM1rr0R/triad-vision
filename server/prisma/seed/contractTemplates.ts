import type { PrismaClient } from '@prisma/client';

/**
 * Three default German contract templates (Arbeitsvertrag, Ausbildungsvertrag, Dienstleistungsvertrag).
 * Inserted only while the ContractTemplate table is empty, so admin edits and deletions survive a re-seed.
 * Lines starting with "//" are editor notes: they never appear in the preview, the PDF or for signers.
 */

const NOTE = [
  '// VORLAGE — vor jeder Verwendung von einer fachkundigen Person (z. B. Rechtsanwalt/Rechtsanwältin) prüfen und anpassen.',
  '// Diese Vorlage ist keine Rechtsberatung. Tarifverträge, Branchenregeln und aktuelle Gesetzeslage beachten.',
  '// Platzhalter in {{…}} werden aus dem Fall befüllt; fehlende Angaben erscheinen als ________.',
].join('\n');

const ARBEITSVERTRAG = `${NOTE}
# Arbeitsvertrag

Zwischen
{{company.name}}, {{company.address}}
vertreten durch {{company.contactPerson}}
– nachfolgend „Arbeitgeber“ –

und
{{client.fullName}}, geboren am {{client.birthDate}}, Staatsangehörigkeit {{client.nationality}}
Reisepass-Nr. {{client.passportNumber}}, wohnhaft in {{client.address}}
– nachfolgend „Arbeitnehmer/in“ –

wird folgender Arbeitsvertrag geschlossen:

## § 1 Beginn des Arbeitsverhältnisses
Das Arbeitsverhältnis beginnt am {{startDate}}, frühestens jedoch mit der Einreise und dem Vorliegen eines zur Beschäftigung berechtigenden Aufenthaltstitels. Kann die Arbeit zu diesem Zeitpunkt nicht aufgenommen werden, verschiebt sich der Beginn entsprechend.

## § 2 Tätigkeit
Der/Die Arbeitnehmer/in wird als {{case.profession}} ({{vacancy.title}}) eingestellt. Der Arbeitgeber kann ihm/ihr auch andere zumutbare Tätigkeiten übertragen, die den Kenntnissen und Fähigkeiten entsprechen.

## § 3 Arbeitsort
Arbeitsort ist {{vacancy.city}}. Eine vorübergehende Tätigkeit an anderen Orten bleibt vorbehalten, soweit dies zumutbar ist.

## § 4 Arbeitszeit
Die regelmäßige Arbeitszeit beträgt {{workingHours}}. Beginn und Ende der täglichen Arbeitszeit sowie die Pausen richten sich nach den betrieblichen Regelungen und dem Arbeitszeitgesetz.

## § 5 Vergütung
Der/Die Arbeitnehmer/in erhält eine monatliche Bruttovergütung von {{salary}}. Die Vergütung ist jeweils am Ende des Kalendermonats fällig und wird auf ein vom Arbeitnehmer/von der Arbeitnehmerin benanntes Konto überwiesen. Der gesetzliche Mindestlohn wird nicht unterschritten.

## § 6 Probezeit
Die ersten {{probationMonths}} Monate gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis von beiden Seiten mit einer Frist von zwei Wochen gekündigt werden.

## § 7 Urlaub
Der/Die Arbeitnehmer/in hat Anspruch auf ________ Arbeitstage bezahlten Erholungsurlaub pro Kalenderjahr, mindestens jedoch auf den gesetzlichen Mindesturlaub nach dem Bundesurlaubsgesetz.

## § 8 Arbeitsunfähigkeit
Eine Arbeitsunfähigkeit ist dem Arbeitgeber unverzüglich mitzuteilen. Die Entgeltfortzahlung richtet sich nach dem Entgeltfortzahlungsgesetz.

## § 9 Kündigung
Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen (§ 622 BGB). Die Kündigung bedarf der Schriftform.

## § 10 Schlussbestimmungen
Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

Erstellt am {{today}} · Vorgang {{case.number}}
`;

const AUSBILDUNGSVERTRAG = `${NOTE}
// Hinweis: Ausbildungsverträge werden bei der zuständigen Stelle (z. B. IHK/HWK) eingetragen; deren Musterformular hat Vorrang.
# Berufsausbildungsvertrag

Zwischen dem/der Ausbildenden
{{company.name}}, {{company.address}}
vertreten durch {{company.contactPerson}}

und dem/der Auszubildenden
{{client.fullName}}, geboren am {{client.birthDate}}, Staatsangehörigkeit {{client.nationality}}
Reisepass-Nr. {{client.passportNumber}}, wohnhaft in {{client.address}}

wird nach Maßgabe des Berufsbildungsgesetzes (BBiG) folgender Vertrag geschlossen:

## § 1 Ausbildungsberuf
Die Ausbildung erfolgt im Ausbildungsberuf {{case.profession}} nach der dafür geltenden Ausbildungsordnung. Ausbildungsstätte ist {{vacancy.city}}.

## § 2 Dauer der Ausbildung
Die Ausbildungszeit beträgt nach der Ausbildungsordnung ________ Monate. Das Ausbildungsverhältnis beginnt am {{startDate}}, frühestens jedoch mit dem Vorliegen des Aufenthaltstitels zur Berufsausbildung, und endet mit dem Bestehen der Abschlussprüfung, spätestens mit Ablauf der Ausbildungszeit.

## § 3 Probezeit
Die Probezeit beträgt {{probationMonths}} Monate (mindestens einen, höchstens vier Monate, § 20 BBiG).

## § 4 Pflichten des/der Ausbildenden
Der/Die Ausbildende vermittelt die zum Erreichen des Ausbildungsziels erforderlichen Fertigkeiten, Kenntnisse und Fähigkeiten, stellt die Ausbildungsmittel kostenlos zur Verfügung und stellt den/die Auszubildende/n für den Berufsschulunterricht und Prüfungen frei.

## § 5 Pflichten des/der Auszubildenden
Der/Die Auszubildende bemüht sich, die berufliche Handlungsfähigkeit zu erwerben, nimmt am Berufsschulunterricht teil, führt den Ausbildungsnachweis und befolgt die im Rahmen der Ausbildung erteilten Weisungen.

## § 6 Ausbildungsvergütung
Die monatliche Bruttovergütung beträgt:
- im ersten Ausbildungsjahr: {{salary}}
- im zweiten Ausbildungsjahr: ________ €
- im dritten Ausbildungsjahr: ________ €
Die Mindestausbildungsvergütung nach § 17 BBiG wird nicht unterschritten.

## § 7 Ausbildungszeit
Die regelmäßige Ausbildungszeit beträgt {{workingHours}}.

## § 8 Urlaub
Der/Die Auszubildende erhält Urlaub nach den geltenden Bestimmungen, mindestens ________ Werktage je Kalenderjahr.

## § 9 Kündigung
Während der Probezeit kann das Ausbildungsverhältnis jederzeit ohne Einhalten einer Kündigungsfrist gekündigt werden. Danach nur aus wichtigem Grund ohne Einhalten einer Kündigungsfrist oder durch den/die Auszubildende/n mit einer Frist von vier Wochen bei Aufgabe der Ausbildung (§ 22 BBiG). Die Kündigung bedarf der Schriftform.

## § 10 Zeugnis
Bei Beendigung des Ausbildungsverhältnisses wird ein schriftliches Zeugnis ausgestellt.

## § 11 Sonstige Vereinbarungen
Änderungen bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam.

Erstellt am {{today}} · Vorgang {{case.number}}
`;

const DIENSTLEISTUNGSVERTRAG = `${NOTE}
# Dienstleistungsvertrag

Zwischen
{{triad.name}}, {{triad.address}}
– nachfolgend „Triad Vision“ –

und
{{client.fullName}}, geboren am {{client.birthDate}}, wohnhaft in {{client.address}}
Telefon {{client.phone}}, E-Mail {{client.email}}
– nachfolgend „Auftraggeber/in“ –

## § 1 Gegenstand
Triad Vision unterstützt den/die Auftraggeber/in bei der Vorbereitung seines/ihres Visumverfahrens für Deutschland (Visumart: {{case.visaType}}, {{case.visaCategory}}; Vorgang {{case.number}}).

## § 2 Leistungen von Triad Vision
- Beratung zu den Voraussetzungen und dem Ablauf des Verfahrens
- Prüfung und Zusammenstellung der Unterlagen
- Unterstützung bei der Arbeitgeber- bzw. Ausbildungsplatzsuche, soweit vereinbart
- Vorbereitung auf den Termin bei der Auslandsvertretung
Triad Vision schuldet keinen bestimmten Erfolg; über die Erteilung des Visums entscheiden ausschließlich die zuständigen Behörden.

## § 3 Vergütung
Die Vergütung beträgt {{salary}}. Fälligkeit und Zahlungsweise: ________. Gebühren von Behörden, Übersetzern und Dritten sind nicht enthalten.

## § 4 Pflichten des Auftraggebers / der Auftraggeberin
Der/Die Auftraggeber/in stellt vollständige und wahrheitsgemäße Angaben und Unterlagen rechtzeitig zur Verfügung und informiert Triad Vision unverzüglich über Änderungen.

## § 5 Datenschutz
Triad Vision verarbeitet personenbezogene Daten ausschließlich zur Durchführung dieses Vertrages nach der DSGVO. Einzelheiten enthält die Datenschutzerklärung.

## § 6 Laufzeit und Kündigung
Der Vertrag beginnt am {{startDate}} und endet mit Abschluss des Visumverfahrens. Beide Seiten können aus wichtigem Grund kündigen. Bereits erbrachte Leistungen sind zu vergüten.

## § 7 Schlussbestimmungen
Änderungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam.

Erstellt am {{today}} · Betreuung: {{staff.fullName}}
`;

export const DEFAULT_CONTRACT_TEMPLATES = [
  { name: 'Arbeitsvertrag (Vorlage)', kind: 'WORK' as const, language: 'de', body: ARBEITSVERTRAG, isDefault: true, active: true },
  { name: 'Ausbildungsvertrag (Vorlage)', kind: 'AUSBILDUNG' as const, language: 'de', body: AUSBILDUNGSVERTRAG, isDefault: true, active: true },
  { name: 'Dienstleistungsvertrag Triad Vision (Vorlage)', kind: 'SERVICE' as const, language: 'de', body: DIENSTLEISTUNGSVERTRAG, isDefault: true, active: true },
];

export const seedContractTemplates = async (prisma: PrismaClient) => {
  if ((await prisma.contractTemplate.count()) > 0) return 0;
  await prisma.contractTemplate.createMany({ data: DEFAULT_CONTRACT_TEMPLATES });
  return DEFAULT_CONTRACT_TEMPLATES.length;
};
