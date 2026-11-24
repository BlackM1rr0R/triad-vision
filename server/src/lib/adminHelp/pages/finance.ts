import type { PageHelpEntry } from '../types.js';

/** Admin page help: Finance hub pages (plus team / management pages: workload, shifts, training, KPI, oversight). */
export const PAGES_FINANCE: PageHelpEntry[] = [
  {
    route: 'finance/*',
    text: {
      az: {
        title: 'Maliyyə hesabatları',
        purpose: 'Seçilmiş dövr üzrə gəlir, debitor borcları, komissiyalar və əməkdaşların nəticələri — rəhbərlik və mühasib üçün. Yalnız Administrator və Baş administrator.',
        steps: [
          'Yuxarıdakı düymələrlə dövrü seçin (“Bu ay” … “Keçən il”) və ya “Seçilmiş”i basıb başlanğıc/son tarixi yazın və “Tətbiq et”ə basın.',
          '“İcmal”, “Debitor borcları”, “Komissiyalar”, “Əməkdaşlar” və “Növlər üzrə” tabları arasında keçin — dövr bütün tablarda eyni qalır.',
          'Seçilmiş dövrün tam hesabatını bir faylda almaq üçün “Excel yüklə”ni basın.',
        ],
        tips: [
          'Gəlir — dövr ərzində ödənilmiş hesablardır (ödəniş tarixinə görə); açıq borc — göndərilmiş, amma ödənilməmiş hesablardır.',
          'Dövr ünvan sətrində saxlanılır: kopyalanan link eyni görünüşü açır.',
        ],
      },
      ru: {
        title: 'Финансовые отчёты',
        purpose: 'Выручка, дебиторская задолженность, комиссии и результаты сотрудников за выбранный период — для руководства и бухгалтера. Только Администратор и Главный администратор.',
        steps: [
          'Выберите период кнопками вверху («Этот месяц» … «Прошлый год») или нажмите «Свой период», укажите даты «С»/«По» и нажмите «Применить».',
          'Переключайтесь между вкладками «Обзор», «Дебиторка», «Комиссии», «Сотрудники» и «По видам» — период на всех вкладках один и тот же.',
          'Нажмите «Скачать Excel», чтобы получить весь отчёт за выбранный период одним файлом.',
        ],
        tips: [
          'Выручка — счета, оплаченные в периоде (по дате оплаты); задолженность — отправленные, но неоплаченные счета.',
          'Период хранится в адресе страницы: скопированная ссылка откроет тот же вид.',
        ],
      },
      en: {
        title: 'Financial reports',
        purpose: 'Revenue, receivables, commissions and staff results for a chosen period — for management and the accountant. Administrators and the Super admin only.',
        steps: [
          'Pick the period with the buttons at the top (“This month” … “Last year”) or choose “Custom”, set From/To and click “Apply”.',
          'Switch between the tabs “Overview”, “Receivables”, “Commissions”, “Staff” and “By type” — the period stays the same on every tab.',
          'Click “Download Excel” to get the whole report for the selected period as one file.',
        ],
        tips: [
          'Revenue means invoices paid in the period (by payment date); receivables are invoices sent but not yet paid.',
          'The period is kept in the page address, so a copied link opens the same view.',
        ],
      },
      de: {
        title: 'Finanzberichte',
        purpose: 'Umsatz, offene Forderungen, Provisionen und Ergebnisse je Mitarbeiter im gewählten Zeitraum — für Geschäftsführung und Buchhaltung. Nur Administratoren und Super-Admin.',
        steps: [
          'Zeitraum oben wählen („Dieser Monat“ … „Letztes Jahr“) oder „Benutzerdefiniert“ wählen, Von/Bis eintragen und „Anwenden“ klicken.',
          'Zwischen den Reitern „Überblick“, „Forderungen“, „Provisionen“, „Mitarbeiter“ und „Nach Visumart“ wechseln — der Zeitraum bleibt überall gleich.',
          'Mit „Excel herunterladen“ erhalten Sie den ganzen Bericht des Zeitraums als eine Datei.',
        ],
        tips: [
          'Umsatz = im Zeitraum bezahlte Rechnungen (nach Zahlungsdatum); offene Forderungen = versendete, aber unbezahlte Rechnungen.',
          'Der Zeitraum steht in der Adresse: ein kopierter Link öffnet dieselbe Ansicht.',
        ],
      },
    },
  },
  {
    route: 'invoices',
    text: {
      az: {
        title: 'Hesab-fakturalar',
        purpose: 'Şirkətlərə (işəgötürənlərə) hesab-fakturalar: qaralama, PDF ilə göndərmə, ödəniş və xatırlatmalar. Yalnız Administrator və Baş administrator.',
        steps: [
          'İlk hesabdan əvvəl “Parametrlər” tabında bank rekvizitlərini, ƏDV dərəcəsini və ödəniş müddətini doldurub yadda saxlayın.',
          '“Hesab-fakturalar” tabında “Yeni hesab-faktura”nı basın, şirkəti seçin, “Mövqe əlavə et” ilə xidmətləri yazın və “Qaralamanı saxla”nı, sonra “Göndər”i basın.',
          'Pul daxil olanda “Əməliyyatlar” → “Ödənilib kimi qeyd et”; lazım olsa “Ləğv et (storno)”, “Kopyala”, “PDF” və ya “XRechnung (XML)” istifadə edin.',
        ],
        tips: [
          'Yalnız qaralamalar dəyişdirilə və silinə bilər; göndərilmiş hesab ləğv (storno) ilə düzəldilir.',
          'Müddəti keçən hesablar avtomatik “Gecikmiş” olur və şirkətə xatırlatma gedir. “CSV” filtrə uyğun siyahını endirir.',
        ],
      },
      ru: {
        title: 'Счета',
        purpose: 'Счета компаниям (работодателям): черновики, отправка PDF, оплаты и напоминания. Только Администратор и Главный администратор.',
        steps: [
          'Перед первым счётом заполните во вкладке «Настройки» банковские реквизиты, ставку НДС и срок оплаты и сохраните.',
          'Во вкладке «Счета» нажмите «Новый счёт», выберите компанию, добавьте услуги через «Добавить позицию», нажмите «Сохранить черновик», затем «Отправить».',
          'Когда деньги пришли — «Действия» → «Отметить как оплаченный»; при необходимости «Аннулировать (сторно)», «Дублировать», «PDF» или «XRechnung (XML)».',
        ],
        tips: [
          'Менять и удалять можно только черновики; отправленный счёт исправляется сторнированием.',
          'Просроченные счета автоматически получают статус «Просрочено», компании уходят напоминания. «CSV» выгружает список по фильтру.',
        ],
      },
      en: {
        title: 'Invoices',
        purpose: 'Invoices to companies (employers): drafts, sending the PDF, payments and reminders. Administrators and the Super admin only.',
        steps: [
          'Before the first invoice, fill in bank details, VAT rate and payment term in the “Settings” tab and save.',
          'In the “Invoices” tab click “New invoice”, choose the company, add services with “Add line”, click “Save draft” and then “Send”.',
          'When the money arrives use “Actions” → “Mark as paid”; if needed use “Cancel (credit note)”, “Duplicate”, “PDF” or “XRechnung (XML)”.',
        ],
        tips: [
          'Only drafts can be edited or deleted; a sent invoice is corrected by cancelling it.',
          'Invoices past their due date become “Overdue” automatically and the company gets reminders. “CSV” downloads the filtered list.',
        ],
      },
      de: {
        title: 'Rechnungen',
        purpose: 'Rechnungen an Unternehmen (Arbeitgeber): Entwurf, PDF-Versand, Zahlungseingang und Erinnerungen. Nur Administratoren und Super-Admin.',
        steps: [
          'Vor der ersten Rechnung im Reiter „Einstellungen“ Bankverbindung, USt-Satz und Zahlungsziel eintragen und speichern.',
          'Im Reiter „Rechnungen“ auf „Neue Rechnung“ klicken, Unternehmen wählen, Leistungen mit „Position hinzufügen“ erfassen, „Entwurf speichern“ und dann „Versenden“.',
          'Bei Zahlungseingang „Aktionen“ → „Als bezahlt markieren“; bei Bedarf „Stornieren“, „Duplizieren“, „PDF“ oder „XRechnung (XML)“.',
        ],
        tips: [
          'Nur Entwürfe lassen sich ändern oder löschen; versendete Rechnungen werden per Storno korrigiert.',
          'Fällige Rechnungen werden automatisch „Überfällig“ und das Unternehmen wird erinnert. „CSV“ lädt die gefilterte Liste herunter.',
        ],
      },
    },
  },
  {
    route: 'client-invoices',
    text: {
      az: {
        title: 'Müştəri hesab-fakturaları',
        purpose: 'Fərdi müştərilərə hesab-fakturalar (xidmət haqqı, səfirlik rüsumu və s.), ödənişlər və xatırlatmalar. Yalnız Administrator və Baş administrator.',
        steps: [
          'Hesabları “Açıq”, “Gecikən”, “Ödənilib”, “Qaralamalar” plitələri, status, tarix, “Yalnız gecikənlər” və axtarışla tapın.',
          '“Yeni hesab-faktura” ilə hesab yaradın; sətir menyusunda “Göndər”, “Ödəniş qeyd et”, “Qəbz”, “PDF” və ya “Ləğv et (Storno)”nu seçin.',
          '“Parametrlər” tabında ƏDV rejimini, ödəniş müddətini, xatırlatma günlərini və PDF altlığını yazıb yadda saxlayın.',
        ],
        tips: [
          'İkinci xatırlatmadan bir gün sonra müraciətin menecerinə tapşırıq yaradılır.',
          'Filtr və sütunları görünüş kimi saxlaya bilərsiniz; “CSV ixrac” cari siyahını endirir. Bir müraciətin hesabları müraciət səhifəsində də var.',
        ],
      },
      ru: {
        title: 'Счета клиентов',
        purpose: 'Счета частным клиентам (сервисный сбор, консульские сборы и др.), платежи и напоминания. Только Администратор и Главный администратор.',
        steps: [
          'Находите счета по плиткам «Открыто», «Просрочено», «Оплачено», «Черновики», статусу, датам, «Только просроченные» и поиску.',
          'Создайте счёт кнопкой «Новый счёт»; в меню строки — «Отправить», «Внести оплату», «Квитанция», «PDF» или «Аннулировать (Storno)».',
          'Во вкладке «Настройки» задайте режим НДС, срок оплаты, дни напоминаний и подвал PDF и сохраните.',
        ],
        tips: [
          'Через день после второго напоминания менеджер заявки получает задачу.',
          'Фильтры и столбцы можно сохранить как вид; «Экспорт CSV» выгружает текущий список. Счета одной заявки есть и на её странице.',
        ],
      },
      en: {
        title: 'Client invoices',
        purpose: 'Invoices to private clients (service fee, embassy fees etc.), their payments and reminders. Administrators and the Super admin only.',
        steps: [
          'Find invoices with the tiles “Open”, “Overdue”, “Paid”, “Drafts”, the status, the dates, “Overdue only” and search.',
          'Create one with “New invoice”; in the row menu use “Send”, “Record payment”, “Receipt”, “PDF” or “Cancel (Storno)”.',
          'In the “Settings” tab set the VAT mode, payment term, reminder days and PDF footer, then save.',
        ],
        tips: [
          'One day after the second reminder the case manager gets a task.',
          'Filters and columns can be saved as a view; “Export CSV” downloads the current list. A case’s invoices are also on the case page.',
        ],
      },
      de: {
        title: 'Kundenrechnungen',
        purpose: 'Rechnungen an Privatkunden (Servicegebühr, Botschaftsgebühren u. a.), Zahlungen und Mahnungen. Nur Administratoren und Super-Admin.',
        steps: [
          'Rechnungen über die Kacheln „Offen“, „Überfällig“, „Bezahlt“, „Entwürfe“, Status, Datum, „Nur überfällige“ und Suche finden.',
          'Mit „Neue Rechnung“ anlegen; im Zeilenmenü „Senden“, „Zahlung erfassen“, „Quittung“, „PDF“ oder „Stornieren“ wählen.',
          'Im Reiter „Einstellungen“ USt-Modus, Zahlungsziel, Erinnerungstage und PDF-Fußzeile festlegen und speichern.',
        ],
        tips: [
          'Einen Tag nach der zweiten Erinnerung erhält der zuständige Mitarbeiter eine Aufgabe.',
          'Filter und Spalten lassen sich als Ansicht speichern; „CSV-Export“ lädt die aktuelle Liste. Die Rechnungen eines Falls stehen auch auf der Fallseite.',
        ],
      },
    },
  },
  {
    route: 'packages',
    text: {
      az: {
        title: 'Xidmət paketləri',
        purpose: 'Müştərilərin onlayn sifariş edib imzaladığı Basic / Standard / Premium paketlər: 4 dildə mətnlər, qiymət, viza növləri, ödəniş və müqavilə şablonu. Yalnız Administrator və Baş administrator.',
        steps: [
          '“Paketlər” tabında “Yeni paket”i basın; səviyyəni, mətnləri, qiyməti, viza növlərini, ödəniş və müqavilə şablonunu doldurub saxlayın.',
          'Paketi müştərilərə göstərmək üçün “Dərc edilib” edin və ya “Gizli” saxlayın; “Tövsiyə olunan” paketi önə çıxarır.',
          '“Sifarişlər” tabında sifarişi, imzanı və müraciəti izləyin; lazım olsa “Linki yenidən göndər”, “Aktivləşdirməni təkrarla” və ya “Sifarişi ləğv et”.',
        ],
        tips: [
          'Ödəniş şablonunda faizlərin cəmi 100 olmalıdır; boş qalarsa imza zamanı tam ödəniş tələb olunur.',
          'Digər valyutalarda qiymətlər istəyə bağlıdır; yoxdursa əsas qiymət göstərilir.',
        ],
      },
      ru: {
        title: 'Пакеты услуг',
        purpose: 'Пакеты Basic / Standard / Premium, которые клиенты заказывают и подписывают онлайн: тексты на 4 языках, цена, виды виз, шаблон платежей и договора. Только Администратор и Главный администратор.',
        steps: [
          'Во вкладке «Пакеты» нажмите «Новый пакет», заполните уровень, тексты, цену, виды виз, шаблоны платежей и договора и сохраните.',
          'Чтобы клиенты видели пакет, сделайте его «Опубликован», иначе он «Скрыт»; «Рекомендуемый» выделяет пакет.',
          'Во вкладке «Заказы» следите за заказом, подписью и заявкой; при необходимости — «Отправить ссылку снова», «Повторить активацию» или «Аннулировать заказ».',
        ],
        tips: [
          'Проценты в шаблоне платежей должны давать 100; пустой шаблон — полная оплата при подписании.',
          'Цены в других валютах необязательны; без них показывается базовая цена.',
        ],
      },
      en: {
        title: 'Service packages',
        purpose: 'Basic / Standard / Premium packages that clients order and sign online: texts in 4 languages, price, visa types, instalment and contract template. Administrators and the Super admin only.',
        steps: [
          'In the “Packages” tab click “New package”, fill in tier, texts, price, visa types, instalment template and contract template, and save.',
          'Make a package “Published” so clients see it, or keep it “Hidden”; “Recommended” highlights it.',
          'In the “Orders” tab follow each order, signature and case; use “Resend link”, “Retry activation” or “Cancel order” when needed.',
        ],
        tips: [
          'Instalment percentages must add up to 100; an empty template means full payment on signing.',
          'Prices in other currencies are optional; without them the base price is shown.',
        ],
      },
      de: {
        title: 'Servicepakete',
        purpose: 'Basic-/Standard-/Premium-Pakete, die Kunden online bestellen und unterschreiben: Texte in 4 Sprachen, Preis, Visumarten, Raten- und Vertragsvorlage. Nur Administratoren und Super-Admin.',
        steps: [
          'Im Reiter „Pakete“ auf „Neues Paket“ klicken, Stufe, Texte, Preis, Visumarten, Raten- und Vertragsvorlage ausfüllen und speichern.',
          'Ein Paket auf „Veröffentlicht“ setzen, damit Kunden es sehen, sonst bleibt es „Verborgen“; „Empfohlen“ hebt es hervor.',
          'Im Reiter „Bestellungen“ Bestellung, Unterschrift und Fall verfolgen; bei Bedarf „Link erneut senden“, „Aktivierung wiederholen“ oder „Bestellung stornieren“.',
        ],
        tips: [
          'Die Prozente der Ratenvorlage müssen 100 ergeben; leer bedeutet Vollzahlung bei Unterschrift.',
          'Preise in anderen Währungen sind optional; sonst wird der Basispreis gezeigt.',
        ],
      },
    },
  },
  {
    route: 'accounting',
    text: {
      az: {
        title: 'Mühasibat (DATEV, valyutalar)',
        purpose: 'Mühasib üçün: Alman şirkətinin hesab və ödənişlərinin DATEV ixracı, DATEV parametrləri, sənəd valyutaları, Bakı ofisi kimi ikinci hüquqi şəxs və məzənnələr. Yalnız Administrator və Baş administrator.',
        steps: [
          '“DATEV ixracı” tabında dövrü seçin, “Ödənişlər daxil olsun” və ya “Hesab-faktura PDF-ləri ilə ZIP”i işarələyin, “Önizləmə”ni yoxlayıb “Yüklə”ni basın.',
          '“DATEV parametrləri” tabında vergi məsləhətçisindən alınan nömrələri və hesabları yazıb “Yadda saxla”nı basın.',
          '“Valyutalar və şirkətlər” tabında hər şirkətin valyutasını, Bakı ofisinin məlumatlarını və “Məzənnələr”i (1 EUR = x) qeyd edin.',
        ],
        tips: [
          'Bakı ofisinin sənədləri DATEV-ə düşmür.',
          'Məzənnəsi olmayan sənəd önizləmədə qeyd kimi görünür — əvvəlcə məzənnəni əlavə edin. Fərqli valyutalı məbləğlər heç vaxt toplanmır.',
        ],
      },
      ru: {
        title: 'Бухгалтерия (DATEV, валюты)',
        purpose: 'Для бухгалтера: экспорт DATEV счетов и платежей немецкой компании, настройки DATEV, валюты документов, второе юрлицо (офис в Баку) и курсы. Только Администратор и Главный администратор.',
        steps: [
          'Во вкладке «Экспорт DATEV» выберите период, отметьте «Включить платежи» или «ZIP с PDF счетов», проверьте «Предпросмотр» и нажмите «Скачать».',
          'Во вкладке «Настройки DATEV» внесите номера и счета от налогового консультанта и нажмите «Сохранить».',
          'Во вкладке «Валюты и юрлица» задайте валюту каждого юрлица, данные офиса в Баку и «Курсы валют» (1 EUR = x).',
        ],
        tips: [
          'Документы офиса в Баку в DATEV не попадают.',
          'Документ без курса виден в предпросмотре как замечание — сначала добавьте курс. Суммы в разных валютах никогда не складываются.',
        ],
      },
      en: {
        title: 'Accounting (DATEV, currencies)',
        purpose: 'For the accountant: DATEV export of the German company’s invoices and payments, DATEV settings, document currencies, the second entity (Baku office) and exchange rates. Administrators and the Super admin only.',
        steps: [
          'In “DATEV export” choose the period, tick “Include payments” or “ZIP with the invoice PDFs”, check the “Preview” and click “Download”.',
          'In “DATEV settings” enter the numbers and accounts from the tax adviser and click “Save”.',
          'In “Currencies & entities” set each entity’s currency, the Baku office details and the “Exchange rates” (1 EUR = x).',
        ],
        tips: [
          'Documents of the Baku office are not part of the DATEV export.',
          'A document without an exchange rate shows a note in the preview — add the rate first. Amounts in different currencies are never added up.',
        ],
      },
      de: {
        title: 'Buchhaltung (DATEV, Währungen)',
        purpose: 'Für die Buchhaltung: DATEV-Export der Rechnungen und Zahlungen der deutschen Gesellschaft, DATEV-Einstellungen, Belegwährungen, zweite Gesellschaft (Büro Baku) und Wechselkurse. Nur Administratoren und Super-Admin.',
        steps: [
          'Im Reiter „DATEV-Export“ Zeitraum wählen, „Zahlungen einbeziehen“ oder „ZIP mit Rechnungs-PDFs“ ankreuzen, „Vorschau“ prüfen und „Herunterladen“ klicken.',
          'Im Reiter „DATEV-Einstellungen“ Nummern und Konten vom Steuerberater eintragen und „Speichern“ klicken.',
          'Im Reiter „Währungen & Gesellschaften“ Währung je Gesellschaft, Daten des Büros Baku und „Wechselkurse“ (1 EUR = x) pflegen.',
        ],
        tips: [
          'Belege des Büros Baku gehen nicht in den DATEV-Export.',
          'Ein Beleg ohne Wechselkurs erscheint in der Vorschau als Hinweis — zuerst den Kurs eintragen. Beträge verschiedener Währungen werden nie addiert.',
        ],
      },
    },
  },
  {
    route: 'quotes',
    text: {
      az: {
        title: 'Təkliflər',
        purpose: 'Alman işəgötürənlərə kommersiya təklifləri (Angebot): kataloqdan sətirlər, PDF, işəgötürənin onlayn qəbulu və hesab-fakturaya çevrilmə. Yalnız Administrator və Baş administrator.',
        steps: [
          '“Yeni təklif”i basın və addımları keçin: şirkət, vakansiya, mövqelər, mətnlər, önizləmə; sətirləri kataloqdan bir kliklə əlavə edin.',
          '“Saxla və göndər”i basın: işəgötürən link alır və təklifi onlayn qəbul və ya rədd edir. “Linki kopyala” linki verir.',
          'Qəbul olunan təklifi “Hesab-fakturaya çevir” ilə hesaba çevirin; “Hesaba çevrilməli” plitəsi gözləyənləri göstərir.',
        ],
        tips: [
          'Qiymətlər, giriş/son mətnlər, etibarlılıq və xatırlatma günləri “Kataloq və mətnlər” tabındadır.',
          'Sənəd həmişə alman dilindədir; yalnız e-poçtun dili seçilir. Modulu Baş administrator “Modullar”da söndürə bilər.',
        ],
      },
      ru: {
        title: 'Предложения',
        purpose: 'Коммерческие предложения (Angebote) немецким работодателям: позиции из каталога, PDF, онлайн-принятие работодателем и превращение в счёт. Только Администратор и Главный администратор.',
        steps: [
          'Нажмите «Новое предложение» и пройдите шаги: компания, вакансия, позиции, тексты, предпросмотр; позиции добавляются из каталога одним кликом.',
          'Нажмите «Сохранить и отправить»: работодатель получает ссылку и принимает или отклоняет предложение онлайн. «Копировать ссылку» даёт ссылку.',
          'Принятое предложение превратите в счёт кнопкой «Превратить в счёт»; плитка «Ещё выставить счёт» показывает ожидающие.',
        ],
        tips: [
          'Цены, вводные и заключительные тексты, срок действия и дни напоминания — во вкладке «Каталог и тексты».',
          'Документ всегда на немецком; выбирается только язык письма. Главный администратор может отключить модуль в разделе «Модули».',
        ],
      },
      en: {
        title: 'Quotations',
        purpose: 'Quotations (Angebote) for German employers: catalogue lines, PDF, online acceptance by the employer and conversion into an invoice. Administrators and the Super admin only.',
        steps: [
          'Click “New quotation” and go through the steps Company, Vacancy, Items, Texts and Preview; add catalogue lines with one click.',
          'Click “Save and send”: the employer gets a link and accepts or declines online. “Copy link” gives you the link.',
          'Turn an accepted quotation into an invoice with “Convert to invoice”; the “To be invoiced” tile shows those still waiting.',
        ],
        tips: [
          'Prices, intro and closing texts, validity and reminder days live in the “Catalogue & texts” tab.',
          'The document is always in German; only the e-mail language can be chosen. The Super admin can switch the module off under Modules.',
        ],
      },
      de: {
        title: 'Angebote',
        purpose: 'Angebote für deutsche Arbeitgeber: Katalogpositionen, PDF, Online-Annahme durch den Arbeitgeber und Umwandlung in eine Rechnung. Nur Administratoren und Super-Admin.',
        steps: [
          '„Neues Angebot“ klicken und die Schritte Unternehmen, Stelle, Positionen, Texte und Vorschau durchgehen; Katalogpositionen per Klick hinzufügen.',
          '„Speichern und senden“ klicken: der Arbeitgeber erhält einen Link und nimmt online an oder lehnt ab. „Link kopieren“ liefert den Link.',
          'Ein angenommenes Angebot mit „In Rechnung umwandeln“ abrechnen; die Kachel „Noch abzurechnen“ zeigt offene Fälle.',
        ],
        tips: [
          'Preise, Einleitungs- und Schlusstexte, Gültigkeit und Erinnerungstage stehen im Reiter „Katalog & Texte“.',
          'Das Dokument ist immer deutsch; wählbar ist nur die E-Mail-Sprache. Der Super-Admin kann das Modul unter „Module“ abschalten.',
        ],
      },
    },
  },
  {
    route: 'settlements/*',
    text: {
      az: {
        title: 'Hesablaşmalar',
        purpose: 'Komandanın hesablaşma cədvəli (Excel-in əvəzi): müştərini kim gətirib, nə ödənilib və pul necə bölünür. Modul açıqdırsa bütün əməkdaşlar üçündür.',
        steps: [
          '“Hamısı”, “Ödənilməyənlər”, vərəqlər və ya partnyorlar tabını seçin; mərhələ, partnyor, ay və axtarışla süzün.',
          '“Yeni müştərinin adı…” sahəsinə ad yazıb “Əlavə et”i basın, xanaları birbaşa dəyişin və hamısını “Yadda saxla” (Ctrl+S) ilə saxlayın.',
          '“Excel idxal”, “Excel ixrac” və “Bölgü qaydaları”ndan istifadə edin; sətirləri seçib, məsələn, “Hamısı ödənildi” edin.',
        ],
        tips: [
          'Düymələr: Enter — redaktə, Tab — növbəti xana, Esc — ləğv, Ctrl+Z — geri al.',
          'Saxlanmamış dəyişikliklər qaralama kimi qalır — çıxmazdan əvvəl saxlayın. Modulu Baş administrator söndürə bilər.',
        ],
      },
      ru: {
        title: 'Расчёты',
        purpose: 'Таблица расчётов команды (замена Excel): кто привёл клиента, что оплачено и как делятся деньги. Доступна всем сотрудникам, если модуль включён.',
        steps: [
          'Выберите вкладку «Все», «Неоплаченные», лист или партнёра; фильтруйте по этапу, партнёру, месяцу и поиску.',
          'Введите имя в поле «Имя нового клиента…», нажмите «Добавить», правьте ячейки прямо в таблице и сохраните всё кнопкой «Сохранить» (Ctrl+S).',
          'Используйте «Импорт Excel», «Экспорт Excel» и «Правила раздела»; выделите строки для массовых действий, например «Всё оплачено».',
        ],
        tips: [
          'Клавиши: Enter — редактировать, Tab — следующая ячейка, Esc — отмена, Ctrl+Z — отменить.',
          'Несохранённые изменения остаются черновиком — сохраните их перед уходом. Главный администратор может отключить модуль.',
        ],
      },
      en: {
        title: 'Settlements',
        purpose: 'The team’s settlement ledger, replacing the Excel workbook: who brought the client, what was paid and how the money is split. Open to all staff when the module is on.',
        steps: [
          'Choose the “All” or “Unpaid” tab, a sheet or a partner; filter by stage, partner, month or search.',
          'Type a name in “New client name…”, click “Add”, edit cells directly in the table and store everything with “Save” (Ctrl+S).',
          'Use “Import Excel”, “Export Excel” and “Split rules”; select rows for bulk actions such as “All paid”.',
        ],
        tips: [
          'Keys: Enter edit, Tab next cell, Esc cancel, Ctrl+Z undo.',
          'Unsaved changes stay as drafts — save before you leave. The Super admin can switch the module off.',
        ],
      },
      de: {
        title: 'Abrechnungen',
        purpose: 'Die Abrechnungstabelle des Teams (ersetzt die Excel-Datei): wer den Kunden gebracht hat, was bezahlt wurde und wie geteilt wird. Für alle Mitarbeiter, wenn das Modul aktiv ist.',
        steps: [
          'Reiter „Alle“, „Offen“, ein Blatt oder einen Partner wählen; nach Phase, Partner, Monat oder Suche filtern.',
          'Namen in „Name des neuen Kunden…“ eingeben, „Hinzufügen“ klicken, Zellen direkt bearbeiten und alles mit „Speichern“ (Strg+S) sichern.',
          '„Excel importieren“, „Excel exportieren“ und „Aufteilungsregeln“ nutzen; Zeilen markieren für Sammelaktionen wie „Alles bezahlt“.',
        ],
        tips: [
          'Tasten: Enter bearbeiten, Tab nächste Zelle, Esc abbrechen, Strg+Z rückgängig.',
          'Ungespeicherte Änderungen bleiben Entwürfe — vor dem Verlassen speichern. Der Super-Admin kann das Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'profitability',
    text: {
      az: {
        title: 'Gəlirlilik',
        purpose: 'Hər müraciət üzrə gəlir, xərclər və marja (EUR, AZN ekvivalenti ilə) — rəhbərlik üçün. Yalnız Administrator və Baş administrator.',
        steps: [
          '“Açılıb (başlanğıc/son)” tarixlərini, statusu və viza növünü seçib “Tətbiq et”i basın — dövr müraciətin açıldığı tarixdir.',
          '“Bölgü” altında viza növü, kateqoriya, partnyor, agent, məsul əməkdaş, işəgötürən və ay arasında keçin; zərərli qruplar qırmızı görünür.',
          'Müraciət siyahısında “Ən gəlirli 10”, “Ən az gəlirli 10” və “Bütün müraciətlər” arasında keçin; ixrac üçün “Report builder-də aç (Excel)”.',
        ],
        tips: [
          '“Necə hesablanır” bloku qaydaları izah edir; standart AZN məzənnəsi “Valyuta və qaydalar”dadır.',
          'Əl ilə xərclər (kuryer, rüsumlar …) müraciət səhifəsində “Xərc əlavə et” ilə yazılır.',
        ],
      },
      ru: {
        title: 'Рентабельность',
        purpose: 'Выручка, расходы и маржа по каждому делу (EUR, с эквивалентом в AZN) — для руководства. Только Администратор и Главный администратор.',
        steps: [
          'Укажите «Открыто с/по», статус и тип визы и нажмите «Применить» — период считается по дате открытия дела.',
          'В блоке «Разбивка» переключайтесь между типом визы, категорией, партнёром, агентом, ответственным, работодателем и месяцем; убыточные группы видны красным.',
          'В списке дел переключайте «Топ-10», «Худшие 10» и «Все дела»; для выгрузки — «Открыть в конструкторе отчётов (Excel)».',
        ],
        tips: [
          'Блок «Как считается» объясняет правила; курс AZN по умолчанию — в «Валюта и правила».',
          'Ручные расходы (курьер, сборы …) добавляются на странице дела кнопкой «Добавить расход».',
        ],
      },
      en: {
        title: 'Profitability',
        purpose: 'Revenue, costs and margin per case (EUR, with the AZN equivalent) — for management. Administrators and the Super admin only.',
        steps: [
          'Set “Opened from/to”, status and visa type and click “Apply” — the period is the date the case was opened.',
          'Under “Breakdown” switch between visa type, category, partner, agent, staff owner, employer and month; loss-making groups show in red.',
          'In the case list switch between “Top 10”, “Bottom 10” and “All cases”; export with “Open in the report builder (Excel)”.',
        ],
        tips: [
          '“How it is calculated” explains the rules; the default AZN rate is under “Currency and rules”.',
          'Manual costs (courier, fees …) are added on the case page with “Add cost”.',
        ],
      },
      de: {
        title: 'Rentabilität',
        purpose: 'Umsatz, Kosten und Marge je Fall (EUR, mit AZN-Gegenwert) — für die Geschäftsführung. Nur Administratoren und Super-Admin.',
        steps: [
          '„Eröffnet ab/bis“, Status und Visumart wählen und „Anwenden“ klicken — Zeitraum ist das Eröffnungsdatum des Falls.',
          'Unter „Aufschlüsselung“ zwischen Visumart, Kategorie, Vermittler, Agent, Sachbearbeiter, Arbeitgeber und Monat wechseln; Gruppen mit Verlust sind rot.',
          'In der Fallliste zwischen „Top 10“, „Schwächste 10“ und „Alle Fälle“ wechseln; Export über „Im Berichtsgenerator öffnen (Excel)“.',
        ],
        tips: [
          '„So wird gerechnet“ erklärt die Regeln; der Standard-AZN-Kurs steht unter „Währung und Regeln“.',
          'Manuelle Kosten (Kurier, Gebühren …) werden auf der Fallseite mit „Kosten hinzufügen“ erfasst.',
        ],
      },
    },
  },
  {
    route: 'business-analytics',
    text: {
      az: {
        title: 'Biznes analitikası',
        purpose: 'Rəhbərlik üçün: viza mərhələləri nə qədər çəkir, partnyorlar, agentlər və əməkdaşlar necə işləyir, müştəri hunisi və gəlir/satış. Yalnız Administrator və Baş administrator.',
        steps: [
          'Yuxarıda dövrü seçin (3, 6, 12 ay) və ya “Seçilmiş” tarixləri yazıb “Tətbiq et”i basın.',
          '“Mərhələlər”, “Partnyorlar”, “Huni” və “Gəlir və satış” tabları arasında keçin.',
          '“Mərhələlər”də “İndi hallar harada gözləyir” blokunda darboğazları yoxlayın; cədvəlləri “CSV” ilə endirin.',
        ],
        tips: [
          '“Viza kateqoriyası” filtri mərhələləri bir kateqoriyaya daraldır.',
          '“Huni” tabı qeydiyyat ayına görə kohortları göstərir.',
        ],
      },
      ru: {
        title: 'Бизнес-аналитика',
        purpose: 'Для руководства: сколько длятся визовые этапы, как работают партнёры, агенты и сотрудники, воронка клиентов и выручка/продажи. Только Администратор и Главный администратор.',
        steps: [
          'Выберите период вверху (3, 6, 12 месяцев) или «Свой период» с датами и нажмите «Применить».',
          'Переключайтесь между вкладками «Этапы», «Партнёры», «Воронка» и «Выручка и продажи».',
          'На «Этапах» смотрите блок «Где дела ждут сейчас» — узкие места; таблицы выгружаются кнопкой «CSV».',
        ],
        tips: [
          'Фильтр «Визовая категория» сужает этапы до одной категории.',
          'Вкладка «Воронка» показывает когорты по месяцу регистрации.',
        ],
      },
      en: {
        title: 'Business analytics',
        purpose: 'For management: how long visa stages take, how partners, agents and staff perform, the client funnel and revenue & sales. Administrators and the Super admin only.',
        steps: [
          'Choose the period at the top (3, 6, 12 months) or “Custom” dates and click “Apply”.',
          'Switch between the tabs “Stages”, “Partners”, “Funnel” and “Revenue & sales”.',
          'On “Stages” check “Where cases wait right now” for bottlenecks; download tables with “CSV”.',
        ],
        tips: [
          'The “Visa category” filter narrows the stages to one category.',
          'The “Funnel” tab shows cohorts by registration month.',
        ],
      },
      de: {
        title: 'Geschäftsanalyse',
        purpose: 'Für die Geschäftsführung: Dauer der Visa-Phasen, Ergebnisse von Partnern, Agenten und Mitarbeitern, Kundentrichter sowie Umsatz & Vertrieb. Nur Administratoren und Super-Admin.',
        steps: [
          'Oben den Zeitraum wählen (3, 6, 12 Monate) oder „Benutzerdefiniert“ mit Daten und „Anwenden“.',
          'Zwischen den Reitern „Phasen“, „Partner“, „Trichter“ und „Umsatz & Vertrieb“ wechseln.',
          'Unter „Phasen“ zeigt „Wo Fälle gerade warten“ die Engpässe; Tabellen mit „CSV“ herunterladen.',
        ],
        tips: [
          'Der Filter „Visakategorie“ beschränkt die Phasen auf eine Kategorie.',
          'Der Reiter „Trichter“ zeigt Kohorten nach Registrierungsmonat.',
        ],
      },
    },
  },
  {
    route: 'reports',
    text: {
      az: {
        title: 'Hesabat qurucusu',
        purpose: 'Sistem məlumatlarından öz hesabatınızı qurun: məlumat toplusu, sütunlar, filtrlər və qruplaşdırma; Excel/CSV/PDF kimi endirin və ya cədvəllə göndərin. Administrator və Baş administrator üçün.',
        steps: [
          '“Yeni hesabat”ı basın, “Məlumat toplusu”nu seçin, “Sütunlar”ı işarələyin, “Filtrlər” və istəyə görə “Qruplaşdırma” əlavə edib “Göstər”i basın.',
          'Cədvələ və ya diaqrama baxın, sonra “İxrac” ilə Excel (.xlsx), CSV və ya PDF alın.',
          '“Saxla” ilə hesabatı “Saxlanmış hesabatlar”a əlavə edin (istəsəniz “Bütün adminlərlə paylaş”), sonra “Cədvəl” ilə gündəlik, həftəlik və ya aylıq göndərişi qurun.',
        ],
        tips: [
          'Paylaşılmış hesabatı yalnız sahibi dəyişə bilər — “Yeni kimi saxla” istifadə edin.',
          'Xarici alıcılar icazə siyahısında olmalıdır (Baş administrator təyin edir); onlar üçün həssas sütunlar gizlədilir.',
        ],
      },
      ru: {
        title: 'Конструктор отчётов',
        purpose: 'Собственные отчёты по данным системы: набор данных, столбцы, фильтры и группировка; выгрузка в Excel/CSV/PDF или рассылка по расписанию. Для Администратора и Главного администратора.',
        steps: [
          'Нажмите «Новый отчёт», выберите «Набор данных», отметьте «Столбцы», добавьте «Фильтры» и при желании «Группировку» и нажмите «Показать».',
          'Проверьте таблицу или диаграмму, затем через «Экспорт» получите Excel (.xlsx), CSV или PDF.',
          '«Сохранить» добавляет отчёт в «Сохранённые отчёты» (можно «Открыть всем администраторам»), а «Расписание» настраивает ежедневную, еженедельную или ежемесячную рассылку.',
        ],
        tips: [
          'Общий отчёт может менять только автор — используйте «Сохранить как новый».',
          'Внешние получатели должны быть в белом списке (его задаёт Главный администратор); для них чувствительные столбцы скрыты.',
        ],
      },
      en: {
        title: 'Report builder',
        purpose: 'Build your own reports from the system’s data: dataset, columns, filters and grouping; download as Excel/CSV/PDF or send on a schedule. For Administrators and the Super admin.',
        steps: [
          'Click “New report”, choose the “Dataset”, tick “Columns”, add “Filters” and optionally “Group by”, then click “Show”.',
          'Check the table or chart, then use “Export” for Excel (.xlsx), CSV or PDF.',
          '“Save” keeps the report under “Saved reports” (optionally “Share with all admins”); “Schedule” sends it daily, weekly or monthly.',
        ],
        tips: [
          'Only the owner can change a shared report — use “Save as new”.',
          'External recipients must be on the allow-list set by the Super admin; sensitive columns are masked for them.',
        ],
      },
      de: {
        title: 'Berichtsgenerator',
        purpose: 'Eigene Berichte aus den Systemdaten: Datenbestand, Spalten, Filter und Gruppierung; als Excel/CSV/PDF herunterladen oder per Zeitplan versenden. Für Administratoren und Super-Admin.',
        steps: [
          '„Neuer Bericht“ klicken, „Datenbestand“ wählen, „Spalten“ ankreuzen, „Filter“ und optional „Gruppierung“ setzen und „Anzeigen“ klicken.',
          'Tabelle oder Diagramm prüfen, dann über „Export“ Excel (.xlsx), CSV oder PDF erzeugen.',
          '„Speichern“ legt den Bericht unter „Gespeicherte Berichte“ ab (optional „Mit allen Admins teilen“); „Zeitplan“ versendet ihn täglich, wöchentlich oder monatlich.',
        ],
        tips: [
          'Einen geteilten Bericht kann nur der Eigentümer ändern — „Als neu speichern“ nutzen.',
          'Externe Empfänger müssen auf der Freigabeliste des Super-Admins stehen; sensible Spalten werden für sie maskiert.',
        ],
      },
    },
  },
  {
    route: 'quarterly-report',
    text: {
      az: {
        title: 'Rüblük hesabat',
        purpose: 'Rüb üzrə ictimai “Azərbaycan → Almaniya əmək mobilliyi” PDF hesabatı; yalnız ən azı 3 müraciətdən ibarət anonim qruplar göstərilir.',
        steps: [
          '“Rüb” və “İl”i seçin: təsdiqlənən vizalar, peşələr, viza növləri, federal ştatlar, alman dili səviyyəsi və mərhələ müddətləri görünür.',
          'İstəsəniz hər dil üçün “Giriş mətni”ni yazıb “Girişi yadda saxla”nı basın; “PDF endir” faylı verir.',
          '“Dərc et (/reports)” hesabatı ictimai səhifəyə çıxarır; “Dərcdən çıxar” onu geri götürür.',
        ],
        tips: [
          'Dərc edərkən rəqəmlər dondurulur; yeniləmək üçün dərcdən çıxarıb yenidən dərc edin.',
          'Girişi dəyişmək və dərc etmək yalnız administratorlara açıqdır; əməkdaşlar yalnız baxır.',
        ],
      },
      ru: {
        title: 'Квартальный отчёт',
        purpose: 'Публичный PDF-отчёт «Трудовая мобильность Азербайджан → Германия» за квартал; показываются только анонимные группы от 3 заявок.',
        steps: [
          'Выберите «Квартал» и «Год»: одобренные визы, профессии, виды виз, федеральные земли, уровень немецкого и время по этапам.',
          'При желании напишите «Введение» на каждом языке и нажмите «Сохранить введение»; «Скачать PDF» даёт файл.',
          '«Опубликовать (/reports)» выкладывает отчёт на публичную страницу; «Снять с публикации» убирает его.',
        ],
        tips: [
          'При публикации цифры фиксируются; чтобы обновить, снимите с публикации и опубликуйте снова.',
          'Редактировать введение и публиковать могут только администраторы; сотрудники только смотрят.',
        ],
      },
      en: {
        title: 'Quarterly report',
        purpose: 'The public “Azerbaijan → Germany labour mobility” PDF report per quarter; only anonymous groups of at least 3 applications are shown.',
        steps: [
          'Choose “Quarter” and “Year” to see approved visas, professions, visa types, federal states, German level and time per stage.',
          'Optionally write the “Introduction” in each language and click “Save introduction”; “Download PDF” gives you the file.',
          '“Publish (/reports)” puts the report on the public page; “Unpublish” takes it down.',
        ],
        tips: [
          'Publishing freezes the figures; to refresh them, unpublish and publish again.',
          'Only administrators can edit the introduction and publish; staff can only view.',
        ],
      },
      de: {
        title: 'Quartalsbericht',
        purpose: 'Der öffentliche PDF-Bericht „Arbeitsmobilität Aserbaidschan → Deutschland“ je Quartal; gezeigt werden nur anonyme Gruppen ab 3 Anträgen.',
        steps: [
          '„Quartal“ und „Jahr“ wählen: genehmigte Visa, Berufe, Visumarten, Bundesländer, Deutschniveau und Dauer je Phase.',
          'Optional die „Einleitung“ je Sprache schreiben und „Einleitung speichern“ klicken; „PDF herunterladen“ liefert die Datei.',
          '„Veröffentlichen (/reports)“ stellt den Bericht auf die öffentliche Seite; „Veröffentlichung zurückziehen“ nimmt ihn herunter.',
        ],
        tips: [
          'Beim Veröffentlichen werden die Zahlen eingefroren; zum Aktualisieren zurückziehen und neu veröffentlichen.',
          'Einleitung und Veröffentlichung nur für Administratoren; Mitarbeiter können nur ansehen.',
        ],
      },
    },
  },
  {
    route: 'mailboxes',
    text: {
      az: {
        title: 'Poçt qutuları',
        purpose: 'Öz domenimizdəki e-poçt qutuları: əməkdaşlar üçün ünvan yaratmaq, şifrə, aliaslar, kvota və avtomatik cavab. Yalnız Administrator və Baş administrator.',
        steps: [
          '“Yeni poçt qutusu”nu basın, @ işarəsindən əvvəlki hissəni, adı, istəyə görə kvota və aliasları yazıb “Yarat”ı basın; göstərilən şifrəni dərhal kopyalayın.',
          'Sətirdə “Redaktə et” (ad, kvota, aliaslar, bağlı işçi), “Şifrəni sıfırla” və ya “Avtomatik cavab”ı seçin.',
          'Lazım olmayan qutunu “Deaktiv et” və ya tam ünvanı yazaraq təsdiqləyib “Sil”.',
        ],
        tips: [
          'Şifrə yalnız bir dəfə göstərilir; sonra ancaq sıfırlamaq olar.',
          'Silmək geri qaytarılmır — bütün məktublar da silinir. Xidməti ünvanlar (postmaster, no-reply …) qorunur.',
        ],
      },
      ru: {
        title: 'Почтовые ящики',
        purpose: 'Почтовые ящики нашего домена: создание адресов для сотрудников, пароли, псевдонимы, квота и автоответ. Только Администратор и Главный администратор.',
        steps: [
          'Нажмите «Новый ящик», введите часть адреса до @, имя, при необходимости квоту и псевдонимы и нажмите «Создать»; сразу скопируйте показанный пароль.',
          'В строке выберите «Изменить» (имя, квота, псевдонимы, сотрудник), «Сбросить пароль» или «Автоответ».',
          'Ненужный ящик можно «Отключить» или «Удалить», подтвердив полным адресом.',
        ],
        tips: [
          'Пароль показывается только один раз; потом его можно только сбросить.',
          'Удаление необратимо — все письма удаляются. Служебные адреса (postmaster, no-reply …) защищены.',
        ],
      },
      en: {
        title: 'Mailboxes',
        purpose: 'E-mail mailboxes on our own domain: create addresses for staff, passwords, aliases, quota and auto-reply. Administrators and the Super admin only.',
        steps: [
          'Click “New mailbox”, enter the part before the @, the display name and optionally quota and aliases, then “Create”; copy the password shown right away.',
          'In the row choose “Edit” (name, quota, aliases, linked staff member), “Reset password” or “Auto-reply”.',
          '“Disable” a mailbox you do not need now, or “Delete” it after typing the full address to confirm.',
        ],
        tips: [
          'The password is shown only once; afterwards it can only be reset.',
          'Deleting cannot be undone — all mail is removed. System addresses (postmaster, no-reply …) are protected.',
        ],
      },
      de: {
        title: 'Postfächer',
        purpose: 'E-Mail-Postfächer unserer eigenen Domain: Adressen für Mitarbeiter anlegen, Passwörter, Aliasse, Speicherplatz und automatische Antwort. Nur Administratoren und Super-Admin.',
        steps: [
          '„Neues Postfach“ klicken, den Teil vor dem @, den Anzeigenamen und optional Speicher und Aliasse eingeben, „Anlegen“; das angezeigte Passwort sofort kopieren.',
          'In der Zeile „Bearbeiten“ (Name, Speicher, Aliasse, Mitarbeiter), „Passwort zurücksetzen“ oder „Automatische Antwort“ wählen.',
          'Ein nicht benötigtes Postfach „Deaktivieren“ oder nach Eingabe der vollen Adresse „Löschen“.',
        ],
        tips: [
          'Das Passwort wird nur einmal angezeigt; danach kann es nur zurückgesetzt werden.',
          'Löschen ist endgültig — alle E-Mails gehen verloren. Systemadressen (postmaster, no-reply …) sind geschützt.',
        ],
      },
    },
  },
  {
    route: 'email-delivery',
    text: {
      az: {
        title: 'E-poçt göndərişi',
        purpose: 'Göndərilən məktubların nəticəsi: SMTP xətaları, geri qayıdan məktublar, spam şikayətləri, bloklanmış ünvanlar, SPF/DKIM/DMARC və avtomatik müraciət limitinin vəziyyəti. Yalnız Administrator və Baş administrator.',
        steps: [
          '“Oxunan poçt qutuları” blokunda info@ qutusunun sinxronlaşdığını yoxlayın. Yoxsa, onu Poçt bölməsinə əlavə edin.',
          '“SPF, DKIM, DMARC” blokunda xəbərdarlıqları oxuyun və lazım olsa domen provayderində düzəldin.',
          '“Bloklanmış ünvanlar” siyahısında ünvanı əl ilə əlavə edin və ya səhv bloklananı silin.',
        ],
        tips: [
          'Daimi geri qayıdan (5.x.x) və spam şikayəti olan ünvanlara avtomatik müraciət və kampaniya getmir.',
          'Problem payı 5 %-dən çox olsa, gündəlik limit avtomatik yarıya düşür və yavaş-yavaş bərpa olunur.',
        ],
      },
      ru: {
        title: 'Доставка e-mail',
        purpose: 'Результаты отправки писем: ошибки SMTP, возвраты, жалобы на спам, заблокированные адреса, SPF/DKIM/DMARC и состояние лимита автоматических откликов. Только Администратор и Главный администратор.',
        steps: [
          'В блоке «Читаемые ящики» проверьте, что ящик info@ синхронизируется; если нет, добавьте его в Почту.',
          'В блоке «SPF, DKIM, DMARC» прочитайте предупреждения и при необходимости исправьте записи у регистратора домена.',
          'В списке «Заблокированные адреса» добавьте адрес вручную или удалите ошибочно заблокированный.',
        ],
        tips: [
          'На адреса с постоянным возвратом (5.x.x) или жалобой на спам автоматические отклики и кампании не отправляются.',
          'При доле проблем выше 5 % дневной лимит автоматически уменьшается вдвое и медленно восстанавливается.',
        ],
      },
      en: {
        title: 'E-mail delivery',
        purpose: 'How our mail is delivered: SMTP errors, bounces, spam complaints, suppressed addresses, SPF/DKIM/DMARC and the state of the automatic application limit. Administrators and the Super admin only.',
        steps: [
          'Under “Mailboxes read” check that the info@ mailbox is synced; if not, add it in Mail.',
          'Under “SPF, DKIM, DMARC” read the warnings and fix the records at the domain provider if needed.',
          'In “Suppressed addresses” add an address manually or remove one that was blocked by mistake.',
        ],
        tips: [
          'Addresses with a hard bounce (5.x.x) or a spam complaint get no automatic applications or campaigns.',
          'Above 5 % problem rate the daily limit is halved automatically and recovers slowly.',
        ],
      },
      de: {
        title: 'E-Mail-Zustellung',
        purpose: 'Wie unsere Mails ankommen: SMTP-Fehler, Rückläufer, Spam-Beschwerden, gesperrte Adressen, SPF/DKIM/DMARC und der Stand des automatischen Bewerbungslimits. Nur Administratoren und Super-Admin.',
        steps: [
          'Unter „Gelesene Postfächer“ prüfen, ob das Postfach info@ synchronisiert wird; sonst in Mail hinzufügen.',
          'Unter „SPF, DKIM, DMARC“ die Warnungen lesen und die Einträge bei Bedarf beim Domain-Anbieter korrigieren.',
          'In „Gesperrte Adressen“ eine Adresse manuell hinzufügen oder eine irrtümlich gesperrte entfernen.',
        ],
        tips: [
          'Adressen mit dauerhafter Unzustellbarkeit (5.x.x) oder Spam-Beschwerde erhalten keine automatischen Bewerbungen und Kampagnen.',
          'Über 5 % Problemquote wird das Tageslimit automatisch halbiert und erholt sich langsam.',
        ],
      },
    },
  },
  {
    route: 'kpi',
    text: {
      az: {
        title: 'KPI',
        purpose: 'Hər əməkdaş üzrə aylıq göstəricilər: bağlanan müraciətlər, sənədlər, cavab vaxtı, müştəri qiyməti, gəlir, saatlar və tapşırıqlar. Administrator və Baş administrator üçün.',
        steps: [
          '“Aylıq KPI” tabında oxlarla ayı seçin və sütun başlığına basıb cədvəli sıralayın.',
          '“Trend:” yanında göstəricini seçin; adın üzərinə basıb həmin əməkdaşın KPI kartını açın.',
          '“Performans hesabatı” tabında daha uzun dövr üçün tarixləri seçin; “CSV” məlumatı endirir.',
        ],
        tips: [
          'Bağlanan müraciətlər və gəlir müraciətin hazırkı məsuluna yazılır.',
          'Əməkdaşlar öz rəqəmlərini Workspace-də “KPI-m” tabında görür. Modulu Baş administrator söndürə bilər.',
        ],
      },
      ru: {
        title: 'KPI',
        purpose: 'Ежемесячные показатели по сотрудникам: закрытые дела, документы, время ответа, оценка клиентов, выручка, часы и задачи. Для Администратора и Главного администратора.',
        steps: [
          'Во вкладке «KPI за месяц» выберите месяц стрелками и сортируйте таблицу кликом по заголовку столбца.',
          'Выберите показатель рядом с «Тренд:»; клик по имени открывает KPI-карточку сотрудника.',
          'Во вкладке «Отчёт об эффективности» задайте период подлиннее; «CSV» выгружает данные.',
        ],
        tips: [
          'Закрытые дела и выручка засчитываются текущему ответственному по делу.',
          'Сотрудники видят свои цифры в Workspace во вкладке «Мои KPI». Главный администратор может отключить модуль.',
        ],
      },
      en: {
        title: 'KPI',
        purpose: 'Monthly figures per staff member: closed cases, documents, response time, client score, revenue, hours and tasks. For Administrators and the Super admin.',
        steps: [
          'In the “Monthly KPI” tab pick the month with the arrows and sort the table by clicking a column header.',
          'Choose the metric next to “Trend:”; click a name to open that person’s KPI card.',
          'In the “Performance report” tab set a longer date range; “CSV” downloads the data.',
        ],
        tips: [
          'Closed cases and revenue count for the current owner of the case.',
          'Staff see their own figures in Workspace under “My KPI”. The Super admin can switch the module off.',
        ],
      },
      de: {
        title: 'KPI',
        purpose: 'Monatliche Kennzahlen je Mitarbeiter: abgeschlossene Anträge, Dokumente, Antwortzeit, Kundenbewertung, Umsatz, Stunden und Aufgaben. Für Administratoren und Super-Admin.',
        steps: [
          'Im Reiter „Monats-KPI“ den Monat mit den Pfeilen wählen und die Tabelle per Klick auf eine Spaltenüberschrift sortieren.',
          'Neben „Trend:“ die Kennzahl wählen; ein Klick auf den Namen öffnet die KPI-Karte der Person.',
          'Im Reiter „Leistungsbericht“ einen längeren Zeitraum wählen; „CSV“ lädt die Daten herunter.',
        ],
        tips: [
          'Abgeschlossene Anträge und Umsatz zählen für den aktuellen Bearbeiter des Falls.',
          'Mitarbeiter sehen ihre Zahlen im Workspace unter „Meine KPI“. Der Super-Admin kann das Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'team-load',
    text: {
      az: {
        title: 'Komandanın yükü',
        purpose: 'Hər əməkdaşın yükü: limitə qarşı aktiv müraciətlər, gecikmələr, tapşırıqlar, cavabsız mesajlar və bu həftənin görüşləri. Adminlər bütün komandanı, əməkdaşlar yalnız öz kartını görür.',
        steps: [
          'Yuxarıdakı yekunlara baxın: aktiv müraciətlər, təyinatsız, gecikmiş, cavabsız mesajlar və “Limitdən çox”.',
          '“Bütün rollar” ilə rola görə süzün və “Sırala” ilə yük faizi, gecikmələr, cavabsız mesajlar və ya ada görə düzün.',
          'Kartdakı rəqəmə basıb uyğun siyahını açın və işi yenidən bölüşdürün.',
        ],
        tips: [
          'Zolaq “boş / normal / yüklü / həddən çox” göstərir; məzuniyyətdə olanlar “… -dək məzuniyyətdə” kimi görünür.',
          'Yeni müraciət təyin etməzdən əvvəl bu səhifəyə baxın.',
        ],
      },
      ru: {
        title: 'Загрузка команды',
        purpose: 'Загрузка каждого сотрудника: активные заявки относительно лимита, просрочки, задачи, неотвеченные сообщения и встречи этой недели. Админы видят всю команду, сотрудники — только свою карточку.',
        steps: [
          'Посмотрите итоги вверху: активные заявки, без ответственного, просрочено, без ответа и «Сверх лимита».',
          'Фильтруйте по роли через «Все роли» и упорядочьте через «Сортировка»: загрузка, просрочки, без ответа или имя.',
          'Клик по числу на карточке открывает соответствующий список — так удобно перераспределять работу.',
        ],
        tips: [
          'Полоса показывает «свободен / норма / загружен / перегружен»; у отсутствующих — «отсутствует до …».',
          'Смотрите эту страницу перед назначением новых заявок.',
        ],
      },
      en: {
        title: 'Team workload',
        purpose: 'Each staff member’s workload: active cases against their maximum, overdue items, tasks, unanswered messages and this week’s appointments. Admins see the whole team, staff only their own card.',
        steps: [
          'Check the totals at the top: active cases, unassigned, overdue, unanswered and “Over capacity”.',
          'Filter by role with “All roles” and order with “Sort”: capacity, overdue, unanswered or name.',
          'Click a number on a card to open the matching list and redistribute work.',
        ],
        tips: [
          'The bar shows free / normal / busy / overloaded; people on leave show “away until …”.',
          'Check this page before assigning new cases.',
        ],
      },
      de: {
        title: 'Team-Auslastung',
        purpose: 'Auslastung je Mitarbeiter: aktive Anträge im Verhältnis zum Maximum, Überfälliges, Aufgaben, unbeantwortete Nachrichten und Termine dieser Woche. Admins sehen das ganze Team, Mitarbeiter nur ihre eigene Karte.',
        steps: [
          'Oben die Summen prüfen: aktive Anträge, nicht zugewiesen, überfällig, unbeantwortet und „Über Limit“.',
          'Mit „Alle Rollen“ nach Rolle filtern und mit „Sortieren“ nach Auslastung, Überfälligem, Unbeantwortetem oder Name ordnen.',
          'Eine Zahl auf der Karte anklicken, um die passende Liste zu öffnen und Arbeit umzuverteilen.',
        ],
        tips: [
          'Der Balken zeigt frei / normal / ausgelastet / überlastet; Abwesende zeigen „abwesend bis …“.',
          'Vor dem Zuweisen neuer Fälle diese Seite prüfen.',
        ],
      },
    },
  },
  {
    route: 'shifts',
    text: {
      az: {
        title: 'Növbələr',
        purpose: 'Komanda təqvimi: növbələr (ofis, uzaqdan, növbətçi), məzuniyyətlər, işin ötürülməsi və hər gün üçün əhatə yoxlaması. Hamı görür, administratorlar planlaşdırır.',
        steps: [
          '“Həftə” / “Ay” görünüşünü seçin, oxlarla və ya “Bu gün” ilə keçin, “Yalnız mən” və ya “Bütün komanda”nı seçin.',
          'Administrator gün xanasına və ya “Növbə əlavə et”ə basıb növü, başlanğıc və son vaxtı (Bakı vaxtı) yazır.',
          'Qabağa planlamaq üçün “Əvvəlki həftəni köçür” və ya “Həftəni təkrarla”; ofisdə və ya növbətçi kimsə olmayan günlər üçün xəbərdarlıq çıxır.',
        ],
        tips: [
          '“Əhatə qaydası”nı administratorlar təyin edir. Təsdiq gözləyən məzuniyyət ayrıca işarələnir.',
          'Modulu Baş administrator söndürə bilər.',
        ],
      },
      ru: {
        title: 'Смены',
        purpose: 'Календарь команды: смены (офис, удалённо, дежурство), отпуска, передача дел и проверка покрытия на каждый день. Видят все, планируют администраторы.',
        steps: [
          'Выберите «Неделя» / «Месяц», листайте стрелками или «Сегодня», выберите «Только я» или «Вся команда».',
          'Администратор кликает по ячейке дня или «Добавить смену» и задаёт тип, начало и конец (время Баку).',
          'Для планирования вперёд — «Копировать прошлую неделю» или «Повторить неделю»; дни без офиса или дежурного выделяются предупреждением.',
        ],
        tips: [
          '«Правило покрытия» настраивают администраторы. Отпуск, ожидающий одобрения, отмечен отдельно.',
          'Главный администратор может отключить модуль.',
        ],
      },
      en: {
        title: 'Shifts',
        purpose: 'Team calendar: shifts (office, remote, on call), leave, handovers and a coverage check for every day. Everyone can see it; administrators plan it.',
        steps: [
          'Choose “Week” / “Month”, move with the arrows or “Today”, and pick “Only me” or “Whole team”.',
          'Administrators click a day cell or “Add shift” and set the type, start and end (Baku time).',
          'Plan ahead with “Copy previous week” or “Repeat week”; days with nobody in the office or on call get a warning.',
        ],
        tips: [
          'The “Coverage rule” is set by administrators. Leave awaiting approval is marked “pending”.',
          'The Super admin can switch the module off.',
        ],
      },
      de: {
        title: 'Schichten',
        purpose: 'Teamkalender: Schichten (Büro, remote, Bereitschaft), Abwesenheiten, Übergaben und Besetzungsprüfung für jeden Tag. Alle sehen ihn, Administratoren planen.',
        steps: [
          '„Woche“ / „Monat“ wählen, mit den Pfeilen oder „Heute“ blättern und „Nur ich“ oder „Ganzes Team“ wählen.',
          'Administratoren klicken auf eine Tageszelle oder „Schicht hinzufügen“ und legen Art, Beginn und Ende fest (Bakuer Zeit).',
          'Mit „Vorwoche kopieren“ oder „Woche wiederholen“ vorausplanen; Tage ohne Büro- oder Bereitschaftsbesetzung werden gewarnt.',
        ],
        tips: [
          'Die „Besetzungsregel“ legen Administratoren fest. Noch nicht genehmigte Abwesenheit ist markiert.',
          'Der Super-Admin kann das Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'training',
    text: {
      az: {
        title: 'Təlim',
        purpose: 'Komanda üçün daxili kurslar: video və mətnli dərslər, qısa testlər. Hamı öyrənir; administratorlar kurs yaradır və irəliləyişi izləyir.',
        steps: [
          '“Mənim kurslarım” tabında kursu “Başla” ilə açın, dərsləri “Oxudum, tamamla” ilə bitirin və testi “Cavabları göndər” ilə verin.',
          'Administratorlar “Kurslar (redaktə)” tabında “Yeni kurs”, “Dərs əlavə et”, test, “Kimlər üçün” və məcburilik seçib “Dərc et”i basır.',
          '“İrəliləyiş” tabında kimin nəyi tamamladığını, cəhdləri və orta balı görün.',
        ],
        tips: [
          'Məcburi kursu bitirməyənlər xatırlatma görür.',
          '“Başlanğıc kurslarını yarat” iki hazır kurs əlavə edir; təkrar basmaq dublikat yaratmır.',
        ],
      },
      ru: {
        title: 'Обучение',
        purpose: 'Внутренние курсы для команды: уроки с видео и текстом и короткие тесты. Учатся все; администраторы создают курсы и следят за прогрессом.',
        steps: [
          'Во вкладке «Мои курсы» откройте курс кнопкой «Начать», проходите уроки через «Прочитал(а), завершить» и сдайте тест кнопкой «Отправить ответы».',
          'Администраторы во вкладке «Курсы (редактор)» создают «Новый курс», «Добавить урок», тест, «Для кого», обязательность и нажимают «Опубликовать».',
          'Во вкладке «Прогресс» видно, кто что прошёл, попытки и средний балл.',
        ],
        tips: [
          'Кто не прошёл обязательный курс, видит напоминание.',
          '«Создать стартовые курсы» добавляет два готовых курса; повторное нажатие не создаёт дубликатов.',
        ],
      },
      en: {
        title: 'Training',
        purpose: 'Internal courses for the team: lessons with video and text plus short quizzes. Everyone learns; administrators create courses and track progress.',
        steps: [
          'In “My courses” open a course with “Start”, finish lessons with “I have read it, complete” and take the quiz with “Submit answers”.',
          'Administrators use “Courses (edit)”: “New course”, “Add lesson”, quiz, “Who it is for”, required or not, then “Publish”.',
          'In “Progress” see who completed what, the attempts and the average score.',
        ],
        tips: [
          'People who have not finished a required course see a reminder.',
          '“Create starter courses” adds two ready-made courses; pressing it again never creates duplicates.',
        ],
      },
      de: {
        title: 'Schulung',
        purpose: 'Interne Kurse für das Team: Lektionen mit Video und Text sowie kurze Tests. Alle lernen; Administratoren erstellen Kurse und verfolgen den Fortschritt.',
        steps: [
          'Unter „Meine Kurse“ einen Kurs mit „Starten“ öffnen, Lektionen mit „Gelesen, abschließen“ beenden und den Test mit „Antworten senden“ abgeben.',
          'Administratoren nutzen „Kurse (bearbeiten)“: „Neuer Kurs“, „Lektion hinzufügen“, Test, „Für wen“, Pflicht ja/nein, dann „Veröffentlichen“.',
          'Unter „Fortschritt“ sehen Sie, wer was abgeschlossen hat, Versuche und Durchschnittspunktzahl.',
        ],
        tips: [
          'Wer einen Pflichtkurs nicht abgeschlossen hat, sieht eine Erinnerung.',
          '„Startkurse anlegen“ fügt zwei fertige Kurse hinzu; mehrfaches Klicken erzeugt keine Duplikate.',
        ],
      },
    },
  },
  {
    route: 'time',
    text: {
      az: {
        title: 'Vaxt uçotu',
        purpose: 'Müraciətlərə sərf olunan vaxt: taymer və əl ilə qeydlər. Əməkdaş yalnız öz qeydlərini, administrator bütün komandanı görür.',
        steps: [
          '“Qeydlər” tabında tarix və fəaliyyətə görə (admin həm də əməkdaşa görə) süzün; qeydi “Dəyiş” ilə düzəldin, unudulan vaxtı “Əl ilə əlavə et” ilə yazın.',
          '“Hesabatlar” tabında əməkdaşlar üzrə həftəlik, müraciətlər üzrə və fəaliyyət üzrə cəmlərə baxın.',
          'Excel, CSV, PDF və ya planlı e-poçt üçün “Hesabat qurucusunda ixrac et”i basın.',
        ],
        tips: [
          'Taymer müraciət səhifəsindən işə salınır; unudulmuş taymer avtomatik dayandırılır.',
          '“Saatlıq dərəcələr”i yalnız Baş administrator görür; əmək xərci gəlirlilikdə göstərilir.',
        ],
      },
      ru: {
        title: 'Учёт времени',
        purpose: 'Время, затраченное на дела: таймер и записи вручную. Сотрудник видит только свои записи, администратор — всю команду.',
        steps: [
          'Во вкладке «Записи» фильтруйте по датам и деятельности (админ — и по сотруднику); исправляйте запись через «Изменить», забытое время — «Добавить вручную».',
          'Во вкладке «Отчёты» смотрите итоги по сотрудникам по неделям, по делам и по деятельности.',
          'Для Excel, CSV, PDF или рассылки нажмите «Экспорт в конструкторе отчётов».',
        ],
        tips: [
          'Таймер запускается на странице дела; забытый таймер останавливается автоматически.',
          '«Почасовые ставки» видит только Главный администратор; затраты на труд попадают в рентабельность.',
        ],
      },
      en: {
        title: 'Time tracking',
        purpose: 'Time spent on cases: timer and manual entries. Staff see their own entries, administrators the whole team.',
        steps: [
          'In “Entries” filter by dates and activity (admins also by staff member); fix an entry with “Edit” and log forgotten time with “Add manually”.',
          'In “Reports” see totals by staff member per week, by case and by activity.',
          'For Excel, CSV, PDF or scheduled e-mails click “Export in the report builder”.',
        ],
        tips: [
          'The timer is started on the case page; a forgotten timer is stopped automatically.',
          'Only the Super admin sees “Hourly rates”; labour cost then shows on profitability.',
        ],
      },
      de: {
        title: 'Zeiterfassung',
        purpose: 'Aufgewendete Zeit je Fall: Timer und manuelle Einträge. Mitarbeiter sehen ihre eigenen Einträge, Administratoren das ganze Team.',
        steps: [
          'Unter „Einträge“ nach Datum und Tätigkeit filtern (Admins auch nach Mitarbeiter); mit „Bearbeiten“ korrigieren, vergessene Zeit mit „Manuell erfassen“ nachtragen.',
          'Unter „Auswertungen“ Summen nach Mitarbeitenden je Woche, nach Fällen und nach Tätigkeit ansehen.',
          'Für Excel, CSV, PDF oder geplanten E-Mail-Versand „Im Berichtsgenerator exportieren“ klicken.',
        ],
        tips: [
          'Der Timer wird auf der Fallseite gestartet; ein vergessener Timer stoppt automatisch.',
          '„Stundensätze“ sieht nur der Super-Admin; die Personalkosten erscheinen in der Rentabilität.',
        ],
      },
    },
  },
  {
    route: 'oversight',
    text: {
      az: {
        title: 'Nəzarət',
        purpose: 'Bütün sistem bir baxışda: istifadəçilər, müraciətlər, sənədlər, e-poçt, təhlükəsizlik və hər əməkdaşın fəaliyyəti. Yalnız Baş administrator; səhifə yalnız baxış üçündür.',
        steps: [
          '“İstifadəçilər”, “Müraciətlər” və “Sənədlər və sistem” bloklarındakı yekunlara baxın: hazırda onlayn olanlar, təsdiq faizi, uğursuz məktub və girişlər.',
          '7, 14, 30 və ya 90 gün seçin; “Gündəlik fəaliyyət” qrafikində seriyanın adına basıb onu gizlədin və ya göstərin.',
          '“Əməkdaş axtar” ilə adamı tapın, “Əməkdaşlar” cədvəlini sütuna görə sıralayın və sətrə basıb onun səhifəsini açın.',
        ],
        tips: [
          'Hesabı dəyişmək və ya sessiyaları bitirmək “İstifadəçilər” səhifəsində edilir.',
          'Aktiv vaxt sistemdəki fəaliyyətdən hesablanır və təxminidir, dəqiq iş saatı deyil.',
        ],
      },
      ru: {
        title: 'Надзор',
        purpose: 'Вся система на одном экране: пользователи, заявки, документы, почта, безопасность и активность каждого сотрудника. Только Главный администратор; страница только для просмотра.',
        steps: [
          'Посмотрите итоги в блоках «Пользователи», «Заявки» и «Документы и система»: сейчас онлайн, доля одобрений, неудачные письма и входы.',
          'Выберите 7, 14, 30 или 90 дней; на графике «Ежедневная активность» клик по названию серии скрывает или показывает её.',
          'Найдите человека через «Поиск сотрудника», сортируйте таблицу «Сотрудники» по столбцу и кликните строку, чтобы открыть его страницу.',
        ],
        tips: [
          'Изменение аккаунта или завершение сеансов — на странице «Пользователи».',
          'Активное время рассчитывается по действиям в системе и является оценкой, а не точным учётом рабочих часов.',
        ],
      },
      en: {
        title: 'Oversight',
        purpose: 'The whole system at a glance: users, cases, documents, e-mail, security and every staff member’s activity. Super admin only; the page is view-only.',
        steps: [
          'Read the totals in the “Users”, “Cases” and “Documents and system” blocks: online now, approval rate, failed e-mails and logins.',
          'Choose 7, 14, 30 or 90 days; in the “Daily activity” chart click a series name to hide or show it.',
          'Find a person with “Search staff”, sort the “Staff” table by a column and click a row to open their page.',
        ],
        tips: [
          'Changing an account or ending sessions is done on the “Users” page.',
          'Active time is estimated from activity in the system; it is not an exact record of working hours.',
        ],
      },
      de: {
        title: 'Aufsicht',
        purpose: 'Das ganze System auf einen Blick: Benutzer, Anträge, Dokumente, E-Mail, Sicherheit und die Aktivität jedes Mitarbeiters. Nur Super-Admin; die Seite dient nur zur Ansicht.',
        steps: [
          'Summen in den Blöcken „Benutzer“, „Anträge“ und „Dokumente und System“ lesen: jetzt online, Genehmigungsquote, fehlgeschlagene E-Mails und Anmeldungen.',
          '7, 14, 30 oder 90 Tage wählen; im Diagramm „Tägliche Aktivität“ blendet ein Klick auf den Seriennamen sie aus oder ein.',
          'Mit „Mitarbeiter suchen“ eine Person finden, die Tabelle „Mitarbeiter“ nach Spalte sortieren und eine Zeile anklicken, um ihre Seite zu öffnen.',
        ],
        tips: [
          'Konten ändern oder Sitzungen beenden geht auf der Seite „Benutzer“.',
          'Die aktive Zeit wird aus der Systemaktivität geschätzt und ist keine exakte Arbeitszeiterfassung.',
        ],
      },
    },
  },
  {
    route: 'oversight/staff/:id',
    text: {
      az: {
        title: 'Əməkdaş səhifəsi (Nəzarət)',
        purpose: 'Bir əməkdaş haqqında ətraflı: aktiv vaxt, saat üzrə fəaliyyət, sessiyalar, aylıq KPI, təyin olunan müraciətlər, iş qovluğu və audit qeydləri. Yalnız Baş administrator.',
        steps: [
          'Yekunlara, “Aktiv vaxt” və “Saat üzrə fəaliyyət” qrafiklərinə və aylıq KPI kartına baxın.',
          '“Təyin olunan müraciətlər”də “Açıq” / “Bağlı” arasında keçib müraciəti açın; “Sessiyalar” cihazları, IP və vəziyyəti göstərir.',
          'Yuxarıdakı düymələr: “Müraciətlər”, “İş qovluğu”, menyu masası seçimi və “Sil”; geri “Nəzarətə qayıt” ilə.',
        ],
        tips: [
          '“Sil” öz hesabınız və başqa Baş administrator üçün göstərilmir.',
          'Fəaliyyət məlumatı məxfidir — yalnız iş məqsədi ilə istifadə edin.',
        ],
      },
      ru: {
        title: 'Страница сотрудника (Надзор)',
        purpose: 'Один сотрудник подробно: активное время, активность по часам, сеансы, KPI за месяц, назначенные заявки, рабочая папка и записи аудита. Только Главный администратор.',
        steps: [
          'Посмотрите итоги, графики «Активное время» и «Активность по часам» и карточку KPI за месяц.',
          'В «Назначенные заявки» переключайте «Открытые» / «Закрытые» и открывайте заявку; «Сеансы» показывают устройства, IP и статус.',
          'Кнопки вверху: «Заявки», «Рабочая папка», выбор рабочего стола меню и «Удалить»; назад — «К надзору».',
        ],
        tips: [
          '«Удалить» не показывается для своего аккаунта и для другого Главного администратора.',
          'Данные об активности конфиденциальны — используйте их только в рабочих целях.',
        ],
      },
      en: {
        title: 'Staff page (Oversight)',
        purpose: 'One staff member in detail: active time, activity by hour, sessions, monthly KPI, assigned cases, work folder and audit entries. Super admin only.',
        steps: [
          'Look at the totals, the “Active time” and “Activity by hour” charts and the monthly KPI card.',
          'In “Assigned cases” switch “Open” / “Closed” and open a case; “Sessions” lists devices, IP and state.',
          'Buttons at the top: “Cases”, “Workspace” folder, the sidebar desk choice and “Delete”; go back with “Back to oversight”.',
        ],
        tips: [
          '“Delete” is not shown for your own account or another Super admin.',
          'Activity data is confidential — use it for work purposes only.',
        ],
      },
      de: {
        title: 'Mitarbeiterseite (Aufsicht)',
        purpose: 'Ein Mitarbeiter im Detail: aktive Zeit, Aktivität nach Uhrzeit, Sitzungen, Monats-KPI, zugewiesene Anträge, Arbeitsordner und Audit-Einträge. Nur Super-Admin.',
        steps: [
          'Summen, die Diagramme „Aktive Zeit“ und „Aktivität nach Uhrzeit“ sowie die Monats-KPI-Karte ansehen.',
          'Unter „Zugewiesene Anträge“ zwischen „Offen“ / „Geschlossen“ wechseln und einen Antrag öffnen; „Sitzungen“ zeigt Geräte, IP und Status.',
          'Schaltflächen oben: „Anträge“, „Arbeitsordner“, Menü-Arbeitsbereich und „Löschen“; zurück mit „Zurück zur Aufsicht“.',
        ],
        tips: [
          '„Löschen“ erscheint nicht beim eigenen Konto oder bei einem anderen Super-Admin.',
          'Aktivitätsdaten sind vertraulich — nur dienstlich verwenden.',
        ],
      },
    },
  },
  {
    route: 'weekly-reports',
    text: {
      az: {
        title: 'Həftəlik hesabatlar',
        purpose: 'Hər bazar ertəsi saat 08:00-da (Bakı) keçən həftə üzrə hesabat: əsas rəqəmlər, əvvəlki həftə ilə müqayisə, komanda bölməsi və qısa AI xülasəsi — e-poçtla və burada. Yalnız Baş administrator.',
        steps: [
          'Son hesabatı və ya “Arxiv”dən köhnəsini açın; “Əsas rəqəmlər”, ilişib qalan müraciətlər və “Komanda” bölməsini oxuyun.',
          '“İndi yarat” keçən həftənin hesabatını yeniləyir; “Mənə e-poçtla göndər” və “Xülasəni mənim dilimdə yaz” düymələrindən istifadə edin.',
          '“Hesabat parametrləri”nda “Bazar ertəsi e-poçtu”nu açın/bağlayın, “Adminlərə də göndər”i və ilişib qalma həddini (gün) seçin.',
        ],
        tips: [
          'AI xülasəsi yazılmasa da rəqəmlər tamdır.',
          '“Dəstək lazımdır” gecikmiş tapşırıqlar, cavabsız mesajlar, ləng cavab və ya ilişib qalan müraciətlər olanda görünür.',
        ],
      },
      ru: {
        title: 'Еженедельные отчёты',
        purpose: 'Каждый понедельник в 08:00 (Баку) — отчёт за прошлую неделю: ключевые показатели, сравнение с предыдущей неделей, раздел о команде и краткое AI-резюме — по e-mail и здесь. Только Главный администратор.',
        steps: [
          'Откройте последний отчёт или старый из «Архива»; читайте «Ключевые показатели», зависшие заявки и раздел «Команда».',
          '«Создать сейчас» обновляет отчёт за прошлую неделю; есть кнопки «Отправить мне на e-mail» и «Резюме на моём языке».',
          'В «Настройках отчёта» включите или выключите «E-mail по понедельникам», «Отправлять и админам» и порог зависания в днях.',
        ],
        tips: [
          'Если AI-резюме не написано, цифры всё равно полные.',
          '«Нужна поддержка» появляется при просроченных задачах, неотвеченных сообщениях, медленных ответах или зависших заявках.',
        ],
      },
      en: {
        title: 'Weekly reports',
        purpose: 'Every Monday at 08:00 (Baku) a report on last week: key numbers, comparison with the week before, a team section and a short AI summary — by e-mail and here. Super admin only.',
        steps: [
          'Open the latest report or an older one from the “Archive”; read the key numbers, stuck cases and the team section.',
          '“Generate now” rebuilds last week’s report; use “E-mail it to me” and “Summary in my language” as needed.',
          'In “Report settings” turn the “Monday e-mail” on or off, choose “Also send to admins” and the “Stuck” threshold in days.',
        ],
        tips: [
          'If the AI summary could not be written, the numbers are still complete.',
          '“Needs support” appears for overdue tasks, unanswered messages, slow replies or stuck cases.',
        ],
      },
      de: {
        title: 'Wochenberichte',
        purpose: 'Jeden Montag um 08:00 (Baku) ein Bericht über die Vorwoche: Kennzahlen, Vergleich mit der Woche davor, Teamteil und eine kurze KI-Zusammenfassung — per E-Mail und hier. Nur Super-Admin.',
        steps: [
          'Den neuesten Bericht oder einen älteren aus dem „Archiv“ öffnen; Kennzahlen, feststeckende Anträge und den Teamteil lesen.',
          '„Jetzt erstellen“ erzeugt den Bericht der Vorwoche neu; dazu „Mir per E-Mail senden“ und „Zusammenfassung in meiner Sprache“.',
          'In den „Berichtseinstellungen“ die „E-Mail am Montag“ ein- oder ausschalten, „Auch an Admins senden“ und die Grenze für „feststeckend“ (Tage) wählen.',
        ],
        tips: [
          'Fehlt die KI-Zusammenfassung, sind die Zahlen trotzdem vollständig.',
          '„Unterstützung sinnvoll“ erscheint bei überfälligen Aufgaben, unbeantworteten Nachrichten, langsamen Antworten oder feststeckenden Anträgen.',
        ],
      },
    },
  },
];
