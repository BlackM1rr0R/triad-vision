import type { PageHelpEntry } from '../types.js';

/** Admin page help: Website (Sayt) pages. */
export const PAGES_SITE: PageHelpEntry[] = [
  {
    route: 'content/:resource',
    text: {
      az: {
        title: 'Məzmun',
        purpose: 'Saytın ictimai məzmununu kod olmadan dəyişmək üçün: xidmətlər, viza kateqoriyaları, tərəfdaşlar, viza nümunələri, rəylər, statistika, tez-tez verilən suallar və xəbərlər. Yalnız Administrator və Super admin istifadə edir.',
        steps: [
          'Sol menyunun «Sayt» qrupundan bölməni seçin (məs. «Xidmətlər» və ya «Xəbərlər»).',
          'Yuxarıdakı «Yeni …» düyməsi ilə element yaradın və ya sətrə basıb redaktə panelini açın; mətnləri dörd dildə doldurub «Yadda saxla» basın.',
          'Sətirdəki açarla elementi saytda dərc edin və ya gizlədin, «Yuxarı»/«Aşağı» oxları ilə sırasını dəyişin.',
        ],
        tips: [
          'Boş qalan dillərə Azərbaycan mətni avtomatik köçürülür.',
          'Silmə geri qaytarılmır; əmin deyilsinizsə elementi sadəcə gizlədin.',
          'Xidmətlər, viza kateqoriyaları və xəbərlər üçün SEO sahələri də var.',
        ],
      },
      ru: {
        title: 'Контент',
        purpose: 'Изменение публичного контента сайта без кода: услуги, категории виз, партнёры, примеры виз, отзывы, статистика, частые вопросы и новости. Доступно только администратору и супер-админу.',
        steps: [
          'Выберите раздел в группе «Сайт» левого меню (например, «Услуги» или «Новости»).',
          'Создайте элемент кнопкой «Новый …» вверху или нажмите на строку, чтобы открыть панель редактирования; заполните тексты на четырёх языках и нажмите «Сохранить».',
          'Переключателем в строке публикуйте или скрывайте элемент, стрелками «Вверх»/«Вниз» меняйте порядок на сайте.',
        ],
        tips: [
          'Пустые языки автоматически заполняются азербайджанским текстом.',
          'Удаление необратимо; если сомневаетесь, просто скройте элемент.',
          'У услуг, категорий виз и новостей есть также SEO-поля.',
        ],
      },
      en: {
        title: 'Content',
        purpose: 'Edit the public website content without code: services, visa categories, partners, visa samples, testimonials, statistics, FAQs and news. Used by Admins and Super admins only.',
        steps: [
          'Pick a section in the “Website” group of the left menu (e.g. “Services” or “News”).',
          'Create an item with the “New …” button at the top or click a row to open the editor panel; fill in the texts in four languages and click “Save”.',
          'Use the switch in the row to publish or hide an item, and the “Up”/“Down” arrows to change its order on the site.',
        ],
        tips: [
          'Empty languages are filled with the Azerbaijani text automatically.',
          'Deleting cannot be undone; if unsure, just hide the item.',
          'Services, visa categories and news also have SEO fields.',
        ],
      },
      de: {
        title: 'Inhalte',
        purpose: 'Öffentliche Website-Inhalte ohne Code bearbeiten: Leistungen, Visakategorien, Partner, Visa-Beispiele, Bewertungen, Statistik, häufige Fragen und News. Nur für Admins und Super-Admins.',
        steps: [
          'Wählen Sie im linken Menü in der Gruppe „Website“ einen Bereich (z. B. „Leistungen“ oder „News“).',
          'Legen Sie mit „Neu …“ oben einen Eintrag an oder klicken Sie auf eine Zeile, um das Bearbeitungsfenster zu öffnen; Texte in vier Sprachen ausfüllen und „Speichern“ klicken.',
          'Mit dem Schalter in der Zeile veröffentlichen oder ausblenden, mit den Pfeilen „Nach oben“/„Nach unten“ die Reihenfolge ändern.',
        ],
        tips: [
          'Leere Sprachen werden automatisch mit dem aserbaidschanischen Text gefüllt.',
          'Löschen ist endgültig; im Zweifel den Eintrag nur ausblenden.',
          'Leistungen, Visakategorien und News haben zusätzlich SEO-Felder.',
        ],
      },
    },
  },
  {
    route: 'landing-pages/*',
    text: {
      az: {
        title: 'Lendinq səhifələri',
        purpose: 'Kampaniya və ölkə üçün lendinq səhifələrini bölmələrdən qurmaq və onların baxış, müraciət və konversiya göstəricilərini izləmək üçün. Formadan gələn müraciətlər avtomatik qiymətləndirilir.',
        steps: [
          '«Yeni səhifə» basın və ya siyahıda «Redaktə» ilə mövcud səhifəni açın.',
          '«Bölmələr» tabında «Bölmə əlavə et» ilə hero, üstünlüklər, FAQ, forma və s. əlavə edin; «Forma», «SEO» və «Parametrlər» tablarını doldurub «Canlı baxış»da yoxlayın.',
          'Yadda saxlayın, sonra siyahıda «Dərc et» basın; oxşar səhifə üçün «Kopyala» istifadə edin.',
        ],
        tips: [
          'Dərc etmək, dərcdən çıxarmaq və silmək yalnız Administrator üçündür; dərc olunmuş səhifə silinmir.',
          'Səhifə ünvanı /l/{slug} olur; dərcdən sonra slug-u yalnız admin dəyişə bilər.',
          'Bu bölmə «Lendinq səhifələri» modulu söndürüləndə görünmür.',
        ],
      },
      ru: {
        title: 'Лендинги',
        purpose: 'Сборка лендингов для кампаний и стран из блоков и отслеживание просмотров, заявок и конверсии. Заявки из формы оцениваются автоматически.',
        steps: [
          'Нажмите «Новая страница» или откройте существующую кнопкой «Изменить» в списке.',
          'Во вкладке «Блоки» нажмите «Добавить блок» (hero, преимущества, FAQ, форма и др.); заполните вкладки «Форма», «SEO» и «Параметры» и проверьте в «Живой просмотр».',
          'Сохраните и нажмите «Опубликовать» в списке; для похожей страницы используйте «Дублировать».',
        ],
        tips: [
          'Публиковать, снимать с публикации и удалять может только администратор; опубликованную страницу удалить нельзя.',
          'Адрес страницы — /l/{slug}; после публикации slug меняет только админ.',
          'Раздел не виден, если модуль «Лендинги» отключён.',
        ],
      },
      en: {
        title: 'Landing pages',
        purpose: 'Build campaign and country landing pages from sections and track their views, submissions and conversion. Inquiries from the form are scored automatically.',
        steps: [
          'Click “New page” or open an existing one with “Edit” in the list.',
          'In the “Sections” tab click “Add section” (hero, benefits, FAQ, form, …); fill in the “Form”, “SEO” and “Settings” tabs and check the “Live preview”.',
          'Save, then click “Publish” in the list; use “Duplicate” to start a similar page.',
        ],
        tips: [
          'Only Admins can publish, unpublish and delete; a published page cannot be deleted.',
          'The page lives at /l/{slug}; once published only an admin can change the slug.',
          'The page is hidden when the Landing pages module is switched off.',
        ],
      },
      de: {
        title: 'Landingpages',
        purpose: 'Kampagnen- und Länder-Landingpages aus Bausteinen bauen und Aufrufe, Anfragen und Konversion verfolgen. Anfragen aus dem Formular werden automatisch bewertet.',
        steps: [
          'Klicken Sie auf „Neue Seite“ oder öffnen Sie eine bestehende mit „Bearbeiten“ in der Liste.',
          'Im Tab „Bausteine“ mit „Baustein hinzufügen“ Hero, Vorteile, FAQ, Formular usw. ergänzen; Tabs „Formular“, „SEO“ und „Einstellungen“ ausfüllen und in der „Live-Vorschau“ prüfen.',
          'Speichern und in der Liste „Veröffentlichen“ klicken; für eine ähnliche Seite „Duplizieren“ nutzen.',
        ],
        tips: [
          'Veröffentlichen, Zurückziehen und Löschen nur für Admins; veröffentlichte Seiten lassen sich nicht löschen.',
          'Die Seite liegt unter /l/{slug}; nach Veröffentlichung ändert nur ein Admin den Slug.',
          'Die Seite ist ausgeblendet, wenn das Modul Landingpages abgeschaltet ist.',
        ],
      },
    },
  },
  {
    route: 'lead-magnets',
    text: {
      az: {
        title: 'E-kitablar',
        purpose: 'Pulsuz PDF e-kitabları idarə etmək üçün: ziyarətçi e-poçtunu yazır, yükləmə linkini e-poçtla alır və müraciət «Sorğular»a düşür. Administrator və Super admin üçündür.',
        steps: [
          '«Yeni e-kitab» basın, slug, başlıq, qısa təsvir və üz qabığını doldurub «Yadda saxla» basın.',
          'Kartdakı «PDF faylları (dillər üzrə)» hissəsində hər dil üçün «PDF yüklə» və ya «Əvəz et» basın.',
          '«Dərc olunub» açarını yandırın və «Səhifəni aç» ilə /ebook/{slug} səhifəsini yoxlayın.',
        ],
        tips: [
          '«Başlanğıc e-kitabı yarat» bələdçilərdən 6 dildə PDF yaradır; təkrar basanda əl ilə yüklənən PDF-lər qalır.',
          'Ziyarətçinin dilində PDF yoxdursa, ingilis, sonra Azərbaycan dilindəki göndərilir.',
          'E-kitabı silsəniz, artıq göndərilmiş linklər işləməyəcək.',
        ],
      },
      ru: {
        title: 'Электронные книги',
        purpose: 'Управление бесплатными PDF-книгами: посетитель указывает e-mail, получает ссылку на скачивание, заявка попадает в «Запросы». Для администратора и супер-админа.',
        steps: [
          'Нажмите «Новая книга», заполните slug, название, краткое описание и обложку и нажмите «Сохранить».',
          'В блоке «PDF-файлы (по языкам)» на карточке нажмите «Загрузить PDF» или «Заменить» для каждого языка.',
          'Включите переключатель «Опубликована» и проверьте страницу /ebook/{slug} кнопкой «Открыть страницу».',
        ],
        tips: [
          '«Создать стартовую книгу» собирает PDF из гидов на 6 языках; повторный запуск не трогает загруженные вручную файлы.',
          'Если PDF на языке посетителя нет, отправляется английский, затем азербайджанский.',
          'После удаления книги уже отправленные ссылки перестают работать.',
        ],
      },
      en: {
        title: 'E-books',
        purpose: 'Manage free PDF e-books: visitors enter their e-mail, receive the download link by e-mail and the request lands in Inquiries. For Admins and Super admins.',
        steps: [
          'Click “New e-book”, fill in slug, title, short description and cover, then click “Save”.',
          'In “PDF files (per language)” on the card, click “Upload PDF” or “Replace” for each language.',
          'Turn on “Published” and check the /ebook/{slug} page with “Open page”.',
        ],
        tips: [
          '“Generate starter e-book” builds a PDF in 6 languages from the guides; running it again keeps PDFs uploaded by hand.',
          'Without a PDF in the visitor’s language, the English one is sent, then the Azerbaijani one.',
          'Deleting an e-book breaks links that were already sent.',
        ],
      },
      de: {
        title: 'E-Books',
        purpose: 'Kostenlose PDF-E-Books verwalten: Besucher geben ihre E-Mail an, erhalten den Download-Link per E-Mail, die Anfrage landet unter „Anfragen“. Für Admins und Super-Admins.',
        steps: [
          'Auf „Neues E-Book“ klicken, Slug, Titel, Kurzbeschreibung und Cover ausfüllen und „Speichern“ klicken.',
          'Unter „PDF-Dateien (pro Sprache)“ auf der Karte je Sprache „PDF hochladen“ oder „Ersetzen“ klicken.',
          '„Veröffentlicht“ einschalten und die Seite /ebook/{slug} über „Seite öffnen“ prüfen.',
        ],
        tips: [
          '„Start-E-Book erzeugen“ baut aus den Ratgebern ein PDF in 6 Sprachen; hochgeladene PDFs bleiben bei erneutem Ausführen erhalten.',
          'Fehlt das PDF in der Besuchersprache, wird Englisch, dann Aserbaidschanisch versendet.',
          'Nach dem Löschen funktionieren bereits versendete Links nicht mehr.',
        ],
      },
    },
  },
  {
    route: 'guides',
    text: {
      az: {
        title: 'Bələdçilər (SEO)',
        purpose: 'Saytdakı uzun mövzu səhifələrini (bələdçiləri) hər dil üçün ayrıca versiya və ünvanla yazmaq üçün. Dəyişikliklər saytda, sitemap və RSS-də dərhal görünür. Administrator və Super admin üçündür.',
        steps: [
          '«Yeni bələdçi» basın və ya siyahıda mövcud bələdçinin dil versiyasını açın; çatışmayan dil üçün «Dil versiyası əlavə et» seçin.',
          'Açar, slug, başlıq, meta təsvir və Markdown mətni doldurun; «FAQ» hissəsində «Sual əlavə et» ilə suallar yazın.',
          '«Önizləmə» ilə yoxlayın, «Dərc edilib» işarəsini qoyub «Yadda saxla» basın.',
        ],
        tips: [
          'Açar bütün dillərdə eyni olmalıdır; «Mətni bu dildən kopyala» ilə başqa dildən başlayın.',
          'Başlıq 60, təsvir 155 simvola qədər tövsiyə olunur — sayğac göstərir.',
          'Bu bölmə «Bələdçilər» modulu söndürüləndə görünmür.',
        ],
      },
      ru: {
        title: 'Гиды (SEO)',
        purpose: 'Большие тематические страницы сайта (гиды): для каждого языка своя версия и адрес. Изменения сразу видны на сайте, в sitemap и RSS. Для администратора и супер-админа.',
        steps: [
          'Нажмите «Новый гид» или откройте языковую версию существующего гида; для недостающего языка выберите «Добавить языковую версию».',
          'Заполните ключ, slug, заголовок, мета-описание и текст в Markdown; в блоке FAQ добавьте вопросы кнопкой «Добавить вопрос».',
          'Проверьте в «Предпросмотр», отметьте «Опубликован» и нажмите «Сохранить».',
        ],
        tips: [
          'Ключ одинаков во всех языках; «Скопировать текст из этого языка» помогает начать перевод.',
          'Рекомендуется до 60 символов в заголовке и до 155 в описании — счётчик подскажет.',
          'Раздел не виден, если модуль «Гиды» отключён.',
        ],
      },
      en: {
        title: 'Guides (SEO)',
        purpose: 'Write the long-form topic pages (guides) of the site, with one version and URL per language. Changes appear at once on the site, in the sitemap and the RSS feed. For Admins and Super admins.',
        steps: [
          'Click “New guide” or open a language version of an existing guide; for a missing language choose “Add language version”.',
          'Fill in key, slug, title, meta description and the Markdown text; add questions in the FAQ block with “Add question”.',
          'Check it in “Preview”, tick “Published” and click “Save”.',
        ],
        tips: [
          'The key is the same in every language; “Copy text from this language” gives a translation a head start.',
          'Aim for up to 60 characters in the title and 155 in the description — the counter shows it.',
          'The page is hidden when the Guides module is switched off.',
        ],
      },
      de: {
        title: 'Ratgeber (SEO)',
        purpose: 'Ausführliche Themenseiten (Ratgeber) der Website schreiben, je Sprache mit eigener Version und URL. Änderungen erscheinen sofort auf der Website, in der Sitemap und im RSS. Für Admins und Super-Admins.',
        steps: [
          'Auf „Neuer Ratgeber“ klicken oder eine Sprachversion öffnen; für eine fehlende Sprache „Sprachversion hinzufügen“ wählen.',
          'Schlüssel, Slug, Titel, Meta-Beschreibung und Markdown-Text ausfüllen; im FAQ-Block mit „Frage hinzufügen“ Fragen ergänzen.',
          'In der „Vorschau“ prüfen, „Veröffentlicht“ anhaken und „Speichern“ klicken.',
        ],
        tips: [
          'Der Schlüssel ist in allen Sprachen gleich; „Text aus dieser Sprache übernehmen“ erleichtert die Übersetzung.',
          'Titel bis 60, Beschreibung bis 155 Zeichen empfohlen — der Zähler zeigt es an.',
          'Die Seite ist ausgeblendet, wenn das Modul Ratgeber abgeschaltet ist.',
        ],
      },
    },
  },
  {
    route: 'study',
    text: {
      az: {
        title: 'Təhsil proqramları',
        purpose: '«Almaniyada təhsil» kataloqunu (/study) idarə etmək üçün: universitet proqramları, son tarixlər, tələblər və gələn müraciətlərin sayı. Hər məlumat universitetin öz səhifəsindən yazılır.',
        steps: [
          '«Proqram axtar» sahəsi və «Yalnız qaralamalar», «Son tarix yaxındır» filtrləri ilə siyahını daraldın.',
          '«Yeni proqram» basın və ya proqramı redaktə edin: universitet, dərəcə, dil, son tarixlər və rəsmi link; «Məlumatların yoxlanma tarixi»ni qeyd edin.',
          '«Saytda dərc olunsun» işarəsini qoyub yadda saxlayın; çox proqram üçün «CSV idxal» → «Faylı yoxla» → idxal edin.',
        ],
        tips: [
          'DAAD, uni-assist və digər portallardan mətn köçürməyin.',
          'Əməkdaşlar redaktə və idxal edə bilər, silmək yalnız Administrator üçündür.',
          '«CSV ixrac» ilə kataloqun nüsxəsini götürün.',
        ],
      },
      ru: {
        title: 'Учебные программы',
        purpose: 'Ведение каталога «Учёба в Германии» (/study): программы университетов, сроки подачи, требования и число поступивших заявок. Каждый факт берётся со страницы самого университета.',
        steps: [
          'Сузьте список полем «Поиск программ» и фильтрами «Только черновики» и «Срок скоро».',
          'Нажмите «Новая программа» или измените существующую: университет, степень, язык, сроки и официальная ссылка; укажите дату «Данные проверены».',
          'Отметьте «Опубликовано на сайте» и сохраните; для многих программ: «Импорт CSV» → «Проверить файл» → импорт.',
        ],
        tips: [
          'Не копируйте тексты из DAAD, uni-assist и других порталов.',
          'Сотрудники могут редактировать и импортировать, удалять — только администратор.',
          '«Экспорт CSV» делает копию каталога.',
        ],
      },
      en: {
        title: 'Study programmes',
        purpose: 'Maintain the “Study in Germany” catalogue (/study): university programmes, deadlines, requirements and the number of applications received. Every fact is typed from the university’s own page.',
        steps: [
          'Narrow the list with “Search programmes” and the “Drafts only” and “Deadline soon” filters.',
          'Click “New programme” or edit one: university, degree, language, deadlines and the official link; set “Facts checked on”.',
          'Tick “Published on the site” and save; for many programmes use “Import CSV” → “Check file” → import.',
        ],
        tips: [
          'Never copy text from DAAD, uni-assist or other portals.',
          'Staff can edit and import; only Admins can delete.',
          '“Export CSV” gives you a copy of the catalogue.',
        ],
      },
      de: {
        title: 'Studiengänge',
        purpose: 'Den Katalog „Studium in Deutschland“ (/study) pflegen: Studiengänge, Fristen, Voraussetzungen und Zahl der eingegangenen Bewerbungen. Jede Angabe stammt von der Seite der Hochschule selbst.',
        steps: [
          'Liste mit „Studiengänge suchen“ und den Filtern „Nur Entwürfe“ und „Frist bald“ eingrenzen.',
          '„Neuer Studiengang“ klicken oder einen bearbeiten: Hochschule, Abschluss, Sprache, Fristen und offizieller Link; „Angaben geprüft am“ setzen.',
          '„Auf der Website veröffentlicht“ anhaken und speichern; für viele Einträge „CSV importieren“ → „Datei prüfen“ → importieren.',
        ],
        tips: [
          'Nie Texte von DAAD, uni-assist oder anderen Portalen kopieren.',
          'Mitarbeiter dürfen bearbeiten und importieren, löschen nur Admins.',
          '„CSV exportieren“ erstellt eine Kopie des Katalogs.',
        ],
      },
    },
  },
  {
    route: 'search-performance',
    text: {
      az: {
        title: 'Google axtarış nəticələri',
        purpose: 'Google Search Console-dan son 28 günün göstəriciləri: kliklər, göstərişlər, CTR, mövqe, axtarış sorğuları və səhifələr. Administrator və Super admin saytın Google-da necə tapıldığını burada izləyir.',
        steps: [
          'Yuxarıdakı göstəricilərə və «Axtarış sorğuları», «Səhifələr» cədvəllərinə baxın.',
          '«İmkanlar» bölməsində «Yaxın mövqelər» və «Aşağı CTR» siyahılarından hansı səhifəni yaxşılaşdıracağınızı seçin.',
          '«İndeksləmə yoxlaması» hissəsində «Yoxlamanı başlat» ilə əsas səhifələrin Google indeksində olub-olmadığını yoxlayın.',
        ],
        tips: [
          'Məlumat 6 saatda bir yenilənir; lazım olsa «Yenilə» basın.',
          '«Search Console qoşulmayıb» görünürsə, inteqrasiyanı əvvəlcə qurmaq lazımdır.',
        ],
      },
      ru: {
        title: 'Эффективность в Google',
        purpose: 'Данные Google Search Console за последние 28 дней: клики, показы, CTR, позиция, поисковые запросы и страницы. Администратор и супер-админ следят здесь, как сайт находят в Google.',
        steps: [
          'Посмотрите показатели вверху и таблицы «Поисковые запросы» и «Страницы».',
          'В блоке «Возможности» выберите по спискам «Почти в топе» и «Низкий CTR», какие страницы улучшить.',
          'В «Проверка индексирования» нажмите «Запустить проверку», чтобы узнать, есть ли ключевые страницы в индексе Google.',
        ],
        tips: [
          'Данные обновляются каждые 6 часов; при необходимости нажмите «Обновить».',
          'Если видно «Search Console не подключена», сначала настройте интеграцию.',
        ],
      },
      en: {
        title: 'Google search performance',
        purpose: 'Google Search Console data for the last 28 days: clicks, impressions, CTR, position, search queries and pages. Admins and Super admins track here how the site is found on Google.',
        steps: [
          'Review the figures at the top and the “Search queries” and “Pages” tables.',
          'In “Opportunities”, use the “Striking distance” and “Low CTR” lists to pick which pages to improve.',
          'In “Indexing check (URL Inspection)” click “Run check” to see whether the key pages are in Google’s index.',
        ],
        tips: [
          'Data refreshes every 6 hours; click “Refresh” if needed.',
          'If “Search Console is not connected” shows, the integration has to be set up first.',
        ],
      },
      de: {
        title: 'Google-Suchleistung',
        purpose: 'Daten der Google Search Console der letzten 28 Tage: Klicks, Impressionen, CTR, Position, Suchanfragen und Seiten. Admins und Super-Admins sehen hier, wie die Website in Google gefunden wird.',
        steps: [
          'Kennzahlen oben sowie die Tabellen „Suchanfragen“ und „Seiten“ ansehen.',
          'Unter „Potenziale“ anhand von „Fast oben“ und „Niedrige CTR“ entscheiden, welche Seiten verbessert werden.',
          'Unter „Indexierungsprüfung (URL-Prüfung)“ auf „Prüfung starten“ klicken, um zu sehen, ob die wichtigsten Seiten im Google-Index sind.',
        ],
        tips: [
          'Die Daten werden alle 6 Stunden aktualisiert; bei Bedarf „Aktualisieren“ klicken.',
          'Steht dort „Search Console ist nicht verbunden“, muss zuerst die Integration eingerichtet werden.',
        ],
      },
    },
  },
  {
    route: 'tool-analytics',
    text: {
      az: {
        title: 'Alət analitikası',
        purpose: 'Saytdakı pulsuz alətlərin (kalkulyatorlar, testlər və s.) hər biri üzrə baxış, istifadə, e-poçt sorğuları, qeydiyyat və konversiya. Yalnız gündəlik ümumi saylar göstərilir, şəxsi məlumat yoxdur.',
        steps: [
          'Yuxarıda dövrü seçin: 7, 30 və ya 90 gün.',
          '«Alət axtar…» və «Məlumatsız alətləri gizlət» ilə cədvəli daraldın, «Dəyişmə» sütununda əvvəlki dövrə görə fərqi görün; lazım olsa «CSV» yükləyin.',
          'Aşağıdakı «Seçilmiş alətlər» blokunda saytda önə çıxan alətləri seçin və «Yadda saxla» basın.',
        ],
        tips: [
          '«Analitikaya görə təklif et» ən çox baxılan alətləri seçir.',
          '«Seçilmiş alətlər»i yalnız Administrator dəyişə bilər.',
          'Qeydiyyat yalnız ziyarətçi analitik kukilərə razılıq verdikdə alətə aid edilir.',
        ],
      },
      ru: {
        title: 'Аналитика инструментов',
        purpose: 'Просмотры, использование, письма с результатом, регистрации и конверсия по каждому бесплатному инструменту сайта (калькуляторы, тесты и др.). Только дневные суммы, без персональных данных.',
        steps: [
          'Выберите период вверху: 7, 30 или 90 дней.',
          'Сузьте таблицу через «Найти инструмент…» и «Скрыть инструменты без данных»; колонка «Динамика» показывает изменение к прошлому периоду; при необходимости скачайте «CSV».',
          'В блоке «Избранные инструменты» внизу выберите инструменты, которые сайт выводит на первое место, и нажмите «Сохранить».',
        ],
        tips: [
          '«Предложить по аналитике» берёт самые просматриваемые инструменты.',
          '«Избранные инструменты» меняет только администратор.',
          'Регистрации привязываются к инструменту, только если посетитель разрешил аналитические cookies.',
        ],
      },
      en: {
        title: 'Tool analytics',
        purpose: 'Views, interactions, result e-mails, sign-ups and conversion for each free tool on the site (calculators, quizzes and more). Daily totals only, no personal data.',
        steps: [
          'Choose the period at the top: 7, 30 or 90 days.',
          'Narrow the table with “Search tools…” and “Hide tools without data”; the “Trend” column compares with the previous period; download a “CSV” if needed.',
          'In the “Featured tools” block below, pick the tools the site puts first and click “Save”.',
        ],
        tips: [
          '“Suggest from analytics” picks the most viewed tools.',
          'Only Admins can change the featured tools.',
          'Sign-ups are attributed to a tool only when the visitor allowed analytics cookies.',
        ],
      },
      de: {
        title: 'Tool-Analyse',
        purpose: 'Aufrufe, Nutzung, Ergebnis-E-Mails, Registrierungen und Konversion je kostenlosem Tool der Website (Rechner, Quiz u. a.). Nur tägliche Summen, keine personenbezogenen Daten.',
        steps: [
          'Oben den Zeitraum wählen: 7, 30 oder 90 Tage.',
          'Tabelle mit „Tool suchen…“ und „Tools ohne Daten ausblenden“ eingrenzen; die Spalte „Trend“ vergleicht mit der Vorperiode; bei Bedarf „CSV“ herunterladen.',
          'Im Block „Hervorgehobene Tools“ unten die Tools wählen, die die Website zuerst zeigt, und „Speichern“ klicken.',
        ],
        tips: [
          '„Aus der Analyse vorschlagen“ übernimmt die meistbesuchten Tools.',
          'Hervorgehobene Tools kann nur ein Admin ändern.',
          'Registrierungen werden einem Tool nur zugeordnet, wenn der Besucher Analyse-Cookies erlaubt hat.',
        ],
      },
    },
  },
  {
    route: 'doc-guides',
    text: {
      az: {
        title: 'Sənəd bələdçiləri',
        purpose: 'Hər sənəd üçün «Necə almalı?» təlimatı: müştəri onu kabinetdə yükləmə düyməsinin yanında görür. Mətn dörd dildə, nümunə şəkli və faydalı keçidlərlə saxlanılır.',
        steps: [
          'Soldakı «Sənəd açarları» siyahısından sənədi seçin; «qaralama» və «yoxlanılıb» nişanları vəziyyəti göstərir.',
          'Dörd dildə mətni, addımları (hər sətirdə bir), nümunə şəklini yoxlayın və «Keçid əlavə et» ilə rəsmi linkləri əlavə edin.',
          '«Yoxlanılıb» və «Müştəriyə göstər» açarlarını yandırıb yadda saxlayın.',
        ],
        tips: [
          'Redaktə yalnız Administrator üçündür, əməkdaşlar sadəcə baxır.',
          'Rüsumları fakt kimi yazmayın — «təxminən» yazın və mənbəni yoxlayın.',
          '«Qaralamaya qaytar» daxili mətni bərpa edir.',
        ],
      },
      ru: {
        title: 'Справочник документов',
        purpose: '«Как получить?» для каждого документа: клиент видит эту справку в кабинете рядом с кнопкой загрузки. Текст на четырёх языках, с образцом и полезными ссылками.',
        steps: [
          'Выберите документ в списке «Ключи документов» слева; метки «черновик» и «проверено» показывают состояние.',
          'Проверьте текст на четырёх языках, шаги (по одной в строке), образец и добавьте официальные ссылки кнопкой «Добавить ссылку».',
          'Включите «Проверено» и «Показывать клиентам» и сохраните.',
        ],
        tips: [
          'Редактирует только администратор, сотрудники только смотрят.',
          'Не указывайте пошлины как факт — пишите «примерно» и проверяйте источник.',
          '«Вернуть черновик» восстанавливает встроенный текст.',
        ],
      },
      en: {
        title: 'Document guides',
        purpose: '“How to get it?” for every document: the client sees this guide in the portal next to the upload button. Text in four languages, with a sample image and useful links.',
        steps: [
          'Pick a document in the “Document keys” list on the left; the “draft” and “verified” badges show its state.',
          'Check the text in four languages, the steps (one per line) and the sample image, and add official links with “Add link”.',
          'Turn on “Verified” and “Visible to clients” and save.',
        ],
        tips: [
          'Only Admins can edit; staff can read.',
          'Never state fees as facts — write “approx.” and check the source.',
          '“Back to draft” restores the built-in text.',
        ],
      },
      de: {
        title: 'Dokument-Leitfäden',
        purpose: '„Wie bekomme ich das?“ für jedes Dokument: Der Kunde sieht den Leitfaden im Portal neben dem Upload-Button. Text in vier Sprachen, mit Beispielbild und nützlichen Links.',
        steps: [
          'Links in „Dokumentschlüssel“ ein Dokument wählen; die Marken „Entwurf“ und „geprüft“ zeigen den Stand.',
          'Text in vier Sprachen, Schritte (eine pro Zeile) und Beispielbild prüfen und mit „Link hinzufügen“ offizielle Links ergänzen.',
          '„Geprüft“ und „Für Kunden sichtbar“ einschalten und speichern.',
        ],
        tips: [
          'Bearbeiten nur für Admins, Mitarbeiter können lesen.',
          'Gebühren nie als Tatsache angeben — „ungefähr“ schreiben und die Quelle prüfen.',
          '„Auf Entwurf zurücksetzen“ stellt den eingebauten Text wieder her.',
        ],
      },
    },
  },
  {
    route: 'site-tools',
    text: {
      az: {
        title: 'Sayt alətləri',
        purpose: 'Saytdakı interaktiv alətlərin parametrləri: başlama tarixi kalkulyatoru, xərc kalkulyatoru, yerləşdirmə xəritəsi, ziyarətçilərin haradan gəldiyi və «Dostunu gətir» proqramı.',
        steps: [
          'Yuxarıdan tab seçin: «Kalkulyator», «Xərclər», «Xəritə», «Haradan» və ya «Dostunu gətir».',
          '«Kalkulyator»da müddətləri həftə ilə (min–maks) yeniləyin və yoxlama tarixini qeyd edin; «Xəritə»də göstərmə rejimini və şəhər qeydlərini idarə edin.',
          '«Dostunu gətir» tabında tövsiyələri izləyin, mükafatın statusunu dəyişin (məs. ödənildi) və şərtləri redaktə edin.',
        ],
        tips: [
          'Dəyişiklik etmək yalnız Administrator üçündür, əməkdaşlar baxır.',
          'Kalkulyatordakı vizanın baxılma müddəti viza kateqoriyasından götürülür.',
          'Keçmiş real yerləşdirmələr ayrıca «Keçmiş yerləşdirmələr» səhifəsində daxil edilir.',
        ],
      },
      ru: {
        title: 'Инструменты сайта',
        purpose: 'Настройки интерактивных инструментов сайта: калькулятор даты начала, калькулятор расходов, карта трудоустройства, откуда приходят посетители и программа «Приведи друга».',
        steps: [
          'Выберите вкладку вверху: «Калькулятор», «Расходы», «Карта», «Откуда» или «Приведи друга».',
          'Во вкладке «Калькулятор» обновите сроки в неделях (мин–макс) и дату проверки; во вкладке «Карта» настройте режим показа и записи по городам.',
          'Во вкладке «Приведи друга» следите за рекомендациями, меняйте статус вознаграждения (например, выплачено) и редактируйте условия.',
        ],
        tips: [
          'Изменения вносит только администратор, сотрудники смотрят.',
          'Срок рассмотрения визы в калькуляторе берётся из категории визы.',
          'Реальные прошлые трудоустройства вносятся на отдельной странице «Прошлые трудоустройства».',
        ],
      },
      en: {
        title: 'Site tools',
        purpose: 'Settings of the interactive website tools: start date calculator, cost calculator, placement map, where visitors come from and the “Refer a friend” programme.',
        steps: [
          'Pick a tab at the top: “Calculator”, “Costs”, “Map”, “Origins” or “Refer a friend”.',
          'In “Calculator” update the durations in weeks (min–max) and the verified date; in “Map” set the display mode and the city entries.',
          'In “Refer a friend” follow referrals, move a reward’s status (e.g. paid) and edit the terms.',
        ],
        tips: [
          'Only Admins can make changes; staff can view.',
          'Visa processing time in the calculator comes from the visa category.',
          'Real historical placements are entered on the separate “Past placements” page.',
        ],
      },
      de: {
        title: 'Website-Tools',
        purpose: 'Einstellungen der interaktiven Website-Tools: Startdatum-Rechner, Kostenrechner, Vermittlungskarte, Herkunft der Besucher und das Programm „Freunde werben“.',
        steps: [
          'Oben einen Tab wählen: „Rechner“, „Kosten“, „Karte“, „Woher“ oder „Freunde werben“.',
          'Im „Rechner“ die Dauern in Wochen (min–max) und das Prüfdatum aktualisieren; unter „Karte“ Anzeigemodus und Städteeinträge pflegen.',
          'Unter „Freunde werben“ Empfehlungen verfolgen, den Prämienstatus ändern (z. B. bezahlt) und die Bedingungen bearbeiten.',
        ],
        tips: [
          'Änderungen nur durch Admins, Mitarbeiter sehen die Daten.',
          'Die Visabearbeitungszeit im Rechner kommt aus der Visakategorie.',
          'Echte frühere Vermittlungen werden auf der eigenen Seite „Frühere Vermittlungen“ erfasst.',
        ],
      },
    },
  },
  {
    route: 'city-costs',
    text: {
      az: {
        title: 'Şəhər xərcləri (büdcə)',
        purpose: 'Saytdakı ilk ay büdcəsi kalkulyatoru üçün şəhərlər üzrə aylıq məbləğlər (€): WG otağı, mənzil, qida, nəqliyyat, depozit. Dəyişikliklər dərhal saytda görünür və jurnala yazılır.',
        steps: [
          'Cədvəldə şəhəri tapın və «Redaktə» ilə açın, yeni yer üçün «Şəhər əlavə et» basın.',
          'Min–maks məbləğləri, «Mənbə qeydi»ni və «Yoxlanma tarixi»ni doldurub yadda saxlayın.',
          'Silinmiş standart şəhərləri qaytarmaq üçün «Standart şəhərləri bərpa et» basın.',
        ],
        tips: [
          'Səhifə yalnız Administrator və Super admin üçündür.',
          '«Ölçü sinfi (ehtiyat)» tipli sətirlər siyahıda olmayan şəhərlər üçün istifadə olunur.',
          'Rəqəmlərin illik yoxlanmasını «Məlumatların aktuallığı» səhifəsində izləyin.',
        ],
      },
      ru: {
        title: 'Расходы по городам (бюджет)',
        purpose: 'Месячные суммы (€) по городам для калькулятора бюджета первого месяца на сайте: комната в WG, квартира, еда, транспорт, залог. Изменения сразу видны на сайте и пишутся в журнал.',
        steps: [
          'Найдите город в таблице и откройте его через «Изменить»; для нового места нажмите «Добавить место».',
          'Заполните суммы мин–макс, «Источник» и дату «Проверено» и сохраните.',
          'Чтобы вернуть удалённые стандартные города, нажмите «Восстановить стандартные места».',
        ],
        tips: [
          'Страница доступна только администратору и супер-админу.',
          'Строки типа «Класс размера (запасной)» используются для городов, которых нет в списке.',
          'Ежегодную проверку цифр отслеживайте на странице «Актуальность данных».',
        ],
      },
      en: {
        title: 'City costs (budget)',
        purpose: 'Monthly amounts (€) per city for the first-month budget calculator on the site: WG room, flat, food, transport, deposit. Changes show on the website at once and are logged.',
        steps: [
          'Find the city in the table and open it with “Edit”; click “Add place” for a new one.',
          'Fill in the min–max amounts, the “Source note” and the “Checked on” date, then save.',
          'Click “Restore default places” to bring back default cities that were deleted.',
        ],
        tips: [
          'Only Admins and Super admins can open this page.',
          'Rows of type “Size class (fallback)” are used for cities that are not in the list.',
          'Track the yearly review of these figures on the “Data freshness” page.',
        ],
      },
      de: {
        title: 'Stadtkosten (Budget)',
        purpose: 'Monatliche Beträge (€) je Stadt für den Budgetrechner „Erster Monat“ auf der Website: WG-Zimmer, Wohnung, Essen, Verkehr, Kaution. Änderungen sind sofort sichtbar und werden protokolliert.',
        steps: [
          'Stadt in der Tabelle suchen und mit „Bearbeiten“ öffnen; für einen neuen Ort „Ort hinzufügen“ klicken.',
          'Min–max-Beträge, „Quellenhinweis“ und „Stand (geprüft am)“ ausfüllen und speichern.',
          'Gelöschte Standardstädte mit „Standardorte wiederherstellen“ zurückholen.',
        ],
        tips: [
          'Nur Admins und Super-Admins können diese Seite öffnen.',
          'Zeilen vom Typ „Größenklasse (Fallback)“ gelten für Städte, die nicht in der Liste stehen.',
          'Die jährliche Prüfung der Werte läuft über die Seite „Datenaktualität“.',
        ],
      },
    },
  },
  {
    route: 'data-freshness',
    text: {
      az: {
        title: 'Məlumatların aktuallığı',
        purpose: 'Saytda hər il dəyişən rəqəmlərin reyestri (minimum maaş, Kindergeld, BBG, Deutschlandticket və s.): harada yazılıb, rəsmi mənbə və növbəti yoxlama tarixi. Administrator və Super admin üçündür.',
        steps: [
          '«Status» (Qaydasında, 30 gün ərzində, Vaxtı keçib), «Kateqoriya» filtrləri və «Axtar» ilə vaxtı çatan rəqəmləri tapın.',
          'Rəsmi mənbəni açın, «Yolu kopyala» ilə faylları görün və kodda rəqəmi düzəltdirin.',
          '«Yoxlandı» basın, qeyd yazın və «Yadda saxla» — növbəti yoxlama tarixi yenilənir.',
        ],
        tips: [
          'Gündəlik iş vaxtı çatan rəqəmlər barədə adminlərə xatırlatma göndərir.',
          'Hər qeyddə əvvəlki yoxlamaların tarixçəsi görünür.',
        ],
      },
      ru: {
        title: 'Актуальность данных',
        purpose: 'Реестр ежегодно меняющихся значений сайта (минимальная зарплата, Kindergeld, BBG, Deutschlandticket и др.): где они в коде, официальный источник и дата следующей проверки. Для администратора и супер-админа.',
        steps: [
          'Найдите значения со сроком проверки через фильтры «Статус» (В порядке, В течение 30 дней, Просрочено), «Категория» и «Поиск».',
          'Откройте официальный источник, посмотрите файлы кнопкой «Копировать путь» и поручите исправить значение в коде.',
          'Нажмите «Проверено», добавьте заметку и «Сохранить» — дата следующей проверки обновится.',
        ],
        tips: [
          'Ежедневная задача напоминает администраторам о подходящих сроках.',
          'У каждой записи видна история прошлых проверок.',
        ],
      },
      en: {
        title: 'Data freshness',
        purpose: 'Register of the figures on the site that change every year (minimum wage, Kindergeld, BBG, Deutschlandticket …): where they live, the official source and the next review date. For Admins and Super admins.',
        steps: [
          'Find figures that are due with the “Status” (OK, Due in 30 days, Overdue), “Category” and “Search” filters.',
          'Open the official source, see the files with “Copy path” and have the value fixed in the code.',
          'Click “Reviewed”, add a note and “Save” — the next review date moves forward.',
        ],
        tips: [
          'A daily job reminds admins of figures that are coming due.',
          'Each entry shows the history of earlier reviews.',
        ],
      },
      de: {
        title: 'Datenaktualität',
        purpose: 'Register der jährlich wechselnden Werte der Website (Mindestlohn, Kindergeld, BBG, Deutschlandticket …): wo sie stehen, amtliche Quelle und nächster Prüftermin. Für Admins und Super-Admins.',
        steps: [
          'Fällige Werte über die Filter „Status“ (In Ordnung, In 30 Tagen, Überfällig), „Kategorie“ und „Suche“ finden.',
          'Amtliche Quelle öffnen, die Dateien über „Pfad kopieren“ ansehen und den Wert im Code korrigieren lassen.',
          '„Geprüft“ klicken, eine Notiz ergänzen und „Speichern“ — der nächste Prüftermin wird fortgeschrieben.',
        ],
        tips: [
          'Ein täglicher Job erinnert Admins an fällige Werte.',
          'Jeder Eintrag zeigt die Historie früherer Prüfungen.',
        ],
      },
    },
  },
  {
    route: 'past-placements',
    text: {
      az: {
        title: 'Keçmiş yerləşdirmələr',
        purpose: 'Sistemdən əvvəl Almaniyaya yerləşdirdiyimiz işçilərin real sayları (şəhər, il, peşə üzrə). Bu rəqəmlər ana səhifədəki qlobusa, /map səhifəsinə və hekayələr xəritəsinə sistemdəki işlərlə birlikdə əlavə olunur.',
        steps: [
          '«Əlavə et» basın: şəhər, il, işçi sayı, istəyə görə peşə və daxili qeyd yazıb yadda saxlayın.',
          'Cədvəldə sətri redaktə edin və ya silin.',
          '«İctimai xəritədə nə görünəcək» blokunda nəticəni yoxlayın və «İctimai xəritəni aç» ilə baxın.',
        ],
        tips: [
          'Yalnız qeydlərinizdəki real rəqəmləri daxil edin (Excel arxivi, müqavilələr).',
          'İşçi sayı minimumdan az olan şəhər ictimai xəritədə «Gizli» qalır.',
          'Əməkdaşlar baxır, dəyişikliyi yalnız Administrator edir.',
        ],
      },
      ru: {
        title: 'Прошлые трудоустройства',
        purpose: 'Реальные числа работников, которых мы трудоустроили в Германии до появления системы (по городу, году и профессии). Они добавляются к делам системы на глобусе главной страницы, /map и карте историй.',
        steps: [
          'Нажмите «Добавить»: город, год, число работников, при желании профессия и внутренняя заметка; сохраните.',
          'Изменяйте или удаляйте строки в таблице.',
          'Проверьте результат в блоке «Что покажет публичная карта» и откройте её кнопкой «Открыть публичную карту».',
        ],
        tips: [
          'Вводите только реальные цифры из ваших записей (архив Excel, договоры).',
          'Город с числом работников ниже минимума на публичной карте «Скрыт».',
          'Сотрудники смотрят, изменения вносит только администратор.',
        ],
      },
      en: {
        title: 'Past placements',
        purpose: 'Real numbers of workers we placed in Germany before this system existed (per city, year and profession). They are added to the system’s cases on the home page globe, /map and the stories map.',
        steps: [
          'Click “Add”: city, year, number of workers, optionally profession and an internal note; save.',
          'Edit or delete rows in the table.',
          'Check the result in “What the public map will show” and view it with “Open the public map”.',
        ],
        tips: [
          'Only enter real numbers from your records (Excel archive, contracts).',
          'A city below the minimum number of workers stays “Hidden” on the public map.',
          'Staff can view; only Admins can make changes.',
        ],
      },
      de: {
        title: 'Frühere Vermittlungen',
        purpose: 'Echte Zahlen der Arbeitskräfte, die wir vor Einführung des Systems nach Deutschland vermittelt haben (pro Stadt, Jahr und Beruf). Sie werden zu den Fällen im System addiert – Globus auf der Startseite, /map und Karte der Erfolgsgeschichten.',
        steps: [
          '„Hinzufügen“ klicken: Stadt, Jahr, Anzahl, optional Beruf und interne Notiz; speichern.',
          'Zeilen in der Tabelle bearbeiten oder löschen.',
          'Ergebnis unter „Was die öffentliche Karte zeigt“ prüfen und mit „Öffentliche Karte öffnen“ ansehen.',
        ],
        tips: [
          'Nur echte Zahlen aus Ihren Unterlagen eintragen (Excel-Archiv, Verträge).',
          'Städte unter der Mindestzahl bleiben auf der öffentlichen Karte „Verborgen“.',
          'Mitarbeiter sehen die Daten, ändern dürfen nur Admins.',
        ],
      },
    },
  },
  {
    route: 'kb',
    text: {
      az: {
        title: 'Bilik bazası',
        purpose: 'Komandanın daxili təlimatları, tez-tez verilən suallar və hazır cavab şablonları. Bütün əməkdaşlar oxuyur və məqalə yazır.',
        steps: [
          'Axtarış sahəsinə açar söz yazın və ya soldakı «Kateqoriyalar» və etiketlərlə siyahını daraldın.',
          'Məqaləni açın və «Cavabı kopyala» ilə mətni müştəriyə cavaba yapışdırın.',
          '«Yeni məqalə» basın, başlıq, Markdown mətn, kateqoriya və etiketləri yazın; «Dərc edilib (hamı görür)» və ya «Qaralama» seçib yadda saxlayın.',
        ],
        tips: [
          'Hər admin səhifəsi üçün burada sistemin «səhifə bələdçisi» məqaləsi var; əməkdaş onu redaktə etməyibsə, hər yeniləmədə avtomatik aktuallaşdırılır.',
          'Əməkdaş yalnız öz məqaləsini dəyişir; sancmaq, silmək və kateqoriyaları idarə etmək Administrator üçündür.',
          'Bu bölmə «Bilik bazası» modulu söndürüləndə görünmür.',
        ],
      },
      ru: {
        title: 'База знаний',
        purpose: 'Внутренние инструкции команды, частые вопросы и готовые шаблоны ответов. Все сотрудники читают и пишут статьи.',
        steps: [
          'Введите ключевое слово в поиск или сузьте список через «Категории» слева и теги.',
          'Откройте статью и кнопкой «Скопировать ответ» вставьте текст в ответ клиенту.',
          'Нажмите «Новая статья», заполните заголовок, текст в Markdown, категорию и теги; выберите «Опубликовано (видно всем)» или «Черновик» и сохраните.',
        ],
        tips: [
          'Для каждой страницы админки здесь есть системная статья «гид по странице»; при каждом обновлении она актуализируется автоматически, если её не редактировал сотрудник.',
          'Сотрудник меняет только свои статьи; закреплять, удалять и управлять категориями может администратор.',
          'Раздел не виден, если модуль «База знаний» отключён.',
        ],
      },
      en: {
        title: 'Knowledge base',
        purpose: 'The team’s internal how-tos, FAQs and ready-made reply templates. All staff read and write articles.',
        steps: [
          'Type a keyword into search or narrow the list with “Categories” on the left and the tags.',
          'Open an article and use “Copy answer” to paste the text into your reply to the client.',
          'Click “New article”, fill in title, Markdown text, category and tags; choose “Published (visible to everyone)” or “Draft” and save.',
        ],
        tips: [
          'Every admin page has a system “page guide” article here; it is updated automatically on each deploy unless a staff member has edited it.',
          'Staff edit only their own articles; pinning, deleting and managing categories is for Admins.',
          'The page is hidden when the Knowledge base module is switched off.',
        ],
      },
      de: {
        title: 'Wissensdatenbank',
        purpose: 'Interne Anleitungen, häufige Fragen und fertige Antwortvorlagen des Teams. Alle Mitarbeiter lesen und schreiben Artikel.',
        steps: [
          'Suchbegriff eingeben oder die Liste über „Kategorien“ links und die Tags eingrenzen.',
          'Artikel öffnen und mit „Antwort kopieren“ den Text in die Antwort an den Kunden einfügen.',
          '„Neuer Artikel“ klicken, Titel, Markdown-Text, Kategorie und Tags ausfüllen; „Veröffentlicht (für alle sichtbar)“ oder „Entwurf“ wählen und speichern.',
        ],
        tips: [
          'Für jede Admin-Seite gibt es hier einen System-Artikel „Seitenleitfaden“; er wird bei jedem Deploy automatisch aktualisiert, solange ihn kein Mitarbeiter bearbeitet hat.',
          'Mitarbeiter ändern nur eigene Artikel; Anpinnen, Löschen und Kategorien verwalten nur Admins.',
          'Die Seite ist ausgeblendet, wenn das Modul Wissensdatenbank abgeschaltet ist.',
        ],
      },
    },
  },
];
