import type { pagesVisa } from '../../pagesVisa';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof pagesVisa)['en']> = {
  visasPage: {
    heroTitle: 'Almanya çalışma vizeleri: karşılaştırın ve seçin',
    heroSubtitle: 'Her vize türü için dil şartı, maaş aralığı, işlem süresi ve aile birleşimi – tek sayfada.',
    heroTypes: '{{count}} vize türü',
    heroLevels: '{{from}} seviyesinden itibaren Almanca',
    heroWeeks: '{{min}}–{{max}} hafta işlem süresi',
    indicative: 'Tüm rakamlar yaklaşık değerlerdir; işverene, bölgeye, toplu sözleşmeye ve kişisel duruma göre değişebilir.',
    grid: {
      eyebrow: 'Vize kataloğu',
      title: 'Size uygun vize türünü bulun',
      subtitle: 'Dil seviyesi, aile planları ve çalışma süresine göre filtreleyin.',
      filterLabel: 'Filtre',
      filters: {
        all: 'Tümü',
        basic: 'A1–A2 ile başlangıç',
        advanced: 'B1 ve üzeri',
        family: 'Aile birleşimi mümkün',
        longTerm: 'Uzun süreli',
        seasonal: 'Mevsimlik',
      },
      sortLabel: 'Sırala',
      sort: {
        recommended: 'Önerilen',
        salary: 'Maaş: yüksekten düşüğe',
        speed: 'En hızlı işlem',
        level: 'Almanca seviyesi: düşükten yükseğe',
      },
      results: '{{total}} sonuçtan {{count}} tanesi gösteriliyor',
      empty: 'Bu filtreye uyan vize türü yok.',
      reset: 'Filtreyi sıfırla',
    },
    compare: {
      eyebrow: 'Karşılaştırma',
      title: 'Tüm vize türleri tek tabloda',
      subtitle: 'Yasal dayanak, Almanca seviyesi, maaş aralığı ve süreleri yan yana karşılaştırın.',
      cols: {
        visa: 'Vize türü',
        basis: 'Yasal dayanak',
        level: 'Almanca',
        salary: 'Maaş (brüt/ay)',
        processing: 'İşlem süresi',
        family: 'Aile birleşimi',
      },
      open: 'Ayrıntılar',
      caption: 'Vize türlerinin karşılaştırması',
    },
    charts: {
      eyebrow: 'Rakamlarla',
      title: 'Maaş ve süreler bir bakışta',
      subtitle: 'Her çubuk yaklaşık bir aralığı gösterir: sol kenar – en düşük, sağ kenar – en yüksek.',
      salaryTitle: 'Yaklaşık aylık brüt maaş',
      salaryAria: 'Vize türüne göre yaklaşık aylık brüt maaş aralıkları',
      processingTitle: 'Yaklaşık işlem süresi',
      processingAria: 'Vize türüne göre hafta cinsinden yaklaşık işlem süresi',
      minWage: 'Tam zamanlı asgari ücret (yaklaşık)',
      traineeNote: '* Ausbildung: çırak ücreti. Asgari ücret yerine asgari eğitim ücreti geçerlidir.',
      embassyAvg: 'Ortalama konsolosluk bekleme süresi: 3–8 hafta',
    },
    fit: {
      eyebrow: 'Hangi vize bana uygun?',
      title: 'Emin değil misiniz? 2 dakikalık testi yapın',
      text: 'Mesleğiniz, deneyiminiz, Almanca seviyeniz ve eğitiminizle ilgili birkaç soruyu yanıtlayın – size en uygun vize yolunu ve ne kadar hazır olduğunuzu gösterelim.',
      points: ['Ücretsiz, kayıt gerektirmez', 'Mesleğinize uygun vize önerisi', 'Sonraki adımların listesi'],
      button: 'Testi başlat',
    },
    cta: {
      title: 'Vize türünüzü seçtiniz mi? Belgelerle başlayalım',
      text: 'Çevrimiçi bir hesap açın – kişisel belge listenizi hazırlayalım, sürecin her adımını takip edin.',
      primary: 'Hemen başvurun',
      secondary: 'Danışmanlık alın',
    },
  },
  visaDetail: {
    facts: {
      level: 'Almanca',
      levelHint: 'önerilen seviye',
      salary: 'Maaş aralığı',
      salaryHint: 'brüt, aylık, yaklaşık',
      processing: 'İşlem süresi',
      processingHint: 'yaklaşık, onaylar dahil',
      family: 'Aile birleşimi',
      familyHint: 'eş ve çocuklar',
      yes: 'Mümkün',
      no: 'Öngörülmemiş',
      depends: 'Duruma göre değişir',
      weeks: '{{min}}–{{max}} hafta',
      na: '—',
    },
    overview: 'Genel bakış',
    highlights: 'Öne çıkanlar',
    requirements: {
      eyebrow: 'Şartlar',
      title: 'Kimler başvurabilir',
      subtitle: 'Bu vize türü için genel koşullar. Kesin şartlar ilgili iş pozisyonuna bağlıdır.',
    },
    documents: {
      eyebrow: 'Belgeler',
      title: 'Belge listesi',
      subtitle: 'Hazırlayacağınız temel belgeler. Hesabınızda kişisel bir liste alırsınız.',
      print: 'Listeyi yazdır',
      printHeading: 'Belge listesi',
      printNote: 'Genel liste; kesin belgeler konsolosluğa ve işverene bağlıdır.',
    },
    timeline: {
      eyebrow: 'Süreler',
      title: 'Yaklaşık başvuru takvimi',
      subtitle: 'Koyu kısım – en kısa senaryo, açık kısım – olası uzama.',
      aria: 'Başvuru aşamalarının hafta cinsinden yaklaşık takvimi',
      axis: 'Hafta',
      total: 'Toplamda yaklaşık {{min}}–{{max}} hafta',
      phases: {
        consult: {
          title: 'Danışmanlık ve belgeler',
          text: 'Uygunluk kontrolü, belgelerin toplanması ve tercümesi',
        },
        contract: {
          title: 'İşveren ve sözleşme',
          text: 'Mülakat, iş teklifi ve sözleşmenin imzalanması',
        },
        visa: {
          title: 'Onaylar ve vize',
          text: 'Gerekli onaylar, konsolosluk randevusu ve karar',
        },
        arrival: {
          title: 'Varış',
          text: 'Uçuş, karşılama ve ilk iş günü',
        },
      },
      weeksShort: '{{min}}–{{max}} hf.',
    },
    salary: {
      eyebrow: 'Maaş',
      title: 'Yaklaşık maaş aralığı',
      subtitle: 'Bu alandaki tipik aylık brüt maaşın Almanya’daki tam zamanlı asgari ücretle karşılaştırması.',
      aria: '{{min}} ile {{max}} arasında aylık brüt maaş aralığı, asgari ücret yaklaşık {{ref}}',
      range: 'Tipik aralık',
      minWage: 'Asgari ücret (tam zamanlı, yaklaşık)',
      trainee: 'Ausbildung süresince çırak ücreti alırsınız; burada asgari ücret değil, asgari eğitim ücreti geçerlidir. Ücret her eğitim yılında artar.',
      net: 'Net tutarınız vergi sınıfına, sosyal sigortaya ve medeni durumunuza bağlıdır.',
    },
    faq: {
      eyebrow: 'Sorular',
      title: 'Bu vizeyle ilgili sorular',
    },
    services: {
      eyebrow: 'Destek',
      title: 'Bu vizede size nasıl yardımcı oluyoruz',
      subtitle: 'Bu vize türü için en sık ihtiyaç duyulan hizmetlerimiz.',
    },
    others: 'Diğer vize türleri',
    side: {
      title: 'Bu vizeye başvurmak mı istiyorsunuz?',
      text: 'Bir hesap açın – belge listenizi hazırlayalım ve birlikte başlayalım.',
      apply: 'Hemen başvurun',
      employer: 'İşverenim',
      check: 'Uygunluğu kontrol et',
      call: 'Ara',
    },
    empty: 'Bu bölümün bilgileri yakında eklenecek.',
    cta: {
      title: 'Bu vize için belgelerinizi kontrol edelim',
      text: 'Belgelerinizi gönderin – uzmanımız neyin hazır olduğunu ve neyin eksik olduğunu ücretsiz değerlendirsin.',
      primary: 'Hesap açın',
      secondary: 'Bize ulaşın',
    },
  },
  servicesPage: {
    heroTitle: 'Hizmetlerimiz: her aşamada destek',
    heroSubtitle: 'Aday seçiminden dil eğitimine, vizeden Almanya’daki ilk iş gününe kadar – ihtiyacınız olanı seçin.',
    grid: {
      eyebrow: 'Katalog',
      title: 'Tüm hizmetler',
      subtitle: 'Hedef kitleye göre filtreleyin, ayrıntılar için bir hizmete tıklayın.',
    },
    matrix: {
      eyebrow: 'Kime ne dahil',
      title: 'Hizmet matrisi',
      subtitle: 'Hangi hizmet şirketler, hangisi adaylar için – ve her biri yaklaşık ne kadar sürer.',
      cols: {
        service: 'Hizmet',
        company: 'Şirketler',
        candidate: 'Adaylar',
        phase: 'Aşama',
        duration: 'Süre (yaklaşık)',
      },
      included: 'Dahil',
      notIncluded: 'Dahil değil',
      caption: 'Hedef kitle ve aşamaya göre hizmetler',
    },
    journey: {
      eyebrow: 'Hizmetler nasıl birbirine bağlanır',
      title: 'Yol haritası: hizmetler sırasıyla',
      subtitle: 'Her hizmet yolculuğun bir aşamasını kapsar. Birini ya da hepsini seçin.',
      aria: 'Dört aşamada hizmetlerin sırası',
      phases: [
        { title: 'Seçim', text: 'İş profili ve aday seçimi' },
        {
          title: 'Hazırlık',
          text: 'Dil, belgeler, denklik, eğitim yeri',
        },
        { title: 'Vize', text: 'Onaylar, konsolosluk ve karar' },
        { title: 'Varış', text: 'Karşılama, adres kaydı ve uyum' },
      ],
    },
    cta: {
      title: 'Hangi hizmete ihtiyacınız olduğunu birlikte belirleyelim',
      text: 'Kısa bir görüşmede durumunuzu dinliyor ve yalnızca gerçekten ihtiyacınız olan hizmetleri öneriyoruz – fazlasını değil.',
      company: 'Şirket olarak talep edin',
      candidate: 'Aday olarak başvurun',
    },
  },
  serviceDetail: {
    overview: 'Bu hizmet hakkında',
    steps: {
      eyebrow: 'Adım adım',
      title: 'Bu hizmet nasıl işler',
      duration: 'Yaklaşık süre',
      step: 'Adım {{n}}',
    },
    audience: {
      eyebrow: 'Kimler için',
      title: 'Bu hizmet kimler için',
      company: {
        title: 'Alman şirketleri',
        points: ['Kalıcı işgücü açığı olan işletmeler', 'Yurt dışından işe alım deneyimi olmayan şirketler', 'Süreci tek bir ortağa devretmek isteyen İK ekipleri'],
      },
      candidate: {
        title: 'Azerbaycan’dan adaylar',
        points: [
          'Almanya’da yasal olarak çalışmak isteyen uzmanlar',
          'Belgeler ve vize için güvenilir destek arayan herkes',
          'Varıştan sonra da yanında birinin olmasını isteyenler',
        ],
      },
    },
    relatedVisas: {
      eyebrow: 'İlgili vizeler',
      title: 'Bu hizmetin kullanıldığı vizeler',
    },
    faq: {
      eyebrow: 'Kısa yanıtlar',
      title: 'Bu hizmetle ilgili sorular',
      durationQ: 'Bu hizmet ne kadar sürer?',
      durationA: 'Yaklaşık: {{duration}}. Kesin süre belgelerinize, kurumların iş yüküne ve kişisel durumunuza bağlıdır.',
      items: {
        'candidate-selection': [
          {
            q: 'Adayların dil seviyesini nasıl kontrol ediyorsunuz?',
            a: 'Sertifika varsa doğruluyoruz; ayrıca mülakatta konuşma becerisini değerlendiriyoruz. Pozisyon için gereken seviyeyi sizinle birlikte belirliyoruz.',
          },
          {
            q: 'Sunulan adaylar uygun değilse ne olur?',
            a: 'Profili sizinle birlikte netleştirip aramaya devam ediyoruz. Bunun koşulları işbirliği sözleşmesinde önceden belirlenir.',
          },
        ],
        documents: [
          {
            q: 'Belgeleri kendim tercüme edebilir miyim?',
            a: 'Alman makamları genellikle yeminli tercüman tarafından yapılmış tercüme ister. Kendi tercümeniz kabul edilmeyebilir; bu nedenle bunu önceden kontrol ediyoruz.',
          },
          {
            q: 'Her belgeye apostil gerekir mi?',
            a: 'Hayır. Bu, belge türüne ve belgeyi alacak makama bağlıdır. Bunu her belge için ayrı ayrı netleştiriyoruz.',
          },
        ],
        recognition: [
          {
            q: 'Mesleki yeterliliğim tam olarak tanınmazsa ne olur?',
            a: 'Kısmi denklikte eksik bilgiler Almanya’da bir uyum önlemi veya sınavla tamamlanabilir (§16d). Sonuç, yeterliliğe ve mesleğe bağlıdır.',
          },
          {
            q: 'Her meslek için denklik gerekli mi?',
            a: 'Düzenlenmiş meslekler (ör. hemşirelik) için evet. Diğer mesleklerde vize türüne bağlıdır – bazı durumlarda denkliksiz yollar da vardır.',
          },
        ],
        'visa-support': [
          {
            q: 'Vizenin verileceğini garanti ediyor musunuz?',
            a: 'Hayır, kararı yalnızca konsolosluk ve Alman makamları verir. Başvurunun eksiksiz ve doğru olmasını sağlıyoruz; başvurularımızın yaklaşık %98’i olumlu sonuçlanmıştır.',
          },
          {
            q: 'Hızlandırılmış işlem (§81a) nedir?',
            a: 'İşverenin Almanya’daki yabancılar dairesinde başlattığı, onayları hızlandırabilen ücretli bir işlemdir. Mantıklı olup olmadığı somut duruma bağlıdır.',
          },
        ],
        'german-courses': [
          {
            q: 'Sıfırdan B1’e ne kadar sürer?',
            a: 'Yoğun kursla genellikle 6–9 ay. Bu; temponuza, ders saatlerine ve bireysel çalışmanıza bağlıdır.',
          },
          {
            q: 'Hangi sertifikalar kabul edilir?',
            a: 'En yaygın olanlar Goethe, telc ve ÖSD’dir. Kesin şartı vize türü, denklik makamı ve işveren belirler.',
          },
        ],
        'arrival-integration': [
          {
            q: 'Konaklamayı kim öder?',
            a: 'İşverenle yapılan anlaşmaya bağlıdır: bazen işveren konut sağlar, bazen kira maaştan kesilir. Koşullar varıştan önce yazılı olarak belirlenir.',
          },
          {
            q: 'Vardıktan sonra ilk olarak ne yapmalıyım?',
            a: 'Adres kaydı (Anmeldung), banka hesabı ve sağlık sigortası. Bu adımların her birinde size eşlik ediyoruz.',
          },
        ],
        'employer-services': [
          {
            q: 'En az kaç çalışan talep edebilirim?',
            a: 'Bir kişiden itibaren. Daha büyük hacimlerde işe alımı aşamalara bölüyor ve her grubu ayrı planlıyoruz.',
          },
          {
            q: 'Çalışan geldikten sonra destek var mı?',
            a: 'Evet. İlk aylarda sizin ve çalışanınızın soruları hızla çözen sabit bir irtibat kişisi olur.',
          },
        ],
        'ausbildung-placement': [
          {
            q: 'Ausbildung için yaş sınırı var mı?',
            a: 'Yasal bir yaş sınırı yoktur, ancak birçok şirket daha genç adayları tercih eder. Şansınız mesleğe ve bölgeye bağlıdır.',
          },
          {
            q: 'Eğitim sırasında ek iş yapabilir miyim?',
            a: 'Bazı durumlarda sınırlı ek iş mümkündür. Bu, oturma izninizin koşullarına bağlıdır ve önceden kontrol edilmelidir.',
          },
        ],
      },
    },
    form: {
      title: 'Bu hizmet için teklif alın',
      text: 'Durumunuzu kısaca anlatın – 24 saat içinde somut bir teklifle size dönelim.',
    },
    side: {
      title: 'Bir bakışta',
      audience: 'Hedef kitle',
      duration: 'Süre',
      steps: 'Adımlar',
      stepsCount: '{{count}} adım',
    },
    others: 'Diğer hizmetler',
    cta: {
      title: 'Bu hizmeti başkalarıyla birleştirmek mi istiyorsunuz?',
      text: 'Müşterilerimizin çoğu birkaç hizmeti paket olarak seçiyor. Size uygun kombinasyonu birlikte oluşturalım.',
      button: 'Paket hakkında sorun',
      all: 'Tüm hizmetler',
    },
  },
  ausbildungPage: {
    heroTitle: 'Ausbildung: Almanya’da ücretli mesleki eğitim',
    heroSubtitle: 'Haftanın bir kısmı meslek okulunda, kalanı şirkette – devletçe tanınan bir meslek kazanırken her ay maaş alın.',
    facts: [
      { value: '2–3,5', label: 'yıl süre' },
      { value: '300+', label: 'tanınan meslek' },
      { value: '≈1.000–1.300 €', label: 'aylık çırak ücreti' },
      { value: 'B1', label: 'önerilen Almanca seviyesi' },
    ],
    what: {
      eyebrow: 'İkili sistem',
      title: 'Ausbildung nasıl işler?',
      paragraphs: [
        'Ausbildung, Almanya’nın ikili mesleki eğitim sistemidir. Bir şirketle eğitim sözleşmesi imzalar, pratiği iş başında, teoriyi meslek okulunda (Berufsschule) öğrenirsiniz.',
        'Eğitim boyunca şirket size aylık çırak ücreti öder. Sonunda Sanayi ve Ticaret Odası (IHK), Zanaatkârlar Odası (HWK) veya yetkili devlet kurumu önünde bitirme sınavına girersiniz.',
      ],
      weekTitle: 'Tipik bir eğitim haftası',
      weekAria: 'Tipik hafta: üç gün şirkette, iki gün meslek okulunda',
      days: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
      company: 'Şirket',
      companyText: 'Bir eğitmen eşliğinde gerçek işte uygulama',
      school: 'Berufsschule',
      schoolText: 'Teori, Almanca, meslek dersleri',
      note: 'Bazı mesleklerde blok eğitim uygulanır: birkaç hafta üst üste okul, ardından şirket. Hemşirelikte uygulama hastane, bakımevi ve evde bakım arasında dönüşümlüdür.',
    },
    professions: {
      eyebrow: 'Aranan meslekler',
      title: 'Meslekler ve yaklaşık çırak ücretleri',
      subtitle: 'Çırak ücreti her yıl artar. Brüt, yaklaşık rakamlar – şirkete, bölgeye ve toplu sözleşmeye bağlıdır.',
      aria: 'Mesleğe göre 1., 2. ve 3. eğitim yılında yaklaşık aylık çırak ücreti',
      years: ['1. yıl', '2. yıl', '3. yıl'],
      items: {
        nursing: 'Hemşire (Pflegefachmann/-frau)',
        mechatronics: 'Mekatronik teknisyeni',
        electronics: 'Elektronik teknisyeni',
        logistics: 'Depo lojistiği uzmanı',
        driver: 'Profesyonel sürücü (Berufskraftfahrer)',
        cook: 'Aşçı',
        hotel: 'Otelcilik uzmanı',
      },
    },
    reqs: {
      eyebrow: 'Şartlar',
      title: 'Başlamak için neye ihtiyacınız var',
      items: [
        {
          title: 'Okul diploması',
          text: 'Ortaöğretim belgesi; Almanya’da tanınıp tanınmadığı kontrol edilir.',
        },
        {
          title: 'Almanca',
          text: 'Genellikle B1; hemşirelik gibi bazı mesleklerde B2 istenebilir.',
        },
        {
          title: 'Eğitim sözleşmesi',
          text: 'Bir Alman şirketiyle imzalanmış Ausbildung sözleşmesi.',
        },
        {
          title: 'Finansman',
          text: 'Çırak ücreti yetmezse ek mali yeterlilik kanıtı istenebilir.',
        },
        {
          title: 'Sağlık sigortası',
          text: 'İlk günden itibaren geçerli seyahat ve sağlık sigortası.',
        },
        {
          title: 'Motivasyon',
          text: 'Seçilen mesleğe gerçek ilgi ve uzun vadeli bir plan.',
        },
      ],
    },
    timeline: {
      eyebrow: 'Yıl yıl',
      title: 'Başvurudan mesleki yeterliliğe',
      items: [
        {
          when: '6–12 ay önce',
          title: 'Seçim ve dil',
          text: 'Mesleği seçiyoruz, siz B1 hedefiyle başlıyorsunuz; Almanca özgeçmiş ve ön yazınız hazırlanıyor.',
        },
        {
          when: '3–6 ay önce',
          title: 'Başvurular ve sözleşme',
          text: 'Şirketlerle çevrimiçi mülakatlar ve eğitim sözleşmesinin imzalanması.',
        },
        {
          when: '1–3 ay önce',
          title: 'Vize (§16a)',
          text: 'Belgeler, konsolosluk randevusu, konaklama ve seyahat planlaması.',
        },
        {
          when: '1. yıl',
          title: 'Başlangıç',
          text: 'Deneme süresi, meslek okuluna başlangıç ve mesleğin temelleri.',
        },
        {
          when: '2. yıl',
          title: 'Gelişim',
          text: 'Birçok meslekte ara sınav; daha fazla bağımsızlık ve sorumluluk.',
        },
        {
          when: '3. yıl',
          title: 'Bitirme sınavı',
          text: 'Bitirme sınavı ve devletçe tanınan mesleki yeterlilik.',
        },
        {
          when: 'Sonrasında',
          title: 'Kariyer',
          text: 'Uygun oturma izniyle kalifiye eleman olarak çalışma – çoğu zaman aynı şirkette.',
        },
      ],
    },
    faq: {
      eyebrow: 'Ausbildung hakkında',
      title: 'Ausbildung ile ilgili sorular',
      items: [
        {
          q: 'Ausbildung sırasında ne kadar kazanırım?',
          a: 'Mesleğe, bölgeye ve şirkete bağlıdır. Genellikle aylık brüt 1.000–1.300 € civarında, hemşirelikte biraz daha fazla; ücret her eğitim yılında artar. Bu rakamlar yaklaşıktır.',
        },
        {
          q: 'Bununla geçinebilir miyim?',
          a: 'Kiralara ve bölgeye bağlıdır. Çırak ücreti yaşam masraflarını karşılamazsa vize için ek mali yeterlilik kanıtı (ör. bloke hesap) istenebilir. Her durumu ayrı ayrı değerlendiriyoruz.',
        },
        {
          q: 'Almancam henüz B1 değil. Ne yapmalıyım?',
          a: 'Bazı şirketler daha düşük seviyeyle başlamayı kabul eder, ancak meslek okulunda başarılı olmak için B1 önerilir. Başvurularınızla paralel olarak dil eğitimini organize ediyoruz.',
        },
        {
          q: 'Ausbildung’dan sonra ne olur?',
          a: 'Mesleki yeterlilikle kalifiye eleman olarak oturma izni alabilirsiniz; çoğu zaman eğitim aldığınız şirket sizi işe devam ettirir. İş aramak için süreli bir izin de verilebilir – koşullar duruma bağlıdır.',
        },
        {
          q: 'Ailemi yanıma getirebilir miyim?',
          a: 'Bazı durumlarda mümkündür, ancak yeterli gelir ve konut gerektirir – bu da çırak ücretiyle çoğu zaman zordur. Bireysel değerlendirme gerekir.',
        },
        {
          q: 'Meslek veya şirket değiştirebilir miyim?',
          a: 'Mümkündür, ancak yeni bir sözleşme ve yabancılar dairesinin onayı gerekir. Sonuç duruma bağlıdır; bu yüzden önce bizimle görüşün.',
        },
      ],
    },
    related: {
      eyebrow: 'Sonraki adım',
      title: 'Vize ve yerleştirme hizmeti',
      subtitle: 'Ausbildung vizesi hakkında daha fazla bilgi edinin veya eğitim yerinizi bizim bulmamıza izin verin.',
    },
    cta: {
      title: 'Eğitim yerinizi birlikte bulalım',
      text: 'İlgi alanlarınızı ve Almanca seviyenizi bize söyleyin – uygun meslekleri ve gerçek şirketleri önerelim.',
      primary: 'Hemen başvurun',
      secondary: 'Uygunluk kontrolü',
    },
  },
};

export default copy;
