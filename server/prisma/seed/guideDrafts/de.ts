import type { GuidePageSeed } from '../guides/types.js';
import type { DraftKey } from './index.js';

/**
 * German drafts for employers (Arbeitgeber, Personalabteilungen, Inhaber). Unpublished until the owner has
 * checked every PRÜFEN review placeholder (see src/lib/guides/placeholders.ts) in Admin → Guides.
 */
export const DE_DRAFTS: Partial<Record<DraftKey, GuidePageSeed>> = {
  'employer-azerbaijan': {
    slug: 'fachkraefte-aus-aserbaidschan',
    title: 'Fachkräfte aus Aserbaidschan einstellen: Ablauf 2026',
    description:
      'Fachkräfte aus Aserbaidschan einstellen: Aufenthaltswege, Ablauf, Dauer, Kostenpositionen, § 81a und Ihre Pflichten als Arbeitgeber – kompakt erklärt.',
    body: `Viele Betriebe in Deutschland finden für Logistik, Pflege, Handwerk, Gastronomie oder Industrie im Inland keine passenden Bewerberinnen und Bewerber mehr. Fachkräfte aus Drittstaaten sind seit dem Fachkräfteeinwanderungsgesetz deutlich leichter einzustellen als noch vor einigen Jahren. Aserbaidschan ist dabei ein Herkunftsland, das viele Arbeitgeber noch nicht auf dem Schirm haben: Es gibt eine junge, mobile Bevölkerung, ein verbreitetes Interesse an Deutschland und Deutschkurse in Baku und anderen Städten.

Dieser Leitfaden zeigt, welche Aufenthaltswege 2026 in Frage kommen, wie der Ablauf aussieht, womit Sie zeitlich und organisatorisch rechnen müssen und welche Pflichten Sie als Arbeitgeber haben. Er ersetzt keine Rechtsberatung – die Entscheidung über Visum und Aufenthaltstitel trifft immer die Behörde.

## Welche Aufenthaltswege gibt es?

Welcher Weg passt, hängt vor allem von der Qualifikation der Person und von der Stelle ab. Die wichtigsten Varianten:

| Weg | Für wen | Kernvoraussetzungen |
|---|---|---|
| § 18a AufenthG | Fachkräfte mit Berufsausbildung | In Deutschland anerkannter Berufsabschluss, Arbeitsplatzangebot |
| § 18b AufenthG | Fachkräfte mit Hochschulabschluss | Anerkannter oder vergleichbarer Abschluss, qualifizierte Stelle |
| § 18g AufenthG (Blaue Karte EU) | Akademikerinnen und Akademiker | Gehalt ab 50.700 € brutto/Jahr, in Engpassberufen und für Berufsanfänger ab 45.934,20 € |
| § 19c Abs. 2 AufenthG | Berufserfahrene ohne deutsche Anerkennung | Mind. 2 Jahre Erfahrung in den letzten 5 Jahren, im Herkunftsstaat anerkannter Abschluss, Gehalt ab 45.630 € (2026: 45 % der Beitragsbemessungsgrenze der Rentenversicherung) oder Tarifbindung |
| § 19c Abs. 1 i. V. m. BeschV | Bestimmte Beschäftigungen, z. B. Berufskraftfahrer | Je nach Vorschrift der Beschäftigungsverordnung |
| § 16a / § 16d AufenthG | Auszubildende / Anerkennung in Deutschland | Ausbildungsvertrag bzw. Anerkennungsmaßnahme oder Anerkennungspartnerschaft |

Seit dem 1. März 2024 dürfen anerkannte Fachkräfte jede qualifizierte Beschäftigung ausüben – die Stelle muss nicht mehr exakt zum Abschluss passen. Eine Vorrangprüfung findet bei Fachkräften nicht statt; die Bundesagentur für Arbeit (BA) prüft aber in der Regel, ob die Arbeitsbedingungen denen vergleichbarer inländischer Beschäftigter entsprechen.

### Besonderheit ab 45 Jahren

Wer mit 45 Jahren oder älter erstmals einen Titel als Fachkraft erhält, muss ein Gehalt von mindestens 55 % der Beitragsbemessungsgrenze der Rentenversicherung erreichen – 2026 sind das 55.770 € brutto im Jahr (55 % von 101.400 €) – oder eine angemessene Altersversorgung nachweisen.

Einen Vergleich der Wege finden Sie auf unserer Seite [Visa vergleichen](/compare-visas); zur Blauen Karte gibt es einen eigenen [Gehaltscheck](/blue-card-check).

## Der Ablauf Schritt für Schritt

1. **Bedarf klären:** Stellenprofil, Qualifikation, erforderliches Deutschniveau, Arbeitsort und Startdatum.
2. **Kandidatenauswahl:** Vorauswahl in Aserbaidschan, Prüfung von Zeugnissen und Berufserfahrung, Interviews per Video, auf Wunsch Probeaufgaben.
3. **Anerkennung prüfen:** Ist der Beruf reglementiert (z. B. Pflege) oder wird für § 18a/§ 18b eine Anerkennung benötigt? Bei § 19c Abs. 2 entfällt das deutsche Anerkennungsverfahren.
4. **Arbeitsvertrag oder verbindliches Angebot** sowie das Formular „Erklärung zum Beschäftigungsverhältnis" für die BA.
5. **Optional: beschleunigtes Fachkräfteverfahren nach § 81a** bei der zuständigen Ausländerbehörde.
6. **Visumantrag** der Fachkraft bei der Deutschen Botschaft in Baku (nationales Visum, Gebühr 75 €). Je nach Visumkategorie läuft der Antrag über das Auslandsportal des Auswärtigen Amts (digital.diplo.de) oder über einen externen Dienstleister der Botschaft; welcher Weg gilt, steht im jeweiligen Merkblatt auf [baku.diplo.de](https://baku.diplo.de).
7. **Einreise und Start:** Wohnung, Anmeldung, Krankenkasse, Konto und Aufenthaltstitel bei der Ausländerbehörde vor Ablauf des Visums.

### Wie lange dauert es?

Rechnen Sie erfahrungsgemäß je nach Weg mit **3 bis 9 Monaten** von der Auswahl bis zum ersten Arbeitstag; ist zuerst ein Anerkennungsverfahren nötig, oft auch länger. Garantieren kann diese Zeiten niemand. Den größten Einfluss haben Anerkennungsverfahren, Sprachstand der Kandidaten und die Terminlage der Botschaft. Mit dem beschleunigten Fachkräfteverfahren werden die Behördenschritte an feste Fristen gebunden – mehr dazu im [Leitfaden zu § 81a](guide:fast-track-81a).

## Kostenpositionen im Überblick

Feste Gesamtbeträge lassen sich seriös nicht nennen, weil sie von Beruf, Weg und Umfang der Unterstützung abhängen. Planen Sie folgende Positionen ein:

- **Behördengebühren:** Gebühr für das beschleunigte Fachkräfteverfahren (falls genutzt), Visumgebühr, Gebühren der Anerkennungsstelle (in der Regel mehrere hundert Euro; die genaue Höhe legt die zuständige Stelle fest).
- **Übersetzungen und Beglaubigungen:** Zeugnisse, Diplome, ggf. Apostille für Personenstandsurkunden.
- **Sprachförderung:** Kurse bis zum geforderten Niveau, später berufsbezogenes Deutsch.
- **Anreise und Unterkunft:** Flug, ggf. Übergangswohnung, Kaution (gesetzlich höchstens drei Nettokaltmieten).
- **Einarbeitung:** Zeit von Kolleginnen und Kollegen, Patenschaften, ggf. Freistellungen für Kurse oder Prüfungen.
- **Dienstleistung:** Kosten für Auswahl, Begleitung und Integration – unsere Leistungspakete finden Sie unter [Pakete](/packages).

Ob Sie einzelne Kosten übernehmen oder mit der Fachkraft teilen, entscheiden Sie selbst. Klare, schriftliche Absprachen vermeiden spätere Konflikte.

## Ihre Pflichten als Arbeitgeber

- **Gleichwertige Bedingungen:** Lohn und Arbeitsbedingungen dürfen nicht ungünstiger sein als bei vergleichbaren inländischen Beschäftigten. Mindestlohn 2026: 13,90 € pro Stunde.
- **Angaben gegenüber der BA:** Die „Erklärung zum Beschäftigungsverhältnis" muss vollständig und richtig sein; Änderungen wie Gehalt oder Tätigkeit können eine neue Zustimmung erfordern.
- **Mitteilungspflicht:** Endet das Beschäftigungsverhältnis vorzeitig, informieren Sie die Ausländerbehörde innerhalb von vier Wochen (§ 4a Abs. 5 AufenthG).
- **Aufbewahrung:** Eine Kopie des Aufenthaltstitels gehört für die Dauer der Beschäftigung zur Personalakte.

## Integration: der unterschätzte Erfolgsfaktor

Ob eine Einstellung langfristig gelingt, entscheidet sich oft in den ersten Wochen. Aus der Praxis sind folgende Punkte besonders wichtig:

- **Wohnraum:** Hilfe bei der Wohnungssuche ist einer der wichtigsten Faktoren überhaupt – ohne Wohnung keine Anmeldung, ohne Anmeldung keine Steuer-ID.
- **Paten im Betrieb:** Eine feste Ansprechperson für Fragen zu Arbeit, Behörden und Alltag.
- **Sprachförderung:** Kurse während oder nahe der Arbeitszeit; Geduld in den ersten Monaten.
- **Familie:** Ehepartner von Fachkräften und Inhabern der Blauen Karte brauchen seit 2024 keine Deutschkenntnisse für den Nachzug, ein Wohnraumnachweis entfällt für diese Gruppen. Details im [Leitfaden Familiennachzug](guide:familiennachzug).

## Wie Triad Vision Sie unterstützt

Triad Vision hat Büros in Baku und Berlin. Wir übernehmen die Vorauswahl von Kandidatinnen und Kandidaten in Aserbaidschan, prüfen Unterlagen und Deutschkenntnisse, organisieren Interviews und begleiten das Visumverfahren bis zur Ankunft. Einen Überblick bieten die Seiten [Für Arbeitgeber](/for-employers), [Arbeitgeber-Service](/services/employer-services) und [Kandidatenauswahl](/services/candidate-selection). Eine Garantie für eine Visumerteilung kann niemand geben – wir sorgen aber dafür, dass Anträge vollständig und gut vorbereitet sind.

## Nächster Schritt

Sie möchten wissen, welcher Weg für Ihre offenen Stellen realistisch ist? [Buchen Sie ein kostenloses Beratungsgespräch](/booking) – wir besprechen Profil, Zeitplan und Ablauf mit Ihnen.`,
    faq: [
      {
        q: 'Brauchen Fachkräfte aus Aserbaidschan immer eine Anerkennung ihres Abschlusses?',
        a: 'Für § 18a und § 18b ist eine Anerkennung bzw. Vergleichbarkeit des Abschlusses nötig, in reglementierten Berufen wie der Pflege ohnehin. Über den erfahrungsbasierten Weg nach § 19c Abs. 2 genügt ein im Herkunftsstaat anerkannter Abschluss mit Berufserfahrung, wenn Gehaltsgrenze oder Tarifbindung erfüllt sind.',
      },
      {
        q: 'Wie lange dauert die Einstellung einer Fachkraft aus Aserbaidschan?',
        a: 'Je nach Weg meist 3 bis 9 Monate von der Auswahl bis zum Arbeitsbeginn. Anerkennung, Sprachstand und Termine bei der Botschaft in Baku bestimmen die Dauer am stärksten.',
      },
      {
        q: 'Lohnt sich das beschleunigte Fachkräfteverfahren?',
        a: 'Oft ja, wenn eine Anerkennung nötig ist oder der Zeitplan eng ist, weil Behörden an Fristen gebunden sind. Es kostet eine zusätzliche Gebühr und setzt eine Vollmacht der Fachkraft voraus.',
      },
      {
        q: 'Muss ich der Fachkraft Wohnung und Flug bezahlen?',
        a: 'Gesetzlich nicht. Unterstützung bei der Wohnungssuche erhöht aber die Erfolgsquote deutlich. Halten Sie Absprachen über übernommene Kosten schriftlich fest.',
      },
      {
        q: 'Welche Pflichten habe ich nach der Einstellung?',
        a: 'Sie müssen vergleichbare Arbeitsbedingungen bieten und der Ausländerbehörde innerhalb von vier Wochen mitteilen, wenn die Beschäftigung vorzeitig endet. Wesentliche Änderungen der Tätigkeit sollten Sie vorher prüfen lassen.',
      },
    ],
  },

  'employer-drivers': {
    slug: 'berufskraftfahrer-aus-drittstaaten',
    title: 'Berufskraftfahrer aus Drittstaaten einstellen 2026',
    description:
      'LKW-Fahrer aus dem Ausland einstellen: § 24a BeschV, Führerschein-Umschreibung, Schlüsselzahl 95, Fahrerkarte, Zeitplan und Kosten für Speditionen.',
    body: `Der Mangel an Berufskraftfahrerinnen und -fahrern trifft Speditionen, Logistikdienstleister und Werkverkehre gleichermaßen. Viele Unternehmen suchen deshalb LKW-Fahrer aus Drittstaaten. Das ist möglich – aber anders als bei vielen anderen Berufen hängt der Erfolg nicht nur am Visum, sondern vor allem an **Fahrerlaubnis und Berufskraftfahrerqualifikation**. Dieser Leitfaden zeigt, was Sie als Arbeitgeber 2026 wissen müssen, wenn Sie Fahrer aus Aserbaidschan oder anderen Drittstaaten einstellen wollen.

Alle Angaben dienen der Orientierung. Maßgeblich sind die Entscheidungen von Ausländerbehörde, Bundesagentur für Arbeit, Fahrerlaubnisbehörde und IHK.

## Rechtsgrundlage: § 19c AufenthG und § 24a BeschV

Für Berufskraftfahrer aus Drittstaaten gibt es in der Beschäftigungsverordnung eine eigene Regelung: **§ 24a BeschV**. Der Aufenthaltstitel wird nach **§ 19c Abs. 1 AufenthG** erteilt, die Bundesagentur für Arbeit muss zustimmen. Voraussetzung ist im Kern, dass der Fahrer die in der EU erforderliche Fahrerlaubnis und Berufskraftfahrerqualifikation besitzt (§ 24a Abs. 1 BeschV) oder diese in Deutschland erwirbt (§ 24a Abs. 2 BeschV). Für den zweiten Fall muss der Arbeitsvertrag zur Teilnahme an den nötigen Maßnahmen verpflichten, Fahrerlaubnis und Qualifikation müssen innerhalb von **15 Monaten** erreichbar sein, danach muss ein konkretes Arbeitsplatzangebot beim selben Arbeitgeber bestehen, und der Fahrer muss die einschlägige Fahrerlaubnis seines Herkunftslandes nachweisen. Die Zustimmung wird dann für bis zu 15 Monate erteilt, im begründeten Einzelfall für bis zu sechs weitere Monate. Eine Vorrangprüfung sieht § 24a BeschV nicht vor.

Wichtig für Ihre Planung: Die Zustimmung der BA bezieht sich auf einen konkreten Arbeitsplatz mit konkreten Bedingungen. Lohn und Arbeitsbedingungen müssen denen vergleichbarer inländischer Fahrer entsprechen.

## Fahrerlaubnis: Umschreibung des ausländischen Führerscheins

Ein ausländischer Führerschein berechtigt nach Begründung des ordentlichen Wohnsitzes in Deutschland nur für **sechs Monate** zum Fahren (§ 29 FeV). Für die gewerbliche Güterbeförderung reicht das nicht: Hier brauchen Fahrer eine EU-Fahrerlaubnis der Klasse C/CE mit eingetragener Schlüsselzahl 95.

Aserbaidschan gehört nicht zu den Staaten der Anlage 11 FeV. Für die Umschreibung eines aserbaidschanischen Führerscheins sind deshalb für jede Klasse **theoretische und praktische Prüfungen** in Deutschland erforderlich; eine Pflichtausbildung in der Fahrschule ist dabei nicht vorgeschrieben (§ 31 Abs. 2 FeV). Hinzu kommen für die Klassen C/CE:

- ärztliche Untersuchung und Sehtest (Anlagen 5 und 6 FeV),
- Erste-Hilfe-Nachweis,
- Antrag bei der Fahrerlaubnisbehörde am Wohnort, inkl. Übersetzung des Führerscheins.

Planen Sie realistisch: Auch erfahrene Fahrer brauchen Vorbereitung auf deutsche Prüfungsfragen, Verkehrsregeln und Fachbegriffe. Eine Fahrschule, die mit internationalen Fahrern arbeitet, spart Zeit.

## Berufskraftfahrerqualifikation nach BKrFQG (Schlüsselzahl 95)

Wer gewerblich Güter mit Fahrzeugen über 3,5 t befördert, braucht die Qualifikation nach dem **Berufskraftfahrerqualifikationsgesetz (BKrFQG)**. Sie wird mit der **Schlüsselzahl 95** im Führerschein eingetragen. Zwei Wege:

| Weg | Inhalt | Prüfung |
|---|---|---|
| Grundqualifikation | Umfassende Prüfung ohne Pflichtunterricht | Theoretische und praktische Prüfung bei der IHK |
| Beschleunigte Grundqualifikation | 140 Stunden Unterricht in einer anerkannten Ausbildungsstätte | 90-minütige theoretische Prüfung bei der IHK |

In der Praxis wählen die meisten Unternehmen die **beschleunigte Grundqualifikation**. Danach gilt: alle fünf Jahre **35 Stunden Weiterbildung**. Seit der Änderung der Berufskraftfahrerqualifikationsverordnung im August 2026 bieten die IHKs die theoretische Prüfung neben Deutsch auch in neun Fremdsprachen an: Albanisch, Englisch, Hocharabisch, Kroatisch, Polnisch, Rumänisch, Russisch, Türkisch und Ukrainisch. Die Fremdsprache gilt nur für Prüfungsfragen und Antworten; Anmeldung, Einladung und Belehrung laufen auf Deutsch. Aserbaidschanisch ist nicht dabei, für viele Fahrer aus Aserbaidschan sind Russisch oder Türkisch aber eine gute Wahl. Ab wann Ihre IHK die Sprachen anbietet, nennt sie bei der Anmeldung.

### Fahrerkarte

Für Fahrzeuge mit digitalem oder intelligentem Tachografen braucht jeder Fahrer eine persönliche **Fahrerkarte**. Sie wird nach der Wohnsitznahme in Deutschland bei der zuständigen Behörde beantragt. Planen Sie die Bearbeitungszeit ein, bevor der Fahrer allein auf Tour geht.

## Deutschkenntnisse

Gesetzlich ist für § 24a BeschV kein bestimmtes Sprachniveau vorgeschrieben. Praktisch sollten Fahrer mindestens **A2** mitbringen: für Ladestellen, Disposition, Kontrollen, Sicherheitsunterweisungen und die Prüfungen. Für Fahrerkarte, Kontrollen und Unfallsituationen zählt vor allem verständliches Alltags- und Fachdeutsch. Unterstützung beim Spracherwerb finden Sie unter [Deutschkurse](/services/german-courses).

## Typischer Zeitplan

Ein möglicher Ablauf – die Dauer hängt stark von Behörden, Fahrschulen und IHK-Terminen ab. Erfahrungsgemäß dauert das Visumverfahren einige Wochen bis wenige Monate, Umschreibung und beschleunigte Grundqualifikation nach der Einreise zusammen meist mehrere Monate; nach § 24a Abs. 2 BeschV muss beides innerhalb von 15 Monaten möglich sein:

1. **Auswahl** erfahrener C/CE-Fahrer in Aserbaidschan, Prüfung von Führerschein, Fahrpraxis und Arbeitszeugnissen.
2. **Arbeitsvertrag** und „Erklärung zum Beschäftigungsverhältnis" für die BA.
3. **Visumverfahren** bei der Deutschen Botschaft in Baku, ggf. über das [beschleunigte Fachkräfteverfahren](guide:fast-track-81a).
4. **Einreise**, Anmeldung, Krankenkasse, Konto.
5. **Führerschein-Umschreibung** mit Prüfungen.
6. **Beschleunigte Grundqualifikation** und IHK-Prüfung, Eintrag der Schlüsselzahl 95.
7. **Fahrerkarte** beantragen, Einarbeitung mit Beifahrer, dann eigenständige Touren.

Zwischen Einreise und eigenständigem Fahren vergehen oft mehrere Monate. Überlegen Sie, wie Sie diese Zeit sinnvoll überbrücken – etwa mit Lager- oder Hoftätigkeiten, soweit der Aufenthaltstitel das zulässt.

## Kostenpositionen

Konkrete Beträge hängen von Region, Fahrschule und Ausbildungsstätte ab. Planen Sie ein:

- Fahrschule und Prüfungsgebühren für die Umschreibung,
- ärztliche Untersuchung, Sehtest, Erste-Hilfe-Kurs,
- Kurs und IHK-Prüfung der beschleunigten Grundqualifikation,
- Fahrerkarte,
- Übersetzungen, Visumgebühr (75 €), ggf. Gebühr für § 81a,
- Lohnkosten in der Qualifizierungsphase,
- Unterkunft und Einarbeitung.

Viele Unternehmen vereinbaren Rückzahlungsklauseln für Qualifizierungskosten. Diese müssen arbeitsrechtlich angemessen sein – lassen Sie Vertragsklauseln prüfen.

## Was gute Arbeitgeber anders machen

- **Realistische Tourenplanung** zu Beginn: Nahverkehr oder Begleitung vor Fernverkehr.
- **Feste Ansprechperson** in der Disposition, die einfache Sprache spricht.
- **Unterkunft** in Betriebsnähe oder Hilfe bei der Wohnungssuche.
- **Transparente Lohnabrechnung**, inkl. Spesen und Zuschlägen – Unklarheiten sind ein häufiger Kündigungsgrund.

Die Fahrerperspektive beschreibt unsere Seite [LKW-Fahrer](/visas/lkw-fahrer); für Zustellfahrer mit Klasse B gibt es [Kurierfahrer](/visas/kurierfahrer).

## Checkliste vor der ersten Einstellung

- Ist die Stelle konkret beschrieben (Fahrzeugklasse, Touren, Arbeitszeit, Lohn, Spesen)?
- Wer begleitet den Fahrer zu Fahrerlaubnisbehörde, Fahrschule und IHK?
- Ist eine Ausbildungsstätte für die beschleunigte Grundqualifikation gefunden und sind Termine reserviert?
- Gibt es eine Unterkunft für die ersten Monate?
- Ist geklärt, welche Tätigkeit der Fahrer bis zum Eintrag der Schlüsselzahl 95 ausübt?

Wenn Sie diese Fragen vor der Auswahl beantworten, verkürzt sich die Zeit bis zur ersten eigenständigen Tour spürbar – und Sie vermeiden, dass ein motivierter Fahrer monatelang ohne klare Aufgabe wartet.

## Unterstützung durch Triad Vision

Wir wählen in Aserbaidschan Fahrer mit nachweisbarer C/CE-Praxis aus, prüfen Unterlagen, bereiten auf Sprache und Prüfungen vor und begleiten Visum und Ankunft. Mehr unter [Für Arbeitgeber](/for-employers) und [Arbeitgeber-Service](/services/employer-services). [Vereinbaren Sie ein kostenloses Beratungsgespräch](/booking) – wir planen mit Ihnen einen realistischen Zeitplan für Ihre Fahrerstellen.`,
    faq: [
      {
        q: 'Darf ein Fahrer aus Aserbaidschan mit seinem Führerschein in Deutschland LKW fahren?',
        a: 'Für die gewerbliche Güterbeförderung nicht dauerhaft. Er braucht eine EU-Fahrerlaubnis der Klasse C/CE und die Schlüsselzahl 95; ein aserbaidschanischer Führerschein wird mit theoretischer und praktischer Prüfung umgeschrieben.',
      },
      {
        q: 'Was ist die beschleunigte Grundqualifikation?',
        a: 'Ein Weg zur Berufskraftfahrerqualifikation nach BKrFQG: 140 Stunden Unterricht in einer anerkannten Ausbildungsstätte und eine 90-minütige theoretische Prüfung bei der IHK. Danach wird die Schlüsselzahl 95 eingetragen.',
      },
      {
        q: 'Welche Rechtsgrundlage gilt für Berufskraftfahrer aus Drittstaaten?',
        a: 'Der Aufenthaltstitel wird nach § 19c Abs. 1 AufenthG in Verbindung mit § 24a BeschV erteilt, die Bundesagentur für Arbeit muss zustimmen. Die Bedingungen müssen denen inländischer Fahrer entsprechen.',
      },
      {
        q: 'Wie gut müssen die Fahrer Deutsch sprechen?',
        a: 'Ein festes Niveau schreibt § 24a BeschV nicht vor. Praktisch ist mindestens A2 sinnvoll, für Prüfungen, Disposition, Ladestellen und Kontrollen.',
      },
      {
        q: 'Wie lange dauert es, bis ein Fahrer selbstständig fährt?',
        a: 'Nach der Einreise vergehen meist mehrere Monate für Umschreibung, Qualifikation und Fahrerkarte. Die Dauer hängt von Fahrschulen, IHK-Terminen und Behörden ab.',
      },
    ],
  },

  'employer-nursing': {
    slug: 'pflegekraefte-aus-dem-ausland',
    title: 'Pflegekräfte aus dem Ausland einstellen: Leitfaden 2026',
    description:
      'Ausländische Pflegekräfte einstellen: Anerkennung, Defizitbescheid, Kenntnisprüfung, Anerkennungspartnerschaft nach § 16d, Sprachniveau und Ablauf 2026.',
    body: `Kliniken, Pflegeheime und ambulante Dienste besetzen offene Stellen zunehmend mit Pflegekräften aus dem Ausland. Das gelingt dann gut, wenn Einrichtungen die Besonderheiten kennen: Pflege ist ein **reglementierter Beruf**, die Anerkennung läuft über das Bundesland, und Sprache ist der Schlüssel für Patientensicherheit und Teamintegration. Dieser Leitfaden richtet sich an Pflegedienstleitungen, Personalabteilungen und Geschäftsführungen, die Pflegefachpersonen aus Aserbaidschan oder anderen Drittstaaten gewinnen wollen.

Die Angaben dienen der Orientierung; maßgeblich sind die zuständigen Landesbehörden, die Ausländerbehörde und die Botschaft.

## Pflege als reglementierter Beruf

Wer als Pflegefachfrau oder Pflegefachmann arbeiten will, braucht die staatliche Erlaubnis zum Führen der Berufsbezeichnung. Zuständig ist die Anerkennungsstelle im **Bundesland des künftigen Arbeitsorts** – je nach Land ein Landesamt, Regierungspräsidium oder Landesprüfungsamt. Für Sie als Arbeitgeber heißt das: Der Arbeitsort sollte früh feststehen, denn ein Wechsel des Bundeslands im Verfahren kostet Zeit.

Typische Unterlagen für die Anerkennung:

- Diplom und Fächer- bzw. Stundenübersicht (Theorie und Praxis getrennt),
- Berufserlaubnis aus dem Herkunftsland, falls vorhanden,
- Nachweise über Berufserfahrung,
- Lebenslauf, Pass, beglaubigte Übersetzungen.

Die Gebühren unterscheiden sich je nach Bundesland und Behörde; erfahrungsgemäß liegen sie bei mehreren hundert Euro, hinzu kommen Übersetzungen und Beglaubigungen. Die genaue Höhe nennt die zuständige Anerkennungsstelle. Allgemeine Informationen bietet [Anerkennung in Deutschland](https://www.anerkennung-in-deutschland.de) sowie unser [Leitfaden zur Anerkennung](guide:anerkennung).

## Defizitbescheid und Ausgleichsmaßnahmen

Die Behörde vergleicht die ausländische Ausbildung mit der deutschen. In vielen Fällen ergibt sich ein **Defizitbescheid**, der wesentliche Unterschiede benennt – etwa fehlende Praxisstunden in bestimmten Bereichen. Berufserfahrung kann Unterschiede ausgleichen und sollte deshalb gut dokumentiert werden.

### Kenntnisprüfung oder Anpassungslehrgang?

| | Kenntnisprüfung | Anpassungslehrgang |
|---|---|---|
| Form | Mündliche und praktische Prüfung | Theorie und Praxis, Abschlussgespräch |
| Dauer | Mit Vorbereitungskurs oft wenige Monate | Häufig 6–12 Monate |
| Vorteil | Schneller zur vollen Anerkennung | Strukturierter, weniger Prüfungsdruck |
| Herausforderung | Hohe Anforderungen an Fachsprache | Längere Zeit als Hilfskraft |

Welche Maßnahme sinnvoll ist, hängt vom Defizitbescheid, vom Sprachstand und von Ihrer Einrichtung ab. Viele Häuser kombinieren einen externen Vorbereitungskurs mit Praxisanleitung im eigenen Betrieb.

## Aufenthaltswege für Pflegekräfte

- **§ 16d AufenthG – Anerkennungsmaßnahmen:** Einreise mit einem Defizitbescheid, Ausgleichsmaßnahme in Deutschland. Bis zur Anerkennung arbeitet die Person in der Regel als Pflegehilfskraft.
- **§ 16d Abs. 3 – Anerkennungspartnerschaft (seit 2024):** Arbeitsvertrag und Einreise, bevor das Anerkennungsverfahren abgeschlossen ist. Voraussetzungen sind u. a. Deutsch auf Niveau **A2**, ein im Herkunftsstaat staatlich anerkannter Abschluss mit mindestens zweijähriger Ausbildung und Ihre Verpflichtung, das Anerkennungsverfahren zu ermöglichen.
- **§ 18a AufenthG:** Nach voller Anerkennung die Aufenthaltserlaubnis als Fachkraft; Umstellung im Inland nach erfolgreicher Ausgleichsmaßnahme.
- **§ 16a AufenthG – Ausbildung:** Für jüngere Bewerber ohne Pflegeabschluss die generalistische Pflegeausbildung, siehe [Azubis aus dem Ausland](guide:employer-apprentices).

Für die Behördenschritte kann das [beschleunigte Fachkräfteverfahren](guide:fast-track-81a) sinnvoll sein: Die Ausländerbehörde koordiniert dann auch das Anerkennungsverfahren.

## Sprachniveau

Für die Berufserlaubnis verlangen die Behörden in der Regel **Deutsch auf B2** (GER), häufig nachgewiesen über eine pflegebezogene Fachsprachprüfung; welcher Nachweis genau anerkannt wird, legt die zuständige Landesbehörde fest. Für den Einstieg über § 16d genügen oft niedrigere Niveaus, für die Anerkennungspartnerschaft A2. Planen Sie deshalb eine **Sprachförderung nach der Einreise** fest ein:

- Fachsprachkurs während der Arbeitszeit,
- Praxisanleitung mit bewusst einfacher Sprache,
- Zeit für Prüfungsvorbereitung im Dienstplan.

## Einsatz als Pflegehilfskraft bis zur Anerkennung

Bis zur vollen Anerkennung dürfen Pflegekräfte keine Tätigkeiten ausüben, die Fachkräften vorbehalten sind. Sie arbeiten als Pflegehilfskraft – mit entsprechender Vergütung, die den Bedingungen vergleichbarer Beschäftigter entsprechen muss. Klären Sie im Vorfeld:

- Welche Station oder welcher Bereich eignet sich für die Einarbeitung?
- Wer übernimmt die Praxisanleitung?
- Wie wird die Vergütung nach der Anerkennung angepasst?

Transparenz über diese Phase verhindert Enttäuschungen auf beiden Seiten.

## Faire Anwerbung

Für Einrichtungen, die Wert auf ethische Rekrutierung legen, lohnt ein Blick auf das staatlich anerkannte **Gütesiegel „Faire Anwerbung Pflege Deutschland"**. Es beschreibt Standards für transparente Kosten, Information der Pflegekräfte und Integration. Fragen Sie Vermittler, wie sie diese Grundsätze umsetzen – insbesondere, dass Pflegekräften keine unzulässigen Vermittlungskosten entstehen.

## Zeitplan realistisch planen

Wie lange es von der Auswahl bis zur anerkannten Pflegefachkraft dauert, hängt von Sprachstand, Unterlagen, Bundesland und Ausgleichsmaßnahme ab. Erfahrungsgemäß sollten Sie mit insgesamt **12 bis 24 Monaten** rechnen; mit guten Deutschkenntnissen und vollständigen Unterlagen geht es auch schneller. Ein grober Rahmen hilft bei der Planung:

1. **Auswahl und Unterlagen:** Interviews, Prüfung von Diplom und Stundenübersicht, Übersetzungen.
2. **Antrag auf Anerkennung** bei der Landesbehörde – direkt oder über das beschleunigte Verfahren.
3. **Sprachkurs** im Herkunftsland bis zum Einreiseniveau.
4. **Visumverfahren** bei der Deutschen Botschaft in Baku (Gebühr 75 €).
5. **Einreise und Einsatz als Pflegehilfskraft**, parallel Fachsprachkurs.
6. **Kenntnisprüfung oder Anpassungslehrgang**, danach Berufserlaubnis.
7. **Umstellung des Aufenthaltstitels** auf § 18a bei der Ausländerbehörde.

Je früher Sie Station, Praxisanleitung und Kursplätze reservieren, desto weniger Leerlauf entsteht nach der Ankunft.

## Kostenpositionen

Feste Beträge lassen sich nicht seriös nennen. Planen Sie Gebühren der Anerkennungsstelle, Übersetzungen, Sprach- und Vorbereitungskurse, die Freistellung für Kurse und Prüfungen, Visumgebühr und ggf. Unterstützung bei Anreise und Unterkunft ein. Klären Sie früh und schriftlich, welche Kosten Ihre Einrichtung übernimmt – faire, transparente Absprachen sind ein Kern ethischer Anwerbung.

## Integration und Bindung

- **Wohnung:** Unterstützung bei der Wohnungssuche ist einer der wichtigsten Erfolgsfaktoren.
- **Patenschaft:** Eine erfahrene Kollegin oder ein Kollege als feste Ansprechperson.
- **Team vorbereiten:** Kurzes Briefing zu Erwartungen, Sprache und kulturellen Unterschieden.
- **Familie:** Für Fachkräfte mit § 18a-Titel ist der Familiennachzug erleichtert, siehe [Familiennachzug](guide:familiennachzug).

Die Bewerberperspektive beschreibt unser [Leitfaden Pflege](guide:pflege) und die Seite [Pflege und Gesundheit](/visas/pflege-gesundheit).

## Unterstützung durch Triad Vision

Triad Vision wählt in Aserbaidschan Pflegefachpersonen aus, prüft Diplome und Stundenübersichten, begleitet Anerkennungsantrag und Visum und unterstützt bei der Ankunft. Mehr unter [Anerkennung](/services/recognition), [Arbeitgeber-Service](/services/employer-services) und [Für Arbeitgeber](/for-employers). [Buchen Sie ein kostenloses Beratungsgespräch](/booking) – wir prüfen gemeinsam, welcher Weg für Ihre Einrichtung passt.`,
    faq: [
      {
        q: 'Welches Deutschniveau brauchen ausländische Pflegekräfte?',
        a: 'Für die Berufserlaubnis verlangen die Behörden in der Regel B2. Für die Anerkennungspartnerschaft genügt bei der Einreise A2, der Sprachstand muss dann in Deutschland ausgebaut werden.',
      },
      {
        q: 'Was ist ein Defizitbescheid?',
        a: 'Der Bescheid der Anerkennungsstelle, der wesentliche Unterschiede zur deutschen Pflegeausbildung benennt. Sie werden durch eine Kenntnisprüfung oder einen Anpassungslehrgang ausgeglichen.',
      },
      {
        q: 'Was ist die Anerkennungspartnerschaft?',
        a: 'Seit 2024 kann eine Pflegekraft nach § 16d Abs. 3 AufenthG mit Arbeitsvertrag einreisen und arbeiten, während das Anerkennungsverfahren in Deutschland läuft. Der Arbeitgeber verpflichtet sich, die Anerkennung zu ermöglichen.',
      },
      {
        q: 'Dürfen Pflegekräfte vor der Anerkennung als Fachkraft arbeiten?',
        a: 'Nein. Bis zur Anerkennung arbeiten sie in der Regel als Pflegehilfskraft. Fachkraftaufgaben und die entsprechende Vergütung folgen nach der Berufserlaubnis.',
      },
      {
        q: 'Wie lange dauert die Anerkennung?',
        a: 'Das hängt von Bundesland, Unterlagen und Ausgleichsmaßnahme ab. Ein Anpassungslehrgang dauert häufig 6 bis 12 Monate, eine Kenntnisprüfung mit Vorbereitung oft weniger.',
      },
    ],
  },

  'employer-apprentices': {
    slug: 'azubis-aus-dem-ausland',
    title: 'Azubis aus dem Ausland gewinnen: Leitfaden 2026',
    description:
      'Auszubildende aus Drittstaaten einstellen: Visum nach § 16a, Deutsch B1, Vergütung und Lebensunterhalt, Zeitplanung, Kammer, Wohnen und Abbruchprävention.',
    body: `Jedes Jahr bleiben in Deutschland viele Ausbildungsplätze unbesetzt – besonders in Handwerk, Gastronomie, Logistik und Pflege. Auszubildende aus Drittstaaten sind für viele Betriebe eine echte Option: Sie lernen den Beruf im eigenen Betrieb, kennen die Abläufe von Anfang an und können nach dem Abschluss als Fachkraft bleiben. Dieser Leitfaden erklärt, wie Sie 2026 Azubis aus dem Ausland gewinnen, etwa aus Aserbaidschan – vom Visum nach § 16a AufenthG bis zur Frage, wie Sie Abbrüche vermeiden.

Die Bewerberperspektive beschreibt unser [Leitfaden Ausbildung](guide:ausbildung). Hier geht es um die Sicht des Ausbildungsbetriebs.

## Rechtsgrundlage: Visum zur Berufsausbildung nach § 16a

Grundlage ist ein **Ausbildungsvertrag** für eine qualifizierte Berufsausbildung in Deutschland. Die Bundesagentur für Arbeit stimmt in der Regel zu und prüft dabei die Ausbildungsbedingungen. Der Vertrag wird bei der zuständigen Stelle eingetragen – meist **IHK** oder **Handwerkskammer**.

Weitere Voraussetzungen:

- **Deutschkenntnisse:** Gesetzlich „ausreichend"; in der Praxis erwarten Betriebe und Berufsschulen meist **B1**, weil Unterricht und Prüfungen auf Deutsch stattfinden.
- **Schulabschluss:** Ein Schulabschluss wird vorausgesetzt; je nach Beruf und Betrieb kann eine Bewertung der Gleichwertigkeit sinnvoll sein.
- **Lebensunterhalt:** Vergütung und weitere Mittel müssen einen jährlich festgelegten Referenzbetrag decken. Für eine betriebliche oder schulische Ausbildung sind das 2026 **959 € im Monat** (Bekanntmachung des BMI zu § 2 Abs. 3 AufenthG); liegen Miete und Nebenkosten unter 380 €, sinkt der Betrag entsprechend. Reicht die Vergütung nicht, kann der Bewerber die Lücke z. B. mit einem Sperrkonto schließen – das verzögert das Verfahren aber häufig.
- **Krankenversicherung:** Ab Ausbildungsbeginn gesetzlich, davor meist eine Reisekrankenversicherung.

Seit 2024 dürfen Auszubildende **bis zu 20 Stunden pro Woche** nebenher arbeiten.

## Vergütung und Lebensunterhalt

Die gesetzliche Mindestausbildungsvergütung gilt für alle Auszubildenden – für Ausbildungen mit Beginn 2026 im ersten Jahr **724 €** im Monat (2. Jahr 854 €, 3. Jahr 977 €, 4. Jahr 1.014 €). Tarifverträge liegen oft deutlich darüber, in der Pflege etwa bei rund 1.300 € und mehr im ersten Jahr.

Für Bewerber aus dem Ausland ist die Vergütung doppelt wichtig: Sie entscheidet über den Nachweis des Lebensunterhalts und darüber, ob Miete und Alltag ohne Nebenjob finanzierbar sind. Prüfen Sie deshalb vor der Vertragsunterzeichnung:

- Erreicht die Vergütung den Referenzbetrag?
- Wie hoch ist die Miete am Ausbildungsort realistisch?
- Gibt es Zuschüsse, Wohnheimplätze oder eine Betriebswohnung?

Mit unserem [Gehaltsrechner](/salary-calculator) und der Seite [Städte](/cities) können Sie Netto und Lebenshaltungskosten grob überschlagen.

## Zeitplanung: rückwärts vom Ausbildungsbeginn

Die meisten Ausbildungen beginnen am **1. August oder 1. September**. Das Visumverfahren braucht Monate – planen Sie deshalb rückwärts:

| Zeitpunkt vor Beginn | Schritt |
|---|---|
| 9–12 Monate | Bedarf festlegen, Ausbildungsplätze ausschreiben, Kandidatensuche |
| 6–9 Monate | Interviews per Video, ggf. Probearbeit online oder Aufgaben |
| 5–7 Monate | Vertrag unterschreiben, Eintragung bei der Kammer, BA-Unterlagen |
| 3–5 Monate | Visumantrag in Baku (Gebühr 75 €); Termin- und Bearbeitungszeiten schwanken, erfahrungsgemäß einige Wochen bis wenige Monate |
| 1–2 Monate | Wohnung klären, Ankunft planen |
| Start | Anmeldung, Krankenkasse, Konto, Berufsschule |

Ist der Bewerber noch nicht auf B1, lohnt es sich, den Vertrag dennoch frühzeitig zu schließen und die Sprachprüfung parallel vorzubereiten – ein gebuchter Prüfungstermin gibt beiden Seiten Planungssicherheit.

## Welche Berufe sich besonders eignen

Grundsätzlich kommt jeder anerkannte Ausbildungsberuf in Frage. Besonders häufig gewinnen Betriebe internationale Azubis in der Pflege (Pflegefachfrau/-mann), in Hotellerie und Gastronomie (Koch/Köchin, Hotelfachleute), in Lager und Logistik (Fachkraft für Lagerlogistik, Berufskraftfahrer), im Bau und Handwerk sowie in Metall- und Elektroberufen. Entscheidend ist weniger die Branche als die Frage, ob Ihr Betrieb Zeit für Einarbeitung und Sprachförderung einplant.

## Auswahl: worauf es ankommt

- **Motivation für genau diesen Beruf** – nicht nur für Deutschland.
- **Deutsch im Gespräch** – ein Zertifikat sagt nicht alles; führen Sie Interviews teilweise auf Deutsch.
- **Realistisches Bild** von Arbeitszeiten, Schichten, Berufsschule und Wohnkosten.
- **Praktische Eignung** – kleine Aufgaben, Videos aus dem Arbeitsalltag oder eine Online-Probestunde.

## Wohnen: der häufigste Stolperstein

Ohne Wohnung keine Anmeldung, ohne Anmeldung kein Konto und keine Steuer-ID. Viele Abbrüche haben weniger mit dem Beruf als mit Wohnung und Alltag zu tun. Bewährt haben sich:

- Betriebswohnungen oder WG-Zimmer, die der Betrieb vermittelt,
- Azubi-Wohnheime,
- Hilfe bei Kaution und Möblierung, schriftlich vereinbart.

## Abbrüche vermeiden

- **Ansprechperson:** Ein Ausbildungspate, der nicht nur fachlich, sondern auch bei Alltagsfragen hilft.
- **Sprachförderung:** Berufsschulstoff ist sprachlich anspruchsvoll; Nachhilfe oder ausbildungsbegleitende Hilfen der BA früh nutzen.
- **Regelmäßige Gespräche** in den ersten Monaten, nicht erst bei Problemen.
- **Transparenz** über Vergütung, Abzüge und Überstunden.
- **Gemeinschaft:** Kontakt zu anderen Azubis, auch aus dem Herkunftsland, erleichtert das Ankommen.

## Die Rolle der Kammer und der Berufsschule

Die zuständige Stelle – meist IHK oder Handwerkskammer – trägt den Ausbildungsvertrag in das Verzeichnis der Berufsausbildungsverhältnisse ein. Viele Kammern haben Ansprechpersonen für internationale Auszubildende und kennen Förderprogramme in der Region. Sprechen Sie die Berufsschule frühzeitig an: Manche Schulen bieten Sprachförderklassen oder zusätzliche Deutschstunden an, andere vermitteln Lernpartnerschaften. Informieren Sie Ihre Ausbilderinnen und Ausbilder außerdem darüber, dass Fachbegriffe anfangs bewusst erklärt werden müssen – das zahlt sich spätestens bei der Zwischenprüfung aus.

## Nach der Ausbildung

Nach erfolgreichem Abschluss kann die Fachkraft direkt in eine Aufenthaltserlaubnis nach **§ 18a AufenthG** wechseln, wenn sie einen passenden Arbeitsplatz hat – idealerweise in Ihrem Betrieb. Ohne Arbeitsplatz erhält sie eine Aufenthaltserlaubnis zur Arbeitsplatzsuche für bis zu **18 Monate** (§ 20 Abs. 1 Nr. 3, Abs. 2 AufenthG), wenn der Lebensunterhalt gesichert ist. Ein Übernahmeangebot rechtzeitig vor der Abschlussprüfung bindet gute Azubis.

## Unterstützung durch Triad Vision

Wir suchen in Aserbaidschan motivierte Bewerberinnen und Bewerber, unterstützen beim Deutschlernen, bereiten Interviews vor und begleiten Vertrag, Visum und Ankunft. Mehr unter [Ausbildungsvermittlung](/services/ausbildung-placement), [Ausbildung](/ausbildung) und [Für Arbeitgeber](/for-employers). [Buchen Sie ein kostenloses Beratungsgespräch](/booking) – gemeinsam planen wir Ihren nächsten Ausbildungsjahrgang.`,
    faq: [
      {
        q: 'Welches Deutschniveau sollten Azubis aus dem Ausland haben?',
        a: 'Gesetzlich sind ausreichende Kenntnisse gefordert, in der Praxis meist B1, weil Berufsschule und Prüfungen auf Deutsch stattfinden. Sprachförderung nach der Ankunft bleibt trotzdem wichtig.',
      },
      {
        q: 'Wann sollte ich mit der Suche beginnen?',
        a: 'Für einen Ausbildungsbeginn im August oder September idealerweise 9 bis 12 Monate vorher. Das Visumverfahren allein dauert oft mehrere Monate.',
      },
      {
        q: 'Reicht die Ausbildungsvergütung für das Visum?',
        a: 'Die Vergütung muss zusammen mit anderen Mitteln einen jährlich festgelegten Referenzbetrag decken. Liegt sie darunter, muss der Bewerber die Differenz z. B. mit einem Sperrkonto nachweisen.',
      },
      {
        q: 'Dürfen ausländische Azubis nebenher arbeiten?',
        a: 'Ja, seit 2024 ist eine Nebenbeschäftigung von bis zu 20 Stunden pro Woche erlaubt. Die Ausbildung muss dabei Vorrang haben.',
      },
      {
        q: 'Kann der Azubi nach der Ausbildung bei mir bleiben?',
        a: 'Ja. Mit einem passenden Arbeitsplatz ist der direkte Wechsel in die Aufenthaltserlaubnis als Fachkraft nach § 18a möglich.',
      },
    ],
  },

  'fast-track-81a': {
    slug: 'beschleunigtes-fachkraefteverfahren-81a',
    title: 'Beschleunigtes Fachkräfteverfahren § 81a: Ablauf 2026',
    description:
      'Beschleunigtes Fachkräfteverfahren nach § 81a AufenthG: Voraussetzungen, Ablauf, Fristen, Gebühr, Vollmacht und typische Fehler – für Arbeitgeber erklärt.',
    body: `Wer eine Fachkraft aus einem Drittstaat einstellen will, wartet oft am längsten auf Behörden: auf die Anerkennung des Abschlusses, die Zustimmung der Bundesagentur für Arbeit und einen Termin bei der Botschaft. Das **beschleunigte Fachkräfteverfahren nach § 81a AufenthG** soll diese Schritte bündeln und an Fristen binden. Dieser Leitfaden erklärt, wie das Verfahren 2026 funktioniert, was es kostet, wann es sich lohnt – und welche Fehler Zeit kosten.

Die Darstellung ist eine Orientierung. Verbindlich sind die Auskünfte der zuständigen Ausländerbehörde.

## Was ist das beschleunigte Fachkräfteverfahren?

Beim beschleunigten Verfahren stellt **der Arbeitgeber** – nicht die Fachkraft – den Antrag bei der zuständigen Ausländerbehörde im Inland. In vielen Bundesländern gibt es dafür **zentrale Ausländerbehörden** für Fachkräfteeinwanderung. Die Behörde koordiniert dann die beteiligten Stellen und erteilt am Ende eine **Vorabzustimmung** zur Visumerteilung. Mit dieser Vorabzustimmung beantragt die Fachkraft ihr Visum bei der Botschaft, etwa in Baku.

Das Verfahren steht für mehrere Aufenthaltszwecke offen, unter anderem:

- Fachkräfte nach § 18a und § 18b sowie die Blaue Karte EU,
- Beschäftigung mit ausgeprägter berufspraktischer Erfahrung nach § 19c Abs. 2,
- Anerkennungsmaßnahmen nach § 16d,
- Berufsausbildung nach § 16a,
- den Familiennachzug, wenn er mit dem Antrag der Fachkraft verbunden wird.

## Voraussetzungen

- Ein **konkretes Arbeits- oder Ausbildungsplatzangebot** in Deutschland.
- Eine **Vollmacht** der Fachkraft, mit der Sie das Verfahren in ihrem Namen führen.
- Eine **Vereinbarung** zwischen Ihnen und der Ausländerbehörde, in der Pflichten, Unterlagen und Abläufe festgehalten werden.
- **Vollständige Unterlagen** der Fachkraft: Pass, Abschlüsse, Fächerübersichten, Nachweise der Berufserfahrung, ggf. Sprachzertifikate – jeweils mit Übersetzungen.
- Das ausgefüllte Formular **„Erklärung zum Beschäftigungsverhältnis"** für die Bundesagentur für Arbeit.

## Ablauf Schritt für Schritt

1. **Vorbereitung:** Klären Sie mit der Fachkraft den Aufenthaltszweck und sammeln Sie alle Unterlagen. Lassen Sie sich die Vollmacht unterschreiben.
2. **Antrag und Vereinbarung:** Sie wenden sich an die zuständige Ausländerbehörde, schließen die Vereinbarung und reichen die Unterlagen ein.
3. **Anerkennung:** Ist eine Anerkennung nötig, leitet die Ausländerbehörde das Verfahren an die zuständige Stelle weiter. Diese soll innerhalb von **zwei Monaten** nach Vorliegen der vollständigen Unterlagen entscheiden.
4. **Zustimmung der BA:** Die Bundesagentur für Arbeit entscheidet im beschleunigten Verfahren in der Regel innerhalb von **einer Woche**.
5. **Vorabzustimmung:** Liegen alle Voraussetzungen vor, erteilt die Ausländerbehörde die Vorabzustimmung und leitet sie an die Auslandsvertretung weiter.
6. **Visumtermin:** Die Botschaft soll der Fachkraft innerhalb von **drei Wochen** einen Termin anbieten (§ 31a AufenthV). Wie die Fachkraft den Termin anfragt, steht im Merkblatt der Botschaft auf [baku.diplo.de](https://baku.diplo.de).
7. **Visumentscheidung:** Über den vollständigen Antrag entscheidet die Botschaft in der Regel innerhalb von **drei Wochen**.
8. **Einreise:** Nach der Ankunft beantragt die Fachkraft den Aufenthaltstitel bei der örtlichen Ausländerbehörde.

## Kosten

Für das beschleunigte Fachkräfteverfahren erhebt die Ausländerbehörde eine Gebühr von **411 €** (§ 47 Abs. 1 Nr. 15 AufenthV). Hinzu kommen:

- die Visumgebühr der Fachkraft (75 €),
- Gebühren des Anerkennungsverfahrens (in der Regel mehrere hundert Euro, festgelegt von der zuständigen Stelle),
- Übersetzungen und Beglaubigungen,
- ggf. Kosten für Sprachzertifikate.

Wer welche Kosten trägt, ist gesetzlich nicht vorgegeben – regeln Sie das vorab schriftlich.

## Wann lohnt sich das Verfahren – und wann nicht?

**Sinnvoll ist es,**

- wenn eine **Anerkennung** erforderlich ist, weil die Ausländerbehörde das Verfahren koordiniert und Fristen gelten,
- wenn der **Starttermin** fest steht, etwa für einen Ausbildungsbeginn oder eine Saison,
- wenn Sie **mehrere Fachkräfte** einstellen und eine eingespielte Zusammenarbeit mit der Behörde aufbauen wollen,
- wenn Wartezeiten auf reguläre Visumtermine lang sind.

**Weniger Vorteile bringt es,**

- wenn keine Anerkennung nötig ist und reguläre Termine bei der Botschaft kurzfristig verfügbar sind,
- wenn Unterlagen noch unvollständig sind – Fristen beginnen erst mit vollständigen Unterlagen,
- wenn Sie intern niemanden haben, der das Verfahren aktiv betreut.

## Ihre Rolle als Arbeitgeber im Verfahren

Im beschleunigten Verfahren sind Sie die zentrale Ansprechperson der Behörde. Benennen Sie intern eine verantwortliche Person, die Rückfragen schnell beantwortet, Unterlagen nachreicht und die Fachkraft über den Stand informiert. Rückfragen der Anerkennungsstelle oder der Bundesagentur für Arbeit sollten innerhalb weniger Tage beantwortet werden, sonst geht der Zeitvorteil verloren.

## Typische Fehler

- **Unvollständige Unterlagen:** Fehlende Fächerübersichten oder Arbeitszeugnisse stoppen die Fristen.
- **Unklare Stellenbeschreibung:** Tätigkeit, Gehalt und Arbeitszeit müssen in Vertrag und BA-Erklärung übereinstimmen.
- **Gehalt unter der Schwelle:** Bei der Blauen Karte (2026: 50.700 € bzw. 45.934,20 €), beim erfahrungsbasierten Weg nach § 19c Abs. 2 (45.630 €) oder bei Bewerbern ab 45 Jahren (55.770 €) entscheidet das Bruttojahresgehalt. Prüfen Sie es mit unserem [Blaue-Karte-Check](/blue-card-check).
- **Falscher Ansprechpartner:** Zuständig ist die Behörde am Sitz der Betriebsstätte bzw. die zentrale Stelle des Landes – nicht automatisch die Behörde am Wohnort der Geschäftsführung.
- **Vorabzustimmung verfallen lassen:** Die Fachkraft sollte den Visumtermin zeitnah wahrnehmen.

## Unterstützung durch Triad Vision

Wir stellen für Ihre künftigen Mitarbeitenden aus Aserbaidschan die vollständigen Unterlagen zusammen, die die Botschaft verlangt; den Visumantrag stellen die Fachkräfte selbst bei der Botschaft in Baku, die auch den Termin vergibt. Den Antrag nach § 81a stellen Sie als Arbeitgeber; wir unterstützen Sie dabei organisatorisch. Mehr dazu unter [Visumbegleitung](/services/visa-support), [Arbeitgeber-Service](/services/employer-services) und im Leitfaden [Fachkräfte aus Aserbaidschan](guide:employer-azerbaijan). [Buchen Sie ein kostenloses Beratungsgespräch](/booking) – wir prüfen, ob sich das beschleunigte Verfahren für Ihre Stelle lohnt.`,
    faq: [
      {
        q: 'Wer stellt den Antrag im beschleunigten Fachkräfteverfahren?',
        a: 'Der Arbeitgeber, mit einer Vollmacht der Fachkraft, bei der zuständigen Ausländerbehörde in Deutschland. Die Fachkraft beantragt danach mit der Vorabzustimmung ihr Visum bei der Botschaft.',
      },
      {
        q: 'Wie viel kostet das beschleunigte Fachkräfteverfahren?',
        a: 'Die Gebühr beträgt 411 Euro (§ 47 Abs. 1 Nr. 15 AufenthV). Hinzu kommen Visumgebühr, Anerkennungsgebühren und Übersetzungen.',
      },
      {
        q: 'Welche Fristen gelten?',
        a: 'Die Anerkennungsstelle soll innerhalb von zwei Monaten entscheiden, die Bundesagentur für Arbeit in der Regel innerhalb einer Woche. Die Botschaft soll innerhalb von drei Wochen einen Termin anbieten und meist innerhalb von drei Wochen entscheiden.',
      },
      {
        q: 'Lohnt sich § 81a auch ohne Anerkennungsverfahren?',
        a: 'Manchmal. Der größte Vorteil liegt in der koordinierten Anerkennung und schnelleren Terminen. Sind reguläre Termine kurzfristig verfügbar, ist der Zeitgewinn geringer.',
      },
      {
        q: 'Gilt das Verfahren auch für Familienangehörige?',
        a: 'Ja, Ehepartner und minderjährige Kinder können in das Verfahren einbezogen werden, wenn ihre Anträge mit dem der Fachkraft verbunden werden.',
      },
    ],
  },
};
