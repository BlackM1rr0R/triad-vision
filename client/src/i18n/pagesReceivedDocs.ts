// Cabinet > Sənədlər: "Bizdən gələn sənədlər" (what Triad Vision sent to the client, GET /api/cases/:id/received-documents)
// and "Mənim yüklədiklərim". Registered with registerCopy(pagesReceivedDocs). All six languages.

const az = {
  recv: {
    areaLabel: 'Sənədlər',
    sent: {
      title: 'Bizdən gələn sənədlər',
      intro: 'Sizin üçün hazırladığımız və göndərdiyimiz bütün sənədlər burada, ən yenisi yuxarıda.',
      newBadge: 'Yeni',
      newCount: '{{count}} yeni',
      empty: 'Hələ sizə sənəd göndərməmişik. Göndərdiyimiz an burada görünəcək və bildiriş alacaqsınız.',
      loadError: 'Sənədlər yüklənmədi. Səhifəni yeniləyin.',
      files: '{{count}} fayl',
      markAll: 'Hamısını oxunmuş say',
    },
    kind: {
      READY_DOCS: 'Almaniya sənədləri',
      APPOINTMENT: 'Səfirlik görüşü təsdiqi',
      CONTRACT: 'Əmək müqaviləsi — imzalamaq üçün',
      CONTRACT_SIGNED: 'İmzalanmış sənəd',
      OTHER: 'Digər sənədlər',
    },
    file: { open: 'Bax', download: 'Endir', close: 'Bağla', cantPreview: 'Bu fayl növünü burada göstərmək olmur. Endirib açın.', loadFailed: 'Fayl açılmadı. Endirməyi yoxlayın.' },
    mine: {
      title: 'Mənim yüklədiklərim',
      intro: 'Sizin yüklədiyiniz sənədlər və vəziyyəti: yoxlanılır, qəbul edildi və ya düzəliş lazımdır. Yeni sənəd yükləmək üçün siyahıdakı sətrin düyməsinə basın.',
      checklist: 'Sənəd siyahısına bax',
    },
    home: { entry: 'Bizdən gələn sənədlər', entryNew: 'Bizdən gələn sənədlər ({{count}} yeni)' },
  },
};

const de = {
  recv: {
    areaLabel: 'Dokumente',
    sent: {
      title: 'Dokumente von uns',
      intro: 'Alle Dokumente, die wir für Sie vorbereitet und geschickt haben, die neuesten oben.',
      newBadge: 'Neu',
      newCount: '{{count}} neu',
      empty: 'Wir haben Ihnen noch keine Dokumente geschickt. Sobald wir etwas schicken, erscheint es hier und Sie werden benachrichtigt.',
      loadError: 'Die Dokumente konnten nicht geladen werden. Bitte laden Sie die Seite neu.',
      files: '{{count}} Datei(en)',
      markAll: 'Alle als gelesen markieren',
    },
    kind: {
      READY_DOCS: 'Deutsche Unterlagen',
      APPOINTMENT: 'Bestätigung des Botschaftstermins',
      CONTRACT: 'Arbeitsvertrag zum Unterschreiben',
      CONTRACT_SIGNED: 'Unterschriebenes Dokument',
      OTHER: 'Weitere Dokumente',
    },
    file: { open: 'Ansehen', download: 'Herunterladen', close: 'Schließen', cantPreview: 'Dieser Dateityp kann hier nicht angezeigt werden. Bitte laden Sie die Datei herunter.', loadFailed: 'Die Datei konnte nicht geöffnet werden. Versuchen Sie den Download.' },
    mine: {
      title: 'Meine hochgeladenen Dokumente',
      intro: 'Ihre hochgeladenen Dokumente mit Status: wird geprüft, akzeptiert oder Korrektur nötig. Zum Hochladen verwenden Sie die Schaltfläche in der Liste.',
      checklist: 'Zur Dokumentenliste',
    },
    home: { entry: 'Dokumente von uns', entryNew: 'Dokumente von uns ({{count}} neu)' },
  },
};

const en = {
  recv: {
    areaLabel: 'Documents',
    sent: {
      title: 'Documents from us',
      intro: 'Every document we prepared and sent to you, newest first.',
      newBadge: 'New',
      newCount: '{{count}} new',
      empty: 'We have not sent you any documents yet. When we do, they appear here and you get a notification.',
      loadError: 'The documents could not be loaded. Please reload the page.',
      files: '{{count}} file(s)',
      markAll: 'Mark all as read',
    },
    kind: {
      READY_DOCS: 'German documents',
      APPOINTMENT: 'Embassy appointment confirmation',
      CONTRACT: 'Employment contract to sign',
      CONTRACT_SIGNED: 'Signed document',
      OTHER: 'Other documents',
    },
    file: { open: 'View', download: 'Download', close: 'Close', cantPreview: 'This file type cannot be shown here. Please download it.', loadFailed: 'The file could not be opened. Try downloading it.' },
    mine: {
      title: 'My uploads',
      intro: 'The documents you uploaded and their status: under review, accepted or needs a fix. To upload a new one, use the button on its row.',
      checklist: 'Open the document list',
    },
    home: { entry: 'Documents from us', entryNew: 'Documents from us ({{count}} new)' },
  },
};

const ru = {
  recv: {
    areaLabel: 'Документы',
    sent: {
      title: 'Документы от нас',
      intro: 'Все документы, которые мы подготовили и отправили вам, сначала самые новые.',
      newBadge: 'Новое',
      newCount: 'Новых: {{count}}',
      empty: 'Мы пока не отправляли вам документы. Как только отправим, они появятся здесь, и вы получите уведомление.',
      loadError: 'Не удалось загрузить документы. Обновите страницу.',
      files: 'Файлов: {{count}}',
      markAll: 'Отметить все прочитанными',
    },
    kind: {
      READY_DOCS: 'Документы для Германии',
      APPOINTMENT: 'Подтверждение приёма в посольстве',
      CONTRACT: 'Трудовой договор на подпись',
      CONTRACT_SIGNED: 'Подписанный документ',
      OTHER: 'Другие документы',
    },
    file: { open: 'Открыть', download: 'Скачать', close: 'Закрыть', cantPreview: 'Этот тип файла нельзя показать здесь. Скачайте его.', loadFailed: 'Не удалось открыть файл. Попробуйте скачать.' },
    mine: {
      title: 'Мои загрузки',
      intro: 'Загруженные вами документы и их статус: на проверке, принят или нужно исправить. Чтобы загрузить новый, нажмите кнопку в его строке.',
      checklist: 'Открыть список документов',
    },
    home: { entry: 'Документы от нас', entryNew: 'Документы от нас (новых: {{count}})' },
  },
};

const tr = {
  recv: {
    areaLabel: 'Belgeler',
    sent: {
      title: 'Bizden gelen belgeler',
      intro: 'Sizin için hazırlayıp gönderdiğimiz tüm belgeler, en yenisi üstte.',
      newBadge: 'Yeni',
      newCount: '{{count}} yeni',
      empty: 'Henüz size belge göndermedik. Gönderdiğimizde burada görünür ve bildirim alırsınız.',
      loadError: 'Belgeler yüklenemedi. Lütfen sayfayı yenileyin.',
      files: '{{count}} dosya',
      markAll: 'Tümünü okundu say',
    },
    kind: {
      READY_DOCS: 'Almanya belgeleri',
      APPOINTMENT: 'Konsolosluk randevusu onayı',
      CONTRACT: 'İmzalanacak iş sözleşmesi',
      CONTRACT_SIGNED: 'İmzalanmış belge',
      OTHER: 'Diğer belgeler',
    },
    file: { open: 'Görüntüle', download: 'İndir', close: 'Kapat', cantPreview: 'Bu dosya türü burada gösterilemiyor. Lütfen indirin.', loadFailed: 'Dosya açılamadı. İndirmeyi deneyin.' },
    mine: {
      title: 'Yüklediklerim',
      intro: 'Yüklediğiniz belgeler ve durumları: inceleniyor, kabul edildi veya düzeltme gerekli. Yeni belge yüklemek için satırdaki düğmeyi kullanın.',
      checklist: 'Belge listesini aç',
    },
    home: { entry: 'Bizden gelen belgeler', entryNew: 'Bizden gelen belgeler ({{count}} yeni)' },
  },
};

const uk = {
  recv: {
    areaLabel: 'Документи',
    sent: {
      title: 'Документи від нас',
      intro: 'Усі документи, які ми підготували й надіслали вам, спершу найновіші.',
      newBadge: 'Нове',
      newCount: 'Нових: {{count}}',
      empty: 'Ми ще не надсилали вам документи. Щойно надішлемо, вони з’являться тут, і ви отримаєте сповіщення.',
      loadError: 'Не вдалося завантажити документи. Оновіть сторінку.',
      files: 'Файлів: {{count}}',
      markAll: 'Позначити все прочитаним',
    },
    kind: {
      READY_DOCS: 'Документи для Німеччини',
      APPOINTMENT: 'Підтвердження прийому в посольстві',
      CONTRACT: 'Трудовий договір на підпис',
      CONTRACT_SIGNED: 'Підписаний документ',
      OTHER: 'Інші документи',
    },
    file: { open: 'Відкрити', download: 'Завантажити', close: 'Закрити', cantPreview: 'Цей тип файлу тут не показати. Завантажте його.', loadFailed: 'Не вдалося відкрити файл. Спробуйте завантажити.' },
    mine: {
      title: 'Мої завантаження',
      intro: 'Завантажені вами документи та їхній статус: на перевірці, прийнято або потрібне виправлення. Щоб завантажити новий, натисніть кнопку в його рядку.',
      checklist: 'Відкрити список документів',
    },
    home: { entry: 'Документи від нас', entryNew: 'Документи від нас (нових: {{count}})' },
  },
};

export const pagesReceivedDocs = { az, de, en, ru, tr, uk };
