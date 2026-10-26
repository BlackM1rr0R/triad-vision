import type { CaseStatus, PrismaClient } from '@prisma/client';

/**
 * Starter course "Almaniyaya hazırlıq" (Getting ready for Germany): 4 modules of TEXT lessons, one quiz per
 * module, in az / de / en / ru. Written as neutral general information (not legal advice; the course
 * disclaimer says so on every page). Facts that change every year carry the year in the text — the owner
 * should check them before publishing (the course is created as a draft):
 *   - minimum wage 2026: 13.90 € gross per hour (lesson "İş saatı və minimum əmək haqqı");
 *   - Deutschlandticket 2026: 63 € per month, Rundfunkbeitrag 2025: 18.36 € per month ("Gündəlik həyat").
 * Idempotent: created once by slug, never overwritten (admin edits stay).
 */

type L = { az: string; de: string; en: string; ru: string };
interface Q {
  kind?: 'SINGLE' | 'MULTIPLE';
  prompt: L;
  options: L[];
  correct: number[];
  explanation?: L;
}
interface Lesson {
  kind: 'TEXT' | 'QUIZ';
  title: L;
  body?: L;
  minutes?: number;
  passMark?: number;
  questions?: Q[];
}
interface Module {
  title: L;
  description?: L;
  lessons: Lesson[];
}

export const STARTER_SLUG = 'pre-departure';

/** Pre-departure: from the signed contract until (and after) the visa decision. */
export const STARTER_AUTO_ENROLL: CaseStatus[] = ['CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'];

const quizIntro: L = {
  az: 'Modulu nə qədər yaxşı başa düşdüyünüzü yoxlayın. Keçid balı: 75 %. Testi istədiyiniz qədər təkrarlaya bilərsiniz.',
  de: 'Prüfen Sie, wie gut Sie das Modul verstanden haben. Bestehensgrenze: 75 %. Sie können den Test beliebig oft wiederholen.',
  en: 'Check how well you understood the module. Pass mark: 75 %. You can repeat the quiz as often as you like.',
  ru: 'Проверьте, насколько хорошо вы поняли модуль. Проходной балл: 75 %. Тест можно повторять сколько угодно раз.',
};

const quizTitle = (n: number): L => ({ az: `Test: modul ${n}`, de: `Test: Modul ${n}`, en: `Quiz: module ${n}`, ru: `Тест: модуль ${n}` });

export const STARTER_COURSE = {
  slug: STARTER_SLUG,
  title: { az: 'Almaniyaya hazırlıq', de: 'Vorbereitung auf Deutschland', en: 'Getting ready for Germany', ru: 'Подготовка к Германии' } satisfies L,
  description: {
    az: 'Almaniyada işə və həyata başlamazdan əvvəl bilməli olduğunuz əsas mövzular: iş hüququ, gündəlik həyat, ilk günlərin rəsmiyyətləri və kömək ünvanları. 4 modul, hər modulun sonunda qısa test. Tamamladıqda sertifikat alırsınız.',
    de: 'Die wichtigsten Themen vor dem Start in Arbeit und Alltag in Deutschland: Arbeitsrecht, Alltag, Formalitäten der ersten Tage und Hilfsangebote. 4 Module mit je einem kurzen Test. Nach dem Abschluss erhalten Sie ein Zertifikat.',
    en: 'The key topics before you start work and life in Germany: labour law, everyday life, the formalities of the first days and where to get help. 4 modules, each with a short quiz. You get a certificate when you finish.',
    ru: 'Главные темы перед началом работы и жизни в Германии: трудовое право, повседневная жизнь, формальности первых дней и где получить помощь. 4 модуля, в конце каждого — короткий тест. По окончании вы получите сертификат.',
  } satisfies L,
  disclaimer: {
    az: 'Bu kurs ümumi məlumat xarakteri daşıyır və hüquqi məsləhət deyil. Qanunlar və məbləğlər (məsələn, minimum əmək haqqı) mütəmadi dəyişir — ili göstərilən rəqəmləri rəsmi mənbələrdən yoxlayın. Konkret vəziyyətinizlə bağlı mütəxəssisə və ya komandamıza müraciət edin.',
    de: 'Dieser Kurs bietet allgemeine Informationen und ist keine Rechtsberatung. Gesetze und Beträge (z. B. der Mindestlohn) ändern sich regelmäßig – Angaben mit Jahreszahl bitte bei offiziellen Stellen prüfen. Bei Fragen zu Ihrer konkreten Situation wenden Sie sich an eine Beratungsstelle oder an unser Team.',
    en: 'This course provides general information and is not legal advice. Laws and amounts (for example the minimum wage) change regularly — check figures marked with a year with official sources. For your specific situation, ask a qualified adviser or our team.',
    ru: 'Этот курс содержит общую информацию и не является юридической консультацией. Законы и суммы (например, минимальная оплата труда) регулярно меняются — проверяйте цифры с указанием года в официальных источниках. По вашей конкретной ситуации обращайтесь к специалисту или в нашу команду.',
  } satisfies L,
  modules: [
    // ─── 1. Labour law ───────────────────────────────────────────────
    {
      title: { az: 'İş hüququ', de: 'Arbeitsrecht', en: 'Labour law', ru: 'Трудовое право' },
      description: {
        az: 'Müqavilə, iş saatı, minimum əmək haqqı, məzuniyyət və xəstəlik.',
        de: 'Vertrag, Arbeitszeit, Mindestlohn, Urlaub und Krankheit.',
        en: 'Contract, working hours, minimum wage, holidays and sick leave.',
        ru: 'Договор, рабочее время, минимальная оплата, отпуск и болезнь.',
      },
      lessons: [
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'Əmək müqaviləsi', de: 'Der Arbeitsvertrag', en: 'The employment contract', ru: 'Трудовой договор' },
          body: {
            az: `## Əmək müqaviləsi (Arbeitsvertrag)

Almaniyada işə başlamazdan əvvəl yazılı əmək müqaviləniz olmalıdır. İşəgötürən iş şərtlərinin əsas hissəsini yazılı şəkildə təqdim etməyə borcludur.

**Müqavilədə nələri yoxlamalı:**

- vəzifə və iş yeri;
- başlama tarixi, müqavilənin müddətli və ya müddətsiz olması;
- əmək haqqı (adətən brutto), ödəniş vaxtı və əlavələr (gecə, bayram, əlavə iş);
- həftəlik iş saatı;
- illik məzuniyyət günlərinin sayı;
- sınaq müddəti (Probezeit) və xəbərdarlıq müddətləri (Kündigungsfrist).

**Sınaq müddəti** ən çox 6 ay ola bilər. Bu dövrdə hər iki tərəf müqaviləni adətən 2 həftəlik xəbərdarlıqla ləğv edə bilər. Sonra qanuni minimum xəbərdarlıq müddəti 4 həftədir (ayın 15-nə və ya sonuna qədər); müqavilə və ya kollektiv müqavilə (Tarifvertrag) daha uzun müddət nəzərdə tuta bilər.

**Vacib məsləhətlər:**

- Başa düşmədiyiniz sənədi imzalamayın — tərcümə və izah istəyin.
- İmzalanmış müqavilənin surətini saxlayın (kabinetinizdəki Sənəd seyfində də saxlaya bilərsiniz).
- Vizanız konkret iş təklifinə əsasən verilir. İş yeri, vəzifə və ya əmək haqqı dəyişəcəksə, əvvəlcə bizimlə və ya Ausländerbehörde ilə məsləhətləşin — bəzi hallarda icazə və ya bildiriş tələb olunur.`,
            de: `## Der Arbeitsvertrag

Vor dem Arbeitsbeginn in Deutschland sollten Sie einen schriftlichen Arbeitsvertrag haben. Der Arbeitgeber muss Ihnen die wesentlichen Arbeitsbedingungen schriftlich aushändigen.

**Darauf sollten Sie achten:**

- Tätigkeit und Arbeitsort;
- Beginn, befristet oder unbefristet;
- Lohn (meist brutto), Zahlungstermin und Zuschläge (Nacht, Feiertag, Überstunden);
- wöchentliche Arbeitszeit;
- Anzahl der Urlaubstage pro Jahr;
- Probezeit und Kündigungsfristen.

**Die Probezeit** dauert höchstens 6 Monate. In dieser Zeit können beide Seiten meist mit einer Frist von 2 Wochen kündigen. Danach beträgt die gesetzliche Mindestfrist 4 Wochen (zum 15. oder zum Monatsende); Vertrag oder Tarifvertrag können längere Fristen vorsehen.

**Wichtige Tipps:**

- Unterschreiben Sie nichts, was Sie nicht verstehen – bitten Sie um Übersetzung und Erklärung.
- Bewahren Sie eine Kopie des unterschriebenen Vertrags auf (auch im Dokumenten-Tresor Ihres Kontos möglich).
- Ihr Visum beruht auf einem konkreten Arbeitsangebot. Wenn sich Arbeitgeber, Tätigkeit oder Lohn ändern sollen, sprechen Sie vorher mit uns oder der Ausländerbehörde – in manchen Fällen ist eine Erlaubnis oder Mitteilung nötig.`,
            en: `## The employment contract

Before you start work in Germany you should have a written employment contract. The employer must give you the essential working conditions in writing.

**What to check in the contract:**

- job title and place of work;
- start date, fixed-term or permanent;
- pay (usually gross), pay date and supplements (night work, public holidays, overtime);
- weekly working hours;
- number of paid holiday days per year;
- probation period (Probezeit) and notice periods (Kündigungsfrist).

**The probation period** can last up to 6 months. During it, either side can usually end the contract with 2 weeks' notice. After that the statutory minimum notice is 4 weeks (to the 15th or the end of a month); the contract or a collective agreement (Tarifvertrag) may set longer periods.

**Important tips:**

- Do not sign anything you do not understand — ask for a translation and an explanation.
- Keep a copy of the signed contract (you can also store it in the document vault in your account).
- Your visa is based on a specific job offer. If the employer, the job or the pay is going to change, talk to us or the Ausländerbehörde first — in some cases a permission or a notification is required.`,
            ru: `## Трудовой договор

До начала работы в Германии у вас должен быть письменный трудовой договор. Работодатель обязан передать вам основные условия работы в письменном виде.

**Что проверить в договоре:**

- должность и место работы;
- дата начала, срочный или бессрочный договор;
- зарплата (обычно брутто), срок выплаты и надбавки (ночь, праздники, сверхурочные);
- рабочее время в неделю;
- количество дней отпуска в году;
- испытательный срок (Probezeit) и сроки увольнения (Kündigungsfrist).

**Испытательный срок** — не более 6 месяцев. В это время обе стороны обычно могут расторгнуть договор с уведомлением за 2 недели. Затем минимальный срок по закону — 4 недели (к 15-му числу или к концу месяца); договор или коллективное соглашение (Tarifvertrag) могут предусматривать более долгие сроки.

**Важные советы:**

- Не подписывайте то, чего не понимаете, — попросите перевод и объяснение.
- Храните копию подписанного договора (можно и в сейфе документов в личном кабинете).
- Ваша виза выдана на основании конкретного предложения работы. Если меняется работодатель, должность или зарплата, сначала посоветуйтесь с нами или с Ausländerbehörde — в некоторых случаях нужно разрешение или уведомление.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 6,
          title: { az: 'İş saatı və minimum əmək haqqı', de: 'Arbeitszeit und Mindestlohn', en: 'Working hours and minimum wage', ru: 'Рабочее время и минимальная оплата' },
          body: {
            az: `## İş saatı

Almaniyada iş vaxtını qanun (Arbeitszeitgesetz) tənzimləyir:

- adi iş günü 8 saatdır; 6 ay ərzində orta hesabla gündə 8 saat aşılmamaq şərti ilə 10 saata qədər uzadıla bilər;
- 6 saatdan çox işdə ən azı 30 dəqiqə, 9 saatdan çox işdə ən azı 45 dəqiqə fasilə verilir;
- iki iş günü arasında ən azı 11 saat istirahət olmalıdır;
- bazar və bayram günləri adətən iş günü deyil (bəzi sahələrdə istisnalar var).

**Sürücülər üçün** əlavə Aİ qaydaları var: gündəlik sürmə vaxtı adətən 9 saat (həftədə iki dəfə 10 saata qədər), 4,5 saat sürdükdən sonra 45 dəqiqə fasilə. Takoqraf qeydlərini düzgün aparın.

## Minimum əmək haqqı (Mindestlohn)

**2026-cı il üçün: saatına 13,90 € (brutto).** Məbləğ mütəmadi yenilənir — aktual rəqəmi rəsmi mənbələrdən yoxlayın. Bəzi sahələrdə kollektiv müqavilə ilə daha yüksək minimum tətbiq olunur.

## Brutto və netto

Müqavilədəki məbləğ adətən bruttodur. Ondan gəlir vergisi və sosial sığorta haqları (pensiya, tibbi, işsizlik, qulluq sığortası) tutulur; əlinizə çatan məbləğ (netto) xeyli az olur.

Hər ay əmək haqqı hesabatı (Lohnabrechnung) almalısınız. Onu saxlayın və iş saatlarınızı özünüz də qeyd edin — mübahisə olarsa, bu qeydlər kömək edir.`,
            de: `## Arbeitszeit

Die Arbeitszeit regelt das Arbeitszeitgesetz:

- der normale Arbeitstag hat 8 Stunden; er kann auf bis zu 10 Stunden verlängert werden, wenn im Durchschnitt von 6 Monaten 8 Stunden pro Tag nicht überschritten werden;
- bei mehr als 6 Stunden Arbeit mindestens 30 Minuten Pause, bei mehr als 9 Stunden mindestens 45 Minuten;
- zwischen zwei Arbeitstagen mindestens 11 Stunden Ruhezeit;
- Sonn- und Feiertage sind in der Regel arbeitsfrei (in manchen Branchen gibt es Ausnahmen).

**Für Berufskraftfahrer** gelten zusätzlich EU-Regeln: Tageslenkzeit in der Regel 9 Stunden (zweimal pro Woche bis zu 10 Stunden), nach 4,5 Stunden Lenkzeit 45 Minuten Pause. Führen Sie die Fahrtenschreiber-Aufzeichnungen korrekt.

## Mindestlohn

**Für 2026: 13,90 € brutto pro Stunde.** Der Betrag wird regelmäßig angepasst – prüfen Sie den aktuellen Wert bei offiziellen Stellen. In manchen Branchen gelten durch Tarifverträge höhere Mindestlöhne.

## Brutto und netto

Der Betrag im Vertrag ist meist brutto. Davon gehen Lohnsteuer und Sozialversicherungsbeiträge (Rente, Kranken-, Arbeitslosen-, Pflegeversicherung) ab; ausgezahlt wird deutlich weniger (netto).

Jeden Monat bekommen Sie eine Lohnabrechnung. Heben Sie sie auf und notieren Sie Ihre Arbeitszeiten selbst – bei Streit helfen diese Aufzeichnungen.`,
            en: `## Working hours

Working time is governed by the Working Hours Act (Arbeitszeitgesetz):

- a normal working day is 8 hours; it can be extended to up to 10 hours if, on average over 6 months, 8 hours per day are not exceeded;
- for more than 6 hours of work at least a 30-minute break, for more than 9 hours at least 45 minutes;
- at least 11 hours of rest between two working days;
- Sundays and public holidays are usually days off (some sectors have exceptions).

**For professional drivers** extra EU rules apply: daily driving time is usually 9 hours (up to 10 hours twice a week), and a 45-minute break after 4.5 hours of driving. Keep your tachograph records correct.

## Minimum wage (Mindestlohn)

**For 2026: 13.90 € gross per hour.** The amount is adjusted regularly — check the current figure with official sources. Some sectors have higher minimum wages through collective agreements.

## Gross and net

The amount in the contract is usually gross. Income tax and social insurance contributions (pension, health, unemployment, long-term care) are deducted; what you receive (net) is noticeably less.

Every month you receive a payslip (Lohnabrechnung). Keep it and note your working hours yourself — in a dispute these records help.`,
            ru: `## Рабочее время

Рабочее время регулирует закон (Arbeitszeitgesetz):

- обычный рабочий день — 8 часов; его можно продлить до 10 часов, если в среднем за 6 месяцев не превышается 8 часов в день;
- при работе более 6 часов — перерыв не менее 30 минут, более 9 часов — не менее 45 минут;
- между двумя рабочими днями — не менее 11 часов отдыха;
- воскресенья и праздники обычно выходные (в некоторых отраслях есть исключения).

**Для водителей** действуют дополнительные правила ЕС: время за рулём в день обычно 9 часов (дважды в неделю до 10 часов), после 4,5 часа вождения — перерыв 45 минут. Ведите записи тахографа правильно.

## Минимальная оплата труда (Mindestlohn)

**На 2026 год: 13,90 € брутто в час.** Сумма регулярно пересматривается — проверяйте актуальное значение в официальных источниках. В некоторых отраслях по коллективным договорам минимум выше.

## Брутто и нетто

Сумма в договоре обычно указана брутто. Из неё удерживаются подоходный налог и взносы на социальное страхование (пенсионное, медицинское, по безработице, по уходу); на руки вы получаете заметно меньше (нетто).

Каждый месяц вы получаете расчётный лист (Lohnabrechnung). Храните его и сами записывайте отработанные часы — при споре эти записи помогут.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'Məzuniyyət və xəstəlik', de: 'Urlaub und Krankheit', en: 'Holidays and sick leave', ru: 'Отпуск и болезнь' },
          body: {
            az: `## Məzuniyyət (Urlaub)

- Qanuni minimum: 5 günlük iş həftəsində ildə **20 iş günü** (6 günlük həftədə 24). Çox müqavilədə daha çoxdur (25–30 gün).
- Tam illik məzuniyyət hüququ işə başladıqdan **6 ay** sonra yaranır; ondan əvvəl hər tam ay üçün müəyyən hissə.
- Məzuniyyət tarixlərini əvvəlcədən işəgötürənlə razılaşdırın. Məzuniyyətdə əmək haqqı ödənilir.

## Xəstələnəndə

1. İşəgötürənə **dərhal**, mümkünsə növbədən əvvəl xəbər verin (telefon və ya razılaşdırılmış kanal).
2. Həkimə gedin. Xəstəlik 3 təqvim günündən çox davam edirsə, həkim arayışı (Arbeitsunfähigkeitsbescheinigung) lazımdır; işəgötürən onu daha tez də tələb edə bilər.
3. Dövlət tibbi sığortasında olanlar üçün arayış adətən elektron şəkildə (eAU) sığorta kassasına gedir, işəgötürən onu oradan alır. Xəbər vermək öhdəliyi isə yenə sizdədir.

**Xəstəlik zamanı əmək haqqı:** iş münasibəti 4 həftədən çox davam edibsə, işəgötürən 6 həftəyə qədər əmək haqqını ödəməyə davam edir. Ondan sonra tibbi sığorta kassası xəstəlik pulu (Krankengeld) ödəyir.

Xəstə olduğunuz üçün təzyiq və ya hədə ilə qarşılaşsanız, kömək istəyin (4-cü modul).`,
            de: `## Urlaub

- Gesetzliches Minimum: bei einer 5-Tage-Woche **20 Arbeitstage** pro Jahr (bei 6 Tagen 24). Viele Verträge sehen mehr vor (25–30 Tage).
- Den vollen Jahresurlaub gibt es nach **6 Monaten** im Betrieb; vorher anteilig für jeden vollen Monat.
- Stimmen Sie Urlaubstermine rechtzeitig mit dem Arbeitgeber ab. Im Urlaub wird der Lohn weitergezahlt.

## Wenn Sie krank sind

1. Melden Sie sich **sofort** beim Arbeitgeber, möglichst vor Schichtbeginn (Telefon oder vereinbarter Weg).
2. Gehen Sie zum Arzt. Dauert die Krankheit länger als 3 Kalendertage, brauchen Sie eine ärztliche Arbeitsunfähigkeitsbescheinigung; der Arbeitgeber kann sie auch früher verlangen.
3. Bei gesetzlich Versicherten geht die Bescheinigung meist elektronisch (eAU) an die Krankenkasse, der Arbeitgeber ruft sie dort ab. Die Krankmeldung beim Arbeitgeber bleibt trotzdem Ihre Pflicht.

**Lohn bei Krankheit:** Besteht das Arbeitsverhältnis länger als 4 Wochen, zahlt der Arbeitgeber den Lohn bis zu 6 Wochen weiter. Danach zahlt die Krankenkasse Krankengeld.

Wenn Sie wegen einer Krankheit unter Druck gesetzt oder bedroht werden, holen Sie sich Hilfe (Modul 4).`,
            en: `## Holidays (Urlaub)

- Statutory minimum: on a 5-day week **20 working days** a year (24 on a 6-day week). Many contracts give more (25–30 days).
- You are entitled to the full annual leave after **6 months** in the job; before that, a share for each full month.
- Agree holiday dates with your employer in advance. Your pay continues during holidays.

## When you are sick

1. Tell your employer **immediately**, if possible before your shift starts (phone or the agreed channel).
2. See a doctor. If the illness lasts longer than 3 calendar days you need a doctor's certificate of incapacity for work (Arbeitsunfähigkeitsbescheinigung); the employer may ask for it earlier.
3. For people with statutory health insurance the certificate usually goes electronically (eAU) to the health insurer, and the employer retrieves it there. Reporting sick to the employer is still your duty.

**Pay during illness:** if you have been employed for more than 4 weeks, the employer keeps paying your wage for up to 6 weeks. After that the health insurer pays sickness benefit (Krankengeld).

If you are pressured or threatened because you are sick, get help (module 4).`,
            ru: `## Отпуск (Urlaub)

- Минимум по закону: при 5-дневной неделе **20 рабочих дней** в году (при 6-дневной — 24). Во многих договорах больше (25–30 дней).
- Право на полный годовой отпуск возникает через **6 месяцев** работы; до этого — пропорционально за каждый полный месяц.
- Согласовывайте даты отпуска с работодателем заранее. Во время отпуска зарплата сохраняется.

## Если вы заболели

1. Сообщите работодателю **сразу**, по возможности до начала смены (по телефону или согласованным способом).
2. Обратитесь к врачу. Если болезнь длится дольше 3 календарных дней, нужна справка о нетрудоспособности (Arbeitsunfähigkeitsbescheinigung); работодатель может потребовать её и раньше.
3. У застрахованных в государственной больничной кассе справка обычно передаётся электронно (eAU) в кассу, работодатель получает её оттуда. Сообщить работодателю о болезни — всё равно ваша обязанность.

**Зарплата во время болезни:** если вы работаете дольше 4 недель, работодатель продолжает платить зарплату до 6 недель. После этого больничная касса выплачивает пособие (Krankengeld).

Если на вас давят или угрожают из-за болезни, обратитесь за помощью (модуль 4).`,
          },
        },
        {
          kind: 'QUIZ',
          passMark: 75,
          title: quizTitle(1),
          body: quizIntro,
          questions: [
            {
              prompt: {
                az: 'Sınaq müddətində (Probezeit) müqavilə adətən hansı xəbərdarlıq müddəti ilə ləğv edilə bilər?',
                de: 'Mit welcher Frist kann während der Probezeit in der Regel gekündigt werden?',
                en: 'With how much notice can a contract usually be ended during the probation period?',
                ru: 'С каким сроком уведомления обычно можно расторгнуть договор во время испытательного срока?',
              },
              options: [
                { az: '2 həftə', de: '2 Wochen', en: '2 weeks', ru: '2 недели' },
                { az: '3 ay', de: '3 Monate', en: '3 months', ru: '3 месяца' },
                { az: '1 gün', de: '1 Tag', en: '1 day', ru: '1 день' },
                { az: 'Ümumiyyətlə ləğv etmək olmaz', de: 'Gar nicht', en: 'It cannot be ended at all', ru: 'Расторгнуть нельзя вообще' },
              ],
              correct: [0],
              explanation: {
                az: 'Sınaq müddəti ən çox 6 aydır; bu dövrdə xəbərdarlıq müddəti adətən 2 həftədir.',
                de: 'Die Probezeit dauert höchstens 6 Monate; die Kündigungsfrist beträgt dann in der Regel 2 Wochen.',
                en: 'Probation lasts up to 6 months; the notice period during it is usually 2 weeks.',
                ru: 'Испытательный срок — до 6 месяцев; срок уведомления в это время обычно 2 недели.',
              },
            },
            {
              prompt: {
                az: '5 günlük iş həftəsində qanuni minimum illik məzuniyyət neçə iş günüdür?',
                de: 'Wie viele Urlaubstage stehen gesetzlich mindestens zu (5-Tage-Woche)?',
                en: 'What is the statutory minimum holiday on a 5-day week?',
                ru: 'Каков минимальный отпуск по закону при 5-дневной неделе?',
              },
              options: [
                { az: '10 gün', de: '10 Tage', en: '10 days', ru: '10 дней' },
                { az: '20 gün', de: '20 Tage', en: '20 days', ru: '20 дней' },
                { az: '40 gün', de: '40 Tage', en: '40 days', ru: '40 дней' },
                { az: 'Qanunla müəyyən edilməyib', de: 'Gesetzlich nicht geregelt', en: 'Not set by law', ru: 'Законом не установлен' },
              ],
              correct: [1],
              explanation: {
                az: 'Qanuni minimum 20 iş günüdür; müqavilə daha çox verə bilər.',
                de: 'Das gesetzliche Minimum sind 20 Arbeitstage; der Vertrag kann mehr vorsehen.',
                en: 'The statutory minimum is 20 working days; the contract may give more.',
                ru: 'Минимум по закону — 20 рабочих дней; договор может давать больше.',
              },
            },
            {
              kind: 'MULTIPLE',
              prompt: {
                az: 'Xəstələndiniz. Nə etməlisiniz? (bir neçə cavab)',
                de: 'Sie sind krank. Was müssen Sie tun? (mehrere Antworten)',
                en: 'You are sick. What do you have to do? (several answers)',
                ru: 'Вы заболели. Что нужно сделать? (несколько ответов)',
              },
              options: [
                { az: 'İşəgötürənə dərhal xəbər vermək', de: 'Den Arbeitgeber sofort informieren', en: 'Tell the employer immediately', ru: 'Сразу сообщить работодателю' },
                { az: 'Həkimə getmək; 3 gündən çox çəkərsə, arayış almaq', de: 'Zum Arzt gehen; ab mehr als 3 Tagen eine Bescheinigung', en: 'See a doctor; get a certificate if it lasts more than 3 days', ru: 'Пойти к врачу; при болезни дольше 3 дней получить справку' },
                { az: 'Heç kimə demədən evdə qalmaq', de: 'Ohne Bescheid zu Hause bleiben', en: 'Stay at home without telling anyone', ru: 'Остаться дома, никому не сообщая' },
                { az: 'Yalnız iş yoldaşına mesaj yazmaq', de: 'Nur einem Kollegen schreiben', en: 'Only text a colleague', ru: 'Написать только коллеге' },
              ],
              correct: [0, 1],
              explanation: {
                az: 'Xəbər vermək öhdəliyi sizdədir; həkim arayışı isə 3 gündən çox xəstəlikdə (və ya işəgötürən tələb etdikdə) lazımdır.',
                de: 'Die Krankmeldung ist Ihre Pflicht; die Bescheinigung brauchen Sie ab mehr als 3 Tagen (oder wenn der Arbeitgeber sie früher verlangt).',
                en: 'Reporting sick is your duty; the certificate is needed after more than 3 days (or earlier if the employer asks).',
                ru: 'Сообщить о болезни — ваша обязанность; справка нужна при болезни дольше 3 дней (или раньше, если требует работодатель).',
              },
            },
            {
              prompt: {
                az: 'Müqavilədə yazılan əmək haqqı adətən hansıdır?',
                de: 'Welcher Lohn steht normalerweise im Vertrag?',
                en: 'Which pay is usually written in the contract?',
                ru: 'Какая зарплата обычно указана в договоре?',
              },
              options: [
                { az: 'Brutto — vergi və sosial sığorta haqları ondan tutulur', de: 'Brutto – Steuern und Sozialabgaben gehen noch ab', en: 'Gross — tax and social contributions are still deducted', ru: 'Брутто — из неё ещё удерживаются налоги и взносы' },
                { az: 'Netto — əlinizə çatan məbləğ', de: 'Netto – der ausgezahlte Betrag', en: 'Net — the amount paid out', ru: 'Нетто — сумма на руки' },
                { az: 'Yalnız bonuslar', de: 'Nur Prämien', en: 'Only bonuses', ru: 'Только премии' },
              ],
              correct: [0],
            },
            {
              prompt: {
                az: 'Neçə saatdan çox işdə ən azı 30 dəqiqə fasilə verilməlidir?',
                de: 'Ab wie vielen Arbeitsstunden sind mindestens 30 Minuten Pause vorgeschrieben?',
                en: 'After how many hours of work is a break of at least 30 minutes required?',
                ru: 'После скольких часов работы обязателен перерыв не менее 30 минут?',
              },
              options: [
                { az: '3 saatdan çox', de: 'Mehr als 3 Stunden', en: 'More than 3 hours', ru: 'Более 3 часов' },
                { az: '6 saatdan çox', de: 'Mehr als 6 Stunden', en: 'More than 6 hours', ru: 'Более 6 часов' },
                { az: '12 saatdan çox', de: 'Mehr als 12 Stunden', en: 'More than 12 hours', ru: 'Более 12 часов' },
              ],
              correct: [1],
            },
          ],
        },
      ],
    },
    // ─── 2. Culture and everyday life ────────────────────────────────
    {
      title: { az: 'Mədəniyyət və gündəlik həyat', de: 'Kultur und Alltag', en: 'Culture and everyday life', ru: 'Культура и повседневная жизнь' },
      description: {
        az: 'İş mədəniyyəti, qonşuluq, tullantılar, nəqliyyat və rəsmi məktublar.',
        de: 'Arbeitskultur, Nachbarschaft, Müll, Verkehr und Behördenpost.',
        en: 'Work culture, neighbours, waste, transport and official letters.',
        ru: 'Рабочая культура, соседи, мусор, транспорт и официальные письма.',
      },
      lessons: [
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'İş mədəniyyəti', de: 'Arbeitskultur', en: 'Work culture', ru: 'Рабочая культура' },
          body: {
            az: `## İş yerində

- **Dəqiqlik:** vaxtında gəlmək hörmət əlamətidir. Gecikəcəksinizsə, əvvəlcədən zəng edin.
- **Müraciət:** iş yerində və rəsmi yerlərdə "Sie" (siz) və soyad (Herr / Frau …) işlədilir. "du"-ya keçməyi adətən rəhbər və ya yaşca böyük olan təklif edir.
- **Açıq ünsiyyət:** almanlar fikirlərini çox vaxt birbaşa deyirlər — bu, kobudluq deyil. Siz də aydın danışın, başa düşmədikdə yenidən soruşun: "Können Sie das bitte wiederholen?"
- **Təhlükəsizlik:** iş təhlükəsizliyi qaydalarına (qoruyucu geyim, təlimatlar) mütləq əməl edin. Sual vermək və təhlükəli göstərişi əvvəlcə aydınlaşdırmaq hüququnuz var.
- **Yazılı təsdiq:** vacib razılaşmaları (növbə dəyişikliyi, məzuniyyət, əlavə iş) qısa e-poçt və ya mesajla təsdiqləyin.
- **Hörmət:** fərqli fikir, din və həyat tərzinə hörmət gözlənilir. İş yerində ayrı-seçkilik qanunla qadağandır.`,
            de: `## Am Arbeitsplatz

- **Pünktlichkeit:** Pünktlich zu sein gilt als Zeichen von Respekt. Wenn Sie sich verspäten, rufen Sie vorher an.
- **Anrede:** Am Arbeitsplatz und bei Behörden sagt man „Sie“ und den Nachnamen (Herr / Frau …). Das „Du“ bietet meist die vorgesetzte oder ältere Person an.
- **Direkte Kommunikation:** Viele Deutsche sagen ihre Meinung direkt – das ist nicht unhöflich gemeint. Sprechen auch Sie klar und fragen Sie nach, wenn Sie etwas nicht verstehen: „Können Sie das bitte wiederholen?“
- **Sicherheit:** Halten Sie die Arbeitsschutzregeln (Schutzkleidung, Unterweisungen) unbedingt ein. Sie dürfen Fragen stellen und eine gefährliche Anweisung zuerst klären.
- **Schriftlich bestätigen:** Wichtige Absprachen (Schichttausch, Urlaub, Überstunden) kurz per E-Mail oder Nachricht bestätigen.
- **Respekt:** Respekt vor anderen Meinungen, Religionen und Lebensweisen wird erwartet. Diskriminierung am Arbeitsplatz ist gesetzlich verboten.`,
            en: `## At work

- **Punctuality:** being on time is a sign of respect. If you will be late, call ahead.
- **Forms of address:** at work and with authorities people use "Sie" and the surname (Herr / Frau …). Switching to "du" is usually offered by the manager or the older person.
- **Direct communication:** many Germans say what they think directly — it is not meant rudely. Speak clearly too, and ask again when you do not understand: "Können Sie das bitte wiederholen?"
- **Safety:** always follow occupational safety rules (protective clothing, instructions). You may ask questions and clarify a dangerous instruction first.
- **Confirm in writing:** confirm important agreements (shift swaps, holidays, overtime) with a short e-mail or message.
- **Respect:** respect for other opinions, religions and ways of life is expected. Discrimination at work is prohibited by law.`,
            ru: `## На работе

- **Пунктуальность:** приходить вовремя — знак уважения. Если опаздываете, позвоните заранее.
- **Обращение:** на работе и в учреждениях говорят «Sie» и называют фамилию (Herr / Frau …). Перейти на «du» обычно предлагает руководитель или старший по возрасту.
- **Прямое общение:** многие немцы говорят своё мнение прямо — это не грубость. Говорите тоже ясно и переспрашивайте, если не поняли: «Können Sie das bitte wiederholen?»
- **Безопасность:** обязательно соблюдайте правила охраны труда (защитная одежда, инструктажи). Вы вправе задавать вопросы и сначала уточнить опасное указание.
- **Письменное подтверждение:** важные договорённости (обмен сменами, отпуск, сверхурочные) подтверждайте коротким письмом или сообщением.
- **Уважение:** ожидается уважение к другим мнениям, религиям и образу жизни. Дискриминация на работе запрещена законом.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 6,
          title: { az: 'Gündəlik həyat', de: 'Alltag', en: 'Everyday life', ru: 'Повседневная жизнь' },
          body: {
            az: `## Evdə və şəhərdə

- **Sakitlik saatları (Ruhezeit):** yaşayış binalarında adətən 22:00–06:00 və bazar günləri səs-küy salmamaq gözlənilir. Dəqiq qaydalar ev qaydalarındadır (Hausordnung).
- **Tullantıların ayrılması (Mülltrennung):** kağız, qablaşdırma, bio-tullantı, qalıq tullantı və şüşə ayrıca atılır; konteyner rəngləri şəhərdən asılıdır. "Pfand" işarəli butulkaları mağazaya qaytarıb pulunu geri alırsınız.
- **Mağazalar** bazar günləri əksəriyyətlə bağlıdır. Nağd pul hələ də geniş istifadə olunur, kartla ödəniş də çox yerdə mümkündür.
- **Nəqliyyat:** "Deutschlandticket" aylıq abunə ilə bütün ölkədə yerli və regional nəqliyyatdan istifadəyə imkan verir (**2026-cı il üçün ayda 63 €**; qiymət dəyişə bilər). Biletsiz gediş cərimələnir.
- **Radio-televiziya rüsumu (Rundfunkbeitrag):** hər mənzil üçün bir dəfə ödənilir (**2025-ci il: ayda 18,36 €**; dəyişə bilər). Bu barədə məktub gələcək — diqqətsiz qoymayın.

## Rəsmi məktublar

Dövlət orqanlarından gələn məktubların çox vaxt cavab müddəti olur. Başa düşmədiyiniz məktubu atmayın: kabinetinizdəki "Məktubu izah et" funksiyasından istifadə edin və ya bizə yazın. Poçt qutunuzda adınızın yazıldığından əmin olun.`,
            de: `## Zu Hause und in der Stadt

- **Ruhezeiten:** In Wohnhäusern erwartet man meist von 22 bis 6 Uhr und an Sonntagen Ruhe. Die genauen Regeln stehen in der Hausordnung.
- **Mülltrennung:** Papier, Verpackungen, Bioabfall, Restmüll und Glas werden getrennt; die Tonnenfarben unterscheiden sich je nach Stadt. Flaschen mit Pfand-Zeichen bringen Sie in den Laden zurück und bekommen das Pfand zurück.
- **Geschäfte** sind sonntags meist geschlossen. Bargeld ist noch verbreitet, Kartenzahlung ist aber vielerorts möglich.
- **Verkehr:** Mit dem Deutschlandticket fahren Sie im Monatsabo bundesweit im Nah- und Regionalverkehr (**2026: 63 € pro Monat**; der Preis kann sich ändern). Schwarzfahren kostet ein erhöhtes Beförderungsentgelt.
- **Rundfunkbeitrag:** wird einmal pro Wohnung gezahlt (**2025: 18,36 € pro Monat**; kann sich ändern). Sie bekommen dazu Post – nicht liegen lassen.

## Behördenpost

Briefe von Behörden haben oft eine Frist. Werfen Sie keinen Brief weg, den Sie nicht verstehen: Nutzen Sie die Funktion „Brief erklären“ in Ihrem Konto oder schreiben Sie uns. Achten Sie darauf, dass Ihr Name am Briefkasten steht.`,
            en: `## At home and in town

- **Quiet hours (Ruhezeit):** in residential buildings quiet is usually expected from 10 pm to 6 am and on Sundays. The exact rules are in the house rules (Hausordnung).
- **Waste separation (Mülltrennung):** paper, packaging, organic waste, residual waste and glass are separated; bin colours differ from city to city. Bottles with the "Pfand" sign go back to the shop and you get the deposit back.
- **Shops** are mostly closed on Sundays. Cash is still common, but card payment is possible in many places.
- **Transport:** the Deutschlandticket is a monthly subscription for local and regional transport across Germany (**2026: 63 € per month**; the price may change). Riding without a ticket is fined.
- **Broadcasting fee (Rundfunkbeitrag):** paid once per household (**2025: 18.36 € per month**; may change). You will receive a letter about it — do not ignore it.

## Official letters

Letters from authorities often have a deadline. Do not throw away a letter you do not understand: use "Explain a letter" in your account or write to us. Make sure your name is on your letterbox.`,
            ru: `## Дома и в городе

- **Часы тишины (Ruhezeit):** в жилых домах обычно ожидают тишины с 22:00 до 6:00 и по воскресеньям. Точные правила — в правилах дома (Hausordnung).
- **Сортировка мусора (Mülltrennung):** бумагу, упаковку, биоотходы, остаточный мусор и стекло выбрасывают отдельно; цвета контейнеров зависят от города. Бутылки со знаком «Pfand» сдают в магазин и получают залог обратно.
- **Магазины** по воскресеньям в основном закрыты. Наличные всё ещё в ходу, но картой можно платить во многих местах.
- **Транспорт:** Deutschlandticket — месячный абонемент на местный и региональный транспорт по всей Германии (**2026: 63 € в месяц**; цена может измениться). За безбилетный проезд штрафуют.
- **Взнос за радио и ТВ (Rundfunkbeitrag):** платится один раз на квартиру (**2025: 18,36 € в месяц**; может измениться). Об этом придёт письмо — не оставляйте его без внимания.

## Официальные письма

У писем от учреждений часто есть срок ответа. Не выбрасывайте письмо, которое не понимаете: воспользуйтесь функцией «Объяснить письмо» в личном кабинете или напишите нам. Проследите, чтобы ваше имя было на почтовом ящике.`,
          },
        },
        {
          kind: 'QUIZ',
          passMark: 75,
          title: quizTitle(2),
          body: quizIntro,
          questions: [
            {
              prompt: {
                az: 'Yaşayış binalarında sakitlik saatları adətən nə vaxtdır?',
                de: 'Wann gelten in Wohnhäusern meist Ruhezeiten?',
                en: 'When are quiet hours usually observed in residential buildings?',
                ru: 'Когда в жилых домах обычно действуют часы тишины?',
              },
              options: [
                { az: '22:00–06:00 və bazar günləri', de: '22–6 Uhr und sonntags', en: '10 pm–6 am and on Sundays', ru: 'С 22:00 до 6:00 и по воскресеньям' },
                { az: 'Yalnız 12:00–14:00', de: 'Nur 12–14 Uhr', en: 'Only 12–2 pm', ru: 'Только с 12:00 до 14:00' },
                { az: 'Sakitlik saatı yoxdur', de: 'Es gibt keine', en: 'There are none', ru: 'Их нет' },
              ],
              correct: [0],
            },
            {
              prompt: {
                az: 'Yeni rəhbərinizə adətən necə müraciət edirsiniz?',
                de: 'Wie sprechen Sie eine neue Vorgesetzte / einen neuen Vorgesetzten meist an?',
                en: 'How do you usually address a new manager?',
                ru: 'Как обычно обращаются к новому руководителю?',
              },
              options: [
                { az: '"Sie" və soyadla (Herr / Frau …)', de: 'Mit „Sie“ und Nachnamen (Herr / Frau …)', en: 'With "Sie" and the surname (Herr / Frau …)', ru: 'На «Sie» и по фамилии (Herr / Frau …)' },
                { az: 'Dərhal "du" və adla', de: 'Sofort mit „du“ und Vornamen', en: 'With "du" and the first name straight away', ru: 'Сразу на «du» и по имени' },
                { az: 'Müraciət etmədən', de: 'Ohne Anrede', en: 'Without any form of address', ru: 'Без обращения' },
              ],
              correct: [0],
            },
            {
              kind: 'MULTIPLE',
              prompt: {
                az: 'Hansılar iş yerində yaxşı təcrübədir? (bir neçə cavab)',
                de: 'Was gehört zu einem guten Verhalten am Arbeitsplatz? (mehrere Antworten)',
                en: 'Which of these is good practice at work? (several answers)',
                ru: 'Что из этого — хорошая практика на работе? (несколько ответов)',
              },
              options: [
                { az: 'Vaxtında gəlmək, gecikəndə əvvəlcədən zəng etmək', de: 'Pünktlich sein, bei Verspätung vorher anrufen', en: 'Being on time, calling ahead if late', ru: 'Приходить вовремя, при опоздании звонить заранее' },
                { az: 'Vacib razılaşmaları yazılı təsdiqləmək', de: 'Wichtige Absprachen schriftlich bestätigen', en: 'Confirming important agreements in writing', ru: 'Подтверждать важные договорённости письменно' },
                { az: 'Tələsəndə təhlükəsizlik qaydalarını ötürmək', de: 'Bei Zeitdruck Sicherheitsregeln weglassen', en: 'Skipping safety rules when in a hurry', ru: 'Пропускать правила безопасности, когда спешишь' },
                { az: 'Başa düşmədikdə sual verməmək', de: 'Bei Unklarheiten nicht nachfragen', en: 'Not asking when something is unclear', ru: 'Не переспрашивать, если непонятно' },
              ],
              correct: [0, 1],
            },
            {
              prompt: {
                az: 'Başa düşmədiyiniz rəsmi məktub aldınız. Ən yaxşısı nədir?',
                de: 'Sie bekommen einen Behördenbrief, den Sie nicht verstehen. Was ist am besten?',
                en: 'You receive an official letter you do not understand. What is best?',
                ru: 'Вы получили официальное письмо и не понимаете его. Как лучше поступить?',
              },
              options: [
                { az: 'İzah və ya tərcümə istəmək, müddətə diqqət etmək', de: 'Erklärung oder Übersetzung holen, Frist beachten', en: 'Get an explanation or translation and watch the deadline', ru: 'Получить объяснение или перевод и следить за сроком' },
                { az: 'Məktubu atmaq', de: 'Den Brief wegwerfen', en: 'Throw the letter away', ru: 'Выбросить письмо' },
                { az: 'Bir neçə ay gözləmək', de: 'Ein paar Monate warten', en: 'Wait a few months', ru: 'Подождать несколько месяцев' },
              ],
              correct: [0],
              explanation: {
                az: 'Rəsmi məktubların çox vaxt cavab müddəti olur; kabinetdəki "Məktubu izah et" funksiyası kömək edə bilər.',
                de: 'Behördenbriefe haben oft eine Frist; die Funktion „Brief erklären“ in Ihrem Konto kann helfen.',
                en: 'Official letters often have a deadline; "Explain a letter" in your account can help.',
                ru: 'У официальных писем часто есть срок; помочь может функция «Объяснить письмо» в кабинете.',
              },
            },
          ],
        },
      ],
    },
    // ─── 3. First days ──────────────────────────────────────────────
    {
      title: { az: 'İlk günlər', de: 'Die ersten Tage', en: 'The first days', ru: 'Первые дни' },
      description: {
        az: 'Anmeldung, bank hesabı, sığorta və vergi nömrəsi.',
        de: 'Anmeldung, Bankkonto, Versicherung und Steuer-ID.',
        en: 'Address registration, bank account, insurance and tax ID.',
        ru: 'Регистрация по адресу, банковский счёт, страховка и налоговый номер.',
      },
      lessons: [
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'Ünvan qeydiyyatı (Anmeldung)', de: 'Die Anmeldung', en: 'Address registration (Anmeldung)', ru: 'Регистрация по адресу (Anmeldung)' },
          body: {
            az: `## Anmeldung

Mənzilə köçdükdən sonra **2 həftə ərzində** yaşayış yerinizi Bürgeramt-da (Einwohnermeldeamt) qeydiyyatdan keçirməlisiniz. Qeydiyyat vergi nömrəsi, bank hesabı və yaşayış icazəsi üçün də lazımdır.

**Lazım olanlar:**

- pasport (viza ilə);
- doldurulmuş qeydiyyat forması;
- mənzil sahibindən "Wohnungsgeberbestätigung" (ev sahibinin təsdiqi).

Bir çox şəhərdə əvvəlcədən onlayn növbə götürmək lazımdır — növbəni ilk gündən axtarın.

**Nəticə:** Meldebescheinigung (qeydiyyat arayışı). Onu saxlayın — bank, işəgötürən və idarələr tələb edə bilər. Ünvanınızı dəyişəndə yenidən qeydiyyatdan keçməlisiniz.

## Yaşayış icazəsi

Milli viza (D) məhdud müddətlidir. Vizanın bitməsindən xeyli əvvəl yaşadığınız yerin Ausländerbehörde-sində yaşayış icazəsi üçün növbə götürün. Komandamız lazımi sənədlərlə kömək edə bilər.`,
            de: `## Anmeldung

Nach dem Einzug müssen Sie Ihre Wohnung **innerhalb von 2 Wochen** beim Bürgeramt (Einwohnermeldeamt) anmelden. Die Anmeldung brauchen Sie auch für Steuer-ID, Bankkonto und Aufenthaltserlaubnis.

**Sie brauchen:**

- Reisepass (mit Visum);
- ausgefülltes Anmeldeformular;
- die Wohnungsgeberbestätigung vom Vermieter.

In vielen Städten braucht man vorher einen Online-Termin – suchen Sie ihn gleich am ersten Tag.

**Ergebnis:** die Meldebescheinigung. Heben Sie sie auf – Bank, Arbeitgeber und Ämter können sie verlangen. Bei einem Umzug melden Sie sich erneut an.

## Aufenthaltserlaubnis

Das nationale Visum (D) ist befristet. Vereinbaren Sie rechtzeitig vor Ablauf einen Termin bei der Ausländerbehörde Ihres Wohnorts für die Aufenthaltserlaubnis. Unser Team hilft Ihnen mit den Unterlagen.`,
            en: `## Anmeldung

After moving in, you must register your address at the Bürgeramt (Einwohnermeldeamt) **within 2 weeks**. You also need the registration for your tax ID, a bank account and the residence permit.

**You need:**

- your passport (with the visa);
- the completed registration form;
- the landlord's confirmation (Wohnungsgeberbestätigung).

Many cities require an online appointment — start looking for one on your first day.

**Result:** the registration certificate (Meldebescheinigung). Keep it — the bank, your employer and authorities may ask for it. When you move, you register again.

## Residence permit

The national visa (D) is limited in time. Well before it expires, book an appointment at the Ausländerbehörde where you live to apply for the residence permit. Our team can help you with the documents.`,
            ru: `## Anmeldung

После заселения нужно **в течение 2 недель** зарегистрировать адрес в Bürgeramt (Einwohnermeldeamt). Регистрация нужна также для налогового номера, банковского счёта и вида на жительство.

**Что нужно:**

- паспорт (с визой);
- заполненный бланк регистрации;
- подтверждение арендодателя (Wohnungsgeberbestätigung).

Во многих городах нужна предварительная онлайн-запись — ищите её с первого дня.

**Результат:** справка о регистрации (Meldebescheinigung). Сохраните её — её могут попросить банк, работодатель и учреждения. При переезде нужно зарегистрироваться заново.

## Вид на жительство

Национальная виза (D) ограничена по сроку. Заранее, до окончания визы, запишитесь в Ausländerbehörde по месту жительства на оформление вида на жительство. Наша команда поможет с документами.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 4,
          title: { az: 'Bank hesabı', de: 'Das Bankkonto', en: 'The bank account', ru: 'Банковский счёт' },
          body: {
            az: `## Bank hesabı (Girokonto)

Əmək haqqı adətən bank hesabına köçürülür — işəgötürənə IBAN nömrənizi verməlisiniz.

- **Sənədlər:** pasport, adətən Meldebescheinigung; bəzi banklar vergi nömrəsini də soruşur.
- **Seçim:** filialı olan banklar və onlayn banklar var. Aylıq xidmət haqqını, kart və nağd pul çıxarma şərtlərini müqayisə edin.
- **Əsas hesab (Basiskonto):** Aİ-də qanuni yaşayan hər kəsin sadə ödəniş hesabı açmaq hüququ var.
- **Təhlükəsizlik:** PIN, TAN və onlayn bank şifrənizi heç kimə deməyin. Bank bunu heç vaxt telefonla, SMS və ya e-poçtla soruşmur.
- **Vətənə pul göndərmək:** komissiyanı və valyuta məzənnəsini müqayisə edin, yalnız lisenziyalı xidmətlərdən istifadə edin.`,
            de: `## Das Girokonto

Der Lohn wird meist auf ein Bankkonto überwiesen – Sie geben dem Arbeitgeber Ihre IBAN.

- **Unterlagen:** Reisepass, meist die Meldebescheinigung; manche Banken fragen auch nach der Steuer-ID.
- **Auswahl:** Es gibt Filialbanken und Online-Banken. Vergleichen Sie Kontoführungsgebühren sowie Karten- und Bargeldkonditionen.
- **Basiskonto:** Wer sich rechtmäßig in der EU aufhält, hat Anspruch auf ein einfaches Zahlungskonto.
- **Sicherheit:** Geben Sie PIN, TAN und Online-Banking-Passwort niemals weiter. Die Bank fragt danach nie per Telefon, SMS oder E-Mail.
- **Geld in die Heimat schicken:** Gebühren und Wechselkurs vergleichen, nur zugelassene Anbieter nutzen.`,
            en: `## The current account (Girokonto)

Your pay is usually transferred to a bank account — you give your employer your IBAN.

- **Documents:** passport, usually the registration certificate; some banks also ask for the tax ID.
- **Choice:** there are banks with branches and online banks. Compare account fees and the conditions for cards and cash withdrawals.
- **Basic account (Basiskonto):** anyone legally resident in the EU is entitled to a simple payment account.
- **Security:** never share your PIN, TAN or online banking password. The bank never asks for them by phone, text message or e-mail.
- **Sending money home:** compare fees and exchange rates, and only use licensed providers.`,
            ru: `## Текущий счёт (Girokonto)

Зарплату обычно переводят на банковский счёт — сообщите работодателю свой IBAN.

- **Документы:** паспорт, обычно справка о регистрации; некоторые банки спрашивают и налоговый номер.
- **Выбор:** есть банки с отделениями и онлайн-банки. Сравните плату за обслуживание, условия по картам и снятию наличных.
- **Базовый счёт (Basiskonto):** каждый, кто законно находится в ЕС, имеет право на простой платёжный счёт.
- **Безопасность:** никому не сообщайте PIN, TAN и пароль онлайн-банка. Банк никогда не спрашивает их по телефону, SMS или e-mail.
- **Переводы домой:** сравнивайте комиссии и курс, пользуйтесь только лицензированными сервисами.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'Sığorta', de: 'Versicherungen', en: 'Insurance', ru: 'Страхование' },
          body: {
            az: `## Sığorta

- **Tibbi sığorta (Krankenversicherung) məcburidir.** İşçilər adətən dövlət tibbi sığorta kassasında (gesetzliche Krankenkasse) olur. Kassanı özünüz seçir və işəgötürənə bildirirsiniz; haqq əmək haqqından tutulur. Həkimə gedəndə sığorta kartınızı (Gesundheitskarte) göstərin.
- **Səyahət tibbi sığortası** yalnız ilk dövr üçündür — işə başladığınız gündən Krankenkasse üzvlüyünüz olmalıdır.
- **Sosial sığorta nömrəsi (Sozialversicherungsnummer):** pensiya sığortası tərəfindən verilir; adətən işəgötürən qeydiyyatı edir və nömrə poçtla gəlir.
- **Şəxsi məsuliyyət sığortası (Privathaftpflicht)** məcburi deyil, amma tövsiyə olunur: başqasına təsadüfən vurduğunuz zərəri ödəyir.
- **Avtomobil sığortası** avtomobiliniz varsa məcburidir.

Sığorta müqaviləsini tələsik imzalamayın. Sizə lazım olmayan, bahalı sığortaları təkidlə təklif edənlərdən ehtiyatlı olun.`,
            de: `## Versicherungen

- **Die Krankenversicherung ist Pflicht.** Arbeitnehmer sind meist in einer gesetzlichen Krankenkasse versichert. Sie wählen die Kasse selbst und teilen sie dem Arbeitgeber mit; der Beitrag wird vom Lohn abgezogen. Beim Arzt zeigen Sie Ihre Gesundheitskarte.
- **Die Reisekrankenversicherung** gilt nur für die erste Zeit – ab Arbeitsbeginn brauchen Sie die Mitgliedschaft in einer Krankenkasse.
- **Sozialversicherungsnummer:** vergibt die Rentenversicherung; meist meldet Sie der Arbeitgeber an, die Nummer kommt per Post.
- **Privathaftpflichtversicherung:** keine Pflicht, aber empfehlenswert – sie zahlt Schäden, die Sie anderen versehentlich zufügen.
- **Kfz-Versicherung:** Pflicht, wenn Sie ein Auto haben.

Unterschreiben Sie Versicherungsverträge nicht übereilt. Seien Sie vorsichtig bei Personen, die Ihnen hartnäckig teure Versicherungen anbieten, die Sie nicht brauchen.`,
            en: `## Insurance

- **Health insurance (Krankenversicherung) is mandatory.** Employees are usually insured with a statutory health insurer (gesetzliche Krankenkasse). You choose the insurer yourself and tell your employer; the contribution is deducted from your pay. Show your health insurance card (Gesundheitskarte) at the doctor's.
- **Travel health insurance** is only for the first period — from your first working day you need membership of a Krankenkasse.
- **Social security number (Sozialversicherungsnummer):** issued by the pension insurance; usually your employer registers you and the number arrives by post.
- **Personal liability insurance (Privathaftpflicht)** is not mandatory but recommended: it pays for damage you accidentally cause to others.
- **Car insurance** is mandatory if you have a car.

Do not sign insurance contracts in a hurry. Be careful with people who push expensive insurance you do not need.`,
            ru: `## Страхование

- **Медицинская страховка (Krankenversicherung) обязательна.** Работники обычно застрахованы в государственной больничной кассе (gesetzliche Krankenkasse). Кассу вы выбираете сами и сообщаете работодателю; взнос удерживается из зарплаты. У врача показывайте карту страхования (Gesundheitskarte).
- **Туристическая медицинская страховка** действует только на первое время — с первого рабочего дня нужно членство в Krankenkasse.
- **Номер социального страхования (Sozialversicherungsnummer):** выдаёт пенсионное страхование; обычно работодатель регистрирует вас, номер приходит по почте.
- **Страхование личной ответственности (Privathaftpflicht)** не обязательно, но рекомендуется: оно покрывает ущерб, который вы случайно причинили другим.
- **Автостраховка** обязательна, если у вас есть машина.

Не подписывайте страховые договоры в спешке. Будьте осторожны с теми, кто настойчиво предлагает дорогие и ненужные вам страховки.`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 4,
          title: { az: 'Vergi nömrəsi (Steuer-ID)', de: 'Die Steuer-ID', en: 'The tax ID (Steuer-ID)', ru: 'Налоговый номер (Steuer-ID)' },
          body: {
            az: `## Vergi identifikasiya nömrəsi

- Ünvan qeydiyyatından sonra Federal Vergi Mərkəzi (Bundeszentralamt für Steuern) **11 rəqəmli vergi nömrənizi** poçtla göndərir — adətən bir neçə həftə ərzində. Poçt qutunuzda adınızın yazıldığından əmin olun.
- Nömrəni işəgötürənə verin. Nömrə olmadan işəgötürən müvəqqəti olaraq ən yüksək vergi sinfi (VI) ilə vergi tuta bilər; nömrə gəldikdən sonra bu düzəldilir.
- **Vergi sinfi (Steuerklasse):** subay işçilər adətən I sinifdə olur; evlilər üçün başqa siniflər mümkündür.
- **Kilsə vergisi (Kirchensteuer):** qeydiyyatda din sualına verdiyiniz cavab buna təsir edir — yalnız bu vergini tətbiq edən dini icmaların üzvləri ödəyir.
- **İllik vergi bəyannaməsi (Steuererklärung):** çox vaxt vergi qaytarılması ilə nəticələnir; işlə bağlı xərclər nəzərə alına bilər.`,
            de: `## Steuer-Identifikationsnummer

- Nach der Anmeldung schickt Ihnen das Bundeszentralamt für Steuern Ihre **11-stellige Steuer-ID** per Post – meist innerhalb weniger Wochen. Achten Sie darauf, dass Ihr Name am Briefkasten steht.
- Geben Sie die Nummer Ihrem Arbeitgeber. Ohne sie kann der Arbeitgeber vorübergehend nach der ungünstigsten Steuerklasse (VI) abrechnen; das wird korrigiert, sobald die Nummer vorliegt.
- **Steuerklasse:** Ledige sind meist in Klasse I; für Verheiratete gibt es andere Klassen.
- **Kirchensteuer:** Ihre Angabe zur Religion bei der Anmeldung wirkt sich darauf aus – sie zahlen nur Mitglieder von Religionsgemeinschaften, die sie erheben.
- **Steuererklärung:** führt oft zu einer Erstattung; beruflich bedingte Kosten können berücksichtigt werden.`,
            en: `## Tax identification number

- After your address registration, the Federal Central Tax Office (Bundeszentralamt für Steuern) sends your **11-digit tax ID** by post — usually within a few weeks. Make sure your name is on your letterbox.
- Give the number to your employer. Without it the employer may temporarily deduct tax at the least favourable tax class (VI); this is corrected once the number is there.
- **Tax class (Steuerklasse):** single employees are usually in class I; other classes exist for married people.
- **Church tax (Kirchensteuer):** your answer to the religion question at registration affects it — only members of religious communities that levy it pay it.
- **Annual tax return (Steuererklärung):** often leads to a refund; work-related costs can be taken into account.`,
            ru: `## Налоговый идентификационный номер

- После регистрации по адресу Федеральное центральное налоговое ведомство (Bundeszentralamt für Steuern) присылает по почте ваш **11-значный налоговый номер** — обычно в течение нескольких недель. Проследите, чтобы ваше имя было на почтовом ящике.
- Передайте номер работодателю. Без него работодатель может временно удерживать налог по самому невыгодному классу (VI); это исправляется, когда номер появится.
- **Налоговый класс (Steuerklasse):** одинокие работники обычно в классе I; для женатых есть другие классы.
- **Церковный налог (Kirchensteuer):** на него влияет ваш ответ о религии при регистрации — его платят только члены религиозных общин, которые его взимают.
- **Годовая налоговая декларация (Steuererklärung):** часто приводит к возврату налога; можно учесть расходы, связанные с работой.`,
          },
        },
        {
          kind: 'QUIZ',
          passMark: 75,
          title: quizTitle(3),
          body: quizIntro,
          questions: [
            {
              prompt: {
                az: 'Mənzilə köçdükdən sonra ünvan qeydiyyatı hansı müddətdə edilməlidir?',
                de: 'Innerhalb welcher Frist müssen Sie sich nach dem Einzug anmelden?',
                en: 'Within what time must you register your address after moving in?',
                ru: 'В какой срок нужно зарегистрировать адрес после заселения?',
              },
              options: [
                { az: '2 həftə', de: '2 Wochen', en: '2 weeks', ru: '2 недели' },
                { az: '6 ay', de: '6 Monate', en: '6 months', ru: '6 месяцев' },
                { az: 'Qeydiyyat lazım deyil', de: 'Gar nicht nötig', en: 'Not needed at all', ru: 'Регистрация не нужна' },
              ],
              correct: [0],
            },
            {
              kind: 'MULTIPLE',
              prompt: {
                az: 'Anmeldung üçün adətən nə lazımdır? (bir neçə cavab)',
                de: 'Was brauchen Sie meist für die Anmeldung? (mehrere Antworten)',
                en: 'What do you usually need for the Anmeldung? (several answers)',
                ru: 'Что обычно нужно для Anmeldung? (несколько ответов)',
              },
              options: [
                { az: 'Pasport', de: 'Reisepass', en: 'Passport', ru: 'Паспорт' },
                { az: 'Ev sahibinin təsdiqi (Wohnungsgeberbestätigung)', de: 'Wohnungsgeberbestätigung', en: "Landlord's confirmation (Wohnungsgeberbestätigung)", ru: 'Подтверждение арендодателя (Wohnungsgeberbestätigung)' },
                { az: 'Notarial təsdiqli diplom', de: 'Notariell beglaubigtes Diplom', en: 'A notarised diploma', ru: 'Нотариально заверенный диплом' },
                { az: '3 aylıq bank çıxarışı', de: 'Kontoauszüge von 3 Monaten', en: '3 months of bank statements', ru: 'Банковские выписки за 3 месяца' },
              ],
              correct: [0, 1],
            },
            {
              prompt: {
                az: 'Almaniyada işçilər üçün tibbi sığorta…',
                de: 'Die Krankenversicherung ist für Arbeitnehmer in Deutschland …',
                en: 'For employees in Germany, health insurance is …',
                ru: 'Для работников в Германии медицинская страховка …',
              },
              options: [
                { az: 'məcburidir', de: 'Pflicht', en: 'mandatory', ru: 'обязательна' },
                { az: 'könüllüdür', de: 'freiwillig', en: 'optional', ru: 'добровольна' },
                { az: 'yalnız ailəlilər üçündür', de: 'nur für Familien', en: 'only for families', ru: 'только для семейных' },
              ],
              correct: [0],
            },
            {
              prompt: {
                az: 'Vergi nömrəsini (Steuer-ID) adətən necə alırsınız?',
                de: 'Wie bekommen Sie normalerweise Ihre Steuer-ID?',
                en: 'How do you normally receive your tax ID?',
                ru: 'Как обычно получают налоговый номер (Steuer-ID)?',
              },
              options: [
                { az: 'Anmeldung-dan sonra avtomatik poçtla', de: 'Nach der Anmeldung automatisch per Post', en: 'Automatically by post after the Anmeldung', ru: 'Автоматически по почте после Anmeldung' },
                { az: 'Bankda satın alıram', de: 'Ich kaufe sie bei der Bank', en: 'I buy it at the bank', ru: 'Покупаю в банке' },
                { az: 'Səfirlikdə vizadan əvvəl', de: 'Bei der Botschaft vor dem Visum', en: 'At the embassy before the visa', ru: 'В посольстве до визы' },
              ],
              correct: [0],
            },
            {
              prompt: {
                az: 'Bankdan zəng etdiyini deyən biri TAN kodunuzu soruşur. Nə edirsiniz?',
                de: 'Jemand ruft angeblich von Ihrer Bank an und fragt nach einer TAN. Was tun Sie?',
                en: 'Someone claiming to be from your bank asks for a TAN. What do you do?',
                ru: 'Кто-то, представляясь сотрудником банка, просит код TAN. Что вы делаете?',
              },
              options: [
                { az: 'Heç vaxt demirəm, zəngi bitirib bankın rəsmi nömrəsinə zəng edirəm', de: 'Nie nennen, auflegen und die offizielle Nummer der Bank anrufen', en: 'Never give it, hang up and call the bank’s official number', ru: 'Никогда не называю, кладу трубку и звоню по официальному номеру банка' },
                { az: 'Kodu deyirəm', de: 'Die TAN nennen', en: 'Give the TAN', ru: 'Называю код' },
                { az: 'Kodun yarısını deyirəm', de: 'Die Hälfte der TAN nennen', en: 'Give half of the TAN', ru: 'Называю половину кода' },
              ],
              correct: [0],
            },
          ],
        },
      ],
    },
    // ─── 4. Safety and help ──────────────────────────────────────────
    {
      title: { az: 'Təhlükəsizlik və kömək', de: 'Sicherheit und Hilfe', en: 'Safety and help', ru: 'Безопасность и помощь' },
      description: {
        az: 'Təcili nömrələr, xəbərdarlıq əlamətləri və kimə müraciət etməli.',
        de: 'Notrufnummern, Warnzeichen und wo Sie Hilfe bekommen.',
        en: 'Emergency numbers, warning signs and who to contact.',
        ru: 'Экстренные номера, тревожные признаки и куда обращаться.',
      },
      lessons: [
        {
          kind: 'TEXT',
          minutes: 4,
          title: { az: 'Təcili nömrələr', de: 'Notrufnummern', en: 'Emergency numbers', ru: 'Экстренные номера' },
          body: {
            az: `## Təcili hallarda

- **112** — təcili tibbi yardım və yanğınsöndürmə (pulsuz, bütün Aİ-də).
- **110** — polis.
- **116 117** — həyati təhlükə olmayan, amma gözləyə bilməyən hallarda iş saatlarından kənar növbətçi həkim xidməti.
- **Növbətçi aptek:** gecə və bazar günləri hansı aptekin açıq olduğu aptek qapılarında və internetdə göstərilir.

**Zəng edəndə:** nə baş verib, harada (dəqiq ünvan), neçə nəfər zərər çəkib, kim zəng edir. Suallara cavab verin və xətti birinci siz bağlamayın.

## Sənədlər itəndə

Pasport itərsə və ya oğurlanarsa, polisə bildirin və Azərbaycan Respublikasının Almaniyadakı səfirliyinə müraciət edin — əlaqə məlumatları səfirliyin rəsmi saytındadır.

Vacib nömrələri telefonunuzda və kağızda saxlayın. Pasport və vizanın surətini ayrıca saxlayın (kabinetinizdəki Sənəd seyfi).`,
            de: `## Im Notfall

- **112** – Rettungsdienst und Feuerwehr (kostenlos, in der ganzen EU).
- **110** – Polizei.
- **116 117** – ärztlicher Bereitschaftsdienst außerhalb der Sprechzeiten, wenn es nicht lebensbedrohlich ist, aber nicht warten kann.
- **Notdienst-Apotheke:** Welche Apotheke nachts und sonntags offen hat, steht an jeder Apothekentür und im Internet.

**Beim Anruf:** Was ist passiert? Wo genau (Adresse)? Wie viele Verletzte? Wer ruft an? Beantworten Sie die Rückfragen und legen Sie nicht als Erste/r auf.

## Wenn Dokumente verloren gehen

Wenn Ihr Pass verloren geht oder gestohlen wird, melden Sie es der Polizei und wenden Sie sich an die Botschaft der Republik Aserbaidschan in Deutschland – die Kontaktdaten stehen auf der offiziellen Website der Botschaft.

Speichern Sie wichtige Nummern im Handy und auf Papier. Bewahren Sie Kopien von Pass und Visum getrennt auf (Dokumenten-Tresor in Ihrem Konto).`,
            en: `## In an emergency

- **112** — ambulance and fire brigade (free of charge, in the whole EU).
- **110** — police.
- **116 117** — medical on-call service outside surgery hours, for cases that are not life-threatening but cannot wait.
- **Emergency pharmacy:** which pharmacy is open at night and on Sundays is posted on every pharmacy door and online.

**When you call:** what happened, where exactly (address), how many people are hurt, who is calling. Answer the questions and do not hang up first.

## If documents are lost

If your passport is lost or stolen, report it to the police and contact the Embassy of the Republic of Azerbaijan in Germany — contact details are on the embassy's official website.

Save important numbers on your phone and on paper. Keep copies of your passport and visa separately (document vault in your account).`,
            ru: `## В экстренной ситуации

- **112** — скорая помощь и пожарные (бесплатно, во всём ЕС).
- **110** — полиция.
- **116 117** — дежурная врачебная служба вне часов приёма, если угрозы жизни нет, но ждать нельзя.
- **Дежурная аптека:** какая аптека открыта ночью и в воскресенье, указано на двери каждой аптеки и в интернете.

**При звонке:** что случилось, где именно (адрес), сколько пострадавших, кто звонит. Отвечайте на вопросы и не кладите трубку первым.

## Если потеряны документы

Если паспорт потерян или украден, сообщите в полицию и обратитесь в посольство Азербайджанской Республики в Германии — контакты есть на официальном сайте посольства.

Сохраните важные номера в телефоне и на бумаге. Храните копии паспорта и визы отдельно (сейф документов в личном кабинете).`,
          },
        },
        {
          kind: 'TEXT',
          minutes: 5,
          title: { az: 'Hüquqlarınız və kimə müraciət etməli', de: 'Ihre Rechte und wo Sie Hilfe bekommen', en: 'Your rights and who to contact', ru: 'Ваши права и куда обращаться' },
          body: {
            az: `## Xəbərdarlıq əlamətləri

Kömək istəyin, əgər:

- işəgötürən və ya vasitəçi pasportunuzu "saxlamaq üçün" götürmək istəyirsə — pasport sizin şəxsi sənədinizdir, onu təhvil verməyin;
- əmək haqqı ödənilmir, gecikdirilir və ya hesabat olmadan nağd verilir;
- müqavilədən xeyli çox və ya ödənişsiz işləməyə məcbur edilirsinizsə;
- yaşayış, nəqliyyat və ya "vasitəçilik" üçün əsassız böyük məbləğlər tutulursa;
- hədə-qorxu, təzyiq və ya zorakılıq varsa.

## Kimə müraciət etməli

- **Komandamız** — kabinetdəki çat və ya telefonla. Növbəti addımlarda kömək edirik.
- **Faire Integration** — Aİ-dən kənar ölkələrdən olan işçilər üçün əmək hüququ və sosial məsələlər üzrə pulsuz, məxfi məsləhət, bir çox dildə.
- **Həmkarlar ittifaqı (Gewerkschaft)** — üzvlərinə məsləhət və hüquqi dəstək verir.
- **Polis (110)** — təhlükə, hədə və ya zorakılıq halında.
- **Hilfetelefon "Gewalt gegen Frauen": 116 016** — pulsuz, gecə-gündüz, bir çox dildə.
- **Telefonseelsorge** (anonim psixoloji dəstək): 0800 111 0 111 və ya 0800 111 0 222.
- **Səfirlik** — konsulluq yardımı üçün.

Minimum əmək haqqının ödənilməsinə Almaniyada gömrük xidməti (Zoll, Finanzkontrolle Schwarzarbeit) nəzarət edir.`,
            de: `## Warnzeichen

Holen Sie sich Hilfe, wenn:

- Arbeitgeber oder Vermittler Ihren Pass „zur Aufbewahrung“ an sich nehmen wollen – der Pass ist Ihr persönliches Dokument, geben Sie ihn nicht ab;
- der Lohn nicht, verspätet oder bar ohne Abrechnung gezahlt wird;
- Sie deutlich mehr als vereinbart oder unbezahlt arbeiten sollen;
- für Unterkunft, Fahrten oder „Vermittlung“ unverhältnismäßig hohe Beträge abgezogen werden;
- Sie bedroht, unter Druck gesetzt oder Gewalt ausgesetzt werden.

## Wo Sie Hilfe bekommen

- **Unser Team** – per Chat in Ihrem Konto oder telefonisch. Wir helfen bei den nächsten Schritten.
- **Faire Integration** – kostenlose, vertrauliche Beratung zu Arbeitsrecht und sozialen Fragen für Beschäftigte aus Nicht-EU-Staaten, in vielen Sprachen.
- **Gewerkschaft** – berät ihre Mitglieder und gibt Rechtsschutz.
- **Polizei (110)** – bei Gefahr, Drohungen oder Gewalt.
- **Hilfetelefon „Gewalt gegen Frauen“: 116 016** – kostenlos, rund um die Uhr, in vielen Sprachen.
- **Telefonseelsorge** (anonym): 0800 111 0 111 oder 0800 111 0 222.
- **Botschaft** – für konsularische Hilfe.

Die Zahlung des Mindestlohns kontrolliert in Deutschland der Zoll (Finanzkontrolle Schwarzarbeit).`,
            en: `## Warning signs

Get help if:

- your employer or an agent wants to keep your passport "for safekeeping" — the passport is your personal document, do not hand it over;
- your pay does not come, comes late or is paid in cash without a payslip;
- you are made to work much more than agreed, or unpaid;
- unreasonably high amounts are deducted for housing, transport or "placement";
- you are threatened, pressured or face violence.

## Who to contact

- **Our team** — via the chat in your account or by phone. We help you with the next steps.
- **Faire Integration** — free, confidential advice on labour law and social questions for workers from non-EU countries, in many languages.
- **Trade unions (Gewerkschaft)** — advise their members and provide legal protection.
- **Police (110)** — in case of danger, threats or violence.
- **Helpline "Violence against women": 116 016** — free, day and night, in many languages.
- **Telefonseelsorge** (anonymous emotional support): 0800 111 0 111 or 0800 111 0 222.
- **The embassy** — for consular help.

Payment of the minimum wage is monitored in Germany by customs (Zoll, Finanzkontrolle Schwarzarbeit).`,
            ru: `## Тревожные признаки

Обратитесь за помощью, если:

- работодатель или посредник хочет забрать ваш паспорт «на хранение» — паспорт ваш личный документ, не отдавайте его;
- зарплату не платят, задерживают или выдают наличными без расчётного листа;
- вас заставляют работать намного больше оговорённого или бесплатно;
- за жильё, проезд или «посредничество» удерживают необоснованно большие суммы;
- вам угрожают, оказывают давление или применяют насилие.

## Куда обращаться

- **Наша команда** — через чат в личном кабинете или по телефону. Мы поможем со следующими шагами.
- **Faire Integration** — бесплатные конфиденциальные консультации по трудовому праву и социальным вопросам для работников из стран вне ЕС, на многих языках.
- **Профсоюз (Gewerkschaft)** — консультирует своих членов и даёт правовую защиту.
- **Полиция (110)** — при опасности, угрозах или насилии.
- **Телефон помощи «Насилие в отношении женщин»: 116 016** — бесплатно, круглосуточно, на многих языках.
- **Telefonseelsorge** (анонимная психологическая поддержка): 0800 111 0 111 или 0800 111 0 222.
- **Посольство** — за консульской помощью.

Выплату минимальной оплаты труда в Германии контролирует таможня (Zoll, Finanzkontrolle Schwarzarbeit).`,
          },
        },
        {
          kind: 'QUIZ',
          passMark: 75,
          title: quizTitle(4),
          body: quizIntro,
          questions: [
            {
              prompt: {
                az: 'Təcili tibbi yardım və yanğınsöndürmə nömrəsi hansıdır?',
                de: 'Welche Nummer wählen Sie für Rettungsdienst und Feuerwehr?',
                en: 'Which number do you call for an ambulance or the fire brigade?',
                ru: 'По какому номеру вызывают скорую помощь и пожарных?',
              },
              options: [
                { az: '112', de: '112', en: '112', ru: '112' },
                { az: '110', de: '110', en: '110', ru: '110' },
                { az: '116 117', de: '116 117', en: '116 117', ru: '116 117' },
                { az: '911', de: '911', en: '911', ru: '911' },
              ],
              correct: [0],
            },
            {
              prompt: {
                az: 'İşəgötürən pasportunuzu "təhlükəsizlik üçün" saxlamaq istəyir. Düzgün davranış hansıdır?',
                de: 'Der Arbeitgeber möchte Ihren Pass „zur Sicherheit“ behalten. Was ist richtig?',
                en: 'Your employer wants to keep your passport "for safety". What is right?',
                ru: 'Работодатель хочет оставить ваш паспорт у себя «для надёжности». Как правильно?',
              },
              options: [
                { az: 'İmtina etmək — pasport məndə qalır; təzyiq olarsa, kömək istəmək', de: 'Ablehnen – der Pass bleibt bei mir; bei Druck Hilfe holen', en: 'Refuse — the passport stays with me; get help if pressured', ru: 'Отказаться — паспорт остаётся у меня; при давлении обратиться за помощью' },
                { az: 'Pasportu vermək', de: 'Den Pass abgeben', en: 'Hand the passport over', ru: 'Отдать паспорт' },
                { az: 'Pasportu iş yoldaşına vermək', de: 'Den Pass einem Kollegen geben', en: 'Give the passport to a colleague', ru: 'Отдать паспорт коллеге' },
              ],
              correct: [0],
            },
            {
              kind: 'MULTIPLE',
              prompt: {
                az: 'Əmək haqqı ödənilmirsə, kimə müraciət edə bilərsiniz? (bir neçə cavab)',
                de: 'An wen können Sie sich wenden, wenn der Lohn nicht gezahlt wird? (mehrere Antworten)',
                en: 'Who can you contact if your wage is not paid? (several answers)',
                ru: 'Куда можно обратиться, если не платят зарплату? (несколько ответов)',
              },
              options: [
                { az: 'Komandamıza (çat və ya telefon)', de: 'An unser Team (Chat oder Telefon)', en: 'Our team (chat or phone)', ru: 'В нашу команду (чат или телефон)' },
                { az: 'Faire Integration məsləhət mərkəzinə', de: 'An eine Beratungsstelle von Faire Integration', en: 'A Faire Integration advice centre', ru: 'В консультацию Faire Integration' },
                { az: 'Heç kimə — yoxsa vizanı itirərəm', de: 'An niemanden – sonst verliere ich das Visum', en: 'Nobody — otherwise I lose my visa', ru: 'Никуда — иначе потеряю визу' },
                { az: 'Əmək haqqından imtina sənədi imzalamaq', de: 'Einen Verzicht auf den Lohn unterschreiben', en: 'Sign a waiver of the wage', ru: 'Подписать отказ от зарплаты' },
              ],
              correct: [0, 1],
            },
            {
              prompt: {
                az: '116 117 nömrəsi nə üçündür?',
                de: 'Wofür ist die Nummer 116 117?',
                en: 'What is the number 116 117 for?',
                ru: 'Для чего номер 116 117?',
              },
              options: [
                { az: 'Həyati təhlükə olmayan hallarda növbətçi həkim xidməti', de: 'Ärztlicher Bereitschaftsdienst, wenn es nicht lebensbedrohlich ist', en: 'Medical on-call service when it is not life-threatening', ru: 'Дежурная врачебная служба, если нет угрозы жизни' },
                { az: 'Polis', de: 'Polizei', en: 'Police', ru: 'Полиция' },
                { az: 'Taksi', de: 'Taxi', en: 'Taxi', ru: 'Такси' },
              ],
              correct: [0],
            },
          ],
        },
      ],
    },
  ] satisfies Module[],
};

/** Creates the starter course (draft) once; returns whether it was created. */
export const createStarterCourse = async (db: PrismaClient, createdById?: string | null) => {
  const existing = await db.course.findUnique({ where: { slug: STARTER_SLUG } });
  if (existing) return { created: false, courseId: existing.id };
  const s = STARTER_COURSE;
  const course = await db.course.create({
    data: { slug: s.slug, title: s.title, description: s.description, disclaimer: s.disclaimer, autoEnrollStatuses: STARTER_AUTO_ENROLL, published: false, createdById: createdById ?? null },
  });
  for (const [mi, m] of s.modules.entries()) {
    const mod = await db.courseModule.create({ data: { courseId: course.id, title: m.title, description: m.description ?? undefined, sortOrder: mi } });
    for (const [li, l] of (m.lessons as Lesson[]).entries()) {
      const lesson = await db.courseLesson.create({
        data: { courseId: course.id, moduleId: mod.id, kind: l.kind, title: l.title, body: l.body ?? undefined, minutes: l.minutes ?? (l.kind === 'QUIZ' ? 5 : null), passMark: l.passMark ?? 70, sortOrder: li },
      });
      if (l.questions?.length) {
        await db.courseQuizQuestion.createMany({
          data: l.questions.map((q, qi) => ({ lessonId: lesson.id, kind: q.kind ?? 'SINGLE', prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation ?? undefined, sortOrder: qi })),
        });
      }
    }
  }
  return { created: true, courseId: course.id };
};
