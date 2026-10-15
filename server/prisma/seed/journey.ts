import type { PrismaClient } from '@prisma/client';

/**
 * Client journey seed: post-arrival onboarding checklist, German self-test questions and example
 * language courses. Items are upserted by slug (safe to re-run); questions and courses are only
 * inserted when their tables are empty, so admin edits survive a re-seed.
 */

type L = { az: string; de: string; en: string; ru: string };

const onboardingItems: { slug: string; icon: string; dueDays: number | null; link: string | null; title: L; body: L }[] = [
  {
    slug: 'anmeldung',
    icon: 'MapPin',
    dueDays: 14,
    link: 'https://www.bmi.bund.de/DE/themen/moderne-verwaltung/verwaltungsrecht/meldewesen/meldewesen-node.html',
    title: { az: 'Yaşayış yerində qeydiyyat (Anmeldung)', de: 'Wohnsitz anmelden (Anmeldung)', en: 'Register your address (Anmeldung)', ru: 'Регистрация по месту жительства (Anmeldung)' },
    body: {
      az: 'Almaniyaya gəldikdən sonra 14 gün ərzində yaşadığınız şəhərin Bürgeramt / Einwohnermeldeamt idarəsində qeydiyyatdan keçməlisiniz. Bu, demək olar ki, bütün digər addımların (bank hesabı, vergi nömrəsi, sığorta) əsasıdır.\n\nÖzünüzlə pasport, viza, mənzil sahibinin təsdiqi (Wohnungsgeberbestätigung) və varsa nikah/doğum şəhadətnamələrini götürün. Bir çox şəhərdə görüş vaxtı onlayn alınır – yerləri tez tutun.\n\nQeydiyyatdan sonra sizə Meldebescheinigung (qeydiyyat arayışı) verilir. Onu saxlayın: bank, işəgötürən və Ausländerbehörde onu tələb edəcək.',
      de: 'Innerhalb von 14 Tagen nach dem Einzug müssen Sie sich beim Bürgeramt / Einwohnermeldeamt Ihrer Stadt anmelden. Die Anmeldung ist die Grundlage für fast alle weiteren Schritte (Bankkonto, Steuer-ID, Versicherung).\n\nBringen Sie Reisepass, Visum, die Wohnungsgeberbestätigung und ggf. Heirats-/Geburtsurkunden mit. In vielen Städten wird ein Termin online vergeben – buchen Sie frühzeitig.\n\nNach der Anmeldung erhalten Sie eine Meldebescheinigung. Bewahren Sie sie gut auf: Bank, Arbeitgeber und Ausländerbehörde fragen danach.',
      en: 'Within 14 days of moving in you must register at the Bürgeramt / Einwohnermeldeamt of your city. This registration is the basis for almost every other step (bank account, tax ID, insurance).\n\nBring your passport, visa, the landlord confirmation (Wohnungsgeberbestätigung) and, if applicable, marriage/birth certificates. Many cities only offer online appointments – book early.\n\nAfter registering you receive a Meldebescheinigung (registration certificate). Keep it safe: the bank, your employer and the immigration office will ask for it.',
      ru: 'В течение 14 дней после въезда необходимо зарегистрироваться в Bürgeramt / Einwohnermeldeamt вашего города. Регистрация – основа почти всех дальнейших шагов (банковский счёт, налоговый номер, страховка).\n\nВозьмите паспорт, визу, подтверждение арендодателя (Wohnungsgeberbestätigung) и при наличии свидетельства о браке/рождении. Во многих городах запись только онлайн – бронируйте заранее.\n\nПосле регистрации вы получите Meldebescheinigung (справку о регистрации). Сохраните её: банк, работодатель и ведомство по делам иностранцев будут её запрашивать.',
    },
  },
  {
    slug: 'krankenversicherung',
    icon: 'HeartPulse',
    dueDays: 14,
    link: 'https://www.bundesgesundheitsministerium.de/themen/krankenversicherung',
    title: { az: 'Tibbi sığorta (Krankenversicherung)', de: 'Krankenversicherung abschließen', en: 'Health insurance (Krankenversicherung)', ru: 'Медицинская страховка (Krankenversicherung)' },
    body: {
      az: 'Almaniyada tibbi sığorta məcburidir. İşə başladığınız gündən etibarən dövlət sığortasına (gesetzliche Krankenkasse, məs. TK, AOK, Barmer) üzv olmalısınız; haqqı maaşdan avtomatik tutulur, yarısını işəgötürən ödəyir.\n\nKassanı özünüz seçirsiniz – işəgötürənə sadəcə üzvlük təsdiqini verin. Seçim etməsəniz, işəgötürən sizi bir kassaya yazdıracaq.\n\nBir neçə həftə sonra sığorta kartı (Gesundheitskarte) poçtla gəlir; həkimə gedəndə həmişə özünüzlə götürün. Ailə üzvləriniz gəlibsə, onların da sığortasını (çox vaxt pulsuz ailə sığortası) qeydiyyata alın.',
      de: 'In Deutschland ist eine Krankenversicherung Pflicht. Ab dem ersten Arbeitstag sind Sie in der gesetzlichen Krankenversicherung (z. B. TK, AOK, Barmer) versichert; der Beitrag wird automatisch vom Gehalt abgezogen, der Arbeitgeber zahlt die Hälfte.\n\nDie Krankenkasse wählen Sie selbst – geben Sie dem Arbeitgeber nur die Mitgliedsbescheinigung. Ohne Wahl meldet der Arbeitgeber Sie bei einer Kasse an.\n\nNach einigen Wochen kommt die Gesundheitskarte per Post; nehmen Sie sie zu jedem Arztbesuch mit. Nachgezogene Familienmitglieder können oft kostenlos familienversichert werden.',
      en: 'Health insurance is mandatory in Germany. From your first working day you are covered by statutory insurance (gesetzliche Krankenkasse, e.g. TK, AOK, Barmer); the contribution is deducted from your salary and your employer pays half.\n\nYou choose the insurer yourself – just hand the membership confirmation to your employer. If you do not choose, the employer registers you with one.\n\nAfter a few weeks the insurance card (Gesundheitskarte) arrives by post; bring it to every doctor\'s visit. Family members who joined you can often be insured for free (Familienversicherung).',
      ru: 'Медицинская страховка в Германии обязательна. С первого рабочего дня вы застрахованы в государственной кассе (gesetzliche Krankenkasse, напр. TK, AOK, Barmer); взнос удерживается из зарплаты, половину платит работодатель.\n\nКассу вы выбираете сами – работодателю нужно лишь подтверждение членства. Если выбора нет, работодатель зарегистрирует вас в одной из касс.\n\nЧерез несколько недель по почте придёт страховая карта (Gesundheitskarte); берите её на каждый приём к врачу. Приехавших членов семьи часто можно застраховать бесплатно (Familienversicherung).',
    },
  },
  {
    slug: 'bankkonto',
    icon: 'Building2',
    dueDays: 21,
    link: null,
    title: { az: 'Bank hesabı (Girokonto)', de: 'Bankkonto eröffnen (Girokonto)', en: 'Open a bank account (Girokonto)', ru: 'Банковский счёт (Girokonto)' },
    body: {
      az: 'Maaşınız yalnız Almaniya (SEPA) bank hesabına köçürülür, kirayə və sığorta da oradan ödənilir. Buna görə hesabı ilk həftələrdə açın.\n\nFilial bankları (Sparkasse, Volksbank, Commerzbank) və onlayn banklar (N26, ING, DKB) var. Onlayn banklar adətən daha sürətli və pulsuzdur; filial bankı isə nağd pul və məsləhət üçün rahatdır.\n\nLazım olanlar: pasport, Meldebescheinigung (bəzən viza da). IBAN-ı dərhal işəgötürənə və sığorta kassasına bildirin.',
      de: 'Ihr Gehalt wird nur auf ein deutsches (SEPA-)Konto überwiesen, auch Miete und Versicherung laufen darüber. Eröffnen Sie das Konto daher in den ersten Wochen.\n\nEs gibt Filialbanken (Sparkasse, Volksbank, Commerzbank) und Online-Banken (N26, ING, DKB). Online-Banken sind meist schneller und kostenlos; eine Filialbank ist praktisch für Bargeld und Beratung.\n\nSie brauchen: Reisepass, Meldebescheinigung (manchmal auch das Visum). Teilen Sie die IBAN sofort Arbeitgeber und Krankenkasse mit.',
      en: 'Your salary is only paid to a German (SEPA) account, and rent and insurance are debited from it too. Open the account in your first weeks.\n\nThere are branch banks (Sparkasse, Volksbank, Commerzbank) and online banks (N26, ING, DKB). Online banks are usually faster and free; a branch bank is handy for cash and advice.\n\nYou need: passport, Meldebescheinigung (sometimes the visa too). Give the IBAN to your employer and health insurer right away.',
      ru: 'Зарплату переводят только на немецкий (SEPA) счёт, с него же списывают аренду и страховку. Откройте счёт в первые недели.\n\nЕсть банки с отделениями (Sparkasse, Volksbank, Commerzbank) и онлайн-банки (N26, ING, DKB). Онлайн-банки обычно быстрее и бесплатны; банк с отделением удобен для наличных и консультаций.\n\nНужны: паспорт, Meldebescheinigung (иногда и виза). Сразу сообщите IBAN работодателю и страховой кассе.',
    },
  },
  {
    slug: 'steuer-id',
    icon: 'FileCheck2',
    dueDays: 30,
    link: 'https://www.bzst.de/DE/Privatpersonen/SteuerlicheIdentifikationsnummer/steuerlicheidentifikationsnummer_node.html',
    title: { az: 'Vergi identifikasiya nömrəsi (Steuer-ID)', de: 'Steuer-ID erhalten', en: 'Tax ID (Steuer-ID)', ru: 'Налоговый номер (Steuer-ID)' },
    body: {
      az: 'Steuer-ID (steuerliche Identifikationsnummer) 11 rəqəmli ömürlük vergi nömrənizdir. Anmeldung-dan sonra Bundeszentralamt für Steuern onu 2–4 həftə ərzində avtomatik poçtla göndərir.\n\nNömrəni işəgötürənə verin – onsuz maaşınızdan ən yüksək vergi dərəcəsi (Steuerklasse VI) tutulur. Nömrə gec gəlirsə, Finanzamt-dan şəxsən soruşa bilərsiniz.\n\nMəktubu saxlayın: nömrə vergi bəyannaməsi, Kindergeld və bir çox müraciətdə tələb olunur.',
      de: 'Die Steuer-ID (steuerliche Identifikationsnummer) ist Ihre 11-stellige, lebenslange Steuernummer. Nach der Anmeldung schickt das Bundeszentralamt für Steuern sie innerhalb von 2–4 Wochen automatisch per Post.\n\nGeben Sie die Nummer Ihrem Arbeitgeber – ohne sie wird das Gehalt mit der höchsten Steuerklasse (VI) versteuert. Kommt der Brief nicht, fragen Sie beim Finanzamt nach.\n\nBewahren Sie das Schreiben auf: Die Nummer wird für Steuererklärung, Kindergeld und viele Anträge gebraucht.',
      en: 'The Steuer-ID (tax identification number) is your 11-digit lifelong tax number. After the Anmeldung the Federal Central Tax Office sends it automatically by post within 2–4 weeks.\n\nGive the number to your employer – without it your salary is taxed at the highest tax class (VI). If the letter does not arrive, ask at the local Finanzamt.\n\nKeep the letter: the number is needed for the tax return, Kindergeld and many applications.',
      ru: 'Steuer-ID (налоговый идентификационный номер) – ваш 11-значный пожизненный налоговый номер. После Anmeldung Федеральное центральное налоговое ведомство автоматически присылает его по почте в течение 2–4 недель.\n\nСообщите номер работодателю – без него зарплата облагается по самому высокому налоговому классу (VI). Если письмо не пришло, обратитесь в Finanzamt.\n\nСохраните письмо: номер нужен для налоговой декларации, Kindergeld и многих заявлений.',
    },
  },
  {
    slug: 'aufenthaltstitel',
    icon: 'Stamp',
    dueDays: 30,
    link: 'https://www.bamf.de/DE/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/zuwandererdrittstaaten-node.html',
    title: { az: 'Yaşayış icazəsi – eAT görüşü (Ausländerbehörde)', de: 'Aufenthaltstitel (eAT) beantragen', en: 'Residence permit – eAT appointment', ru: 'Вид на жительство – запись на eAT' },
    body: {
      az: 'Vizanız adətən 3–6 ay qüvvədədir. Bu müddət bitməzdən xeyli əvvəl Ausländerbehörde-də elektron yaşayış icazəsi (elektronischer Aufenthaltstitel, eAT) üçün görüş alın – bəzi şəhərlərdə növbə aylarla çəkir.\n\nLazım olanlar: pasport, viza, Meldebescheinigung, əmək müqaviləsi, tibbi sığorta təsdiqi, biometrik foto, ərizə forması və rüsum (~100 €). Dəqiq siyahı şəhərin saytındadır.\n\nGörüşdən sonra Fiktionsbescheinigung (müvəqqəti təsdiq) ala bilərsiniz; kart özü 4–8 həftə sonra hazır olur.',
      de: 'Ihr Visum gilt meist 3–6 Monate. Vereinbaren Sie deutlich vor Ablauf einen Termin bei der Ausländerbehörde für den elektronischen Aufenthaltstitel (eAT) – in manchen Städten dauert es Monate bis zum Termin.\n\nSie brauchen: Reisepass, Visum, Meldebescheinigung, Arbeitsvertrag, Nachweis der Krankenversicherung, biometrisches Foto, Antragsformular und die Gebühr (ca. 100 €). Die genaue Liste steht auf der Website Ihrer Stadt.\n\nNach dem Termin erhalten Sie ggf. eine Fiktionsbescheinigung; die Karte selbst ist nach 4–8 Wochen fertig.',
      en: 'Your visa is usually valid for 3–6 months. Well before it expires, book an appointment at the Ausländerbehörde for the electronic residence permit (eAT) – in some cities the wait is months.\n\nYou need: passport, visa, Meldebescheinigung, employment contract, proof of health insurance, biometric photo, application form and the fee (about €100). The exact list is on your city\'s website.\n\nAfter the appointment you may get a Fiktionsbescheinigung (temporary confirmation); the card itself is ready after 4–8 weeks.',
      ru: 'Виза обычно действует 3–6 месяцев. Задолго до её окончания запишитесь в Ausländerbehörde на оформление электронного вида на жительство (eAT) – в некоторых городах ожидание занимает месяцы.\n\nНужны: паспорт, виза, Meldebescheinigung, трудовой договор, подтверждение медстраховки, биометрическое фото, анкета и пошлина (около 100 €). Точный список – на сайте вашего города.\n\nПосле приёма вы можете получить Fiktionsbescheinigung (временное подтверждение); сама карта готова через 4–8 недель.',
    },
  },
  {
    slug: 'rundfunkbeitrag',
    icon: 'Newspaper',
    dueDays: 30,
    link: 'https://www.rundfunkbeitrag.de',
    title: { az: 'Yayım haqqı (Rundfunkbeitrag)', de: 'Rundfunkbeitrag anmelden', en: 'Broadcasting fee (Rundfunkbeitrag)', ru: 'Взнос за вещание (Rundfunkbeitrag)' },
    body: {
      az: 'Almaniyada hər mənzil üçün aylıq yayım haqqı (hazırda 18,36 €) ödənilir – televizor olub-olmamasından asılı olmayaraq. Anmeldung-dan sonra Beitragsservice sizə avtomatik məktub göndərir.\n\nMənzili başqaları ilə bölürsünüzsə, haqq bir dəfə ödənilir – kim ödəyirsə, onun nömrəsini bildirin. Məktubu cavabsız qoymayın: cərimə və gecikmə haqqı yaranır.\n\nƏn asanı onlayn qeydiyyat və SEPA ödəniş tapşırığıdır.',
      de: 'In Deutschland zahlt jede Wohnung einen monatlichen Rundfunkbeitrag (derzeit 18,36 €) – unabhängig davon, ob ein Fernseher vorhanden ist. Nach der Anmeldung schreibt der Beitragsservice Sie automatisch an.\n\nTeilen Sie sich die Wohnung, wird nur einmal gezahlt – geben Sie dann die Beitragsnummer der zahlenden Person an. Lassen Sie den Brief nicht unbeantwortet: Es drohen Säumniszuschläge.\n\nAm einfachsten ist die Online-Anmeldung mit SEPA-Lastschrift.',
      en: 'Every household in Germany pays a monthly broadcasting fee (currently €18.36) – whether or not you own a TV. After the Anmeldung the Beitragsservice writes to you automatically.\n\nIf you share the flat, the fee is paid only once – state the contribution number of the person who pays. Do not ignore the letter: late fees apply.\n\nThe easiest way is online registration with a SEPA direct debit.',
      ru: 'Каждая квартира в Германии платит ежемесячный взнос за вещание (сейчас 18,36 €) – независимо от наличия телевизора. После Anmeldung Beitragsservice автоматически пришлёт письмо.\n\nЕсли вы делите квартиру, взнос платится один раз – укажите номер плательщика. Не оставляйте письмо без ответа: начисляются пени.\n\nПроще всего зарегистрироваться онлайн и оформить SEPA-списание.',
    },
  },
  {
    slug: 'mobilfunk',
    icon: 'Phone',
    dueDays: 7,
    link: null,
    title: { az: 'Mobil nömrə və internet', de: 'Mobilfunk und Internet', en: 'Mobile phone and internet', ru: 'Мобильная связь и интернет' },
    body: {
      az: 'Almaniya nömrəsi lazımdır: idarələr, bank və işəgötürən sizinlə onunla əlaqə saxlayır, onlayn bank isə SMS təsdiqi tələb edir. İlk günlərdə Prepaid SIM (Aldi Talk, Lidl Connect, Telekom/Vodafone/o2 prepaid) ən rahat seçimdir.\n\nSIM-i aktivləşdirmək üçün şəxsiyyət yoxlaması (pasportla video-ident və ya mağazada) keçməlisiniz. Müqaviləli tariflər adətən 24 aylıqdır – hələlik tələsməyin.\n\nEv interneti (DSL/kabel) 2–6 həftə çəkə bilər; müqaviləni Anmeldung-dan sonra bağlayın.',
      de: 'Sie brauchen eine deutsche Nummer: Behörden, Bank und Arbeitgeber erreichen Sie darüber, Online-Banking verlangt SMS-Bestätigungen. In den ersten Tagen ist eine Prepaid-SIM (Aldi Talk, Lidl Connect, Telekom/Vodafone/o2 Prepaid) am einfachsten.\n\nZur Aktivierung ist eine Identitätsprüfung nötig (Video-Ident mit Reisepass oder im Shop). Vertragstarife laufen meist 24 Monate – damit können Sie warten.\n\nInternet für die Wohnung (DSL/Kabel) dauert 2–6 Wochen; schließen Sie den Vertrag nach der Anmeldung ab.',
      en: 'You need a German number: authorities, the bank and your employer contact you on it, and online banking requires SMS confirmations. In the first days a prepaid SIM (Aldi Talk, Lidl Connect, Telekom/Vodafone/o2 prepaid) is the easiest option.\n\nActivation requires an identity check (video ident with your passport or in a shop). Contract plans usually run 24 months – no need to hurry.\n\nHome internet (DSL/cable) can take 2–6 weeks; sign the contract after the Anmeldung.',
      ru: 'Нужен немецкий номер: ведомства, банк и работодатель связываются по нему, а онлайн-банкинг требует SMS-подтверждений. В первые дни проще всего взять Prepaid-SIM (Aldi Talk, Lidl Connect, Telekom/Vodafone/o2 prepaid).\n\nДля активации нужна проверка личности (видеоидентификация по паспорту или в магазине). Контрактные тарифы обычно на 24 месяца – с ними можно подождать.\n\nДомашний интернет (DSL/кабель) подключают 2–6 недель; заключайте договор после Anmeldung.',
    },
  },
  {
    slug: 'mietvertrag',
    icon: 'House',
    dueDays: null,
    link: 'https://www.bmwsb.bund.de/Webs/BMWSB/DE/themen/stadt-wohnen/wohnraumfoerderung/mietrecht/mietrecht-node.html',
    title: { az: 'Mənzil və kirayə müqaviləsi', de: 'Wohnung und Mietvertrag', en: 'Flat and rental contract', ru: 'Квартира и договор аренды' },
    body: {
      az: 'Kirayə müqaviləsini (Mietvertrag) imzalamazdan əvvəl diqqətlə oxuyun: Kaltmiete (xalis kirayə), Nebenkosten (kommunal), Kaution (girov, maksimum 3 aylıq xalis kirayə) və xəbərdarlıq müddəti (adətən 3 ay).\n\nKöçərkən mənzilin vəziyyətini protokolla (Übergabeprotokoll) və foto ilə sənədləşdirin – girovun geri qaytarılması üçün vacibdir. Mənzil sahibi Anmeldung üçün Wohnungsgeberbestätigung verməlidir.\n\nElektrik (Strom) və bəzən qaz müqaviləsini özünüz bağlayırsınız; müqayisə portallarından istifadə edin. Zibil ayırma qaydalarını qonşulardan və ya Hausordnung-dan öyrənin.',
      de: 'Lesen Sie den Mietvertrag vor der Unterschrift genau: Kaltmiete, Nebenkosten, Kaution (max. drei Kaltmieten) und Kündigungsfrist (meist drei Monate).\n\nDokumentieren Sie beim Einzug den Zustand der Wohnung mit Übergabeprotokoll und Fotos – wichtig für die Rückzahlung der Kaution. Der Vermieter muss Ihnen die Wohnungsgeberbestätigung für die Anmeldung ausstellen.\n\nStrom (und manchmal Gas) melden Sie selbst an; nutzen Sie Vergleichsportale. Die Regeln zur Mülltrennung finden Sie in der Hausordnung oder erfragen Sie bei den Nachbarn.',
      en: 'Read the rental contract carefully before signing: Kaltmiete (net rent), Nebenkosten (utilities), Kaution (deposit, max. three months\' net rent) and the notice period (usually three months).\n\nDocument the condition of the flat on moving in with a handover protocol and photos – important for getting the deposit back. The landlord must give you the Wohnungsgeberbestätigung for the Anmeldung.\n\nYou register electricity (and sometimes gas) yourself; use comparison portals. Learn the waste separation rules from the Hausordnung or your neighbours.',
      ru: 'Внимательно читайте договор аренды перед подписанием: Kaltmiete (чистая аренда), Nebenkosten (коммунальные), Kaution (залог, максимум три чистые аренды) и срок уведомления (обычно три месяца).\n\nПри въезде зафиксируйте состояние квартиры протоколом приёмки и фото – это важно для возврата залога. Арендодатель обязан выдать Wohnungsgeberbestätigung для Anmeldung.\n\nЭлектричество (иногда и газ) вы подключаете сами; пользуйтесь порталами сравнения. Правила сортировки мусора узнайте из Hausordnung или у соседей.',
    },
  },
  {
    slug: 'integrationskurs',
    icon: 'GraduationCap',
    dueDays: 60,
    link: 'https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Integrationskurse/integrationskurse-node.html',
    title: { az: 'İnteqrasiya kursu və alman dili', de: 'Integrationskurs und Deutsch lernen', en: 'Integration course and German', ru: 'Интеграционный курс и немецкий язык' },
    body: {
      az: 'İnteqrasiya kursu (BAMF) 600–900 saat alman dili + 100 saat oriyentasiya kursudur və B1 imtahanı ilə bitir. Bir çox hallarda iştirak pulsuz və ya çox ucuzdur; müraciət BAMF-ın regional şöbəsinə və ya birbaşa kurs təşkilatçısına (VHS, Berlitz, Inlingua) edilir.\n\nB1 səviyyəsi daimi yaşayış icazəsi (Niederlassungserlaubnis) və sonradan vətəndaşlıq üçün tələb olunur. İş yerində isə hər gün danışmaq ən yaxşı praktikadır.\n\nİşlə paralel axşam və ya onlayn kurslar mövcuddur. Kursa yazılmaq üçün Meldebescheinigung və yaşayış icazəsi lazımdır.',
      de: 'Der Integrationskurs (BAMF) umfasst 600–900 Stunden Deutsch plus 100 Stunden Orientierungskurs und endet mit der B1-Prüfung. Oft ist die Teilnahme kostenlos oder sehr günstig; den Antrag stellen Sie bei der BAMF-Regionalstelle oder direkt beim Kursträger (VHS, Berlitz, Inlingua).\n\nB1 ist Voraussetzung für die Niederlassungserlaubnis und später für die Einbürgerung. Am Arbeitsplatz täglich Deutsch zu sprechen ist die beste Übung.\n\nEs gibt Abend- und Online-Kurse neben der Arbeit. Zur Anmeldung brauchen Sie Meldebescheinigung und Aufenthaltstitel.',
      en: 'The integration course (BAMF) consists of 600–900 hours of German plus a 100-hour orientation course and ends with the B1 exam. Participation is often free or very cheap; apply at the regional BAMF office or directly with a course provider (VHS, Berlitz, Inlingua).\n\nB1 is required for the permanent residence permit (Niederlassungserlaubnis) and later for citizenship. Speaking German every day at work is the best practice.\n\nEvening and online courses are available alongside work. To enrol you need the Meldebescheinigung and your residence permit.',
      ru: 'Интеграционный курс (BAMF) включает 600–900 часов немецкого и 100 часов ориентационного курса и заканчивается экзаменом B1. Участие часто бесплатное или очень дешёвое; заявление подаётся в региональное отделение BAMF или напрямую организатору курса (VHS, Berlitz, Inlingua).\n\nУровень B1 нужен для постоянного вида на жительство (Niederlassungserlaubnis) и позже для гражданства. Ежедневное общение на работе – лучшая практика.\n\nЕсть вечерние и онлайн-курсы параллельно с работой. Для записи нужны Meldebescheinigung и вид на жительство.',
    },
  },
  {
    slug: 'fuehrerschein',
    icon: 'Car',
    dueDays: 180,
    link: 'https://www.bmv.de/SharedDocs/DE/Artikel/StV/Strassenverkehr/gueltigkeit-auslaendischer-fahrerlaubnisse.html',
    title: { az: 'Sürücülük vəsiqəsinin dəyişdirilməsi (Umschreibung)', de: 'Führerschein umschreiben lassen', en: 'Convert your driving licence (Umschreibung)', ru: 'Замена водительского удостоверения (Umschreibung)' },
    body: {
      az: 'Azərbaycan sürücülük vəsiqəsi Almaniyada qeydiyyatdan sonra yalnız 6 ay etibarlıdır. Bu müddətdə Führerscheinstelle-də dəyişdirilmə (Umschreibung) üçün müraciət edin – xüsusilə peşəkar sürücü kimi işləyirsinizsə, gecikdirməyin.\n\nAzərbaycan üçün adətən nəzəri və praktiki imtahan tələb olunur (sürücülük məktəbində məcburi dərs saatı yoxdur, amma məşq tövsiyə edilir). C/CE kateqoriyası üçün əlavə olaraq Kod 95 (Berufskraftfahrerqualifikation) lazımdır.\n\nLazım olanlar: pasport, yaşayış icazəsi, Meldebescheinigung, orijinal vəsiqə + rəsmi tərcümə (ADAC və ya andlı tərcüməçi), biometrik foto, görmə testi və ilk yardım kursu.',
      de: 'Ein aserbaidschanischer Führerschein gilt nach der Anmeldung in Deutschland nur sechs Monate. Beantragen Sie in dieser Zeit die Umschreibung bei der Führerscheinstelle – gerade als Berufskraftfahrer nicht aufschieben.\n\nFür Aserbaidschan sind in der Regel theoretische und praktische Prüfung nötig (keine Pflichtstunden in der Fahrschule, Übung wird aber empfohlen). Für C/CE kommt die Schlüsselzahl 95 (Berufskraftfahrerqualifikation) hinzu.\n\nSie brauchen: Reisepass, Aufenthaltstitel, Meldebescheinigung, Originalführerschein mit amtlicher Übersetzung (ADAC oder vereidigter Übersetzer), biometrisches Foto, Sehtest und Erste-Hilfe-Kurs.',
      en: 'An Azerbaijani driving licence is valid in Germany for only six months after registration. Apply for conversion (Umschreibung) at the Führerscheinstelle within that time – especially if you work as a professional driver.\n\nFor Azerbaijan a theory and a practical test are usually required (no mandatory driving-school hours, but practice is recommended). For C/CE you additionally need code 95 (professional driver qualification).\n\nYou need: passport, residence permit, Meldebescheinigung, original licence with an official translation (ADAC or sworn translator), biometric photo, eye test and a first-aid course.',
      ru: 'Азербайджанское водительское удостоверение действует в Германии только шесть месяцев после регистрации. За это время подайте заявление на замену (Umschreibung) в Führerscheinstelle – особенно если работаете профессиональным водителем.\n\nДля Азербайджана обычно требуются теоретический и практический экзамены (обязательных часов в автошколе нет, но практика рекомендуется). Для категорий C/CE дополнительно нужен код 95 (квалификация профессионального водителя).\n\nНужны: паспорт, вид на жительство, Meldebescheinigung, оригинал удостоверения с официальным переводом (ADAC или присяжный переводчик), биометрическое фото, проверка зрения и курс первой помощи.',
    },
  },
  {
    slug: 'notfallnummern',
    icon: 'Stethoscope',
    dueDays: 1,
    link: 'https://www.116117.de',
    title: { az: 'Təcili nömrələr və həkim', de: 'Notfallnummern und Hausarzt', en: 'Emergency numbers and a family doctor', ru: 'Экстренные номера и семейный врач' },
    body: {
      az: 'Yadda saxlayın: 112 – təcili tibbi yardım və yanğın (pulsuz, bütün Avropada), 110 – polis, 116 117 – təcili olmayan hallarda növbətçi həkim (axşam və həftə sonu).\n\nİlk həftələrdə bir ailə həkimi (Hausarzt) tapın – Almaniyada mütəxəssisə adətən onun göndərişi ilə gedilir. Həkim axtarışı üçün kassanızın saytı və ya jameda.de uyğundur; qəbula yazılmaq üçün zəng edin və sığorta kartını götürün.\n\nAptek (Apotheke) həftə sonu da işləyən növbətçi aptek sistemi var: aptekin qapısındakı siyahıya və ya aponet.de saytına baxın.',
      de: 'Merken Sie sich: 112 – Rettungsdienst und Feuerwehr (kostenlos, europaweit), 110 – Polizei, 116 117 – ärztlicher Bereitschaftsdienst außerhalb der Sprechzeiten.\n\nSuchen Sie sich in den ersten Wochen einen Hausarzt – zum Facharzt geht man in Deutschland meist mit Überweisung. Ärzte finden Sie über Ihre Krankenkasse oder jameda.de; rufen Sie für einen Termin an und nehmen Sie die Gesundheitskarte mit.\n\nApotheken haben einen Notdienst auch am Wochenende: Aushang an der Apothekentür oder aponet.de.',
      en: 'Remember: 112 – ambulance and fire brigade (free, Europe-wide), 110 – police, 116 117 – on-call doctor outside surgery hours.\n\nFind a family doctor (Hausarzt) in your first weeks – in Germany you usually see a specialist with a referral. Search via your health insurer\'s website or jameda.de; call for an appointment and bring your insurance card.\n\nPharmacies run an emergency service at weekends too: check the notice on the pharmacy door or aponet.de.',
      ru: 'Запомните: 112 – скорая помощь и пожарные (бесплатно, по всей Европе), 110 – полиция, 116 117 – дежурный врач вне приёмных часов.\n\nВ первые недели найдите семейного врача (Hausarzt) – к специалисту в Германии обычно идут по направлению. Ищите через сайт вашей страховой кассы или jameda.de; позвоните для записи и возьмите страховую карту.\n\nУ аптек есть дежурная служба и по выходным: смотрите объявление на двери аптеки или aponet.de.',
    },
  },
];

type Q = { level: 'A1' | 'A2' | 'B1' | 'B2'; question: L; options: string[]; answer: number };

const gap = (sentence: string): L => ({
  az: `Boşluğu doldurun: ${sentence}`,
  de: `Ergänzen Sie: ${sentence}`,
  en: `Fill in the gap: ${sentence}`,
  ru: `Заполните пропуск: ${sentence}`,
});
const meaning = (word: string): L => ({
  az: `„${word}“ nə deməkdir?`,
  de: `Was bedeutet „${word}“?`,
  en: `What does "${word}" mean?`,
  ru: `Что означает „${word}“?`,
});
const correct = (): L => ({
  az: 'Hansı cümlə düzgündür?',
  de: 'Welcher Satz ist richtig?',
  en: 'Which sentence is correct?',
  ru: 'Какое предложение правильное?',
});

const germanQuestions: Q[] = [
  // ── A1 ──
  { level: 'A1', question: gap('Ich ___ aus Aserbaidschan.'), options: ['komme', 'kommst', 'kommt', 'kommen'], answer: 0 },
  { level: 'A1', question: gap('Wie ___ du?'), options: ['heiße', 'heißt', 'heißen', 'heiß'], answer: 1 },
  { level: 'A1', question: gap('Das ist ___ Auto.'), options: ['ein', 'eine', 'einen', 'einem'], answer: 0 },
  { level: 'A1', question: gap('Wir ___ heute Deutsch.'), options: ['lerne', 'lernst', 'lernt', 'lernen'], answer: 3 },
  { level: 'A1', question: gap('___ kommst du? – Aus Baku.'), options: ['Wann', 'Woher', 'Wohin', 'Was'], answer: 1 },
  { level: 'A1', question: gap('Ich habe ___ Bruder.'), options: ['ein', 'eine', 'einen', 'einer'], answer: 2 },
  { level: 'A1', question: gap('Er ___ 30 Jahre alt.'), options: ['bin', 'bist', 'ist', 'sind'], answer: 2 },
  { level: 'A1', question: gap('Am Montag ___ ich zur Arbeit.'), options: ['gehe', 'gehst', 'geht', 'gehen'], answer: 0 },
  { level: 'A1', question: meaning('Entschuldigung'), options: ['Təşəkkür / Danke', 'Üzr istəyirəm / Verzeihung', 'Sağ olun / Tschüss', 'Xahiş edirəm / Bitte'], answer: 1 },
  { level: 'A1', question: gap('Hast du ___ Kinder?'), options: ['ein', 'kein', 'keine', 'nicht'], answer: 2 },
  { level: 'A1', question: gap('Die Wohnung ist groß ___ hell.'), options: ['aber', 'oder', 'und', 'denn'], answer: 2 },
  { level: 'A1', question: gap('Wie spät ist es? – Es ist ___ Uhr.'), options: ['acht', 'achte', 'achten', 'achter'], answer: 0 },
  // ── A2 ──
  { level: 'A2', question: gap('Gestern ___ ich im Kino.'), options: ['bin', 'war', 'wäre', 'werde'], answer: 1 },
  { level: 'A2', question: gap('Ich habe das Buch schon ___.'), options: ['lese', 'las', 'gelesen', 'lesen'], answer: 2 },
  { level: 'A2', question: gap('Er fährt ___ dem Bus zur Arbeit.'), options: ['mit', 'bei', 'auf', 'zu'], answer: 0 },
  { level: 'A2', question: gap('Ich gebe ___ Kollegen den Schlüssel.'), options: ['der', 'den', 'dem', 'des'], answer: 2 },
  { level: 'A2', question: gap('Wenn ich Zeit habe, ___ ich dich an.'), options: ['rufe', 'rufst', 'ruft', 'rufen'], answer: 0 },
  { level: 'A2', question: gap('___ du mir bitte helfen?'), options: ['Könnt', 'Könntest', 'Könnten', 'Kann'], answer: 1 },
  { level: 'A2', question: gap('Das Wetter ist heute ___ als gestern.'), options: ['gut', 'besser', 'am besten', 'beste'], answer: 1 },
  { level: 'A2', question: gap('Ich muss ___ Arzt gehen.'), options: ['zum', 'zur', 'nach', 'bei'], answer: 0 },
  { level: 'A2', question: gap('Sie wohnt seit zwei Jahren ___ Berlin.'), options: ['nach', 'in', 'an', 'auf'], answer: 1 },
  { level: 'A2', question: meaning('der Termin'), options: ['Görüş vaxtı / appointment', 'Hesab / bill', 'Məzuniyyət / holiday', 'Ünvan / address'], answer: 0 },
  { level: 'A2', question: gap('Er hat ___ Arbeit um 8 Uhr angefangen.'), options: ['mit der', 'mit die', 'bei der', 'an der'], answer: 0 },
  { level: 'A2', question: gap('Ich interessiere mich ___ Technik.'), options: ['an', 'für', 'über', 'mit'], answer: 1 },
  // ── B1 ──
  { level: 'B1', question: gap('Obwohl es regnete, ___ wir spazieren.'), options: ['gingen', 'gehen', 'gegangen', 'ging'], answer: 0 },
  { level: 'B1', question: gap('Der Vertrag ___ gestern unterschrieben.'), options: ['wird', 'wurde', 'werden', 'worden'], answer: 1 },
  { level: 'B1', question: gap('Ich weiß nicht, ___ er morgen kommt.'), options: ['dass', 'ob', 'wenn', 'als'], answer: 1 },
  { level: 'B1', question: gap('Wenn ich mehr Geld ___, würde ich ein Auto kaufen.'), options: ['habe', 'hatte', 'hätte', 'haben'], answer: 2 },
  { level: 'B1', question: gap('Der Mann, ___ dort steht, ist mein Chef.'), options: ['der', 'den', 'dem', 'dessen'], answer: 0 },
  { level: 'B1', question: gap('Sie hat die Prüfung bestanden, ___ sie viel gelernt hat.'), options: ['denn', 'weil', 'deshalb', 'trotzdem'], answer: 1 },
  { level: 'B1', question: meaning('die Kündigung'), options: ['Müqavilənin ləğvi / termination', 'Maaş artımı / pay rise', 'Qeydiyyat / registration', 'Dəvət / invitation'], answer: 0 },
  { level: 'B1', question: gap('Ich freue mich ___ das Wochenende.'), options: ['an', 'über', 'auf', 'für'], answer: 2 },
  { level: 'B1', question: gap('Er arbeitet hier, ___ Geld zu verdienen.'), options: ['damit', 'um', 'zu', 'für'], answer: 1 },
  { level: 'B1', question: correct(), options: ['Ich habe gestern nach Hause gefahren.', 'Ich bin gestern nach Hause gefahren.', 'Ich bin gestern nach Hause fahren.', 'Ich habe gestern nach Hause fahren.'], answer: 1 },
  // ── B2 ──
  { level: 'B2', question: gap('Die Entscheidung ist ___ Verantwortung des Vorgesetzten.'), options: ['in der', 'an der', 'auf der', 'bei der'], answer: 0 },
  { level: 'B2', question: gap('Hätte er sich früher gemeldet, ___ wir ihm helfen können.'), options: ['hatten', 'hätten', 'haben', 'hätte'], answer: 1 },
  { level: 'B2', question: gap('Der Bericht ___ bis Freitag fertiggestellt werden.'), options: ['muss', 'musst', 'müsst', 'müssen'], answer: 0 },
  { level: 'B2', question: meaning('sich auseinandersetzen mit'), options: ['Bir şeylə ətraflı məşğul olmaq / to deal with', 'Ayrılmaq / to separate', 'Oturmaq / to sit down', 'Mübahisə etmək / to quarrel'], answer: 0 },
  { level: 'B2', question: gap('___ der hohen Nachfrage wurden zusätzliche Kurse angeboten.'), options: ['Trotz', 'Wegen', 'Statt', 'Während'], answer: 1 },
  { level: 'B2', question: correct(), options: ['Es wird erwartet, dass die Lieferung morgen eintrifft.', 'Es wird erwartet, dass die Lieferung morgen eintrifft wird.', 'Es erwartet, dass die Lieferung morgen eintreffen.', 'Es wird erwarten, dass die Lieferung morgen eintrifft.'], answer: 0 },
];

/** Examples only – edit or replace them in Admin → Client journey → Courses. */
const languageCourses: { name: string; provider: string; city: string | null; url: string; levels: string; format: 'online' | 'offline' | 'hybrid'; description: L }[] = [
  {
    name: 'Goethe-Institut Baku – Deutschkurse',
    provider: 'Goethe-Institut',
    city: 'Bakı',
    url: 'https://www.goethe.de/ins/az/az/spr/kur.html',
    levels: 'A1–C1',
    format: 'hybrid',
    description: {
      az: 'Nümunə: Goethe-Institutun rəsmi kursları və imtahanları (Goethe-Zertifikat A1–C2). Səfirliklər tərəfindən tanınan sertifikat. Məlumatı admin paneldə redaktə edin.',
      de: 'Beispiel: offizielle Kurse und Prüfungen des Goethe-Instituts (Goethe-Zertifikat A1–C2), von Botschaften anerkannt. Angaben im Adminbereich anpassen.',
      en: 'Example: official Goethe-Institut courses and exams (Goethe-Zertifikat A1–C2), recognised by embassies. Edit the details in the admin panel.',
      ru: 'Пример: официальные курсы и экзамены Гёте-Института (Goethe-Zertifikat A1–C2), признаваемые посольствами. Отредактируйте данные в админ-панели.',
    },
  },
  {
    name: 'Azərbaycan Dillər Universiteti – alman dili kursları',
    provider: 'ADU',
    city: 'Bakı',
    url: 'https://adu.edu.az',
    levels: 'A1–B2',
    format: 'offline',
    description: {
      az: 'Nümunə: ADU-nun nəzdində axşam və həftə sonu alman dili kursları. Qiymət və cədvəl üçün universitetlə əlaqə saxlayın.',
      de: 'Beispiel: Abend- und Wochenendkurse an der Aserbaidschanischen Sprachenuniversität. Preise und Zeiten bitte direkt erfragen.',
      en: 'Example: evening and weekend German courses at the Azerbaijan University of Languages. Contact the university for prices and schedule.',
      ru: 'Пример: вечерние и выходные курсы немецкого при Азербайджанском университете языков. Цены и расписание уточняйте в университете.',
    },
  },
  {
    name: 'Deutsche Welle – Deutsch lernen',
    provider: 'Deutsche Welle',
    city: null,
    url: 'https://learngerman.dw.com',
    levels: 'A1–C1',
    format: 'online',
    description: {
      az: 'Pulsuz onlayn kurslar, video və məşqlər (Nicos Weg A1–B1). Özünüz öyrənmək üçün ideal başlanğıc.',
      de: 'Kostenlose Online-Kurse, Videos und Übungen (Nicos Weg A1–B1). Ideal zum Selbstlernen.',
      en: 'Free online courses, videos and exercises (Nicos Weg A1–B1). An ideal start for self-study.',
      ru: 'Бесплатные онлайн-курсы, видео и упражнения (Nicos Weg A1–B1). Идеальное начало для самостоятельного обучения.',
    },
  },
  {
    name: 'VHS-Lernportal',
    provider: 'Deutscher Volkshochschul-Verband',
    city: null,
    url: 'https://vhs-lernportal.de',
    levels: 'A1–B2',
    format: 'online',
    description: {
      az: 'Alman xalq universitetlərinin pulsuz onlayn platforması; inteqrasiya kursuna hazırlıq üçün də uyğundur.',
      de: 'Kostenloses Online-Portal der Volkshochschulen; auch zur Vorbereitung auf den Integrationskurs geeignet.',
      en: 'Free online portal of the German adult education centres; also suitable to prepare for the integration course.',
      ru: 'Бесплатный онлайн-портал немецких народных университетов; подходит и для подготовки к интеграционному курсу.',
    },
  },
  {
    name: 'Busuu / Babbel – mobil tətbiqlər',
    provider: 'Busuu, Babbel',
    city: null,
    url: 'https://www.busuu.com/de',
    levels: 'A1–B2',
    format: 'online',
    description: {
      az: 'Nümunə: ödənişli mobil tətbiqlər; gündəlik 15 dəqiqəlik məşqlər üçün rahatdır. Sertifikat əvəzi deyil.',
      de: 'Beispiel: kostenpflichtige Apps für tägliche 15-Minuten-Einheiten. Kein Ersatz für ein Zertifikat.',
      en: 'Example: paid apps for daily 15-minute practice. Not a substitute for a certificate.',
      ru: 'Пример: платные приложения для ежедневных 15-минутных занятий. Не заменяют сертификат.',
    },
  },
];

export const seedJourney = async (prisma: PrismaClient) => {
  for (const [i, item] of onboardingItems.entries()) {
    await prisma.onboardingItem.upsert({
      where: { slug: item.slug },
      update: { icon: item.icon, title: item.title, body: item.body, link: item.link, dueDays: item.dueDays, sortOrder: i },
      create: { ...item, sortOrder: i, published: true },
    });
  }
  if ((await prisma.germanQuestion.count()) === 0) {
    await prisma.germanQuestion.createMany({ data: germanQuestions.map((q, i) => ({ ...q, sortOrder: i, published: true })) });
  }
  if ((await prisma.languageCourse.count()) === 0) {
    await prisma.languageCourse.createMany({ data: languageCourses.map((c, i) => ({ ...c, sortOrder: i, published: true })) });
  }
  return { onboardingItems: onboardingItems.length, germanQuestions: germanQuestions.length, languageCourses: languageCourses.length };
};
