/**
 * B1 practice test 1 — module structure of the Goethe-Zertifikat B1 (Lesen 5 Teile / 30 items, Hören 4 Teile /
 * 30 items, Schreiben 3 Teile, Sprechen 3 Teile). All texts, scripts and tasks are original (written by Triad
 * Vision); people, companies and news items are invented.
 */
import type { ExamSet } from '../types';

const RF = ['Richtig', 'Falsch'];
const JN = ['Ja', 'Nein'];
const ADS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', '0'];
const WHO = ['Moderatorin', 'Frau Mammadova', 'Herr Brandt'];

export const B1_SET_1: ExamSet = {
  id: 'b1-1',
  level: 'b1',
  title: 'Übungstest 1',
  audioRate: 0.98,
  modules: [
    {
      key: 'lesen',
      minutes: 65,
      parts: [
        {
          id: 'b1-1-l1',
          type: 'choice',
          hint: 'b1l1',
          instruction: 'Lesen Sie den Text und die Aufgaben 1 bis 6. Wählen Sie: Sind die Aussagen Richtig oder Falsch?',
          stimuli: [
            {
              id: 'b1-1-l1-1',
              title: 'Blog: Mein erstes Jahr in Nürnberg',
              text:
                'Hallo zusammen! Heute ist es genau ein Jahr her, dass ich nach Nürnberg gezogen bin. Viele von euch haben gefragt, wie mein Anfang hier war, deshalb erzähle ich heute ein bisschen davon.\n' +
                'Ehrlich gesagt waren die ersten Wochen nicht leicht. In meinem Deutschkurs in Baku hatte ich zwar das B1-Zertifikat gemacht, aber im Alltag haben die Leute viel schneller gesprochen, und den fränkischen Dialekt habe ich am Anfang fast gar nicht verstanden. Meine Kolleginnen in der Pflegeeinrichtung waren aber sehr geduldig. Wenn ich etwas nicht wusste, haben sie es mir gern zweimal erklärt.\n' +
                'Am schwierigsten war für mich die Wohnungssuche. Drei Monate lang habe ich in einem Zimmer bei einer älteren Dame gewohnt, die mir viel über die Stadt erzählt hat. Erst im Frühling habe ich dann meine eigene kleine Wohnung gefunden – nur zehn Minuten mit dem Fahrrad von der Arbeit entfernt.\n' +
                'Was mir hier besonders gefällt, ist die Natur. Am Wochenende fahre ich oft mit Freunden aus meinem Sportverein in die Fränkische Schweiz zum Wandern. Was ich vermisse? Natürlich meine Familie und das Essen meiner Mutter. Zum Glück telefonieren wir fast jeden Abend per Video.\n' +
                'Mein Tipp für alle, die auch nach Deutschland kommen wollen: Lernt so viel Deutsch wie möglich, bevor ihr kommt, und habt keine Angst vor Fehlern. Die meisten Menschen freuen sich, wenn man es versucht!\n' +
                'Eure Aynur',
            },
          ],
          questions: [
            { id: 'b1-1-l1-q1', stimulus: 'b1-1-l1-1', prompt: 'Aynur lebt seit einem Jahr in Nürnberg.', options: RF, answer: 0, evidence: 'Heute ist es genau ein Jahr her, dass ich nach Nürnberg gezogen bin.' },
            { id: 'b1-1-l1-q2', stimulus: 'b1-1-l1-1', prompt: 'Am Anfang hatte Aynur Probleme, den Dialekt zu verstehen.', options: RF, answer: 0, evidence: 'den fränkischen Dialekt habe ich am Anfang fast gar nicht verstanden' },
            { id: 'b1-1-l1-q3', stimulus: 'b1-1-l1-1', prompt: 'Ihre Kolleginnen hatten keine Zeit für ihre Fragen.', options: RF, answer: 1, evidence: 'Wenn ich etwas nicht wusste, haben sie es mir gern zweimal erklärt.' },
            { id: 'b1-1-l1-q4', stimulus: 'b1-1-l1-1', prompt: 'Aynur hat sofort nach ihrer Ankunft eine eigene Wohnung gefunden.', options: RF, answer: 1, evidence: 'Erst im Frühling habe ich dann meine eigene kleine Wohnung gefunden' },
            { id: 'b1-1-l1-q5', stimulus: 'b1-1-l1-1', prompt: 'Am Wochenende fährt Aynur meistens allein in die Natur.', options: RF, answer: 1, evidence: 'fahre ich oft mit Freunden aus meinem Sportverein in die Fränkische Schweiz zum Wandern' },
            { id: 'b1-1-l1-q6', stimulus: 'b1-1-l1-1', prompt: 'Aynur empfiehlt, schon vor der Reise Deutsch zu lernen.', options: RF, answer: 0, evidence: 'Lernt so viel Deutsch wie möglich, bevor ihr kommt' },
          ],
        },
        {
          id: 'b1-1-l2',
          type: 'choice',
          hint: 'b1l2',
          instruction: 'Lesen Sie die Texte und die Aufgaben 7 bis 12. Wählen Sie die richtige Lösung a, b oder c.',
          stimuli: [
            {
              id: 'b1-1-l2-1',
              title: 'Neue Fahrradwege für Leipzig',
              text:
                'Die Stadt Leipzig will in den nächsten drei Jahren rund 40 Kilometer neue Fahrradwege bauen. Das hat der Stadtrat am Dienstag beschlossen. Besonders auf den großen Straßen in der Innenstadt soll es für Radfahrerinnen und Radfahrer sicherer werden. Dafür sollen an einigen Stellen Parkplätze für Autos wegfallen.\n' +
                'Nicht alle sind mit dem Plan zufrieden. Mehrere Geschäfte in der Innenstadt befürchten, dass weniger Kunden kommen, wenn sie nicht mehr direkt vor dem Laden parken können. Die Stadt antwortet darauf mit einer Studie: Danach kommen schon heute mehr als die Hälfte der Kundinnen und Kunden zu Fuß, mit dem Rad oder mit Bus und Bahn in die Innenstadt.\n' +
                'Die ersten Bauarbeiten beginnen im kommenden Frühjahr. Wer seine Meinung zu den Plänen sagen möchte, kann das bis Ende des Monats auf der Internetseite der Stadt tun.',
            },
            {
              id: 'b1-1-l2-2',
              title: 'Ausbildung mit 40? Warum nicht!',
              text:
                'Als Ramin Aliyev mit 41 Jahren seine Ausbildung zum Elektroniker begann, war er der Älteste in seiner Berufsschulklasse. „Am ersten Tag dachten einige, ich bin der Lehrer“, erzählt er und lacht. In Aserbaidschan hatte er viele Jahre als Hausmeister gearbeitet, doch einen deutschen Berufsabschluss hatte er nicht.\n' +
                'Die Entscheidung war nicht einfach: In der Ausbildung verdient er weniger als vorher, und neben der Arbeit muss er für die Prüfungen lernen. Unterstützung bekommt er von seinem Betrieb, der ihm einen zusätzlichen Deutschkurs bezahlt. Auch die jungen Mitschüler helfen gern – zum Beispiel bei Mathematik.\n' +
                'Fachleute sagen, dass immer mehr Erwachsene eine Ausbildung beginnen. Viele Betriebe suchen dringend Fachkräfte und freuen sich über Bewerberinnen und Bewerber mit Lebenserfahrung. Ramin hat noch ein Jahr vor sich. Sein Ziel: „Danach möchte ich mich weiterbilden und vielleicht einmal Meister werden.“',
            },
          ],
          questions: [
            { id: 'b1-1-l2-q1', stimulus: 'b1-1-l2-1', prompt: 'In diesem Text geht es darum, dass …', options: ['Leipzig mehr Parkplätze baut.', 'Leipzig neue Wege für Fahrräder plant.', 'in Leipzig weniger Menschen Fahrrad fahren.'], answer: 1, evidence: 'rund 40 Kilometer neue Fahrradwege bauen' },
            { id: 'b1-1-l2-q2', stimulus: 'b1-1-l2-1', prompt: 'Einige Geschäfte …', options: ['haben Angst, Kunden zu verlieren.', 'wollen selbst Fahrradwege bauen.', 'finden den Plan der Stadt gut.'], answer: 0, evidence: 'befürchten, dass weniger Kunden kommen' },
            { id: 'b1-1-l2-q3', stimulus: 'b1-1-l2-1', prompt: 'Die Bürgerinnen und Bürger …', options: ['müssen für die neuen Wege bezahlen.', 'können ihre Meinung im Internet sagen.', 'haben im Frühjahr über den Plan abgestimmt.'], answer: 1, evidence: 'kann das bis Ende des Monats auf der Internetseite der Stadt tun' },
            { id: 'b1-1-l2-q4', stimulus: 'b1-1-l2-2', prompt: 'Ramin Aliyev …', options: ['ist Lehrer an einer Berufsschule.', 'hat mit über 40 Jahren eine Ausbildung begonnen.', 'hatte schon einen deutschen Berufsabschluss.'], answer: 1, evidence: 'mit 41 Jahren seine Ausbildung zum Elektroniker begann' },
            { id: 'b1-1-l2-q5', stimulus: 'b1-1-l2-2', prompt: 'Sein Betrieb …', options: ['zahlt ihm mehr Geld als früher.', 'hilft ihm bei Mathematik.', 'bezahlt ihm einen Deutschkurs.'], answer: 2, evidence: 'der ihm einen zusätzlichen Deutschkurs bezahlt' },
            { id: 'b1-1-l2-q6', stimulus: 'b1-1-l2-2', prompt: 'Nach der Ausbildung möchte Ramin …', options: ['zurück nach Aserbaidschan gehen.', 'weiter lernen.', 'wieder als Hausmeister arbeiten.'], answer: 1, evidence: 'Danach möchte ich mich weiterbilden' },
          ],
        },
        {
          id: 'b1-1-l3',
          type: 'choice',
          hint: 'b1l3',
          instruction: 'Lesen Sie die Situationen 13 bis 19 und die Anzeigen a bis j. Welche Anzeige passt zu welcher Situation? Sie können jede Anzeige nur einmal verwenden. Für eine Situation gibt es keine passende Anzeige. In diesem Fall wählen Sie 0.',
          shared: true,
          stimuli: [
            { id: 'b1-1-l3-a', title: 'a', text: 'PC-Hilfe Krüger: Wir reparieren Laptops und Computer schnell und günstig. Montag bis Freitag 9–18 Uhr, am Wochenende geschlossen.' },
            { id: 'b1-1-l3-b', title: 'b', text: 'Computer-Notdienst Rhein: Ihr PC streikt? Wir kommen auch samstags und sonntags zu Ihnen nach Hause.' },
            { id: 'b1-1-l3-c', title: 'c', text: 'Bewerbungstraining an der Volkshochschule: Lebenslauf, Anschreiben und Übungen für das Vorstellungsgespräch. Dienstags 18–20 Uhr.' },
            { id: 'b1-1-l3-d', title: 'd', text: 'Sozialkaufhaus „Zweite Chance“: Schränke, Tische, Betten – gebraucht und günstig. Lieferung möglich.' },
            { id: 'b1-1-l3-e', title: 'e', text: 'Möbelhaus Wohntraum: Neue Küchen jetzt 10 % billiger! Nur bis Monatsende.' },
            { id: 'b1-1-l3-f', title: 'f', text: 'Schwimmkurse für Erwachsene im Hallenbad Süd – Anfängerinnen und Anfänger willkommen. Montag und Donnerstag 19:30 Uhr.' },
            { id: 'b1-1-l3-g', title: 'g', text: 'Kinderschwimmen am Samstagvormittag: Seepferdchen-Kurse für Kinder ab 5 Jahren.' },
            { id: 'b1-1-l3-h', title: 'h', text: 'Sprachcafé International: Jeden Mittwochabend Deutsch sprechen bei Kaffee und Kuchen – alle Niveaus, kostenlos.' },
            { id: 'b1-1-l3-i', title: 'i', text: 'Hausaufgabenhilfe im Stadtteilzentrum: Studierende helfen Grundschulkindern, montags bis donnerstags 14–16 Uhr.' },
            { id: 'b1-1-l3-j', title: 'j', text: 'Kochkurs „Italienisch für Anfänger“: Pasta und Pizza selbst gemacht – freitags 18 Uhr.' },
          ],
          questions: [
            { id: 'b1-1-l3-q1', stimulus: 'b1-1-l3-b', prompt: 'Murad möchte seinen Computer am Wochenende reparieren lassen.', options: ADS, answer: 1, evidence: 'Wir kommen auch samstags und sonntags zu Ihnen nach Hause.' },
            { id: 'b1-1-l3-q2', stimulus: 'b1-1-l3-c', prompt: 'Leyla möchte sich auf ein Vorstellungsgespräch vorbereiten.', options: ADS, answer: 2, evidence: 'Übungen für das Vorstellungsgespräch' },
            { id: 'b1-1-l3-q3', stimulus: 'b1-1-l3-d', prompt: 'Familie Hasanov sucht günstige gebrauchte Möbel.', options: ADS, answer: 3, evidence: 'gebraucht und günstig' },
            { id: 'b1-1-l3-q4', stimulus: 'b1-1-l3-f', prompt: 'Sevda (35) möchte abends schwimmen lernen.', options: ADS, answer: 5, evidence: 'Schwimmkurse für Erwachsene im Hallenbad Süd' },
            { id: 'b1-1-l3-q5', stimulus: 'b1-1-l3-h', prompt: 'Tural möchte in seiner Freizeit mit anderen Leuten Deutsch sprechen.', options: ADS, answer: 7, evidence: 'Jeden Mittwochabend Deutsch sprechen bei Kaffee und Kuchen' },
            { id: 'b1-1-l3-q6', stimulus: 'b1-1-l3-i', prompt: 'Nigar sucht für ihren Sohn (8 Jahre) Hilfe bei den Hausaufgaben.', options: ADS, answer: 8, evidence: 'Studierende helfen Grundschulkindern' },
            { id: 'b1-1-l3-q7', stimulus: 'b1-1-l3-j', prompt: 'Elnur möchte lernen, wie man aserbaidschanisch kocht.', options: ADS, answer: 10, evidence: 'Kochkurs „Italienisch für Anfänger“' },
          ],
        },
        {
          id: 'b1-1-l4',
          type: 'choice',
          hint: 'b1l4',
          instruction: 'Lesen Sie die Texte 20 bis 26. Wählen Sie: Ist die Person für ein Handyverbot während der Arbeitszeit? Ja oder Nein?',
          stimuli: [
            { id: 'b1-1-l4-1', title: 'Katrin, Altenpflegerin', text: 'In der Pflege haben wir keine Zeit, aufs Handy zu schauen. Die Bewohnerinnen und Bewohner brauchen unsere volle Aufmerksamkeit. Bei uns bleibt das Handy im Spind – und das finde ich richtig so.' },
            { id: 'b1-1-l4-2', title: 'Farid, Lagerarbeiter', text: 'Meine Kinder sind noch klein. Ich muss erreichbar sein, wenn in der Schule etwas passiert. Ein komplettes Verbot fände ich deshalb unfair.' },
            { id: 'b1-1-l4-3', title: 'Monika, Abteilungsleiterin', text: 'Ich sehe jeden Tag, wie Mitarbeitende ständig ihre Nachrichten lesen. Das kostet viel Zeit und führt zu Fehlern. Eine klare Regel ohne Handy würde allen helfen.' },
            { id: 'b1-1-l4-4', title: 'Jonas, Auszubildender', text: 'Wir benutzen das Handy auch für die Arbeit, zum Beispiel für Fotos von der Baustelle. Verbieten ist keine Lösung – man muss lernen, vernünftig damit umzugehen.' },
            { id: 'b1-1-l4-5', title: 'Gülnar, Busfahrerin', text: 'Am Steuer ist das Handy sowieso tabu, das ist ja Gesetz. Aber in meiner Pause möchte ich meine Familie anrufen dürfen. Wer das verbieten will, übertreibt.' },
            { id: 'b1-1-l4-6', title: 'Peter, Elektriker', text: 'Auf Baustellen ist Konzentration lebenswichtig. Wer abgelenkt ist, gefährdet sich und andere. Deshalb bin ich dafür, dass Handys während der Arbeit ausgeschaltet bleiben.' },
            { id: 'b1-1-l4-7', title: 'Sabine, Bürokauffrau', text: 'Ich denke, jede Firma sollte das selbst entscheiden. In unserem Team klappt es auch ohne Verbot sehr gut, weil alle fair miteinander umgehen.' },
          ],
          questions: [
            { id: 'b1-1-l4-q1', stimulus: 'b1-1-l4-1', prompt: 'Katrin', options: JN, answer: 0, evidence: 'Bei uns bleibt das Handy im Spind – und das finde ich richtig so.' },
            { id: 'b1-1-l4-q2', stimulus: 'b1-1-l4-2', prompt: 'Farid', options: JN, answer: 1, evidence: 'Ein komplettes Verbot fände ich deshalb unfair.' },
            { id: 'b1-1-l4-q3', stimulus: 'b1-1-l4-3', prompt: 'Monika', options: JN, answer: 0, evidence: 'Eine klare Regel ohne Handy würde allen helfen.' },
            { id: 'b1-1-l4-q4', stimulus: 'b1-1-l4-4', prompt: 'Jonas', options: JN, answer: 1, evidence: 'Verbieten ist keine Lösung' },
            { id: 'b1-1-l4-q5', stimulus: 'b1-1-l4-5', prompt: 'Gülnar', options: JN, answer: 1, evidence: 'Wer das verbieten will, übertreibt.' },
            { id: 'b1-1-l4-q6', stimulus: 'b1-1-l4-6', prompt: 'Peter', options: JN, answer: 0, evidence: 'Deshalb bin ich dafür, dass Handys während der Arbeit ausgeschaltet bleiben.' },
            { id: 'b1-1-l4-q7', stimulus: 'b1-1-l4-7', prompt: 'Sabine', options: JN, answer: 1, evidence: 'In unserem Team klappt es auch ohne Verbot sehr gut' },
          ],
        },
        {
          id: 'b1-1-l5',
          type: 'choice',
          hint: 'b1l5',
          instruction: 'Lesen Sie die Aufgaben 27 bis 30 und den Text dazu. Wählen Sie die richtige Lösung a, b oder c. Sie informieren sich über die Teilnahmebedingungen einer Sprachschule.',
          stimuli: [
            {
              id: 'b1-1-l5-1',
              title: 'Sprachschule Wortwechsel – Teilnahmebedingungen',
              text:
                'Anmeldung: Sie können sich online oder persönlich im Sekretariat anmelden. Die Anmeldung ist erst gültig, wenn die Kursgebühr bezahlt ist.\n' +
                'Bezahlung: Bitte überweisen Sie die Kursgebühr spätestens eine Woche vor Kursbeginn. Ratenzahlung ist nach Absprache möglich.\n' +
                'Abmeldung: Bis 14 Tage vor Kursbeginn können Sie kostenlos zurücktreten. Danach berechnen wir 50 % der Kursgebühr. Nach Kursbeginn ist keine Rückzahlung möglich.\n' +
                'Fehlzeiten: Wenn Sie nicht zum Unterricht kommen können, informieren Sie bitte Ihre Lehrkraft per E-Mail. Eine Teilnahmebescheinigung erhalten Sie nur, wenn Sie mindestens 80 % der Unterrichtsstunden besucht haben.\n' +
                'Kursmaterial: Das Lehrbuch ist nicht im Preis enthalten. Sie können es im Sekretariat kaufen.',
            },
          ],
          questions: [
            { id: 'b1-1-l5-q1', stimulus: 'b1-1-l5-1', prompt: 'Die Anmeldung ist gültig, wenn …', options: ['man das Formular unterschrieben hat.', 'man die Kursgebühr bezahlt hat.', 'die Lehrkraft zustimmt.'], answer: 1, evidence: 'Die Anmeldung ist erst gültig, wenn die Kursgebühr bezahlt ist.' },
            { id: 'b1-1-l5-q2', stimulus: 'b1-1-l5-1', prompt: 'Wer zehn Tage vor Kursbeginn absagt, …', options: ['bekommt das ganze Geld zurück.', 'muss die Hälfte der Gebühr bezahlen.', 'muss die ganze Gebühr bezahlen.'], answer: 1, evidence: 'Danach berechnen wir 50 % der Kursgebühr.' },
            { id: 'b1-1-l5-q3', stimulus: 'b1-1-l5-1', prompt: 'Eine Teilnahmebescheinigung bekommt man, …', options: ['wenn man oft genug im Unterricht war.', 'wenn man die Lehrkraft per E-Mail informiert.', 'nach jeder Unterrichtsstunde.'], answer: 0, evidence: 'mindestens 80 % der Unterrichtsstunden besucht haben' },
            { id: 'b1-1-l5-q4', stimulus: 'b1-1-l5-1', prompt: 'Das Lehrbuch …', options: ['bekommt man kostenlos.', 'muss man extra kaufen.', 'kann man in der Bibliothek ausleihen.'], answer: 1, evidence: 'Das Lehrbuch ist nicht im Preis enthalten.' },
          ],
        },
      ],
    },
    {
      key: 'hoeren',
      minutes: 40,
      parts: [
        {
          id: 'b1-1-h1',
          type: 'choice',
          hint: 'b1h1',
          instruction: 'Sie hören fünf kurze Texte. Sie hören jeden Text zweimal. Zu jedem Text lösen Sie zwei Aufgaben. Wählen Sie bei jeder Aufgabe die richtige Lösung.',
          plays: 2,
          stimuli: [
            { id: 'b1-1-h1-1', audio: [{ voice: 'w2', text: 'Und nun das Wetter für morgen: Im Norden bleibt es den ganzen Tag bewölkt, am Nachmittag kann es regnen. Im Süden scheint dagegen meistens die Sonne, bei Temperaturen bis zu vierundzwanzig Grad. Am Wochenende wird es dann überall kühler.' }] },
            { id: 'b1-1-h1-2', audio: [{ voice: 'm1', text: 'Guten Tag, Frau Rzayeva, hier ist die Autowerkstatt Becker. Ihr Auto ist fertig, aber wir mussten noch die Bremsen wechseln. Das kostet hundertachtzig Euro mehr als geplant. Sie können den Wagen heute bis achtzehn Uhr oder morgen ab sieben Uhr abholen. Bitte bringen Sie den Fahrzeugschein mit.' }] },
            { id: 'b1-1-h1-3', audio: [{ voice: 'w1', text: 'Liebe Teilnehmerinnen und Teilnehmer des Integrationskurses: Der Unterricht findet ab nächster Woche nicht mehr in Raum zweihundertvier statt, sondern im Erdgeschoss in Raum null zwölf. Grund sind Bauarbeiten im zweiten Stock. Die Unterrichtszeiten bleiben gleich.' }] },
            { id: 'b1-1-h1-4', audio: [{ voice: 'm2', text: 'Sie suchen einen Job für die Ferien? Dann kommen Sie am Samstag zur Jobbörse im Rathaus! Über fünfzig Firmen aus der Region stellen sich vor. Bringen Sie Ihren Lebenslauf mit – manche Firmen führen direkt vor Ort Gespräche. Der Eintritt ist frei.' }] },
            { id: 'b1-1-h1-5', audio: [{ voice: 'ann', text: 'Information zum ICE fünfhundertsiebenundneunzig nach München, planmäßige Abfahrt vierzehn Uhr zwölf: Dieser Zug fällt heute leider aus. Reisende nach München nutzen bitte den ICE fünfhundertneunundneunzig um vierzehn Uhr sechsundvierzig von Gleis neun. Ihre Fahrkarten bleiben gültig.' }] },
          ],
          questions: [
            { id: 'b1-1-h1-q1', stimulus: 'b1-1-h1-1', prompt: 'Im Süden wird es morgen sonnig.', options: RF, answer: 0, evidence: 'Im Süden scheint dagegen meistens die Sonne' },
            { id: 'b1-1-h1-q2', stimulus: 'b1-1-h1-1', prompt: 'Am Wochenende …', options: ['wird es wärmer.', 'wird es kälter.', 'regnet es nur im Süden.'], answer: 1, evidence: 'Am Wochenende wird es dann überall kühler.' },
            { id: 'b1-1-h1-q3', stimulus: 'b1-1-h1-2', prompt: 'Die Reparatur wird teurer als geplant.', options: RF, answer: 0, evidence: 'Das kostet hundertachtzig Euro mehr als geplant.' },
            { id: 'b1-1-h1-q4', stimulus: 'b1-1-h1-2', prompt: 'Frau Rzayeva soll …', options: ['heute noch anrufen.', 'den Fahrzeugschein mitbringen.', 'morgen bis sieben Uhr kommen.'], answer: 1, evidence: 'Bitte bringen Sie den Fahrzeugschein mit.' },
            { id: 'b1-1-h1-q5', stimulus: 'b1-1-h1-3', prompt: 'Die Unterrichtszeiten ändern sich.', options: RF, answer: 1, evidence: 'Die Unterrichtszeiten bleiben gleich.' },
            { id: 'b1-1-h1-q6', stimulus: 'b1-1-h1-3', prompt: 'Der Kurs findet bald …', options: ['im zweiten Stock statt.', 'im Erdgeschoss statt.', 'in einem anderen Gebäude statt.'], answer: 1, evidence: 'sondern im Erdgeschoss in Raum null zwölf' },
            { id: 'b1-1-h1-q7', stimulus: 'b1-1-h1-4', prompt: 'Für die Jobbörse muss man Eintritt bezahlen.', options: RF, answer: 1, evidence: 'Der Eintritt ist frei.' },
            { id: 'b1-1-h1-q8', stimulus: 'b1-1-h1-4', prompt: 'Was soll man mitbringen?', options: ['Einen Lebenslauf.', 'Ein Foto.', 'Einen Ausweis.'], answer: 0, evidence: 'Bringen Sie Ihren Lebenslauf mit' },
            { id: 'b1-1-h1-q9', stimulus: 'b1-1-h1-5', prompt: 'Der ICE 597 fährt heute nicht.', options: RF, answer: 0, evidence: 'Dieser Zug fällt heute leider aus.' },
            { id: 'b1-1-h1-q10', stimulus: 'b1-1-h1-5', prompt: 'Reisende nach München …', options: ['brauchen eine neue Fahrkarte.', 'fahren von Gleis 9.', 'fahren um 14:12 Uhr.'], answer: 1, evidence: 'um vierzehn Uhr sechsundvierzig von Gleis neun' },
          ],
        },
        {
          id: 'b1-1-h2',
          type: 'choice',
          hint: 'b1h2',
          instruction: 'Sie hören einen Text. Sie hören den Text einmal. Dazu lösen Sie fünf Aufgaben. Wählen Sie die richtige Lösung a, b oder c. Sie nehmen an einer Führung durch einen Logistikbetrieb teil.',
          plays: 1,
          stimuli: [
            {
              id: 'b1-1-h2-1',
              audio: [
                { voice: 'w1', text: 'Herzlich willkommen bei Logistik Nord! Mein Name ist Sabine Krämer, ich bin aus der Personalabteilung und zeige Ihnen heute an Ihrem ersten Tag unser Lager. Unsere Firma gibt es seit neunzehnhundertachtundneunzig, und heute arbeiten hier rund dreihundertfünfzig Menschen aus über zwanzig Ländern.' },
                { voice: 'w1', text: 'Wir beginnen hier im Eingangsbereich. Hier bekommen Sie gleich Ihre Arbeitskleidung und Ihre Sicherheitsschuhe. Die Schuhe müssen Sie im Lager immer tragen, ohne Ausnahme.' },
                { voice: 'w1', text: 'Jetzt gehen wir nach links in die Halle A. Hier kommen die Lastwagen an und werden entladen. Bitte gehen Sie hier nur auf den grün markierten Wegen, denn die Gabelstapler fahren sehr schnell.' },
                { voice: 'w1', text: 'Die Kantine finden Sie im ersten Stock. Das Mittagessen kostet für Mitarbeitende drei Euro fünfzig, Kaffee und Wasser sind kostenlos.' },
                { voice: 'w1', text: 'Noch etwas Wichtiges: Ihre Arbeitszeiten tragen Sie nicht auf Papier ein, sondern mit Ihrer Mitarbeiterkarte am Terminal neben dem Eingang. Wenn Sie krank sind, rufen Sie bitte vor Schichtbeginn Ihren Teamleiter an.' },
                { voice: 'w1', text: 'Zum Schluss: Jeden ersten Freitag im Monat gibt es um fünfzehn Uhr ein Treffen für neue Kolleginnen und Kollegen. Dort können Sie alle Ihre Fragen stellen. So, und jetzt gehen wir weiter zur Halle B.' },
              ],
            },
          ],
          questions: [
            { id: 'b1-1-h2-q1', stimulus: 'b1-1-h2-1', prompt: 'Bei Logistik Nord arbeiten …', options: ['etwa zwanzig Personen.', 'etwa 350 Personen.', 'Menschen aus 350 Ländern.'], answer: 1, evidence: 'heute arbeiten hier rund dreihundertfünfzig Menschen aus über zwanzig Ländern' },
            { id: 'b1-1-h2-q2', stimulus: 'b1-1-h2-1', prompt: 'Die Sicherheitsschuhe …', options: ['muss man nur in Halle A tragen.', 'muss man im Lager immer tragen.', 'bekommt man in der Kantine.'], answer: 1, evidence: 'Die Schuhe müssen Sie im Lager immer tragen, ohne Ausnahme.' },
            { id: 'b1-1-h2-q3', stimulus: 'b1-1-h2-1', prompt: 'In Halle A soll man …', options: ['nur auf den grünen Wegen gehen.', 'mit dem Gabelstapler fahren.', 'die Lastwagen entladen.'], answer: 0, evidence: 'Bitte gehen Sie hier nur auf den grün markierten Wegen' },
            { id: 'b1-1-h2-q4', stimulus: 'b1-1-h2-1', prompt: 'Die Arbeitszeit …', options: ['schreibt man auf ein Formular.', 'registriert man mit einer Karte.', 'sagt man dem Teamleiter.'], answer: 1, evidence: 'mit Ihrer Mitarbeiterkarte am Terminal neben dem Eingang' },
            { id: 'b1-1-h2-q5', stimulus: 'b1-1-h2-1', prompt: 'Das Treffen für neue Mitarbeitende ist …', options: ['jeden Freitag.', 'einmal im Monat.', 'nur am ersten Arbeitstag.'], answer: 1, evidence: 'Jeden ersten Freitag im Monat' },
          ],
        },
        {
          id: 'b1-1-h3',
          type: 'choice',
          hint: 'b1h3',
          instruction: 'Sie hören ein Gespräch. Sie hören das Gespräch einmal. Dazu lösen Sie sieben Aufgaben. Wählen Sie: Sind die Aussagen Richtig oder Falsch? Sie sitzen in der Straßenbahn und hören, wie sich Sona und Emil unterhalten.',
          plays: 1,
          stimuli: [
            {
              id: 'b1-1-h3-1',
              audio: [
                { voice: 'w2', text: 'Hallo Emil! Lange nicht gesehen. Wie geht es dir?' },
                { voice: 'm2', text: 'Hallo Sona! Gut, danke. Ich komme gerade vom Training. Und du? Ich habe gehört, du hast eine neue Stelle?' },
                { voice: 'w2', text: 'Ja, genau! Seit zwei Wochen arbeite ich in einer Zahnarztpraxis am Marktplatz. Vorher war ich ja im Krankenhaus, aber die Nachtschichten waren mir einfach zu anstrengend.' },
                { voice: 'm2', text: 'Und, gefällt es dir?' },
                { voice: 'w2', text: 'Sehr! Das Team ist nett, und ich bin um halb fünf fertig. Nur der Weg ist länger: Ich brauche jetzt fast eine Stunde mit der Straßenbahn.' },
                { voice: 'm2', text: 'Warum ziehst du nicht in die Innenstadt?' },
                { voice: 'w2', text: 'Das wollte ich auch, aber die Mieten dort sind einfach zu hoch. Ich überlege, ob ich mir ein E-Bike kaufe. Damit wäre ich vielleicht sogar schneller.' },
                { voice: 'm2', text: 'Gute Idee! Mein Bruder verkauft übrigens gerade sein E-Bike. Es ist erst ein Jahr alt.' },
                { voice: 'w2', text: 'Wirklich? Was soll es denn kosten?' },
                { voice: 'm2', text: 'Das weiß ich nicht genau. Ich gebe dir seine Nummer, dann kannst du ihn selbst fragen.' },
                { voice: 'w2', text: 'Super, danke! Hast du am Samstag Zeit? Dann könnten wir zusammen hinfahren.' },
                { voice: 'm2', text: 'Samstag geht leider nicht, da besuche ich meine Eltern. Aber am Sonntag passt es.' },
              ],
            },
          ],
          questions: [
            { id: 'b1-1-h3-q1', stimulus: 'b1-1-h3-1', prompt: 'Emil kommt gerade vom Sport.', options: RF, answer: 0, evidence: 'Ich komme gerade vom Training.' },
            { id: 'b1-1-h3-q2', stimulus: 'b1-1-h3-1', prompt: 'Sona arbeitet seit zwei Monaten in der Zahnarztpraxis.', options: RF, answer: 1, evidence: 'Seit zwei Wochen arbeite ich in einer Zahnarztpraxis am Marktplatz.' },
            { id: 'b1-1-h3-q3', stimulus: 'b1-1-h3-1', prompt: 'Im Krankenhaus hat Sona auch nachts gearbeitet.', options: RF, answer: 0, evidence: 'die Nachtschichten waren mir einfach zu anstrengend' },
            { id: 'b1-1-h3-q4', stimulus: 'b1-1-h3-1', prompt: 'Sona hat jetzt einen kürzeren Weg zur Arbeit.', options: RF, answer: 1, evidence: 'Nur der Weg ist länger' },
            { id: 'b1-1-h3-q5', stimulus: 'b1-1-h3-1', prompt: 'Die Wohnungen in der Innenstadt sind Sona zu teuer.', options: RF, answer: 0, evidence: 'die Mieten dort sind einfach zu hoch' },
            { id: 'b1-1-h3-q6', stimulus: 'b1-1-h3-1', prompt: 'Emil weiß, wie viel das E-Bike kostet.', options: RF, answer: 1, evidence: 'Das weiß ich nicht genau.' },
            { id: 'b1-1-h3-q7', stimulus: 'b1-1-h3-1', prompt: 'Emil und Sona wollen am Sonntag zusammen zu Emils Bruder fahren.', options: RF, answer: 0, evidence: 'Aber am Sonntag passt es.' },
          ],
        },
        {
          id: 'b1-1-h4',
          type: 'choice',
          hint: 'b1h4',
          instruction: 'Sie hören eine Diskussion. Sie hören die Diskussion zweimal. Dazu lösen Sie acht Aufgaben. Ordnen Sie die Aussagen zu: Wer sagt was? Die Moderatorin der Radiosendung „Thema am Abend“ diskutiert mit Frau Mammadova, Deutschlehrerin in Baku, und Herrn Brandt, Inhaber eines Handwerksbetriebs in Kassel, über die Frage: Deutsch lernen – vor oder nach dem Umzug nach Deutschland?',
          plays: 2,
          stimuli: [
            {
              id: 'b1-1-h4-1',
              audio: [
                { voice: 'w1', text: 'Herzlich willkommen zu „Thema am Abend“. Heute sprechen wir über die Frage: Sollte man Deutsch schon im Heimatland lernen oder erst in Deutschland? Bei mir sind Frau Mammadova, sie unterrichtet Deutsch in Baku, und Herr Brandt, er leitet einen Handwerksbetrieb in Kassel. Frau Mammadova, wie sehen Sie das?' },
                { voice: 'w2', text: 'Ich bin ganz klar dafür, so früh wie möglich anzufangen. Wer mit guten Grundkenntnissen ankommt, kann sich vom ersten Tag an selbst helfen, zum Beispiel beim Amt oder beim Arzt. Außerdem verlangen viele Visa ja schon ein bestimmtes Sprachniveau.' },
                { voice: 'w1', text: 'Herr Brandt, Sie haben schon mehrere Fachkräfte aus dem Ausland eingestellt. Was ist Ihre Erfahrung?' },
                { voice: 'm1', text: 'Ehrlich gesagt ist mir das Fachliche wichtiger als ein Zertifikat. Ein guter Elektriker lernt die Fachwörter bei uns in der Werkstatt am schnellsten. Im Alltag mit den Kollegen lernt man oft mehr als in jedem Kurs.' },
                { voice: 'w1', text: 'Aber gibt es da nicht auch Probleme, zum Beispiel bei der Sicherheit?' },
                { voice: 'm1', text: 'Doch, das stimmt. Am Anfang muss immer jemand dabei sein, der übersetzt. Das kostet uns Zeit. Deshalb bezahlen wir unseren neuen Mitarbeitern auch einen Abendkurs.' },
                { voice: 'w2', text: 'Genau das meine ich. Die ersten Monate sind sehr anstrengend: neue Arbeit, neue Wohnung, und dann noch abends lernen. Viele schaffen das nicht. Im Heimatland hat man dafür mehr Ruhe.' },
                { voice: 'w1', text: 'Unsere Hörerinnen und Hörer schreiben uns gerade, dass Online-Kurse eine gute Lösung sein könnten. Frau Mammadova?' },
                { voice: 'w2', text: 'Online-Kurse sind praktisch, aber nur zum Teil. Sprechen lernt man am besten mit echten Menschen, in einer Gruppe.' },
                { voice: 'm1', text: 'Da muss ich widersprechen. Einer meiner besten Mitarbeiter hat nur mit einer App und mit Videos gelernt. Es kommt auf die Motivation an, nicht auf die Methode.' },
                { voice: 'w1', text: 'Zum Schluss: Was raten Sie Menschen, die jetzt nach Deutschland gehen möchten?' },
                { voice: 'w2', text: 'Fangen Sie heute an – auch zehn Minuten am Tag helfen.' },
                { voice: 'm1', text: 'Und haben Sie keine Angst, Fragen zu stellen. Die meisten Kollegen helfen gern.' },
                { voice: 'w1', text: 'Vielen Dank Ihnen beiden für das interessante Gespräch.' },
              ],
            },
          ],
          questions: [
            { id: 'b1-1-h4-q1', stimulus: 'b1-1-h4-1', prompt: 'Man sollte möglichst früh mit dem Deutschlernen beginnen.', options: WHO, answer: 1, evidence: 'Ich bin ganz klar dafür, so früh wie möglich anzufangen.' },
            { id: 'b1-1-h4-q2', stimulus: 'b1-1-h4-1', prompt: 'Fachwissen ist wichtiger als ein Sprachzertifikat.', options: WHO, answer: 2, evidence: 'Ehrlich gesagt ist mir das Fachliche wichtiger als ein Zertifikat.' },
            { id: 'b1-1-h4-q3', stimulus: 'b1-1-h4-1', prompt: 'Am Arbeitsplatz lernt man oft mehr als in einem Kurs.', options: WHO, answer: 2, evidence: 'Im Alltag mit den Kollegen lernt man oft mehr als in jedem Kurs.' },
            { id: 'b1-1-h4-q4', stimulus: 'b1-1-h4-1', prompt: 'Neben der neuen Arbeit noch zu lernen, ist für viele zu anstrengend.', options: WHO, answer: 1, evidence: 'Viele schaffen das nicht.' },
            { id: 'b1-1-h4-q5', stimulus: 'b1-1-h4-1', prompt: 'Einige Zuhörer halten Online-Kurse für eine gute Lösung.', options: WHO, answer: 0, evidence: 'Unsere Hörerinnen und Hörer schreiben uns gerade, dass Online-Kurse eine gute Lösung sein könnten.' },
            { id: 'b1-1-h4-q6', stimulus: 'b1-1-h4-1', prompt: 'Sprechen lernt man am besten zusammen mit anderen.', options: WHO, answer: 1, evidence: 'Sprechen lernt man am besten mit echten Menschen, in einer Gruppe.' },
            { id: 'b1-1-h4-q7', stimulus: 'b1-1-h4-1', prompt: 'Die Motivation ist wichtiger als die Lernmethode.', options: WHO, answer: 2, evidence: 'Es kommt auf die Motivation an, nicht auf die Methode.' },
            { id: 'b1-1-h4-q8', stimulus: 'b1-1-h4-1', prompt: 'Man sollte jeden Tag ein bisschen lernen.', options: WHO, answer: 1, evidence: 'auch zehn Minuten am Tag helfen' },
          ],
        },
      ],
    },
    {
      key: 'schreiben',
      minutes: 60,
      parts: [
        {
          id: 'b1-1-s1',
          type: 'writing',
          hint: 'b1s1',
          instruction: 'Schreiben Sie eine E-Mail (circa 80 Wörter). Schreiben Sie etwas zu allen drei Punkten. Achten Sie auf den Textaufbau (Anrede, Einleitung, Reihenfolge der Inhaltspunkte, Schluss). Zeit: circa 20 Minuten.',
          situation: 'Sie sind vor einem Monat in eine neue Wohnung in Deutschland gezogen. Ein Freund / eine Freundin von Ihnen wohnt noch in Ihrer Heimat. Schreiben Sie ihm / ihr eine E-Mail.',
          points: ['Beschreiben Sie: Wie gefällt Ihnen Ihre neue Wohnung?', 'Begründen Sie: Warum haben Sie gerade diese Wohnung genommen?', 'Machen Sie einen Vorschlag für einen Besuch.'],
          words: 80,
          model:
            'Lieber Orkhan,\nwie geht es dir? Ich habe lange nichts von mir hören lassen, weil ich umgezogen bin. Seit einem Monat wohne ich in einer neuen Wohnung in Bremen. Sie hat zwei Zimmer und einen kleinen Balkon, und sie ist sehr hell. Ich habe diese Wohnung genommen, weil sie nicht teuer ist und ich nur fünfzehn Minuten zu Fuß zur Arbeit brauche. Hast du nicht Lust, mich im Sommer zu besuchen? Im Juli habe ich zwei Wochen Urlaub, dann können wir zusammen die Stadt ansehen.\nViele Grüße\nNarmin',
          rubric: [
            { key: 'content', points: 8, param: 'Wie gefällt Ihnen Ihre neue Wohnung?' },
            { key: 'content', points: 8, param: 'Warum haben Sie gerade diese Wohnung genommen?' },
            { key: 'content', points: 8, param: 'Vorschlag für einen Besuch' },
            { key: 'structure', points: 6 },
            { key: 'vocabulary', points: 5 },
            { key: 'grammar', points: 5 },
          ],
        },
        {
          id: 'b1-1-s2',
          type: 'writing',
          hint: 'b1s2',
          instruction: 'Schreiben Sie nun Ihre Meinung (circa 80 Wörter). Zeit: circa 25 Minuten.',
          situation: 'Sie haben im Fernsehen eine Diskussionssendung zum Thema „Homeoffice – arbeiten von zu Hause“ gesehen. Im Online-Gästebuch der Sendung finden Sie folgende Meinung:',
          quote: {
            author: 'Daniel',
            text: 'Im Homeoffice arbeite ich viel konzentrierter, weil mich keine Kollegen stören. Außerdem spare ich jeden Tag eine Stunde Fahrzeit. Für mich sollte Homeoffice für alle ganz normal sein.',
          },
          points: ['Ihre Meinung zum Thema', 'Gründe und Beispiele', 'Reaktion auf Daniels Meinung'],
          words: 80,
          model:
            'Ich verstehe Daniels Meinung, aber ich sehe das ein bisschen anders. Natürlich ist es praktisch, wenn man keine Zeit im Bus oder im Auto verliert. Trotzdem fehlt mir zu Hause der Kontakt zu meinen Kollegen. Im Büro kann man Probleme oft schneller lösen, weil man einfach kurz miteinander spricht. Außerdem ist Homeoffice nicht für alle Berufe möglich: Eine Pflegekraft oder ein Elektriker muss vor Ort arbeiten. Deshalb finde ich eine Mischung am besten, zum Beispiel zwei Tage zu Hause und drei Tage im Büro.',
          rubric: [
            { key: 'opinion', points: 10 },
            { key: 'reasons', points: 10 },
            { key: 'reactComment', points: 5 },
            { key: 'connectors', points: 5 },
            { key: 'vocabulary', points: 5 },
            { key: 'grammar', points: 5 },
          ],
        },
        {
          id: 'b1-1-s3',
          type: 'writing',
          hint: 'b1s3',
          instruction: 'Schreiben Sie eine E-Mail (circa 40 Wörter). Vergessen Sie nicht die Anrede und den Gruß am Schluss. Zeit: circa 15 Minuten.',
          situation: 'Sie haben morgen einen Termin bei Ihrer Sachbearbeiterin, Frau Lorenz, bei der Ausländerbehörde. Sie können aber nicht kommen. Schreiben Sie an Frau Lorenz.',
          points: ['Entschuldigen Sie sich höflich.', 'Berichten Sie, warum Sie nicht kommen können.', 'Bitten Sie um einen neuen Termin.'],
          words: 40,
          model:
            'Sehr geehrte Frau Lorenz,\nleider kann ich morgen nicht zu unserem Termin um 10 Uhr kommen. Das tut mir sehr leid. Mein Sohn ist krank und ich muss mit ihm zum Arzt gehen. Könnten Sie mir bitte einen neuen Termin geben? Nächste Woche habe ich jeden Vormittag Zeit.\nMit freundlichen Grüßen\nFarid Huseynov',
          rubric: [
            { key: 'apology', points: 4 },
            { key: 'reason', points: 4 },
            { key: 'request', points: 4 },
            { key: 'register', points: 4 },
            { key: 'lengthCorrect', points: 4 },
          ],
        },
      ],
    },
    {
      key: 'sprechen',
      minutes: 15,
      prepMinutes: 15,
      parts: [
        {
          id: 'b1-1-sp1',
          type: 'speaking',
          hint: 'b1sp1',
          instruction: 'Gemeinsam etwas planen (circa 3 Minuten). Sprechen Sie über die Punkte unten, machen Sie Vorschläge und reagieren Sie auf die Vorschläge Ihres Gesprächspartners. Planen und entscheiden Sie gemeinsam, was Sie tun möchten.',
          situation: 'Ihre Kollegin Tamara arbeitet seit zehn Jahren in Ihrer Firma und hört bald auf. Sie möchten mit Ihrem Kollegen / Ihrer Kollegin eine kleine Abschiedsfeier organisieren.',
          cards: ['Wann feiern?', 'Wo feiern?', 'Essen und Getränke?', 'Geschenk?', 'Wer macht was?'],
          phrases: [
            'Was hältst du davon, wenn wir am Freitag nach der Arbeit feiern?',
            'Ich schlage vor, dass wir im Pausenraum feiern.',
            'Das ist eine gute Idee, aber …',
            'Ich bin nicht sicher, ob das klappt. Wie wäre es mit …?',
            'Okay, dann machen wir es so: Du kümmerst dich um das Geschenk und ich bestelle das Essen.',
            'Sollen wir alle Kollegen fragen, ob sie etwas Geld für ein Geschenk geben?',
          ],
          examiner: 'Ich finde, wir sollten in einem Restaurant feiern. Was meinst du?',
          rubric: [
            { key: 'suggestions', points: 8 },
            { key: 'reactPartner', points: 8 },
            { key: 'agreement', points: 6 },
            { key: 'fluency', points: 8 },
          ],
        },
        {
          id: 'b1-1-sp2',
          type: 'speaking',
          hint: 'b1sp2',
          instruction: 'Ein Thema präsentieren (circa 3 Minuten). Sie sollen Ihren Zuhörern ein aktuelles Thema präsentieren. Dazu finden Sie hier fünf Folien. Folgen Sie den Anweisungen links und schreiben Sie Ihre Notizen und Ideen rechts daneben.',
          situation: 'Thema: Mit dem Auto oder mit Bus und Bahn zur Arbeit?',
          cards: [
            'Folie 1: Stellen Sie Ihr Thema vor. Erklären Sie den Inhalt und die Struktur Ihrer Präsentation.',
            'Folie 2: Berichten Sie von Ihrer Situation oder einem Erlebnis im Zusammenhang mit dem Thema.',
            'Folie 3: Berichten Sie von der Situation in Ihrem Heimatland und geben Sie Beispiele.',
            'Folie 4: Nennen Sie die Vor- und Nachteile und sagen Sie dazu Ihre Meinung. Geben Sie auch Beispiele.',
            'Folie 5: Beenden Sie Ihre Präsentation und bedanken Sie sich bei den Zuhörern.',
          ],
          phrases: [
            'In meiner Präsentation geht es um die Frage, wie man am besten zur Arbeit kommt.',
            'Zuerst erzähle ich von meiner eigenen Erfahrung, dann …',
            'Ich persönlich fahre jeden Tag mit der Straßenbahn, weil …',
            'In Aserbaidschan fahren viele Menschen mit dem Auto, besonders in Baku …',
            'Ein Vorteil von Bus und Bahn ist, dass … Ein Nachteil ist aber, dass …',
            'Meiner Meinung nach …',
            'Damit bin ich am Ende meiner Präsentation. Vielen Dank für Ihre Aufmerksamkeit. Haben Sie noch Fragen?',
          ],
          rubric: [
            { key: 'slides', points: 15 },
            { key: 'vocabulary', points: 10 },
            { key: 'grammar', points: 10 },
            { key: 'pronunciation', points: 10 },
            { key: 'fluency', points: 5 },
          ],
        },
        {
          id: 'b1-1-sp3',
          type: 'speaking',
          hint: 'b1sp3',
          instruction: 'Über ein Thema sprechen (circa 2 Minuten). Nach Ihrer Präsentation: Reagieren Sie auf die Rückmeldung und Fragen der Prüfer/-innen und des Gesprächspartners. Nach der Präsentation Ihres Partners: Geben Sie eine Rückmeldung und stellen Sie eine Frage.',
          cards: ['Rückmeldung geben', 'Eine Frage stellen', 'Eine Frage beantworten'],
          phrases: [
            'Vielen Dank für deine Präsentation. Besonders interessant fand ich …',
            'Ich habe eine Frage: Wie ist das, wenn …?',
            'Das ist eine gute Frage. Ich denke, …',
            'Da hast du recht, aber man muss auch sehen, dass …',
          ],
          examiner: 'Sie haben gesagt, dass Bus und Bahn günstiger sind. Aber was machen Menschen auf dem Land, wo nur selten ein Bus fährt?',
          rubric: [
            { key: 'feedback', points: 6 },
            { key: 'askQuestion', points: 6 },
            { key: 'answerQuestion', points: 8 },
          ],
        },
      ],
    },
  ],
};
