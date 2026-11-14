import type { LocalizedContent } from './types';

/**
 * Text under the Blue Card salary check (/blue-card-check). The thresholds are derived from the pension
 * contribution ceiling of the payroll parameters ({{bbg}} × 50 % / 45.3 %, § 18g Abs. 1 and 2 AufenthG) and match
 * the BMI notice of 2 December 2025 (BAnz AT 18.12.2025 B3: 50,700 € / 45,934.20 € for 2026); the unit test
 * checks both. Earlier years: ceiling 2024 90,600 € (West), 2025 96,600 €.
 * The 45+ rule (55 % of the ceiling, § 18 Abs. 2 Nr. 5 AufenthG) applies to first permits under § 18a / § 18b,
 * not to the Blue Card.
 */
export const BLUE_CARD_HISTORY = [
  { year: 2024, bbg: 90_600 },
  { year: 2025, bbg: 96_600 },
] as const;

export const blueCardContent: LocalizedContent = {
  de: {
    eyebrow: 'Mindestgehalt Blaue Karte 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'Blaue Karte EU: Mindestgehalt und Gehaltsgrenzen 2026',
        blocks: [
          'Für die Blaue Karte EU (§ 18g Aufenthaltsgesetz) muss das im Arbeitsvertrag vereinbarte **Bruttojahresgehalt** eine Mindestgrenze erreichen. 2026 gelten zwei Grenzen:',
          { table: { head: ['Gruppe', 'pro Jahr', 'pro Monat (÷ 12)', 'Zustimmung der Arbeitsagentur'], rows: [
            ['Regelfall (alle Berufe)', '{{standard}}', '{{standardMonth}}', 'nicht nötig'],
            ['Engpassberufe (z. B. IT, Ingenieure, Ärzte, Lehrkräfte)', '{{shortage}}', '{{shortageMonth}}', 'nötig'],
            ['Berufseinsteiger: Hochschulabschluss in den letzten 3 Jahren', '{{shortage}}', '{{shortageMonth}}', 'nötig'],
            ['IT-Fachkräfte ohne Abschluss: mind. 3 Jahre Erfahrung in den letzten 7 Jahren', '{{shortage}}', '{{shortageMonth}}', 'nötig'],
          ] } },
          'Das Gehalt muss für eine Beschäftigung von mindestens sechs Monaten zugesagt sein. Ein 13. Gehalt oder Sonderzahlungen zählen in der Regel nur mit, wenn sie im Vertrag fest garantiert sind; variable Boni und Überstunden meist nicht.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'Wie die Gehaltsgrenze berechnet wird',
        blocks: [
          'Die Grenzen sind an die **Beitragsbemessungsgrenze der gesetzlichen Rentenversicherung** gekoppelt und steigen deshalb jedes Jahr zum 1. Januar: Der Regelfall beträgt 50 %, die abgesenkte Grenze 45,3 % davon. Das Bundesministerium des Innern gibt die Beträge bis zum 31. Dezember des Vorjahres im Bundesanzeiger bekannt – für 2026 mit der Bekanntmachung vom 2. Dezember 2025.',
          { slot: 'history' },
          'Wer einen Vertrag mit Beginn im nächsten Jahr verhandelt, sollte etwas Abstand zur Grenze einplanen: Die Grenze für 2027 wird erst im Dezember 2026 bekannt gegeben.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Welche Berufe gelten als Engpassberufe?',
        blocks: [
          'Die niedrigere Grenze gilt für akademische Fachkräfte in diesen Berufsgruppen der internationalen Klassifikation ISCO-08:',
          { ul: [
            'Führungskräfte in Produktion, Bergbau, Bau und Logistik (132), in IT-Dienstleistungen (133) und in professionellen Dienstleistungen wie Pflege, Bildung oder Sozialarbeit (134)',
            'Naturwissenschaftler, Mathematiker und Ingenieure (21)',
            'Ärztinnen und Ärzte (221), akademische Pflege- und Hebammenberufe (222), Tierärzte (225), Zahnärzte, Apotheker und andere akademische Gesundheitsberufe (226)',
            'Lehrkräfte (23)',
            'Akademische IT-Fachkräfte, z. B. Softwareentwickler und Systemadministratoren (25)',
          ] },
          'Ohne Hochschulabschluss gibt es die Blaue Karte nur für IT-Berufe (Gruppen 133 und 25) mit mindestens drei Jahren vergleichbarer Berufserfahrung aus den letzten sieben Jahren.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Gehalt unter der Grenze – was nun?',
        blocks: [
          'Liegt das Angebot unter der jeweiligen Grenze, kommt oft die Aufenthaltserlaubnis für Fachkräfte mit Berufsausbildung (§ 18a) oder mit akademischer Ausbildung (§ 18b) infrage. Für sie gibt es keine feste Gehaltsgrenze; die Bedingungen müssen aber denen vergleichbarer deutscher Beschäftigter entsprechen. Ausnahme: Wer bei der ersten Erteilung 45 Jahre oder älter ist, braucht dort mindestens 55 % der Beitragsbemessungsgrenze ({{older}} im Jahr 2026) oder einen Nachweis über eine angemessene Altersversorgung.',
          'Was vom Gehalt netto bleibt, zeigt der [Brutto-Netto-Rechner](/salary-calculator): Bei {{standard}} brutto (Steuerklasse I, ohne Kinder und Kirchensteuer) sind es etwa {{netStandard}} im Monat.',
        ],
      },
    ],
    faqTitle: 'Häufige Fragen zum Mindestgehalt der Blauen Karte',
    faq: [
      { q: 'Wie hoch ist das Mindestgehalt der Blauen Karte 2026?', a: '{{standard}} brutto im Jahr im Regelfall; {{shortage}} für Engpassberufe, Berufseinsteiger mit Abschluss aus den letzten drei Jahren und IT-Fachkräfte ohne Abschluss.' },
      { q: 'Wie wird die Gehaltsgrenze berechnet?', a: 'Sie beträgt 50 % (bzw. 45,3 %) der jährlichen Beitragsbemessungsgrenze der Rentenversicherung. 2026 liegt diese bei {{bbg}}, daraus ergeben sich {{standard}} und {{shortage}}.' },
      { q: 'Wie hoch ist die Gehaltsgrenze pro Monat?', a: 'Bei 12 Monatsgehältern {{standardMonth}} im Regelfall und {{shortageMonth}} in den Engpassberufen. Maßgeblich ist aber immer das Jahresgehalt laut Vertrag.' },
      { q: 'Gilt die Grenze von 2026 auch für 2027?', a: 'Nein. Die Grenzen werden jedes Jahr neu festgesetzt und zum Jahresende im Bundesanzeiger bekannt gegeben; wir aktualisieren den Check, sobald die neuen Werte vorliegen.' },
      { q: 'Muss die Bundesagentur für Arbeit zustimmen?', a: 'Im Regelfall ab {{standard}} nicht. Bei der niedrigeren Grenze ({{shortage}}) muss sie zustimmen und prüft vor allem, ob Gehalt und Arbeitsbedingungen denen vergleichbarer inländischer Beschäftigter entsprechen.' },
    ],
    sources: 'Stand: {{checked}}. Quellen: § 18g AufenthG; Bekanntmachung des Bundesministeriums des Innern zu § 18g AufenthG vom 2. Dezember 2025 (BAnz AT 18.12.2025 B3); Sozialversicherungs-Rechengrößenverordnung 2026; § 18 Abs. 2 Nr. 5 AufenthG.',
    labels: { year: 'Jahr', bbg: 'Beitragsbemessungsgrenze RV', standard: 'Regelfall (50 %)', shortage: 'Engpass/Einsteiger/IT (45,3 %)' },
  },

  en: {
    eyebrow: 'Blue Card minimum salary 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'EU Blue Card Germany: minimum salary and thresholds 2026',
        blocks: [
          'For the EU Blue Card (section 18g of the Residence Act) the **gross annual salary** in the employment contract must reach a minimum. Two thresholds apply in 2026:',
          { table: { head: ['Group', 'per year', 'per month (÷ 12)', 'Employment Agency approval'], rows: [
            ['Standard (all occupations)', '{{standard}}', '{{standardMonth}}', 'not needed'],
            ['Shortage occupations (e.g. IT, engineers, doctors, teachers)', '{{shortage}}', '{{shortageMonth}}', 'needed'],
            ['Recent graduates: degree within the last 3 years', '{{shortage}}', '{{shortageMonth}}', 'needed'],
            ['IT specialists without a degree: at least 3 years’ experience in the last 7', '{{shortage}}', '{{shortageMonth}}', 'needed'],
          ] } },
          'The salary must be promised for a job of at least six months. A 13th salary or bonuses usually only count if the contract guarantees them; variable bonuses and overtime usually do not.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'How the salary threshold is calculated',
        blocks: [
          'The thresholds are tied to the **contribution ceiling of the statutory pension insurance**, so they rise every 1 January: the standard threshold is 50 % of it, the lower one 45.3 %. The Federal Ministry of the Interior publishes the amounts in the Federal Gazette by 31 December of the previous year; for 2026 in its notice of 2 December 2025.',
          { slot: 'history' },
          'If you negotiate a contract that starts next year, leave some room above the threshold: the 2027 figure is only published in December 2026.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Which occupations count as shortage occupations?',
        blocks: [
          'The lower threshold applies to professionals with a degree in these groups of the international classification ISCO-08:',
          { ul: [
            'managers in production, mining, construction and logistics (132), in ICT services (133) and in professional services such as care, education or social work (134)',
            'science, mathematics and engineering professionals (21)',
            'medical doctors (221), nursing and midwifery professionals (222), veterinarians (225), dentists, pharmacists and other health professionals (226)',
            'teaching professionals (23)',
            'ICT professionals such as software developers and system administrators (25)',
          ] },
          'Without a degree the Blue Card is only possible in IT occupations (groups 133 and 25) with at least three years of comparable professional experience gained in the last seven years.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Salary below the threshold: what now?',
        blocks: [
          'If the offer is below the relevant threshold, a residence permit for skilled workers with vocational training (section 18a) or a degree (section 18b) is often possible. There is no fixed salary threshold for these, but the conditions must match those of comparable German employees. Exception: applicants aged 45 or over at the first permit need at least 55 % of the contribution ceiling ({{older}} in 2026) or proof of adequate retirement provision.',
          'What is left net is shown by the [net salary calculator](/salary-calculator): on {{standard}} gross (tax class I, no children, no church tax) about {{netStandard}} a month.',
        ],
      },
    ],
    faqTitle: 'Frequently asked questions about the Blue Card salary',
    faq: [
      { q: 'What is the EU Blue Card minimum salary in Germany in 2026?', a: '{{standard}} gross a year in the standard case; {{shortage}} for shortage occupations, recent graduates (degree within three years) and IT specialists without a degree.' },
      { q: 'How is the salary threshold calculated?', a: 'It is 50 % (or 45.3 %) of the annual pension contribution ceiling. In 2026 that ceiling is {{bbg}}, which gives {{standard}} and {{shortage}}.' },
      { q: 'What is the threshold per month?', a: 'With 12 monthly salaries {{standardMonth}} in the standard case and {{shortageMonth}} in shortage occupations. The annual salary in the contract is what counts.' },
      { q: 'Does the 2026 threshold also apply in 2027?', a: 'No. The thresholds are set anew every year and published in the Federal Gazette at the end of the year; we update the check as soon as the new values are out.' },
      { q: 'Does the Federal Employment Agency have to approve?', a: 'Not in the standard case from {{standard}}. At the lower threshold ({{shortage}}) it must approve and mainly checks that pay and conditions match those of comparable domestic employees.' },
    ],
    sources: 'As of {{checked}}. Sources: section 18g Residence Act; notice of the Federal Ministry of the Interior on section 18g of 2 December 2025 (BAnz AT 18.12.2025 B3); Social Insurance Calculation Values Ordinance 2026; section 18(2) no. 5 Residence Act.',
    labels: { year: 'Year', bbg: 'Pension contribution ceiling', standard: 'Standard (50 %)', shortage: 'Shortage/graduates/IT (45.3 %)' },
  },

  ru: {
    eyebrow: 'Минимальная зарплата для Голубой карты 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'Голубая карта ЕС в Германии: минимальная зарплата и пороги 2026',
        blocks: [
          'Для Голубой карты ЕС (§ 18g Закона о пребывании) **годовая зарплата брутто** по трудовому договору должна достигать минимального порога. В 2026 году действуют два порога:',
          { table: { head: ['Группа', 'в год', 'в месяц (÷ 12)', 'Согласие агентства по труду'], rows: [
            ['Стандартный случай (все профессии)', '{{standard}}', '{{standardMonth}}', 'не нужно'],
            ['Дефицитные профессии (ИТ, инженеры, врачи, учителя и др.)', '{{shortage}}', '{{shortageMonth}}', 'нужно'],
            ['Молодые специалисты: диплом получен за последние 3 года', '{{shortage}}', '{{shortageMonth}}', 'нужно'],
            ['ИТ-специалисты без диплома: не менее 3 лет опыта за последние 7 лет', '{{shortage}}', '{{shortageMonth}}', 'нужно'],
          ] } },
          'Зарплата должна быть обещана за работу сроком не менее шести месяцев. 13-я зарплата или премии обычно учитываются, только если они твёрдо гарантированы договором; переменные бонусы и сверхурочные — как правило, нет.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'Как рассчитывается порог зарплаты',
        blocks: [
          'Пороги привязаны к **предельной базе взносов в пенсионное страхование** и поэтому растут каждый год 1 января: стандартный порог — 50 % от неё, пониженный — 45,3 %. Министерство внутренних дел публикует суммы в Федеральном вестнике (Bundesanzeiger) до 31 декабря предыдущего года; на 2026 год — уведомлением от 2 декабря 2025 года.',
          { slot: 'history' },
          'Если вы обсуждаете договор с началом в следующем году, оставьте запас над порогом: порог на 2027 год опубликуют только в декабре 2026-го.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Какие профессии считаются дефицитными?',
        blocks: [
          'Пониженный порог действует для специалистов с высшим образованием из этих групп международного классификатора ISCO-08:',
          { ul: [
            'руководители в производстве, горном деле, строительстве и логистике (132), в ИТ-услугах (133) и в профессиональных услугах — уход, образование, соцработа (134)',
            'учёные-естественники, математики и инженеры (21)',
            'врачи (221), медсёстры и акушерки с высшим образованием (222), ветеринары (225), стоматологи, фармацевты и другие медицинские специалисты (226)',
            'учителя и преподаватели (23)',
            'ИТ-специалисты — разработчики ПО, системные администраторы и др. (25)',
          ] },
          'Без высшего образования Голубая карта возможна только в ИТ-профессиях (группы 133 и 25) при не менее чем трёх годах сопоставимого опыта за последние семь лет.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Зарплата ниже порога — что делать?',
        blocks: [
          'Если предложение ниже соответствующего порога, часто подходит вид на жительство для специалистов с профобразованием (§ 18a) или с высшим образованием (§ 18b). Фиксированного порога там нет, но условия должны соответствовать условиям сопоставимых немецких работников. Исключение: кому при первой выдаче 45 лет или больше, нужно не менее 55 % предельной базы ({{older}} в 2026 году) или подтверждение достаточного пенсионного обеспечения.',
          'Сколько останется нетто, покажет [калькулятор нетто](/salary-calculator): при {{standard}} брутто (I класс, без детей и церковного налога) — около {{netStandard}} в месяц.',
        ],
      },
    ],
    faqTitle: 'Частые вопросы о зарплате для Голубой карты',
    faq: [
      { q: 'Какая минимальная зарплата для Голубой карты в 2026 году?', a: '{{standard}} брутто в год в стандартном случае; {{shortage}} для дефицитных профессий, молодых специалистов (диплом не старше трёх лет) и ИТ-специалистов без диплома.' },
      { q: 'Как рассчитывается порог?', a: 'Это 50 % (или 45,3 %) годовой предельной базы взносов в пенсионное страхование. В 2026 году она составляет {{bbg}}, отсюда {{standard}} и {{shortage}}.' },
      { q: 'Какой порог в месяц?', a: 'При 12 зарплатах — {{standardMonth}} в стандартном случае и {{shortageMonth}} для дефицитных профессий. Решающей всегда остаётся годовая зарплата по договору.' },
      { q: 'Действует ли порог 2026 года в 2027-м?', a: 'Нет. Пороги устанавливают заново каждый год и публикуют в конце года в Bundesanzeiger; мы обновим проверку, как только появятся новые значения.' },
      { q: 'Нужно ли согласие Федерального агентства по труду?', a: 'В стандартном случае от {{standard}} — нет. При пониженном пороге ({{shortage}}) оно нужно: агентство проверяет прежде всего, соответствуют ли зарплата и условия условиям сопоставимых местных работников.' },
    ],
    sources: 'По состоянию на {{checked}}. Источники: § 18g AufenthG; уведомление МВД Германии к § 18g AufenthG от 2 декабря 2025 г. (BAnz AT 18.12.2025 B3); Постановление о расчётных величинах соцстрахования 2026; § 18 абз. 2 п. 5 AufenthG.',
    labels: { year: 'Год', bbg: 'Предельная база пенс. страхования', standard: 'Стандарт (50 %)', shortage: 'Дефицит/выпускники/ИТ (45,3 %)' },
  },

  uk: {
    eyebrow: 'Мінімальна зарплата для Блакитної карти 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'Блакитна карта ЄС у Німеччині: мінімальна зарплата й пороги 2026',
        blocks: [
          'Для Блакитної карти ЄС (§ 18g Закону про перебування) **річна зарплата брутто** за трудовим договором має сягати мінімального порогу. У 2026 році діють два пороги:',
          { table: { head: ['Група', 'на рік', 'на місяць (÷ 12)', 'Згода агентства з праці'], rows: [
            ['Стандартний випадок (усі професії)', '{{standard}}', '{{standardMonth}}', 'не потрібна'],
            ['Дефіцитні професії (ІТ, інженери, лікарі, вчителі тощо)', '{{shortage}}', '{{shortageMonth}}', 'потрібна'],
            ['Молоді фахівці: диплом здобуто за останні 3 роки', '{{shortage}}', '{{shortageMonth}}', 'потрібна'],
            ['ІТ-фахівці без диплома: щонайменше 3 роки досвіду за останні 7 років', '{{shortage}}', '{{shortageMonth}}', 'потрібна'],
          ] } },
          'Зарплату мають гарантувати за роботу строком щонайменше шість місяців. 13-та зарплата чи премії зазвичай враховуються, лише якщо договір їх твердо гарантує; змінні бонуси та понаднормові — як правило, ні.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'Як розраховується поріг зарплати',
        blocks: [
          'Пороги прив’язані до **граничної межі внесків до пенсійного страхування**, тому зростають щороку 1 січня: стандартний поріг — 50 % від неї, знижений — 45,3 %. Міністерство внутрішніх справ оприлюднює суми у Федеральному віснику (Bundesanzeiger) до 31 грудня попереднього року; на 2026 рік — повідомленням від 2 грудня 2025 року.',
          { slot: 'history' },
          'Якщо ви обговорюєте договір із початком наступного року, залиште запас над порогом: поріг на 2027 рік оприлюднять лише у грудні 2026-го.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Які професії вважаються дефіцитними?',
        blocks: [
          'Знижений поріг діє для фахівців із вищою освітою з цих груп міжнародного класифікатора ISCO-08:',
          { ul: [
            'керівники у виробництві, гірництві, будівництві й логістиці (132), в ІТ-послугах (133) і в професійних послугах — догляд, освіта, соцробота (134)',
            'науковці-природничники, математики та інженери (21)',
            'лікарі (221), медсестри й акушерки з вищою освітою (222), ветеринари (225), стоматологи, фармацевти та інші медичні фахівці (226)',
            'вчителі та викладачі (23)',
            'ІТ-фахівці — розробники ПЗ, системні адміністратори тощо (25)',
          ] },
          'Без вищої освіти Блакитна карта можлива лише в ІТ-професіях (групи 133 і 25) за щонайменше трьох років порівнянного досвіду за останні сім років.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Зарплата нижча за поріг — що робити?',
        blocks: [
          'Якщо пропозиція нижча за відповідний поріг, часто підходить дозвіл на проживання для фахівців із професійною освітою (§ 18a) або з вищою освітою (§ 18b). Фіксованого порогу там немає, але умови мають відповідати умовам порівнянних німецьких працівників. Виняток: кому під час першого видання 45 років або більше, потрібно щонайменше 55 % граничної межі ({{older}} у 2026 році) або підтвердження належного пенсійного забезпечення.',
          'Скільки залишиться нетто, покаже [калькулятор нетто](/salary-calculator): за {{standard}} брутто (I клас, без дітей і церковного податку) — близько {{netStandard}} на місяць.',
        ],
      },
    ],
    faqTitle: 'Часті запитання про зарплату для Блакитної карти',
    faq: [
      { q: 'Яка мінімальна зарплата для Блакитної карти у 2026 році?', a: '{{standard}} брутто на рік у стандартному випадку; {{shortage}} для дефіцитних професій, молодих фахівців (диплом не старший за три роки) та ІТ-фахівців без диплома.' },
      { q: 'Як розраховується поріг?', a: 'Це 50 % (або 45,3 %) річної граничної межі внесків до пенсійного страхування. У 2026 році вона становить {{bbg}}, звідси {{standard}} і {{shortage}}.' },
      { q: 'Який поріг на місяць?', a: 'За 12 зарплат — {{standardMonth}} у стандартному випадку та {{shortageMonth}} для дефіцитних професій. Вирішальною завжди лишається річна зарплата за договором.' },
      { q: 'Чи діє поріг 2026 року у 2027-му?', a: 'Ні. Пороги встановлюють щороку заново й оприлюднюють наприкінці року в Bundesanzeiger; ми оновимо перевірку, щойно з’являться нові значення.' },
      { q: 'Чи потрібна згода Федерального агентства з праці?', a: 'У стандартному випадку від {{standard}} — ні. За зниженого порогу ({{shortage}}) вона потрібна: агентство перевіряє насамперед, чи відповідають зарплата й умови умовам порівнянних місцевих працівників.' },
    ],
    sources: 'Станом на {{checked}}. Джерела: § 18g AufenthG; повідомлення МВС Німеччини до § 18g AufenthG від 2 грудня 2025 р. (BAnz AT 18.12.2025 B3); Постанова про розрахункові величини соцстрахування 2026; § 18 абз. 2 п. 5 AufenthG.',
    labels: { year: 'Рік', bbg: 'Гранична межа пенс. страхування', standard: 'Стандарт (50 %)', shortage: 'Дефіцит/випускники/ІТ (45,3 %)' },
  },

  az: {
    eyebrow: 'Mavi Kart üçün minimum maaş 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'Almaniyada AB Mavi Kartı: 2026-cı il üçün minimum maaş və hədlər',
        blocks: [
          'AB Mavi Kartı (Yaşayış Qanununun § 18g maddəsi) üçün əmək müqaviləsindəki **illik brutto maaş** minimum həddə çatmalıdır. 2026-cı ildə iki hədd qüvvədədir:',
          { table: { head: ['Qrup', 'illik', 'aylıq (÷ 12)', 'Əmək agentliyinin razılığı'], rows: [
            ['Standart hal (bütün peşələr)', '{{standard}}', '{{standardMonth}}', 'lazım deyil'],
            ['Kadr çatışmazlığı olan peşələr (İT, mühəndislər, həkimlər, müəllimlər və s.)', '{{shortage}}', '{{shortageMonth}}', 'lazımdır'],
            ['Yeni məzunlar: diplom son 3 ildə alınıb', '{{shortage}}', '{{shortageMonth}}', 'lazımdır'],
            ['Diplomsuz İT mütəxəssisləri: son 7 ildə ən azı 3 il təcrübə', '{{shortage}}', '{{shortageMonth}}', 'lazımdır'],
          ] } },
          'Maaş ən azı altı ay davam edən iş üçün vəd olunmalıdır. 13-cü maaş və ya mükafatlar adətən yalnız müqavilədə qəti zəmanət veriləndə nəzərə alınır; dəyişkən bonuslar və əlavə iş saatları, bir qayda olaraq, sayılmır.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'Maaş həddi necə hesablanır',
        blocks: [
          'Hədlər **dövlət pensiya sığortası üzrə töhfə tavanına** bağlıdır və ona görə hər il 1 yanvarda artır: standart hədd onun 50 %-i, aşağı hədd isə 45,3 %-idir. Məbləğləri Almaniya Daxili İşlər Nazirliyi əvvəlki ilin 31 dekabrınadək Federal Bülletendə (Bundesanzeiger) dərc edir; 2026-cı il üçün — 2 dekabr 2025-ci il tarixli bildirişlə.',
          { slot: 'history' },
          'Növbəti ildən başlayan müqavilə barədə danışırsınızsa, həddən bir az yuxarı ehtiyat saxlayın: 2027-ci il üçün hədd yalnız 2026-cı ilin dekabrında elan olunacaq.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Hansı peşələr kadr çatışmazlığı olan peşələr sayılır?',
        blocks: [
          'Aşağı hədd beynəlxalq ISCO-08 təsnifatının bu qruplarındakı ali təhsilli mütəxəssislərə şamil olunur:',
          { ul: [
            'istehsal, mədən, tikinti və logistika rəhbərləri (132), İT xidmətləri rəhbərləri (133) və qulluq, təhsil, sosial iş kimi peşəkar xidmətlər üzrə rəhbərlər (134)',
            'təbiət elmləri mütəxəssisləri, riyaziyyatçılar və mühəndislər (21)',
            'həkimlər (221), ali təhsilli tibb bacıları və mamalar (222), baytarlar (225), stomatoloqlar, əczaçılar və digər səhiyyə mütəxəssisləri (226)',
            'müəllimlər (23)',
            'İT mütəxəssisləri — proqramçılar, sistem administratorları və s. (25)',
          ] },
          'Ali təhsil olmadan Mavi Kart yalnız İT peşələrində (133 və 25-ci qruplar), son yeddi ildə ən azı üç il müqayisəli iş təcrübəsi olduqda mümkündür.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Maaş həddən aşağıdırsa, nə etməli?',
        blocks: [
          'Təklif müvafiq həddən aşağıdırsa, çox vaxt peşə təhsilli (§ 18a) və ya ali təhsilli (§ 18b) mütəxəssislər üçün yaşayış icazəsi uyğun gəlir. Orada sabit maaş həddi yoxdur, amma şərtlər müqayisə edilə bilən alman işçilərinin şərtlərinə uyğun olmalıdır. İstisna: ilk icazə zamanı 45 yaş və yuxarı olanlara tavanın ən azı 55 %-i (2026-cı ildə {{older}}) və ya kifayət qədər pensiya təminatının sübutu lazımdır.',
          'Xalis məbləği [xalis maaş kalkulyatoru](/salary-calculator) göstərir: {{standard}} brutto maaşda (I sinif, uşaqsız, kilsə vergisi olmadan) ayda təxminən {{netStandard}}.',
        ],
      },
    ],
    faqTitle: 'Mavi Kart maaşı haqqında tez-tez verilən suallar',
    faq: [
      { q: '2026-cı ildə Mavi Kart üçün minimum maaş nə qədərdir?', a: 'Standart halda illik {{standard}} brutto; kadr çatışmazlığı olan peşələr, son üç ildə diplom almış yeni məzunlar və diplomsuz İT mütəxəssisləri üçün {{shortage}}.' },
      { q: 'Maaş həddi necə hesablanır?', a: 'Bu, pensiya sığortası üzrə illik töhfə tavanının 50 %-i (və ya 45,3 %-i) deməkdir. 2026-cı ildə tavan {{bbg}} təşkil edir, buradan {{standard}} və {{shortage}} alınır.' },
      { q: 'Aylıq hədd nə qədərdir?', a: '12 maaşla standart halda {{standardMonth}}, kadr çatışmazlığı olan peşələrdə isə {{shortageMonth}}. Həlledici həmişə müqavilədəki illik maaşdır.' },
      { q: '2026-cı il həddi 2027-ci ildə də qüvvədə olacaqmı?', a: 'Xeyr. Hədlər hər il yenidən müəyyən edilir və ilin sonunda Bundesanzeiger-də dərc olunur; yeni rəqəmlər çıxan kimi yoxlamanı yeniləyirik.' },
      { q: 'Federal Əmək Agentliyinin razılığı lazımdırmı?', a: 'Standart halda {{standard}} məbləğindən yuxarı — xeyr. Aşağı hədddə ({{shortage}}) razılıq lazımdır: agentlik ilk növbədə maaş və iş şəraitinin müqayisə edilə bilən yerli işçilərinkinə uyğun olub-olmadığını yoxlayır.' },
    ],
    sources: 'Vəziyyət: {{checked}}. Mənbələr: AufenthG § 18g; Almaniya Daxili İşlər Nazirliyinin § 18g üzrə 2 dekabr 2025-ci il tarixli bildirişi (BAnz AT 18.12.2025 B3); Sosial sığortanın hesablama göstəriciləri haqqında 2026-cı il əsasnaməsi; AufenthG § 18 bənd 2 yarımbənd 5.',
    labels: { year: 'İl', bbg: 'Pensiya sığortası tavanı', standard: 'Standart (50 %)', shortage: 'Çatışmazlıq/məzun/İT (45,3 %)' },
  },

  tr: {
    eyebrow: 'Mavi Kart asgari maaşı 2026',
    sections: [
      {
        id: 'grenzen-2026',
        h2: 'Almanya’da AB Mavi Kart: 2026 asgari maaş ve maaş sınırları',
        blocks: [
          'AB Mavi Kart (İkamet Kanunu § 18g) için iş sözleşmesindeki **yıllık brüt maaş** bir asgari sınıra ulaşmalıdır. 2026’da iki sınır geçerlidir:',
          { table: { head: ['Grup', 'yıllık', 'aylık (÷ 12)', 'İş Ajansı onayı'], rows: [
            ['Standart durum (tüm meslekler)', '{{standard}}', '{{standardMonth}}', 'gerekmez'],
            ['Eleman açığı olan meslekler (BT, mühendisler, doktorlar, öğretmenler vb.)', '{{shortage}}', '{{shortageMonth}}', 'gerekir'],
            ['Yeni mezunlar: diploma son 3 yıl içinde alınmış', '{{shortage}}', '{{shortageMonth}}', 'gerekir'],
            ['Diplomasız BT uzmanları: son 7 yılda en az 3 yıl deneyim', '{{shortage}}', '{{shortageMonth}}', 'gerekir'],
          ] } },
          'Maaş en az altı ay sürecek bir iş için taahhüt edilmelidir. 13. maaş veya ikramiyeler genellikle yalnızca sözleşmede kesin olarak garanti edilmişse sayılır; değişken primler ve fazla mesai çoğu zaman sayılmaz.',
        ],
      },
      {
        id: 'berechnung',
        h2: 'Maaş sınırı nasıl hesaplanır?',
        blocks: [
          'Sınırlar **yasal emeklilik sigortasının prim tavanına** bağlıdır ve bu yüzden her yıl 1 Ocak’ta yükselir: standart sınır bunun %50’si, düşük sınır %45,3’üdür. Federal İçişleri Bakanlığı tutarları bir önceki yılın 31 Aralık’ına kadar Federal Resmî Gazete’de (Bundesanzeiger) yayımlar; 2026 için 2 Aralık 2025 tarihli duyuruyla.',
          { slot: 'history' },
          'Gelecek yıl başlayacak bir sözleşme görüşüyorsanız sınırın biraz üzerinde pay bırakın: 2027 sınırı ancak Aralık 2026’da açıklanacak.',
        ],
      },
      {
        id: 'engpass',
        h2: 'Hangi meslekler eleman açığı olan meslek sayılır?',
        blocks: [
          'Düşük sınır, uluslararası ISCO-08 sınıflandırmasının şu gruplarındaki üniversite mezunu uzmanlar için geçerlidir:',
          { ul: [
            'üretim, madencilik, inşaat ve lojistik yöneticileri (132), BT hizmetleri yöneticileri (133) ve bakım, eğitim, sosyal hizmet gibi profesyonel hizmet yöneticileri (134)',
            'fen bilimciler, matematikçiler ve mühendisler (21)',
            'doktorlar (221), lisanslı hemşire ve ebeler (222), veterinerler (225), diş hekimleri, eczacılar ve diğer sağlık uzmanları (226)',
            'öğretmenler (23)',
            'BT uzmanları — yazılım geliştiriciler, sistem yöneticileri vb. (25)',
          ] },
          'Üniversite diploması olmadan Mavi Kart yalnızca BT mesleklerinde (133 ve 25. gruplar), son yedi yılda en az üç yıllık benzer mesleki deneyimle mümkündür.',
        ],
      },
      {
        id: 'darunter',
        h2: 'Maaş sınırın altındaysa ne olur?',
        blocks: [
          'Teklif ilgili sınırın altındaysa, çoğu zaman meslek eğitimli (§ 18a) veya üniversite mezunu (§ 18b) nitelikli çalışanlar için oturum izni mümkündür. Bunlarda sabit bir maaş sınırı yoktur, ancak koşulların benzer Alman çalışanlarınkine uygun olması gerekir. İstisna: ilk izin sırasında 45 yaşında veya daha büyük olanlar tavanın en az %55’ine (2026’da {{older}}) ya da yeterli emeklilik güvencesinin kanıtına ihtiyaç duyar.',
          'Netin ne kadar kalacağını [net maaş hesaplayıcısı](/salary-calculator) gösterir: {{standard}} brütte (I. sınıf, çocuksuz, kilise vergisi olmadan) ayda yaklaşık {{netStandard}}.',
        ],
      },
    ],
    faqTitle: 'Mavi Kart maaşı hakkında sık sorulan sorular',
    faq: [
      { q: '2026’da Almanya Mavi Kart asgari maaşı ne kadar?', a: 'Standart durumda yıllık {{standard}} brüt; eleman açığı olan meslekler, son üç yılda mezun olanlar ve diplomasız BT uzmanları için {{shortage}}.' },
      { q: 'Maaş sınırı nasıl hesaplanır?', a: 'Emeklilik sigortası yıllık prim tavanının %50’si (veya %45,3’ü). 2026’da bu tavan {{bbg}}; buradan {{standard}} ve {{shortage}} çıkar.' },
      { q: 'Aylık sınır ne kadar?', a: '12 maaşla standart durumda {{standardMonth}}, eleman açığı olan mesleklerde {{shortageMonth}}. Belirleyici olan her zaman sözleşmedeki yıllık maaştır.' },
      { q: '2026 sınırı 2027’de de geçerli mi?', a: 'Hayır. Sınırlar her yıl yeniden belirlenir ve yıl sonunda Bundesanzeiger’de yayımlanır; yeni değerler çıkar çıkmaz kontrolü güncelliyoruz.' },
      { q: 'Federal İş Ajansı’nın onayı gerekir mi?', a: 'Standart durumda {{standard}} ve üzerinde gerekmez. Düşük sınırda ({{shortage}}) onay gerekir; ajans özellikle maaş ve çalışma koşullarının benzer yerli çalışanlarınkine uygun olup olmadığını kontrol eder.' },
    ],
    sources: 'Güncelleme: {{checked}}. Kaynaklar: AufenthG § 18g; Federal İçişleri Bakanlığı’nın § 18g’ye ilişkin 2 Aralık 2025 tarihli duyurusu (BAnz AT 18.12.2025 B3); Sosyal Sigorta Hesap Büyüklükleri Yönetmeliği 2026; AufenthG § 18 fıkra 2 bent 5.',
    labels: { year: 'Yıl', bbg: 'Emeklilik prim tavanı', standard: 'Standart (%50)', shortage: 'Açık meslek/mezun/BT (%45,3)' },
  },
};
