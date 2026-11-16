/**
 * A1 practice test 1 — module structure of the Goethe-Zertifikat A1: Start Deutsch 1 (Hören 3 Teile / 15 items,
 * Lesen 3 Teile / 15 items, Schreiben 2 Teile, Sprechen 3 Teile). All texts, scripts and tasks are original
 * (written by Triad Vision); names, places and prices are invented.
 */
import type { ExamSet } from '../types';

const RF = ['Richtig', 'Falsch'];

export const A1_SET_1: ExamSet = {
  id: 'a1-1',
  level: 'a1',
  title: 'Übungstest 1',
  audioRate: 0.88,
  modules: [
    {
      key: 'hoeren',
      minutes: 20,
      parts: [
        {
          id: 'a1-1-h1',
          type: 'choice',
          hint: 'a1h1',
          instruction: 'Sie hören sechs kurze Gespräche. Sie hören jeden Text zweimal. Kreuzen Sie an: a, b oder c.',
          plays: 2,
          stimuli: [
            {
              id: 'a1-1-h1-1',
              audio: [
                { voice: 'w1', text: 'Guten Morgen! Ein Vollkornbrot, bitte.' },
                { voice: 'm1', text: 'Gern. Das Roggenbrot kostet heute nur zwei Euro vierzig. Möchten Sie das?' },
                { voice: 'w1', text: 'Nein, danke. Ich nehme das Vollkornbrot.' },
                { voice: 'm1', text: 'Gut. Das macht drei Euro zwanzig.' },
              ],
            },
            {
              id: 'a1-1-h1-2',
              audio: [
                { voice: 'm2', text: 'Hallo, ich möchte mich für den Deutschkurs anmelden. Beginnt der Kurs am Montag?' },
                { voice: 'w2', text: 'Nein, der Kurs beginnt am Dienstag, um achtzehn Uhr.' },
                { voice: 'm2', text: 'Am Dienstag um achtzehn Uhr. Gut, danke.' },
              ],
            },
            {
              id: 'a1-1-h1-3',
              audio: [
                { voice: 'w1', text: 'Entschuldigung, wo ist hier eine Apotheke?' },
                { voice: 'm2', text: 'Gehen Sie geradeaus und dann die zweite Straße links. Die Apotheke ist neben dem Supermarkt.' },
                { voice: 'w1', text: 'Vielen Dank!' },
              ],
            },
            {
              id: 'a1-1-h1-4',
              audio: [
                { voice: 'm1', text: 'Frau Aliyeva, wie ist Ihre Telefonnummer?' },
                { voice: 'w2', text: 'Meine Nummer ist null eins sieben sechs, drei acht, vier fünf, zwei neun.' },
                { voice: 'm1', text: 'Null eins sieben sechs, drei acht, vier fünf, zwei neun. Danke schön.' },
              ],
            },
            {
              id: 'a1-1-h1-5',
              audio: [
                { voice: 'w2', text: 'Was möchten Sie bestellen?' },
                { voice: 'm2', text: 'Ich nehme die Suppe und ein Wasser, bitte.' },
                { voice: 'w2', text: 'Möchten Sie auch einen Salat?' },
                { voice: 'm2', text: 'Nein, danke. Keinen Salat.' },
              ],
            },
            {
              id: 'a1-1-h1-6',
              audio: [
                { voice: 'w1', text: 'Entschuldigung, fährt der Zug nach Hamburg von Gleis drei?' },
                { voice: 'm1', text: 'Nein, heute nicht. Der Zug nach Hamburg fährt heute von Gleis sieben.' },
              ],
            },
          ],
          questions: [
            { id: 'a1-1-h1-q1', stimulus: 'a1-1-h1-1', prompt: 'Wie viel kostet das Vollkornbrot?', options: ['2,40 €', '3,20 €', '4,20 €'], answer: 1, evidence: 'Das macht drei Euro zwanzig.' },
            { id: 'a1-1-h1-q2', stimulus: 'a1-1-h1-2', prompt: 'Wann beginnt der Deutschkurs?', options: ['Am Montag um 18 Uhr.', 'Am Dienstag um 18 Uhr.', 'Am Dienstag um 8 Uhr.'], answer: 1, evidence: 'der Kurs beginnt am Dienstag, um achtzehn Uhr' },
            { id: 'a1-1-h1-q3', stimulus: 'a1-1-h1-3', prompt: 'Wo ist die Apotheke?', options: ['Neben der Bank.', 'Neben dem Supermarkt.', 'Gegenüber vom Bahnhof.'], answer: 1, evidence: 'Die Apotheke ist neben dem Supermarkt.' },
            { id: 'a1-1-h1-q4', stimulus: 'a1-1-h1-4', prompt: 'Welche Telefonnummer hat Frau Aliyeva?', options: ['0176 38 45 29', '0176 83 54 92', '0167 38 45 29'], answer: 0, evidence: 'null eins sieben sechs, drei acht, vier fünf, zwei neun' },
            { id: 'a1-1-h1-q5', stimulus: 'a1-1-h1-5', prompt: 'Was bestellt der Mann?', options: ['Suppe und Wasser.', 'Salat und Wasser.', 'Suppe und Saft.'], answer: 0, evidence: 'Ich nehme die Suppe und ein Wasser, bitte.' },
            { id: 'a1-1-h1-q6', stimulus: 'a1-1-h1-6', prompt: 'Von welchem Gleis fährt der Zug nach Hamburg?', options: ['Gleis 3.', 'Gleis 7.', 'Gleis 17.'], answer: 1, evidence: 'Der Zug nach Hamburg fährt heute von Gleis sieben.' },
          ],
        },
        {
          id: 'a1-1-h2',
          type: 'choice',
          hint: 'a1h2',
          instruction: 'Sie hören vier Durchsagen. Sie hören jeden Text einmal. Kreuzen Sie an: Richtig oder Falsch.',
          plays: 1,
          stimuli: [
            { id: 'a1-1-h2-1', audio: [{ voice: 'ann', text: 'Liebe Kundinnen und Kunden, heute sind alle Jacken im zweiten Stock zwanzig Prozent billiger. Besuchen Sie uns!' }] },
            { id: 'a1-1-h2-2', audio: [{ voice: 'ann', text: 'Achtung am Gleis vier: Der Regionalexpress nach Leipzig hat heute etwa fünfzehn Minuten Verspätung. Wir bitten um Entschuldigung.' }] },
            { id: 'a1-1-h2-3', audio: [{ voice: 'ann', text: 'Frau Nigar Hasanova, gebucht auf den Flug nach Baku, bitte kommen Sie sofort zum Ausgang B zwölf.' }] },
            { id: 'a1-1-h2-4', audio: [{ voice: 'ann', text: 'Liebe Kunden, unser Markt schließt heute schon um achtzehn Uhr. Morgen sind wir wie immer von acht bis einundzwanzig Uhr für Sie da.' }] },
          ],
          questions: [
            { id: 'a1-1-h2-q1', stimulus: 'a1-1-h2-1', prompt: 'Die Jacken sind heute billiger.', options: RF, answer: 0, evidence: 'heute sind alle Jacken im zweiten Stock zwanzig Prozent billiger' },
            { id: 'a1-1-h2-q2', stimulus: 'a1-1-h2-2', prompt: 'Der Zug nach Leipzig kommt pünktlich.', options: RF, answer: 1, evidence: 'hat heute etwa fünfzehn Minuten Verspätung' },
            { id: 'a1-1-h2-q3', stimulus: 'a1-1-h2-3', prompt: 'Frau Hasanova soll zum Ausgang B 12 kommen.', options: RF, answer: 0, evidence: 'bitte kommen Sie sofort zum Ausgang B zwölf' },
            { id: 'a1-1-h2-q4', stimulus: 'a1-1-h2-4', prompt: 'Der Supermarkt ist heute bis 21 Uhr geöffnet.', options: RF, answer: 1, evidence: 'unser Markt schließt heute schon um achtzehn Uhr' },
          ],
        },
        {
          id: 'a1-1-h3',
          type: 'choice',
          hint: 'a1h3',
          instruction: 'Sie hören fünf Nachrichten auf dem Anrufbeantworter. Sie hören jeden Text zweimal. Kreuzen Sie an: a, b oder c.',
          plays: 2,
          stimuli: [
            { id: 'a1-1-h3-1', audio: [{ voice: 'm2', text: 'Hallo Elchin, hier ist Murad. Wir treffen uns heute nicht um sieben, sondern um halb acht vor dem Kino. Bis dann!' }] },
            { id: 'a1-1-h3-2', audio: [{ voice: 'w2', text: 'Guten Tag, hier ist die Praxis Doktor Weber. Ihr Termin am Donnerstag fällt leider aus. Können Sie am Freitag um zehn Uhr kommen? Bitte rufen Sie uns zurück. Danke!' }] },
            { id: 'a1-1-h3-3', audio: [{ voice: 'w1', text: 'Hallo Anna, hier ist Mama. Kannst du bitte nach der Arbeit noch Milch und Eier kaufen? Brot haben wir schon. Danke, bis später!' }] },
            { id: 'a1-1-h3-4', audio: [{ voice: 'm1', text: 'Guten Tag, Herr Mammadov, hier spricht Schneider von der Firma Holzbau. Ihr Arbeitsvertrag ist fertig. Sie können ihn ab Montag in unserem Büro im ersten Stock abholen. Auf Wiederhören!' }] },
            { id: 'a1-1-h3-5', audio: [{ voice: 'w2', text: 'Hallo, hier ist Lena. Ich bin krank und kann morgen nicht zum Deutschkurs kommen. Kannst du mir bitte die Hausaufgaben per E-Mail schicken? Danke!' }] },
          ],
          questions: [
            { id: 'a1-1-h3-q1', stimulus: 'a1-1-h3-1', prompt: 'Wann treffen sich Elchin und Murad?', options: ['Um 7 Uhr.', 'Um 7:30 Uhr.', 'Um 8:30 Uhr.'], answer: 1, evidence: 'nicht um sieben, sondern um halb acht' },
            { id: 'a1-1-h3-q2', stimulus: 'a1-1-h3-2', prompt: 'Was soll die Person tun?', options: ['Am Donnerstag kommen.', 'Die Praxis anrufen.', 'Eine E-Mail schreiben.'], answer: 1, evidence: 'Bitte rufen Sie uns zurück.' },
            { id: 'a1-1-h3-q3', stimulus: 'a1-1-h3-3', prompt: 'Was soll Anna kaufen?', options: ['Brot und Milch.', 'Milch und Eier.', 'Eier und Brot.'], answer: 1, evidence: 'Kannst du bitte nach der Arbeit noch Milch und Eier kaufen?' },
            { id: 'a1-1-h3-q4', stimulus: 'a1-1-h3-4', prompt: 'Wo kann Herr Mammadov den Vertrag abholen?', options: ['Im Erdgeschoss.', 'Im ersten Stock.', 'Im zweiten Stock.'], answer: 1, evidence: 'in unserem Büro im ersten Stock abholen' },
            { id: 'a1-1-h3-q5', stimulus: 'a1-1-h3-5', prompt: 'Was möchte Lena?', options: ['Die Hausaufgaben.', 'Ein Buch.', 'Eine Telefonnummer.'], answer: 0, evidence: 'Kannst du mir bitte die Hausaufgaben per E-Mail schicken?' },
          ],
        },
      ],
    },
    {
      key: 'lesen',
      minutes: 25,
      parts: [
        {
          id: 'a1-1-l1',
          type: 'choice',
          hint: 'a1l1',
          instruction: 'Lesen Sie die zwei Texte und die Aufgaben 1 bis 5. Kreuzen Sie an: Richtig oder Falsch.',
          stimuli: [
            {
              id: 'a1-1-l1-1',
              title: 'E-Mail',
              text: 'Liebe Sara,\nich bin jetzt seit zwei Wochen in Köln. Meine Wohnung ist klein, aber sehr hell. Ich arbeite in einem Krankenhaus, von Montag bis Freitag. Am Wochenende habe ich frei. Kommst du mich im Mai besuchen? Ich habe ein Sofa für dich!\nViele Grüße\nLeyla',
            },
            {
              id: 'a1-1-l1-2',
              title: 'Notiz',
              text: 'Hallo Tural,\nich bin beim Sport und komme um 20 Uhr nach Hause. Das Essen ist im Kühlschrank. Bitte ruf deinen Bruder an, er hat heute Geburtstag!\nKerstin',
            },
          ],
          questions: [
            { id: 'a1-1-l1-q1', stimulus: 'a1-1-l1-1', prompt: 'Leyla wohnt seit zwei Monaten in Köln.', options: RF, answer: 1, evidence: 'ich bin jetzt seit zwei Wochen in Köln' },
            { id: 'a1-1-l1-q2', stimulus: 'a1-1-l1-1', prompt: 'Leylas Wohnung ist hell.', options: RF, answer: 0, evidence: 'Meine Wohnung ist klein, aber sehr hell.' },
            { id: 'a1-1-l1-q3', stimulus: 'a1-1-l1-1', prompt: 'Leyla arbeitet auch am Samstag.', options: RF, answer: 1, evidence: 'Am Wochenende habe ich frei.' },
            { id: 'a1-1-l1-q4', stimulus: 'a1-1-l1-2', prompt: 'Das Essen ist im Kühlschrank.', options: RF, answer: 0, evidence: 'Das Essen ist im Kühlschrank.' },
            { id: 'a1-1-l1-q5', stimulus: 'a1-1-l1-2', prompt: 'Tural soll Kerstin anrufen.', options: RF, answer: 1, evidence: 'Bitte ruf deinen Bruder an' },
          ],
        },
        {
          id: 'a1-1-l2',
          type: 'choice',
          hint: 'a1l2',
          instruction: 'Lesen Sie die Texte und die Aufgaben 6 bis 10. Wo finden Sie Informationen? Kreuzen Sie an: a oder b.',
          stimuli: [
            { id: 'a1-1-l2-1', text: 'Sie möchten am Sonntag frisches Brot kaufen.' },
            { id: 'a1-1-l2-2', text: 'Sie arbeiten bis 17 Uhr und suchen einen Deutschkurs am Abend.' },
            { id: 'a1-1-l2-3', text: 'Sie möchten eine Wohnung mit Balkon mieten.' },
            { id: 'a1-1-l2-4', text: 'Sie möchten billig von Berlin nach München fahren.' },
            { id: 'a1-1-l2-5', text: 'Ihr Kind ist am Samstag krank. Sie brauchen einen Arzt.' },
          ],
          questions: [
            { id: 'a1-1-l2-q1', stimulus: 'a1-1-l2-1', prompt: 'Wo finden Sie Informationen?', options: ['Bäckerei Krause – Mo bis Sa 6 bis 18 Uhr, Sonntag geschlossen', 'Bahnhofsbäckerei – täglich 5 bis 22 Uhr, auch an Sonn- und Feiertagen'], answer: 1, evidence: 'täglich 5 bis 22 Uhr, auch an Sonn- und Feiertagen' },
            { id: 'a1-1-l2-q2', stimulus: 'a1-1-l2-2', prompt: 'Wo finden Sie Informationen?', options: ['Volkshochschule: Deutsch A1, Montag und Mittwoch 18:30 bis 21:00 Uhr', 'Sprachschule Lingua: Deutsch A1, Montag bis Freitag 9:00 bis 12:15 Uhr'], answer: 0, evidence: 'Montag und Mittwoch 18:30 bis 21:00 Uhr' },
            { id: 'a1-1-l2-q3', stimulus: 'a1-1-l2-3', prompt: 'Wo finden Sie Informationen?', options: ['2-Zimmer-Wohnung, 55 m², großer Balkon, 650 € warm, frei ab 1. März', 'Zimmer in WG, 18 m², 390 € warm, ohne Balkon, frei ab sofort'], answer: 0, evidence: '2-Zimmer-Wohnung, 55 m², großer Balkon' },
            { id: 'a1-1-l2-q4', stimulus: 'a1-1-l2-4', prompt: 'Wo finden Sie Informationen?', options: ['ICE Berlin – München: Tickets ab 89,90 €', 'Fernbus Berlin – München: Tickets ab 24,99 €'], answer: 1, evidence: 'Fernbus Berlin – München: Tickets ab 24,99 €' },
            { id: 'a1-1-l2-q5', stimulus: 'a1-1-l2-5', prompt: 'Wo finden Sie Informationen?', options: ['Kinderarztpraxis Dr. Lang: Montag bis Freitag 8 bis 12 Uhr', 'Ärztlicher Bereitschaftsdienst: am Wochenende und nachts, Telefon 116 117'], answer: 1, evidence: 'am Wochenende und nachts, Telefon 116 117' },
          ],
        },
        {
          id: 'a1-1-l3',
          type: 'choice',
          hint: 'a1l3',
          instruction: 'Lesen Sie die Texte und die Aufgaben 11 bis 15. Kreuzen Sie an: Richtig oder Falsch.',
          stimuli: [
            { id: 'a1-1-l3-1', title: 'An der Tür eines Geschäfts', text: 'Wegen Urlaub vom 3. bis 17. August geschlossen. Ab 18. August sind wir wieder für Sie da!' },
            { id: 'a1-1-l3-2', title: 'Im Bürgeramt', text: 'Anmeldung: Bitte ziehen Sie eine Nummer und warten Sie im Wartebereich. Wir rufen Ihre Nummer auf.' },
            { id: 'a1-1-l3-3', title: 'Im Schwimmbad', text: 'Kinder unter 6 Jahren nur mit Erwachsenen!' },
            { id: 'a1-1-l3-4', title: 'In der Arztpraxis', text: 'Liebe Patientinnen und Patienten, bitte bringen Sie bei jedem Besuch Ihre Versichertenkarte mit.' },
            { id: 'a1-1-l3-5', title: 'Im Wohnhaus', text: 'Der Aufzug ist kaputt. Bitte benutzen Sie die Treppe. Die Reparatur ist am Freitag.' },
          ],
          questions: [
            { id: 'a1-1-l3-q1', stimulus: 'a1-1-l3-1', prompt: 'Das Geschäft ist am 10. August geöffnet.', options: RF, answer: 1, evidence: 'Wegen Urlaub vom 3. bis 17. August geschlossen.' },
            { id: 'a1-1-l3-q2', stimulus: 'a1-1-l3-2', prompt: 'Sie müssen zuerst eine Nummer ziehen.', options: RF, answer: 0, evidence: 'Bitte ziehen Sie eine Nummer' },
            { id: 'a1-1-l3-q3', stimulus: 'a1-1-l3-3', prompt: 'Ein fünfjähriges Kind darf allein schwimmen gehen.', options: RF, answer: 1, evidence: 'Kinder unter 6 Jahren nur mit Erwachsenen!' },
            { id: 'a1-1-l3-q4', stimulus: 'a1-1-l3-4', prompt: 'Sie brauchen beim Arzt Ihre Versichertenkarte.', options: RF, answer: 0, evidence: 'bitte bringen Sie bei jedem Besuch Ihre Versichertenkarte mit' },
            { id: 'a1-1-l3-q5', stimulus: 'a1-1-l3-5', prompt: 'Man kann heute den Aufzug benutzen.', options: RF, answer: 1, evidence: 'Der Aufzug ist kaputt.' },
          ],
        },
      ],
    },
    {
      key: 'schreiben',
      minutes: 20,
      parts: [
        {
          id: 'a1-1-s1',
          type: 'form',
          hint: 'a1s1',
          instruction: 'Ihr Freund Rashad Guliyev möchte Mitglied in einem Sportverein werden. Er hat keine Zeit. Sie füllen das Formular für ihn aus. Schreiben Sie fünf Informationen in das Formular.',
          situation:
            'Rashad ist 28 Jahre alt. Er kommt aus Aserbaidschan und wohnt jetzt in der Lindenstraße 14 in 50674 Köln. Er ist verheiratet und hat eine Tochter. Rashad möchte im Verein Fußball spielen. Er bezahlt den Mitgliedsbeitrag per Überweisung.',
          given: [
            { label: 'Familienname', value: 'Guliyev' },
            { label: 'Vorname', value: 'Rashad' },
            { label: 'Straße, Hausnummer', value: 'Lindenstraße 14' },
          ],
          fields: [
            { id: 'a1-1-s1-f1', label: 'Alter', accept: ['28', '28 Jahre', 'achtundzwanzig'] },
            { id: 'a1-1-s1-f2', label: 'Herkunftsland', accept: ['Aserbaidschan', 'Azerbaidschan', 'Aserbeidschan'] },
            { id: 'a1-1-s1-f3', label: 'PLZ, Wohnort', accept: ['50674 Köln', 'Köln 50674', '50674, Köln', 'Köln'] },
            { id: 'a1-1-s1-f4', label: 'Sportart', accept: ['Fußball', 'Fussball'] },
            { id: 'a1-1-s1-f5', label: 'Zahlungsart', accept: ['Überweisung', 'per Überweisung', 'Banküberweisung'] },
          ],
        },
        {
          id: 'a1-1-s2',
          type: 'writing',
          hint: 'a1s2',
          instruction: 'Schreiben Sie zu jedem Punkt ein bis zwei Sätze auf den Antwortbogen (circa 30 Wörter). Schreiben Sie auch eine Anrede und einen Gruß.',
          situation: 'Sie haben am Samstag Geburtstag und machen eine kleine Party. Schreiben Sie Ihrer Kollegin Julia eine E-Mail.',
          points: ['Laden Sie Julia ein.', 'Wann und wo ist die Party?', 'Was soll Julia mitbringen?'],
          words: 30,
          model:
            'Liebe Julia,\nich habe am Samstag Geburtstag und mache eine kleine Party. Kommst du auch? Die Party ist am Samstag um 19 Uhr bei mir zu Hause, Bergstraße 5. Kannst du bitte einen Salat mitbringen?\nViele Grüße\nAysel',
          rubric: [
            { key: 'content', points: 2, param: 'Laden Sie Julia ein.' },
            { key: 'content', points: 2, param: 'Wann und wo ist die Party?' },
            { key: 'content', points: 2, param: 'Was soll Julia mitbringen?' },
            { key: 'greeting', points: 1 },
            { key: 'understandable', points: 2 },
            { key: 'length', points: 1 },
          ],
        },
      ],
    },
    {
      key: 'sprechen',
      minutes: 15,
      parts: [
        {
          id: 'a1-1-sp1',
          type: 'speaking',
          hint: 'a1sp1',
          instruction: 'Sich vorstellen. Sprechen Sie über sich. Buchstabieren Sie dann Ihren Namen und sagen Sie eine Telefonnummer.',
          cards: ['Name?', 'Alter?', 'Land?', 'Wohnort?', 'Sprachen?', 'Beruf?', 'Hobby?'],
          phrases: [
            'Ich heiße Kamran Aliyev.',
            'Ich bin 31 Jahre alt.',
            'Ich komme aus Aserbaidschan.',
            'Ich wohne in Baku.',
            'Ich spreche Aserbaidschanisch, Russisch und ein bisschen Deutsch.',
            'Ich bin Elektriker von Beruf.',
            'Mein Hobby ist Fußball.',
            'Mein Name: K – A – M – R – A – N.',
          ],
          examiner: 'Wie ist Ihre Telefonnummer? Und können Sie bitte Ihren Familiennamen buchstabieren?',
          rubric: [
            { key: 'keywords', points: 1 },
            { key: 'spelling', points: 1 },
            { key: 'understandable', points: 1 },
          ],
        },
        {
          id: 'a1-1-sp2',
          type: 'speaking',
          hint: 'a1sp2',
          instruction: 'Um Informationen bitten und Informationen geben. Thema: Essen und Trinken. Ziehen Sie eine Karte, stellen Sie eine Frage und antworten Sie auf die Frage Ihres Partners.',
          situation: 'Thema: Essen und Trinken',
          cards: ['Frühstück', 'Lieblingsessen', 'Restaurant', 'Obst', 'Kaffee', 'Wochenende'],
          phrases: [
            'Was isst du zum Frühstück? – Ich esse Brot mit Käse und trinke Tee.',
            'Was ist dein Lieblingsessen? – Mein Lieblingsessen ist Plov.',
            'Gehst du oft ins Restaurant? – Nein, nur am Wochenende.',
            'Welches Obst magst du? – Ich mag Äpfel und Granatäpfel.',
            'Trinkst du gern Kaffee? – Ja, jeden Morgen eine Tasse.',
          ],
          examiner: 'Was essen Sie gern am Wochenende?',
          rubric: [
            { key: 'askQuestions', points: 2 },
            { key: 'answerQuestions', points: 2 },
            { key: 'understandable', points: 2 },
          ],
        },
        {
          id: 'a1-1-sp3',
          type: 'speaking',
          hint: 'a1sp3',
          instruction: 'Bitten formulieren und darauf reagieren. Ziehen Sie eine Karte. Bitten Sie Ihren Partner um etwas und reagieren Sie auf seine Bitte.',
          cards: ['Fenster', 'Kugelschreiber', 'Wasser', 'Tür', 'Handy', 'Wörterbuch'],
          phrases: [
            'Können Sie bitte das Fenster öffnen? – Ja, gern.',
            'Hast du einen Kugelschreiber für mich? – Ja, hier bitte.',
            'Kann ich bitte ein Glas Wasser haben? – Natürlich.',
            'Machen Sie bitte die Tür zu. – Okay, kein Problem.',
            'Kannst du bitte dein Handy ausmachen? – Ja, sofort.',
            'Darf ich Ihr Wörterbuch benutzen? – Tut mir leid, ich brauche es selbst.',
          ],
          examiner: 'Können Sie mir bitte helfen? Ich brauche einen Stift.',
          rubric: [
            { key: 'politeRequests', points: 2 },
            { key: 'reactRequests', points: 2 },
            { key: 'understandable', points: 2 },
          ],
        },
      ],
    },
  ],
};
