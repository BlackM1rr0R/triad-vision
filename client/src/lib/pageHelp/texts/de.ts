/** Seitenhilfe auf Deutsch: drei ganz einfache Sätze pro Seite (was · warum · was tun), öffentliche und Portalseiten. */
import type { FullHelpTexts } from '../registry';

export const HELP_DE: FullHelpTexts = {
  // start + hubs
  '/start': {
    what: 'Diese Seite stellt Ihnen drei kurze Fragen.',
    why: 'Aus Ihren Antworten entsteht Ihr persönlicher Plan für Deutschland.',
    todo: 'Sagen Sie, wer Sie sind, wählen Sie Ihren Beruf und Ihr Deutschniveau.',
  },
  '/start/plan': {
    what: 'Das ist Ihr persönlicher Plan, Schritt für Schritt.',
    why: 'Sie sehen, was Sie zuerst tun sollten und welche Tools helfen.',
    todo: 'Beginnen Sie mit Schritt eins. Registrieren Sie sich, um den Plan zu speichern.',
  },
  '/tools': {
    what: 'Diese Seite zeigt alle unsere kostenlosen Tools.',
    why: 'So finden Sie schnell das passende Tool für Ihre Frage.',
    todo: 'Wählen Sie eine Gruppe oder suchen Sie. Öffnen Sie dann ein Tool.',
  },
  '/for/:profession': {
    what: 'Diese Seite ist über einen Beruf in Deutschland.',
    why: 'Sie finden Tools, deutsche Wörter, eine Übungsprüfung und Stellen für diesen Beruf.',
    todo: 'Lernen Sie die Wörter, machen Sie die Übungsprüfung und sehen Sie die Stellen an.',
  },
  // am I eligible?
  '/path-finder': {
    what: 'Dieses Tool findet Ihren besten Weg nach Deutschland.',
    why: 'Sie sehen den Visaweg, das erwartete Gehalt und die Dauer.',
    todo: 'Beantworten Sie fünf kurze Fragen. Sie können das Ergebnis per Link teilen.',
  },
  '/uygunluq-testi': {
    what: 'Das ist ein kurzes Quiz zu Ihren Chancen.',
    why: 'Es zeigt, welcher Weg passt: Arbeitsvisum, Ausbildung, Chancenkarte oder Familie.',
    todo: 'Beantworten Sie sieben Fragen und lesen Sie Ihr Ergebnis.',
  },
  '/eligibility': {
    what: 'Das ist ein schneller Visum-Check.',
    why: 'Sie erfahren, welches Visum zu Ihnen passt.',
    todo: 'Beantworten Sie ein paar Fragen zu sich und Ihrer Arbeit.',
  },
  '/compare-visas': {
    what: 'Diese Seite vergleicht die Arbeitsvisa in einer Tabelle.',
    why: 'Sie sehen die Unterschiede auf einen Blick.',
    todo: 'Lesen Sie die Tabelle und finden Sie Ihr passendes Visum.',
  },
  '/blue-card-check': {
    what: 'Dieses Tool prüft ein Gehaltsangebot für die Blaue Karte EU.',
    why: 'Für die Blaue Karte muss das Gehalt hoch genug sein.',
    todo: 'Geben Sie das Gehalt und Ihren Beruf ein. Sie sehen sofort das Ergebnis.',
  },
  '/chancenkarte-calculator': {
    what: 'Dieses Tool zählt Ihre Punkte für die Chancenkarte.',
    why: 'Für die Chancenkarte brauchen Sie genug Punkte.',
    todo: 'Beantworten Sie die Fragen. Sie sehen Ihre Punkte und was noch fehlt.',
  },
  '/anerkennung': {
    what: 'Diese Seite erklärt die Anerkennung Ihres Abschlusses.',
    why: 'Viele Berufe in Deutschland brauchen einen anerkannten Abschluss.',
    todo: 'Wählen Sie Ihren Beruf und folgen Sie den Schritten.',
  },
  '/family-reunification-check': {
    what: 'Dieses Tool prüft, ob Ihre Familie nach Deutschland kommen kann.',
    why: 'Für Partner und Kinder braucht es zum Beispiel Geld und eine Wohnung.',
    todo: 'Beantworten Sie die Fragen. Sie sehen, was fertig ist und was fehlt.',
  },
  '/germany-vs-other-countries': {
    what: 'Diese Seite vergleicht Deutschland mit anderen Ländern.',
    why: 'Sie sehen Gehalt, Visum, Familie und Staatsbürgerschaft nebeneinander.',
    todo: 'Wählen Sie die Länder und lesen Sie den Vergleich.',
  },
  '/visa-document-checklist': {
    what: 'Das ist eine Liste der Unterlagen für Ihr Visum.',
    why: 'Fehlende Unterlagen können Ihr Visum verzögern.',
    todo: 'Wählen Sie Visum und Beruf. Drucken Sie dann die Liste.',
  },
  '/visa-refusal': {
    what: 'Diese Seite hilft nach einer Visum-Ablehnung.',
    why: 'Sie erfahren die Gründe und was Sie noch tun können.',
    todo: 'Wählen Sie den Ablehnungsgrund und lesen Sie Ihre Möglichkeiten.',
  },
  '/grade-converter': {
    what: 'Dieses Tool rechnet Ihre Noten in deutsche Noten um.',
    why: 'Deutsche Arbeitgeber und Schulen nutzen die Skala 1,0 bis 4,0.',
    todo: 'Geben Sie Ihre Note und die Skala ein. Sie sehen die deutsche Note.',
  },
  // money
  '/salary-calculator': {
    what: 'Diese Seite rechnet Ihr Brutto in Netto um.',
    why: 'Sie sehen, wie viel Geld Sie jeden Monat wirklich bekommen.',
    todo: 'Geben Sie Ihr Gehalt ein und wählen Sie Ihre Steuerklasse.',
  },
  '/cost-calculator': {
    what: 'Dieses Tool schätzt die Kosten Ihres Umzugs.',
    why: 'So können Sie das nötige Geld rechtzeitig sparen.',
    todo: 'Wählen Sie, was Sie brauchen, zum Beispiel Visum, Übersetzungen und Kurs.',
  },
  '/budget': {
    what: 'Dieses Tool plant Ihr Geld für den ersten Monat.',
    why: 'Das erste Gehalt kommt spät, Miete und Kaution kommen zuerst.',
    todo: 'Geben Sie Gehalt und Kosten ein. Sie sehen, wie viel Geld Sie mitbringen sollten.',
  },
  '/payslip-explained': {
    what: 'Diese Seite erklärt eine deutsche Lohnabrechnung Zeile für Zeile.',
    why: 'Sie verstehen, was von Ihrem Lohn abgezogen wird und warum.',
    todo: 'Klicken Sie auf eine Zeile und lesen Sie, was sie bedeutet.',
  },
  '/tax-refund-calculator': {
    what: 'Dieses Tool schätzt Ihre Steuererstattung.',
    why: 'Viele Arbeitnehmer bekommen Geld vom Finanzamt zurück.',
    todo: 'Geben Sie Ihr Gehalt und Ihre Kosten ein, zum Beispiel den Arbeitsweg.',
  },
  '/shift-pay-calculator': {
    what: 'Dieses Tool rechnet Ihren Lohn für Nacht, Sonntag und Feiertag.',
    why: 'Manche Zuschläge für diese Stunden sind steuerfrei.',
    todo: 'Geben Sie Ihren Stundenlohn und Ihre Schichten ein.',
  },
  '/tax-class-chooser': {
    what: 'Dieses Tool hilft Ehepaaren bei der Wahl der Steuerklasse.',
    why: 'Die Steuerklasse ändert, wie viel Sie jeden Monat bekommen.',
    todo: 'Geben Sie beide Gehälter ein und vergleichen Sie.',
  },
  '/rent-check': {
    what: 'Dieses Tool prüft, ob eine Miete fair ist.',
    why: 'So zahlen Sie nicht zu viel für eine Wohnung.',
    todo: 'Wählen Sie die Stadt. Geben Sie Miete und Größe ein.',
  },
  '/send-money-home': {
    what: 'Dieses Tool zeigt, wie viel Geld Sie nach Hause schicken können.',
    why: 'So planen Sie die Hilfe für Ihre Familie nach Ihren Kosten.',
    todo: 'Geben Sie Gehalt und Kosten ein. Sie sehen den Betrag in Manat.',
  },
  '/real-salaries': {
    what: 'Diese Seite zeigt echte Gehälter unserer Fachkräfte.',
    why: 'Sie sehen, was Menschen in Ihrem Beruf wirklich verdienen.',
    todo: 'Wählen Sie Beruf und Stadt und sehen Sie die Spannen an.',
  },
  '/health-insurance-comparison': {
    what: 'Diese Seite vergleicht die Krankenkassen.',
    why: 'Die Kassen kosten unterschiedlich viel. Sie können Geld sparen.',
    todo: 'Geben Sie Ihr Gehalt ein und finden Sie die günstigste Kasse.',
  },
  // plan the move
  '/when-in-germany': {
    what: 'Dieses Tool schätzt, wann Sie in Deutschland sein können.',
    why: 'So planen Sie Arbeit, Wohnung und Familie rechtzeitig.',
    todo: 'Beantworten Sie die Fragen und sehen Sie Ihren Zeitplan an.',
  },
  '/permanent-residence': {
    what: 'Dieses Tool zeigt, wann Sie dauerhaft in Deutschland bleiben können.',
    why: 'Sie sehen die frühesten Termine für Niederlassung und Einbürgerung.',
    todo: 'Geben Sie Ihr Ankunftsdatum und Ihre Lage ein.',
  },
  '/five-years-in-germany': {
    what: 'Diese Seite zeigt Ihre nächsten fünf Jahre in Deutschland.',
    why: 'Sie sehen Gehalt, Ersparnisse und Aufenthaltsschritte Jahr für Jahr.',
    todo: 'Wählen Sie Beruf und Stadt und gehen Sie durch die Jahre.',
  },
  '/which-city': {
    what: 'Dieses Quiz findet eine deutsche Stadt für Sie.',
    why: 'Städte sind verschieden bei Miete, Arbeit und Leben.',
    todo: 'Beantworten Sie acht Fragen und sehen Sie Ihre Stadt.',
  },
  '/residence-card-explained': {
    what: 'Diese Seite erklärt den deutschen Aufenthaltstitel.',
    why: 'Sie verstehen jedes Feld auf Ihrer Karte.',
    todo: 'Klicken Sie auf ein Feld der Musterkarte und lesen Sie die Erklärung.',
  },
  '/calculator': {
    what: 'Dieses Tool schätzt, wann Sie in Deutschland anfangen können.',
    why: 'So planen Sie den Umzug und informieren Ihren Arbeitgeber.',
    todo: 'Wählen Sie Ihr Visum und sehen Sie die Schätzung.',
  },
  '/cities': {
    what: 'Diese Seite vergleicht deutsche Städte.',
    why: 'Sie sehen Miete, Nahverkehr und Lebensmittelkosten jeder Stadt.',
    todo: 'Wählen Sie Städte und vergleichen Sie sie.',
  },
  '/events': {
    what: 'Diese Seite zeigt unsere kostenlosen Veranstaltungen und Webinare.',
    why: 'Sie können Fragen stellen und mehr über Deutschland lernen.',
    todo: 'Wählen Sie eine Veranstaltung und melden Sie sich an.',
  },
  '/status': {
    what: 'Diese Seite zeigt den Stand Ihres Antrags.',
    why: 'Sie können ihn ohne Anmeldung prüfen.',
    todo: 'Geben Sie Ihre Antragsnummer und Ihr Geburtsdatum ein.',
  },
  '/changes-2027': {
    what: 'Diese Seite zeigt, was sich 2027 in Deutschland ändert.',
    why: 'Neue Regeln können Lohn, Steuern oder Visum ändern.',
    todo: 'Lesen Sie die Liste. Jeder Punkt zeigt den alten und den neuen Wert.',
  },
  // life in Germany
  '/life-in-germany': {
    what: 'Dieses Tool zeigt das Leben in Deutschland in Zahlen.',
    why: 'Sie sehen Gehalt, Miete, Kosten und Ersparnisse für Beruf und Stadt.',
    todo: 'Wählen Sie Beruf und Stadt und sehen Sie die Ergebnisse an.',
  },
  '/driving-licence-germany': {
    what: 'Diese Seite erklärt Ihren Führerschein in Deutschland.',
    why: 'Ihr Führerschein aus der Heimat gilt nur kurze Zeit.',
    todo: 'Lesen Sie die Schritte und sehen Sie Prüfungen und Kosten.',
  },
  '/german-apartment': {
    what: 'Das ist eine virtuelle deutsche Wohnung.',
    why: 'Sie lernen die Regeln, zum Beispiel Heizen, Lüften und Müll.',
    todo: 'Klicken Sie auf Dinge in der Wohnung und lesen Sie die Tipps.',
  },
  '/apartment-viewing': {
    what: 'Hier üben Sie eine Wohnungsbesichtigung auf Deutsch.',
    why: 'Sie lernen, was Sie sagen, und erkennen Betrug.',
    todo: 'Spielen Sie die Besichtigung. Füllen Sie dann die Selbstauskunft als PDF aus.',
  },
  '/german-street': {
    what: 'Das ist eine virtuelle deutsche Straße.',
    why: 'Sie üben Orte wie Amt, Bank und Arzt.',
    todo: 'Klicken Sie auf ein Gebäude, um ein Spiel oder eine Szene zu öffnen.',
  },
  '/holiday-planner': {
    what: 'Dieses Tool zeigt Feiertage und Brückentage.',
    why: 'So bekommen Sie mehr freie Tage mit weniger Urlaubstagen.',
    todo: 'Wählen Sie Bundesland und Jahr. Speichern Sie den Kalender, wenn Sie möchten.',
  },
  '/advent-calendar': {
    what: 'Das ist ein deutscher Adventskalender.',
    why: 'Sie lernen Weihnachtsbräuche und neue deutsche Sätze.',
    todo: 'Öffnen Sie vom 1. bis 24. Dezember jeden Tag ein Türchen.',
  },
  '/weekend-trips': {
    what: 'Diese Seite zeigt Tagesausflüge mit dem Regionalzug.',
    why: 'Mit dem Deutschlandticket sehen Sie Deutschland günstig.',
    todo: 'Wählen Sie Ihre Stadt und einen Ausflug.',
  },
  '/driving-time-calculator': {
    what: 'Dieses Tool prüft Lenk- und Ruhezeiten für Lkw-Fahrer.',
    why: 'Wer die Regeln bricht, zahlt hohe Bußgelder.',
    todo: 'Geben Sie Ihre Fahr- und Ruhezeiten der Woche ein.',
  },
  '/work-schedule-check': {
    what: 'Dieses Tool prüft, ob Ihr Dienstplan erlaubt ist.',
    why: 'In Deutschland gibt es Regeln für Arbeitszeit, Pausen und Ruhe.',
    todo: 'Geben Sie Ihre Schichten ein und sehen Sie das Ergebnis.',
  },
  '/emergency-wallpaper': {
    what: 'Dieses Tool macht ein Notfall-Bild für Ihr Handy.',
    why: 'Im Notfall sehen Helfer sofort die wichtigen Nummern.',
    todo: 'Tragen Sie Ihre Daten ein und laden Sie das Bild herunter.',
  },
  '/pocket-guide': {
    what: 'Das ist ein kleiner Deutschland-Ratgeber zum Ausdrucken.',
    why: 'Sie haben Notrufnummern und wichtige Sätze auf Papier.',
    todo: 'Laden Sie das PDF herunter und drucken Sie es aus.',
  },
  // explore
  '/map': {
    what: 'Diese Karte zeigt, wo unsere Fachkräfte in Deutschland leben.',
    why: 'Sie sehen die Städte, in denen Menschen wie Sie arbeiten.',
    todo: 'Bewegen Sie die Karte und klicken Sie auf eine Stadt.',
  },
  '/azerbaijan-in-germany': {
    what: 'Diese Seite zeigt aserbaidschanische Orte in Deutschland.',
    why: 'Sie finden Botschaft, Vereine und Gemeinschaft in Ihrer Nähe.',
    todo: 'Sehen Sie Karte oder Liste an und öffnen Sie einen Ort.',
  },
  '/guides': {
    what: 'Diese Seite enthält unsere Ratgeber und Artikel.',
    why: 'Sie lernen mehr über Visum, Anerkennung und Umzug.',
    todo: 'Wählen Sie ein Thema und lesen Sie den Ratgeber.',
  },
  '/glossary': {
    what: 'Das ist ein Wörterbuch für deutsche Amtswörter.',
    why: 'Briefe und Ämter nutzen viele schwere Wörter.',
    todo: 'Suchen Sie ein Wort und lesen Sie die einfache Erklärung.',
  },
  '/shortage-barometer': {
    what: 'Diese Seite zeigt, wo Deutschland Fachkräfte braucht.',
    why: 'Sie sehen, wo Ihr Beruf am meisten gesucht wird.',
    todo: 'Wählen Sie Ihren Beruf und sehen Sie die Karte an.',
  },
  '/jobs': {
    what: 'Diese Seite zeigt offene Stellen in Deutschland.',
    why: 'Sie können Arbeit finden und sich bewerben.',
    todo: 'Filtern Sie nach Beruf oder Stadt und öffnen Sie eine Stelle.',
  },
  '/visas': {
    what: 'Diese Seite zeigt alle Arten von Arbeitsvisa.',
    why: 'Sie sehen, was jedes Visum verlangt.',
    todo: 'Öffnen Sie eine Visumart und lesen Sie die Details.',
  },
  // learn German (games, exams, scenes)
  '/german-mock-exam': {
    what: 'Diese Seite enthält Übungsprüfungen für Deutsch.',
    why: 'Sie gewöhnen sich vor dem Termin an die echte Prüfung.',
    todo: 'Wählen Sie Niveau A1 oder B1 und starten Sie.',
  },
  '/german-mock-exam/a1': {
    what: 'Das ist eine Übungsprüfung Deutsch auf Niveau A1.',
    why: 'Sie sehen, wie gut Sie auf die echte Prüfung vorbereitet sind.',
    todo: 'Machen Sie Hören, Lesen, Schreiben und Sprechen. Achten Sie auf die Zeit.',
  },
  '/german-mock-exam/b1': {
    what: 'Das ist eine Übungsprüfung Deutsch auf Niveau B1.',
    why: 'Sie sehen, wie gut Sie auf die echte Prüfung vorbereitet sind.',
    todo: 'Machen Sie alle vier Teile und sehen Sie Ihre Punkte an.',
  },
  '/german-level-test-self': {
    what: 'Diese Seite hilft Ihnen, Ihr Deutschniveau zu finden.',
    why: 'Sie wissen, wo Sie stehen und was Sie als Nächstes lernen.',
    todo: 'Beantworten Sie die Fragen dazu, was Sie schon können.',
  },
  '/german-simulator': {
    what: 'Dieses Spiel übt Gespräche auf Ämtern und bei der Arbeit.',
    why: 'Sie lernen, was Sie im echten Leben sagen.',
    todo: 'Lesen Sie den Dialog und wählen Sie die richtige Antwort.',
  },
  '/pronunciation': {
    what: 'Dieses Tool trainiert Ihre deutsche Aussprache.',
    why: 'Mit guter Aussprache versteht man Sie besser.',
    todo: 'Hören Sie einen Satz und sprechen Sie ihn ins Mikrofon.',
  },
  '/price-game': {
    what: 'In diesem Spiel raten Sie Preise in Deutschland.',
    why: 'Sie lernen schon vor der Ankunft, was Dinge kosten.',
    todo: 'Raten Sie in jeder Runde den Preis.',
  },
  '/traffic-signs': {
    what: 'Diese Seite lehrt deutsche Verkehrszeichen.',
    why: 'Sie brauchen sie zum Fahren und für die Führerscheinprüfung.',
    todo: 'Lernen Sie die Zeichen und machen Sie dann den Test.',
  },
  '/waste-sorting': {
    what: 'Dieses Spiel lehrt die Mülltrennung in Deutschland.',
    why: 'In Deutschland gehört jeder Müll in die richtige Tonne.',
    todo: 'Werfen Sie jedes Teil in die richtige Tonne, bevor die Zeit abläuft.',
  },
  '/ticket-machine': {
    what: 'Das ist ein Fahrkartenautomat zum Üben.',
    why: 'Ohne die richtige Fahrkarte zahlen Sie eine Strafe.',
    todo: 'Lösen Sie die Aufgaben und kaufen Sie die richtige Fahrkarte.',
  },
  '/supermarket-game': {
    what: 'Dieses Spiel ist ein deutscher Supermarkt.',
    why: 'Sie lernen Wörter für Essen und wie Einkaufen funktioniert.',
    todo: 'Finden Sie alles auf Ihrer Liste und bezahlen Sie.',
  },
  '/workplace-etiquette': {
    what: 'Dieses Quiz ist über gutes Verhalten bei der Arbeit.',
    why: 'Die Regeln bei der Arbeit können anders sein als zu Hause.',
    todo: 'Lesen Sie jede Situation und wählen Sie die beste Antwort.',
  },
  '/work-scenes': {
    what: 'Diese Seite zeigt Bilder von Arbeitsplätzen mit deutschen Wörtern.',
    why: 'Sie lernen die Wörter, die Sie bei der Arbeit brauchen.',
    todo: 'Wählen Sie einen Arbeitsplatz und öffnen Sie ihn.',
  },
  '/work-scenes/restaurant-kitchen': {
    what: 'Dieses Bild zeigt eine Restaurantküche.',
    why: 'Sie lernen die Wörter für die Arbeit in der Küche.',
    todo: 'Klicken Sie auf Dinge im Bild, hören Sie zu und machen Sie das Quiz.',
  },
  '/work-scenes/truck-cab': {
    what: 'Dieses Bild zeigt ein Lkw-Fahrerhaus.',
    why: 'Sie lernen die Wörter für Lkw-Fahrer.',
    todo: 'Klicken Sie auf Dinge im Bild, hören Sie zu und machen Sie das Quiz.',
  },
  '/work-scenes/hospital-ward': {
    what: 'Dieses Bild zeigt eine Station im Krankenhaus.',
    why: 'Sie lernen die Wörter für die Arbeit in der Pflege.',
    todo: 'Klicken Sie auf Dinge im Bild, hören Sie zu und machen Sie das Quiz.',
  },
  '/work-scenes/construction-site': {
    what: 'Dieses Bild zeigt eine Baustelle.',
    why: 'Sie lernen die Wörter und Sicherheitsregeln auf dem Bau.',
    todo: 'Klicken Sie auf Dinge im Bild, hören Sie zu und machen Sie das Quiz.',
  },
  '/work-scenes/electrical-panel': {
    what: 'Dieses Bild zeigt einen Sicherungskasten.',
    why: 'Sie lernen die Wörter für Elektriker.',
    todo: 'Klicken Sie auf Dinge im Bild, hören Sie zu und machen Sie das Quiz.',
  },
  // employers
  '/employer-cost-calculator': {
    what: 'Dieses Tool zeigt, was eine Fachkraft den Arbeitgeber kostet.',
    why: 'Arbeitgeber zahlen mehr als das Bruttogehalt.',
    todo: 'Geben Sie das Bruttogehalt ein und sehen Sie die Gesamtkosten.',
  },
  '/employer-guide-azerbaijan': {
    what: 'Dieser Ratgeber ist für Arbeitgeber, die aus Aserbaidschan einstellen.',
    why: 'Sie lernen Schulsystem, Abschlüsse und Feiertage dort kennen.',
    todo: 'Lesen Sie die Teile, die für Sie wichtig sind.',
  },
  '/kandidaten': {
    what: 'Diese Seite zeigt Kandidaten, die in Deutschland arbeiten möchten.',
    why: 'Arbeitgeber finden hier passende Fachkräfte.',
    todo: 'Filtern Sie nach Beruf und Deutschniveau und kontaktieren Sie uns.',
  },
  '/novruz-card': {
    what: 'Dieses Tool macht eine Grußkarte zu Novruz.',
    why: 'So grüßen Sie Ihr aserbaidschanisches Team zum Fest.',
    todo: 'Wählen Sie ein Design und laden Sie die Karte herunter.',
  },

  // client portal
  '/account': {
    what: 'Das ist die Startseite Ihres Kundenbereichs.',
    why: 'Sie sehen Ihren nächsten Schritt und den Stand Ihres Antrags.',
    todo: 'Erledigen Sie zuerst die Aufgabe in der oberen Karte.',
  },
  '/account/cases': {
    what: 'Diese Seite zeigt alle Ihre Anträge.',
    why: 'Sie sehen Ihre Anträge und die Ihrer Familie.',
    todo: 'Klicken Sie auf einen Antrag, um ihn zu öffnen.',
  },
  '/account/cases/:id': {
    what: 'Diese Seite zeigt einen Antrag.',
    why: 'Sie sehen Stand, Dokumente und was noch fehlt.',
    todo: 'Prüfen Sie die offenen Aufgaben und laden Sie fehlende Dokumente hoch.',
  },
  '/account/cases/:id/forms/:formId': {
    what: 'Das ist ein Fragebogen von unserem Team.',
    why: 'Wir brauchen Ihre Antworten, um Ihre Unterlagen vorzubereiten.',
    todo: 'Füllen Sie alle Felder aus und senden Sie den Fragebogen ab.',
  },
  '/account/cases/:id/confirm': {
    what: 'Diese Seite zeigt Ihre Daten für die Unterlagen der Botschaft.',
    why: 'Falsche Daten können Probleme beim Visum machen.',
    todo: 'Prüfen Sie jeden Wert. Bestätigen oder korrigieren Sie ihn.',
  },
  '/account/notifications': {
    what: 'Diese Seite zeigt alle Ihre Benachrichtigungen.',
    why: 'So verpassen Sie keine Neuigkeit zu Ihrem Antrag.',
    todo: 'Lesen Sie neue Meldungen und markieren Sie sie als gelesen.',
  },
  '/account/profile': {
    what: 'Diese Seite enthält Ihre persönlichen Daten und Einstellungen.',
    why: 'Mit richtigen Daten erreichen wir Sie und bereiten Unterlagen vor.',
    todo: 'Prüfen Sie Ihre Daten und speichern Sie Änderungen.',
  },
  '/account/applications': {
    what: 'Diese Seite zeigt die Stellen, auf die Sie sich beworben haben.',
    why: 'Sie sehen den Stand jeder Bewerbung.',
    todo: 'Öffnen Sie eine Bewerbung, um den Stand zu sehen.',
  },
  '/account/saved-jobs': {
    what: 'Diese Seite zeigt Ihre gespeicherten Stellen.',
    why: 'So finden Sie sie später wieder.',
    todo: 'Öffnen Sie eine Stelle oder richten Sie einen Job-Alarm ein.',
  },
  '/account/job-applications': {
    what: 'Diese Seite zeigt Ihre Bewerbungen über uns.',
    why: 'Sie sehen den Stand jeder Bewerbung.',
    todo: 'Prüfen Sie die Schritte jeder Bewerbung.',
  },
  '/account/onboarding': {
    what: 'Diese Seite zeigt Ihre ersten Schritte in Deutschland.',
    why: 'Manche Aufgaben haben nach der Ankunft eine Frist.',
    todo: 'Erledigen Sie jede Aufgabe und haken Sie sie ab.',
  },
  '/account/housing': {
    what: 'Diese Seite hilft bei Wohnungssuche und Anmeldung.',
    why: 'Für die Anmeldung in Deutschland brauchen Sie eine Adresse.',
    todo: 'Folgen Sie der Checkliste und tragen Sie Ihre Mietdaten ein.',
  },
  '/account/german': {
    what: 'Diese Seite ist über Ihr Deutsch.',
    why: 'Viele Visa und Stellen verlangen Deutschkenntnisse.',
    todo: 'Testen Sie Ihr Niveau, wählen Sie einen Kurs und laden Sie Ihr Zertifikat hoch.',
  },
  '/account/interviews': {
    what: 'Diese Seite zeigt Ihre Vorstellungsgespräche.',
    why: 'So verpassen Sie kein Gespräch mit einem Arbeitgeber.',
    todo: 'Sagen Sie einen Termin zu oder ab. Nehmen Sie am Tag teil.',
  },
  '/account/privacy': {
    what: 'Diese Seite ist über Ihre Daten und Ihren Datenschutz.',
    why: 'Sie entscheiden, was wir mit Ihren Daten tun dürfen.',
    todo: 'Prüfen Sie Ihre Einwilligungen und stellen Sie bei Bedarf eine Anfrage.',
  },
  '/account/waiting-room': {
    what: 'Diese Seite enthält Lektionen für Ihre Wartezeit.',
    why: 'Sie können sich schon jetzt auf Deutschland vorbereiten.',
    todo: 'Öffnen Sie eine Lektion, ein Video oder eine Übung.',
  },
  '/account/course': {
    what: 'Diese Seite zeigt Ihre Vorbereitungskurse.',
    why: 'Die Kurse bereiten Sie auf Deutschland vor.',
    todo: 'Wählen Sie einen Kurs und starten Sie.',
  },
  '/account/course/:courseId': {
    what: 'Diese Seite zeigt einen Kurs und seine Lektionen.',
    why: 'Sie sehen Ihren Fortschritt im Kurs.',
    todo: 'Öffnen Sie die nächste Lektion.',
  },
  '/account/course/:courseId/lesson/:lessonId': {
    what: 'Das ist eine Lektion Ihres Kurses.',
    why: 'Jede Lektion bringt Ihnen etwas Neues bei.',
    todo: 'Gehen Sie die Lektion durch und machen Sie das Quiz.',
  },
  '/account/guides': {
    what: 'Diese Seite enthält Tipps für Ihren aktuellen Schritt.',
    why: 'Sie wissen, was gerade wichtig ist.',
    todo: 'Lesen Sie die Tipps und öffnen Sie einen Ratgeber.',
  },
  '/account/cv': {
    what: 'Diese Seite hilft Ihnen beim Lebenslauf.',
    why: 'Arbeitgeber erwarten einen Lebenslauf im deutschen Stil.',
    todo: 'Tragen Sie Ihre Daten ein und laden Sie den Lebenslauf herunter.',
  },
  '/account/letters/*': {
    what: 'Diese Seite hilft Ihnen beim Anschreiben.',
    why: 'Ein gutes Anschreiben hilft bei der Bewerbung.',
    todo: 'Wählen Sie eine Stelle und erstellen Sie Ihr Anschreiben.',
  },
  '/account/letters-explain': {
    what: 'Diese Seite erklärt Ihnen deutsche Briefe.',
    why: 'Amtliche Briefe sind oft schwer zu verstehen.',
    todo: 'Laden Sie ein Foto oder PDF des Briefs hoch und lesen Sie die Erklärung.',
  },
  '/account/vault': {
    what: 'Das ist Ihr sicherer Ort für Dokumente.',
    why: 'Sie laden ein Dokument einmal hoch und nutzen es wieder.',
    todo: 'Laden Sie Ihre Dokumente hoch. Wir erinnern Sie vor dem Ablauf.',
  },
  '/account/referral': {
    what: 'Diese Seite enthält Ihren Link, um Freunde einzuladen.',
    why: 'So können auch Ihre Freunde ihren Weg nach Deutschland beginnen.',
    todo: 'Kopieren Sie Link oder QR-Code und senden Sie ihn an Freunde.',
  },
  '/account/arrival': {
    what: 'Diese Seite ist Ihr Ankunftsplan.',
    why: 'Flug, Abholung und erste Unterkunft müssen bereit sein.',
    todo: 'Tragen Sie Ihre Flugdaten ein und prüfen Sie den Plan.',
  },
  '/account/arrival-prep': {
    what: 'Diese Seite zeigt, was vor und nach der Ankunft zu tun ist.',
    why: 'Manche Aufgaben haben nach der Ankunft eine Frist.',
    todo: 'Haken Sie jede Aufgabe ab, wenn sie erledigt ist.',
  },
  '/account/arrival-card': {
    what: 'Das ist Ihre digitale Ankunftskarte.',
    why: 'Adresse, Arbeitgeber und Notrufnummern stehen auf einer Seite.',
    todo: 'Speichern Sie die Karte auf dem Handy, dann geht sie auch offline.',
  },
  '/account/readiness': {
    what: 'Diese Seite zeigt, wie bereit Sie für Deutschland sind.',
    why: 'Sie sehen, was gut ist und was noch fehlt.',
    todo: 'Machen Sie den nächsten Schritt, der bei jedem Teil steht.',
  },
  '/account/germany-ready': {
    what: 'Diese Seite sammelt Ihre Übungspunkte.',
    why: 'Sie sehen Ihren Fortschritt in Spielen und Lektionen.',
    todo: 'Machen Sie die Wochenaufgabe und holen Sie sich Ihr Zertifikat.',
  },
  '/account/future-letter': {
    what: 'Hier schreiben Sie einen Brief an Ihr zukünftiges Ich.',
    why: 'Sie lesen ihn wieder, wenn Sie in Deutschland ankommen.',
    todo: 'Schreiben Sie Ihren Brief und speichern Sie ihn.',
  },
  '/account/rate-alerts': {
    what: 'Hier stellen Sie Alarme für den Kurs Euro zu Manat ein.',
    why: 'So wissen Sie, wann sich Geld nach Hause schicken lohnt.',
    todo: 'Wählen Sie einen Kurs. Wir schicken Ihnen eine E-Mail, wenn er erreicht ist.',
  },
  '/account/pocket-guide': {
    what: 'Das ist Ihr persönlicher Deutschland-Ratgeber für die Tasche.',
    why: 'Ihre Daten und Notrufnummern stehen auf Papier.',
    todo: 'Laden Sie das PDF herunter und drucken Sie es aus.',
  },
  '/account/emergency-wallpaper': {
    what: 'Dieses Tool macht ein Notfall-Bild für Ihr Handy.',
    why: 'Im Notfall sehen Helfer sofort die wichtigen Nummern.',
    todo: 'Prüfen Sie Ihre Daten und laden Sie das Bild herunter.',
  },
  '/account/badges': {
    what: 'Diese Seite zeigt Ihre Abzeichen.',
    why: 'Sie sehen, was Sie schon geschafft haben.',
    todo: 'Sehen Sie die offenen Abzeichen an und wie Sie sie bekommen.',
  },
  '/account/visa-story/:caseId': {
    what: 'Das ist die Geschichte Ihres Visums in Bildern.',
    why: 'Sie sehen Ihren Weg zum Visum in Zahlen.',
    todo: 'Klicken Sie sich durch die Folien. Die letzte Karte können Sie speichern.',
  },
  '/account/rule-changes': {
    what: 'Diese Seite zeigt Regeländerungen für Ihr Visum.',
    why: 'Neue Regeln können ändern, was Sie brauchen.',
    todo: 'Lesen Sie die Änderungen und fragen Sie uns, wenn etwas unklar ist.',
  },
  '/account/checklist': {
    what: 'Diese Seite zeigt alle Dokumente für Ihr Visum.',
    why: 'Sie sehen, was Sie brauchen und wie Sie es bekommen.',
    todo: 'Öffnen Sie jedes Dokument, lesen Sie die Tipps und laden Sie es hoch.',
  },
  '/account/budget': {
    what: 'Diese Seite plant Ihr Geld für den ersten Monat.',
    why: 'Das erste Gehalt kommt spät, Miete und Kaution kommen zuerst.',
    todo: 'Prüfen Sie die Zahlen und sehen Sie, wie viel Geld Sie mitbringen sollten.',
  },
  '/account/interview-prep': {
    what: 'Hier üben Sie für ein Vorstellungsgespräch.',
    why: 'Übung macht Sie ruhig und sicher.',
    todo: 'Öffnen Sie eine Frage, antworten Sie und lesen Sie die Musterantwort.',
  },
  '/account/signatures': {
    what: 'Diese Seite zeigt Dokumente, die Sie unterschreiben sollen.',
    why: 'Erst nach Ihrer Unterschrift geht es weiter.',
    todo: 'Öffnen Sie ein Dokument, lesen Sie es und unterschreiben Sie.',
  },
  '/account/signatures/:signerId': {
    what: 'Das ist ein Dokument, das Sie unterschreiben sollen.',
    why: 'Erst nach Ihrer Unterschrift geht es weiter.',
    todo: 'Lesen Sie das Dokument genau und unterschreiben Sie dann.',
  },
  '/account/payments': {
    what: 'Diese Seite zeigt Ihre Rechnungen und Zahlungen.',
    why: 'Sie sehen, was bezahlt ist und was noch offen ist.',
    todo: 'Öffnen Sie eine Rechnung, um die Bankdaten zu sehen.',
  },
  '/account/all': {
    what: 'Hier sehen Sie alle Bereiche Ihres Portals.',
    why: 'Hier finden Sie Bereiche, die nicht im Menü stehen.',
    todo: 'Wählen Sie den Bereich, den Sie brauchen, und öffnen Sie ihn.',
  },
};
