import type { StarterItem } from './index.js';

/**
 * Starter set for the client waiting room (Admin → Waiting room → "Load starter content"). Practical,
 * checked basics for the first weeks in Germany; admins can edit or unpublish every item afterwards.
 * Amounts and deadlines are the legal rules as of 2026 (e.g. § 17 BMG, § 551 BGB, § 622 BGB).
 */

const WORKING = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER'] as const;

export const STARTER_ITEMS: StarterItem[] = [
  {
    kind: 'LESSON',
    topic: 'bureaucracy',
    minutes: 4,
    title: {
      az: 'Anmeldung: ünvan qeydiyyatı (14 gün)',
      de: 'Anmeldung: Wohnsitz anmelden (14 Tage)',
      en: 'Anmeldung: registering your address (14 days)',
      ru: 'Anmeldung: регистрация по месту жительства (14 дней)',
    },
    body: {
      az: `Almaniyada mənzilə köçdükdən sonra **14 gün ərzində** ünvanınızı Bürgeramt-da (vətəndaş xidməti ofisi) qeydiyyata salmalısınız.

**Lazım olanlar:**
- Pasport (viza ilə)
- Wohnungsgeberbestätigung — ev sahibinin imzaladığı köçmə təsdiqi
- Doldurulmuş Anmeldeformular (çox şəhərdə onlayn)

**Niyə vacibdir:** Meldebescheinigung (qeydiyyat arayışı) olmadan bank hesabı, vergi nömrəsi (Steuer-ID) və bir çox başqa işlər uzanır. Termini şəhərin saytında əvvəlcədən götürün — böyük şəhərlərdə növbə həftələrlə ola bilər.`,
      de: `Nach dem Einzug in eine Wohnung müssen Sie sich **innerhalb von 14 Tagen** beim Bürgeramt anmelden (§ 17 Bundesmeldegesetz).

**Mitbringen:**
- Reisepass (mit Visum)
- Wohnungsgeberbestätigung – vom Vermieter unterschrieben
- Ausgefülltes Anmeldeformular (in vielen Städten online)

**Warum wichtig:** Ohne Meldebescheinigung verzögern sich Bankkonto, Steuer-ID und vieles mehr. Buchen Sie den Termin früh auf der Website Ihrer Stadt – in Großstädten sind Termine oft Wochen im Voraus vergeben.`,
      en: `After moving into a flat you must register your address at the Bürgeramt (citizens' office) **within 14 days** (§ 17 Federal Registration Act).

**Bring:**
- Passport (with visa)
- Wohnungsgeberbestätigung – confirmation signed by your landlord
- Completed registration form (online in many cities)

**Why it matters:** Without the Meldebescheinigung (registration certificate) your bank account, tax ID and much more are delayed. Book the appointment early on your city's website – in big cities slots are often weeks away.`,
      ru: `После въезда в квартиру нужно **в течение 14 дней** зарегистрироваться в Bürgeramt (§ 17 Федерального закона о регистрации).

**Взять с собой:**
- Паспорт (с визой)
- Wohnungsgeberbestätigung — подтверждение, подписанное арендодателем
- Заполненную форму регистрации (во многих городах онлайн)

**Почему важно:** без Meldebescheinigung (справки о регистрации) задерживаются банковский счёт, налоговый номер и многое другое. Запишитесь заранее на сайте города — в больших городах очередь бывает на недели вперёд.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'bureaucracy',
    minutes: 4,
    title: {
      az: 'Tibbi sığorta: Krankenkasse necə seçilir',
      de: 'Krankenversicherung: die richtige Krankenkasse',
      en: 'Health insurance: choosing a Krankenkasse',
      ru: 'Медицинская страховка: как выбрать Krankenkasse',
    },
    body: {
      az: `Almaniyada tibbi sığorta **məcburidir**. İşçilər və təhsil alanlar adətən dövlət sığortasında (gesetzliche Krankenversicherung) olur.

- Krankenkasse-ni özünüz seçirsiniz (TK, AOK, Barmer, DAK və s.) — əsas xidmətlər hamısında eynidir.
- Haqq maaşdan avtomatik tutulur; təxminən yarısını işəgötürən ödəyir.
- Qeydiyyatdan sonra **elektron sığorta kartı (eGK)** poçtla gəlir — həkimə gedəndə onu göstərin.
- İşə başlamazdan əvvəl seçdiyiniz kassanın adını işəgötürənə bildirin.

Vizaya qədər lazım olan səyahət sığortası ilə dövlət sığortası eyni şey deyil — işə başladığınız gün dövlət sığortası başlayır.`,
      de: `In Deutschland ist eine Krankenversicherung **Pflicht**. Beschäftigte und Auszubildende sind in der Regel gesetzlich versichert.

- Sie wählen die Krankenkasse selbst (TK, AOK, Barmer, DAK …) – die Grundleistungen sind überall gleich.
- Der Beitrag wird automatisch vom Lohn abgezogen; etwa die Hälfte zahlt der Arbeitgeber.
- Nach der Anmeldung kommt die **elektronische Gesundheitskarte (eGK)** per Post – beim Arzt immer vorzeigen.
- Teilen Sie Ihrem Arbeitgeber vor Arbeitsbeginn mit, bei welcher Kasse Sie sind.

Die Reisekrankenversicherung für das Visum ersetzt die gesetzliche Versicherung nicht – diese beginnt mit dem ersten Arbeitstag.`,
      en: `Health insurance is **mandatory** in Germany. Employees and apprentices are usually covered by statutory health insurance.

- You choose the Krankenkasse yourself (TK, AOK, Barmer, DAK …) – the basic benefits are the same everywhere.
- The contribution is deducted from your salary automatically; your employer pays about half.
- After registering you receive the **electronic health card (eGK)** by post – always show it at the doctor's.
- Tell your employer which Krankenkasse you chose before you start work.

The travel insurance for the visa is not a replacement – statutory insurance starts on your first working day.`,
      ru: `Медицинская страховка в Германии **обязательна**. Работники и учащиеся Ausbildung обычно застрахованы в государственной кассе.

- Krankenkasse вы выбираете сами (TK, AOK, Barmer, DAK …) — базовые услуги везде одинаковы.
- Взнос автоматически удерживается из зарплаты; примерно половину платит работодатель.
- После оформления по почте придёт **электронная карта (eGK)** — показывайте её у врача.
- До начала работы сообщите работодателю, в какой кассе вы застрахованы.

Туристическая страховка для визы не заменяет государственную — та начинается с первого рабочего дня.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'bureaucracy',
    minutes: 3,
    title: {
      az: 'Vergi nömrəsi (Steuer-ID) və vergi sinfi',
      de: 'Steuer-ID und Steuerklasse',
      en: 'Tax ID (Steuer-ID) and tax class',
      ru: 'Налоговый номер (Steuer-ID) и налоговый класс',
    },
    body: {
      az: `**Steuer-ID** (11 rəqəmli vergi identifikasiya nömrəsi) Anmeldung-dan təxminən 2–4 həftə sonra Bundeszentralamt für Steuern-dən **poçtla** gəlir. Ömürlük eyni qalır.

- İşəgötürən maaşı düzgün hesablamaq üçün onu ilk maaş günündən əvvəl istəyir.
- Gecikirsə, işəgötürən müvəqqəti olaraq yüksək vergi sinfi (VI) tətbiq edə bilər — sonra fərq geri qaytarılır.
- Vergi sinifləri: subay — **I**, evli — adətən **IV/IV** və ya **III/V**.
- Hər il Steuererklärung (vergi bəyannaməsi) verməklə çox vaxt pul geri alırsınız.

Məktub itərsə, Steuer-ID-ni onlayn yenidən sifariş etmək olar.`,
      de: `Die **Steuer-ID** (11-stellige Identifikationsnummer) kommt etwa 2–4 Wochen nach der Anmeldung **per Post** vom Bundeszentralamt für Steuern. Sie bleibt ein Leben lang gleich.

- Der Arbeitgeber braucht sie vor der ersten Lohnabrechnung.
- Fehlt sie, darf er vorläufig Steuerklasse VI abrechnen – die Differenz bekommen Sie später zurück.
- Steuerklassen: ledig – **I**, verheiratet – meist **IV/IV** oder **III/V**.
- Mit der jährlichen Steuererklärung bekommen viele Geld zurück.

Ist der Brief verloren, kann die Steuer-ID online neu angefordert werden.`,
      en: `The **Steuer-ID** (11-digit tax identification number) arrives **by post** from the Federal Central Tax Office about 2–4 weeks after your Anmeldung. It stays the same for life.

- Your employer needs it before the first payroll.
- If it is missing, the employer may use tax class VI for now – you get the difference back later.
- Tax classes: single – **I**, married – usually **IV/IV** or **III/V**.
- Many people get money back with the yearly tax return (Steuererklärung).

If the letter is lost, you can request the Steuer-ID again online.`,
      ru: `**Steuer-ID** (11-значный налоговый идентификатор) приходит **по почте** из Федерального налогового ведомства примерно через 2–4 недели после Anmeldung. Он не меняется всю жизнь.

- Работодателю он нужен до первого начисления зарплаты.
- Если его нет, работодатель временно может применить налоговый класс VI — разницу потом вернут.
- Налоговые классы: не в браке — **I**, в браке — обычно **IV/IV** или **III/V**.
- Подав ежегодную налоговую декларацию, многие получают деньги обратно.

Если письмо потерялось, Steuer-ID можно заказать повторно онлайн.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'life',
    minutes: 3,
    title: {
      az: 'Bank hesabı (Girokonto) açmaq',
      de: 'Ein Girokonto eröffnen',
      en: 'Opening a bank account (Girokonto)',
      ru: 'Открытие банковского счёта (Girokonto)',
    },
    body: {
      az: `Maaş, kirayə və sığorta üçün alman **IBAN**-lı hesab lazımdır.

- **Onlayn banklar** (N26, ING, DKB, Commerzbank və s.) — video-identifikasiya ilə bir neçə günə açılır.
- **Filial bankları** (Sparkasse, Volksbank) — şəxsən görüş, bəzən aylıq haqq.
- Adətən lazımdır: pasport, viza/yaşayış icazəsi, Meldebescheinigung, bəzən Steuer-ID.
- Hər kəsin əsas hesab (**Basiskonto**) hüququ var — bank imtina etməməlidir.

İpucu: ilk maaşdan əvvəl hesabı açın və IBAN-ı işəgötürənə göndərin.`,
      de: `Für Lohn, Miete und Versicherungen brauchen Sie ein Konto mit deutscher **IBAN**.

- **Direktbanken** (N26, ING, DKB, Commerzbank …) – Eröffnung per Video-Ident in wenigen Tagen.
- **Filialbanken** (Sparkasse, Volksbank) – Termin vor Ort, teils mit Kontoführungsgebühr.
- Meist nötig: Reisepass, Visum/Aufenthaltstitel, Meldebescheinigung, manchmal Steuer-ID.
- Jeder hat Anspruch auf ein **Basiskonto** – die Bank darf es nicht grundlos verweigern.

Tipp: Eröffnen Sie das Konto vor dem ersten Gehalt und schicken Sie die IBAN an Ihren Arbeitgeber.`,
      en: `You need an account with a German **IBAN** for salary, rent and insurance.

- **Online banks** (N26, ING, DKB, Commerzbank …) – opened by video identification within a few days.
- **Branch banks** (Sparkasse, Volksbank) – appointment in person, sometimes a monthly fee.
- Usually needed: passport, visa/residence permit, Meldebescheinigung, sometimes the tax ID.
- Everyone is entitled to a **Basiskonto** (basic account) – a bank may not refuse without reason.

Tip: open the account before your first salary and send the IBAN to your employer.`,
      ru: `Для зарплаты, аренды и страховки нужен счёт с немецким **IBAN**.

- **Онлайн-банки** (N26, ING, DKB, Commerzbank …) — открытие по видеоидентификации за несколько дней.
- **Банки с отделениями** (Sparkasse, Volksbank) — личный визит, иногда ежемесячная плата.
- Обычно нужны: паспорт, виза/вид на жительство, Meldebescheinigung, иногда Steuer-ID.
- Каждый имеет право на **Basiskonto** (базовый счёт) — банк не может отказать без причины.

Совет: откройте счёт до первой зарплаты и отправьте IBAN работодателю.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'life',
    minutes: 5,
    title: {
      az: 'Mənzil kirayəsi: Kaltmiete, Warmmiete və Kaution',
      de: 'Wohnung mieten: Kaltmiete, Warmmiete und Kaution',
      en: 'Renting a flat: Kaltmiete, Warmmiete and deposit',
      ru: 'Аренда жилья: Kaltmiete, Warmmiete и залог',
    },
    body: {
      az: `**Kaltmiete** — yalnız mənzilin kirayəsi. **Warmmiete** — kirayə + kommunal xərclər (Nebenkosten: istilik, su, zibil). Elanlarda hansının yazıldığına baxın.

- **Kaution (depozit)** qanunla ən çox **3 aylıq Kaltmiete** ola bilər və 3 hissədə ödənilə bilər (§ 551 BGB).
- Müqaviləni imzalamazdan əvvəl oxuyun; mənzili təhvil alanda vəziyyəti fotolarla qeyd edin (Übergabeprotokoll).
- Ev sahibi tez-tez **SCHUFA** (kredit tarixçəsi), maaş arayışı və pasport istəyir.
- Anmeldung üçün ev sahibindən **Wohnungsgeberbestätigung** alın.

Diqqət: mənzil görmədən pul köçürməyi tələb edən elanlar adətən fırıldaqdır.`,
      de: `**Kaltmiete** – nur die Miete für die Wohnung. **Warmmiete** – Miete plus Nebenkosten (Heizung, Wasser, Müll). Achten Sie darauf, was in der Anzeige steht.

- Die **Kaution** darf höchstens **drei Monatskaltmieten** betragen und in drei Raten gezahlt werden (§ 551 BGB).
- Lesen Sie den Vertrag vor der Unterschrift; dokumentieren Sie bei der Übergabe den Zustand mit Fotos (Übergabeprotokoll).
- Vermieter verlangen oft **SCHUFA**-Auskunft, Gehaltsnachweise und Ausweis.
- Für die Anmeldung brauchen Sie die **Wohnungsgeberbestätigung** des Vermieters.

Vorsicht: Anzeigen, die Geld vor einer Besichtigung verlangen, sind meist Betrug.`,
      en: `**Kaltmiete** – rent for the flat only. **Warmmiete** – rent plus service charges (Nebenkosten: heating, water, rubbish). Check which one an advert shows.

- By law the **deposit (Kaution)** is at most **three months' Kaltmiete** and may be paid in three instalments (§ 551 BGB).
- Read the contract before signing; record the condition with photos at handover (Übergabeprotokoll).
- Landlords often ask for a **SCHUFA** credit report, payslips and ID.
- For your Anmeldung you need the landlord's **Wohnungsgeberbestätigung**.

Careful: adverts that ask for money before a viewing are usually scams.`,
      ru: `**Kaltmiete** — только плата за квартиру. **Warmmiete** — аренда плюс коммунальные расходы (Nebenkosten: отопление, вода, мусор). Смотрите, что указано в объявлении.

- **Залог (Kaution)** по закону не больше **трёх месячных Kaltmiete** и может вноситься тремя частями (§ 551 BGB).
- Читайте договор до подписания; при приёмке зафиксируйте состояние фотографиями (Übergabeprotokoll).
- Арендодатели часто просят справку **SCHUFA**, подтверждение дохода и паспорт.
- Для Anmeldung нужна **Wohnungsgeberbestätigung** от арендодателя.

Осторожно: объявления, где просят деньги до просмотра, обычно мошенничество.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'life',
    minutes: 2,
    title: {
      az: 'Deutschlandticket: bütün ölkədə bir bilet',
      de: 'Deutschlandticket: ein Ticket für ganz Deutschland',
      en: 'Deutschlandticket: one ticket for all of Germany',
      ru: 'Deutschlandticket: один билет на всю Германию',
    },
    body: {
      az: `**Deutschlandticket** ilə bütün Almaniyada şəhər nəqliyyatı (avtobus, tramvay, U-Bahn, S-Bahn) və regional qatarlar (RE, RB) istifadə olunur.

- Aylıq abunədir, qiyməti hər il müəyyən edilir (təxminən 60 €); istənilən ayın sonuna qədər ləğv edilə bilər.
- ICE/IC kimi sürətli qatarlar daxil deyil.
- Bir çox işəgötürən onu **Jobticket** kimi endirimlə verir — soruşun.
- Tətbiqdə (DB Navigator və ya yerli nəqliyyat şirkəti) alınır.`,
      de: `Mit dem **Deutschlandticket** fahren Sie bundesweit im Nahverkehr (Bus, Tram, U-Bahn, S-Bahn) und in Regionalzügen (RE, RB).

- Monatsabo, der Preis wird jährlich festgelegt (rund 60 €); monatlich kündbar.
- Fernzüge wie ICE/IC sind nicht enthalten.
- Viele Arbeitgeber bieten es vergünstigt als **Jobticket** an – fragen Sie nach.
- Erhältlich in Apps (DB Navigator oder der örtliche Verkehrsverbund).`,
      en: `With the **Deutschlandticket** you can use local transport (bus, tram, U-Bahn, S-Bahn) and regional trains (RE, RB) all over Germany.

- Monthly subscription; the price is set every year (around €60); cancellable monthly.
- Long-distance trains such as ICE/IC are not included.
- Many employers offer it at a discount as a **Jobticket** – ask.
- Available in apps (DB Navigator or your local transport company).`,
      ru: `С **Deutschlandticket** можно ездить по всей Германии на городском транспорте (автобус, трамвай, U-Bahn, S-Bahn) и региональных поездах (RE, RB).

- Ежемесячная подписка, цена устанавливается каждый год (около 60 €); отменяется помесячно.
- Скоростные поезда ICE/IC не включены.
- Многие работодатели дают его со скидкой как **Jobticket** — спросите.
- Покупается в приложениях (DB Navigator или местный транспортный оператор).`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'work',
    minutes: 4,
    visaTypes: [...WORKING],
    title: {
      az: 'Alman iş mədəniyyəti: 6 qayda',
      de: 'Arbeitskultur in Deutschland: 6 Regeln',
      en: 'German work culture: 6 rules',
      ru: 'Рабочая культура в Германии: 6 правил',
    },
    body: {
      az: `1. **Dəqiqlik** — 5 dəqiqə gecikmək də fərq edilir. Gecikirsinizsə, əvvəlcədən zəng edin.
2. **"Sie" ilə başlayın** — müdir və həmkarlar "du" təklif edənə qədər "Sie" deyin.
3. **Yazılı razılaşmalar** — vacib şeyləri e-poçtla təsdiqləyin.
4. **Birbaşa ünsiyyət** — açıq tənqid şəxsi deyil, işlə bağlıdır.
5. **Feierabend** — iş vaxtından sonra və məzuniyyətdə (ildə ən azı 20 iş günü) adətən iş zəngi edilmir.
6. **Xəstə olanda** — işə başlamazdan əvvəl xəbər verin və həkim arayışı (AU) gətirin; neçənci gündən lazım olduğunu müqavilədə yoxlayın.`,
      de: `1. **Pünktlichkeit** – auch 5 Minuten fallen auf. Wenn Sie sich verspäten, rufen Sie vorher an.
2. **Mit „Sie“ beginnen** – bis Chef oder Kollegen das „Du“ anbieten.
3. **Schriftlich festhalten** – Wichtiges per E-Mail bestätigen.
4. **Direkte Kommunikation** – offene Kritik ist sachlich gemeint, nicht persönlich.
5. **Feierabend** – nach Dienstschluss und im Urlaub (mindestens 20 Arbeitstage im Jahr) wird meist nicht angerufen.
6. **Bei Krankheit** – vor Arbeitsbeginn Bescheid geben und die Arbeitsunfähigkeitsbescheinigung (AU) bringen; ab welchem Tag, steht im Vertrag.`,
      en: `1. **Punctuality** – even 5 minutes late is noticed. If you are running late, call ahead.
2. **Start with "Sie"** – until your boss or colleagues offer the informal "du".
3. **Put it in writing** – confirm important things by email.
4. **Direct communication** – open criticism is about the work, not about you.
5. **Feierabend** – after hours and on holiday (at least 20 working days a year) people usually don't call.
6. **When you are ill** – report it before your shift starts and bring a doctor's sick note (AU); your contract says from which day.`,
      ru: `1. **Пунктуальность** — даже 5 минут опоздания заметны. Если опаздываете, позвоните заранее.
2. **Начинайте с «Sie»** — пока начальник или коллеги не предложат перейти на «du».
3. **Фиксируйте письменно** — важное подтверждайте по e-mail.
4. **Прямое общение** — открытая критика касается работы, а не вас лично.
5. **Feierabend** — после работы и в отпуске (не менее 20 рабочих дней в году) обычно не звонят.
6. **При болезни** — сообщите до начала смены и принесите больничный (AU); с какого дня он нужен, указано в договоре.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'work',
    minutes: 3,
    visaTypes: [...WORKING],
    title: {
      az: 'Probezeit: sınaq müddəti necə işləyir',
      de: 'Probezeit: so funktioniert sie',
      en: 'Probezeit: how the probation period works',
      ru: 'Probezeit: как работает испытательный срок',
    },
    body: {
      az: `- Sınaq müddəti ən çox **6 ay** ola bilər; dəqiq müddət müqavilədə yazılır.
- Bu müddətdə hər iki tərəf müqaviləni **2 həftəlik** xəbərdarlıqla ləğv edə bilər (§ 622 BGB). Ausbildung-da sınaq müddəti 1–4 aydır və xəbərdarlıqsız ləğv mümkündür.
- Maaş, məzuniyyət və sığorta sınaq müddətində də tam qüvvədədir.
- Sual verin, qeydlər aparın, həftəlik qısa rəy istəyin — bu, maraq kimi qiymətləndirilir.

Viza işə bağlıdırsa və müqavilə ləğv olunursa, dərhal Ausländerbehörde ilə və bizimlə əlaqə saxlayın.`,
      de: `- Die Probezeit dauert höchstens **6 Monate**; die genaue Dauer steht im Vertrag.
- In dieser Zeit können beide Seiten mit **zwei Wochen** Frist kündigen (§ 622 BGB). In der Ausbildung dauert sie 1–4 Monate, Kündigung ohne Frist ist möglich.
- Lohn, Urlaub und Versicherung gelten in der Probezeit voll.
- Fragen stellen, Notizen machen, um kurzes Feedback bitten – das wird als Engagement gesehen.

Ist Ihr Aufenthaltstitel an die Stelle gebunden und wird gekündigt, melden Sie sich sofort bei der Ausländerbehörde und bei uns.`,
      en: `- The probation period lasts at most **6 months**; the exact length is in your contract.
- During it either side may terminate with **two weeks'** notice (§ 622 BGB). In an Ausbildung it is 1–4 months and termination without notice is possible.
- Salary, holiday and insurance apply in full during probation.
- Ask questions, take notes, ask for short feedback – it is seen as commitment.

If your residence permit is tied to the job and you are dismissed, contact the immigration office (Ausländerbehörde) and us right away.`,
      ru: `- Испытательный срок — не более **6 месяцев**; точная длительность указана в договоре.
- В этот период любая сторона может расторгнуть договор с уведомлением за **две недели** (§ 622 BGB). В Ausbildung он длится 1–4 месяца, расторжение возможно без срока.
- Зарплата, отпуск и страховка действуют в полном объёме.
- Задавайте вопросы, ведите записи, просите короткую обратную связь — это ценят.

Если вид на жительство привязан к работе и вас уволили, сразу свяжитесь с Ausländerbehörde и с нами.`,
    },
  },
  {
    kind: 'CHECKLIST',
    topic: 'life',
    minutes: 2,
    title: {
      az: 'Təcili nömrələr — telefona yazın',
      de: 'Notrufnummern – im Handy speichern',
      en: 'Emergency numbers – save them in your phone',
      ru: 'Экстренные номера — сохраните в телефоне',
    },
    body: {
      az: `- [ ] **112** — təcili yardım və yanğınsöndürmə (pulsuz, bütün AB-də)
- [ ] **110** — polis
- [ ] **116 117** — növbətçi həkim (gecə və həftəsonu, təcili olmayan hallar)
- [ ] **0800 111 0 111** — psixoloji dəstək xətti (pulsuz, 24/7)
- [ ] Ən yaxın xəstəxananın və aptekin ünvanı
- [ ] Ölkənizin Almaniyadakı səfirliyinin nömrəsi`,
      de: `- [ ] **112** – Rettungsdienst und Feuerwehr (kostenlos, in der ganzen EU)
- [ ] **110** – Polizei
- [ ] **116 117** – ärztlicher Bereitschaftsdienst (nachts und am Wochenende, keine Notfälle)
- [ ] **0800 111 0 111** – Telefonseelsorge (kostenlos, rund um die Uhr)
- [ ] Adresse des nächsten Krankenhauses und der nächsten Apotheke
- [ ] Nummer der Botschaft Ihres Landes in Deutschland`,
      en: `- [ ] **112** – ambulance and fire brigade (free, all over the EU)
- [ ] **110** – police
- [ ] **116 117** – on-call doctor (nights and weekends, non-emergencies)
- [ ] **0800 111 0 111** – crisis helpline (free, 24/7)
- [ ] Address of the nearest hospital and pharmacy
- [ ] Number of your country's embassy in Germany`,
      ru: `- [ ] **112** — скорая помощь и пожарные (бесплатно, по всему ЕС)
- [ ] **110** — полиция
- [ ] **116 117** — дежурный врач (ночью и в выходные, не экстренные случаи)
- [ ] **0800 111 0 111** — телефон доверия (бесплатно, круглосуточно)
- [ ] Адрес ближайшей больницы и аптеки
- [ ] Номер посольства вашей страны в Германии`,
    },
  },
  {
    kind: 'CHECKLIST',
    topic: 'bureaucracy',
    minutes: 3,
    title: {
      az: 'İlk iki həftə: nə, hansı ardıcıllıqla',
      de: 'Die ersten zwei Wochen: was in welcher Reihenfolge',
      en: 'The first two weeks: what to do in which order',
      ru: 'Первые две недели: что и в каком порядке',
    },
    body: {
      az: `- [ ] Alman SIM kartı alın (çox yerdə pasportla onlayn aktivləşdirmə)
- [ ] Anmeldung üçün termin götürün və Wohnungsgeberbestätigung alın
- [ ] Bürgeramt-da Anmeldung edin → Meldebescheinigung
- [ ] Bank hesabı açın və IBAN-ı işəgötürənə göndərin
- [ ] Krankenkasse seçin və işəgötürənə bildirin
- [ ] Steuer-ID məktubunu gözləyin və işəgötürənə verin
- [ ] Rundfunkbeitrag (radio-TV rüsumu) qeydiyyatı — hər mənzil üçün bir dəfə
- [ ] Lazım olarsa, Ausländerbehörde-də yaşayış icazəsi üçün termin`,
      de: `- [ ] Deutsche SIM-Karte besorgen (meist Online-Aktivierung mit Reisepass)
- [ ] Termin für die Anmeldung buchen, Wohnungsgeberbestätigung holen
- [ ] Anmeldung im Bürgeramt → Meldebescheinigung
- [ ] Girokonto eröffnen und IBAN an den Arbeitgeber schicken
- [ ] Krankenkasse wählen und dem Arbeitgeber mitteilen
- [ ] Auf den Brief mit der Steuer-ID warten und weitergeben
- [ ] Rundfunkbeitrag anmelden – einmal pro Wohnung
- [ ] Falls nötig: Termin bei der Ausländerbehörde für den Aufenthaltstitel`,
      en: `- [ ] Get a German SIM card (usually activated online with your passport)
- [ ] Book the Anmeldung appointment, get the Wohnungsgeberbestätigung
- [ ] Anmeldung at the Bürgeramt → Meldebescheinigung
- [ ] Open a bank account and send the IBAN to your employer
- [ ] Choose a Krankenkasse and tell your employer
- [ ] Wait for the tax ID letter and pass it on
- [ ] Register for the Rundfunkbeitrag (broadcasting fee) – once per flat
- [ ] If needed: appointment at the Ausländerbehörde for your residence permit`,
      ru: `- [ ] Купить немецкую SIM-карту (обычно онлайн-активация по паспорту)
- [ ] Записаться на Anmeldung, получить Wohnungsgeberbestätigung
- [ ] Anmeldung в Bürgeramt → Meldebescheinigung
- [ ] Открыть счёт и отправить IBAN работодателю
- [ ] Выбрать Krankenkasse и сообщить работодателю
- [ ] Дождаться письма со Steuer-ID и передать его
- [ ] Зарегистрироваться для Rundfunkbeitrag (сбор за радио и ТВ) — один раз на квартиру
- [ ] При необходимости: запись в Ausländerbehörde для вида на жительство`,
    },
  },
  {
    kind: 'CHECKLIST',
    topic: 'bureaucracy',
    minutes: 3,
    stages: ['APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'],
    title: {
      az: 'Yol çantası: özünüzlə götürüləcək sənədlər',
      de: 'Reisemappe: diese Unterlagen gehören ins Handgepäck',
      en: 'Travel folder: documents for your hand luggage',
      ru: 'Папка в дорогу: документы в ручную кладь',
    },
    body: {
      az: `- [ ] Pasport (vizalı) və bir surəti
- [ ] Diplom, attestat və transkriptlərin **orijinalları**
- [ ] Tanınma qərarı (Anerkennung / Defizitbescheid), varsa
- [ ] İş və ya Ausbildung müqaviləsi
- [ ] Almanca tərcümələr (apostil/leqalizasiya ilə)
- [ ] Doğum və nikah şəkadətnamələri (ailəniz də gəlirsə)
- [ ] İlk günlər üçün səyahət tibbi sığortası
- [ ] İlk ay üçün kifayət qədər vəsait (kart + bir az nağd avro)
- [ ] Hamısının skanı telefonda və buludda`,
      de: `- [ ] Reisepass (mit Visum) und eine Kopie
- [ ] **Originale** von Diplomen, Zeugnissen und Fächerübersichten
- [ ] Anerkennungsbescheid / Defizitbescheid, falls vorhanden
- [ ] Arbeits- oder Ausbildungsvertrag
- [ ] Deutsche Übersetzungen (mit Apostille/Legalisation)
- [ ] Geburts- und Heiratsurkunde (wenn die Familie mitkommt)
- [ ] Reisekrankenversicherung für die ersten Tage
- [ ] Genug Geld für den ersten Monat (Karte + etwas Bargeld in Euro)
- [ ] Scans von allem im Handy und in der Cloud`,
      en: `- [ ] Passport (with visa) and a copy
- [ ] **Originals** of diplomas, certificates and transcripts
- [ ] Recognition notice (Anerkennungsbescheid / Defizitbescheid), if any
- [ ] Employment or Ausbildung contract
- [ ] German translations (with apostille/legalisation)
- [ ] Birth and marriage certificates (if your family comes along)
- [ ] Travel health insurance for the first days
- [ ] Enough money for the first month (card + some cash in euros)
- [ ] Scans of everything on your phone and in the cloud`,
      ru: `- [ ] Паспорт (с визой) и копия
- [ ] **Оригиналы** дипломов, аттестатов и приложений с оценками
- [ ] Решение о признании (Anerkennungsbescheid / Defizitbescheid), если есть
- [ ] Трудовой договор или договор Ausbildung
- [ ] Переводы на немецкий (с апостилем/легализацией)
- [ ] Свидетельства о рождении и браке (если едет семья)
- [ ] Туристическая медстраховка на первые дни
- [ ] Деньги на первый месяц (карта + немного наличных евро)
- [ ] Сканы всего в телефоне и в облаке`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'culture',
    minutes: 3,
    title: {
      az: 'Gündəlik həyat: zibilin çeşidlənməsi, Pfand və bazar günü sükutu',
      de: 'Alltag: Mülltrennung, Pfand und Sonntagsruhe',
      en: 'Everyday life: recycling, bottle deposit and quiet Sundays',
      ru: 'Быт: сортировка мусора, Pfand и воскресная тишина',
    },
    body: {
      az: `- **Zibil çeşidlənir:** sarı qab/kisə — plastik və metal qablaşdırma; mavi — kağız; qəhvəyi — qida tullantısı; boz/qara — qalan hər şey; şüşə rənginə görə konteynerlərə.
- **Pfand:** butulka və qutuların çoxunda 8–25 sent depozit var. Mağazadakı avtomata qaytarın, çeki kassada pula çevirin.
- **Bazar günü və bayramlar:** mağazalar bağlıdır (vağzal və yanacaq doldurma məntəqələri istisna). Səs-küylü işlər (qazma, paltaryuyan maşın) etiket deyil.
- **Gecə sükutu:** adətən 22:00–06:00 arası.`,
      de: `- **Mülltrennung:** Gelbe Tonne/Sack – Verpackungen aus Plastik und Metall; Blau – Papier; Braun – Bioabfall; Grau/Schwarz – Restmüll; Glas nach Farben in die Container.
- **Pfand:** Auf vielen Flaschen und Dosen sind 8–25 Cent Pfand. Im Supermarkt am Automaten zurückgeben, den Bon an der Kasse einlösen.
- **Sonn- und Feiertage:** Geschäfte sind geschlossen (außer Bahnhöfen und Tankstellen). Laute Arbeiten (Bohren, Waschmaschine) gelten als unhöflich.
- **Nachtruhe:** meist von 22 bis 6 Uhr.`,
      en: `- **Recycling:** yellow bin/bag – plastic and metal packaging; blue – paper; brown – food waste; grey/black – everything else; glass into containers by colour.
- **Pfand:** many bottles and cans carry a deposit of 8–25 cents. Return them at the machine in the supermarket and cash the receipt at the till.
- **Sundays and public holidays:** shops are closed (except at stations and petrol stations). Noisy jobs (drilling, washing machine) are considered rude.
- **Quiet hours at night:** usually 10 pm to 6 am.`,
      ru: `- **Сортировка мусора:** жёлтый бак/мешок — пластиковая и металлическая упаковка; синий — бумага; коричневый — пищевые отходы; серый/чёрный — остальное; стекло — по цветам в контейнеры.
- **Pfand:** на многих бутылках и банках залог 8–25 центов. Сдайте их в автомат в супермаркете, чек обменяйте на кассе.
- **Воскресенья и праздники:** магазины закрыты (кроме вокзалов и заправок). Шумные дела (дрель, стиральная машина) считаются невежливыми.
- **Ночная тишина:** обычно с 22:00 до 6:00.`,
    },
  },
  {
    kind: 'LESSON',
    topic: 'language',
    minutes: 3,
    title: {
      az: 'Pulsuz alman dili resursları',
      de: 'Kostenlos Deutsch lernen: gute Quellen',
      en: 'Learning German for free: good resources',
      ru: 'Бесплатные ресурсы для изучения немецкого',
    },
    body: {
      az: `Gözləmə vaxtı dili gücləndirmək üçün ən yaxşı fürsətdir. Gündə **20 dəqiqə** ayda 10 saat edir.

- **DW Learn German** (Deutsche Welle) — A1-dən B1-ə qədər pulsuz kurs və "Nicos Weg" video seriyası: [learngerman.dw.com](https://learngerman.dw.com)
- **Goethe-Institut** — pulsuz məşqlər və imtahan nümunələri: [goethe.de](https://www.goethe.de)
- **VHS-Lernportal** — pulsuz onlayn kurslar: [vhs-lernportal.de](https://www.vhs-lernportal.de)
- Hər gün eyni vaxtda öyrənin; yeni sözləri telefonda kartlarla təkrarlayın.

Portaldakı alman dili planınızı da yeniləyin.`,
      de: `Die Wartezeit ist die beste Gelegenheit, Deutsch zu verbessern. **20 Minuten am Tag** sind 10 Stunden im Monat.

- **DW Learn German** (Deutsche Welle) – kostenlose Kurse von A1 bis B1 und die Videoserie „Nicos Weg“: [learngerman.dw.com](https://learngerman.dw.com)
- **Goethe-Institut** – kostenlose Übungen und Modellprüfungen: [goethe.de](https://www.goethe.de)
- **VHS-Lernportal** – kostenlose Online-Kurse: [vhs-lernportal.de](https://www.vhs-lernportal.de)
- Jeden Tag zur gleichen Zeit lernen; neue Wörter mit Karteikarten auf dem Handy wiederholen.

Aktualisieren Sie auch Ihren Deutschplan im Portal.`,
      en: `Waiting time is the best chance to improve your German. **20 minutes a day** add up to 10 hours a month.

- **DW Learn German** (Deutsche Welle) – free courses from A1 to B1 and the video series "Nicos Weg": [learngerman.dw.com](https://learngerman.dw.com)
- **Goethe-Institut** – free exercises and model exams: [goethe.de](https://www.goethe.de)
- **VHS-Lernportal** – free online courses: [vhs-lernportal.de](https://www.vhs-lernportal.de)
- Study at the same time every day; review new words with flashcards on your phone.

Keep your German plan in the portal up to date as well.`,
      ru: `Время ожидания — лучший шанс подтянуть немецкий. **20 минут в день** — это 10 часов в месяц.

- **DW Learn German** (Deutsche Welle) — бесплатные курсы от A1 до B1 и видеосериал «Nicos Weg»: [learngerman.dw.com](https://learngerman.dw.com)
- **Goethe-Institut** — бесплатные упражнения и образцы экзаменов: [goethe.de](https://www.goethe.de)
- **VHS-Lernportal** — бесплатные онлайн-курсы: [vhs-lernportal.de](https://www.vhs-lernportal.de)
- Занимайтесь каждый день в одно время; повторяйте новые слова по карточкам в телефоне.

Обновите и свой план изучения немецкого в портале.`,
    },
  },
  {
    kind: 'EXERCISE',
    topic: 'language',
    minutes: 3,
    title: { az: 'A1: salamlaşma və tanışlıq', de: 'A1: Begrüßen und sich vorstellen', en: 'A1: greetings and introductions', ru: 'A1: приветствие и знакомство' },
    body: {
      az: 'Gündəlik ən çox lazım olan ifadələr. Düzgün variantı seçin.',
      de: 'Die Sätze, die Sie jeden Tag brauchen. Wählen Sie die richtige Antwort.',
      en: 'The phrases you need every day. Choose the right answer.',
      ru: 'Фразы, которые нужны каждый день. Выберите правильный ответ.',
    },
    exercise: [
      {
        q: { az: 'Səhər işə gəldiniz. Nə deyirsiniz?', de: 'Sie kommen morgens zur Arbeit. Was sagen Sie?', en: 'You arrive at work in the morning. What do you say?', ru: 'Вы утром пришли на работу. Что вы скажете?' },
        options: [
          { az: 'Guten Morgen!', de: 'Guten Morgen!', en: 'Guten Morgen!', ru: 'Guten Morgen!' },
          { az: 'Gute Nacht!', de: 'Gute Nacht!', en: 'Gute Nacht!', ru: 'Gute Nacht!' },
          { az: 'Auf Wiedersehen!', de: 'Auf Wiedersehen!', en: 'Auf Wiedersehen!', ru: 'Auf Wiedersehen!' },
        ],
        answer: 0,
      },
      {
        q: { az: '"Wie heißen Sie?" sualına cavab:', de: 'Antwort auf „Wie heißen Sie?“:', en: 'Answer to "Wie heißen Sie?":', ru: 'Ответ на «Wie heißen Sie?»:' },
        options: [
          { az: 'Ich bin 30 Jahre alt.', de: 'Ich bin 30 Jahre alt.', en: 'Ich bin 30 Jahre alt.', ru: 'Ich bin 30 Jahre alt.' },
          { az: 'Ich heiße Aylin Məmmədova.', de: 'Ich heiße Aylin Mammadova.', en: 'Ich heiße Aylin Mammadova.', ru: 'Ich heiße Aylin Mammadova.' },
          { az: 'Ich komme aus Baku.', de: 'Ich komme aus Baku.', en: 'Ich komme aus Baku.', ru: 'Ich komme aus Baku.' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Müdirinizə necə müraciət edirsiniz?', de: 'Wie sprechen Sie Ihre Chefin an?', en: 'How do you address your (female) boss?', ru: 'Как вы обратитесь к начальнице?' },
        options: [
          { az: 'Hallo Anna, wie geht’s dir?', de: 'Hallo Anna, wie geht’s dir?', en: 'Hallo Anna, wie geht’s dir?', ru: 'Hallo Anna, wie geht’s dir?' },
          { az: 'Guten Tag, Frau Weber. Wie geht es Ihnen?', de: 'Guten Tag, Frau Weber. Wie geht es Ihnen?', en: 'Guten Tag, Frau Weber. Wie geht es Ihnen?', ru: 'Guten Tag, Frau Weber. Wie geht es Ihnen?' },
          { az: 'Hey, Chefin!', de: 'Hey, Chefin!', en: 'Hey, Chefin!', ru: 'Hey, Chefin!' },
        ],
        answer: 1,
      },
      {
        q: { az: '"Danke!" deyəndə adətən nə cavab verilir?', de: 'Was antwortet man meistens auf „Danke!“?', en: 'What do people usually reply to "Danke!"?', ru: 'Что обычно отвечают на «Danke!»?' },
        options: [
          { az: 'Bitte!', de: 'Bitte!', en: 'Bitte!', ru: 'Bitte!' },
          { az: 'Entschuldigung!', de: 'Entschuldigung!', en: 'Entschuldigung!', ru: 'Entschuldigung!' },
          { az: 'Tschüss!', de: 'Tschüss!', en: 'Tschüss!', ru: 'Tschüss!' },
        ],
        answer: 0,
      },
    ],
  },
  {
    kind: 'EXERCISE',
    topic: 'language',
    minutes: 3,
    title: { az: 'A1: idarədə və həkimdə', de: 'A1: Im Amt und beim Arzt', en: 'A1: at the office and at the doctor’s', ru: 'A1: в ведомстве и у врача' },
    body: {
      az: 'Bürgeramt və həkim qəbulunda eşidəcəyiniz sözlər.',
      de: 'Wörter, die Sie im Bürgeramt und in der Arztpraxis hören.',
      en: 'Words you will hear at the Bürgeramt and at the doctor’s.',
      ru: 'Слова, которые вы услышите в Bürgeramt и у врача.',
    },
    exercise: [
      {
        q: { az: '"der Termin" nə deməkdir?', de: 'Was bedeutet „der Termin“?', en: 'What does "der Termin" mean?', ru: 'Что значит «der Termin»?' },
        options: [
          { az: 'görüş vaxtı / qəbul', de: 'eine feste Verabredung / ein Zeitpunkt', en: 'appointment', ru: 'запись / назначенное время' },
          { az: 'blank / forma', de: 'ein Formular', en: 'form', ru: 'бланк' },
          { az: 'imza', de: 'eine Unterschrift', en: 'signature', ru: 'подпись' },
        ],
        answer: 0,
      },
      {
        q: { az: '"Unterschreiben Sie bitte hier." — sizdən nə istəyirlər?', de: '„Unterschreiben Sie bitte hier.“ – Was sollen Sie tun?', en: '"Unterschreiben Sie bitte hier." – What should you do?', ru: '«Unterschreiben Sie bitte hier.» — что от вас хотят?' },
        options: [
          { az: 'Gözləmək', de: 'Warten', en: 'Wait', ru: 'Подождать' },
          { az: 'Burada imza atmaq', de: 'Hier unterschreiben', en: 'Sign here', ru: 'Расписаться здесь' },
          { az: 'Pul ödəmək', de: 'Bezahlen', en: 'Pay', ru: 'Заплатить' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Həkimə "başım ağrıyır" necə deyilir?', de: 'Wie sagen Sie beim Arzt, dass Ihr Kopf wehtut?', en: 'How do you tell the doctor you have a headache?', ru: 'Как сказать врачу, что болит голова?' },
        options: [
          { az: 'Ich habe Kopfschmerzen.', de: 'Ich habe Kopfschmerzen.', en: 'Ich habe Kopfschmerzen.', ru: 'Ich habe Kopfschmerzen.' },
          { az: 'Ich habe Hunger.', de: 'Ich habe Hunger.', en: 'Ich habe Hunger.', ru: 'Ich habe Hunger.' },
          { az: 'Ich habe Zeit.', de: 'Ich habe Zeit.', en: 'Ich habe Zeit.', ru: 'Ich habe Zeit.' },
        ],
        answer: 0,
      },
      {
        q: { az: '"die Krankmeldung" nədir?', de: 'Was ist „die Krankmeldung“?', en: 'What is "die Krankmeldung"?', ru: 'Что такое «die Krankmeldung»?' },
        options: [
          { az: 'Aptek çeki', de: 'Ein Kassenbon aus der Apotheke', en: 'A pharmacy receipt', ru: 'Чек из аптеки' },
          { az: 'İşəgötürənə xəstə olduğunuzu bildirmək', de: 'Die Mitteilung an den Arbeitgeber, dass man krank ist', en: 'Telling your employer that you are ill', ru: 'Сообщение работодателю о болезни' },
          { az: 'Sığorta kartı', de: 'Die Versichertenkarte', en: 'The insurance card', ru: 'Страховая карта' },
        ],
        answer: 1,
      },
    ],
  },
  {
    kind: 'EXERCISE',
    topic: 'bureaucracy',
    minutes: 3,
    title: { az: 'Test: Almaniyada ilk addımlar', de: 'Quiz: Die ersten Schritte in Deutschland', en: 'Quiz: first steps in Germany', ru: 'Тест: первые шаги в Германии' },
    body: {
      az: 'Dərslərdən yadda qalanları yoxlayın.',
      de: 'Prüfen Sie, was Sie aus den Lektionen behalten haben.',
      en: 'Check what you remember from the lessons.',
      ru: 'Проверьте, что вы запомнили из уроков.',
    },
    exercise: [
      {
        q: { az: 'Köçdükdən sonra Anmeldung neçə gün ərzində edilməlidir?', de: 'Innerhalb von wie vielen Tagen nach dem Einzug muss man sich anmelden?', en: 'Within how many days after moving in must you register?', ru: 'В течение скольких дней после въезда нужно зарегистрироваться?' },
        options: [
          { az: '3 gün', de: '3 Tage', en: '3 days', ru: '3 дня' },
          { az: '14 gün', de: '14 Tage', en: '14 days', ru: '14 дней' },
          { az: '3 ay', de: '3 Monate', en: '3 months', ru: '3 месяца' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Təcili yardım nömrəsi:', de: 'Die Nummer für Rettungsdienst und Feuerwehr:', en: 'The number for ambulance and fire brigade:', ru: 'Номер скорой помощи и пожарных:' },
        options: [
          { az: '110', de: '110', en: '110', ru: '110' },
          { az: '112', de: '112', en: '112', ru: '112' },
          { az: '116 117', de: '116 117', en: '116 117', ru: '116 117' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Kaution qanunla ən çox nə qədər ola bilər?', de: 'Wie hoch darf die Kaution höchstens sein?', en: 'What is the legal maximum for a rental deposit?', ru: 'Каков максимальный залог по закону?' },
        options: [
          { az: '1 aylıq Warmmiete', de: '1 Monatswarmmiete', en: '1 month’s Warmmiete', ru: '1 месячная Warmmiete' },
          { az: '3 aylıq Kaltmiete', de: '3 Monatskaltmieten', en: '3 months’ Kaltmiete', ru: '3 месячных Kaltmiete' },
          { az: '6 aylıq Kaltmiete', de: '6 Monatskaltmieten', en: '6 months’ Kaltmiete', ru: '6 месячных Kaltmiete' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Sınaq müddəti (Probezeit) ən çox neçə ay ola bilər?', de: 'Wie lange darf die Probezeit höchstens dauern?', en: 'What is the maximum length of a probation period?', ru: 'Какой максимальный испытательный срок?' },
        options: [
          { az: '1 ay', de: '1 Monat', en: '1 month', ru: '1 месяц' },
          { az: '6 ay', de: '6 Monate', en: '6 months', ru: '6 месяцев' },
          { az: '12 ay', de: '12 Monate', en: '12 months', ru: '12 месяцев' },
        ],
        answer: 1,
      },
      {
        q: { az: 'Steuer-ID necə gəlir?', de: 'Wie bekommen Sie Ihre Steuer-ID?', en: 'How do you receive your tax ID?', ru: 'Как вы получите Steuer-ID?' },
        options: [
          { az: 'Anmeldung-dan sonra poçtla', de: 'Nach der Anmeldung per Post', en: 'By post after the Anmeldung', ru: 'По почте после Anmeldung' },
          { az: 'Bankda', de: 'Bei der Bank', en: 'At the bank', ru: 'В банке' },
          { az: 'Hava limanında', de: 'Am Flughafen', en: 'At the airport', ru: 'В аэропорту' },
        ],
        answer: 0,
      },
    ],
  },
  {
    kind: 'EXERCISE',
    topic: 'work',
    minutes: 3,
    visaTypes: [...WORKING],
    title: { az: 'İşdə almanca: ilk gün', de: 'Deutsch im Job: der erste Tag', en: 'German at work: your first day', ru: 'Немецкий на работе: первый день' },
    body: {
      az: 'İlk iş günündə lazım olacaq ifadələr.',
      de: 'Sätze, die Sie am ersten Arbeitstag brauchen.',
      en: 'Phrases you will need on your first working day.',
      ru: 'Фразы, которые пригодятся в первый рабочий день.',
    },
    exercise: [
      {
        q: { az: 'Bir şeyi başa düşmədiniz. Nə deyirsiniz?', de: 'Sie haben etwas nicht verstanden. Was sagen Sie?', en: 'You did not understand something. What do you say?', ru: 'Вы что-то не поняли. Что скажете?' },
        options: [
          { az: 'Können Sie das bitte wiederholen?', de: 'Können Sie das bitte wiederholen?', en: 'Können Sie das bitte wiederholen?', ru: 'Können Sie das bitte wiederholen?' },
          { az: 'Das ist mir egal.', de: 'Das ist mir egal.', en: 'Das ist mir egal.', ru: 'Das ist mir egal.' },
          { az: 'Ich habe keine Lust.', de: 'Ich habe keine Lust.', en: 'Ich habe keine Lust.', ru: 'Ich habe keine Lust.' },
        ],
        answer: 0,
      },
      {
        q: { az: '"die Pause" nə deməkdir?', de: 'Was bedeutet „die Pause“?', en: 'What does "die Pause" mean?', ru: 'Что значит «die Pause»?' },
        options: [
          { az: 'fasilə', de: 'eine kurze Unterbrechung der Arbeit', en: 'break', ru: 'перерыв' },
          { az: 'növbə', de: 'die Schicht', en: 'shift', ru: 'смена' },
          { az: 'maaş', de: 'der Lohn', en: 'salary', ru: 'зарплата' },
        ],
        answer: 0,
      },
      {
        q: { az: 'Xəstəsiniz və işə gələ bilmirsiniz. Zəng edib nə deyirsiniz?', de: 'Sie sind krank. Was sagen Sie am Telefon?', en: 'You are ill. What do you say on the phone?', ru: 'Вы заболели. Что скажете по телефону?' },
        options: [
          { az: 'Ich komme heute später, ich bin müde.', de: 'Ich komme heute später, ich bin müde.', en: 'Ich komme heute später, ich bin müde.', ru: 'Ich komme heute später, ich bin müde.' },
          { az: 'Ich bin krank und kann heute nicht kommen.', de: 'Ich bin krank und kann heute nicht kommen.', en: 'Ich bin krank und kann heute nicht kommen.', ru: 'Ich bin krank und kann heute nicht kommen.' },
          { az: 'Ich mache heute Urlaub.', de: 'Ich mache heute Urlaub.', en: 'Ich mache heute Urlaub.', ru: 'Ich mache heute Urlaub.' },
        ],
        answer: 1,
      },
    ],
  },
];
