/**
 * Page copy owned by one feature area. Each language object must have the same keys.
 * Merged into the translation resources in i18n/index.ts.
 *
 * Owner: Visas, Visa detail, Services, Service detail and Ausbildung pages.
 */
const az = {
  visasPage: {
    heroTitle: 'Almaniya üçün iş vizaları: müqayisə edin və seçin',
    heroSubtitle: 'Hər viza növü üzrə dil tələbi, təxmini maaş, emal müddəti və ailə birləşməsi imkanı — bir səhifədə.',
    heroTypes: '{{count}} viza növü',
    heroLevels: 'Alman dili: {{from}}-dən',
    heroWeeks: '{{min}}–{{max}} həftə emal',
    indicative: 'Rəqəmlər təxminidir və işəgötürəndən, regiondan, kollektiv müqavilədən və şəxsi vəziyyətdən asılı olaraq dəyişə bilər.',
    grid: {
      eyebrow: 'Viza kataloqu',
      title: 'Sizə uyğun viza növünü tapın',
      subtitle: 'Dil səviyyənizə, ailə planlarınıza və iş müddətinə görə süzün.',
      filterLabel: 'Süzgəc',
      filters: {
        all: 'Hamısı',
        basic: 'A1–A2 ilə başlamaq olar',
        advanced: 'B1 və yuxarı',
        family: 'Ailə birləşməsi mümkündür',
        longTerm: 'Uzunmüddətli',
        seasonal: 'Mövsümi',
      },
      sortLabel: 'Sıralama',
      sort: {
        recommended: 'Tövsiyə olunan',
        salary: 'Maaş: yüksəkdən aşağı',
        speed: 'Ən qısa emal müddəti',
        level: 'Dil tələbi: aşağıdan',
      },
      results: 'Göstərilir: {{count}} / {{total}}',
      empty: 'Bu süzgəcə uyğun viza növü tapılmadı.',
      reset: 'Süzgəci sıfırla',
    },
    compare: {
      eyebrow: 'Müqayisə',
      title: 'Bütün viza növləri bir cədvəldə',
      subtitle: 'Hüquqi əsas, dil tələbi, maaş diapazonu və müddətləri yan-yana müqayisə edin.',
      cols: {
        visa: 'Viza növü',
        basis: 'Hüquqi əsas',
        level: 'Alman dili',
        salary: 'Maaş (brutto/ay)',
        processing: 'Emal müddəti',
        family: 'Ailə birləşməsi',
      },
      open: 'Ətraflı',
      caption: 'Viza növlərinin müqayisəsi',
    },
    charts: {
      eyebrow: 'Rəqəmlərlə',
      title: 'Maaş və müddətlər vizual şəkildə',
      subtitle: 'Hər zolaq təxmini diapazonu göstərir: sol kənar — minimum, sağ kənar — maksimum.',
      salaryTitle: 'Təxmini aylıq maaş (brutto)',
      salaryAria: 'Viza növlərinə görə təxmini aylıq brutto maaş diapazonları',
      processingTitle: 'Təxmini emal müddəti',
      processingAria: 'Viza növlərinə görə təxmini emal müddəti, həftələrlə',
      minWage: 'Tam ştat minimum əmək haqqı (təxm.)',
      traineeNote: '* Ausbildung: təhsil maaşı. Minimum əmək haqqı deyil, minimum təhsil təqaüdü tətbiq olunur.',
      embassyAvg: 'Səfirlikdə orta gözləmə müddəti: 3–8 həftə',
    },
    fit: {
      eyebrow: 'Hansı viza mənə uyğundur?',
      title: 'Əmin deyilsiniz? 2 dəqiqəlik testdən keçin',
      text: 'Peşəniz, təcrübəniz, dil səviyyəniz və təhsiliniz barədə bir neçə suala cavab verin — sizə ən uyğun viza yolunu və hazırlıq səviyyənizi göstərək.',
      points: ['Pulsuz və qeydiyyatsız', 'Peşəyə uyğun viza tövsiyəsi', 'Növbəti addımların siyahısı'],
      button: 'Testə başla',
    },
    cta: {
      title: 'Viza növünü seçdiniz? İndi sənədlərə başlayaq',
      text: 'Onlayn kabinet açın, sizin üçün fərdi sənəd siyahısı yaradaq və bütün prosesi addım-addım izləyin.',
      primary: 'Müraciət et',
      secondary: 'Məsləhət al',
    },
  },
  visaDetail: {
    facts: {
      level: 'Alman dili',
      levelHint: 'tövsiyə olunan səviyyə',
      salary: 'Maaş diapazonu',
      salaryHint: 'brutto, ayda, təxmini',
      processing: 'Emal müddəti',
      processingHint: 'təxmini, razılıqlar daxil',
      family: 'Ailə birləşməsi',
      familyHint: 'həyat yoldaşı və uşaqlar',
      yes: 'Mümkündür',
      no: 'Nəzərdə tutulmur',
      depends: 'Vəziyyətdən asılıdır',
      weeks: '{{min}}–{{max}} həftə',
      na: '—',
    },
    overview: 'Ümumi məlumat',
    highlights: 'Əsas məqamlar',
    requirements: {
      eyebrow: 'Tələblər',
      title: 'Kimlər müraciət edə bilər',
      subtitle: 'Bu viza növü üçün ümumi şərtlər. Dəqiq tələblər konkret vakansiyadan asılıdır.',
    },
    documents: {
      eyebrow: 'Sənədlər',
      title: 'Sənəd siyahısı',
      subtitle: 'Hazırlamalı olacağınız əsas sənədlər. Kabinetinizdə fərdi siyahı yaradılır.',
      print: 'Siyahını çap et',
      printHeading: 'Sənəd siyahısı',
      printNote: 'Ümumi siyahıdır; dəqiq siyahı səfirlik və işəgötürən tələblərindən asılıdır.',
    },
    timeline: {
      eyebrow: 'Müddətlər',
      title: 'Müraciətin təxmini qrafiki',
      subtitle: 'Tünd hissə — ən qısa ssenari, açıq hissə — mümkün uzanma.',
      aria: 'Müraciət mərhələlərinin həftələrlə təxmini qrafiki',
      axis: 'Həftə',
      total: 'Ümumilikdə təxminən {{min}}–{{max}} həftə',
      phases: {
        consult: {
          title: 'Məsləhət və sənədlər',
          text: 'Uyğunluğun yoxlanılması, sənədlərin toplanması və tərcüməsi',
        },
        contract: {
          title: 'İşəgötürən və müqavilə',
          text: 'Müsahibə, iş təklifi və müqavilənin imzalanması',
        },
        visa: {
          title: 'Razılıqlar və viza',
          text: 'Lazım olan razılıqlar, səfirlik görüşü və qərar',
        },
        arrival: { title: 'Gəliş', text: 'Uçuş, qarşılanma və işə başlama' },
      },
      weeksShort: '{{min}}–{{max}} həft.',
    },
    salary: {
      eyebrow: 'Maaş',
      title: 'Təxmini maaş diapazonu',
      subtitle: 'Bu viza növündə tipik aylıq brutto maaş, Almaniyada tam ştat minimum əmək haqqı ilə müqayisədə.',
      aria: 'Aylıq brutto maaş diapazonu {{min}} ilə {{max}} arası, minimum əmək haqqı təxminən {{ref}}',
      range: 'Tipik diapazon',
      minWage: 'Minimum əmək haqqı (tam ştat, təxm.)',
      trainee: 'Ausbildung zamanı təhsil maaşı ödənilir; burada minimum əmək haqqı deyil, minimum təhsil təqaüdü tətbiq olunur. Maaş hər təhsil ilində artır.',
      net: 'Xalis məbləğ vergi sinfindən, sığortadan və ailə vəziyyətindən asılıdır.',
    },
    faq: {
      eyebrow: 'Suallar',
      title: 'Bu viza barədə suallar',
    },
    services: {
      eyebrow: 'Kömək',
      title: 'Bu vizada sizə necə kömək edirik',
      subtitle: 'Bu viza növü üçün ən çox lazım olan xidmətlərimiz.',
    },
    others: 'Digər viza növləri',
    side: {
      title: 'Bu vizaya müraciət etmək istəyirsiniz?',
      text: 'Kabinet açın — sənəd siyahınızı hazırlayaq və prosesi birlikdə başlayaq.',
      apply: 'Müraciət et',
      employer: 'İşəgötürənəm',
      check: 'Uyğunluğu yoxla',
      call: 'Zəng',
    },
    empty: 'Bu bölmə üçün məlumat tezliklə əlavə olunacaq.',
    cta: {
      title: 'Bu viza üçün sənədlərinizi yoxlayaq',
      text: 'Sənədlərinizi göndərin — mütəxəssisimiz nəyin hazır olduğunu və nəyin çatışmadığını pulsuz dəyərləndirsin.',
      primary: 'Kabinet aç',
      secondary: 'Bizimlə əlaqə',
    },
  },
  servicesPage: {
    heroTitle: 'Xidmətlərimiz: hər mərhələ üçün ayrıca dəstək',
    heroSubtitle: 'İşçi seçimindən dil hazırlığına, vizadan Almaniyada ilk iş gününə qədər — ehtiyacınız olan xidməti seçin.',
    grid: {
      eyebrow: 'Kataloq',
      title: 'Bütün xidmətlər',
      subtitle: 'Kim üçün olduğuna görə süzün və ətraflı məlumat üçün xidmətə klikləyin.',
    },
    matrix: {
      eyebrow: 'Kimə nə daxildir',
      title: 'Xidmət matrisi',
      subtitle: 'Hansı xidmət şirkətlər, hansı namizədlər üçündür — və hər birinin təxmini müddəti.',
      cols: {
        service: 'Xidmət',
        company: 'Şirkətlər',
        candidate: 'Namizədlər',
        phase: 'Mərhələ',
        duration: 'Təxmini müddət',
      },
      included: 'Daxildir',
      notIncluded: 'Daxil deyil',
      caption: 'Xidmətlərin auditoriya və mərhələ üzrə bölgüsü',
    },
    journey: {
      eyebrow: 'Xidmətlər necə birləşir',
      title: 'Yol xəritəsi: xidmətlər ardıcıllıqla',
      subtitle: 'Hər xidmət yolun müəyyən mərhələsini əhatə edir. Birini və ya hamısını seçə bilərsiniz.',
      aria: 'Xidmətlərin dörd mərhələ üzrə ardıcıllığı',
      phases: [
        { title: 'Seçim', text: 'Vakansiya profili və namizədlərin seçilməsi' },
        { title: 'Hazırlıq', text: 'Dil, sənədlər, tanınma və təhsil yeri' },
        { title: 'Viza', text: 'Razılıqlar, səfirlik və qərar' },
        { title: 'Gəliş', text: 'Qarşılanma, qeydiyyat və uyğunlaşma' },
      ],
    },
    cta: {
      title: 'Hansı xidmətə ehtiyacınız olduğunu birlikdə müəyyən edək',
      text: 'Qısa söhbətdə vəziyyətinizi dinləyir və sizə yalnız lazım olan xidmətləri təklif edirik — artıq heç nə.',
      company: 'Şirkət üçün sorğu',
      candidate: 'Namizəd kimi müraciət',
    },
  },
  serviceDetail: {
    overview: 'Xidmət haqqında',
    steps: {
      eyebrow: 'Addım-addım',
      title: 'Bu xidmət necə işləyir',
      duration: 'Təxmini müddət',
      step: 'Addım {{n}}',
    },
    audience: {
      eyebrow: 'Kim üçündür',
      title: 'Bu xidmət kimə uyğundur',
      company: {
        title: 'Alman şirkətləri',
        points: [
          'Uzunmüddətli işçi çatışmazlığı olan müəssisələr',
          'Xaricdən işə qəbulda təcrübəsi olmayan şirkətlər',
          'Prosesi bir tərəfdaşa həvalə etmək istəyən HR komandaları',
        ],
      },
      candidate: {
        title: 'Azərbaycandan namizədlər',
        points: ['Almaniyada qanuni işləmək istəyən mütəxəssislər', 'Sənəd və viza prosesində etibarlı dəstək axtaranlar', 'Gəlişdən sonra da yanında kimsə olmasını istəyənlər'],
      },
    },
    relatedVisas: {
      eyebrow: 'Əlaqəli vizalar',
      title: 'Bu xidmət hansı vizalarda istifadə olunur',
    },
    faq: {
      eyebrow: 'Qısa cavablar',
      title: 'Bu xidmət barədə suallar',
      durationQ: 'Bu xidmət nə qədər vaxt aparır?',
      durationA: 'Təxminən: {{duration}}. Dəqiq müddət sənədlərinizdən, orqanların iş yükündən və şəxsi vəziyyətinizdən asılıdır.',
      items: {
        'candidate-selection': [
          {
            q: 'Namizədlərin dil səviyyəsini necə yoxlayırsınız?',
            a: 'Sertifikat varsa, onun etibarlılığını yoxlayırıq; əlavə olaraq müsahibədə danışıq səviyyəsini qiymətləndiririk. Vakansiya üçün lazım olan səviyyəni sizinlə birlikdə müəyyən edirik.',
          },
          {
            q: 'Təqdim edilən namizədlər uyğun gəlməsə nə olur?',
            a: 'Profili sizinlə dəqiqləşdirir və axtarışı davam etdiririk. Bunun şərtləri əməkdaşlıq müqaviləsində əvvəlcədən razılaşdırılır.',
          },
        ],
        documents: [
          {
            q: 'Tərcüməni özüm edə bilərəmmi?',
            a: 'Alman orqanları adətən and içmiş (vereidigt) tərcüməçinin tərcüməsini tələb edir. Öz tərcüməniz qəbul olunmaya bilər, ona görə bunu əvvəlcədən yoxlayırıq.',
          },
          {
            q: 'Apostil hər sənəd üçün lazımdırmı?',
            a: 'Xeyr. Bu, sənədin növündən və onu qəbul edən orqandan asılıdır. Hər sənəd üçün ayrıca dəqiqləşdiririk.',
          },
        ],
        recognition: [
          {
            q: 'Diplomum tam tanınmasa nə olur?',
            a: 'Qismən tanınma olduqda çatışmayan bilikləri Almaniyada uyğunlaşma tədbiri və ya imtahanla tamamlamaq mümkündür (§16d). Nəticə diplomdan və peşədən asılıdır.',
          },
          {
            q: 'Hər peşə üçün tanınma lazımdırmı?',
            a: 'Tənzimlənən peşələr (məsələn, tibb bacısı) üçün bəli. Digər peşələrdə bu, viza növündən asılıdır — bəzi hallarda tanınmadan da yol var.',
          },
        ],
        'visa-support': [
          {
            q: 'Vizanın verilməsinə zəmanət verirsinizmi?',
            a: 'Xeyr, qərarı yalnız səfirlik və alman orqanları verir. Biz müraciətin tam və düzgün olmasını təmin edirik; müraciətlərimizin təxminən 98%-i müsbət nəticələnib.',
          },
          {
            q: 'Sürətləndirilmiş prosedur (§81a) nədir?',
            a: 'İşəgötürənin Almaniyada əcnəbilər idarəsi vasitəsilə başlatdığı ödənişli prosedurdur və razılıqları sürətləndirə bilər. Uyğun olub-olmaması konkret işdən asılıdır.',
          },
        ],
        'german-courses': [
          {
            q: 'Sıfırdan B1-ə qədər nə qədər vaxt lazımdır?',
            a: 'İntensiv kursla adətən 6–9 ay. Bu, tempinizdən, dərs saatlarından və müstəqil məşğələdən asılıdır.',
          },
          {
            q: 'Hansı sertifikatlar qəbul olunur?',
            a: 'Ən çox Goethe, telc və ÖSD sertifikatları. Konkret tələbi viza növü, tanınma orqanı və işəgötürən müəyyən edir.',
          },
        ],
        'arrival-integration': [
          {
            q: 'Yaşayış yerini kim ödəyir?',
            a: 'Bu, işəgötürənlə razılaşmadan asılıdır: bəzən işəgötürən mənzil təqdim edir, bəzən kirayə maaşdan tutulur. Şərtlər gəlişdən əvvəl yazılı şəkildə razılaşdırılır.',
          },
          {
            q: 'Almaniyaya çatandan sonra ilk nə etməliyəm?',
            a: 'Ünvan qeydiyyatı (Anmeldung), bank hesabı və tibbi sığorta. Bu addımların hər birində sizi müşayiət edirik.',
          },
        ],
        'employer-services': [
          {
            q: 'Minimum neçə işçi sifariş etmək olar?',
            a: 'Bir işçidən başlayaraq. Böyük həcmlərdə işə qəbulu mərhələlərə bölür və hər qrup üçün ayrıca qrafik qururuq.',
          },
          {
            q: 'İşçi gəldikdən sonra da dəstək olurmu?',
            a: 'Bəli. İlk aylarda həm sizin, həm də işçinin sabit əlaqə şəxsi olur və yaranan məsələləri operativ həll edirik.',
          },
        ],
        'ausbildung-placement': [
          {
            q: 'Ausbildung üçün yaş həddi varmı?',
            a: 'Rəsmi yaş həddi yoxdur, lakin bir çox müəssisə gənc namizədlərə üstünlük verir. Şanslar peşədən və regiondan asılıdır.',
          },
          {
            q: 'Təhsil zamanı əlavə iş edə bilərəmmi?',
            a: 'Bəzi hallarda məhdud həcmdə əlavə iş mümkündür. Bu, yaşayış icazəsinin şərtlərindən asılıdır və əvvəlcədən yoxlanılmalıdır.',
          },
        ],
      },
    },
    form: {
      title: 'Bu xidmət üçün təklif alın',
      text: 'Vəziyyətinizi qısaca yazın — 24 saat ərzində konkret təkliflə geri dönək.',
    },
    side: {
      title: 'Bir baxışda',
      audience: 'Auditoriya',
      duration: 'Müddət',
      steps: 'Addımlar',
      stepsCount: '{{count}} addım',
    },
    others: 'Digər xidmətlər',
    cta: {
      title: 'Bu xidməti digərləri ilə birləşdirmək istəyirsiniz?',
      text: 'Əksər müştərilərimiz bir neçə xidməti paket şəklində seçir. Sizin üçün uyğun kombinasiyanı birlikdə quraq.',
      button: 'Paket haqqında soruş',
      all: 'Bütün xidmətlər',
    },
  },
  ausbildungPage: {
    heroTitle: 'Ausbildung: Almaniyada maaşlı peşə təhsili',
    heroSubtitle: 'Həftənin bir hissəsi məktəbdə, qalanı müəssisədə — hər ay maaş alaraq dövlət tərəfindən tanınan peşə diplomu qazanın.',
    facts: [
      { value: '2–3,5', label: 'il davam edir' },
      { value: '300+', label: 'tanınmış peşə' },
      { value: '≈1000–1300 €', label: 'aylıq təhsil maaşı' },
      { value: 'B1', label: 'tövsiyə olunan dil səviyyəsi' },
    ],
    what: {
      eyebrow: 'Dual sistem',
      title: 'Ausbildung necə qurulub?',
      paragraphs: [
        'Ausbildung — Almaniyanın dual peşə təhsili sistemidir. Siz müəssisə ilə təhsil müqaviləsi bağlayır, praktikanı işin özündə öyrənir, nəzəriyyəni isə peşə məktəbində (Berufsschule) keçirsiniz.',
        'Bütün təhsil müddətində müəssisə sizə aylıq təhsil maaşı ödəyir. Sonda Sənaye-Ticarət Palatası (IHK), Sənətkarlıq Palatası (HWK) və ya müvafiq dövlət orqanı qarşısında yekun imtahan verirsiniz.',
      ],
      weekTitle: 'Tipik təhsil həftəsi',
      weekAria: 'Tipik həftə: üç gün müəssisədə, iki gün peşə məktəbində',
      days: ['B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.'],
      company: 'Müəssisə',
      companyText: 'Real işdə praktika, mentor nəzarəti',
      school: 'Berufsschule',
      schoolText: 'Nəzəriyyə, alman dili, peşə fənləri',
      note: 'Bəzi peşələrdə blok təhsil tətbiq olunur: bir neçə həftə ardıcıl məktəb, sonra müəssisə. Tibb bacılığında praktika klinika, qocalar evi və ambulator xidmət arasında bölünür.',
    },
    professions: {
      eyebrow: 'Tələb olunan peşələr',
      title: 'Peşələr və təxmini təhsil maaşı',
      subtitle: 'Təhsil maaşı hər il artır. Rəqəmlər brutto və təxminidir — müəssisə, region və kollektiv müqavilədən asılıdır.',
      aria: 'Peşələr üzrə 1-ci, 2-ci və 3-cü təhsil ili üçün təxmini aylıq təhsil maaşı',
      years: ['1-ci il', '2-ci il', '3-cü il'],
      items: {
        nursing: 'Tibb bacısı / qardaşı (Pflegefachmann/-frau)',
        mechatronics: 'Mexatronik',
        electronics: 'Elektronik',
        logistics: 'Anbar logistikası mütəxəssisi',
        driver: 'Peşəkar sürücü (Berufskraftfahrer)',
        cook: 'Aşpaz',
        hotel: 'Otel işi mütəxəssisi',
      },
    },
    reqs: {
      eyebrow: 'Tələblər',
      title: 'Başlamaq üçün nə lazımdır',
      items: [
        {
          title: 'Məktəb attestatı',
          text: 'Orta təhsil haqqında sənəd; Almaniyada tanınması yoxlanılır.',
        },
        {
          title: 'Alman dili',
          text: 'Adətən B1; tibb kimi bəzi peşələrdə B2 tələb oluna bilər.',
        },
        {
          title: 'Təhsil müqaviləsi',
          text: 'Alman müəssisəsi ilə imzalanmış Ausbildung müqaviləsi.',
        },
        {
          title: 'Maliyyə təminatı',
          text: 'Təhsil maaşı kifayət etmirsə, əlavə maliyyə sübutu tələb oluna bilər.',
        },
        {
          title: 'Tibbi sığorta',
          text: 'Səyahət və ilk gündən etibarlı tibbi sığorta.',
        },
        {
          title: 'Motivasiya',
          text: 'Seçdiyiniz peşəyə maraq və uzunmüddətli plan.',
        },
      ],
    },
    timeline: {
      eyebrow: 'İl-il',
      title: 'Müraciətdən diploma qədər yol',
      items: [
        {
          when: '6–12 ay əvvəl',
          title: 'Peşə seçimi və dil',
          text: 'Peşəni seçirik, B1 hazırlığına başlayırsınız, alman dilində CV və motivasiya məktubu hazırlanır.',
        },
        {
          when: '3–6 ay əvvəl',
          title: 'Müraciət və müqavilə',
          text: 'Müəssisələrlə onlayn müsahibələr və Ausbildung müqaviləsinin imzalanması.',
        },
        {
          when: '1–3 ay əvvəl',
          title: 'Viza (§16a)',
          text: 'Sənədlər, səfirlik görüşü, yaşayış yeri və gəlişin planlaşdırılması.',
        },
        {
          when: '1-ci il',
          title: 'Başlanğıc',
          text: 'Sınaq müddəti, Berufsschule-yə qəbul və peşənin əsasları.',
        },
        {
          when: '2-ci il',
          title: 'İrəliləmə',
          text: 'Bir çox peşədə ara imtahan; daha çox müstəqillik və məsuliyyət.',
        },
        {
          when: '3-cü il',
          title: 'Yekun imtahan',
          text: 'Abschlussprüfung və dövlət tərəfindən tanınan peşə diplomu.',
        },
        {
          when: 'Sonra',
          title: 'Karyera',
          text: 'İxtisaslı işçi kimi iş və yaşayış icazəsi — çox vaxt eyni müəssisədə.',
        },
      ],
    },
    faq: {
      eyebrow: 'Ausbildung barədə',
      title: 'Ausbildung haqqında suallar',
      items: [
        {
          q: 'Ausbildung zamanı nə qədər maaş alıram?',
          a: 'Peşədən, regiondan və müəssisədən asılıdır. Adətən ayda təxminən 1000–1300 € brutto, tibb bacılığında bir qədər çox; maaş hər təhsil ilində artır. Bu rəqəmlər təxminidir.',
        },
        {
          q: 'Bu maaşla yaşamaq mümkündürmü?',
          a: 'Bu, kirayə qiymətlərindən və regiondan asılıdır. Maaş yaşayış xərclərini qarşılamırsa, viza üçün əlavə maliyyə sübutu (məsələn, bloklanmış hesab) tələb oluna bilər. Hər vəziyyəti ayrıca qiymətləndiririk.',
        },
        {
          q: 'Dil səviyyəm hələ B1 deyil. Nə etməliyəm?',
          a: 'Bəzi müəssisələr daha aşağı səviyyə ilə başlamağa razılaşır, lakin Berufsschule-də uğur üçün B1 tövsiyə olunur. Dil hazırlığını müraciətlə paralel təşkil edirik.',
        },
        {
          q: 'Ausbildung bitdikdən sonra nə olur?',
          a: 'Diplomla ixtisaslı işçi kimi işləmək üçün yaşayış icazəsi almaq mümkündür; çox vaxt təhsil aldığınız müəssisə sizi işə götürür. İş axtarışı üçün də müəyyən müddətə icazə verilə bilər — şərtlər vəziyyətdən asılıdır.',
        },
        {
          q: 'Ailəmi gətirə bilərəmmi?',
          a: 'Bəzi hallarda mümkündür, lakin kifayət qədər gəlir və yaşayış yeri tələb olunur — təhsil maaşı ilə bu çox vaxt çətindir. Fərdi qiymətləndirmə lazımdır.',
        },
        {
          q: 'Peşəni və ya müəssisəni dəyişmək olarmı?',
          a: 'Mümkündür, lakin yeni müqavilə və əcnəbilər idarəsinin razılığı lazımdır. Nəticə konkret vəziyyətdən asılıdır, ona görə əvvəlcə bizimlə məsləhətləşin.',
        },
      ],
    },
    related: {
      eyebrow: 'Növbəti addım',
      title: 'Viza və yerləşdirmə xidməti',
      subtitle: 'Ausbildung vizası barədə ətraflı oxuyun və ya təhsil yerinin tapılmasını bizə həvalə edin.',
    },
    cta: {
      title: 'Ausbildung yerinizi birlikdə tapaq',
      text: 'Maraqlarınızı və dil səviyyənizi bizə yazın — sizə uyğun peşələri və real müəssisələri təklif edək.',
      primary: 'Müraciət et',
      secondary: 'Uyğunluq testi',
    },
  },
};

const de: typeof az = {
  visasPage: {
    heroTitle: 'Arbeitsvisa für Deutschland: vergleichen und auswählen',
    heroSubtitle: 'Sprachanforderung, Gehaltsspanne, Bearbeitungszeit und Familiennachzug für jede Visaart – auf einer Seite.',
    heroTypes: '{{count}} Visaarten',
    heroLevels: 'Deutsch ab {{from}}',
    heroWeeks: '{{min}}–{{max}} Wochen Bearbeitung',
    indicative: 'Alle Zahlen sind Richtwerte und können je nach Arbeitgeber, Region, Tarifvertrag und persönlicher Situation abweichen.',
    grid: {
      eyebrow: 'Visakatalog',
      title: 'Finden Sie die passende Visaart',
      subtitle: 'Filtern Sie nach Sprachniveau, Familienplänen und Dauer der Beschäftigung.',
      filterLabel: 'Filter',
      filters: {
        all: 'Alle',
        basic: 'Einstieg mit A1–A2',
        advanced: 'Ab B1',
        family: 'Familiennachzug möglich',
        longTerm: 'Langfristig',
        seasonal: 'Saisonal',
      },
      sortLabel: 'Sortierung',
      sort: {
        recommended: 'Empfohlen',
        salary: 'Gehalt: absteigend',
        speed: 'Kürzeste Bearbeitung',
        level: 'Sprachniveau: aufsteigend',
      },
      results: '{{count}} von {{total}} angezeigt',
      empty: 'Für diesen Filter wurde keine Visaart gefunden.',
      reset: 'Filter zurücksetzen',
    },
    compare: {
      eyebrow: 'Vergleich',
      title: 'Alle Visaarten in einer Tabelle',
      subtitle: 'Rechtsgrundlage, Sprachniveau, Gehaltsspanne und Dauer direkt nebeneinander.',
      cols: {
        visa: 'Visaart',
        basis: 'Rechtsgrundlage',
        level: 'Deutsch',
        salary: 'Gehalt (brutto/Monat)',
        processing: 'Bearbeitung',
        family: 'Familiennachzug',
      },
      open: 'Details',
      caption: 'Vergleich der Visaarten',
    },
    charts: {
      eyebrow: 'In Zahlen',
      title: 'Gehalt und Dauer auf einen Blick',
      subtitle: 'Jeder Balken zeigt eine Richtspanne: linker Rand – Minimum, rechter Rand – Maximum.',
      salaryTitle: 'Monatliches Bruttogehalt (Richtwert)',
      salaryAria: 'Richtwerte für monatliche Bruttogehälter nach Visaart',
      processingTitle: 'Bearbeitungszeit (Richtwert)',
      processingAria: 'Richtwerte für die Bearbeitungszeit nach Visaart in Wochen',
      minWage: 'Mindestlohn in Vollzeit (ca.)',
      traineeNote: '* Ausbildung: Ausbildungsvergütung. Es gilt nicht der Mindestlohn, sondern die Mindestausbildungsvergütung.',
      embassyAvg: 'Durchschnittliche Wartezeit bei der Botschaft: 3–8 Wochen',
    },
    fit: {
      eyebrow: 'Welches Visum passt zu mir?',
      title: 'Unsicher? Machen Sie den 2-Minuten-Test',
      text: 'Beantworten Sie einige Fragen zu Beruf, Erfahrung, Sprachniveau und Ausbildung – wir zeigen Ihnen den passenden Visumsweg und Ihren Vorbereitungsstand.',
      points: ['Kostenlos und ohne Registrierung', 'Visumsempfehlung passend zum Beruf', 'Liste der nächsten Schritte'],
      button: 'Test starten',
    },
    cta: {
      title: 'Visaart gewählt? Dann starten wir mit den Unterlagen',
      text: 'Eröffnen Sie ein Online-Konto – wir erstellen Ihre persönliche Dokumentenliste und Sie verfolgen jeden Schritt.',
      primary: 'Jetzt bewerben',
      secondary: 'Beratung anfragen',
    },
  },
  visaDetail: {
    facts: {
      level: 'Deutsch',
      levelHint: 'empfohlenes Niveau',
      salary: 'Gehaltsspanne',
      salaryHint: 'brutto, monatlich, Richtwert',
      processing: 'Bearbeitungszeit',
      processingHint: 'Richtwert inkl. Zustimmungen',
      family: 'Familiennachzug',
      familyHint: 'Ehepartner und Kinder',
      yes: 'Möglich',
      no: 'Nicht vorgesehen',
      depends: 'Einzelfallabhängig',
      weeks: '{{min}}–{{max}} Wochen',
      na: '—',
    },
    overview: 'Überblick',
    highlights: 'Das Wichtigste',
    requirements: {
      eyebrow: 'Voraussetzungen',
      title: 'Wer sich bewerben kann',
      subtitle: 'Allgemeine Voraussetzungen für diese Visaart. Die genauen Anforderungen hängen von der konkreten Stelle ab.',
    },
    documents: {
      eyebrow: 'Unterlagen',
      title: 'Dokumentenliste',
      subtitle: 'Die wichtigsten Unterlagen, die Sie vorbereiten. In Ihrem Konto erhalten Sie eine persönliche Liste.',
      print: 'Liste drucken',
      printHeading: 'Dokumentenliste',
      printNote: 'Allgemeine Liste; die genauen Unterlagen hängen von Botschaft und Arbeitgeber ab.',
    },
    timeline: {
      eyebrow: 'Zeitrahmen',
      title: 'Ungefährer Ablauf Ihres Antrags',
      subtitle: 'Dunkler Teil – kürzestes Szenario, heller Teil – mögliche Verlängerung.',
      aria: 'Ungefährer Zeitplan der Antragsphasen in Wochen',
      axis: 'Woche',
      total: 'Insgesamt etwa {{min}}–{{max}} Wochen',
      phases: {
        consult: {
          title: 'Beratung & Unterlagen',
          text: 'Eignungsprüfung, Zusammenstellung und Übersetzung der Dokumente',
        },
        contract: {
          title: 'Arbeitgeber & Vertrag',
          text: 'Interview, Jobangebot und Vertragsunterzeichnung',
        },
        visa: {
          title: 'Zustimmungen & Visum',
          text: 'Erforderliche Zustimmungen, Botschaftstermin und Entscheidung',
        },
        arrival: { title: 'Einreise', text: 'Flug, Empfang und Arbeitsbeginn' },
      },
      weeksShort: '{{min}}–{{max}} Wo.',
    },
    salary: {
      eyebrow: 'Gehalt',
      title: 'Gehaltsspanne (Richtwert)',
      subtitle: 'Typisches monatliches Bruttogehalt in diesem Bereich im Vergleich zum Mindestlohn in Vollzeit.',
      aria: 'Monatliche Bruttogehaltsspanne von {{min}} bis {{max}}, Mindestlohn etwa {{ref}}',
      range: 'Typische Spanne',
      minWage: 'Mindestlohn (Vollzeit, ca.)',
      trainee:
        'Während der Ausbildung wird eine Ausbildungsvergütung gezahlt; hier gilt nicht der Mindestlohn, sondern die Mindestausbildungsvergütung. Die Vergütung steigt mit jedem Ausbildungsjahr.',
      net: 'Der Nettobetrag hängt von Steuerklasse, Sozialversicherung und Familienstand ab.',
    },
    faq: {
      eyebrow: 'Fragen',
      title: 'Fragen zu diesem Visum',
    },
    services: {
      eyebrow: 'Unterstützung',
      title: 'So unterstützen wir Sie bei diesem Visum',
      subtitle: 'Unsere Leistungen, die für diese Visaart am häufigsten gebraucht werden.',
    },
    others: 'Weitere Visaarten',
    side: {
      title: 'Möchten Sie dieses Visum beantragen?',
      text: 'Eröffnen Sie ein Konto – wir bereiten Ihre Dokumentenliste vor und starten gemeinsam.',
      apply: 'Jetzt bewerben',
      employer: 'Ich bin Arbeitgeber',
      check: 'Eignung prüfen',
      call: 'Anrufen',
    },
    empty: 'Die Informationen für diesen Abschnitt folgen in Kürze.',
    cta: {
      title: 'Lassen Sie uns Ihre Unterlagen für dieses Visum prüfen',
      text: 'Senden Sie uns Ihre Unterlagen – unsere Fachleute bewerten kostenlos, was bereits vorliegt und was noch fehlt.',
      primary: 'Konto eröffnen',
      secondary: 'Kontakt aufnehmen',
    },
  },
  servicesPage: {
    heroTitle: 'Unsere Leistungen: Unterstützung in jeder Phase',
    heroSubtitle: 'Von der Kandidatenauswahl über Sprachkurse und Visum bis zum ersten Arbeitstag in Deutschland – wählen Sie, was Sie brauchen.',
    grid: {
      eyebrow: 'Katalog',
      title: 'Alle Leistungen',
      subtitle: 'Filtern Sie nach Zielgruppe und klicken Sie auf eine Leistung für Details.',
    },
    matrix: {
      eyebrow: 'Was für wen enthalten ist',
      title: 'Leistungsmatrix',
      subtitle: 'Welche Leistung für Unternehmen, welche für Bewerber gedacht ist – und wie lange sie ungefähr dauert.',
      cols: {
        service: 'Leistung',
        company: 'Unternehmen',
        candidate: 'Bewerber',
        phase: 'Phase',
        duration: 'Dauer (ca.)',
      },
      included: 'Enthalten',
      notIncluded: 'Nicht enthalten',
      caption: 'Leistungen nach Zielgruppe und Phase',
    },
    journey: {
      eyebrow: 'Wie die Leistungen zusammenhängen',
      title: 'Die Route: Leistungen in Reihenfolge',
      subtitle: 'Jede Leistung deckt eine Phase des Weges ab. Sie können einzelne oder alle wählen.',
      aria: 'Abfolge der Leistungen in vier Phasen',
      phases: [
        { title: 'Auswahl', text: 'Stellenprofil und Kandidatenauswahl' },
        {
          title: 'Vorbereitung',
          text: 'Sprache, Unterlagen, Anerkennung, Ausbildungsplatz',
        },
        { title: 'Visum', text: 'Zustimmungen, Botschaft und Entscheidung' },
        { title: 'Ankunft', text: 'Empfang, Anmeldung und Eingewöhnung' },
      ],
    },
    cta: {
      title: 'Finden wir gemeinsam heraus, welche Leistung Sie brauchen',
      text: 'In einem kurzen Gespräch hören wir zu und empfehlen Ihnen nur die Leistungen, die Sie wirklich benötigen – nicht mehr.',
      company: 'Anfrage als Unternehmen',
      candidate: 'Als Bewerber starten',
    },
  },
  serviceDetail: {
    overview: 'Über diese Leistung',
    steps: {
      eyebrow: 'Schritt für Schritt',
      title: 'So funktioniert diese Leistung',
      duration: 'Ungefähre Dauer',
      step: 'Schritt {{n}}',
    },
    audience: {
      eyebrow: 'Für wen',
      title: 'Für wen diese Leistung geeignet ist',
      company: {
        title: 'Deutsche Unternehmen',
        points: [
          'Betriebe mit dauerhaftem Fachkräftemangel',
          'Unternehmen ohne Erfahrung mit Rekrutierung im Ausland',
          'HR-Teams, die den Prozess einem Partner übergeben möchten',
        ],
      },
      candidate: {
        title: 'Bewerber aus Aserbaidschan',
        points: [
          'Fachkräfte, die legal in Deutschland arbeiten möchten',
          'Alle, die verlässliche Hilfe bei Unterlagen und Visum suchen',
          'Wer auch nach der Ankunft eine Ansprechperson haben möchte',
        ],
      },
    },
    relatedVisas: {
      eyebrow: 'Passende Visa',
      title: 'Bei welchen Visa diese Leistung zum Einsatz kommt',
    },
    faq: {
      eyebrow: 'Kurze Antworten',
      title: 'Fragen zu dieser Leistung',
      durationQ: 'Wie lange dauert diese Leistung?',
      durationA: 'Ungefähr: {{duration}}. Die genaue Dauer hängt von Ihren Unterlagen, der Auslastung der Behörden und Ihrer persönlichen Situation ab.',
      items: {
        'candidate-selection': [
          {
            q: 'Wie prüfen Sie das Sprachniveau der Kandidaten?',
            a: 'Liegt ein Zertifikat vor, prüfen wir dessen Echtheit; zusätzlich bewerten wir die Sprechfähigkeit im Interview. Das nötige Niveau für die Stelle legen wir gemeinsam mit Ihnen fest.',
          },
          {
            q: 'Was passiert, wenn die vorgestellten Kandidaten nicht passen?',
            a: 'Wir schärfen das Profil gemeinsam mit Ihnen nach und setzen die Suche fort. Die Bedingungen dafür werden vorab im Kooperationsvertrag vereinbart.',
          },
        ],
        documents: [
          {
            q: 'Kann ich die Übersetzung selbst anfertigen?',
            a: 'Deutsche Behörden verlangen in der Regel Übersetzungen durch beeidigte Übersetzer. Eine eigene Übersetzung wird möglicherweise nicht akzeptiert – deshalb klären wir das vorab.',
          },
          {
            q: 'Braucht jedes Dokument eine Apostille?',
            a: 'Nein. Das hängt von der Art des Dokuments und der Behörde ab, die es annimmt. Wir klären das für jedes Dokument einzeln.',
          },
        ],
        recognition: [
          {
            q: 'Was passiert, wenn mein Abschluss nicht vollständig anerkannt wird?',
            a: 'Bei teilweiser Anerkennung können fehlende Kenntnisse in Deutschland durch eine Anpassungsmaßnahme oder Prüfung ausgeglichen werden (§16d). Das Ergebnis hängt von Abschluss und Beruf ab.',
          },
          {
            q: 'Ist für jeden Beruf eine Anerkennung nötig?',
            a: 'Für reglementierte Berufe (z. B. Pflegefachkraft) ja. Bei anderen Berufen hängt es von der Visaart ab – teils gibt es auch Wege ohne Anerkennung.',
          },
        ],
        'visa-support': [
          {
            q: 'Garantieren Sie die Erteilung des Visums?',
            a: 'Nein, die Entscheidung treffen ausschließlich die Botschaft und die deutschen Behörden. Wir sorgen für einen vollständigen und korrekten Antrag; rund 98 % unserer Anträge waren erfolgreich.',
          },
          {
            q: 'Was ist das beschleunigte Fachkräfteverfahren (§81a)?',
            a: 'Ein kostenpflichtiges Verfahren, das der Arbeitgeber bei der Ausländerbehörde in Deutschland einleitet und das Zustimmungen beschleunigen kann. Ob es sinnvoll ist, hängt vom Einzelfall ab.',
          },
        ],
        'german-courses': [
          {
            q: 'Wie lange dauert es von null bis B1?',
            a: 'Mit einem Intensivkurs in der Regel 6–9 Monate. Das hängt von Ihrem Tempo, den Unterrichtsstunden und dem Selbststudium ab.',
          },
          {
            q: 'Welche Zertifikate werden anerkannt?',
            a: 'Am häufigsten Goethe, telc und ÖSD. Die konkrete Anforderung bestimmen Visaart, Anerkennungsstelle und Arbeitgeber.',
          },
        ],
        'arrival-integration': [
          {
            q: 'Wer bezahlt die Unterkunft?',
            a: 'Das hängt von der Vereinbarung mit dem Arbeitgeber ab: Manchmal stellt er eine Wohnung, manchmal wird die Miete vom Lohn abgezogen. Die Bedingungen werden vor der Einreise schriftlich festgehalten.',
          },
          {
            q: 'Was muss ich nach der Ankunft zuerst erledigen?',
            a: 'Anmeldung des Wohnsitzes, Bankkonto und Krankenversicherung. Wir begleiten Sie bei jedem dieser Schritte.',
          },
        ],
        'employer-services': [
          {
            q: 'Wie viele Mitarbeiter muss ich mindestens anfragen?',
            a: 'Ab einer Person. Bei größeren Volumen teilen wir die Rekrutierung in Phasen und planen jede Gruppe separat.',
          },
          {
            q: 'Gibt es auch nach der Ankunft Unterstützung?',
            a: 'Ja. In den ersten Monaten haben Sie und Ihr Mitarbeiter eine feste Ansprechperson, die Fragen schnell klärt.',
          },
        ],
        'ausbildung-placement': [
          {
            q: 'Gibt es eine Altersgrenze für die Ausbildung?',
            a: 'Eine gesetzliche Altersgrenze gibt es nicht, viele Betriebe bevorzugen jedoch jüngere Bewerber. Die Chancen hängen von Beruf und Region ab.',
          },
          {
            q: 'Darf ich während der Ausbildung nebenbei arbeiten?',
            a: 'In manchen Fällen ist eine Nebentätigkeit in begrenztem Umfang möglich. Das hängt von den Bedingungen des Aufenthaltstitels ab und sollte vorher geprüft werden.',
          },
        ],
      },
    },
    form: {
      title: 'Angebot für diese Leistung anfordern',
      text: 'Beschreiben Sie kurz Ihre Situation – wir melden uns innerhalb von 24 Stunden mit einem konkreten Angebot.',
    },
    side: {
      title: 'Auf einen Blick',
      audience: 'Zielgruppe',
      duration: 'Dauer',
      steps: 'Schritte',
      stepsCount: '{{count}} Schritte',
    },
    others: 'Weitere Leistungen',
    cta: {
      title: 'Möchten Sie diese Leistung mit anderen kombinieren?',
      text: 'Die meisten Kunden wählen mehrere Leistungen als Paket. Stellen wir gemeinsam die passende Kombination zusammen.',
      button: 'Nach einem Paket fragen',
      all: 'Alle Leistungen',
    },
  },
  ausbildungPage: {
    heroTitle: 'Ausbildung: bezahlte Berufsausbildung in Deutschland',
    heroSubtitle: 'Teils in der Berufsschule, teils im Betrieb – mit monatlicher Vergütung zum staatlich anerkannten Berufsabschluss.',
    facts: [
      { value: '2–3,5', label: 'Jahre Dauer' },
      { value: '300+', label: 'anerkannte Berufe' },
      { value: '≈1000–1300 €', label: 'Vergütung pro Monat' },
      { value: 'B1', label: 'empfohlenes Sprachniveau' },
    ],
    what: {
      eyebrow: 'Duales System',
      title: 'Wie ist eine Ausbildung aufgebaut?',
      paragraphs: [
        'Die Ausbildung ist das duale Berufsbildungssystem Deutschlands. Sie schließen einen Ausbildungsvertrag mit einem Betrieb, lernen die Praxis direkt bei der Arbeit und die Theorie in der Berufsschule.',
        'Während der gesamten Ausbildung zahlt Ihnen der Betrieb eine monatliche Ausbildungsvergütung. Am Ende legen Sie die Abschlussprüfung vor der IHK, der Handwerkskammer oder der zuständigen staatlichen Stelle ab.',
      ],
      weekTitle: 'Eine typische Ausbildungswoche',
      weekAria: 'Typische Woche: drei Tage im Betrieb, zwei Tage in der Berufsschule',
      days: ['Mo', 'Di', 'Mi', 'Do', 'Fr'],
      company: 'Betrieb',
      companyText: 'Praxis im echten Arbeitsalltag, mit Ausbilder',
      school: 'Berufsschule',
      schoolText: 'Theorie, Deutsch, Fachunterricht',
      note: 'In manchen Berufen gibt es Blockunterricht: mehrere Wochen Schule am Stück, danach Betrieb. In der Pflege wechselt die Praxis zwischen Klinik, Pflegeheim und ambulantem Dienst.',
    },
    professions: {
      eyebrow: 'Gefragte Berufe',
      title: 'Berufe und Ausbildungsvergütung (Richtwerte)',
      subtitle: 'Die Vergütung steigt jedes Jahr. Bruttowerte als Richtwerte – abhängig von Betrieb, Region und Tarifvertrag.',
      aria: 'Ungefähre monatliche Ausbildungsvergütung im 1., 2. und 3. Ausbildungsjahr nach Beruf',
      years: ['1. Jahr', '2. Jahr', '3. Jahr'],
      items: {
        nursing: 'Pflegefachmann/-frau',
        mechatronics: 'Mechatroniker/-in',
        electronics: 'Elektroniker/-in',
        logistics: 'Fachkraft für Lagerlogistik',
        driver: 'Berufskraftfahrer/-in',
        cook: 'Koch/Köchin',
        hotel: 'Hotelfachmann/-frau',
      },
    },
    reqs: {
      eyebrow: 'Voraussetzungen',
      title: 'Was Sie für den Start brauchen',
      items: [
        {
          title: 'Schulabschluss',
          text: 'Nachweis über den Schulabschluss; die Anerkennung in Deutschland wird geprüft.',
        },
        {
          title: 'Deutschkenntnisse',
          text: 'In der Regel B1; in manchen Berufen wie der Pflege kann B2 verlangt werden.',
        },
        {
          title: 'Ausbildungsvertrag',
          text: 'Ein unterschriebener Ausbildungsvertrag mit einem deutschen Betrieb.',
        },
        {
          title: 'Finanzierung',
          text: 'Reicht die Vergütung nicht aus, kann ein zusätzlicher Finanzierungsnachweis nötig sein.',
        },
        {
          title: 'Krankenversicherung',
          text: 'Reise- und Krankenversicherung, gültig ab dem ersten Tag.',
        },
        {
          title: 'Motivation',
          text: 'Interesse am gewählten Beruf und eine langfristige Perspektive.',
        },
      ],
    },
    timeline: {
      eyebrow: 'Jahr für Jahr',
      title: 'Von der Bewerbung bis zum Abschluss',
      items: [
        {
          when: '6–12 Monate vorher',
          title: 'Berufswahl & Sprache',
          text: 'Wir wählen den Beruf, Sie starten mit B1, Lebenslauf und Anschreiben werden auf Deutsch erstellt.',
        },
        {
          when: '3–6 Monate vorher',
          title: 'Bewerbung & Vertrag',
          text: 'Online-Interviews mit Betrieben und Unterzeichnung des Ausbildungsvertrags.',
        },
        {
          when: '1–3 Monate vorher',
          title: 'Visum (§16a)',
          text: 'Unterlagen, Botschaftstermin, Unterkunft und Planung der Einreise.',
        },
        {
          when: '1. Jahr',
          title: 'Einstieg',
          text: 'Probezeit, Start in der Berufsschule und Grundlagen des Berufs.',
        },
        {
          when: '2. Jahr',
          title: 'Vertiefung',
          text: 'In vielen Berufen Zwischenprüfung; mehr Selbstständigkeit und Verantwortung.',
        },
        {
          when: '3. Jahr',
          title: 'Abschlussprüfung',
          text: 'Abschlussprüfung und staatlich anerkannter Berufsabschluss.',
        },
        {
          when: 'Danach',
          title: 'Karriere',
          text: 'Arbeit als Fachkraft mit passendem Aufenthaltstitel – oft im selben Betrieb.',
        },
      ],
    },
    faq: {
      eyebrow: 'Rund um die Ausbildung',
      title: 'Fragen zur Ausbildung',
      items: [
        {
          q: 'Wie viel verdiene ich während der Ausbildung?',
          a: 'Das hängt von Beruf, Region und Betrieb ab. Üblich sind etwa 1000–1300 € brutto pro Monat, in der Pflege etwas mehr; die Vergütung steigt mit jedem Ausbildungsjahr. Die Werte sind Richtwerte.',
        },
        {
          q: 'Kann ich davon leben?',
          a: 'Das hängt von den Mietpreisen und der Region ab. Reicht die Vergütung nicht für den Lebensunterhalt, kann für das Visum ein zusätzlicher Finanzierungsnachweis (z. B. Sperrkonto) verlangt werden. Wir prüfen jeden Fall einzeln.',
        },
        {
          q: 'Mein Deutsch ist noch nicht auf B1. Was nun?',
          a: 'Manche Betriebe akzeptieren einen Start mit niedrigerem Niveau, für den Erfolg in der Berufsschule wird jedoch B1 empfohlen. Wir organisieren den Sprachkurs parallel zur Bewerbung.',
        },
        {
          q: 'Was passiert nach der Ausbildung?',
          a: 'Mit dem Abschluss können Sie einen Aufenthaltstitel als Fachkraft erhalten; oft übernimmt Sie der Ausbildungsbetrieb. Auch für die Arbeitsplatzsuche kann ein befristeter Titel erteilt werden – die Bedingungen hängen vom Einzelfall ab.',
        },
        {
          q: 'Kann ich meine Familie mitbringen?',
          a: 'In manchen Fällen ist das möglich, erfordert aber ausreichendes Einkommen und Wohnraum – mit einer Ausbildungsvergütung ist das oft schwierig. Eine individuelle Prüfung ist nötig.',
        },
        {
          q: 'Kann ich den Beruf oder den Betrieb wechseln?',
          a: 'Das ist möglich, erfordert aber einen neuen Vertrag und die Zustimmung der Ausländerbehörde. Das Ergebnis hängt vom Einzelfall ab – sprechen Sie vorher mit uns.',
        },
      ],
    },
    related: {
      eyebrow: 'Nächster Schritt',
      title: 'Visum und Vermittlungsleistung',
      subtitle: 'Lesen Sie mehr über das Ausbildungsvisum oder überlassen Sie uns die Suche nach dem Ausbildungsplatz.',
    },
    cta: {
      title: 'Finden wir gemeinsam Ihren Ausbildungsplatz',
      text: 'Schreiben Sie uns Ihre Interessen und Ihr Sprachniveau – wir schlagen Ihnen passende Berufe und echte Betriebe vor.',
      primary: 'Jetzt bewerben',
      secondary: 'Eignungstest',
    },
  },
};

const en: typeof az = {
  visasPage: {
    heroTitle: 'German work visas: compare and choose',
    heroSubtitle: 'Language requirement, salary range, processing time and family reunion for every visa type – on one page.',
    heroTypes: '{{count}} visa types',
    heroLevels: 'German from {{from}}',
    heroWeeks: '{{min}}–{{max}} weeks processing',
    indicative: 'All figures are indicative and may vary depending on the employer, region, collective agreement and personal situation.',
    grid: {
      eyebrow: 'Visa catalogue',
      title: 'Find the visa type that fits you',
      subtitle: 'Filter by language level, family plans and length of employment.',
      filterLabel: 'Filter',
      filters: {
        all: 'All',
        basic: 'Start with A1–A2',
        advanced: 'B1 and above',
        family: 'Family reunion possible',
        longTerm: 'Long-term',
        seasonal: 'Seasonal',
      },
      sortLabel: 'Sort',
      sort: {
        recommended: 'Recommended',
        salary: 'Salary: high to low',
        speed: 'Fastest processing',
        level: 'German level: low to high',
      },
      results: 'Showing {{count}} of {{total}}',
      empty: 'No visa type matches this filter.',
      reset: 'Reset filter',
    },
    compare: {
      eyebrow: 'Comparison',
      title: 'All visa types in one table',
      subtitle: 'Compare legal basis, German level, salary range and timing side by side.',
      cols: {
        visa: 'Visa type',
        basis: 'Legal basis',
        level: 'German',
        salary: 'Salary (gross/month)',
        processing: 'Processing',
        family: 'Family reunion',
      },
      open: 'Details',
      caption: 'Comparison of visa types',
    },
    charts: {
      eyebrow: 'In numbers',
      title: 'Salary and timing at a glance',
      subtitle: 'Each bar shows an indicative range: left edge – minimum, right edge – maximum.',
      salaryTitle: 'Indicative monthly gross salary',
      salaryAria: 'Indicative monthly gross salary ranges by visa type',
      processingTitle: 'Indicative processing time',
      processingAria: 'Indicative processing time by visa type, in weeks',
      minWage: 'Full-time minimum wage (approx.)',
      traineeNote: '* Ausbildung: trainee pay. The minimum training allowance applies instead of the minimum wage.',
      embassyAvg: 'Average embassy waiting time: 3–8 weeks',
    },
    fit: {
      eyebrow: 'Which visa fits me?',
      title: 'Not sure? Take the 2-minute check',
      text: 'Answer a few questions about your profession, experience, German level and education – we will show you the best visa route and how ready you are.',
      points: ['Free, no registration', 'Visa recommendation for your profession', 'A list of next steps'],
      button: 'Start the check',
    },
    cta: {
      title: 'Picked your visa type? Let’s start on the documents',
      text: 'Open an online account – we create your personal document checklist and you follow every step of the process.',
      primary: 'Apply now',
      secondary: 'Get advice',
    },
  },
  visaDetail: {
    facts: {
      level: 'German',
      levelHint: 'recommended level',
      salary: 'Salary range',
      salaryHint: 'gross, monthly, indicative',
      processing: 'Processing time',
      processingHint: 'indicative, incl. approvals',
      family: 'Family reunion',
      familyHint: 'spouse and children',
      yes: 'Possible',
      no: 'Not intended',
      depends: 'Depends on the case',
      weeks: '{{min}}–{{max}} weeks',
      na: '—',
    },
    overview: 'Overview',
    highlights: 'Key points',
    requirements: {
      eyebrow: 'Requirements',
      title: 'Who can apply',
      subtitle: 'General conditions for this visa type. Exact requirements depend on the specific job.',
    },
    documents: {
      eyebrow: 'Documents',
      title: 'Document checklist',
      subtitle: 'The main documents you will prepare. You get a personal checklist in your account.',
      print: 'Print checklist',
      printHeading: 'Document checklist',
      printNote: 'General list; the exact documents depend on the embassy and the employer.',
    },
    timeline: {
      eyebrow: 'Timing',
      title: 'Indicative application timeline',
      subtitle: 'Dark part – shortest scenario, light part – possible extension.',
      aria: 'Indicative timeline of the application phases in weeks',
      axis: 'Week',
      total: 'About {{min}}–{{max}} weeks in total',
      phases: {
        consult: {
          title: 'Advice & documents',
          text: 'Eligibility check, collecting and translating documents',
        },
        contract: {
          title: 'Employer & contract',
          text: 'Interview, job offer and contract signing',
        },
        visa: {
          title: 'Approvals & visa',
          text: 'Required approvals, embassy appointment and decision',
        },
        arrival: {
          title: 'Arrival',
          text: 'Flight, pick-up and first working day',
        },
      },
      weeksShort: '{{min}}–{{max}} wks',
    },
    salary: {
      eyebrow: 'Salary',
      title: 'Indicative salary range',
      subtitle: 'Typical monthly gross salary in this field compared with the full-time minimum wage in Germany.',
      aria: 'Monthly gross salary range from {{min}} to {{max}}, minimum wage about {{ref}}',
      range: 'Typical range',
      minWage: 'Minimum wage (full-time, approx.)',
      trainee: 'During Ausbildung you receive trainee pay; the minimum training allowance applies here, not the minimum wage. Pay rises with each training year.',
      net: 'Your net amount depends on tax class, social insurance and family status.',
    },
    faq: {
      eyebrow: 'Questions',
      title: 'Questions about this visa',
    },
    services: {
      eyebrow: 'Support',
      title: 'How we help with this visa',
      subtitle: 'Our services most often needed for this visa type.',
    },
    others: 'Other visa types',
    side: {
      title: 'Want to apply for this visa?',
      text: 'Open an account – we prepare your document checklist and get started together.',
      apply: 'Apply now',
      employer: 'I am an employer',
      check: 'Check eligibility',
      call: 'Call',
    },
    empty: 'Information for this section will be added soon.',
    cta: {
      title: 'Let us check your documents for this visa',
      text: 'Send us your documents – our specialist will assess for free what is ready and what is still missing.',
      primary: 'Open an account',
      secondary: 'Contact us',
    },
  },
  servicesPage: {
    heroTitle: 'Our services: support for every stage',
    heroSubtitle: 'From candidate selection to language training, from the visa to the first working day in Germany – pick what you need.',
    grid: {
      eyebrow: 'Catalogue',
      title: 'All services',
      subtitle: 'Filter by audience and click a service for details.',
    },
    matrix: {
      eyebrow: 'What’s included for whom',
      title: 'Service matrix',
      subtitle: 'Which service is meant for companies, which for candidates – and roughly how long each takes.',
      cols: {
        service: 'Service',
        company: 'Companies',
        candidate: 'Candidates',
        phase: 'Stage',
        duration: 'Duration (approx.)',
      },
      included: 'Included',
      notIncluded: 'Not included',
      caption: 'Services by audience and stage',
    },
    journey: {
      eyebrow: 'How the services connect',
      title: 'The route: services in sequence',
      subtitle: 'Each service covers one stage of the journey. Choose one or all of them.',
      aria: 'Sequence of services across four stages',
      phases: [
        { title: 'Selection', text: 'Job profile and candidate selection' },
        {
          title: 'Preparation',
          text: 'Language, documents, recognition, training place',
        },
        { title: 'Visa', text: 'Approvals, embassy and decision' },
        { title: 'Arrival', text: 'Pick-up, registration and settling in' },
      ],
    },
    cta: {
      title: 'Let’s work out together which service you need',
      text: 'In a short call we listen to your situation and suggest only the services you actually need – nothing more.',
      company: 'Request as a company',
      candidate: 'Apply as a candidate',
    },
  },
  serviceDetail: {
    overview: 'About this service',
    steps: {
      eyebrow: 'Step by step',
      title: 'How this service works',
      duration: 'Indicative duration',
      step: 'Step {{n}}',
    },
    audience: {
      eyebrow: 'Who it’s for',
      title: 'Who this service is for',
      company: {
        title: 'German companies',
        points: ['Businesses with a lasting shortage of workers', 'Companies without experience in hiring from abroad', 'HR teams that want to hand the process to one partner'],
      },
      candidate: {
        title: 'Candidates from Azerbaijan',
        points: [
          'Professionals who want to work legally in Germany',
          'Anyone looking for reliable help with documents and the visa',
          'People who want someone by their side after arrival too',
        ],
      },
    },
    relatedVisas: {
      eyebrow: 'Related visas',
      title: 'Visas where this service is used',
    },
    faq: {
      eyebrow: 'Short answers',
      title: 'Questions about this service',
      durationQ: 'How long does this service take?',
      durationA: 'Roughly: {{duration}}. The exact time depends on your documents, the authorities’ workload and your personal situation.',
      items: {
        'candidate-selection': [
          {
            q: 'How do you check candidates’ language level?',
            a: 'If there is a certificate, we verify it; in addition we assess speaking skills in the interview. We agree the level needed for the role together with you.',
          },
          {
            q: 'What if the presented candidates don’t fit?',
            a: 'We refine the profile with you and continue the search. The terms for this are agreed in advance in the cooperation agreement.',
          },
        ],
        documents: [
          {
            q: 'Can I translate documents myself?',
            a: 'German authorities usually require translations by a sworn translator. Your own translation may not be accepted, so we check this in advance.',
          },
          {
            q: 'Does every document need an apostille?',
            a: 'No. It depends on the document type and the authority receiving it. We clarify this for each document individually.',
          },
        ],
        recognition: [
          {
            q: 'What if my qualification is not fully recognised?',
            a: 'With partial recognition, missing knowledge can be made up in Germany through an adaptation measure or exam (§16d). The outcome depends on the qualification and the profession.',
          },
          {
            q: 'Is recognition needed for every profession?',
            a: 'For regulated professions (e.g. nursing) yes. For other professions it depends on the visa type – in some cases there are routes without recognition.',
          },
        ],
        'visa-support': [
          {
            q: 'Do you guarantee the visa will be granted?',
            a: 'No, only the embassy and the German authorities decide. We make sure the application is complete and correct; around 98% of our applications have been successful.',
          },
          {
            q: 'What is the fast-track procedure (§81a)?',
            a: 'A fee-based procedure the employer starts with the foreigners’ authority in Germany, which can speed up approvals. Whether it makes sense depends on the individual case.',
          },
        ],
        'german-courses': [
          {
            q: 'How long does it take from zero to B1?',
            a: 'With an intensive course, usually 6–9 months. It depends on your pace, lesson hours and self-study.',
          },
          {
            q: 'Which certificates are accepted?',
            a: 'Most commonly Goethe, telc and ÖSD. The exact requirement is set by the visa type, the recognition authority and the employer.',
          },
        ],
        'arrival-integration': [
          {
            q: 'Who pays for accommodation?',
            a: 'It depends on the agreement with the employer: sometimes the employer provides housing, sometimes rent is deducted from wages. The terms are agreed in writing before arrival.',
          },
          {
            q: 'What do I need to do first after arriving?',
            a: 'Address registration (Anmeldung), a bank account and health insurance. We accompany you through each of these steps.',
          },
        ],
        'employer-services': [
          {
            q: 'What is the minimum number of workers I can request?',
            a: 'From one person. For larger volumes we split recruitment into phases and plan each group separately.',
          },
          {
            q: 'Is there support after the worker arrives?',
            a: 'Yes. In the first months you and your employee have a fixed contact person who resolves questions quickly.',
          },
        ],
        'ausbildung-placement': [
          {
            q: 'Is there an age limit for Ausbildung?',
            a: 'There is no legal age limit, but many companies prefer younger applicants. Your chances depend on the profession and the region.',
          },
          {
            q: 'Can I work on the side during training?',
            a: 'In some cases limited side work is possible. It depends on the conditions of your residence permit and should be checked in advance.',
          },
        ],
      },
    },
    form: {
      title: 'Get an offer for this service',
      text: 'Briefly describe your situation – we will come back within 24 hours with a concrete offer.',
    },
    side: {
      title: 'At a glance',
      audience: 'Audience',
      duration: 'Duration',
      steps: 'Steps',
      stepsCount: '{{count}} steps',
    },
    others: 'Other services',
    cta: {
      title: 'Want to combine this service with others?',
      text: 'Most of our clients choose several services as a package. Let’s put together the right combination for you.',
      button: 'Ask about a package',
      all: 'All services',
    },
  },
  ausbildungPage: {
    heroTitle: 'Ausbildung: paid vocational training in Germany',
    heroSubtitle: 'Part of the week at vocational school, the rest at the company – earn a monthly wage while gaining a state-recognised qualification.',
    facts: [
      { value: '2–3.5', label: 'years duration' },
      { value: '300+', label: 'recognised occupations' },
      { value: '≈€1,000–1,300', label: 'trainee pay per month' },
      { value: 'B1', label: 'recommended German level' },
    ],
    what: {
      eyebrow: 'Dual system',
      title: 'How does Ausbildung work?',
      paragraphs: [
        'Ausbildung is Germany’s dual vocational training system. You sign a training contract with a company, learn the practice on the job and the theory at vocational school (Berufsschule).',
        'Throughout the training the company pays you a monthly trainee wage. At the end you take the final exam before the Chamber of Industry and Commerce (IHK), the Chamber of Crafts (HWK) or the responsible state body.',
      ],
      weekTitle: 'A typical training week',
      weekAria: 'Typical week: three days at the company, two days at vocational school',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      company: 'Company',
      companyText: 'Hands-on practice in real work, with a trainer',
      school: 'Berufsschule',
      schoolText: 'Theory, German, subject lessons',
      note: 'Some occupations use block teaching: several weeks of school in a row, then the company. In nursing, practice rotates between hospital, care home and outpatient care.',
    },
    professions: {
      eyebrow: 'Occupations in demand',
      title: 'Occupations and indicative trainee pay',
      subtitle: 'Trainee pay rises every year. Gross, indicative figures – depending on company, region and collective agreement.',
      aria: 'Indicative monthly trainee pay in the 1st, 2nd and 3rd training year by occupation',
      years: ['1st year', '2nd year', '3rd year'],
      items: {
        nursing: 'Nurse (Pflegefachmann/-frau)',
        mechatronics: 'Mechatronics technician',
        electronics: 'Electronics technician',
        logistics: 'Warehouse logistics specialist',
        driver: 'Professional driver (Berufskraftfahrer)',
        cook: 'Cook',
        hotel: 'Hotel specialist',
      },
    },
    reqs: {
      eyebrow: 'Requirements',
      title: 'What you need to start',
      items: [
        {
          title: 'School certificate',
          text: 'Proof of secondary education; its recognition in Germany is checked.',
        },
        {
          title: 'German language',
          text: 'Usually B1; some occupations such as nursing may require B2.',
        },
        {
          title: 'Training contract',
          text: 'A signed Ausbildung contract with a German company.',
        },
        {
          title: 'Funding',
          text: 'If trainee pay is not enough, additional proof of funds may be required.',
        },
        {
          title: 'Health insurance',
          text: 'Travel and health insurance valid from day one.',
        },
        {
          title: 'Motivation',
          text: 'Genuine interest in the chosen occupation and a long-term plan.',
        },
      ],
    },
    timeline: {
      eyebrow: 'Year by year',
      title: 'From application to qualification',
      items: [
        {
          when: '6–12 months before',
          title: 'Choice & language',
          text: 'We choose the occupation, you start towards B1, and your CV and cover letter are prepared in German.',
        },
        {
          when: '3–6 months before',
          title: 'Applications & contract',
          text: 'Online interviews with companies and signing the training contract.',
        },
        {
          when: '1–3 months before',
          title: 'Visa (§16a)',
          text: 'Documents, embassy appointment, accommodation and travel planning.',
        },
        {
          when: '1st year',
          title: 'Getting started',
          text: 'Probation period, start at vocational school and the basics of the trade.',
        },
        {
          when: '2nd year',
          title: 'Building up',
          text: 'An intermediate exam in many occupations; more independence and responsibility.',
        },
        {
          when: '3rd year',
          title: 'Final exam',
          text: 'Final examination and a state-recognised vocational qualification.',
        },
        {
          when: 'Afterwards',
          title: 'Career',
          text: 'Work as a skilled worker with the matching residence permit – often at the same company.',
        },
      ],
    },
    faq: {
      eyebrow: 'About Ausbildung',
      title: 'Questions about Ausbildung',
      items: [
        {
          q: 'How much will I earn during Ausbildung?',
          a: 'It depends on the occupation, region and company. Typically around €1,000–1,300 gross per month, a bit more in nursing; pay rises with each training year. These figures are indicative.',
        },
        {
          q: 'Can I live on that?',
          a: 'It depends on rents and the region. If trainee pay does not cover living costs, additional proof of funds (e.g. a blocked account) may be required for the visa. We assess every case individually.',
        },
        {
          q: 'My German is not B1 yet. What now?',
          a: 'Some companies accept a start at a lower level, but B1 is recommended to succeed at vocational school. We organise language training alongside your applications.',
        },
        {
          q: 'What happens after Ausbildung?',
          a: 'With the qualification you can obtain a residence permit as a skilled worker; often the training company keeps you on. A time-limited permit to look for work may also be granted – conditions depend on the case.',
        },
        {
          q: 'Can I bring my family?',
          a: 'In some cases it is possible, but it requires sufficient income and housing – which is often difficult on trainee pay. An individual assessment is needed.',
        },
        {
          q: 'Can I change occupation or company?',
          a: 'It is possible, but requires a new contract and the approval of the foreigners’ authority. The outcome depends on the case, so talk to us first.',
        },
      ],
    },
    related: {
      eyebrow: 'Next step',
      title: 'Visa and placement service',
      subtitle: 'Read more about the Ausbildung visa or let us find the training place for you.',
    },
    cta: {
      title: 'Let’s find your training place together',
      text: 'Tell us your interests and your German level – we will suggest suitable occupations and real companies.',
      primary: 'Apply now',
      secondary: 'Eligibility check',
    },
  },
};

const ru: typeof az = {
  visasPage: {
    heroTitle: 'Рабочие визы в Германию: сравните и выберите',
    heroSubtitle: 'Требования к языку, диапазон зарплаты, сроки оформления и воссоединение семьи для каждого типа визы — на одной странице.',
    heroTypes: 'Типов виз: {{count}}',
    heroLevels: 'Немецкий от {{from}}',
    heroWeeks: '{{min}}–{{max}} недель оформления',
    indicative: 'Все цифры ориентировочные и могут отличаться в зависимости от работодателя, региона, тарифного соглашения и вашей ситуации.',
    grid: {
      eyebrow: 'Каталог виз',
      title: 'Найдите подходящий тип визы',
      subtitle: 'Фильтруйте по уровню языка, семейным планам и сроку работы.',
      filterLabel: 'Фильтр',
      filters: {
        all: 'Все',
        basic: 'Старт с A1–A2',
        advanced: 'От B1',
        family: 'Воссоединение семьи',
        longTerm: 'Долгосрочные',
        seasonal: 'Сезонные',
      },
      sortLabel: 'Сортировка',
      sort: {
        recommended: 'Рекомендуемые',
        salary: 'Зарплата: по убыванию',
        speed: 'Самое быстрое оформление',
        level: 'Уровень языка: по возрастанию',
      },
      results: 'Показано: {{count}} из {{total}}',
      empty: 'Под этот фильтр не подходит ни один тип визы.',
      reset: 'Сбросить фильтр',
    },
    compare: {
      eyebrow: 'Сравнение',
      title: 'Все типы виз в одной таблице',
      subtitle: 'Сравните правовое основание, уровень немецкого, зарплату и сроки рядом друг с другом.',
      cols: {
        visa: 'Тип визы',
        basis: 'Правовое основание',
        level: 'Немецкий',
        salary: 'Зарплата (брутто/мес.)',
        processing: 'Оформление',
        family: 'Воссоединение семьи',
      },
      open: 'Подробнее',
      caption: 'Сравнение типов виз',
    },
    charts: {
      eyebrow: 'В цифрах',
      title: 'Зарплата и сроки наглядно',
      subtitle: 'Каждая полоса показывает ориентировочный диапазон: левый край — минимум, правый — максимум.',
      salaryTitle: 'Ориентировочная зарплата брутто в месяц',
      salaryAria: 'Ориентировочные диапазоны месячной зарплаты брутто по типам виз',
      processingTitle: 'Ориентировочный срок оформления',
      processingAria: 'Ориентировочный срок оформления по типам виз, в неделях',
      minWage: 'Минимальная зарплата при полной занятости (прибл.)',
      traineeNote: '* Ausbildung: учебная зарплата. Действует не минимальная зарплата, а минимальное вознаграждение за обучение.',
      embassyAvg: 'Среднее ожидание в посольстве: 3–8 недель',
    },
    fit: {
      eyebrow: 'Какая виза подходит мне?',
      title: 'Не уверены? Пройдите тест за 2 минуты',
      text: 'Ответьте на несколько вопросов о профессии, опыте, уровне немецкого и образовании — мы покажем подходящий визовый путь и вашу готовность.',
      points: ['Бесплатно и без регистрации', 'Рекомендация визы под вашу профессию', 'Список следующих шагов'],
      button: 'Начать тест',
    },
    cta: {
      title: 'Выбрали тип визы? Начнём с документов',
      text: 'Откройте онлайн-кабинет — мы составим ваш персональный список документов, а вы будете видеть каждый шаг процесса.',
      primary: 'Подать заявку',
      secondary: 'Получить консультацию',
    },
  },
  visaDetail: {
    facts: {
      level: 'Немецкий',
      levelHint: 'рекомендуемый уровень',
      salary: 'Диапазон зарплаты',
      salaryHint: 'брутто, в месяц, ориентир',
      processing: 'Срок оформления',
      processingHint: 'ориентир, включая согласования',
      family: 'Воссоединение семьи',
      familyHint: 'супруг(а) и дети',
      yes: 'Возможно',
      no: 'Не предусмотрено',
      depends: 'Зависит от случая',
      weeks: '{{min}}–{{max}} недель',
      na: '—',
    },
    overview: 'Общая информация',
    highlights: 'Главное',
    requirements: {
      eyebrow: 'Требования',
      title: 'Кто может подать заявку',
      subtitle: 'Общие условия для этого типа визы. Точные требования зависят от конкретной вакансии.',
    },
    documents: {
      eyebrow: 'Документы',
      title: 'Список документов',
      subtitle: 'Основные документы, которые вы подготовите. В личном кабинете вы получите персональный список.',
      print: 'Распечатать список',
      printHeading: 'Список документов',
      printNote: 'Общий список; точный перечень зависит от посольства и работодателя.',
    },
    timeline: {
      eyebrow: 'Сроки',
      title: 'Ориентировочный график заявки',
      subtitle: 'Тёмная часть — самый короткий сценарий, светлая — возможное продление.',
      aria: 'Ориентировочный график этапов заявки в неделях',
      axis: 'Неделя',
      total: 'Всего примерно {{min}}–{{max}} недель',
      phases: {
        consult: {
          title: 'Консультация и документы',
          text: 'Проверка соответствия, сбор и перевод документов',
        },
        contract: {
          title: 'Работодатель и договор',
          text: 'Собеседование, предложение о работе и подписание договора',
        },
        visa: {
          title: 'Согласования и виза',
          text: 'Необходимые согласования, запись в посольство и решение',
        },
        arrival: {
          title: 'Приезд',
          text: 'Перелёт, встреча и первый рабочий день',
        },
      },
      weeksShort: '{{min}}–{{max}} нед.',
    },
    salary: {
      eyebrow: 'Зарплата',
      title: 'Ориентировочный диапазон зарплаты',
      subtitle: 'Типичная месячная зарплата брутто в этой сфере по сравнению с минимальной зарплатой в Германии при полной занятости.',
      aria: 'Диапазон месячной зарплаты брутто от {{min}} до {{max}}, минимальная зарплата примерно {{ref}}',
      range: 'Типичный диапазон',
      minWage: 'Минимальная зарплата (полная занятость, прибл.)',
      trainee:
        'Во время Ausbildung выплачивается учебная зарплата; здесь действует не минимальная зарплата, а минимальное вознаграждение за обучение. Оплата растёт с каждым годом обучения.',
      net: 'Сумма на руки зависит от налогового класса, социального страхования и семейного положения.',
    },
    faq: {
      eyebrow: 'Вопросы',
      title: 'Вопросы об этой визе',
    },
    services: {
      eyebrow: 'Поддержка',
      title: 'Как мы помогаем с этой визой',
      subtitle: 'Наши услуги, которые чаще всего нужны для этого типа визы.',
    },
    others: 'Другие типы виз',
    side: {
      title: 'Хотите подать заявку на эту визу?',
      text: 'Откройте кабинет — мы подготовим список документов и начнём вместе.',
      apply: 'Подать заявку',
      employer: 'Я работодатель',
      check: 'Проверить соответствие',
      call: 'Позвонить',
    },
    empty: 'Информация для этого раздела скоро появится.',
    cta: {
      title: 'Давайте проверим ваши документы для этой визы',
      text: 'Пришлите документы — наш специалист бесплатно оценит, что уже готово и чего не хватает.',
      primary: 'Открыть кабинет',
      secondary: 'Связаться с нами',
    },
  },
  servicesPage: {
    heroTitle: 'Наши услуги: поддержка на каждом этапе',
    heroSubtitle: 'От подбора кандидатов до языковых курсов, от визы до первого рабочего дня в Германии — выберите то, что вам нужно.',
    grid: {
      eyebrow: 'Каталог',
      title: 'Все услуги',
      subtitle: 'Фильтруйте по аудитории и нажмите на услугу, чтобы узнать подробности.',
    },
    matrix: {
      eyebrow: 'Что входит и для кого',
      title: 'Матрица услуг',
      subtitle: 'Какая услуга для компаний, какая для кандидатов — и сколько примерно занимает каждая.',
      cols: {
        service: 'Услуга',
        company: 'Компании',
        candidate: 'Кандидаты',
        phase: 'Этап',
        duration: 'Срок (прибл.)',
      },
      included: 'Входит',
      notIncluded: 'Не входит',
      caption: 'Услуги по аудитории и этапу',
    },
    journey: {
      eyebrow: 'Как связаны услуги',
      title: 'Маршрут: услуги по порядку',
      subtitle: 'Каждая услуга охватывает свой этап пути. Можно выбрать одну или все.',
      aria: 'Последовательность услуг по четырём этапам',
      phases: [
        { title: 'Подбор', text: 'Профиль вакансии и отбор кандидатов' },
        {
          title: 'Подготовка',
          text: 'Язык, документы, признание, место обучения',
        },
        { title: 'Виза', text: 'Согласования, посольство и решение' },
        { title: 'Приезд', text: 'Встреча, регистрация и адаптация' },
      ],
    },
    cta: {
      title: 'Давайте вместе определим, какая услуга вам нужна',
      text: 'В коротком разговоре мы выслушаем вашу ситуацию и предложим только те услуги, которые действительно нужны, — ничего лишнего.',
      company: 'Запрос от компании',
      candidate: 'Заявка кандидата',
    },
  },
  serviceDetail: {
    overview: 'Об услуге',
    steps: {
      eyebrow: 'Шаг за шагом',
      title: 'Как работает эта услуга',
      duration: 'Ориентировочный срок',
      step: 'Шаг {{n}}',
    },
    audience: {
      eyebrow: 'Для кого',
      title: 'Кому подходит эта услуга',
      company: {
        title: 'Немецкие компании',
        points: ['Предприятия с постоянной нехваткой работников', 'Компании без опыта найма из-за рубежа', 'HR-команды, которые хотят доверить процесс одному партнёру'],
      },
      candidate: {
        title: 'Кандидаты из Азербайджана',
        points: ['Специалисты, которые хотят легально работать в Германии', 'Те, кто ищет надёжную помощь с документами и визой', 'Те, кому важна поддержка и после приезда'],
      },
    },
    relatedVisas: {
      eyebrow: 'Связанные визы',
      title: 'Для каких виз используется эта услуга',
    },
    faq: {
      eyebrow: 'Коротко',
      title: 'Вопросы об этой услуге',
      durationQ: 'Сколько времени занимает эта услуга?',
      durationA: 'Примерно: {{duration}}. Точный срок зависит от ваших документов, загруженности ведомств и вашей ситуации.',
      items: {
        'candidate-selection': [
          {
            q: 'Как вы проверяете уровень языка кандидатов?',
            a: 'Если есть сертификат, мы проверяем его подлинность; дополнительно оцениваем разговорный уровень на собеседовании. Необходимый уровень для вакансии мы определяем вместе с вами.',
          },
          {
            q: 'Что, если представленные кандидаты не подойдут?',
            a: 'Мы уточняем профиль вместе с вами и продолжаем поиск. Условия этого заранее согласовываются в договоре о сотрудничестве.',
          },
        ],
        documents: [
          {
            q: 'Могу ли я перевести документы сам?',
            a: 'Немецкие ведомства обычно требуют перевод присяжного переводчика. Собственный перевод могут не принять, поэтому мы проверяем это заранее.',
          },
          {
            q: 'Нужен ли апостиль на каждый документ?',
            a: 'Нет. Это зависит от вида документа и ведомства, которое его принимает. Мы уточняем это по каждому документу отдельно.',
          },
        ],
        recognition: [
          {
            q: 'Что, если мой диплом признают не полностью?',
            a: 'При частичном признании недостающие знания можно восполнить в Германии через адаптационные меры или экзамен (§16d). Результат зависит от диплома и профессии.',
          },
          {
            q: 'Нужно ли признание для каждой профессии?',
            a: 'Для регулируемых профессий (например, медсестра) — да. Для других профессий это зависит от типа визы — иногда есть пути и без признания.',
          },
        ],
        'visa-support': [
          {
            q: 'Вы гарантируете выдачу визы?',
            a: 'Нет, решение принимают только посольство и немецкие ведомства. Мы обеспечиваем полноту и правильность заявки; около 98% наших заявок завершились успешно.',
          },
          {
            q: 'Что такое ускоренная процедура (§81a)?',
            a: 'Платная процедура, которую работодатель запускает через ведомство по делам иностранцев в Германии; она может ускорить согласования. Целесообразность зависит от конкретного случая.',
          },
        ],
        'german-courses': [
          {
            q: 'Сколько времени нужно с нуля до B1?',
            a: 'При интенсивном курсе обычно 6–9 месяцев. Это зависит от вашего темпа, количества занятий и самостоятельной работы.',
          },
          {
            q: 'Какие сертификаты признаются?',
            a: 'Чаще всего Goethe, telc и ÖSD. Конкретное требование определяют тип визы, орган признания и работодатель.',
          },
        ],
        'arrival-integration': [
          {
            q: 'Кто оплачивает жильё?',
            a: 'Это зависит от договорённости с работодателем: иногда он предоставляет жильё, иногда аренда удерживается из зарплаты. Условия фиксируются письменно до приезда.',
          },
          {
            q: 'Что нужно сделать в первую очередь после приезда?',
            a: 'Регистрация по месту жительства (Anmeldung), банковский счёт и медицинская страховка. Мы сопровождаем вас на каждом из этих шагов.',
          },
        ],
        'employer-services': [
          {
            q: 'Какое минимальное количество работников можно заказать?',
            a: 'От одного человека. При больших объёмах мы делим набор на этапы и планируем каждую группу отдельно.',
          },
          {
            q: 'Есть ли поддержка после приезда работника?',
            a: 'Да. В первые месяцы у вас и у работника есть постоянное контактное лицо, которое быстро решает вопросы.',
          },
        ],
        'ausbildung-placement': [
          {
            q: 'Есть ли возрастное ограничение для Ausbildung?',
            a: 'Законного ограничения нет, но многие предприятия предпочитают более молодых кандидатов. Шансы зависят от профессии и региона.',
          },
          {
            q: 'Можно ли подрабатывать во время обучения?',
            a: 'В некоторых случаях возможна подработка в ограниченном объёме. Это зависит от условий вида на жительство и должно быть проверено заранее.',
          },
        ],
      },
    },
    form: {
      title: 'Получите предложение по этой услуге',
      text: 'Кратко опишите вашу ситуацию — мы ответим в течение 24 часов с конкретным предложением.',
    },
    side: {
      title: 'Коротко',
      audience: 'Аудитория',
      duration: 'Срок',
      steps: 'Шаги',
      stepsCount: 'Шагов: {{count}}',
    },
    others: 'Другие услуги',
    cta: {
      title: 'Хотите объединить эту услугу с другими?',
      text: 'Большинство клиентов выбирают несколько услуг пакетом. Давайте вместе подберём подходящую комбинацию.',
      button: 'Спросить о пакете',
      all: 'Все услуги',
    },
  },
  ausbildungPage: {
    heroTitle: 'Ausbildung: оплачиваемое профобучение в Германии',
    heroSubtitle: 'Часть недели в профшколе, остальное — на предприятии: получайте зарплату и государственно признанный диплом.',
    facts: [
      { value: '2–3,5', label: 'года обучения' },
      { value: '300+', label: 'признанных профессий' },
      { value: '≈1000–1300 €', label: 'учебная зарплата в месяц' },
      { value: 'B1', label: 'рекомендуемый уровень языка' },
    ],
    what: {
      eyebrow: 'Дуальная система',
      title: 'Как устроен Ausbildung?',
      paragraphs: [
        'Ausbildung — это дуальная система профобучения в Германии. Вы заключаете договор об обучении с предприятием, осваиваете практику прямо на работе, а теорию — в профессиональной школе (Berufsschule).',
        'Всё время обучения предприятие платит вам ежемесячное учебное вознаграждение. В конце вы сдаёте итоговый экзамен в Торгово-промышленной палате (IHK), Ремесленной палате (HWK) или профильном государственном органе.',
      ],
      weekTitle: 'Типичная учебная неделя',
      weekAria: 'Типичная неделя: три дня на предприятии, два дня в профшколе',
      days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'],
      company: 'Предприятие',
      companyText: 'Практика в реальной работе под руководством наставника',
      school: 'Berufsschule',
      schoolText: 'Теория, немецкий, профильные предметы',
      note: 'В некоторых профессиях обучение идёт блоками: несколько недель школы подряд, затем предприятие. В сестринском деле практика чередуется между клиникой, домом престарелых и амбулаторной службой.',
    },
    professions: {
      eyebrow: 'Востребованные профессии',
      title: 'Профессии и ориентировочная учебная зарплата',
      subtitle: 'Учебная зарплата растёт каждый год. Суммы брутто и ориентировочные — зависят от предприятия, региона и тарифного соглашения.',
      aria: 'Ориентировочная месячная учебная зарплата на 1-м, 2-м и 3-м году обучения по профессиям',
      years: ['1-й год', '2-й год', '3-й год'],
      items: {
        nursing: 'Медсестра / медбрат (Pflegefachmann/-frau)',
        mechatronics: 'Мехатроник',
        electronics: 'Электроник',
        logistics: 'Специалист по складской логистике',
        driver: 'Профессиональный водитель (Berufskraftfahrer)',
        cook: 'Повар',
        hotel: 'Специалист гостиничного дела',
      },
    },
    reqs: {
      eyebrow: 'Требования',
      title: 'Что нужно для старта',
      items: [
        {
          title: 'Школьный аттестат',
          text: 'Документ о среднем образовании; его признание в Германии проверяется.',
        },
        {
          title: 'Немецкий язык',
          text: 'Обычно B1; в некоторых профессиях, например в сестринском деле, может требоваться B2.',
        },
        {
          title: 'Договор об обучении',
          text: 'Подписанный договор Ausbildung с немецким предприятием.',
        },
        {
          title: 'Финансирование',
          text: 'Если учебной зарплаты недостаточно, может потребоваться дополнительное подтверждение средств.',
        },
        {
          title: 'Медицинская страховка',
          text: 'Страховка для поездки и медицинская страховка с первого дня.',
        },
        {
          title: 'Мотивация',
          text: 'Интерес к выбранной профессии и долгосрочный план.',
        },
      ],
    },
    timeline: {
      eyebrow: 'Год за годом',
      title: 'От заявки до диплома',
      items: [
        {
          when: 'За 6–12 месяцев',
          title: 'Выбор профессии и язык',
          text: 'Выбираем профессию, вы начинаете подготовку к B1, резюме и мотивационное письмо готовятся на немецком.',
        },
        {
          when: 'За 3–6 месяцев',
          title: 'Заявки и договор',
          text: 'Онлайн-собеседования с предприятиями и подписание договора об обучении.',
        },
        {
          when: 'За 1–3 месяца',
          title: 'Виза (§16a)',
          text: 'Документы, запись в посольство, жильё и планирование переезда.',
        },
        {
          when: '1-й год',
          title: 'Начало',
          text: 'Испытательный срок, начало занятий в профшколе и основы профессии.',
        },
        {
          when: '2-й год',
          title: 'Развитие',
          text: 'Во многих профессиях промежуточный экзамен; больше самостоятельности и ответственности.',
        },
        {
          when: '3-й год',
          title: 'Итоговый экзамен',
          text: 'Итоговый экзамен и государственно признанный диплом.',
        },
        {
          when: 'Дальше',
          title: 'Карьера',
          text: 'Работа квалифицированным специалистом с соответствующим видом на жительство — часто на том же предприятии.',
        },
      ],
    },
    faq: {
      eyebrow: 'Об Ausbildung',
      title: 'Вопросы об Ausbildung',
      items: [
        {
          q: 'Сколько я буду получать во время Ausbildung?',
          a: 'Это зависит от профессии, региона и предприятия. Обычно около 1000–1300 € брутто в месяц, в сестринском деле немного больше; оплата растёт с каждым годом обучения. Цифры ориентировочные.',
        },
        {
          q: 'Можно ли на это жить?',
          a: 'Это зависит от стоимости аренды и региона. Если учебной зарплаты не хватает на жизнь, для визы может потребоваться дополнительное подтверждение средств (например, блокированный счёт). Мы оцениваем каждый случай отдельно.',
        },
        {
          q: 'Мой немецкий ещё не B1. Что делать?',
          a: 'Некоторые предприятия соглашаются на старт с более низким уровнем, но для успеха в профшколе рекомендуется B1. Мы организуем языковую подготовку параллельно с подачей заявок.',
        },
        {
          q: 'Что будет после окончания Ausbildung?',
          a: 'С дипломом можно получить вид на жительство как квалифицированный специалист; часто предприятие, где вы учились, берёт вас на работу. Также может быть выдано временное разрешение для поиска работы — условия зависят от случая.',
        },
        {
          q: 'Могу ли я привезти семью?',
          a: 'В некоторых случаях это возможно, но требуется достаточный доход и жильё — с учебной зарплатой это часто сложно. Нужна индивидуальная оценка.',
        },
        {
          q: 'Можно ли сменить профессию или предприятие?',
          a: 'Это возможно, но нужен новый договор и согласие ведомства по делам иностранцев. Результат зависит от конкретной ситуации, поэтому сначала посоветуйтесь с нами.',
        },
      ],
    },
    related: {
      eyebrow: 'Следующий шаг',
      title: 'Виза и услуга по трудоустройству',
      subtitle: 'Подробнее о визе для Ausbildung или поручите нам поиск места обучения.',
    },
    cta: {
      title: 'Найдём ваше место Ausbildung вместе',
      text: 'Напишите нам о своих интересах и уровне немецкого — мы предложим подходящие профессии и реальные предприятия.',
      primary: 'Подать заявку',
      secondary: 'Тест на соответствие',
    },
  },
};

export const pagesVisa = { az, de, en, ru };
