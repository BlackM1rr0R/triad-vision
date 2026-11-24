// Prefilled document templates (components/docTemplates): the client cabinet card "Hazır sənəd şablonları" on the
// case documents tab and the staff panel on the admin case documents tab. Registered with registerCopy(pagesDocTemplates).
// We prepare documents; the client applies; the embassy decides — the texts never say we submit VIDEX.

const az = {
  docTemplates: {
    title: 'Hazır sənəd şablonları',
    intro: 'Bu sənədlər profilinizdəki və müraciətinizdəki məlumatlarla avtomatik doldurulur. Endirin, yoxlayın, lazım olsa düzəldin.',
    note: 'Biz yalnız sənədləri hazırlayırıq. Müraciəti Siz edirsiniz, qərarı səfirlik verir.',
    download: 'PDF endir',
    error: 'PDF hazırlanmadı. Bir az sonra yenə cəhd edin.',
    language: 'Vərəqin dili',
    allFilled: 'Bütün vacib cavablar var',
    missing: '{{count}} cavab çatışmır',
    unavailable: 'Bu şablon yalnız əsas müraciət sahibi üçündür.',
    kinds: {
      videx: {
        name: 'VIDEX hazırlıq vərəqi',
        what: 'VIDEX (səfirliyin onlayn viza anketi) üçün bütün cavablar bir vərəqdə. Anketi Siz özünüz doldurursunuz. Sarı xanaları əvvəlcədən hazırlayın.',
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (avtomatik)',
        what: 'Almaniya üçün cədvəl şəklində CV (Lebenslauf), alman dilində.',
        fromProfile: 'Profilinizdən hazırlandı. Daha dolğun CV üçün CV qurucusunu doldurun.',
        fromCv: 'CV qurucusundakı məlumatlarınızdan hazırlandı.',
        openCv: 'CV qurucusunu aç',
      },
      anschreiben: {
        name: 'Müşayiət məktubu (Anschreiben)',
        what: 'Peşəniz üçün alman dilində məktub nümunəsi. Göndərməzdən əvvəl oxuyun və düzəldin.',
      },
    },
    staff: {
      title: 'Hazır sənəd şablonları',
      intro: 'Müştərinin profili və müraciət məlumatları ilə avtomatik doldurulur. Yalnız “Qovluğa əlavə et” bir nüsxə saxlayır.',
      attach: 'Qovluğa əlavə et',
      attached: 'Müştəri qovluğuna əlavə edildi: {{name}}',
      noFolder: 'Bu müraciətin Drive qovluğu yoxdur.',
    },
  },
};

const de: typeof az = {
  docTemplates: {
    title: 'Fertige Dokumentvorlagen',
    intro: 'Diese Dokumente werden automatisch mit den Angaben aus Ihrem Profil und Ihrem Antrag ausgefüllt. Herunterladen, prüfen, bei Bedarf anpassen.',
    note: 'Wir bereiten nur die Unterlagen vor. Den Antrag stellen Sie selbst, die Entscheidung trifft die Botschaft.',
    download: 'PDF herunterladen',
    error: 'Das PDF konnte nicht erstellt werden. Bitte später erneut versuchen.',
    language: 'Sprache des Blatts',
    allFilled: 'Alle Pflichtangaben vorhanden',
    missing: '{{count}} Angaben fehlen',
    unavailable: 'Diese Vorlage gibt es nur für den Hauptantrag.',
    kinds: {
      videx: {
        name: 'VIDEX-Vorbereitungsblatt',
        what: 'Alle Antworten für VIDEX (Online-Visumantrag der Botschaft) auf einem Blatt. Den Antrag füllen Sie selbst aus. Gelbe Felder bitte vorher klären.',
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (automatisch)',
        what: 'Tabellarischer Lebenslauf auf Deutsch.',
        fromProfile: 'Aus Ihrem Profil erstellt. Für einen vollständigeren Lebenslauf den CV-Editor ausfüllen.',
        fromCv: 'Aus Ihren Angaben im CV-Editor erstellt.',
        openCv: 'CV-Editor öffnen',
      },
      anschreiben: {
        name: 'Anschreiben',
        what: 'Musteranschreiben auf Deutsch für Ihren Beruf. Vor dem Versand lesen und anpassen.',
      },
    },
    staff: {
      title: 'Fertige Dokumentvorlagen',
      intro: 'Automatisch aus Profil und Antragsdaten ausgefüllt. Nur „In Ordner ablegen“ speichert eine Kopie.',
      attach: 'In Ordner ablegen',
      attached: 'Im Kundenordner abgelegt: {{name}}',
      noFolder: 'Für diesen Antrag gibt es keinen Drive-Ordner.',
    },
  },
};

const en: typeof az = {
  docTemplates: {
    title: 'Ready document templates',
    intro: 'These documents are filled in automatically from your profile and application. Download, check and correct them if needed.',
    note: 'We only prepare the documents. You apply yourself and the embassy decides.',
    download: 'Download PDF',
    error: 'The PDF could not be created. Please try again later.',
    language: 'Sheet language',
    allFilled: 'All required answers are there',
    missing: '{{count}} answers missing',
    unavailable: 'This template is only for the main applicant.',
    kinds: {
      videx: {
        name: 'VIDEX preparation sheet',
        what: "All answers for VIDEX (the embassy's online visa form) on one sheet. You fill in the form yourself. Prepare the yellow boxes first.",
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (automatic)',
        what: 'German tabular CV (Lebenslauf).',
        fromProfile: 'Made from your profile. Fill in the CV builder for a fuller CV.',
        fromCv: 'Made from your CV builder data.',
        openCv: 'Open CV builder',
      },
      anschreiben: {
        name: 'Cover letter (Anschreiben)',
        what: 'Sample German cover letter for your profession. Read and adjust it before sending.',
      },
    },
    staff: {
      title: 'Ready document templates',
      intro: 'Filled in automatically from the client profile and case data. Only "Add to folder" keeps a copy.',
      attach: 'Add to folder',
      attached: 'Added to the client folder: {{name}}',
      noFolder: 'This case has no Drive folder.',
    },
  },
};

const ru: typeof az = {
  docTemplates: {
    title: 'Готовые шаблоны документов',
    intro: 'Эти документы заполняются автоматически данными вашего профиля и заявки. Скачайте, проверьте и при необходимости исправьте.',
    note: 'Мы только готовим документы. Подаёте вы сами, решение принимает посольство.',
    download: 'Скачать PDF',
    error: 'Не удалось создать PDF. Попробуйте позже.',
    language: 'Язык листа',
    allFilled: 'Все обязательные ответы есть',
    missing: 'Не хватает ответов: {{count}}',
    unavailable: 'Этот шаблон только для основного заявителя.',
    kinds: {
      videx: {
        name: 'Лист подготовки к VIDEX',
        what: 'Все ответы для VIDEX (онлайн-анкеты посольства) на одном листе. Анкету вы заполняете сами. Жёлтые поля подготовьте заранее.',
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (автоматически)',
        what: 'Резюме в немецком табличном формате (Lebenslauf).',
        fromProfile: 'Создано из вашего профиля. Для более полного резюме заполните конструктор CV.',
        fromCv: 'Создано из данных конструктора CV.',
        openCv: 'Открыть конструктор CV',
      },
      anschreiben: {
        name: 'Сопроводительное письмо (Anschreiben)',
        what: 'Образец письма на немецком для вашей профессии. Прочитайте и поправьте перед отправкой.',
      },
    },
    staff: {
      title: 'Готовые шаблоны документов',
      intro: 'Заполняется автоматически из профиля клиента и данных заявки. Копию сохраняет только «Добавить в папку».',
      attach: 'Добавить в папку',
      attached: 'Добавлено в папку клиента: {{name}}',
      noFolder: 'У этой заявки нет папки в Drive.',
    },
  },
};

const tr: typeof az = {
  docTemplates: {
    title: 'Hazır belge şablonları',
    intro: 'Bu belgeler profilinizdeki ve başvurunuzdaki bilgilerle otomatik doldurulur. İndirin, kontrol edin, gerekirse düzeltin.',
    note: 'Biz yalnızca belgeleri hazırlarız. Başvuruyu siz yaparsınız, kararı büyükelçilik verir.',
    download: 'PDF indir',
    error: 'PDF oluşturulamadı. Lütfen daha sonra tekrar deneyin.',
    language: 'Sayfanın dili',
    allFilled: 'Tüm zorunlu cevaplar mevcut',
    missing: '{{count}} cevap eksik',
    unavailable: 'Bu şablon yalnızca ana başvuru sahibi içindir.',
    kinds: {
      videx: {
        name: 'VIDEX hazırlık sayfası',
        what: 'VIDEX (büyükelçiliğin çevrimiçi vize formu) için tüm cevaplar tek sayfada. Formu kendiniz doldurursunuz. Sarı kutuları önceden hazırlayın.',
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (otomatik)',
        what: 'Almanya için tablo biçiminde özgeçmiş (Lebenslauf), Almanca.',
        fromProfile: 'Profilinizden hazırlandı. Daha dolu bir özgeçmiş için CV oluşturucuyu doldurun.',
        fromCv: 'CV oluşturucudaki bilgilerinizden hazırlandı.',
        openCv: 'CV oluşturucuyu aç',
      },
      anschreiben: {
        name: 'Ön yazı (Anschreiben)',
        what: 'Mesleğiniz için Almanca ön yazı örneği. Göndermeden önce okuyun ve düzeltin.',
      },
    },
    staff: {
      title: 'Hazır belge şablonları',
      intro: 'Müşteri profili ve başvuru bilgileriyle otomatik doldurulur. Yalnızca “Klasöre ekle” bir kopya saklar.',
      attach: 'Klasöre ekle',
      attached: 'Müşteri klasörüne eklendi: {{name}}',
      noFolder: 'Bu başvurunun Drive klasörü yok.',
    },
  },
};

const uk: typeof az = {
  docTemplates: {
    title: 'Готові шаблони документів',
    intro: 'Ці документи заповнюються автоматично даними вашого профілю та заявки. Завантажте, перевірте й за потреби виправте.',
    note: 'Ми лише готуємо документи. Подаєте ви самі, рішення ухвалює посольство.',
    download: 'Завантажити PDF',
    error: 'Не вдалося створити PDF. Спробуйте пізніше.',
    language: 'Мова аркуша',
    allFilled: 'Усі обовʼязкові відповіді є',
    missing: 'Бракує відповідей: {{count}}',
    unavailable: 'Цей шаблон лише для основного заявника.',
    kinds: {
      videx: {
        name: 'Аркуш підготовки до VIDEX',
        what: 'Усі відповіді для VIDEX (онлайн-анкети посольства) на одному аркуші. Анкету ви заповнюєте самі. Жовті поля підготуйте заздалегідь.',
      },
      lebenslauf: {
        name: 'Lebenslauf PDF (автоматично)',
        what: 'Резюме в німецькому табличному форматі (Lebenslauf).',
        fromProfile: 'Створено з вашого профілю. Для повнішого резюме заповніть конструктор CV.',
        fromCv: 'Створено з даних конструктора CV.',
        openCv: 'Відкрити конструктор CV',
      },
      anschreiben: {
        name: 'Супровідний лист (Anschreiben)',
        what: 'Зразок листа німецькою для вашої професії. Прочитайте й виправте перед надсиланням.',
      },
    },
    staff: {
      title: 'Готові шаблони документів',
      intro: 'Заповнюється автоматично з профілю клієнта та даних заявки. Копію зберігає лише «Додати до папки».',
      attach: 'Додати до папки',
      attached: 'Додано до папки клієнта: {{name}}',
      noFolder: 'У цієї заявки немає папки в Drive.',
    },
  },
};

export const pagesDocTemplates = { az, de, en, ru, tr, uk };
export default pagesDocTemplates;
