/**
 * Driving licence guide for Azerbaijani licence holders (/driving-licence-germany). All six site languages.
 * Keys under dl.*. Costs are rough 2026 ranges (labelled as estimates on the page).
 */
const az = {
  dl: {
    heroTitle: 'Azərbaycan sürücülük vəsiqəsi Almaniyada',
    heroSubtitle: 'Azərbaycan vəsiqəsi ilə Almaniyada nə qədər sürmək olar, alman vəsiqəsini necə almaq olar, hansı sənədlər lazımdır, nə qədər başa gəlir — və yük maşını sürücüləri (C/CE) üçün nə vacibdir.',
    summary: {
      title: 'Qısaca',
      items: [
        'Yaşayış yeri qeydiyyatından (Anmeldung) sonra Azərbaycan vəsiqəsi ilə 6 ay sürmək olar.',
        'Azərbaycan FeV-in 11 saylı əlavəsində (Anlage 11) yoxdur: alman vəsiqəsi üçün nəzəri və praktiki imtahan verilməlidir.',
        'Müraciəti yaşadığınız şəhərin sürücülük vəsiqəsi idarəsinə (Fahrerlaubnisbehörde) tez verin — imtahanlar vaxt aparır.',
        'Peşəkar yük maşını sürücüsü üçün C/CE imtahanlarından əlavə Berufskraftfahrer ixtisası (IHK imtahanı) lazımdır.',
      ],
    },
    validity: {
      title: '6 ay qaydası',
      text: 'AB/AİZ-dən kənar ölkənin vəsiqəsi Almaniyada daimi yaşayış yeri (qeydiyyat) yarandıqdan sonra 6 ay etibarlıdır (§ 29 FeV). Bu müddətdə vəsiqə ilə birlikdə beynəlxalq sürücülük vəsiqəsi və ya almanca tərcümə daşıyın.',
      extension: 'İdarə müddəti 6 ay da uzada bilər, amma yalnız Almaniyada 12 aydan çox qalmayacağınızı sübut etsəniz. İşləmək üçün köçənlərə bu adətən aid deyil.',
      after: '6 aydan sonra alman vəsiqəsi olmadan sürmək — vəsiqəsiz sürmə sayılır (§ 21 StVG), cinayət məsuliyyəti və sığorta problemi deməkdir.',
    },
    exam: {
      title: 'Niyə imtahan lazımdır?',
      text: 'Anlage 11-dəki ölkələrin (məsələn, Ukrayna, Serbiya, Yaponiya) vəsiqələri imtahansız və ya qismən imtahanla dəyişdirilir. Azərbaycan bu siyahıda yoxdur, buna görə dəyişdirmək istədiyiniz hər kateqoriya üçün nəzəri və praktiki imtahan lazımdır (§ 31 FeV). Məcburi dərs saatları yoxdur, amma imtahana sürücülük məktəbi (Fahrschule) vasitəsilə yazılırsınız və onun maşınından istifadə edirsiniz — praktikada bir neçə dərs götürmək məsləhətdir.',
    },
    steps: {
      title: 'Addım-addım',
      items: [
        { t: 'Qeydiyyat (Anmeldung)', d: 'Gəlişdən sonra yaşayış yerini qeydiyyata salın — 6 ay bu tarixdən sayılır.' },
        { t: 'Sürücülük məktəbi seçin', d: 'Fahrschule ilə müqavilə bağlayın: nəzəriyyə materialı, praktiki dərslər və imtahanlara yazılma.' },
        { t: 'Göz testi və ilk yardım kursu', d: 'Sehtest (optika və ya həkim) və 9 saatlıq Erste-Hilfe kursu; C/CE üçün həkim və göz müayinəsi.' },
        { t: 'Müraciət', d: 'Fahrerlaubnisbehörde-də ərizə: sənədlər, şəkil, orijinal vəsiqə və tərcümə.' },
        { t: 'Nəzəri imtahan', d: 'TÜV / DEKRA-da kompüterdə test; bir neçə dildə, o cümlədən rus və türk dilində verilə bilər.' },
        { t: 'Praktiki imtahan', d: 'Məktəbin maşını ilə imtahançı ilə yol imtahanı.' },
        { t: 'Alman vəsiqəsi', d: 'Yeni vəsiqəni alarkən Azərbaycan vəsiqəsini təhvil verirsiniz.' },
      ],
    },
    docs: {
      title: 'Sənədlər',
      items: [
        'Pasport və yaşayış icazəsi (Aufenthaltstitel)',
        'Qeydiyyat arayışı (Meldebescheinigung)',
        'Biometrik pasport şəkli',
        'Orijinal Azərbaycan sürücülük vəsiqəsi və almanca tərcüməsi (andlı tərcüməçi və ya ADAC; biz tərcümə etmirik)',
        'Göz testi arayışı (Sehtest)',
        'İlk yardım kursu sertifikatı (Erste Hilfe)',
        'Sürücülük məktəbinin və imtahan mərkəzinin məlumatları',
        'C/CE üçün: həkim müayinəsi (Anlage 5) və göz həkimi arayışı (Anlage 6)',
      ],
    },
    costs: {
      title: 'Təxmini xərclər (B kateqoriyası)',
      items: [
        { label: 'İdarənin rüsumu', value: '≈ 40–50 €' },
        { label: 'Göz testi, ilk yardım, şəkil', value: '≈ 70–110 €' },
        { label: 'Vəsiqənin tərcüməsi', value: '≈ 40–80 €' },
        { label: 'TÜV/DEKRA imtahan rüsumları', value: '≈ 160–200 €' },
        { label: 'Sürücülük məktəbi (əsas haqq + dərslər + imtahan günü)', value: '≈ 500–1 500 €' },
      ],
      total: 'Cəmi adətən ≈ 800–2 000 € — nə qədər dərs lazım olmasından asılıdır.',
      note: 'Təxminlərdir; qiymətlər şəhərə və məktəbə görə dəyişir.',
    },
    truck: {
      title: 'Yük maşını sürücüləri (C / CE)',
      text: 'Azərbaycan C/CE vəsiqəsi də imtahansız dəyişdirilmir: hər kateqoriya üçün nəzəri və praktiki imtahan, həkim və göz müayinəsi lazımdır (C üçün əvvəlcə B lazımdır). Peşəkar sürücülük üçün əlavə olaraq:',
      items: [
        'Berufskraftfahrer ixtisası: sürətləndirilmiş əsas ixtisas — tanınmış təlim mərkəzində 140 saat və IHK-da 90 dəqiqəlik nəzəri imtahan.',
        'Sonra Almaniyada sübut kimi Fahrerqualifizierungsnachweis (FQN) verilir (§ 7 BKrFQG); AB sürücülük vəsiqəsindəki 95 kodu da qəbul olunur. Hər 5 ildən bir 35 saat təkmilləşdirmə.',
        'C/CE vəsiqəsi 5 il etibarlıdır, uzadılması üçün yenidən tibbi arayış lazımdır.',
        'Təxmini xərc: C/CE imtahanları ilə hər kateqoriya üçün ≈ 2 000–5 000 €, ixtisas kursu ≈ 2 000–4 000 €. Çox vaxt işəgötürən bir hissəni ödəyir.',
      ],
      guide: 'Sürücülər üçün bələdçi',
      jobs: 'Sürücü vakansiyaları',
    },
    sources: 'Rəsmi mənbələr',
    asOf: 'Məlumat {{date}} tarixinə görə.',
    disclaimer: 'Ümumi məlumatdır, hüquqi məsləhət deyil. Qərarı yerli Fahrerlaubnisbehörde verir; rüsumlar və tələblər şəhərə görə fərqlənə bilər.',
    faq: {
      title: 'Tez-tez verilən suallar',
      items: [
        { q: 'Azərbaycan vəsiqəsi ilə Almaniyada nə qədər sürə bilərəm?', a: 'Yaşayış yeri qeydiyyatından sonra 6 ay. Uzatma yalnız Almaniyada 12 aydan çox qalmayacağınızı sübut etsəniz mümkündür.' },
        { q: 'Azərbaycan vəsiqəsini imtahansız dəyişmək olarmı?', a: 'Xeyr. Azərbaycan FeV Anlage 11 siyahısında yoxdur, buna görə nəzəri və praktiki imtahan verilməlidir. Məcburi dərs saatı isə yoxdur.' },
        { q: 'Nəzəri imtahanı hansı dildə vermək olar?', a: 'Almanca ilə yanaşı bir neçə xarici dildə, o cümlədən rus və türk dilində. Sürücülük məktəbindən dəqiqləşdirin.' },
        { q: 'Yük maşını sürücüsü kimi Almaniyada işləmək üçün nə lazımdır?', a: 'Alman C/CE vəsiqəsi (imtahanlarla) və Berufskraftfahrer ixtisası (140 saat + IHK imtahanı). Biz sürücülər üçün işəgötürən tapmağa və viza sənədlərini hazırlamağa kömək edirik.' },
      ],
    },
    cta: { title: 'Almaniyada sürücü işi', text: 'C/CE sürücüləri üçün vakansiyalara baxın və qeydiyyatdan keçin — işəgötürən tapmağa və viza sənədlərini hazırlamağa kömək edirik.', primary: 'Qeydiyyatdan keç', secondary: 'Vakansiyalar' },
  },
};

type Copy = typeof az;

const de: Copy = {
  dl: {
    heroTitle: 'Aserbaidschanischer Führerschein in Deutschland',
    heroSubtitle: 'Wie lange Sie mit dem aserbaidschanischen Führerschein in Deutschland fahren dürfen, wie Sie den deutschen bekommen, welche Unterlagen nötig sind, was es kostet – und was für Lkw-Fahrer (C/CE) wichtig ist.',
    summary: {
      title: 'Kurz gesagt',
      items: [
        'Nach der Anmeldung des Wohnsitzes dürfen Sie 6 Monate mit dem aserbaidschanischen Führerschein fahren.',
        'Aserbaidschan steht nicht in Anlage 11 FeV: Für den deutschen Führerschein sind Theorie- und Praxisprüfung nötig.',
        'Stellen Sie den Antrag früh bei der Fahrerlaubnisbehörde Ihres Wohnorts – die Prüfungen brauchen Zeit.',
        'Berufskraftfahrer brauchen neben den C/CE-Prüfungen die Berufskraftfahrerqualifikation (IHK-Prüfung).',
      ],
    },
    validity: {
      title: 'Die 6-Monats-Regel',
      text: 'Eine Fahrerlaubnis aus einem Staat außerhalb von EU/EWR gilt nach Begründung des ordentlichen Wohnsitzes in Deutschland noch 6 Monate (§ 29 FeV). Führen Sie in dieser Zeit einen internationalen Führerschein oder eine deutsche Übersetzung mit.',
      extension: 'Die Behörde kann um bis zu 6 Monate verlängern – aber nur, wenn Sie glaubhaft machen, dass Sie nicht länger als 12 Monate in Deutschland wohnen. Wer zum Arbeiten kommt, erfüllt das meist nicht.',
      after: 'Nach den 6 Monaten ohne deutsche Fahrerlaubnis zu fahren, ist Fahren ohne Fahrerlaubnis (§ 21 StVG) – eine Straftat, mit Folgen für die Versicherung.',
    },
    exam: {
      title: 'Warum eine Prüfung?',
      text: 'Führerscheine aus Staaten der Anlage 11 (z. B. Ukraine, Serbien, Japan) werden ohne oder mit Teilprüfung umgeschrieben. Aserbaidschan steht nicht auf der Liste, daher sind für jede Klasse Theorie- und Praxisprüfung nötig (§ 31 FeV). Pflichtstunden gibt es nicht, aber zur Prüfung meldet Sie eine Fahrschule an, deren Fahrzeug Sie nutzen – einige Fahrstunden sind in der Praxis ratsam.',
    },
    steps: {
      title: 'Schritt für Schritt',
      items: [
        { t: 'Anmeldung', d: 'Nach der Einreise den Wohnsitz anmelden – ab diesem Tag laufen die 6 Monate.' },
        { t: 'Fahrschule wählen', d: 'Vertrag mit einer Fahrschule: Lernmaterial, Fahrstunden und Anmeldung zu den Prüfungen.' },
        { t: 'Sehtest und Erste Hilfe', d: 'Sehtest (Optiker oder Arzt) und Erste-Hilfe-Kurs (9 Unterrichtseinheiten); für C/CE ärztliche Untersuchung und Augenarzt.' },
        { t: 'Antrag', d: 'Antrag bei der Fahrerlaubnisbehörde: Unterlagen, Foto, Original-Führerschein und Übersetzung.' },
        { t: 'Theorieprüfung', d: 'Am Computer bei TÜV / DEKRA; in mehreren Sprachen möglich, u. a. Russisch und Türkisch.' },
        { t: 'Praktische Prüfung', d: 'Fahrprüfung mit Prüfer im Fahrzeug der Fahrschule.' },
        { t: 'Deutscher Führerschein', d: 'Bei der Ausgabe geben Sie den aserbaidschanischen Führerschein ab.' },
      ],
    },
    docs: {
      title: 'Unterlagen',
      items: [
        'Reisepass und Aufenthaltstitel',
        'Meldebescheinigung',
        'Biometrisches Passfoto',
        'Original-Führerschein aus Aserbaidschan und deutsche Übersetzung (vereidigter Übersetzer oder ADAC; wir übersetzen nicht)',
        'Sehtestbescheinigung',
        'Nachweis Erste-Hilfe-Kurs',
        'Angaben zu Fahrschule und Prüfstelle',
        'Für C/CE: ärztliche Bescheinigung (Anlage 5) und augenärztliches Gutachten (Anlage 6)',
      ],
    },
    costs: {
      title: 'Geschätzte Kosten (Klasse B)',
      items: [
        { label: 'Gebühr der Behörde', value: '≈ 40–50 €' },
        { label: 'Sehtest, Erste Hilfe, Foto', value: '≈ 70–110 €' },
        { label: 'Übersetzung des Führerscheins', value: '≈ 40–80 €' },
        { label: 'Prüfungsgebühren TÜV/DEKRA', value: '≈ 160–200 €' },
        { label: 'Fahrschule (Grundbetrag, Fahrstunden, Prüfungsfahrt)', value: '≈ 500–1.500 €' },
      ],
      total: 'Insgesamt meist ≈ 800–2.000 € – je nachdem, wie viele Fahrstunden nötig sind.',
      note: 'Schätzwerte; die Preise unterscheiden sich nach Stadt und Fahrschule.',
    },
    truck: {
      title: 'Lkw-Fahrer (C / CE)',
      text: 'Auch C/CE aus Aserbaidschan wird nicht ohne Prüfung umgeschrieben: Theorie- und Praxisprüfung je Klasse, ärztliche und augenärztliche Untersuchung (C setzt B voraus). Für die gewerbliche Fahrt zusätzlich:',
      items: [
        'Berufskraftfahrerqualifikation: beschleunigte Grundqualifikation – 140 Stunden an einer anerkannten Ausbildungsstätte und 90-minütige Theorieprüfung bei der IHK.',
        'Danach wird in Deutschland der Fahrerqualifizierungsnachweis (FQN) ausgestellt (§ 7 BKrFQG); eine Schlüsselzahl 95 in einem EU-Führerschein gilt ebenfalls. Alle 5 Jahre 35 Stunden Weiterbildung.',
        'C/CE gilt 5 Jahre; für die Verlängerung ist erneut eine ärztliche Bescheinigung nötig.',
        'Geschätzte Kosten: C/CE mit Prüfungen ≈ 2.000–5.000 € je Klasse, Qualifikation ≈ 2.000–4.000 €. Oft übernimmt der Arbeitgeber einen Teil.',
      ],
      guide: 'Ratgeber für Fahrer',
      jobs: 'Stellen für Fahrer',
    },
    sources: 'Amtliche Quellen',
    asOf: 'Stand: {{date}}.',
    disclaimer: 'Allgemeine Information, keine Rechtsberatung. Es entscheidet die örtliche Fahrerlaubnisbehörde; Gebühren und Anforderungen können je nach Stadt abweichen.',
    faq: {
      title: 'Häufige Fragen',
      items: [
        { q: 'Wie lange darf ich mit dem aserbaidschanischen Führerschein in Deutschland fahren?', a: '6 Monate ab Anmeldung des Wohnsitzes. Eine Verlängerung gibt es nur, wenn Sie nicht länger als 12 Monate in Deutschland wohnen werden.' },
        { q: 'Kann ich den aserbaidschanischen Führerschein ohne Prüfung umschreiben?', a: 'Nein. Aserbaidschan steht nicht in Anlage 11 FeV, daher sind Theorie- und Praxisprüfung nötig. Pflichtstunden gibt es aber nicht.' },
        { q: 'In welcher Sprache kann ich die Theorieprüfung machen?', a: 'Außer auf Deutsch in mehreren Fremdsprachen, u. a. Russisch und Türkisch. Fragen Sie Ihre Fahrschule.' },
        { q: 'Was brauche ich, um in Deutschland als Lkw-Fahrer zu arbeiten?', a: 'Den deutschen Führerschein C/CE (mit Prüfungen) und die Berufskraftfahrerqualifikation (140 Stunden + IHK-Prüfung). Wir helfen Fahrern bei der Arbeitgebersuche und bereiten die Visumunterlagen vor.' },
      ],
    },
    cta: { title: 'Fahrerjobs in Deutschland', text: 'Sehen Sie sich Stellen für C/CE-Fahrer an und registrieren Sie sich – wir helfen bei der Arbeitgebersuche und bereiten die Visumunterlagen vor.', primary: 'Registrieren', secondary: 'Stellenangebote' },
  },
};

const en: Copy = {
  dl: {
    heroTitle: 'Azerbaijani driving licence in Germany',
    heroSubtitle: 'How long you may drive in Germany on an Azerbaijani licence, how to get a German one, which documents you need, what it costs — and what matters for truck drivers (C/CE).',
    summary: {
      title: 'In short',
      items: [
        'After registering your residence (Anmeldung) you may drive for 6 months on your Azerbaijani licence.',
        'Azerbaijan is not listed in Annex 11 of the FeV: a German licence requires a theory and a practical test.',
        'Apply early at the driving licence office (Fahrerlaubnisbehörde) where you live — the tests take time.',
        'Professional truck drivers need, besides the C/CE tests, the professional driver qualification (IHK exam).',
      ],
    },
    validity: {
      title: 'The 6-month rule',
      text: 'A licence from outside the EU/EEA remains valid for 6 months after you establish your ordinary residence in Germany (§ 29 FeV). During that time carry an international driving permit or a German translation with it.',
      extension: 'The authority can extend this by up to 6 months — but only if you credibly show you will not live in Germany for more than 12 months. People moving for work usually do not qualify.',
      after: 'Driving after the 6 months without a German licence is driving without a licence (§ 21 StVG) — a criminal offence, with insurance consequences.',
    },
    exam: {
      title: 'Why a test?',
      text: 'Licences from Annex 11 countries (e.g. Ukraine, Serbia, Japan) are exchanged with no or partial testing. Azerbaijan is not on the list, so every class you want needs a theory and a practical test (§ 31 FeV). There are no compulsory lessons, but a driving school (Fahrschule) registers you for the test and provides the car — a few lessons are advisable in practice.',
    },
    steps: {
      title: 'Step by step',
      items: [
        { t: 'Registration (Anmeldung)', d: 'Register your address after arrival — the 6 months run from this day.' },
        { t: 'Choose a driving school', d: 'A contract with a Fahrschule: learning material, lessons and registration for the tests.' },
        { t: 'Eye test and first aid', d: 'Eye test (optician or doctor) and a first-aid course (9 teaching units); for C/CE a medical and an eye examination.' },
        { t: 'Application', d: 'Apply at the Fahrerlaubnisbehörde: documents, photo, original licence and translation.' },
        { t: 'Theory test', d: 'On a computer at TÜV / DEKRA; available in several languages including Russian and Turkish.' },
        { t: 'Practical test', d: 'Driving test with an examiner in the school’s car.' },
        { t: 'German licence', d: 'You hand in the Azerbaijani licence when you collect the new one.' },
      ],
    },
    docs: {
      title: 'Documents',
      items: [
        'Passport and residence permit',
        'Registration certificate (Meldebescheinigung)',
        'Biometric passport photo',
        'Original Azerbaijani licence and a German translation (sworn translator or ADAC; we do not translate)',
        'Eye test certificate (Sehtest)',
        'First-aid course certificate',
        'Details of the driving school and the test centre',
        'For C/CE: medical certificate (Annex 5) and eye specialist report (Annex 6)',
      ],
    },
    costs: {
      title: 'Estimated costs (class B)',
      items: [
        { label: 'Authority fee', value: '≈ €40–50' },
        { label: 'Eye test, first aid, photo', value: '≈ €70–110' },
        { label: 'Licence translation', value: '≈ €40–80' },
        { label: 'TÜV/DEKRA test fees', value: '≈ €160–200' },
        { label: 'Driving school (base fee, lessons, test drive)', value: '≈ €500–1,500' },
      ],
      total: 'Usually ≈ €800–2,000 in total — depending on how many lessons you need.',
      note: 'Estimates; prices vary by city and school.',
    },
    truck: {
      title: 'Truck drivers (C / CE)',
      text: 'An Azerbaijani C/CE licence is not exchanged without tests either: a theory and a practical test per class plus a medical and an eye examination (C requires B). For professional driving you also need:',
      items: [
        'Professional driver qualification: accelerated initial qualification — 140 hours at a recognised training centre and a 90-minute theory exam at the IHK.',
        'Then Germany issues the driver qualification card (Fahrerqualifizierungsnachweis, FQN; § 7 BKrFQG); code 95 in an EU driving licence is also accepted. 35 hours of further training every 5 years.',
        'C/CE is valid for 5 years; renewal needs a new medical certificate.',
        'Estimated costs: C/CE with tests ≈ €2,000–5,000 per class, qualification ≈ €2,000–4,000. Employers often pay part of it.',
      ],
      guide: 'Guide for drivers',
      jobs: 'Driver vacancies',
    },
    sources: 'Official sources',
    asOf: 'As of {{date}}.',
    disclaimer: 'General information, not legal advice. The local Fahrerlaubnisbehörde decides; fees and requirements can differ by city.',
    faq: {
      title: 'Frequently asked questions',
      items: [
        { q: 'How long can I drive in Germany on an Azerbaijani licence?', a: '6 months from registering your residence. An extension is only possible if you will not live in Germany for more than 12 months.' },
        { q: 'Can I exchange my Azerbaijani licence without a test?', a: 'No. Azerbaijan is not in Annex 11 of the FeV, so a theory and a practical test are required. There are no compulsory lessons, though.' },
        { q: 'In which language can I take the theory test?', a: 'Besides German in several foreign languages, including Russian and Turkish. Ask your driving school.' },
        { q: 'What do I need to work as a truck driver in Germany?', a: 'A German C/CE licence (with tests) and the professional driver qualification (140 hours + IHK exam). We help drivers find an employer and prepare the visa documents.' },
      ],
    },
    cta: { title: 'Driver jobs in Germany', text: 'Browse vacancies for C/CE drivers and register — we help you find an employer and prepare your visa documents.', primary: 'Register', secondary: 'Vacancies' },
  },
};

const ru: Copy = {
  dl: {
    heroTitle: 'Азербайджанские права в Германии',
    heroSubtitle: 'Сколько можно ездить в Германии с азербайджанскими правами, как получить немецкие, какие нужны документы, сколько это стоит — и что важно водителям грузовиков (C/CE).',
    summary: {
      title: 'Коротко',
      items: [
        'После регистрации по месту жительства (Anmeldung) можно 6 месяцев ездить с азербайджанскими правами.',
        'Азербайджана нет в приложении 11 FeV (Anlage 11): для немецких прав нужны теоретический и практический экзамены.',
        'Подавайте заявление в ведомство по водительским правам (Fahrerlaubnisbehörde) пораньше — экзамены требуют времени.',
        'Профессиональным водителям грузовиков кроме экзаменов C/CE нужна квалификация Berufskraftfahrer (экзамен в IHK).',
      ],
    },
    validity: {
      title: 'Правило 6 месяцев',
      text: 'Права страны вне ЕС/ЕЭЗ действуют в Германии 6 месяцев после появления постоянного места жительства (§ 29 FeV). В это время возите с собой международное водительское удостоверение или немецкий перевод.',
      extension: 'Ведомство может продлить срок ещё до 6 месяцев — но только если вы докажете, что проживёте в Германии не больше 12 месяцев. Тем, кто переезжает на работу, это обычно не подходит.',
      after: 'Ездить после 6 месяцев без немецких прав — это езда без прав (§ 21 StVG): уголовное правонарушение и проблемы со страховкой.',
    },
    exam: {
      title: 'Почему нужен экзамен?',
      text: 'Права стран из Anlage 11 (например, Украины, Сербии, Японии) меняют без экзаменов или с частичным экзаменом. Азербайджана в списке нет, поэтому для каждой категории нужны теория и практика (§ 31 FeV). Обязательных часов нет, но на экзамен вас записывает автошкола (Fahrschule), и экзамен идёт на её машине — на практике стоит взять несколько уроков.',
    },
    steps: {
      title: 'Шаг за шагом',
      items: [
        { t: 'Регистрация (Anmeldung)', d: 'После приезда зарегистрируйте адрес — 6 месяцев считаются с этого дня.' },
        { t: 'Выбор автошколы', d: 'Договор с Fahrschule: материалы, уроки вождения и запись на экзамены.' },
        { t: 'Проверка зрения и первая помощь', d: 'Sehtest (оптика или врач) и курс первой помощи (9 занятий); для C/CE — медосмотр и окулист.' },
        { t: 'Заявление', d: 'Заявление в Fahrerlaubnisbehörde: документы, фото, оригинал прав и перевод.' },
        { t: 'Теоретический экзамен', d: 'На компьютере в TÜV / DEKRA; можно на нескольких языках, в том числе на русском и турецком.' },
        { t: 'Практический экзамен', d: 'Экзамен по вождению с экзаменатором на машине автошколы.' },
        { t: 'Немецкие права', d: 'При получении новых прав азербайджанские сдаются.' },
      ],
    },
    docs: {
      title: 'Документы',
      items: [
        'Паспорт и вид на жительство',
        'Справка о регистрации (Meldebescheinigung)',
        'Биометрическое фото',
        'Оригинал азербайджанских прав и немецкий перевод (присяжный переводчик или ADAC; мы переводы не делаем)',
        'Справка о проверке зрения (Sehtest)',
        'Сертификат курса первой помощи',
        'Данные автошколы и экзаменационного центра',
        'Для C/CE: медицинская справка (Anlage 5) и заключение окулиста (Anlage 6)',
      ],
    },
    costs: {
      title: 'Примерные расходы (категория B)',
      items: [
        { label: 'Сбор ведомства', value: '≈ 40–50 €' },
        { label: 'Проверка зрения, первая помощь, фото', value: '≈ 70–110 €' },
        { label: 'Перевод прав', value: '≈ 40–80 €' },
        { label: 'Сборы за экзамены TÜV/DEKRA', value: '≈ 160–200 €' },
        { label: 'Автошкола (базовый взнос, уроки, экзаменационная поездка)', value: '≈ 500–1 500 €' },
      ],
      total: 'Итого обычно ≈ 800–2 000 € — в зависимости от числа уроков.',
      note: 'Это оценки; цены зависят от города и автошколы.',
    },
    truck: {
      title: 'Водители грузовиков (C / CE)',
      text: 'Азербайджанские C/CE тоже не меняются без экзаменов: теория и практика по каждой категории, медосмотр и окулист (для C нужна B). Для работы водителем дополнительно:',
      items: [
        'Квалификация Berufskraftfahrer: ускоренная базовая квалификация — 140 часов в аккредитованном учебном центре и 90-минутный теоретический экзамен в IHK.',
        'Затем в Германии выдают Fahrerqualifizierungsnachweis (FQN; § 7 BKrFQG); код 95 в правах страны ЕС тоже признаётся. Каждые 5 лет — 35 часов повышения квалификации.',
        'Права C/CE действуют 5 лет; для продления снова нужна медицинская справка.',
        'Примерно: C/CE с экзаменами ≈ 2 000–5 000 € за категорию, квалификация ≈ 2 000–4 000 €. Часто часть оплачивает работодатель.',
      ],
      guide: 'Гид для водителей',
      jobs: 'Вакансии водителей',
    },
    sources: 'Официальные источники',
    asOf: 'Данные на {{date}}.',
    disclaimer: 'Общая информация, а не юридическая консультация. Решение принимает местная Fahrerlaubnisbehörde; сборы и требования могут отличаться по городам.',
    faq: {
      title: 'Частые вопросы',
      items: [
        { q: 'Сколько можно ездить в Германии с азербайджанскими правами?', a: '6 месяцев с регистрации по месту жительства. Продление возможно, только если вы проживёте в Германии не более 12 месяцев.' },
        { q: 'Можно ли поменять азербайджанские права без экзамена?', a: 'Нет. Азербайджана нет в Anlage 11 FeV, поэтому нужны теоретический и практический экзамены. Обязательных часов вождения при этом нет.' },
        { q: 'На каком языке можно сдать теорию?', a: 'Кроме немецкого — на нескольких иностранных, в том числе на русском и турецком. Уточните в автошколе.' },
        { q: 'Что нужно, чтобы работать водителем грузовика в Германии?', a: 'Немецкие права C/CE (с экзаменами) и квалификация Berufskraftfahrer (140 часов + экзамен IHK). Мы помогаем водителям найти работодателя и готовим документы на визу.' },
      ],
    },
    cta: { title: 'Работа водителем в Германии', text: 'Посмотрите вакансии для водителей C/CE и зарегистрируйтесь — мы поможем найти работодателя и подготовим документы на визу.', primary: 'Зарегистрироваться', secondary: 'Вакансии' },
  },
};

const tr: Copy = {
  dl: {
    heroTitle: 'Azerbaycan ehliyeti Almanya’da',
    heroSubtitle: 'Azerbaycan ehliyetiyle Almanya’da ne kadar araç kullanabileceğiniz, Alman ehliyetini nasıl alacağınız, gerekli belgeler, maliyet — ve tır şoförleri (C/CE) için önemli noktalar.',
    summary: {
      title: 'Kısaca',
      items: [
        'İkamet kaydından (Anmeldung) sonra Azerbaycan ehliyetiyle 6 ay araç kullanabilirsiniz.',
        'Azerbaycan FeV Ek 11’de (Anlage 11) yok: Alman ehliyeti için teorik ve pratik sınav gerekir.',
        'Başvuruyu oturduğunuz yerin ehliyet dairesine (Fahrerlaubnisbehörde) erken yapın — sınavlar zaman alır.',
        'Profesyonel tır şoförlerine C/CE sınavlarının yanında Berufskraftfahrer yeterliliği (IHK sınavı) gerekir.',
      ],
    },
    validity: {
      title: '6 ay kuralı',
      text: 'AB/AEA dışından bir ehliyet, Almanya’da olağan ikamet başladıktan sonra 6 ay geçerlidir (§ 29 FeV). Bu sürede yanınızda uluslararası ehliyet veya Almanca tercüme bulundurun.',
      extension: 'Daire süreyi 6 ay daha uzatabilir — ama yalnızca Almanya’da 12 aydan uzun kalmayacağınızı inandırıcı şekilde gösterirseniz. Çalışmak için gelenler genelde bu şartı sağlamaz.',
      after: '6 aydan sonra Alman ehliyeti olmadan araç kullanmak ehliyetsiz sürüş sayılır (§ 21 StVG) — suçtur ve sigorta sorunlarına yol açar.',
    },
    exam: {
      title: 'Neden sınav?',
      text: 'Ek 11’deki ülkelerin (ör. Ukrayna, Sırbistan, Japonya) ehliyetleri sınavsız veya kısmi sınavla değiştirilir. Azerbaycan listede olmadığı için istediğiniz her sınıf için teorik ve pratik sınav gerekir (§ 31 FeV). Zorunlu ders saati yok, ama sınava sizi bir sürücü kursu (Fahrschule) kaydeder ve onun aracını kullanırsınız — pratikte birkaç ders almak önerilir.',
    },
    steps: {
      title: 'Adım adım',
      items: [
        { t: 'İkamet kaydı (Anmeldung)', d: 'Gelişten sonra adresinizi kaydettirin — 6 ay bu günden itibaren sayılır.' },
        { t: 'Sürücü kursu seçin', d: 'Fahrschule ile sözleşme: ders materyali, direksiyon dersleri ve sınav kaydı.' },
        { t: 'Göz testi ve ilk yardım', d: 'Sehtest (optisyen veya doktor) ve ilk yardım kursu (9 ders birimi); C/CE için sağlık ve göz muayenesi.' },
        { t: 'Başvuru', d: 'Fahrerlaubnisbehörde’ye başvuru: belgeler, fotoğraf, orijinal ehliyet ve tercüme.' },
        { t: 'Teorik sınav', d: 'TÜV / DEKRA’da bilgisayarda; Rusça ve Türkçe dahil birçok dilde yapılabilir.' },
        { t: 'Pratik sınav', d: 'Kursun aracıyla sınav yetkilisi eşliğinde direksiyon sınavı.' },
        { t: 'Alman ehliyeti', d: 'Yeni ehliyeti alırken Azerbaycan ehliyetini teslim edersiniz.' },
      ],
    },
    docs: {
      title: 'Belgeler',
      items: [
        'Pasaport ve oturum izni',
        'İkamet belgesi (Meldebescheinigung)',
        'Biyometrik fotoğraf',
        'Orijinal Azerbaycan ehliyeti ve Almanca tercümesi (yeminli tercüman veya ADAC; biz tercüme yapmıyoruz)',
        'Göz testi belgesi (Sehtest)',
        'İlk yardım kursu belgesi',
        'Sürücü kursu ve sınav merkezi bilgileri',
        'C/CE için: sağlık raporu (Ek 5) ve göz doktoru raporu (Ek 6)',
      ],
    },
    costs: {
      title: 'Tahmini maliyet (B sınıfı)',
      items: [
        { label: 'Daire harcı', value: '≈ 40–50 €' },
        { label: 'Göz testi, ilk yardım, fotoğraf', value: '≈ 70–110 €' },
        { label: 'Ehliyet tercümesi', value: '≈ 40–80 €' },
        { label: 'TÜV/DEKRA sınav ücretleri', value: '≈ 160–200 €' },
        { label: 'Sürücü kursu (temel ücret, dersler, sınav sürüşü)', value: '≈ 500–1.500 €' },
      ],
      total: 'Toplam genelde ≈ 800–2.000 € — kaç ders gerektiğine bağlı.',
      note: 'Tahminidir; fiyatlar şehre ve kursa göre değişir.',
    },
    truck: {
      title: 'Tır şoförleri (C / CE)',
      text: 'Azerbaycan C/CE ehliyeti de sınavsız değiştirilmez: her sınıf için teorik ve pratik sınav, sağlık ve göz muayenesi (C için önce B gerekir). Profesyonel sürüş için ayrıca:',
      items: [
        'Berufskraftfahrer yeterliliği: hızlandırılmış temel yeterlilik — tanınmış bir eğitim merkezinde 140 saat ve IHK’da 90 dakikalık teorik sınav.',
        'Ardından Almanya’da Fahrerqualifizierungsnachweis (FQN; § 7 BKrFQG) düzenlenir; bir AB ehliyetindeki 95 kodu da geçerlidir. Her 5 yılda 35 saat eğitim.',
        'C/CE 5 yıl geçerlidir; yenileme için yine sağlık raporu gerekir.',
        'Tahmini maliyet: sınavlarla C/CE sınıf başına ≈ 2.000–5.000 €, yeterlilik ≈ 2.000–4.000 €. Çoğu zaman işveren bir kısmını öder.',
      ],
      guide: 'Şoförler için rehber',
      jobs: 'Şoför ilanları',
    },
    sources: 'Resmî kaynaklar',
    asOf: '{{date}} itibarıyla.',
    disclaimer: 'Genel bilgidir, hukuki danışmanlık değildir. Kararı yerel Fahrerlaubnisbehörde verir; ücretler ve şartlar şehre göre farklı olabilir.',
    faq: {
      title: 'Sık sorulan sorular',
      items: [
        { q: 'Azerbaycan ehliyetiyle Almanya’da ne kadar araç kullanabilirim?', a: 'İkamet kaydından itibaren 6 ay. Uzatma yalnızca Almanya’da 12 aydan uzun kalmayacaksanız mümkündür.' },
        { q: 'Azerbaycan ehliyetini sınavsız değiştirebilir miyim?', a: 'Hayır. Azerbaycan FeV Ek 11’de yok, bu yüzden teorik ve pratik sınav gerekir. Zorunlu ders saati ise yok.' },
        { q: 'Teorik sınava hangi dilde girebilirim?', a: 'Almancanın yanında Rusça ve Türkçe dahil birkaç yabancı dilde. Sürücü kursunuza sorun.' },
        { q: 'Almanya’da tır şoförü olarak çalışmak için ne gerekir?', a: 'Alman C/CE ehliyeti (sınavlarla) ve Berufskraftfahrer yeterliliği (140 saat + IHK sınavı). Şoförlere işveren bulmada yardım ediyor, vize belgelerini hazırlıyoruz.' },
      ],
    },
    cta: { title: 'Almanya’da şoförlük işleri', text: 'C/CE şoför ilanlarına göz atın ve kayıt olun — işveren bulmanıza yardım ediyor, vize belgelerinizi hazırlıyoruz.', primary: 'Kayıt ol', secondary: 'İlanlar' },
  },
};

const uk: Copy = {
  dl: {
    heroTitle: 'Азербайджанське посвідчення водія в Німеччині',
    heroSubtitle: 'Скільки можна їздити в Німеччині з азербайджанським посвідченням, як отримати німецьке, які потрібні документи, скільки це коштує — і що важливо водіям вантажівок (C/CE).',
    summary: {
      title: 'Коротко',
      items: [
        'Після реєстрації місця проживання (Anmeldung) можна 6 місяців їздити з азербайджанським посвідченням.',
        'Азербайджану немає в додатку 11 FeV (Anlage 11): для німецького посвідчення потрібні теоретичний і практичний іспити.',
        'Подавайте заяву до відомства з посвідчень водія (Fahrerlaubnisbehörde) завчасно — іспити потребують часу.',
        'Професійним водіям вантажівок окрім іспитів C/CE потрібна кваліфікація Berufskraftfahrer (іспит в IHK).',
      ],
    },
    validity: {
      title: 'Правило 6 місяців',
      text: 'Посвідчення країни поза ЄС/ЄЕЗ дійсне в Німеччині 6 місяців після появи постійного місця проживання (§ 29 FeV). У цей час возіть із собою міжнародне посвідчення або німецький переклад.',
      extension: 'Відомство може продовжити строк ще до 6 місяців — але лише якщо ви доведете, що проживатимете в Німеччині не довше 12 місяців. Тим, хто переїжджає на роботу, це зазвичай не підходить.',
      after: 'Їздити після 6 місяців без німецького посвідчення — це керування без права (§ 21 StVG): кримінальне правопорушення та проблеми зі страховкою.',
    },
    exam: {
      title: 'Чому потрібен іспит?',
      text: 'Посвідчення країн з Anlage 11 (наприклад, України, Сербії, Японії) обмінюють без іспитів або з частковим іспитом. Азербайджану в списку немає, тому для кожної категорії потрібні теорія й практика (§ 31 FeV). Обов’язкових годин немає, але на іспит вас записує автошкола (Fahrschule), і іспит відбувається на її авто — на практиці варто взяти кілька уроків.',
    },
    steps: {
      title: 'Крок за кроком',
      items: [
        { t: 'Реєстрація (Anmeldung)', d: 'Після приїзду зареєструйте адресу — 6 місяців рахуються від цього дня.' },
        { t: 'Вибір автошколи', d: 'Договір із Fahrschule: матеріали, уроки водіння й запис на іспити.' },
        { t: 'Перевірка зору та перша допомога', d: 'Sehtest (оптика або лікар) і курс першої допомоги (9 занять); для C/CE — медогляд і окуліст.' },
        { t: 'Заява', d: 'Заява до Fahrerlaubnisbehörde: документи, фото, оригінал посвідчення й переклад.' },
        { t: 'Теоретичний іспит', d: 'На комп’ютері в TÜV / DEKRA; кількома мовами, зокрема російською й турецькою.' },
        { t: 'Практичний іспит', d: 'Іспит із водіння з екзаменатором на авто автошколи.' },
        { t: 'Німецьке посвідчення', d: 'Під час отримання нового посвідчення азербайджанське здається.' },
      ],
    },
    docs: {
      title: 'Документи',
      items: [
        'Паспорт і дозвіл на проживання',
        'Довідка про реєстрацію (Meldebescheinigung)',
        'Біометричне фото',
        'Оригінал азербайджанського посвідчення й німецький переклад (присяжний перекладач або ADAC; ми перекладів не робимо)',
        'Довідка про перевірку зору (Sehtest)',
        'Сертифікат курсу першої допомоги',
        'Дані автошколи та екзаменаційного центру',
        'Для C/CE: медична довідка (Anlage 5) і висновок окуліста (Anlage 6)',
      ],
    },
    costs: {
      title: 'Орієнтовні витрати (категорія B)',
      items: [
        { label: 'Збір відомства', value: '≈ 40–50 €' },
        { label: 'Перевірка зору, перша допомога, фото', value: '≈ 70–110 €' },
        { label: 'Переклад посвідчення', value: '≈ 40–80 €' },
        { label: 'Збори за іспити TÜV/DEKRA', value: '≈ 160–200 €' },
        { label: 'Автошкола (базовий внесок, уроки, екзаменаційна поїздка)', value: '≈ 500–1 500 €' },
      ],
      total: 'Разом зазвичай ≈ 800–2 000 € — залежно від кількості уроків.',
      note: 'Це оцінки; ціни залежать від міста й автошколи.',
    },
    truck: {
      title: 'Водії вантажівок (C / CE)',
      text: 'Азербайджанські C/CE теж не обмінюють без іспитів: теорія й практика для кожної категорії, медогляд і окуліст (для C потрібна B). Для роботи водієм додатково:',
      items: [
        'Кваліфікація Berufskraftfahrer: прискорена базова кваліфікація — 140 годин в акредитованому навчальному центрі та 90-хвилинний теоретичний іспит в IHK.',
        'Потім у Німеччині видають Fahrerqualifizierungsnachweis (FQN; § 7 BKrFQG); код 95 у посвідченні країни ЄС теж визнається. Кожні 5 років — 35 годин підвищення кваліфікації.',
        'Посвідчення C/CE дійсне 5 років; для продовження знову потрібна медична довідка.',
        'Орієнтовно: C/CE з іспитами ≈ 2 000–5 000 € за категорію, кваліфікація ≈ 2 000–4 000 €. Часто частину оплачує роботодавець.',
      ],
      guide: 'Гід для водіїв',
      jobs: 'Вакансії водіїв',
    },
    sources: 'Офіційні джерела',
    asOf: 'Дані станом на {{date}}.',
    disclaimer: 'Загальна інформація, а не юридична консультація. Рішення ухвалює місцева Fahrerlaubnisbehörde; збори й вимоги можуть відрізнятися за містами.',
    faq: {
      title: 'Часті запитання',
      items: [
        { q: 'Скільки можна їздити в Німеччині з азербайджанським посвідченням?', a: '6 місяців від реєстрації місця проживання. Продовження можливе, лише якщо ви проживатимете в Німеччині не довше 12 місяців.' },
        { q: 'Чи можна обміняти азербайджанське посвідчення без іспиту?', a: 'Ні. Азербайджану немає в Anlage 11 FeV, тож потрібні теоретичний і практичний іспити. Обов’язкових годин водіння при цьому немає.' },
        { q: 'Якою мовою можна скласти теорію?', a: 'Окрім німецької — кількома іноземними, зокрема російською й турецькою. Уточніть в автошколі.' },
        { q: 'Що потрібно, щоб працювати водієм вантажівки в Німеччині?', a: 'Німецьке посвідчення C/CE (з іспитами) і кваліфікація Berufskraftfahrer (140 годин + іспит IHK). Ми допомагаємо водіям знайти роботодавця й готуємо документи на візу.' },
      ],
    },
    cta: { title: 'Робота водієм у Німеччині', text: 'Перегляньте вакансії для водіїв C/CE і зареєструйтеся — ми допоможемо знайти роботодавця й підготуємо документи на візу.', primary: 'Зареєструватися', secondary: 'Вакансії' },
  },
};

export const pagesDrivingLicence = { az, de, en, ru, tr, uk };
