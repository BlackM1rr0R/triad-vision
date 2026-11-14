import type { LocalizedContent } from './types';

/**
 * Text under the net salary calculator (/salary-calculator). Euro amounts come from the payroll parameters
 * ({{gfb}}, {{bbgRv}} …, see pages/tools/SalaryCalculator.tsx) and the worked examples from the payroll engine
 * itself (slot "examples", {{net3000}} …), so the text never disagrees with the calculator. Percentages are
 * written out; server/tests/unit/seoContent.test.ts checks them against server/src/lib/budget/params.ts.
 *
 * Sources (checked 2026-11): BMF Programmablaufplan Lohnsteuer 2026 (12.11.2025); Sozialversicherungs-
 * Rechengrößenverordnung 2026 (BR 21.11.2025); BMG Bekanntmachung § 242a SGB V (BAnz AT 10.11.2025 B7, 2.9 %);
 * § 38b, § 39c, § 51a EStG; § 3 SolZG; § 55 SGB XI; § 8, § 20 SGB IV.
 */
export const SALARY_EXAMPLES = [
  { id: 'truck', gross: 3_000, taxClass: 1, state: 'NW', children: 0, age: 30 },
  { id: 'truckVI', gross: 3_000, taxClass: 6, state: 'NW', children: 0, age: 30 },
  { id: 'nurse', gross: 3_500, taxClass: 1, state: 'BY', children: 0, age: 30 },
  { id: 'nurseIII', gross: 3_500, taxClass: 3, state: 'BY', children: 1, age: 30 },
  { id: 'electrician', gross: 3_200, taxClass: 1, state: 'BW', children: 0, age: 30 },
] as const;

export const salaryContent: LocalizedContent = {
  de: {
    eyebrow: 'Brutto-Netto 2026 erklärt',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'So wird aus Brutto Netto: Gehaltsabrechnung in Deutschland 2026',
        blocks: [
          'In Deutschland zieht der Arbeitgeber Steuern und Sozialversicherungsbeiträge jeden Monat direkt vom Bruttogehalt ab und überweist sie an Finanzamt und Krankenkasse. Auf Ihr Konto kommt nur das Netto. Der Rechner oben bildet genau diese Lohnabrechnung nach – mit den amtlichen Werten für 2026.',
          { ol: [
            '**Sozialabgaben**: Renten-, Arbeitslosen-, Kranken- und Pflegeversicherung werden als Prozentsatz des Bruttos berechnet, jeweils bis zur Beitragsbemessungsgrenze. Die Hälfte trägt (fast immer) der Arbeitgeber.',
            '**Lohnsteuer**: Sie richtet sich nach dem Einkommensteuertarif und Ihrer Steuerklasse. Steuerfrei bleiben 2026 der Grundfreibetrag von {{gfb}} im Jahr, der Arbeitnehmer-Pauschbetrag ({{anp}}) und eine Vorsorgepauschale für Ihre Versicherungsbeiträge.',
            '**Solidaritätszuschlag**: 5,5 % der Lohnsteuer – aber erst, wenn die Lohnsteuer im Jahr {{soliFree}} übersteigt (Ledige). Die allermeisten Arbeitnehmer zahlen deshalb keinen Soli.',
            '**Kirchensteuer**: 8 % (Bayern, Baden-Württemberg) oder 9 % (alle anderen Länder) der Lohnsteuer – nur für Mitglieder einer steuererhebenden Kirche.',
          ] },
          'Faustregel: Ein lediges Mitglied der gesetzlichen Krankenversicherung ohne Kinder behält bei {{gross3000}} brutto in Steuerklasse I rund {{net3000}} netto – etwa {{share3000}} des Bruttos.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'Die sechs Steuerklassen: wer bekommt welche?',
        blocks: [
          'Die Steuerklasse (§ 38b EStG) bestimmt, wie viel Lohnsteuer der Arbeitgeber jeden Monat einbehält. Sie wird nicht beantragt, sondern vom Finanzamt automatisch als elektronisches Merkmal (ELStAM) an den Arbeitgeber übermittelt – auf Grundlage Ihrer Meldedaten.',
          { table: { head: ['Klasse', 'Für wen', 'Hinweis'], rows: [
            ['I', 'Ledige, Geschiedene; Verheiratete, deren Ehepartner nicht in Deutschland lebt', 'Standardfall für neu ankommende Arbeitskräfte'],
            ['II', 'Alleinerziehende mit Kind im Haushalt', 'zusätzlicher Entlastungsbetrag'],
            ['III', 'Verheiratete, beide in Deutschland – der Partner mit dem höheren Einkommen', 'nur zusammen mit Klasse V beim Partner'],
            ['IV', 'Verheiratete mit ähnlichem Einkommen', 'Standard nach der Heirat; auch mit Faktor möglich'],
            ['V', 'Verheiratete – der Partner mit dem geringeren Einkommen', 'hoher Abzug, Gegenstück zu III'],
            ['VI', 'zweites und jedes weitere Arbeitsverhältnis; ohne Steuer-ID beim Arbeitgeber', 'höchster Abzug, kein Grundfreibetrag'],
          ] } },
          { h3: 'Ehepaare: III/V oder IV/IV?' },
          'Wenn beide Ehepartner in Deutschland gemeldet sind, erhalten sie automatisch IV/IV. Verdient einer deutlich mehr, kann das Paar beim Finanzamt III/V wählen: Der Besserverdienende hat dann monatlich mehr Netto, der andere weniger. Am Jahresende zählt aber nur die gemeinsame Einkommensteuer – die Steuerklasse verschiebt Geld nur zwischen den Monaten und der Steuererklärung. Mit III/V oder IV mit Faktor ist eine Steuererklärung Pflicht, und es kann zu Nachzahlungen kommen.',
          { h3: 'Neu in Deutschland: Steuerklasse VI im ersten Monat' },
          'Die steuerliche Identifikationsnummer kommt einige Wochen nach der Anmeldung der Wohnung per Post. Solange der Arbeitgeber sie nicht hat, rechnet er nach § 39c EStG mit Steuerklasse VI – es sei denn, Sie haben die Verzögerung nicht zu vertreten: Dann darf er bis zu drei Monate die voraussichtliche Klasse ansetzen. In der Praxis wird der erste Lohn trotzdem oft nach Klasse VI abgerechnet. Bei {{gross3000}} brutto sind das nur etwa {{net3000VI}} statt {{net3000}} netto – {{diffVI}} weniger. Das Geld ist nicht verloren: Es wird korrigiert, sobald die Merkmale vorliegen, spätestens über die Steuererklärung. Tipp: Wohnung sofort anmelden und die Steuer-ID gleich an die Personalabteilung geben.',
          { h3: 'Ehepartner noch im Heimatland?' },
          'Lebt Ihr Ehepartner (noch) nicht in Deutschland, sondern zum Beispiel in Aserbaidschan, bekommen Sie in der Regel Steuerklasse I – III/V setzt voraus, dass beide unbeschränkt steuerpflichtig sind (für Partner in der EU/im EWR gibt es Sonderregeln). Nach dem Familiennachzug und der Anmeldung des Partners ändert sich die Klasse. Unterhalt, den Sie an den Partner im Ausland zahlen, kann unter Umständen in der Steuererklärung berücksichtigt werden.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: 'Sozialabgaben 2026: Beitragssätze im Überblick',
        blocks: [
          { table: { head: ['Versicherung', 'Satz gesamt', 'Ihr Anteil (Arbeitnehmer)'], rows: [
            ['Rentenversicherung', '18,6 %', '9,3 %'],
            ['Arbeitslosenversicherung', '2,6 %', '1,3 %'],
            ['Krankenversicherung', '14,6 % + Zusatzbeitrag (Durchschnitt 2026: {{zusatz}})', '7,3 % + die Hälfte des Zusatzbeitrags (Ø {{zusatzHalf}})'],
            ['Pflegeversicherung', '3,6 %', '1,8 % (Sachsen 2,3 %); kinderlos ab 23: 2,4 % (Sachsen 2,9 %)'],
          ] } },
          'Den **Zusatzbeitrag** legt jede Krankenkasse selbst fest; die {{zusatz}} sind der vom Bundesgesundheitsministerium bekannt gegebene Durchschnitt für 2026. Viele Kassen liegen darüber, manche darunter – im Rechner können Sie den Satz Ihrer Kasse eintragen.',
          'In der **Pflegeversicherung** zahlen Kinderlose ab 23 Jahren 0,6 Prozentpunkte Zuschlag. Eltern zahlen keinen Zuschlag; ab dem zweiten Kind unter 25 sinkt der Beitrag um 0,25 Punkte je Kind (bis zum fünften Kind). In Sachsen ist der Arbeitnehmeranteil 0,5 Punkte höher, weil dort kein Feiertag für die Pflegeversicherung gestrichen wurde.',
          'Zusammen machen die Sozialabgaben für einen kinderlosen Arbeitnehmer mit durchschnittlichem Zusatzbeitrag rund 21,75 % des Bruttos aus – meist mehr als die Lohnsteuer.',
        ],
      },
      {
        id: 'grenzen',
        h2: 'Beitragsbemessungsgrenzen und weitere Grenzwerte 2026',
        blocks: [
          'Beiträge werden nur bis zur Beitragsbemessungsgrenze erhoben. Wer mehr verdient, zahlt auf den darüber liegenden Teil keine Sozialabgaben mehr.',
          { table: { head: ['Wert 2026', 'pro Monat', 'pro Jahr'], rows: [
            ['Beitragsbemessungsgrenze Renten- und Arbeitslosenversicherung', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Beitragsbemessungsgrenze Kranken- und Pflegeversicherung', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Versicherungspflichtgrenze (darüber ist private Krankenversicherung möglich)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Minijob-Grenze', '{{minijob}}', '–'],
            ['Übergangsbereich (Midijob, geringere Arbeitnehmerbeiträge)', 'bis {{midijob}}', '–'],
            ['Grundfreibetrag (Einkommensteuer)', '–', '{{gfb}}'],
          ] } },
          'Die Beitragsbemessungsgrenze der Rentenversicherung ({{bbgRv}}) ist übrigens auch die Basis der Gehaltsgrenzen der Blauen Karte EU: 50 % davon ergeben 2026 die Grenze von 50.700 €, 45,3 % die Grenze von 45.934,20 € für Engpassberufe und Berufseinsteiger. Prüfen Sie Ihr Angebot im [Blue-Card-Check](/blue-card-check).',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Rechenbeispiele 2026: Lkw-Fahrer, Pflegefachkraft, Elektriker',
        blocks: [
          'Typische Gehälter, mit denen unsere Kandidatinnen und Kandidaten in Deutschland starten – berechnet mit genau dem Rechner oben (gesetzliche Krankenversicherung, durchschnittlicher Zusatzbeitrag {{zusatz}}, keine Kirchensteuer, 30 Jahre alt):',
          { slot: 'examples' },
          'Gut zu sehen: Die Steuerklasse verändert das Netto stärker als das Bundesland. Das Kindergeld ({{kindergeld}} je Kind und Monat) ist im Netto nicht enthalten – es wird separat von der Familienkasse gezahlt.',
        ],
      },
      {
        id: 'tipps',
        h2: 'Mehr Netto: was neue Arbeitnehmer wissen sollten',
        blocks: [
          { ul: [
            '**Steuererklärung abgeben**: Fahrten zur Arbeit, Umzugskosten, Arbeitsmittel, doppelte Haushaltsführung oder Gewerkschaftsbeiträge senken die Steuer, wenn sie zusammen den Arbeitnehmer-Pauschbetrag ({{anp}}) übersteigen. Im Ankunftsjahr gibt es oft eine Erstattung.',
            '**Krankenkasse vergleichen**: Ein um einen Punkt niedrigerer Zusatzbeitrag bringt bei {{gross3000}} brutto rund 15 € mehr Netto im Monat.',
            '**Kirchenmitgliedschaft richtig angeben**: Bei der Anmeldung der Wohnung wird die Religionszugehörigkeit erfasst. Nur Mitglieder steuererhebender Kirchen zahlen Kirchensteuer.',
            '**Brutto richtig vergleichen**: Ein 13. Gehalt, Zuschläge für Nacht- und Sonntagsarbeit (teilweise steuerfrei) oder Spesen bei Fahrern verändern das tatsächliche Netto. Fragen Sie im Vorstellungsgespräch nach dem Jahresbrutto.',
          ] },
          'Freie Stellen mit Gehaltsangabe finden Sie in unserer [Jobbörse](/jobs); was der erste Monat in Deutschland kostet, zeigt der [Budgetrechner](/budget).',
        ],
      },
    ],
    faqTitle: 'Häufige Fragen zum Brutto-Netto-Rechner',
    faq: [
      { q: 'Wie viel netto bleiben von 3.000 € brutto im Jahr 2026?', a: 'In Steuerklasse I, ohne Kinder und ohne Kirchensteuer, mit durchschnittlichem Zusatzbeitrag sind es rund {{net3000}} im Monat. Verheiratete in Steuerklasse III behalten deutlich mehr, in Klasse VI deutlich weniger.' },
      { q: 'Welche Steuerklasse habe ich, wenn ich neu nach Deutschland komme?', a: 'Ledige und Verheiratete, deren Partner noch im Ausland lebt, bekommen in der Regel Steuerklasse I. Bis der Arbeitgeber Ihre Steuer-ID hat, kann er Klasse VI anwenden – die zu viel gezahlte Steuer wird später korrigiert.' },
      { q: 'Bekomme ich Steuerklasse III, wenn meine Frau oder mein Mann noch nicht in Deutschland lebt?', a: 'In der Regel nein. III/V setzt voraus, dass beide Ehepartner in Deutschland unbeschränkt steuerpflichtig sind (Sonderregeln gelten für Partner in der EU/im EWR). Nach dem Familiennachzug können Sie die Steuerklassen wechseln.' },
      { q: 'Wie hoch sind die Sozialabgaben 2026?', a: 'Der Arbeitnehmeranteil beträgt 9,3 % Rente, 1,3 % Arbeitslosenversicherung, 7,3 % Krankenversicherung plus die Hälfte des Zusatzbeitrags (Ø {{zusatz}}) und 1,8 % Pflege (kinderlos ab 23: 2,4 %) – zusammen rund 21–22 % des Bruttos.' },
      { q: 'Wie hoch ist die Beitragsbemessungsgrenze 2026?', a: 'In der Renten- und Arbeitslosenversicherung {{bbgRvMonth}} im Monat ({{bbgRv}} im Jahr), in der Kranken- und Pflegeversicherung {{bbgKvMonth}} im Monat ({{bbgKv}} im Jahr).' },
      { q: 'Muss ich Kirchensteuer zahlen?', a: 'Nur wenn Sie Mitglied einer Kirche oder Religionsgemeinschaft sind, die Kirchensteuer erhebt (vor allem katholische und evangelische Kirche). Sie beträgt 8 % der Lohnsteuer in Bayern und Baden-Württemberg, sonst 9 %.' },
      { q: 'Ist das Ergebnis des Rechners verbindlich?', a: 'Nein. Der Rechner folgt dem amtlichen Programmablaufplan 2026 des BMF, berücksichtigt aber keine individuellen Freibeträge, Einmalzahlungen oder private Krankenversicherung. Verbindlich ist Ihre Gehaltsabrechnung.' },
    ],
    sources: 'Stand: {{checked}}. Quellen: BMF, Programmablaufplan für den Lohnsteuerabzug 2026; Sozialversicherungs-Rechengrößenverordnung 2026; Bundesgesundheitsministerium, durchschnittlicher Zusatzbeitragssatz 2026; §§ 32a, 38b, 39c, 51a EStG; § 3 SolZG; § 55 SGB XI.',
    labels: {
      job: 'Beruf', situation: 'Situation', gross: 'Brutto/Monat', net: 'Netto/Monat', deductions: 'Abzüge',
      truck: 'Lkw-Fahrer (CE)', truckVI: 'Lkw-Fahrer, erster Monat ohne Steuer-ID', nurse: 'Pflegefachkraft', nurseIII: 'Pflegefachkraft, verheiratet', electrician: 'Elektriker',
      class: 'Klasse', child: '1 Kind', noChild: 'keine Kinder',
    },
  },

  en: {
    eyebrow: 'Gross to net in 2026, explained',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'From gross to net: how German payroll works in 2026',
        blocks: [
          'In Germany the employer deducts tax and social security contributions from the gross salary every month and pays them to the tax office and the health insurance fund. Only the net reaches your bank account. The calculator above reproduces exactly this payroll, with the official 2026 figures.',
          { ol: [
            '**Social contributions**: pension, unemployment, health and long-term care insurance are a percentage of the gross, each up to a contribution ceiling. The employer pays (almost always) the other half.',
            '**Income tax (Lohnsteuer)**: it follows the income tax scale and your tax class. Tax-free in 2026: the basic allowance of {{gfb}} a year, the employee lump sum ({{anp}}) and an allowance for your insurance contributions.',
            '**Solidarity surcharge**: 5.5 % of the income tax, but only once the yearly income tax exceeds {{soliFree}} (single). The vast majority of employees therefore pay no surcharge.',
            '**Church tax**: 8 % (Bavaria, Baden-Württemberg) or 9 % (all other states) of the income tax, and only for members of a church that levies it.',
          ] },
          'Rule of thumb: a single employee in statutory health insurance without children keeps about {{net3000}} of a {{gross3000}} gross salary in tax class I, roughly {{share3000}} of the gross.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'The six tax classes: who gets which?',
        blocks: [
          'Your tax class (Steuerklasse, section 38b of the Income Tax Act) decides how much income tax the employer withholds each month. You do not apply for it: the tax office sends it to the employer electronically (ELStAM), based on your registration data.',
          { table: { head: ['Class', 'For whom', 'Note'], rows: [
            ['I', 'single or divorced; married people whose spouse does not live in Germany', 'the usual class for newly arrived workers'],
            ['II', 'single parents with a child in the household', 'extra relief amount'],
            ['III', 'married, both living in Germany: the partner with the higher income', 'only together with class V for the partner'],
            ['IV', 'married with similar incomes', 'default after the wedding; also possible with a factor'],
            ['V', 'married: the partner with the lower income', 'high deduction, counterpart of III'],
            ['VI', 'a second or further job; no tax ID at the employer yet', 'highest deduction, no basic allowance'],
          ] } },
          { h3: 'Married couples: III/V or IV/IV?' },
          'When both spouses are registered in Germany they automatically get IV/IV. If one earns much more, the couple can choose III/V at the tax office: the higher earner then gets more net each month, the other less. At the end of the year only the joint income tax counts, so the tax class just shifts money between the monthly payslips and the tax return. With III/V or IV with a factor a tax return is mandatory and you may have to pay tax back.',
          { h3: 'New in Germany: tax class VI in the first month' },
          'Your tax identification number (Steuer-ID) arrives by post a few weeks after you register your address. Until the employer has it, section 39c of the Income Tax Act requires tax class VI, unless the delay is not your fault: then the employer may use your expected class for up to three months. In practice the first salary is still often paid out in class VI. On {{gross3000}} gross that means only about {{net3000VI}} instead of {{net3000}} net, {{diffVI}} less. The money is not lost: it is corrected once your data is available, at the latest through the tax return. Tip: register your flat right away and hand the tax ID to HR immediately.',
          { h3: 'Spouse still in your home country?' },
          'If your spouse does not (yet) live in Germany but, for example, in Azerbaijan, you normally get tax class I: III/V requires both spouses to be fully taxable in Germany (special rules apply to partners in the EU/EEA). After family reunification and your partner’s registration the class changes. Maintenance you pay to a spouse abroad may, under certain conditions, be deductible in your tax return.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: 'Social security contributions 2026: the rates',
        blocks: [
          { table: { head: ['Insurance', 'Total rate', 'Your share (employee)'], rows: [
            ['Pension insurance', '18.6 %', '9.3 %'],
            ['Unemployment insurance', '2.6 %', '1.3 %'],
            ['Health insurance', '14.6 % + additional contribution (2026 average: {{zusatz}})', '7.3 % + half of the additional contribution (avg. {{zusatzHalf}})'],
            ['Long-term care insurance', '3.6 %', '1.8 % (Saxony 2.3 %); childless from age 23: 2.4 % (Saxony 2.9 %)'],
          ] } },
          'Each health insurance fund sets its own **additional contribution** (Zusatzbeitrag); {{zusatz}} is the 2026 average published by the Federal Ministry of Health. Many funds charge more, some less. You can enter your fund’s rate in the calculator.',
          'In **long-term care insurance** childless employees aged 23 or over pay a 0.6-point surcharge. Parents pay no surcharge, and from the second child under 25 the rate drops by 0.25 points per child (up to the fifth child). In Saxony the employee share is 0.5 points higher because Saxony kept the public holiday that other states gave up to fund care insurance.',
          'Altogether a childless employee with the average additional contribution pays about 21.75 % of the gross in social contributions, usually more than the income tax.',
        ],
      },
      {
        id: 'grenzen',
        h2: 'Contribution ceilings and other thresholds 2026',
        blocks: [
          'Contributions are only charged up to the contribution ceiling (Beitragsbemessungsgrenze). Above it, the extra salary is free of social contributions.',
          { table: { head: ['2026 value', 'per month', 'per year'], rows: [
            ['Ceiling for pension and unemployment insurance', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Ceiling for health and care insurance', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Compulsory insurance limit (above it private health insurance is possible)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Minijob limit', '{{minijob}}', '–'],
            ['Transition zone (midijob, lower employee contributions)', 'up to {{midijob}}', '–'],
            ['Basic tax-free allowance (income tax)', '–', '{{gfb}}'],
          ] } },
          'The pension ceiling ({{bbgRv}}) is also the basis of the EU Blue Card salary thresholds: 50 % of it gives the 2026 threshold of €50,700, 45.3 % the €45,934.20 threshold for shortage occupations and recent graduates. Check your offer with the [Blue Card check](/blue-card-check).',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Worked examples 2026: truck driver, nurse, electrician',
        blocks: [
          'Typical starting salaries of our candidates in Germany, calculated with exactly the calculator above (statutory health insurance, average additional contribution {{zusatz}}, no church tax, age 30):',
          { slot: 'examples' },
          'Note that the tax class changes the net much more than the federal state. Child benefit ({{kindergeld}} per child and month) is not part of the net; the family benefits office pays it separately.',
        ],
      },
      {
        id: 'tipps',
        h2: 'More net: what new employees should know',
        blocks: [
          { ul: [
            '**File a tax return**: commuting, moving costs, work equipment, a second household or union fees reduce your tax once together they exceed the employee lump sum ({{anp}}). In the year of arrival there is often a refund.',
            '**Compare health insurance funds**: an additional contribution one point lower brings about €15 more net a month on {{gross3000}} gross.',
            '**State your religion correctly**: when you register your address your religious affiliation is recorded. Only members of churches that levy church tax pay it.',
            '**Compare gross pay properly**: a 13th salary, night and Sunday bonuses (partly tax-free) or drivers’ allowances change the real net. Ask for the annual gross in the interview.',
          ] },
          'Vacancies with salary information are in our [job board](/jobs); what the first month in Germany costs is shown by the [budget calculator](/budget).',
        ],
      },
    ],
    faqTitle: 'Frequently asked questions about German net pay',
    faq: [
      { q: 'How much net is left from €3,000 gross in 2026?', a: 'In tax class I, without children or church tax and with the average additional contribution, about {{net3000}} a month. Married people in class III keep considerably more, class VI considerably less.' },
      { q: 'Which tax class do I get when I move to Germany?', a: 'Single people, and married people whose partner still lives abroad, normally get class I. Until the employer has your tax ID it may apply class VI; the excess tax is corrected later.' },
      { q: 'Do I get tax class III if my spouse does not live in Germany yet?', a: 'Usually not. III/V requires both spouses to be fully taxable in Germany (special rules apply to partners in the EU/EEA). After family reunification you can change the classes.' },
      { q: 'How high are social security contributions in 2026?', a: 'The employee pays 9.3 % pension, 1.3 % unemployment, 7.3 % health insurance plus half the additional contribution (avg. {{zusatz}}) and 1.8 % care insurance (childless from 23: 2.4 %), about 21–22 % of the gross in total.' },
      { q: 'What are the contribution ceilings for 2026?', a: 'Pension and unemployment insurance: {{bbgRvMonth}} a month ({{bbgRv}} a year); health and care insurance: {{bbgKvMonth}} a month ({{bbgKv}} a year).' },
      { q: 'Do I have to pay church tax?', a: 'Only if you belong to a church or religious community that levies church tax (mainly the Catholic and Protestant churches). It is 8 % of the income tax in Bavaria and Baden-Württemberg and 9 % elsewhere.' },
      { q: 'Is the calculator result binding?', a: 'No. It follows the official 2026 payroll tax flowchart of the Federal Ministry of Finance but ignores individual allowances, one-off payments and private health insurance. Your payslip is what counts.' },
    ],
    sources: 'As of {{checked}}. Sources: Federal Ministry of Finance, payroll tax flowchart (Programmablaufplan) 2026; Social Insurance Calculation Values Ordinance 2026; Federal Ministry of Health, average additional contribution 2026; sections 32a, 38b, 39c, 51a Income Tax Act; section 3 Solidarity Surcharge Act; section 55 SGB XI.',
    labels: {
      job: 'Job', situation: 'Situation', gross: 'Gross/month', net: 'Net/month', deductions: 'Deductions',
      truck: 'Truck driver (CE)', truckVI: 'Truck driver, first month without tax ID', nurse: 'Nurse', nurseIII: 'Nurse, married', electrician: 'Electrician',
      class: 'class', child: '1 child', noChild: 'no children',
    },
  },

  ru: {
    eyebrow: 'Брутто и нетто в 2026 году',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'Как из брутто получается нетто: расчёт зарплаты в Германии в 2026 году',
        blocks: [
          'В Германии работодатель каждый месяц сам удерживает налоги и взносы на социальное страхование из зарплаты брутто и перечисляет их в налоговую и больничную кассу. На счёт приходит только нетто. Калькулятор выше повторяет именно этот расчёт — с официальными значениями 2026 года.',
          { ol: [
            '**Социальные взносы**: пенсионное страхование, страхование по безработице, медицинское страхование и страхование по уходу считаются в процентах от брутто — каждое до своего предела. Вторую половину (почти всегда) платит работодатель.',
            '**Подоходный налог (Lohnsteuer)**: зависит от налоговой шкалы и вашего налогового класса. В 2026 году не облагаются базовый необлагаемый минимум {{gfb}} в год, паушальная сумма для наёмных работников ({{anp}}) и вычет на страховые взносы.',
            '**Солидарный сбор**: 5,5 % от подоходного налога, но только если налог за год превышает {{soliFree}} (для одиноких). Поэтому подавляющее большинство работников его не платит.',
            '**Церковный налог**: 8 % (Бавария, Баден-Вюртемберг) или 9 % (остальные земли) от подоходного налога — только для членов церкви, которая его взимает.',
          ] },
          'Ориентир: одинокий работник без детей с государственной медицинской страховкой при {{gross3000}} брутто в I классе получает около {{net3000}} нетто — примерно {{share3000}} от брутто.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'Шесть налоговых классов: кому какой?',
        blocks: [
          'Налоговый класс (Steuerklasse, § 38b EStG) определяет, сколько подоходного налога работодатель удерживает каждый месяц. Его не нужно заказывать: налоговая автоматически передаёт его работодателю в электронном виде (ELStAM) на основании ваших данных регистрации.',
          { table: { head: ['Класс', 'Для кого', 'Примечание'], rows: [
            ['I', 'холостые, разведённые; женатые/замужние, если супруг(а) не живёт в Германии', 'обычный класс для только что приехавших работников'],
            ['II', 'родители-одиночки с ребёнком в семье', 'дополнительная льгота'],
            ['III', 'супруги, оба живут в Германии: тот, кто зарабатывает больше', 'только в паре с классом V у супруга'],
            ['IV', 'супруги с похожими доходами', 'стандарт после свадьбы; возможен с коэффициентом'],
            ['V', 'супруги: тот, кто зарабатывает меньше', 'высокое удержание, пара к III'],
            ['VI', 'вторая и каждая следующая работа; работодатель ещё не знает налоговый номер', 'самое высокое удержание, без необлагаемого минимума'],
          ] } },
          { h3: 'Супруги: III/V или IV/IV?' },
          'Если оба супруга зарегистрированы в Германии, они автоматически получают IV/IV. Если один зарабатывает заметно больше, пара может выбрать в налоговой III/V: у того, кто зарабатывает больше, нетто каждый месяц выше, у второго — ниже. Но в конце года считается только общий подоходный налог: класс лишь перераспределяет деньги между месячными выплатами и налоговой декларацией. При III/V или IV с коэффициентом декларация обязательна, возможна доплата налога.',
          { h3: 'Только приехали: VI класс в первый месяц' },
          'Налоговый идентификационный номер (Steuer-ID) приходит по почте через несколько недель после регистрации по месту жительства. Пока у работодателя его нет, по § 39c EStG он применяет VI класс — если только задержка не по вашей вине: тогда он вправе до трёх месяцев использовать ожидаемый класс. На практике первую зарплату всё равно часто рассчитывают по VI классу. При {{gross3000}} брутто это лишь около {{net3000VI}} вместо {{net3000}} нетто — на {{diffVI}} меньше. Деньги не пропадают: их пересчитают, когда данные поступят, в крайнем случае вернут через декларацию. Совет: регистрируйтесь сразу и сразу передайте Steuer-ID в отдел кадров.',
          { h3: 'Супруг(а) ещё на родине?' },
          'Если ваш супруг или супруга (пока) живёт не в Германии, а, например, в Азербайджане, вы, как правило, получаете I класс: для III/V оба должны быть неограниченно налогообязанными в Германии (для партнёров в ЕС/ЕЭЗ есть особые правила). После воссоединения семьи и регистрации супруга класс меняется. Содержание, которое вы перечисляете супругу за границу, при определённых условиях можно учесть в налоговой декларации.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: 'Социальные взносы 2026: ставки',
        blocks: [
          { table: { head: ['Страхование', 'Общая ставка', 'Ваша доля (работник)'], rows: [
            ['Пенсионное', '18,6 %', '9,3 %'],
            ['По безработице', '2,6 %', '1,3 %'],
            ['Медицинское', '14,6 % + дополнительный взнос (в среднем в 2026: {{zusatz}})', '7,3 % + половина дополнительного взноса (в среднем {{zusatzHalf}})'],
            ['По уходу (Pflegeversicherung)', '3,6 %', '1,8 % (Саксония 2,3 %); бездетные с 23 лет: 2,4 % (Саксония 2,9 %)'],
          ] } },
          '**Дополнительный взнос** (Zusatzbeitrag) каждая больничная касса устанавливает сама; {{zusatz}} — это среднее значение на 2026 год, опубликованное Минздравом Германии. Многие кассы берут больше, некоторые меньше — в калькуляторе можно указать ставку своей кассы.',
          'В **страховании по уходу** бездетные с 23 лет платят надбавку 0,6 процентного пункта. Родители надбавку не платят, а начиная со второго ребёнка младше 25 лет ставка снижается на 0,25 пункта за каждого ребёнка (до пятого). В Саксонии доля работника на 0,5 пункта выше, потому что там не отменили праздничный день ради финансирования этого страхования.',
          'В сумме бездетный работник со средним дополнительным взносом отдаёт на социальные взносы около 21,75 % брутто — обычно больше, чем на подоходный налог.',
        ],
      },
      {
        id: 'grenzen',
        h2: 'Пределы взносов и другие пороги 2026 года',
        blocks: [
          'Взносы начисляются только до предела (Beitragsbemessungsgrenze). С части зарплаты выше него социальные взносы не платятся.',
          { table: { head: ['Значение 2026', 'в месяц', 'в год'], rows: [
            ['Предел для пенсионного страхования и страхования по безработице', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Предел для медицинского страхования и страхования по уходу', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Граница обязательного страхования (выше неё возможна частная медстраховка)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Граница миниджоба', '{{minijob}}', '–'],
            ['Переходная зона (мидиджоб, меньшие взносы работника)', 'до {{midijob}}', '–'],
            ['Необлагаемый минимум (подоходный налог)', '–', '{{gfb}}'],
          ] } },
          'Предел пенсионного страхования ({{bbgRv}}) — это ещё и основа порогов зарплаты для Голубой карты ЕС: 50 % от него дают порог 2026 года 50 700 €, 45,3 % — порог 45 934,20 € для дефицитных профессий и молодых специалистов. Проверьте своё предложение в [проверке Голубой карты](/blue-card-check).',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Примеры расчёта 2026: водитель грузовика, медсестра, электрик',
        blocks: [
          'Типичные стартовые зарплаты наших кандидатов в Германии, рассчитанные тем же калькулятором (государственная медстраховка, средний дополнительный взнос {{zusatz}}, без церковного налога, возраст 30 лет):',
          { slot: 'examples' },
          'Видно, что налоговый класс меняет нетто гораздо сильнее, чем федеральная земля. Детское пособие (Kindergeld, {{kindergeld}} на ребёнка в месяц) в нетто не входит — его отдельно выплачивает семейная касса.',
        ],
      },
      {
        id: 'tipps',
        h2: 'Как получить больше нетто: советы новым работникам',
        blocks: [
          { ul: [
            '**Подавайте налоговую декларацию**: дорога на работу, переезд, рабочие принадлежности, второе жильё или профсоюзные взносы уменьшают налог, если в сумме превышают паушальную сумму ({{anp}}). В год переезда часто положен возврат.',
            '**Сравните больничные кассы**: дополнительный взнос на один пункт ниже даёт при {{gross3000}} брутто примерно на 15 € нетто больше в месяц.',
            '**Правильно укажите вероисповедание**: при регистрации по месту жительства фиксируется религиозная принадлежность. Церковный налог платят только члены церквей, которые его взимают.',
            '**Правильно сравнивайте брутто**: 13-я зарплата, надбавки за ночные и воскресные смены (частично без налога) или суточные у водителей меняют реальное нетто. На собеседовании спрашивайте годовой брутто.',
          ] },
          'Вакансии с указанием зарплаты — в нашем [разделе вакансий](/jobs); сколько стоит первый месяц в Германии, покажет [калькулятор бюджета](/budget).',
        ],
      },
    ],
    faqTitle: 'Частые вопросы о зарплате нетто в Германии',
    faq: [
      { q: 'Сколько нетто остаётся от 3000 € брутто в 2026 году?', a: 'В I налоговом классе, без детей и церковного налога, со средним дополнительным взносом — около {{net3000}} в месяц. В III классе остаётся заметно больше, в VI — заметно меньше.' },
      { q: 'Какой налоговый класс у меня будет после переезда в Германию?', a: 'Одинокие, а также женатые/замужние, чей супруг ещё живёт за границей, обычно получают I класс. Пока у работодателя нет вашего Steuer-ID, он может применять VI класс; лишний налог потом пересчитают.' },
      { q: 'Получу ли я III класс, если супруг(а) ещё не живёт в Германии?', a: 'Как правило, нет. Для III/V оба супруга должны быть неограниченно налогообязанными в Германии (для партнёров в ЕС/ЕЭЗ есть особые правила). После воссоединения семьи классы можно поменять.' },
      { q: 'Сколько составляют социальные взносы в 2026 году?', a: 'Работник платит 9,3 % на пенсию, 1,3 % по безработице, 7,3 % на медстраховку плюс половину дополнительного взноса (в среднем {{zusatz}}) и 1,8 % на уход (бездетные с 23 лет — 2,4 %), всего около 21–22 % брутто.' },
      { q: 'Какие пределы взносов действуют в 2026 году?', a: 'Пенсионное страхование и страхование по безработице: {{bbgRvMonth}} в месяц ({{bbgRv}} в год); медицинское страхование и страхование по уходу: {{bbgKvMonth}} в месяц ({{bbgKv}} в год).' },
      { q: 'Нужно ли платить церковный налог?', a: 'Только если вы член церкви или религиозной общины, которая взимает церковный налог (прежде всего католическая и евангелическая церковь). Он составляет 8 % от подоходного налога в Баварии и Баден-Вюртемберге и 9 % в остальных землях.' },
      { q: 'Результат калькулятора окончательный?', a: 'Нет. Калькулятор следует официальной схеме расчёта Минфина Германии на 2026 год, но не учитывает индивидуальные вычеты, разовые выплаты и частную медстраховку. Решающим является ваш расчётный лист.' },
    ],
    sources: 'По состоянию на {{checked}}. Источники: Минфин Германии (BMF), Programmablaufplan Lohnsteuer 2026; Постановление о расчётных величинах социального страхования на 2026 год; Минздрав Германии, средний дополнительный взнос 2026; §§ 32a, 38b, 39c, 51a EStG; § 3 SolZG; § 55 SGB XI.',
    labels: {
      job: 'Профессия', situation: 'Ситуация', gross: 'Брутто/мес.', net: 'Нетто/мес.', deductions: 'Удержания',
      truck: 'Водитель грузовика (CE)', truckVI: 'Водитель, первый месяц без Steuer-ID', nurse: 'Медсестра/медбрат', nurseIII: 'Медсестра/медбрат, в браке', electrician: 'Электрик',
      class: 'класс', child: '1 ребёнок', noChild: 'без детей',
    },
  },

  uk: {
    eyebrow: 'Брутто і нетто у 2026 році',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'Як із брутто виходить нетто: розрахунок зарплати в Німеччині у 2026 році',
        blocks: [
          'У Німеччині роботодавець щомісяця сам утримує податки та внески на соціальне страхування із зарплати брутто й перераховує їх до податкової та лікарняної каси. На рахунок надходить лише нетто. Калькулятор вище відтворює саме цей розрахунок — з офіційними значеннями 2026 року.',
          { ol: [
            '**Соціальні внески**: пенсійне страхування, страхування на випадок безробіття, медичне страхування та страхування догляду рахуються у відсотках від брутто — кожне до своєї граничної межі. Другу половину (майже завжди) сплачує роботодавець.',
            '**Податок на заробітну плату (Lohnsteuer)**: залежить від податкової шкали та вашого податкового класу. У 2026 році не оподатковуються базовий неоподатковуваний мінімум {{gfb}} на рік, паушальна сума для найманих працівників ({{anp}}) і відрахування на страхові внески.',
            '**Солідарний збір**: 5,5 % від податку, але лише якщо податок за рік перевищує {{soliFree}} (для неодружених). Тому переважна більшість працівників його не сплачує.',
            '**Церковний податок**: 8 % (Баварія, Баден-Вюртемберг) або 9 % (інші землі) від податку — лише для членів церкви, яка його стягує.',
          ] },
          'Орієнтир: неодружений працівник без дітей з державною медичною страховкою при {{gross3000}} брутто в I класі отримує близько {{net3000}} нетто — приблизно {{share3000}} від брутто.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'Шість податкових класів: кому який?',
        blocks: [
          'Податковий клас (Steuerklasse, § 38b EStG) визначає, скільки податку роботодавець утримує щомісяця. Його не потрібно замовляти: податкова автоматично передає його роботодавцю в електронному вигляді (ELStAM) на підставі ваших даних реєстрації.',
          { table: { head: ['Клас', 'Для кого', 'Примітка'], rows: [
            ['I', 'неодружені, розлучені; одружені, якщо чоловік чи дружина не живе в Німеччині', 'звичайний клас для щойно прибулих працівників'],
            ['II', 'батьки-одинаки з дитиною в домогосподарстві', 'додаткова пільга'],
            ['III', 'подружжя, обоє живуть у Німеччині: той, хто заробляє більше', 'лише в парі з класом V у партнера'],
            ['IV', 'подружжя зі схожими доходами', 'стандарт після весілля; можливий з коефіцієнтом'],
            ['V', 'подружжя: той, хто заробляє менше', 'високе утримання, пара до III'],
            ['VI', 'друга й кожна наступна робота; роботодавець ще не знає податкового номера', 'найвище утримання, без неоподатковуваного мінімуму'],
          ] } },
          { h3: 'Подружжя: III/V чи IV/IV?' },
          'Якщо обоє з подружжя зареєстровані в Німеччині, вони автоматично отримують IV/IV. Якщо один заробляє значно більше, пара може обрати в податковій III/V: у того, хто заробляє більше, нетто щомісяця вище, у другого — нижче. Але наприкінці року рахується лише спільний податок на доходи: клас лише перерозподіляє гроші між місячними виплатами та податковою декларацією. За III/V або IV з коефіцієнтом декларація обов’язкова, можлива доплата.',
          { h3: 'Щойно приїхали: VI клас у перший місяць' },
          'Податковий ідентифікаційний номер (Steuer-ID) надходить поштою через кілька тижнів після реєстрації місця проживання. Поки роботодавець його не має, за § 39c EStG він застосовує VI клас — хіба що затримка сталася не з вашої вини: тоді він може до трьох місяців використовувати очікуваний клас. На практиці першу зарплату все одно часто рахують за VI класом. При {{gross3000}} брутто це лише близько {{net3000VI}} замість {{net3000}} нетто — на {{diffVI}} менше. Гроші не пропадають: їх перерахують, щойно дані надійдуть, щонайпізніше повернуть через декларацію. Порада: реєструйтеся одразу й одразу передайте Steuer-ID до відділу кадрів.',
          { h3: 'Чоловік чи дружина ще на батьківщині?' },
          'Якщо ваш чоловік чи дружина (поки що) живе не в Німеччині, ви, як правило, отримуєте I клас: для III/V обоє мають бути необмежено податково зобов’язаними в Німеччині (для партнерів у ЄС/ЄЕЗ діють особливі правила). Після возз’єднання сім’ї та реєстрації партнера клас змінюється. Утримання, яке ви перераховуєте партнерові за кордон, за певних умов можна врахувати в податковій декларації.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: 'Соціальні внески 2026: ставки',
        blocks: [
          { table: { head: ['Страхування', 'Загальна ставка', 'Ваша частка (працівник)'], rows: [
            ['Пенсійне', '18,6 %', '9,3 %'],
            ['На випадок безробіття', '2,6 %', '1,3 %'],
            ['Медичне', '14,6 % + додатковий внесок (у середньому 2026: {{zusatz}})', '7,3 % + половина додаткового внеску (у середньому {{zusatzHalf}})'],
            ['Страхування догляду (Pflegeversicherung)', '3,6 %', '1,8 % (Саксонія 2,3 %); бездітні з 23 років: 2,4 % (Саксонія 2,9 %)'],
          ] } },
          '**Додатковий внесок** (Zusatzbeitrag) кожна лікарняна каса встановлює сама; {{zusatz}} — це середнє значення на 2026 рік, оприлюднене Міністерством охорони здоров’я Німеччини. Багато кас беруть більше, деякі менше — у калькуляторі можна вказати ставку своєї каси.',
          'У **страхуванні догляду** бездітні з 23 років сплачують надбавку 0,6 процентного пункту. Батьки надбавку не сплачують, а починаючи з другої дитини до 25 років ставка знижується на 0,25 пункту за кожну дитину (до п’ятої). У Саксонії частка працівника на 0,5 пункту вища, бо там не скасували святковий день задля фінансування цього страхування.',
          'Загалом бездітний працівник із середнім додатковим внеском сплачує соціальних внесків близько 21,75 % брутто — зазвичай більше, ніж податку.',
        ],
      },
      {
        id: 'grenzen',
        h2: 'Граничні межі внесків та інші пороги 2026 року',
        blocks: [
          'Внески нараховуються лише до граничної межі (Beitragsbemessungsgrenze). З частини зарплати понад неї соціальні внески не сплачуються.',
          { table: { head: ['Значення 2026', 'на місяць', 'на рік'], rows: [
            ['Межа для пенсійного страхування та страхування на випадок безробіття', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Межа для медичного страхування та страхування догляду', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Межа обов’язкового страхування (понад неї можлива приватна медстраховка)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Межа мініджобу', '{{minijob}}', '–'],
            ['Перехідна зона (мідіджоб, менші внески працівника)', 'до {{midijob}}', '–'],
            ['Неоподатковуваний мінімум (податок на доходи)', '–', '{{gfb}}'],
          ] } },
          'Межа пенсійного страхування ({{bbgRv}}) — це ще й основа порогів зарплати для Блакитної карти ЄС: 50 % від неї дають поріг 2026 року 50 700 €, 45,3 % — поріг 45 934,20 € для дефіцитних професій і молодих фахівців. Перевірте свою пропозицію в [перевірці Блакитної карти](/blue-card-check).',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Приклади розрахунку 2026: водій вантажівки, медсестра, електрик',
        blocks: [
          'Типові стартові зарплати наших кандидатів у Німеччині, розраховані тим самим калькулятором (державна медстраховка, середній додатковий внесок {{zusatz}}, без церковного податку, вік 30 років):',
          { slot: 'examples' },
          'Видно, що податковий клас змінює нетто значно сильніше, ніж федеральна земля. Допомога на дітей (Kindergeld, {{kindergeld}} на дитину на місяць) до нетто не входить — її окремо виплачує сімейна каса.',
        ],
      },
      {
        id: 'tipps',
        h2: 'Як отримати більше нетто: поради новим працівникам',
        blocks: [
          { ul: [
            '**Подавайте податкову декларацію**: дорога на роботу, переїзд, робоче приладдя, друге житло чи профспілкові внески зменшують податок, якщо разом перевищують паушальну суму ({{anp}}). У рік переїзду часто належить повернення.',
            '**Порівняйте лікарняні каси**: додатковий внесок на один пункт нижчий дає при {{gross3000}} брутто приблизно на 15 € нетто більше щомісяця.',
            '**Правильно вкажіть віросповідання**: під час реєстрації місця проживання фіксується релігійна належність. Церковний податок сплачують лише члени церков, які його стягують.',
            '**Правильно порівнюйте брутто**: 13-та зарплата, надбавки за нічні та недільні зміни (частково без податку) чи добові у водіїв змінюють реальне нетто. На співбесіді питайте про річний брутто.',
          ] },
          'Вакансії із зазначенням зарплати — у нашому [розділі вакансій](/jobs); скільки коштує перший місяць у Німеччині, покаже [калькулятор бюджету](/budget).',
        ],
      },
    ],
    faqTitle: 'Часті запитання про зарплату нетто в Німеччині',
    faq: [
      { q: 'Скільки нетто залишається з 3000 € брутто у 2026 році?', a: 'У I податковому класі, без дітей і церковного податку, із середнім додатковим внеском — близько {{net3000}} на місяць. У III класі залишається помітно більше, у VI — помітно менше.' },
      { q: 'Який податковий клас у мене буде після переїзду до Німеччини?', a: 'Неодружені, а також одружені, чий партнер ще живе за кордоном, зазвичай отримують I клас. Поки роботодавець не має вашого Steuer-ID, він може застосовувати VI клас; зайвий податок потім перерахують.' },
      { q: 'Чи отримаю я III клас, якщо дружина чи чоловік ще не живе в Німеччині?', a: 'Як правило, ні. Для III/V обоє з подружжя мають бути необмежено податково зобов’язаними в Німеччині (для партнерів у ЄС/ЄЕЗ діють особливі правила). Після возз’єднання сім’ї класи можна змінити.' },
      { q: 'Скільки становлять соціальні внески у 2026 році?', a: 'Працівник сплачує 9,3 % на пенсію, 1,3 % на випадок безробіття, 7,3 % на медстраховку плюс половину додаткового внеску (у середньому {{zusatz}}) і 1,8 % на догляд (бездітні з 23 років — 2,4 %), разом близько 21–22 % брутто.' },
      { q: 'Які граничні межі внесків діють у 2026 році?', a: 'Пенсійне страхування та страхування на випадок безробіття: {{bbgRvMonth}} на місяць ({{bbgRv}} на рік); медичне страхування та страхування догляду: {{bbgKvMonth}} на місяць ({{bbgKv}} на рік).' },
      { q: 'Чи потрібно сплачувати церковний податок?', a: 'Лише якщо ви член церкви чи релігійної громади, яка стягує церковний податок (насамперед католицька та євангелічна церква). Він становить 8 % від податку в Баварії та Баден-Вюртемберзі й 9 % в інших землях.' },
      { q: 'Чи є результат калькулятора остаточним?', a: 'Ні. Калькулятор дотримується офіційної схеми розрахунку Мінфіну Німеччини на 2026 рік, але не враховує індивідуальних відрахувань, разових виплат і приватної медстраховки. Вирішальним є ваш розрахунковий лист.' },
    ],
    sources: 'Станом на {{checked}}. Джерела: Мінфін Німеччини (BMF), Programmablaufplan Lohnsteuer 2026; Постанова про розрахункові величини соціального страхування на 2026 рік; МОЗ Німеччини, середній додатковий внесок 2026; §§ 32a, 38b, 39c, 51a EStG; § 3 SolZG; § 55 SGB XI.',
    labels: {
      job: 'Професія', situation: 'Ситуація', gross: 'Брутто/міс.', net: 'Нетто/міс.', deductions: 'Утримання',
      truck: 'Водій вантажівки (CE)', truckVI: 'Водій, перший місяць без Steuer-ID', nurse: 'Медсестра/медбрат', nurseIII: 'Медсестра/медбрат, у шлюбі', electrician: 'Електрик',
      class: 'клас', child: '1 дитина', noChild: 'без дітей',
    },
  },

  az: {
    eyebrow: '2026-cı ildə brutto və netto',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'Brutto maaşdan xalis maaşa: Almaniyada 2026-cı ildə maaş necə hesablanır',
        blocks: [
          'Almaniyada vergiləri və sosial sığorta haqlarını işəgötürən hər ay birbaşa brutto maaşdan tutur və vergi idarəsinə və tibbi sığorta kassasına köçürür. Hesabınıza yalnız xalis (netto) məbləğ gəlir. Yuxarıdakı kalkulyator məhz bu hesablamanı 2026-cı ilin rəsmi göstəriciləri ilə təkrarlayır.',
          { ol: [
            '**Sosial sığorta haqları**: pensiya, işsizlik, tibbi və qulluq sığortası brutto maaşın faizi kimi, hər biri öz tavanına qədər hesablanır. Digər yarısını (demək olar ki, həmişə) işəgötürən ödəyir.',
            '**Gəlir vergisi (Lohnsteuer)**: vergi şkalasından və vergi sinfinizdən asılıdır. 2026-cı ildə illik {{gfb}} vergidən azad minimum, işçilər üçün sabit güzəşt ({{anp}}) və sığorta haqlarınız üçün güzəşt vergiyə cəlb olunmur.',
            '**Həmrəylik əlavəsi (Soli)**: gəlir vergisinin 5,5 %-i, amma yalnız illik vergi {{soliFree}} məbləğini keçəndə (subaylar üçün). Ona görə işçilərin böyük əksəriyyəti bu əlavəni ödəmir.',
            '**Kilsə vergisi**: gəlir vergisinin 8 %-i (Bavariya, Baden-Vürtemberq) və ya 9 %-i (digər ştatlar) — yalnız bu vergini toplayan kilsənin üzvləri üçün.',
          ] },
          'Təxmini qayda: dövlət tibbi sığortasında olan, uşağı olmayan subay işçi I vergi sinfində {{gross3000}} brutto maaşdan təxminən {{net3000}} xalis alır — bruttonun təqribən {{share3000}}-i.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'Altı vergi sinfi: kim hansı sinifdə olur?',
        blocks: [
          'Vergi sinfi (Steuerklasse, Gəlir Vergisi Qanununun § 38b maddəsi) işəgötürənin hər ay nə qədər vergi tutacağını müəyyən edir. Onun üçün ərizə vermək lazım deyil: vergi idarəsi qeydiyyat məlumatlarınız əsasında onu işəgötürənə elektron şəkildə (ELStAM) göndərir.',
          { table: { head: ['Sinif', 'Kimin üçün', 'Qeyd'], rows: [
            ['I', 'subaylar, boşanmışlar; həyat yoldaşı Almaniyada yaşamayan evlilər', 'yeni gələn işçilər üçün adi sinif'],
            ['II', 'uşağı ilə tək yaşayan valideynlər', 'əlavə güzəşt'],
            ['III', 'hər ikisi Almaniyada yaşayan ər-arvad: daha çox qazanan tərəf', 'yalnız həyat yoldaşının V sinfi ilə birlikdə'],
            ['IV', 'gəlirləri təxminən eyni olan ər-arvad', 'evlilikdən sonra standart; əmsalla da mümkündür'],
            ['V', 'ər-arvaddan daha az qazanan tərəf', 'yüksək tutulma, III sinfin qarşılığı'],
            ['VI', 'ikinci və sonrakı iş yeri; işəgötürəndə hələ vergi nömrəsi yoxdursa', 'ən yüksək tutulma, vergidən azad minimum yoxdur'],
          ] } },
          { h3: 'Ər-arvad: III/V yoxsa IV/IV?' },
          'Hər iki həyat yoldaşı Almaniyada qeydiyyatdadırsa, avtomatik olaraq IV/IV verilir. Biri xeyli çox qazanırsa, cütlük vergi idarəsində III/V seçə bilər: çox qazananın aylıq xalis maaşı artır, digərininki azalır. Lakin ilin sonunda yalnız ümumi gəlir vergisi nəzərə alınır — vergi sinfi pulu sadəcə aylıq ödənişlərlə illik bəyannamə arasında yerdəyişir. III/V və ya əmsallı IV seçəndə illik bəyannamə vermək məcburidir və əlavə vergi ödəmək lazım gələ bilər.',
          { h3: 'Almaniyaya yeni gəlmisiniz: ilk ayda VI sinif' },
          'Vergi identifikasiya nömrəsi (Steuer-ID) yaşayış yerinin qeydiyyatından bir neçə həftə sonra poçtla gəlir. İşəgötürən onu alana qədər Gəlir Vergisi Qanununun § 39c maddəsinə görə VI sinfi tətbiq edir — gecikmə sizin günahınızdan deyilsə, o, üç aya qədər ehtimal olunan sinfi götürə bilər. Praktikada ilk maaş yenə də çox vaxt VI siniflə hesablanır. {{gross3000}} brutto maaşda bu, {{net3000}} əvəzinə cəmi təxminən {{net3000VI}} xalis deməkdir — {{diffVI}} az. Pul itmir: məlumatlar gələn kimi düzəldilir, ən gec illik bəyannamə ilə geri qaytarılır. Məsləhət: mənzili dərhal qeydiyyata salın və Steuer-ID-ni gələn kimi kadrlar şöbəsinə verin.',
          { h3: 'Həyat yoldaşınız hələ Azərbaycandadır?' },
          'Həyat yoldaşınız (hələ) Almaniyada deyil, məsələn, Azərbaycanda yaşayırsa, adətən I vergi sinfi verilir: III/V üçün hər ikiniz Almaniyada tam vergi ödəyicisi olmalısınız (AB/AİZ ölkələrində yaşayan həyat yoldaşları üçün xüsusi qaydalar var). Ailə birləşməsindən və həyat yoldaşınızın qeydiyyatından sonra sinif dəyişir. Xaricdəki həyat yoldaşına göndərdiyiniz maddi yardım müəyyən şərtlərlə illik vergi bəyannaməsində nəzərə alına bilər.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: '2026-cı ildə sosial sığorta haqları: dərəcələr',
        blocks: [
          { table: { head: ['Sığorta', 'Ümumi dərəcə', 'Sizin payınız (işçi)'], rows: [
            ['Pensiya sığortası', '18,6 %', '9,3 %'],
            ['İşsizlik sığortası', '2,6 %', '1,3 %'],
            ['Tibbi sığorta', '14,6 % + əlavə haqq (2026-da orta hesabla {{zusatz}})', '7,3 % + əlavə haqqın yarısı (orta hesabla {{zusatzHalf}})'],
            ['Qulluq sığortası (Pflegeversicherung)', '3,6 %', '1,8 % (Saksoniya 2,3 %); 23 yaşdan uşaqsızlar: 2,4 % (Saksoniya 2,9 %)'],
          ] } },
          '**Əlavə haqqı** (Zusatzbeitrag) hər tibbi sığorta kassası özü müəyyən edir; {{zusatz}} Almaniya Səhiyyə Nazirliyinin 2026-cı il üçün elan etdiyi orta göstəricidir. Bir çox kassa daha çox, bəziləri daha az tələb edir — kalkulyatorda öz kassanızın dərəcəsini yaza bilərsiniz.',
          '**Qulluq sığortasında** 23 yaşdan yuxarı uşaqsız işçilər 0,6 faiz bəndi əlavə ödəyir. Valideynlər əlavə ödəmir, 25 yaşınadək ikinci uşaqdan başlayaraq isə hər uşaq üçün dərəcə 0,25 bənd azalır (beşinci uşağa qədər). Saksoniyada işçinin payı 0,5 bənd yüksəkdir, çünki orada qulluq sığortasını maliyyələşdirmək üçün bayram günü ləğv edilməyib.',
          'Cəmi: orta əlavə haqqı olan uşaqsız işçi brutto maaşının təxminən 21,75 %-ni sosial sığortaya ödəyir — adətən gəlir vergisindən çox.',
        ],
      },
      {
        id: 'grenzen',
        h2: '2026-cı il üçün sığorta tavanları və digər hədlər',
        blocks: [
          'Sığorta haqları yalnız tavana (Beitragsbemessungsgrenze) qədər hesablanır. Maaşın tavandan yuxarı hissəsindən sosial sığorta haqqı tutulmur.',
          { table: { head: ['2026 göstəricisi', 'aylıq', 'illik'], rows: [
            ['Pensiya və işsizlik sığortası tavanı', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Tibbi və qulluq sığortası tavanı', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Məcburi sığorta həddi (ondan yuxarı özəl tibbi sığorta mümkündür)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Minijob həddi', '{{minijob}}', '–'],
            ['Keçid zonası (Midijob, işçi üçün azaldılmış haqlar)', '{{midijob}} qədər', '–'],
            ['Vergidən azad minimum (gəlir vergisi)', '–', '{{gfb}}'],
          ] } },
          'Pensiya sığortası tavanı ({{bbgRv}}) həm də AB Mavi Kartının maaş hədlərinin əsasıdır: onun 50 %-i 2026-cı il üçün 50 700 € həddini, 45,3 %-i isə kadr çatışmazlığı olan peşələr və yeni məzunlar üçün 45 934,20 € həddini verir. Təklifinizi [Mavi Kart yoxlamasında](/blue-card-check) yoxlayın.',
        ],
      },
      {
        id: 'beispiele',
        h2: '2026 üçün hesablama nümunələri: TIR sürücüsü, tibb bacısı, elektrik',
        blocks: [
          'Namizədlərimizin Almaniyada başladığı tipik maaşlar — məhz yuxarıdakı kalkulyatorla hesablanıb (dövlət tibbi sığortası, orta əlavə haqq {{zusatz}}, kilsə vergisi yoxdur, yaş 30):',
          { slot: 'examples' },
          'Gördüyünüz kimi, vergi sinfi xalis maaşa federal ştatdan qat-qat çox təsir edir. Uşaq pulu (Kindergeld, hər uşaq üçün ayda {{kindergeld}}) xalis maaşa daxil deyil — onu Ailə kassası ayrıca ödəyir.',
        ],
      },
      {
        id: 'tipps',
        h2: 'Daha çox xalis maaş: yeni işçilər nəyi bilməlidir',
        blocks: [
          { ul: [
            '**Vergi bəyannaməsi verin**: işə gediş-gəliş, köçmə xərcləri, iş ləvazimatı, ikinci mənzil və ya həmkarlar ittifaqı haqları birlikdə sabit güzəşti ({{anp}}) keçəndə vergini azaldır. Gəldiyiniz ildə çox vaxt pulun bir hissəsi geri qaytarılır.',
            '**Tibbi sığorta kassalarını müqayisə edin**: bir bənd aşağı əlavə haqq {{gross3000}} brutto maaşda ayda təxminən 15 € artıq xalis deməkdir.',
            '**Dininizi düzgün göstərin**: yaşayış yerini qeydiyyata salanda dini mənsubiyyət qeyd olunur. Kilsə vergisini yalnız bu vergini toplayan kilsələrin üzvləri ödəyir.',
            '**Brutto maaşları düzgün müqayisə edin**: 13-cü maaş, gecə və bazar günü əlavələri (qismən vergisiz) və ya sürücülərin gündəlik pulları real xalis məbləği dəyişir. Müsahibədə illik brutto maaşı soruşun.',
          ] },
          'Maaşı göstərilən vakansiyaları [iş elanlarımızda](/jobs) tapa bilərsiniz; Almaniyada ilk ayın nə qədər başa gələcəyini [büdcə kalkulyatoru](/budget) göstərir.',
        ],
      },
    ],
    faqTitle: 'Almaniyada xalis maaş haqqında tez-tez verilən suallar',
    faq: [
      { q: '2026-cı ildə 3000 € brutto maaşdan nə qədər xalis qalır?', a: 'I vergi sinfində, uşaqsız, kilsə vergisi olmadan və orta əlavə haqla ayda təxminən {{net3000}}. III sinifdə xeyli çox, VI sinifdə isə xeyli az qalır.' },
      { q: 'Almaniyaya köçəndən sonra hansı vergi sinfində olacağam?', a: 'Subaylar və həyat yoldaşı hələ xaricdə yaşayan evlilər adətən I sinifdə olur. İşəgötürən Steuer-ID-nizi alana qədər VI sinfi tətbiq edə bilər; artıq tutulan vergi sonra düzəldilir.' },
      { q: 'Həyat yoldaşım hələ Almaniyada yaşamırsa, III sinif ala bilərəmmi?', a: 'Bir qayda olaraq, yox. III/V üçün hər iki həyat yoldaşı Almaniyada tam vergi ödəyicisi olmalıdır (AB/AİZ-də yaşayanlar üçün xüsusi qaydalar var). Ailə birləşməsindən sonra sinifləri dəyişmək olar.' },
      { q: '2026-cı ildə sosial sığorta haqları nə qədərdir?', a: 'İşçi pensiyaya 9,3 %, işsizlik sığortasına 1,3 %, tibbi sığortaya 7,3 % üstəgəl əlavə haqqın yarısı (orta hesabla {{zusatz}}) və qulluq sığortasına 1,8 % (23 yaşdan uşaqsızlar 2,4 %) ödəyir — cəmi bruttonun təxminən 21–22 %-i.' },
      { q: '2026-cı ildə sığorta tavanları nə qədərdir?', a: 'Pensiya və işsizlik sığortası: ayda {{bbgRvMonth}} (ildə {{bbgRv}}); tibbi və qulluq sığortası: ayda {{bbgKvMonth}} (ildə {{bbgKv}}).' },
      { q: 'Kilsə vergisi ödəməliyəmmi?', a: 'Yalnız kilsə vergisi toplayan kilsənin və ya dini icmanın üzvüsünüzsə (ilk növbədə katolik və protestant kilsələri). Bavariya və Baden-Vürtemberqdə gəlir vergisinin 8 %-i, digər ştatlarda 9 %-i təşkil edir.' },
      { q: 'Kalkulyatorun nəticəsi qətidirmi?', a: 'Xeyr. Kalkulyator Almaniya Maliyyə Nazirliyinin 2026-cı il üçün rəsmi hesablama alqoritminə əsaslanır, lakin fərdi güzəştləri, birdəfəlik ödənişləri və özəl tibbi sığortanı nəzərə almır. Qəti olan maaş vərəqənizdir.' },
    ],
    sources: 'Vəziyyət: {{checked}}. Mənbələr: Almaniya Maliyyə Nazirliyi (BMF), Programmablaufplan Lohnsteuer 2026; Sosial sığortanın hesablama göstəriciləri haqqında 2026-cı il əsasnaməsi; Almaniya Səhiyyə Nazirliyi, 2026-cı il üçün orta əlavə haqq; EStG §§ 32a, 38b, 39c, 51a; SolZG § 3; SGB XI § 55.',
    labels: {
      job: 'Peşə', situation: 'Vəziyyət', gross: 'Brutto/ay', net: 'Xalis/ay', deductions: 'Tutulmalar',
      truck: 'TIR sürücüsü (CE)', truckVI: 'TIR sürücüsü, Steuer-ID-siz ilk ay', nurse: 'Tibb bacısı/qardaşı', nurseIII: 'Tibb bacısı/qardaşı, evli', electrician: 'Elektrik',
      class: 'sinif', child: '1 uşaq', noChild: 'uşaq yoxdur',
    },
  },

  tr: {
    eyebrow: '2026’da brütten nete',
    sections: [
      {
        id: 'brutto-netto',
        h2: 'Brütten nete: Almanya’da 2026’da maaş nasıl hesaplanır?',
        blocks: [
          'Almanya’da vergi ve sosyal sigorta primlerini işveren her ay doğrudan brüt maaştan keser ve vergi dairesine ve sağlık sigortası kasasına öder. Hesabınıza yalnızca net maaş yatar. Yukarıdaki hesaplayıcı bu bordroyu 2026’nın resmî değerleriyle birebir hesaplar.',
          { ol: [
            '**Sosyal sigorta primleri**: emeklilik, işsizlik, sağlık ve bakım sigortası brüt maaşın yüzdesi olarak, her biri kendi tavanına kadar hesaplanır. Diğer yarısını (neredeyse her zaman) işveren öder.',
            '**Gelir vergisi (Lohnsteuer)**: vergi tarifesine ve vergi sınıfınıza bağlıdır. 2026’da yıllık {{gfb}} temel muafiyet, çalışan götürü gideri ({{anp}}) ve sigorta primleriniz için bir indirim vergilendirilmez.',
            '**Dayanışma vergisi (Soli)**: gelir vergisinin %5,5’i; ancak yıllık gelir vergisi {{soliFree}} tutarını aştığında (bekârlar). Bu yüzden çalışanların büyük çoğunluğu Soli ödemez.',
            '**Kilise vergisi**: gelir vergisinin %8’i (Bavyera, Baden-Württemberg) veya %9’u (diğer eyaletler); yalnızca bu vergiyi toplayan bir kilisenin üyeleri öder.',
          ] },
          'Pratik kural: kamu sağlık sigortalı, çocuksuz bekâr bir çalışan I. vergi sınıfında {{gross3000}} brüt maaştan yaklaşık {{net3000}} net alır; bu da brütün yaklaşık {{share3000}}’i demektir.',
        ],
      },
      {
        id: 'steuerklassen',
        h2: 'Altı vergi sınıfı: kim hangisine girer?',
        blocks: [
          'Vergi sınıfı (Steuerklasse, Gelir Vergisi Kanunu § 38b) işverenin her ay ne kadar vergi keseceğini belirler. Başvuru gerekmez: vergi dairesi kayıt bilgilerinize göre bunu işverene elektronik olarak (ELStAM) iletir.',
          { table: { head: ['Sınıf', 'Kimler için', 'Not'], rows: [
            ['I', 'bekârlar, boşanmışlar; eşi Almanya’da yaşamayan evliler', 'yeni gelen çalışanlar için olağan sınıf'],
            ['II', 'çocuğuyla birlikte yaşayan tek ebeveynler', 'ek indirim'],
            ['III', 'ikisi de Almanya’da yaşayan evliler: daha çok kazanan eş', 'yalnızca eşin V. sınıfıyla birlikte'],
            ['IV', 'gelirleri benzer olan evliler', 'evlilikten sonra standart; faktörle de mümkün'],
            ['V', 'evliler: daha az kazanan eş', 'yüksek kesinti, III’ün karşılığı'],
            ['VI', 'ikinci ve sonraki işler; işverende henüz vergi numarası yoksa', 'en yüksek kesinti, temel muafiyet yok'],
          ] } },
          { h3: 'Evli çiftler: III/V mi, IV/IV mü?' },
          'İki eş de Almanya’da kayıtlıysa otomatik olarak IV/IV verilir. Biri belirgin şekilde daha fazla kazanıyorsa çift vergi dairesinde III/V’yi seçebilir: çok kazananın aylık neti artar, diğerininki azalır. Ancak yıl sonunda yalnızca ortak gelir vergisi önemlidir; vergi sınıfı parayı sadece aylık bordrolar ile vergi beyannamesi arasında kaydırır. III/V veya faktörlü IV’te beyanname zorunludur ve ek ödeme çıkabilir.',
          { h3: 'Almanya’ya yeni geldiyseniz: ilk ayda VI. sınıf' },
          'Vergi kimlik numarası (Steuer-ID) adres kaydından birkaç hafta sonra posta ile gelir. İşveren bu numarayı alana kadar Gelir Vergisi Kanunu § 39c’ye göre VI. sınıfı uygular; gecikme sizin kusurunuzdan değilse en fazla üç ay boyunca beklenen sınıfı esas alabilir. Uygulamada ilk maaş yine de çoğu zaman VI. sınıfla hesaplanır. {{gross3000}} brütte bu, {{net3000}} yerine yalnızca yaklaşık {{net3000VI}} net demektir; {{diffVI}} daha az. Para kaybolmaz: bilgiler gelince düzeltilir, en geç vergi beyannamesiyle iade edilir. İpucu: adres kaydını hemen yaptırın ve Steuer-ID’yi gelir gelmez insan kaynaklarına verin.',
          { h3: 'Eşiniz hâlâ memleketinizde mi?' },
          'Eşiniz (henüz) Almanya’da değil de örneğin Türkiye’de yaşıyorsa genellikle I. sınıf verilir: III/V için iki eşin de Almanya’da tam mükellef olması gerekir (AB/AEA’da yaşayan eşler için özel kurallar vardır). Aile birleşimi ve eşinizin adres kaydından sonra sınıf değişir. Yurt dışındaki eşinize gönderdiğiniz nafaka/destek, belirli koşullarda vergi beyannamesinde dikkate alınabilir.',
        ],
      },
      {
        id: 'sozialabgaben',
        h2: '2026 sosyal sigorta primleri: oranlar',
        blocks: [
          { table: { head: ['Sigorta', 'Toplam oran', 'Sizin payınız (çalışan)'], rows: [
            ['Emeklilik sigortası', '%18,6', '%9,3'],
            ['İşsizlik sigortası', '%2,6', '%1,3'],
            ['Sağlık sigortası', '%14,6 + ek prim (2026 ortalaması: {{zusatz}})', '%7,3 + ek primin yarısı (ort. {{zusatzHalf}})'],
            ['Bakım sigortası (Pflegeversicherung)', '%3,6', '%1,8 (Saksonya %2,3); 23 yaşından itibaren çocuksuzlar: %2,4 (Saksonya %2,9)'],
          ] } },
          '**Ek primi** (Zusatzbeitrag) her sağlık sigortası kasası kendisi belirler; {{zusatz}}, Federal Sağlık Bakanlığı’nın 2026 için açıkladığı ortalamadır. Birçok kasa daha fazla, bazıları daha az alır; hesaplayıcıya kendi kasanızın oranını girebilirsiniz.',
          '**Bakım sigortasında** 23 yaş üstü çocuksuz çalışanlar 0,6 puan ek öder. Ebeveynler ek ödemez; 25 yaşından küçük ikinci çocuktan itibaren her çocuk için oran 0,25 puan düşer (beşinci çocuğa kadar). Saksonya’da çalışan payı 0,5 puan daha yüksektir, çünkü orada bakım sigortasını finanse etmek için bir resmî tatil kaldırılmamıştır.',
          'Toplamda ortalama ek primli çocuksuz bir çalışan brütün yaklaşık %21,75’ini sosyal sigortaya öder; bu genellikle gelir vergisinden fazladır.',
        ],
      },
      {
        id: 'grenzen',
        h2: '2026 prim tavanları ve diğer sınırlar',
        blocks: [
          'Primler yalnızca prim tavanına (Beitragsbemessungsgrenze) kadar alınır. Maaşın tavanı aşan kısmından sosyal sigorta primi kesilmez.',
          { table: { head: ['2026 değeri', 'aylık', 'yıllık'], rows: [
            ['Emeklilik ve işsizlik sigortası tavanı', '{{bbgRvMonth}}', '{{bbgRv}}'],
            ['Sağlık ve bakım sigortası tavanı', '{{bbgKvMonth}}', '{{bbgKv}}'],
            ['Zorunlu sigorta sınırı (üzerinde özel sağlık sigortası mümkün)', '{{jaegMonth}}', '{{jaeg}}'],
            ['Minijob sınırı', '{{minijob}}', '–'],
            ['Geçiş bölgesi (Midijob, düşük çalışan primleri)', '{{midijob}} tutarına kadar', '–'],
            ['Temel muafiyet (gelir vergisi)', '–', '{{gfb}}'],
          ] } },
          'Emeklilik tavanı ({{bbgRv}}) aynı zamanda AB Mavi Kart maaş sınırlarının da temelidir: bunun %50’si 2026 için 50.700 € sınırını, %45,3’ü ise eleman açığı olan meslekler ve yeni mezunlar için 45.934,20 € sınırını verir. Teklifinizi [Mavi Kart kontrolünde](/blue-card-check) kontrol edin.',
        ],
      },
      {
        id: 'beispiele',
        h2: '2026 hesaplama örnekleri: tır şoförü, hemşire, elektrikçi',
        blocks: [
          'Adaylarımızın Almanya’da başladığı tipik maaşlar; yukarıdaki hesaplayıcının aynısıyla hesaplandı (kamu sağlık sigortası, ortalama ek prim {{zusatz}}, kilise vergisi yok, 30 yaş):',
          { slot: 'examples' },
          'Görüldüğü gibi vergi sınıfı neti eyaletten çok daha fazla etkiler. Çocuk parası (Kindergeld, çocuk başına aylık {{kindergeld}}) nete dahil değildir; aile kasası ayrıca öder.',
        ],
      },
      {
        id: 'tipps',
        h2: 'Daha fazla net: yeni çalışanların bilmesi gerekenler',
        blocks: [
          { ul: [
            '**Vergi beyannamesi verin**: işe gidiş geliş, taşınma masrafları, iş malzemeleri, ikinci konut veya sendika aidatı toplamda çalışan götürü giderini ({{anp}}) aşarsa vergiyi düşürür. Geliş yılında çoğu zaman iade çıkar.',
            '**Sağlık kasalarını karşılaştırın**: bir puan düşük ek prim {{gross3000}} brütte ayda yaklaşık 15 € daha fazla net demektir.',
            '**Dininizi doğru beyan edin**: adres kaydında dinî aidiyet kaydedilir. Kilise vergisini yalnızca bu vergiyi toplayan kiliselerin üyeleri öder.',
            '**Brütleri doğru karşılaştırın**: 13. maaş, gece ve pazar zamları (kısmen vergisiz) veya şoförlerin harcırahları gerçek neti değiştirir. Mülakatta yıllık brütü sorun.',
          ] },
          'Maaş bilgisi olan ilanlar [iş ilanlarımızda](/jobs); Almanya’daki ilk ayın maliyetini [bütçe hesaplayıcısı](/budget) gösterir.',
        ],
      },
    ],
    faqTitle: 'Almanya’da net maaş hakkında sık sorulan sorular',
    faq: [
      { q: '2026’da 3.000 € brütten ne kadar net kalır?', a: 'I. vergi sınıfında, çocuksuz, kilise vergisi olmadan ve ortalama ek primle ayda yaklaşık {{net3000}}. III. sınıftaki evliler belirgin şekilde daha fazla, VI. sınıf ise belirgin şekilde daha az alır.' },
      { q: 'Almanya’ya taşınınca hangi vergi sınıfında olurum?', a: 'Bekârlar ve eşi hâlâ yurt dışında yaşayan evliler genellikle I. sınıfa girer. İşveren Steuer-ID’nizi alana kadar VI. sınıfı uygulayabilir; fazla kesilen vergi sonradan düzeltilir.' },
      { q: 'Eşim henüz Almanya’da yaşamıyorsa III. sınıfı alabilir miyim?', a: 'Genellikle hayır. III/V için iki eşin de Almanya’da tam mükellef olması gerekir (AB/AEA’daki eşler için özel kurallar vardır). Aile birleşiminden sonra sınıfları değiştirebilirsiniz.' },
      { q: '2026’da sosyal sigorta primleri ne kadar?', a: 'Çalışan %9,3 emeklilik, %1,3 işsizlik, %7,3 sağlık sigortası artı ek primin yarısını (ort. {{zusatz}}) ve %1,8 bakım sigortası (23 yaşından itibaren çocuksuzlar %2,4) öder; toplam brütün yaklaşık %21–22’si.' },
      { q: '2026 prim tavanları nedir?', a: 'Emeklilik ve işsizlik sigortası: aylık {{bbgRvMonth}} (yıllık {{bbgRv}}); sağlık ve bakım sigortası: aylık {{bbgKvMonth}} (yıllık {{bbgKv}}).' },
      { q: 'Kilise vergisi ödemek zorunda mıyım?', a: 'Yalnızca kilise vergisi toplayan bir kilisenin veya dinî topluluğun üyesiyseniz (başta Katolik ve Protestan kiliseleri). Bavyera ve Baden-Württemberg’de gelir vergisinin %8’i, diğer eyaletlerde %9’udur.' },
      { q: 'Hesaplayıcının sonucu bağlayıcı mı?', a: 'Hayır. Hesaplayıcı Federal Maliye Bakanlığı’nın 2026 resmî bordro algoritmasını izler; ancak kişisel muafiyetleri, tek seferlik ödemeleri ve özel sağlık sigortasını dikkate almaz. Bağlayıcı olan bordronuzdur.' },
    ],
    sources: 'Güncelleme: {{checked}}. Kaynaklar: Federal Maliye Bakanlığı (BMF), Programmablaufplan Lohnsteuer 2026; Sosyal Sigorta Hesap Büyüklükleri Yönetmeliği 2026; Federal Sağlık Bakanlığı, 2026 ortalama ek prim; EStG §§ 32a, 38b, 39c, 51a; SolZG § 3; SGB XI § 55.',
    labels: {
      job: 'Meslek', situation: 'Durum', gross: 'Brüt/ay', net: 'Net/ay', deductions: 'Kesintiler',
      truck: 'Tır şoförü (CE)', truckVI: 'Tır şoförü, Steuer-ID’siz ilk ay', nurse: 'Hemşire', nurseIII: 'Hemşire, evli', electrician: 'Elektrikçi',
      class: 'sınıf', child: '1 çocuk', noChild: 'çocuk yok',
    },
  },
};
