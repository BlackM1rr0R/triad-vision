import type { ChancenkarteInput } from '../chancenkarte';
import type { LocalizedContent } from './types';

/**
 * Text under the Chancenkarte points calculator (/chancenkarte-calculator). Points and basic requirements as in
 * § 20a / § 20b AufenthG and the points table in the annex to the AufenthG (gesetze-im-internet.de, checked
 * 2026-11); livelihood amount 1,091 €/month net for 2026 as published by Make it in Germany. The worked examples
 * are scored by the calculator itself (lib/chancenkarte.ts) — the page fills the "examples" slot.
 */
export const CK_EXAMPLES: { id: string; input: ChancenkarteInput }[] = [
  { id: 'driver', input: { qualification: 'foreign', shortage: false, german: 'A2', english: 'none', experience: 'five', age: 'u35', stay: false, partner: false, funds: true } },
  { id: 'nurse', input: { qualification: 'partial', shortage: false, german: 'B1', english: 'none', experience: 'two', age: 'u35', stay: false, partner: false, funds: true } },
  { id: 'it', input: { qualification: 'foreign', shortage: true, german: 'none', english: 'C1', experience: 'five', age: 'u40', stay: false, partner: false, funds: true } },
  { id: 'electrician', input: { qualification: 'foreign', shortage: false, german: 'A1', english: 'none', experience: 'two', age: 'o40', stay: false, partner: false, funds: true } },
];

export const chancenkarteContent: LocalizedContent = {
  de: {
    eyebrow: 'Punktesystem erklärt',
    sections: [
      {
        id: 'punktesystem',
        h2: 'So funktioniert das Punktesystem der Chancenkarte',
        blocks: [
          'Die Chancenkarte (§ 20a Aufenthaltsgesetz) gibt es seit dem 1. Juni 2024. Mit ihr dürfen Fachkräfte aus Nicht-EU-Staaten bis zu einem Jahr in Deutschland eine Arbeit suchen – ohne vorher ein Jobangebot zu haben. Es gibt zwei Wege:',
          { ul: [
            '**Ohne Punkte**: Wer eine in Deutschland **voll anerkannte** Berufsausbildung oder einen anerkannten Hochschulabschluss hat, gilt als Fachkraft und bekommt die Chancenkarte ohne Punkte.',
            '**Mit Punkten**: Alle anderen müssen die Grundvoraussetzungen erfüllen und mindestens **6 Punkte** nach der Tabelle in § 20b AufenthG erreichen. Genau das rechnet der Punkterechner oben aus.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Grundvoraussetzungen (ohne sie zählen keine Punkte)',
        blocks: [
          { ul: [
            '**Berufsqualifikation**: eine im Herkunftsland staatlich anerkannte Berufsausbildung von mindestens zwei Jahren oder ein staatlich anerkannter Hochschulabschluss (oder ein Berufsabschluss einer deutschen Auslandshandelskammer). Ob Ausbildung bzw. Hochschule anerkannt sind, wird z. B. über anabin oder eine Zeugnisbewertung der ZAB nachgewiesen.',
            '**Sprache**: Deutsch mindestens auf Niveau A1 **oder** Englisch mindestens auf Niveau B2 – mit Zertifikat.',
            '**Lebensunterhalt**: Für 2026 nennt Make it in Germany mindestens 1.091 € netto im Monat, nachgewiesen z. B. mit einem Sperrkonto, einer Verpflichtungserklärung oder einem Vertrag über eine Nebenbeschäftigung. Maßgeblich ist der Betrag, den die Auslandsvertretung verlangt.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'Die Punktetabelle: wofür es Punkte gibt',
        blocks: [
          { table: { head: ['Kriterium', 'Punkte'], rows: [
            ['Teilanerkennung: die deutsche Stelle hat festgestellt, dass Ausgleichsmaßnahmen nötig sind (Defizitbescheid)', '4'],
            ['Deutsch B2 oder höher („gute Kenntnisse“)', '3'],
            ['Deutsch B1 („ausreichende Kenntnisse“)', '2'],
            ['Deutsch A2 („hinreichende Kenntnisse“)', '1'],
            ['Englisch C1 oder höher', '1'],
            ['Berufserfahrung: mind. 5 Jahre in den letzten 7 Jahren, nach dem Abschluss und im Beruf', '3'],
            ['Berufserfahrung: mind. 2 Jahre in den letzten 5 Jahren', '2'],
            ['Qualifikation in einer Engpass-Berufsgruppe (wie bei der Blauen Karte)', '1'],
            ['Alter: nicht älter als 35 Jahre', '2'],
            ['Alter: älter als 35 und nicht älter als 40 Jahre', '1'],
            ['mind. 6 Monate ununterbrochen rechtmäßiger Aufenthalt in Deutschland in den letzten 5 Jahren', '1'],
            ['Ehe- oder Lebenspartner erfüllt die Voraussetzungen ebenfalls und beantragt gemeinsam', '1'],
          ] } },
          'Deutschpunkte werden nicht addiert – es zählt nur die höchste Stufe; ebenso bei der Berufserfahrung. Die Erfahrung muss nach dem Abschluss erworben sein und zum erlernten Beruf passen.',
          'Der Punkt für den **Engpassberuf** ist enger, als viele denken: Er gilt nur für die Berufsgruppen, für die auch die niedrigere Gehaltsgrenze der Blauen Karte gilt – vor allem IT-Fachleute, Ingenieure und Naturwissenschaftler, Ärzte, akademische Pflegeberufe, Lehrkräfte und bestimmte Führungskräfte. Ein Lkw-Fahrer oder Elektriker bekommt diesen Punkt nicht, auch wenn sein Beruf in Deutschland sehr gesucht ist.',
          'Ein **Touristenvisum** reicht für den Punkt „Voraufenthalt“ in der Praxis nicht: Verlangt sind mindestens sechs Monate am Stück mit einem Aufenthaltsrecht, z. B. als Studierender, Saisonkraft oder Au-pair.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Beispiele: wer erreicht 6 Punkte?',
        blocks: [
          'Vier typische Profile aus unserer Beratung, berechnet mit dem Punkterechner oben. Alle haben einen anerkannten Abschluss aus dem Herkunftsland und können ihren Lebensunterhalt nachweisen:',
          { slot: 'examples' },
          'Am schnellsten steigt die Punktzahl mit Deutsch (von A1 auf B1 sind es +2 Punkte) und mit dem Anerkennungsverfahren: Schon ein Bescheid über eine **Teilanerkennung** bringt 4 Punkte. Wie die Anerkennung für Ihren Beruf läuft, zeigt unser [Anerkennungs-Check](/anerkennung).',
        ],
      },
      {
        id: 'danach',
        h2: 'Was Sie mit der Chancenkarte dürfen – und wie es weitergeht',
        blocks: [
          { ul: [
            'Die Chancenkarte gilt zunächst bis zu **einem Jahr**.',
            'Sie dürfen im Durchschnitt bis zu **20 Stunden pro Woche** arbeiten und **Probebeschäftigungen** von jeweils bis zu zwei Wochen machen.',
            'Mit einem Arbeitsvertrag für eine qualifizierte Stelle wechseln Sie in einen Aufenthaltstitel als Fachkraft oder in die [Blaue Karte](/blue-card-check). Erfüllen Sie dafür noch nicht alle Voraussetzungen, kann die Chancenkarte mit Zustimmung der Bundesagentur für Arbeit um bis zu zwei Jahre verlängert werden (Folge-Chancenkarte).',
          ] },
          'Wie viel von einem späteren Gehalt netto übrig bleibt, zeigt der [Brutto-Netto-Rechner](/salary-calculator); welcher Weg insgesamt am besten passt, der [Eignungscheck](/eligibility).',
        ],
      },
    ],
    faqTitle: 'Häufige Fragen zum Chancenkarte-Punkterechner',
    faq: [
      { q: 'Wie viele Punkte brauche ich für die Chancenkarte?', a: 'Mindestens 6 Punkte – zusätzlich zu den Grundvoraussetzungen (anerkannte Ausbildung oder Studium, Deutsch A1 oder Englisch B2, gesicherter Lebensunterhalt). Mit voll anerkanntem Abschluss brauchen Sie keine Punkte.' },
      { q: 'Reicht Deutsch auf A1-Niveau?', a: 'A1 erfüllt die Grundvoraussetzung, bringt aber keine Punkte. Punkte gibt es erst ab A2 (1 Punkt), B1 (2 Punkte) und B2 (3 Punkte). Alternativ genügt für die Grundvoraussetzung Englisch B2.' },
      { q: 'Bis zu welchem Alter gibt es Punkte?', a: 'Wer bei der Antragstellung nicht älter als 35 ist, erhält 2 Punkte; wer älter als 35, aber nicht älter als 40 ist, 1 Punkt. Ältere Bewerber brauchen die 6 Punkte aus anderen Kriterien.' },
      { q: 'Wie viel Geld muss ich nachweisen?', a: 'Für 2026 gibt Make it in Germany mindestens 1.091 € netto pro Monat an, meist über ein Sperrkonto oder eine Verpflichtungserklärung. Den verbindlichen Betrag nennt die deutsche Auslandsvertretung.' },
      { q: 'Darf ich mit der Chancenkarte arbeiten?', a: 'Ja, im Durchschnitt bis zu 20 Stunden pro Woche, dazu Probearbeit von bis zu zwei Wochen pro Arbeitgeber. Für eine Vollzeitstelle wechseln Sie in einen Aufenthaltstitel als Fachkraft oder in die Blaue Karte.' },
      { q: 'Ist das Ergebnis des Punkterechners verbindlich?', a: 'Nein. Der Rechner folgt der gesetzlichen Punktetabelle, die Entscheidung trifft aber die deutsche Auslandsvertretung anhand Ihrer Nachweise.' },
    ],
    sources: 'Stand: {{checked}}. Rechtsgrundlagen: §§ 20a, 20b Aufenthaltsgesetz und Anlage (Punktetabelle); Betrag zum Lebensunterhalt: Make it in Germany (Bundesregierung).',
    labels: {
      person: 'Profil', profile: 'Angaben', points: 'Punkte', result: 'Ergebnis',
      eligible: 'erfüllt', notYet: 'noch nicht', skilled: 'ohne Punkte',
      driver: 'Kfz-Mechaniker, 28', driverText: '2-jährige Ausbildung, 5 Jahre Erfahrung, Deutsch A2',
      nurse: 'Pflegekraft, 33', nurseText: 'Teilanerkennung, Deutsch B1, 2 Jahre Erfahrung',
      it: 'Softwareentwickler, 38', itText: 'Bachelor (IT), Englisch C1, 5 Jahre Erfahrung',
      electrician: 'Elektriker, 42', electricianText: 'Ausbildung, Deutsch A1, 2 Jahre Erfahrung',
    },
  },

  en: {
    eyebrow: 'The points system explained',
    sections: [
      {
        id: 'punktesystem',
        h2: 'How the Opportunity Card points system works',
        blocks: [
          'The Opportunity Card (Chancenkarte, section 20a of the Residence Act) has existed since 1 June 2024. It lets skilled workers from non-EU countries look for a job in Germany for up to one year, without a job offer in advance. There are two routes:',
          { ul: [
            '**Without points**: if your vocational training or degree is **fully recognised** in Germany, you count as a skilled worker and get the card without points.',
            '**With points**: everyone else must meet the basic requirements and score at least **6 points** under the table in section 20b of the Residence Act. That is exactly what the calculator above works out.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Basic requirements (without them points do not count)',
        blocks: [
          { ul: [
            '**Qualification**: vocational training of at least two years recognised by the state in your home country, or a state-recognised university degree (or a vocational qualification from a German Chamber of Commerce Abroad). Recognition of the school or university is shown e.g. via anabin or a ZAB statement of comparability.',
            '**Language**: German at least at level A1 **or** English at least at level B2, with a certificate.',
            '**Livelihood**: for 2026 Make it in Germany states at least €1,091 net a month, shown e.g. with a blocked account, a formal obligation (Verpflichtungserklärung) or a part-time job contract. The amount the German mission asks for is decisive.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'The points table: what earns points',
        blocks: [
          { table: { head: ['Criterion', 'Points'], rows: [
            ['Partial recognition: the German authority found that compensation measures are needed (deficit notice)', '4'],
            ['German B2 or higher', '3'],
            ['German B1', '2'],
            ['German A2', '1'],
            ['English C1 or higher', '1'],
            ['Work experience: at least 5 years in the last 7, after the qualification and in the field', '3'],
            ['Work experience: at least 2 years in the last 5', '2'],
            ['Qualification in a shortage occupation group (as for the Blue Card)', '1'],
            ['Age: not older than 35', '2'],
            ['Age: older than 35 and not older than 40', '1'],
            ['At least 6 months of uninterrupted legal stay in Germany in the last 5 years', '1'],
            ['Spouse or registered partner also qualifies and applies together with you', '1'],
          ] } },
          'Language points are not added up: only the highest level counts, and the same goes for work experience. The experience must have been gained after the qualification and match it.',
          'The **shortage occupation** point is narrower than many think: it only applies to the occupation groups that also get the lower Blue Card salary threshold, mainly IT professionals, engineers and scientists, doctors, nursing professionals with a degree, teachers and certain managers. A truck driver or electrician does not get this point, even though Germany badly needs them.',
          'A **tourist visa** is not enough for the previous-stay point in practice: you need at least six months in a row with a right of residence, e.g. as a student, seasonal worker or au pair.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Examples: who reaches 6 points?',
        blocks: [
          'Four typical profiles from our consultations, scored with the calculator above. All have a recognised qualification from their home country and can prove their livelihood:',
          { slot: 'examples' },
          'Points rise fastest with German (from A1 to B1 is +2 points) and with the recognition procedure: even a **partial recognition** notice is worth 4 points. How recognition works for your occupation is shown by our [recognition check](/anerkennung).',
        ],
      },
      {
        id: 'danach',
        h2: 'What the card allows, and what comes next',
        blocks: [
          { ul: [
            'The Opportunity Card is first issued for up to **one year**.',
            'You may work on average up to **20 hours a week** and do **trial work** of up to two weeks at a time.',
            'With a contract for a qualified job you switch to a skilled-worker permit or the [Blue Card](/blue-card-check). If you do not yet meet all the requirements, the card can be extended by up to two years with the approval of the Federal Employment Agency (follow-up Opportunity Card).',
          ] },
          'What is left of a later salary is shown by the [net salary calculator](/salary-calculator); which route suits you overall, by the [eligibility check](/eligibility).',
        ],
      },
    ],
    faqTitle: 'Frequently asked questions about the Chancenkarte points',
    faq: [
      { q: 'How many points do I need for the Opportunity Card?', a: 'At least 6 points, on top of the basic requirements (recognised training or degree, German A1 or English B2, secured livelihood). With a fully recognised qualification you need no points.' },
      { q: 'Is German at A1 level enough?', a: 'A1 meets the basic requirement but earns no points. Points start at A2 (1 point), B1 (2 points) and B2 (3 points). Alternatively English B2 meets the basic requirement.' },
      { q: 'Up to what age do I get points?', a: 'Applicants not older than 35 get 2 points; older than 35 but not older than 40, 1 point. Older applicants need their 6 points from other criteria.' },
      { q: 'How much money do I need to prove?', a: 'For 2026 Make it in Germany states at least €1,091 net per month, usually via a blocked account or a formal obligation. The binding amount is set by the German mission.' },
      { q: 'Can I work with the Opportunity Card?', a: 'Yes, on average up to 20 hours a week, plus trial work of up to two weeks per employer. For a full-time job you switch to a skilled-worker permit or the Blue Card.' },
      { q: 'Is the calculator result binding?', a: 'No. The calculator follows the statutory points table, but the German mission decides on the basis of your documents.' },
    ],
    sources: 'As of {{checked}}. Legal basis: sections 20a and 20b of the Residence Act and its annex (points table); livelihood amount: Make it in Germany (German federal government).',
    labels: {
      person: 'Profile', profile: 'Details', points: 'Points', result: 'Result',
      eligible: 'qualifies', notYet: 'not yet', skilled: 'no points needed',
      driver: 'Car mechanic, 28', driverText: '2-year training, 5 years’ experience, German A2',
      nurse: 'Nurse, 33', nurseText: 'partial recognition, German B1, 2 years’ experience',
      it: 'Software developer, 38', itText: 'bachelor’s (IT), English C1, 5 years’ experience',
      electrician: 'Electrician, 42', electricianText: 'vocational training, German A1, 2 years’ experience',
    },
  },

  ru: {
    eyebrow: 'Как работает система баллов',
    sections: [
      {
        id: 'punktesystem',
        h2: 'Как устроена система баллов Chancenkarte',
        blocks: [
          'Карта возможностей (Chancenkarte, § 20a Закона о пребывании) действует с 1 июня 2024 года. Она позволяет специалистам из стран вне ЕС до одного года искать работу в Германии — без заранее полученного предложения. Есть два пути:',
          { ul: [
            '**Без баллов**: если ваше профобразование или диплом **полностью признаны** в Германии, вы считаетесь квалифицированным специалистом и получаете карту без баллов.',
            '**С баллами**: всем остальным нужно выполнить базовые условия и набрать не менее **6 баллов** по таблице § 20b Закона о пребывании. Именно это считает калькулятор выше.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Базовые условия (без них баллы не засчитываются)',
        blocks: [
          { ul: [
            '**Квалификация**: признанное государством в стране происхождения профобразование продолжительностью не менее двух лет или признанный государством вуз (либо профессиональный диплом немецкой зарубежной торговой палаты, AHK). Признание учебного заведения подтверждается, например, через anabin или справку ZAB.',
            '**Язык**: немецкий не ниже A1 **или** английский не ниже B2 — с сертификатом.',
            '**Средства к существованию**: на 2026 год Make it in Germany называет не менее 1091 € нетто в месяц — например, блокированный счёт, гарантийное письмо (Verpflichtungserklärung) или договор о подработке. Решающей является сумма, которую требует посольство.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'Таблица баллов: за что начисляются баллы',
        blocks: [
          { table: { head: ['Критерий', 'Баллы'], rows: [
            ['Частичное признание: немецкое ведомство установило, что нужны компенсационные меры (Defizitbescheid)', '4'],
            ['Немецкий B2 и выше', '3'],
            ['Немецкий B1', '2'],
            ['Немецкий A2', '1'],
            ['Английский C1 и выше', '1'],
            ['Опыт работы: не менее 5 лет за последние 7, после получения квалификации и по специальности', '3'],
            ['Опыт работы: не менее 2 лет за последние 5', '2'],
            ['Квалификация в группе дефицитных профессий (как для Голубой карты)', '1'],
            ['Возраст: не старше 35 лет', '2'],
            ['Возраст: старше 35, но не старше 40 лет', '1'],
            ['Не менее 6 месяцев непрерывного законного пребывания в Германии за последние 5 лет', '1'],
            ['Супруг(а) или зарегистрированный партнёр тоже выполняет условия и подаёт вместе с вами', '1'],
          ] } },
          'Баллы за язык не суммируются — считается только самый высокий уровень; то же касается опыта работы. Опыт должен быть получен после получения квалификации и соответствовать ей.',
          'Балл за **дефицитную профессию** уже, чем многие думают: он даётся только группам профессий, для которых действует пониженный порог зарплаты Голубой карты, — прежде всего ИТ-специалистам, инженерам и учёным-естественникам, врачам, медсёстрам с высшим образованием, учителям и некоторым руководителям. Водитель грузовика или электрик этот балл не получит, хотя в Германии их очень не хватает.',
          '**Туристической визы** для балла за предыдущее пребывание на практике недостаточно: нужно не менее шести месяцев подряд с правом пребывания, например как студент, сезонный работник или au-pair.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Примеры: кто набирает 6 баллов?',
        blocks: [
          'Четыре типичных профиля из наших консультаций, рассчитанные калькулятором выше. У всех есть признанная в стране происхождения квалификация и подтверждённые средства:',
          { slot: 'examples' },
          'Быстрее всего баллы растут за счёт немецкого (с A1 до B1 — это +2 балла) и процедуры признания: даже решение о **частичном признании** даёт 4 балла. Как проходит признание по вашей профессии, покажет наша [проверка признания](/anerkennung).',
        ],
      },
      {
        id: 'danach',
        h2: 'Что разрешает карта и что дальше',
        blocks: [
          { ul: [
            'Chancenkarte выдаётся сначала на срок до **одного года**.',
            'Можно работать в среднем до **20 часов в неделю** и проходить **пробную работу** до двух недель у одного работодателя.',
            'С трудовым договором на квалифицированную должность вы переходите на вид на жительство для специалистов или на [Голубую карту](/blue-card-check). Если вы ещё не выполняете все условия, карту с согласия Федерального агентства по труду можно продлить до двух лет (Folge-Chancenkarte).',
          ] },
          'Сколько останется от будущей зарплаты, покажет [калькулятор нетто](/salary-calculator); какой путь подходит лучше всего — [проверка шансов](/eligibility).',
        ],
      },
    ],
    faqTitle: 'Частые вопросы о баллах Chancenkarte',
    faq: [
      { q: 'Сколько баллов нужно для Chancenkarte?', a: 'Не менее 6 баллов — плюс базовые условия (признанное профобразование или вуз, немецкий A1 или английский B2, подтверждённые средства). С полностью признанным дипломом баллы не нужны.' },
      { q: 'Достаточно ли немецкого на уровне A1?', a: 'A1 выполняет базовое условие, но баллов не даёт. Баллы начисляются с A2 (1 балл), B1 (2 балла) и B2 (3 балла). Вместо немецкого для базового условия подойдёт английский B2.' },
      { q: 'До какого возраста начисляются баллы?', a: 'Тот, кому на момент подачи не больше 35 лет, получает 2 балла; старше 35, но не старше 40 — 1 балл. Более старшим заявителям нужно набрать 6 баллов по другим критериям.' },
      { q: 'Какую сумму нужно подтвердить?', a: 'На 2026 год Make it in Germany указывает не менее 1091 € нетто в месяц — обычно через блокированный счёт или гарантийное письмо. Обязательную сумму называет посольство Германии.' },
      { q: 'Можно ли работать с Chancenkarte?', a: 'Да, в среднем до 20 часов в неделю, плюс пробная работа до двух недель у каждого работодателя. Для работы на полную ставку нужно перейти на вид на жительство специалиста или Голубую карту.' },
      { q: 'Результат калькулятора окончательный?', a: 'Нет. Калькулятор следует установленной законом таблице баллов, но решение принимает посольство Германии на основании ваших документов.' },
    ],
    sources: 'По состоянию на {{checked}}. Правовая основа: §§ 20a, 20b Закона о пребывании (AufenthG) и приложение к нему (таблица баллов); сумма на проживание — Make it in Germany (правительство ФРГ).',
    labels: {
      person: 'Профиль', profile: 'Данные', points: 'Баллы', result: 'Итог',
      eligible: 'проходит', notYet: 'пока нет', skilled: 'без баллов',
      driver: 'Автомеханик, 28', driverText: '2 года обучения, 5 лет опыта, немецкий A2',
      nurse: 'Медсестра, 33', nurseText: 'частичное признание, немецкий B1, 2 года опыта',
      it: 'Разработчик ПО, 38', itText: 'бакалавр (ИТ), английский C1, 5 лет опыта',
      electrician: 'Электрик, 42', electricianText: 'профобразование, немецкий A1, 2 года опыта',
    },
  },

  uk: {
    eyebrow: 'Як працює система балів',
    sections: [
      {
        id: 'punktesystem',
        h2: 'Як влаштована система балів Chancenkarte',
        blocks: [
          'Карта можливостей (Chancenkarte, § 20a Закону про перебування) діє з 1 червня 2024 року. Вона дозволяє фахівцям із країн поза ЄС до одного року шукати роботу в Німеччині — без попередньої пропозиції. Є два шляхи:',
          { ul: [
            '**Без балів**: якщо ваша професійна освіта чи диплом **повністю визнані** в Німеччині, ви вважаєтеся кваліфікованим фахівцем і отримуєте карту без балів.',
            '**З балами**: усім іншим потрібно виконати базові умови й набрати щонайменше **6 балів** за таблицею § 20b Закону про перебування. Саме це рахує калькулятор вище.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Базові умови (без них бали не зараховуються)',
        blocks: [
          { ul: [
            '**Кваліфікація**: визнана державою в країні походження професійна освіта тривалістю щонайменше два роки або визнаний державою виш (чи професійний диплом німецької закордонної торгової палати, AHK). Визнання навчального закладу підтверджують, наприклад, через anabin або довідку ZAB.',
            '**Мова**: німецька не нижче A1 **або** англійська не нижче B2 — із сертифікатом.',
            '**Кошти на проживання**: на 2026 рік Make it in Germany називає щонайменше 1091 € нетто на місяць — наприклад, блокований рахунок, гарантійний лист (Verpflichtungserklärung) або договір про підробіток. Вирішальною є сума, якої вимагає посольство.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'Таблиця балів: за що нараховують бали',
        blocks: [
          { table: { head: ['Критерій', 'Бали'], rows: [
            ['Часткове визнання: німецьке відомство встановило, що потрібні компенсаційні заходи (Defizitbescheid)', '4'],
            ['Німецька B2 і вище', '3'],
            ['Німецька B1', '2'],
            ['Німецька A2', '1'],
            ['Англійська C1 і вище', '1'],
            ['Досвід роботи: щонайменше 5 років за останні 7, після здобуття кваліфікації та за фахом', '3'],
            ['Досвід роботи: щонайменше 2 роки за останні 5', '2'],
            ['Кваліфікація в групі дефіцитних професій (як для Блакитної карти)', '1'],
            ['Вік: не старше 35 років', '2'],
            ['Вік: старше 35, але не старше 40 років', '1'],
            ['Щонайменше 6 місяців безперервного законного перебування в Німеччині за останні 5 років', '1'],
            ['Чоловік/дружина чи зареєстрований партнер теж виконує умови й подається разом із вами', '1'],
          ] } },
          'Бали за мову не сумуються — рахується лише найвищий рівень; те саме стосується досвіду роботи. Досвід має бути здобутий після отримання кваліфікації та відповідати їй.',
          'Бал за **дефіцитну професію** вужчий, ніж багато хто думає: його дають лише групам професій, для яких діє знижений поріг зарплати Блакитної карти, — насамперед ІТ-фахівцям, інженерам і науковцям-природничникам, лікарям, медсестрам із вищою освітою, вчителям і деяким керівникам. Водій вантажівки чи електрик цього бала не отримає, хоча в Німеччині їх дуже бракує.',
          '**Туристичної візи** для бала за попереднє перебування на практиці недостатньо: потрібно щонайменше шість місяців поспіль із правом перебування, наприклад як студент, сезонний працівник чи au-pair.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Приклади: хто набирає 6 балів?',
        blocks: [
          'Чотири типові профілі з наших консультацій, розраховані калькулятором вище. Усі мають визнану в країні походження кваліфікацію та підтверджені кошти:',
          { slot: 'examples' },
          'Найшвидше бали зростають завдяки німецькій (з A1 до B1 — це +2 бали) і процедурі визнання: навіть рішення про **часткове визнання** дає 4 бали. Як відбувається визнання за вашою професією, покаже наша [перевірка визнання](/anerkennung).',
        ],
      },
      {
        id: 'danach',
        h2: 'Що дозволяє карта і що далі',
        blocks: [
          { ul: [
            'Chancenkarte видають спершу на строк до **одного року**.',
            'Можна працювати в середньому до **20 годин на тиждень** і проходити **пробну роботу** до двох тижнів в одного роботодавця.',
            'З трудовим договором на кваліфіковану посаду ви переходите на дозвіл на проживання для фахівців або на [Блакитну карту](/blue-card-check). Якщо ви ще не виконуєте всіх умов, карту за згодою Федерального агентства з праці можна продовжити до двох років (Folge-Chancenkarte).',
          ] },
          'Скільки залишиться від майбутньої зарплати, покаже [калькулятор нетто](/salary-calculator); який шлях підходить найкраще — [перевірка шансів](/eligibility).',
        ],
      },
    ],
    faqTitle: 'Часті запитання про бали Chancenkarte',
    faq: [
      { q: 'Скільки балів потрібно для Chancenkarte?', a: 'Щонайменше 6 балів — плюс базові умови (визнана професійна освіта чи виш, німецька A1 або англійська B2, підтверджені кошти). З повністю визнаним дипломом бали не потрібні.' },
      { q: 'Чи достатньо німецької на рівні A1?', a: 'A1 виконує базову умову, але балів не дає. Бали нараховують з A2 (1 бал), B1 (2 бали) і B2 (3 бали). Замість німецької для базової умови підійде англійська B2.' },
      { q: 'До якого віку нараховують бали?', a: 'Хто на момент подання не старший за 35 років, отримує 2 бали; старший за 35, але не старший за 40 — 1 бал. Старшим заявникам потрібно набрати 6 балів за іншими критеріями.' },
      { q: 'Яку суму потрібно підтвердити?', a: 'На 2026 рік Make it in Germany вказує щонайменше 1091 € нетто на місяць — зазвичай через блокований рахунок або гарантійний лист. Обов’язкову суму називає посольство Німеччини.' },
      { q: 'Чи можна працювати з Chancenkarte?', a: 'Так, у середньому до 20 годин на тиждень, плюс пробна робота до двох тижнів у кожного роботодавця. Для роботи на повну ставку потрібно перейти на дозвіл фахівця або Блакитну карту.' },
      { q: 'Чи є результат калькулятора остаточним?', a: 'Ні. Калькулятор дотримується встановленої законом таблиці балів, але рішення ухвалює посольство Німеччини на підставі ваших документів.' },
    ],
    sources: 'Станом на {{checked}}. Правова основа: §§ 20a, 20b Закону про перебування (AufenthG) і додаток до нього (таблиця балів); сума на проживання — Make it in Germany (уряд ФРН).',
    labels: {
      person: 'Профіль', profile: 'Дані', points: 'Бали', result: 'Підсумок',
      eligible: 'проходить', notYet: 'поки ні', skilled: 'без балів',
      driver: 'Автомеханік, 28', driverText: '2 роки навчання, 5 років досвіду, німецька A2',
      nurse: 'Медсестра, 33', nurseText: 'часткове визнання, німецька B1, 2 роки досвіду',
      it: 'Розробник ПЗ, 38', itText: 'бакалавр (ІТ), англійська C1, 5 років досвіду',
      electrician: 'Електрик, 42', electricianText: 'професійна освіта, німецька A1, 2 роки досвіду',
    },
  },

  az: {
    eyebrow: 'Bal sistemi necə işləyir',
    sections: [
      {
        id: 'punktesystem',
        h2: 'Chancenkarte bal sistemi necə işləyir',
        blocks: [
          'İmkan kartı (Chancenkarte, Yaşayış Qanununun § 20a maddəsi) 1 iyun 2024-cü ildən qüvvədədir. O, AB-dən kənar ölkələrin mütəxəssislərinə əvvəlcədən iş təklifi olmadan Almaniyada bir ilə qədər iş axtarmağa imkan verir. İki yol var:',
          { ul: [
            '**Balsız**: peşə təhsiliniz və ya diplomunuz Almaniyada **tam tanınıbsa**, siz ixtisaslı mütəxəssis sayılırsınız və kartı bal olmadan alırsınız.',
            '**Balla**: qalanlar əsas şərtləri yerinə yetirməli və Yaşayış Qanununun § 20b maddəsindəki cədvəl üzrə ən azı **6 bal** toplamalıdır. Yuxarıdakı kalkulyator məhz bunu hesablayır.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Əsas şərtlər (onlarsız ballar sayılmır)',
        blocks: [
          { ul: [
            '**İxtisas**: öz ölkənizdə dövlət tərəfindən tanınan, ən azı iki il davam edən peşə təhsili və ya dövlət tərəfindən tanınan ali təhsil (yaxud Almaniyanın xaricdəki ticarət palatasının — AHK-nın peşə diplomu). Təhsil müəssisəsinin tanınması, məsələn, anabin bazası və ya ZAB arayışı ilə sübut olunur.',
            '**Dil**: alman dili ən azı A1 **və ya** ingilis dili ən azı B2 səviyyəsində — sertifikatla.',
            '**Yaşayış xərcləri**: Make it in Germany 2026-cı il üçün ayda ən azı 1 091 € xalis məbləğ göstərir; bunu, məsələn, bloklanmış hesab (Sperrkonto), zəmanət məktubu (Verpflichtungserklärung) və ya əlavə iş müqaviləsi ilə sübut etmək olar. Həlledici olan səfirliyin tələb etdiyi məbləğdir.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'Bal cədvəli: nəyə görə bal verilir',
        blocks: [
          { table: { head: ['Meyar', 'Bal'], rows: [
            ['Qismən tanınma: alman qurumu kompensasiya tədbirlərinin lazım olduğunu müəyyən edib (Defizitbescheid)', '4'],
            ['Alman dili B2 və yuxarı', '3'],
            ['Alman dili B1', '2'],
            ['Alman dili A2', '1'],
            ['İngilis dili C1 və yuxarı', '1'],
            ['İş təcrübəsi: son 7 ildə ən azı 5 il, diplomdan sonra və ixtisas üzrə', '3'],
            ['İş təcrübəsi: son 5 ildə ən azı 2 il', '2'],
            ['Kadr çatışmazlığı olan peşə qrupunda ixtisas (Mavi Kartda olduğu kimi)', '1'],
            ['Yaş: 35-dən böyük olmamaq', '2'],
            ['Yaş: 35-dən böyük, amma 40-dan böyük olmamaq', '1'],
            ['Son 5 ildə Almaniyada ən azı 6 ay fasiləsiz qanuni qalma', '1'],
            ['Həyat yoldaşı da şərtlərə cavab verir və sizinlə birlikdə müraciət edir', '1'],
          ] } },
          'Dil balları toplanmır — yalnız ən yüksək səviyyə sayılır; iş təcrübəsində də belədir. Təcrübə diplom alındıqdan sonra qazanılmalı və ixtisasa uyğun olmalıdır.',
          '**Kadr çatışmazlığı** balı çoxlarının düşündüyündən dardır: o, yalnız Mavi Kartın aşağı maaş həddi tətbiq edilən peşə qruplarına verilir — ilk növbədə İT mütəxəssisləri, mühəndislər və təbiət elmləri üzrə mütəxəssislər, həkimlər, ali təhsilli tibb bacıları, müəllimlər və bəzi rəhbərlər. TIR sürücüsü və ya elektrik Almaniyada çox axtarılsa da, bu balı almır.',
          '**Turist vizası** əvvəlki qalma balı üçün praktikada kifayət etmir: ən azı altı ay ardıcıl, yaşayış hüququ ilə — məsələn, tələbə, mövsümi işçi və ya au-pair kimi — qalmaq lazımdır.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Nümunələr: kim 6 bal toplayır?',
        blocks: [
          'Məsləhətlərimizdən dörd tipik profil — yuxarıdakı kalkulyatorla hesablanıb. Hamısının öz ölkəsində tanınan ixtisası var və yaşayış xərclərini sübut edə bilir:',
          { slot: 'examples' },
          'Ballar ən sürətlə alman dili ilə (A1-dən B1-ə keçid +2 bal deməkdir) və tanınma prosedurü ilə artır: hətta **qismən tanınma** qərarı 4 bal verir. Peşəniz üzrə tanınmanın necə getdiyini [tanınma yoxlamamız](/anerkennung) göstərir.',
        ],
      },
      {
        id: 'danach',
        h2: 'Kart nəyə icazə verir və sonra nə olur',
        blocks: [
          { ul: [
            'Chancenkarte əvvəlcə **bir ilə qədər** verilir.',
            'Həftədə orta hesabla **20 saata qədər** işləmək və hər işəgötürəndə iki həftəyə qədər **sınaq işi** keçmək olar.',
            'İxtisaslı vəzifə üçün əmək müqaviləsi ilə mütəxəssis yaşayış icazəsinə və ya [Mavi Karta](/blue-card-check) keçirsiniz. Hələ bütün şərtlər yerinə yetirilmirsə, kart Federal Əmək Agentliyinin razılığı ilə iki ilə qədər uzadıla bilər (Folge-Chancenkarte).',
          ] },
          'Gələcək maaşdan nə qədər xalis qalacağını [xalis maaş kalkulyatoru](/salary-calculator), ümumilikdə hansı yolun sizə daha uyğun olduğunu isə [uyğunluq testi](/eligibility) göstərir.',
        ],
      },
    ],
    faqTitle: 'Chancenkarte balları haqqında tez-tez verilən suallar',
    faq: [
      { q: 'Chancenkarte üçün neçə bal lazımdır?', a: 'Ən azı 6 bal — üstəgəl əsas şərtlər (tanınan peşə təhsili və ya ali təhsil, alman dili A1 və ya ingilis dili B2, sübut olunmuş yaşayış xərcləri). Diplomunuz tam tanınıbsa, bal lazım deyil.' },
      { q: 'Alman dili A1 səviyyəsində kifayətdirmi?', a: 'A1 əsas şərti ödəyir, amma bal vermir. Ballar A2 (1 bal), B1 (2 bal) və B2-dən (3 bal) başlayır. Əsas şərt üçün alman dili əvəzinə ingilis dili B2 də olar.' },
      { q: 'Neçə yaşa qədər bal verilir?', a: 'Müraciət zamanı 35 yaşdan böyük olmayanlar 2 bal, 35-dən böyük, lakin 40-dan böyük olmayanlar 1 bal alır. Daha yaşlı namizədlər 6 balı digər meyarlardan toplamalıdır.' },
      { q: 'Nə qədər pul sübut etməliyəm?', a: 'Make it in Germany 2026-cı il üçün ayda ən azı 1 091 € xalis göstərir — adətən bloklanmış hesab və ya zəmanət məktubu ilə. Məcburi məbləği Almaniya səfirliyi müəyyən edir.' },
      { q: 'Chancenkarte ilə işləmək olarmı?', a: 'Bəli, həftədə orta hesabla 20 saata qədər, üstəgəl hər işəgötürəndə iki həftəyə qədər sınaq işi. Tam ştatlı iş üçün mütəxəssis yaşayış icazəsinə və ya Mavi Karta keçməlisiniz.' },
      { q: 'Kalkulyatorun nəticəsi qətidirmi?', a: 'Xeyr. Kalkulyator qanunla müəyyən edilmiş bal cədvəlinə əsaslanır, amma qərarı sənədləriniz əsasında Almaniya səfirliyi verir.' },
    ],
    sources: 'Vəziyyət: {{checked}}. Hüquqi əsas: Yaşayış Qanununun (AufenthG) §§ 20a, 20b maddələri və əlavəsi (bal cədvəli); yaşayış xərcləri məbləği: Make it in Germany (Almaniya hökuməti).',
    labels: {
      person: 'Profil', profile: 'Məlumat', points: 'Bal', result: 'Nəticə',
      eligible: 'uyğundur', notYet: 'hələ yox', skilled: 'balsız',
      driver: 'Avtomexanik, 28', driverText: '2 illik təhsil, 5 il təcrübə, alman dili A2',
      nurse: 'Tibb bacısı, 33', nurseText: 'qismən tanınma, alman dili B1, 2 il təcrübə',
      it: 'Proqramçı, 38', itText: 'bakalavr (İT), ingilis dili C1, 5 il təcrübə',
      electrician: 'Elektrik, 42', electricianText: 'peşə təhsili, alman dili A1, 2 il təcrübə',
    },
  },

  tr: {
    eyebrow: 'Puan sistemi açıklandı',
    sections: [
      {
        id: 'punktesystem',
        h2: 'Fırsat Kartı (Chancenkarte) puan sistemi nasıl işler?',
        blocks: [
          'Fırsat Kartı (Chancenkarte, İkamet Kanunu § 20a) 1 Haziran 2024’ten beri vardır. AB dışı ülkelerden nitelikli çalışanların, önceden iş teklifi olmadan Almanya’da bir yıla kadar iş aramasına imkân tanır. İki yol vardır:',
          { ul: [
            '**Puansız**: meslek eğitiminiz veya diplomanız Almanya’da **tam olarak tanınmışsa** nitelikli çalışan sayılırsınız ve kartı puansız alırsınız.',
            '**Puanla**: diğer herkes temel şartları karşılamalı ve İkamet Kanunu § 20b’deki tabloya göre en az **6 puan** toplamalıdır. Yukarıdaki hesaplayıcı tam olarak bunu hesaplar.',
          ] },
        ],
      },
      {
        id: 'voraussetzungen',
        h2: 'Temel şartlar (bunlar olmadan puanlar sayılmaz)',
        blocks: [
          { ul: [
            '**Nitelik**: memleketinizde devletçe tanınan, en az iki yıllık bir meslek eğitimi veya devletçe tanınan bir üniversite diploması (ya da bir Alman Dış Ticaret Odası — AHK — meslek belgesi). Okulun veya üniversitenin tanınması örneğin anabin ya da ZAB denklik değerlendirmesiyle gösterilir.',
            '**Dil**: en az A1 düzeyinde Almanca **veya** en az B2 düzeyinde İngilizce — sertifikayla.',
            '**Geçim**: Make it in Germany 2026 için ayda en az 1.091 € net öngörür; örneğin bloke hesap, taahhütname (Verpflichtungserklärung) veya yarı zamanlı iş sözleşmesiyle kanıtlanır. Belirleyici olan, Alman temsilciliğinin istediği tutardır.',
          ] },
        ],
      },
      {
        id: 'punkte',
        h2: 'Puan tablosu: neye puan verilir?',
        blocks: [
          { table: { head: ['Kriter', 'Puan'], rows: [
            ['Kısmi denklik: Alman makamı denkleştirme önlemleri gerektiğini tespit etti (Defizitbescheid)', '4'],
            ['Almanca B2 veya üzeri', '3'],
            ['Almanca B1', '2'],
            ['Almanca A2', '1'],
            ['İngilizce C1 veya üzeri', '1'],
            ['İş deneyimi: son 7 yılda en az 5 yıl, diplomadan sonra ve meslekte', '3'],
            ['İş deneyimi: son 5 yılda en az 2 yıl', '2'],
            ['Eleman açığı olan bir meslek grubunda nitelik (Mavi Kart’taki gibi)', '1'],
            ['Yaş: 35’ten büyük olmamak', '2'],
            ['Yaş: 35’ten büyük, 40’tan büyük olmamak', '1'],
            ['Son 5 yılda Almanya’da en az 6 ay kesintisiz yasal ikamet', '1'],
            ['Eş veya kayıtlı partner de şartları karşılıyor ve sizinle birlikte başvuruyor', '1'],
          ] } },
          'Dil puanları toplanmaz; yalnızca en yüksek düzey sayılır, iş deneyiminde de durum aynıdır. Deneyim diplomadan sonra edinilmiş ve meslekle ilgili olmalıdır.',
          '**Eleman açığı** puanı sanıldığından dardır: yalnızca Mavi Kart’ın düşük maaş sınırının uygulandığı meslek gruplarına verilir — başta BT uzmanları, mühendisler ve doğa bilimciler, doktorlar, lisanslı hemşireler, öğretmenler ve bazı yöneticiler. Tır şoförü veya elektrikçi, Almanya’da çok aranmasına rağmen bu puanı alamaz.',
          'Önceki ikamet puanı için **turist vizesi** uygulamada yeterli değildir: öğrenci, mevsimlik işçi veya au pair gibi bir ikamet hakkıyla en az altı ay kesintisiz kalmak gerekir.',
        ],
      },
      {
        id: 'beispiele',
        h2: 'Örnekler: kim 6 puana ulaşır?',
        blocks: [
          'Danışmanlıklarımızdan dört tipik profil, yukarıdaki hesaplayıcıyla hesaplandı. Hepsinin memleketinde tanınan bir diploması var ve geçimini kanıtlayabiliyor:',
          { slot: 'examples' },
          'Puan en hızlı Almanca ile (A1’den B1’e +2 puan) ve denklik süreciyle artar: **kısmi denklik** kararı bile 4 puan getirir. Mesleğiniz için denkliğin nasıl işlediğini [denklik kontrolümüz](/anerkennung) gösterir.',
        ],
      },
      {
        id: 'danach',
        h2: 'Kart neye izin verir ve sonrası',
        blocks: [
          { ul: [
            'Fırsat Kartı ilk olarak **bir yıla kadar** verilir.',
            'Haftada ortalama **20 saate kadar** çalışabilir ve her seferinde iki haftaya kadar **deneme çalışması** yapabilirsiniz.',
            'Nitelikli bir iş için sözleşmeyle nitelikli çalışan oturum iznine veya [Mavi Kart’a](/blue-card-check) geçersiniz. Henüz tüm şartları karşılamıyorsanız kart, Federal İş Ajansı’nın onayıyla iki yıla kadar uzatılabilir (Folge-Chancenkarte).',
          ] },
          'Gelecekteki maaştan ne kadar net kalacağını [net maaş hesaplayıcısı](/salary-calculator), genel olarak hangi yolun size uygun olduğunu [uygunluk testi](/eligibility) gösterir.',
        ],
      },
    ],
    faqTitle: 'Fırsat Kartı puanları hakkında sık sorulan sorular',
    faq: [
      { q: 'Fırsat Kartı için kaç puan gerekir?', a: 'En az 6 puan; buna ek olarak temel şartlar (tanınan meslek eğitimi veya diploma, Almanca A1 veya İngilizce B2, güvence altındaki geçim). Tam tanınmış diplomayla puan gerekmez.' },
      { q: 'A1 düzeyinde Almanca yeterli mi?', a: 'A1 temel şartı karşılar ama puan getirmez. Puanlar A2 (1 puan), B1 (2 puan) ve B2’den (3 puan) başlar. Temel şart için Almanca yerine İngilizce B2 de olur.' },
      { q: 'Hangi yaşa kadar puan verilir?', a: 'Başvuru sırasında 35 yaşından büyük olmayanlar 2 puan, 35’ten büyük ama 40’tan büyük olmayanlar 1 puan alır. Daha büyük adaylar 6 puanı diğer kriterlerden toplamalıdır.' },
      { q: 'Ne kadar para kanıtlamam gerekir?', a: 'Make it in Germany 2026 için ayda en az 1.091 € net belirtir; genellikle bloke hesap veya taahhütnameyle. Bağlayıcı tutarı Alman temsilciliği belirler.' },
      { q: 'Fırsat Kartı ile çalışabilir miyim?', a: 'Evet, haftada ortalama 20 saate kadar; ayrıca her işverende iki haftaya kadar deneme çalışması. Tam zamanlı bir iş için nitelikli çalışan iznine veya Mavi Kart’a geçersiniz.' },
      { q: 'Hesaplayıcının sonucu bağlayıcı mı?', a: 'Hayır. Hesaplayıcı yasal puan tablosunu izler, ancak kararı belgelerinize göre Alman temsilciliği verir.' },
    ],
    sources: 'Güncelleme: {{checked}}. Hukuki dayanak: İkamet Kanunu (AufenthG) §§ 20a, 20b ve eki (puan tablosu); geçim tutarı: Make it in Germany (Alman Federal Hükümeti).',
    labels: {
      person: 'Profil', profile: 'Bilgiler', points: 'Puan', result: 'Sonuç',
      eligible: 'uygun', notYet: 'henüz değil', skilled: 'puansız',
      driver: 'Oto tamircisi, 28', driverText: '2 yıllık eğitim, 5 yıl deneyim, Almanca A2',
      nurse: 'Hemşire, 33', nurseText: 'kısmi denklik, Almanca B1, 2 yıl deneyim',
      it: 'Yazılım geliştirici, 38', itText: 'lisans (BT), İngilizce C1, 5 yıl deneyim',
      electrician: 'Elektrikçi, 42', electricianText: 'meslek eğitimi, Almanca A1, 2 yıl deneyim',
    },
  },
};
