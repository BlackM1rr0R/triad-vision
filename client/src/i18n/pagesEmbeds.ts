/**
 * Embeddable widgets: the compact /embed/* pages (chrome only — the calculators reuse salaryPage.*, bcCheck.* and
 * whichCity.* copy) and the configurator page /widgets. All six site languages. Keys under embeds.*.
 * {{name}} = brand name.
 */
const az = {
  embeds: {
    toolsLink: 'Bu alətləri öz saytınıza əlavə edin — pulsuz vidjetlər',
    names: {
      'salary-calculator': 'Almaniyada maaş kalkulyatoru (brutto → netto)',
      'blue-card-check': 'Mavi Kart maaş yoxlaması',
      'which-city': 'Almaniyanın hansı şəhəri sizə uyğundur?',
    },
    descs: {
      'salary-calculator': 'Brutto maaşdan xalis maaşı hesablayır: vergi sinfi, ştat, kilsə vergisi və uşaqlar.',
      'blue-card-check': 'Maaşın AB Mavi Kartının illik həddinə çatıb-çatmadığını yoxlayır.',
      'which-city': '8 sual — sizə ən uyğun Almaniya şəhəri və səbəbləri.',
    },
    poweredBy: 'Təqdim edir: {{name}}',
    openFull: 'Tam versiyanı aç',
    estimate: 'Təxmini hesablama, hüquqi və ya vergi məsləhəti deyil.',
    unknown: 'Bu vidjet mövcud deyil.',
    page: {
      title: 'Saytınız üçün pulsuz vidjetlər',
      subtitle: 'Maaş kalkulyatorunu, Mavi Kart yoxlamasını və şəhər testini öz saytınıza və ya bloqunuza bir neçə sətir kodla əlavə edin.',
      choose: 'Vidjet',
      size: 'Ölçü',
      sizes: { small: 'Kiçik ({{w}}×{{h}})', medium: 'Orta ({{w}}×{{h}})', responsive: 'Tam en (100%)' },
      language: 'Dil',
      theme: 'Rəng mövzusu',
      themes: { auto: 'Avtomatik (sistem)', light: 'İşıqlı', dark: 'Tünd' },
      autoResize: 'Hündürlüyü avtomatik uyğunlaşdır',
      autoResizeHint: 'Kiçik skript iframe-in hündürlüyünü məzmuna görə dəyişir. Yalnız {{domain}} saytından gələn mesajları qəbul edir.',
      preview: 'Canlı baxış',
      code: 'Kodu kopyalayın',
      copy: 'Kodu kopyala',
      copied: 'Kod kopyalandı',
      copyFailed: 'Kopyalamaq alınmadı — kodu əl ilə seçin.',
      rulesTitle: 'İstifadə qaydaları',
      rules: [
        'Pulsuzdur, qeydiyyat tələb olunmur.',
        '"{{name}}" linki vidjetin içində qalmalıdır — onu gizlətməyin və silməyin.',
        'Vidjet kuki yerləşdirmir və ziyarətçiləriniz haqqında şəxsi məlumat toplamır; yalnız anonim baxış sayı saxlanılır.',
        'Rəqəmlər təxminidir; ən son rəsmi dəyərlərə görə yenilənir.',
      ],
      contact: 'Başqa vidjet və ya öz dizaynınız lazımdır? Bizimlə əlaqə saxlayın.',
    },
  },
};
type Copy = typeof az;

const de: Copy = {
  embeds: {
    toolsLink: 'Diese Tools auf Ihrer Website einbinden — kostenlose Widgets',
    names: {
      'salary-calculator': 'Brutto-Netto-Rechner für Deutschland',
      'blue-card-check': 'Blaue Karte: Gehalts-Check',
      'which-city': 'Welche deutsche Stadt passt zu Ihnen?',
    },
    descs: {
      'salary-calculator': 'Berechnet das Netto aus dem Brutto: Steuerklasse, Bundesland, Kirchensteuer und Kinder.',
      'blue-card-check': 'Prüft, ob ein Gehalt die jährliche Gehaltsgrenze der EU Blue Card erreicht.',
      'which-city': '8 Fragen — die passende deutsche Stadt und warum.',
    },
    poweredBy: 'Bereitgestellt von {{name}}',
    openFull: 'Vollversion öffnen',
    estimate: 'Schätzung, keine Rechts- oder Steuerberatung.',
    unknown: 'Dieses Widget gibt es nicht.',
    page: {
      title: 'Kostenlose Widgets für Ihre Website',
      subtitle: 'Binden Sie Brutto-Netto-Rechner, Blaue-Karte-Check und Städte-Quiz mit wenigen Zeilen Code in Ihre Website oder Ihren Blog ein.',
      choose: 'Widget',
      size: 'Größe',
      sizes: { small: 'Klein ({{w}}×{{h}})', medium: 'Mittel ({{w}}×{{h}})', responsive: 'Volle Breite (100 %)' },
      language: 'Sprache',
      theme: 'Farbschema',
      themes: { auto: 'Automatisch (System)', light: 'Hell', dark: 'Dunkel' },
      autoResize: 'Höhe automatisch anpassen',
      autoResizeHint: 'Ein kleines Skript passt die Höhe des iframes an den Inhalt an. Es akzeptiert nur Nachrichten von {{domain}}.',
      preview: 'Live-Vorschau',
      code: 'Code kopieren',
      copy: 'Code kopieren',
      copied: 'Code kopiert',
      copyFailed: 'Kopieren fehlgeschlagen — bitte den Code manuell markieren.',
      rulesTitle: 'Nutzungsbedingungen',
      rules: [
        'Kostenlos, ohne Anmeldung.',
        'Der Link „{{name}}“ muss im Widget sichtbar bleiben — bitte nicht verstecken oder entfernen.',
        'Das Widget setzt keine Cookies und erhebt keine personenbezogenen Daten Ihrer Besucher; gezählt werden nur anonyme Aufrufe.',
        'Die Werte sind Schätzungen und werden mit den amtlichen Werten aktualisiert.',
      ],
      contact: 'Sie brauchen ein anderes Widget oder Ihr eigenes Design? Sprechen Sie uns an.',
    },
  },
};

const en: Copy = {
  embeds: {
    toolsLink: 'Add these tools to your website — free widgets',
    names: {
      'salary-calculator': 'German gross-to-net salary calculator',
      'blue-card-check': 'EU Blue Card salary check',
      'which-city': 'Which German city suits you?',
    },
    descs: {
      'salary-calculator': 'Net pay from gross pay: tax class, federal state, church tax and children.',
      'blue-card-check': 'Checks whether a salary reaches the yearly EU Blue Card salary threshold.',
      'which-city': '8 questions — the German city that suits you best, and why.',
    },
    poweredBy: 'Powered by {{name}}',
    openFull: 'Open the full version',
    estimate: 'Estimate, not legal or tax advice.',
    unknown: 'This widget does not exist.',
    page: {
      title: 'Free widgets for your website',
      subtitle: 'Add the salary calculator, the Blue Card check and the city quiz to your website or blog with a few lines of code.',
      choose: 'Widget',
      size: 'Size',
      sizes: { small: 'Small ({{w}}×{{h}})', medium: 'Medium ({{w}}×{{h}})', responsive: 'Full width (100%)' },
      language: 'Language',
      theme: 'Colour theme',
      themes: { auto: 'Automatic (system)', light: 'Light', dark: 'Dark' },
      autoResize: 'Adjust the height automatically',
      autoResizeHint: 'A tiny script sets the iframe height to its content. It only accepts messages from {{domain}}.',
      preview: 'Live preview',
      code: 'Copy the code',
      copy: 'Copy code',
      copied: 'Code copied',
      copyFailed: 'Copying failed — please select the code manually.',
      rulesTitle: 'Terms of use',
      rules: [
        'Free, no sign-up.',
        'The "{{name}}" link must stay visible in the widget — please do not hide or remove it.',
        'The widget sets no cookies and collects no personal data of your visitors; only anonymous views are counted.',
        'Figures are estimates and are updated to the official values.',
      ],
      contact: 'Need another widget or your own design? Get in touch.',
    },
  },
};

const ru: Copy = {
  embeds: {
    toolsLink: 'Добавьте эти инструменты на свой сайт — бесплатные виджеты',
    names: {
      'salary-calculator': 'Калькулятор зарплаты в Германии (брутто → нетто)',
      'blue-card-check': 'Проверка зарплаты для Голубой карты ЕС',
      'which-city': 'Какой город Германии вам подходит?',
    },
    descs: {
      'salary-calculator': 'Считает зарплату на руки из брутто: налоговый класс, земля, церковный налог и дети.',
      'blue-card-check': 'Проверяет, достигает ли зарплата годового порога Голубой карты ЕС.',
      'which-city': '8 вопросов — самый подходящий город Германии и почему.',
    },
    poweredBy: 'Предоставлено {{name}}',
    openFull: 'Открыть полную версию',
    estimate: 'Оценка, а не юридическая или налоговая консультация.',
    unknown: 'Такого виджета нет.',
    page: {
      title: 'Бесплатные виджеты для вашего сайта',
      subtitle: 'Добавьте калькулятор зарплаты, проверку Голубой карты и тест по городам на свой сайт или блог несколькими строками кода.',
      choose: 'Виджет',
      size: 'Размер',
      sizes: { small: 'Маленький ({{w}}×{{h}})', medium: 'Средний ({{w}}×{{h}})', responsive: 'На всю ширину (100%)' },
      language: 'Язык',
      theme: 'Тема',
      themes: { auto: 'Автоматически (системная)', light: 'Светлая', dark: 'Тёмная' },
      autoResize: 'Подстраивать высоту автоматически',
      autoResizeHint: 'Небольшой скрипт подгоняет высоту iframe под содержимое. Он принимает сообщения только от {{domain}}.',
      preview: 'Живой предпросмотр',
      code: 'Скопируйте код',
      copy: 'Скопировать код',
      copied: 'Код скопирован',
      copyFailed: 'Не удалось скопировать — выделите код вручную.',
      rulesTitle: 'Условия использования',
      rules: [
        'Бесплатно, без регистрации.',
        'Ссылка «{{name}}» должна оставаться видимой в виджете — не скрывайте и не удаляйте её.',
        'Виджет не ставит cookies и не собирает персональные данные ваших посетителей; считаются только анонимные просмотры.',
        'Значения — оценка и обновляются по официальным данным.',
      ],
      contact: 'Нужен другой виджет или свой дизайн? Напишите нам.',
    },
  },
};

const tr: Copy = {
  embeds: {
    toolsLink: 'Bu araçları sitenize ekleyin — ücretsiz widget\'lar',
    names: {
      'salary-calculator': 'Almanya brüt-net maaş hesaplayıcı',
      'blue-card-check': 'AB Mavi Kart maaş kontrolü',
      'which-city': 'Almanya\'nın hangi şehri size uygun?',
    },
    descs: {
      'salary-calculator': 'Brüt maaştan net maaşı hesaplar: vergi sınıfı, eyalet, kilise vergisi ve çocuklar.',
      'blue-card-check': 'Bir maaşın yıllık AB Mavi Kart sınırına ulaşıp ulaşmadığını kontrol eder.',
      'which-city': '8 soru — size en uygun Alman şehri ve nedenleri.',
    },
    poweredBy: 'Sunan: {{name}}',
    openFull: 'Tam sürümü aç',
    estimate: 'Tahmindir; hukuki veya vergi danışmanlığı değildir.',
    unknown: 'Bu widget mevcut değil.',
    page: {
      title: 'Siteniz için ücretsiz widget\'lar',
      subtitle: 'Maaş hesaplayıcıyı, Mavi Kart kontrolünü ve şehir testini birkaç satır kodla sitenize veya blogunuza ekleyin.',
      choose: 'Widget',
      size: 'Boyut',
      sizes: { small: 'Küçük ({{w}}×{{h}})', medium: 'Orta ({{w}}×{{h}})', responsive: 'Tam genişlik (%100)' },
      language: 'Dil',
      theme: 'Renk teması',
      themes: { auto: 'Otomatik (sistem)', light: 'Açık', dark: 'Koyu' },
      autoResize: 'Yüksekliği otomatik ayarla',
      autoResizeHint: 'Küçük bir betik iframe yüksekliğini içeriğe göre ayarlar. Yalnızca {{domain}} adresinden gelen mesajları kabul eder.',
      preview: 'Canlı önizleme',
      code: 'Kodu kopyalayın',
      copy: 'Kodu kopyala',
      copied: 'Kod kopyalandı',
      copyFailed: 'Kopyalanamadı — lütfen kodu elle seçin.',
      rulesTitle: 'Kullanım koşulları',
      rules: [
        'Ücretsiz, kayıt gerekmez.',
        '"{{name}}" bağlantısı widget\'ta görünür kalmalıdır — lütfen gizlemeyin veya kaldırmayın.',
        'Widget çerez kullanmaz ve ziyaretçilerinizin kişisel verilerini toplamaz; yalnızca anonim görüntülemeler sayılır.',
        'Değerler tahminidir ve resmi değerlere göre güncellenir.',
      ],
      contact: 'Başka bir widget veya kendi tasarımınız mı lazım? Bize yazın.',
    },
  },
};

const uk: Copy = {
  embeds: {
    toolsLink: 'Додайте ці інструменти на свій сайт — безкоштовні віджети',
    names: {
      'salary-calculator': 'Калькулятор зарплати в Німеччині (брутто → нетто)',
      'blue-card-check': 'Перевірка зарплати для Блакитної карти ЄС',
      'which-city': 'Яке місто Німеччини вам підходить?',
    },
    descs: {
      'salary-calculator': 'Рахує зарплату на руки з брутто: податковий клас, земля, церковний податок і діти.',
      'blue-card-check': 'Перевіряє, чи досягає зарплата річного порогу Блакитної карти ЄС.',
      'which-city': '8 запитань — найкраще місто Німеччини для вас і чому.',
    },
    poweredBy: 'Надано {{name}}',
    openFull: 'Відкрити повну версію',
    estimate: 'Оцінка, а не юридична чи податкова консультація.',
    unknown: 'Такого віджета немає.',
    page: {
      title: 'Безкоштовні віджети для вашого сайту',
      subtitle: 'Додайте калькулятор зарплати, перевірку Блакитної карти й тест за містами на свій сайт чи блог кількома рядками коду.',
      choose: 'Віджет',
      size: 'Розмір',
      sizes: { small: 'Малий ({{w}}×{{h}})', medium: 'Середній ({{w}}×{{h}})', responsive: 'На всю ширину (100%)' },
      language: 'Мова',
      theme: 'Тема',
      themes: { auto: 'Автоматично (системна)', light: 'Світла', dark: 'Темна' },
      autoResize: 'Підлаштовувати висоту автоматично',
      autoResizeHint: 'Невеликий скрипт підганяє висоту iframe під вміст. Він приймає повідомлення лише від {{domain}}.',
      preview: 'Живий перегляд',
      code: 'Скопіюйте код',
      copy: 'Скопіювати код',
      copied: 'Код скопійовано',
      copyFailed: 'Не вдалося скопіювати — виділіть код вручну.',
      rulesTitle: 'Умови використання',
      rules: [
        'Безкоштовно, без реєстрації.',
        'Посилання «{{name}}» має залишатися видимим у віджеті — не приховуйте й не видаляйте його.',
        'Віджет не встановлює cookies і не збирає персональні дані ваших відвідувачів; рахуються лише анонімні перегляди.',
        'Значення — оцінка й оновлюються за офіційними даними.',
      ],
      contact: 'Потрібен інший віджет або власний дизайн? Напишіть нам.',
    },
  },
};

export const pagesEmbeds = { az, de, en, ru, tr, uk };
