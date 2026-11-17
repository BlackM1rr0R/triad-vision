import type { PageHelpEntry } from '../types.js';

/** Admin page help: "Today" hub pages, plus the help centre, announcements and the System pages. */
export const PAGES_TODAY: PageHelpEntry[] = [
  {
    route: '',
    text: {
      az: {
        title: 'Panel',
        purpose: 'Admin panelinin başlanğıc ünvanı (/admin). Sizin seçdiyiniz başlanğıc səhifəni açır; seçim yoxdursa, Əməkdaş «Bu günün işləri» növbəsinə, Admin və Super admin isə Panelə düşür.',
        steps: [
          'Başlanğıc səhifənizi açmaq üçün menyuda «Panel» və ya loqonu basın.',
          'Başlanğıc səhifəni dəyişmək üçün «Bu günüm» səhifəsində «Başlanğıc səhifəm» açarını yandırın.',
          'Əvvəlki davranışa qayıtmaq üçün həmin açarı yenidən söndürün.',
        ],
        tips: ['Seçim hesabınızda saxlanılır və bütün cihazlarda işləyir.', 'Panel həmişə /admin/dashboard ünvanında da açılır.'],
      },
      ru: {
        title: 'Панель',
        purpose: 'Стартовый адрес админ-панели (/admin). Открывает выбранную вами стартовую страницу; если выбора нет, Сотрудник попадает в «Мои дела на сегодня», а Администратор и Суперадмин — на Панель.',
        steps: [
          'Нажмите «Панель» в меню или на логотип, чтобы открыть стартовую страницу.',
          'Чтобы сменить стартовую страницу, на странице «Мой день» включите переключатель «Моя стартовая страница».',
          'Чтобы вернуть поведение по умолчанию, выключите этот переключатель снова.',
        ],
        tips: ['Выбор хранится в вашей учётной записи и действует на всех устройствах.', 'Панель всегда доступна и по адресу /admin/dashboard.'],
      },
      en: {
        title: 'Dashboard',
        purpose: 'The start address of the admin panel (/admin). It opens the start page you chose; without a choice, Staff land on “My work today” and Admins and Super admins on the Dashboard.',
        steps: [
          'Click “Dashboard” in the menu or the logo to open your start page.',
          'To change the start page, switch on “My start page” on the “My day” page.',
          'To return to the default behaviour, switch that toggle off again.',
        ],
        tips: ['The choice is saved in your account and works on every device.', 'The Dashboard itself is always available at /admin/dashboard.'],
      },
      de: {
        title: 'Übersicht',
        purpose: 'Die Startadresse des Admin-Bereichs (/admin). Sie öffnet die von Ihnen gewählte Startseite; ohne Auswahl landen Mitarbeitende bei „Meine Arbeit heute“, Admins und Super-Admins auf der Übersicht.',
        steps: [
          'Klicken Sie im Menü auf „Übersicht“ oder auf das Logo, um Ihre Startseite zu öffnen.',
          'Um die Startseite zu ändern, schalten Sie auf der Seite „Mein Tag“ den Schalter „Meine Startseite“ ein.',
          'Um zum Standard zurückzukehren, schalten Sie den Schalter wieder aus.',
        ],
        tips: ['Die Auswahl wird in Ihrem Konto gespeichert und gilt auf allen Geräten.', 'Die Übersicht selbst ist immer unter /admin/dashboard erreichbar.'],
      },
    },
  },
  {
    route: 'today',
    text: {
      az: {
        title: 'Bu günün işləri',
        purpose: 'Sizdən hərəkət gözləyən hər şey bir növbədə: sənəd yoxlamaları, imzalar, tapşırıqlar, cavabsız məktublar, görüşlər və yeni müraciətlər. Gecikmiş, Bu gün, Bu həftə və Sonra qruplarına bölünür.',
        steps: [
          'Yuxarıdakı filtrlərlə (Hamısı, Təcili, Sənədlər, Tapşırıqlar, Poçt, İmzalar, Görüşlər, Müraciətlər) növbəni daraldın.',
          'Sətirdəki düymə ilə işi elə burada bitirin: «Qəbul et», «Rədd et» (səbəb seçin), «Hazırdır», «+1 gün» və ya «Aç».',
          'Səhv basdınızsa, 5 saniyə ərzində bildirişdə «Geri al» düyməsini basın.',
        ],
        tips: [
          'Klaviatura: J / K — aşağı / yuxarı, Enter — aç, A — qəbul et / hazırdır.',
          'Rədd etmə səbəbi müştəriyə öz dilində göndərilir.',
          'Admin «Görünüş: Komanda» seçib işləri «Əməkdaşa görə qrupla» edə bilər.',
        ],
      },
      ru: {
        title: 'Мои дела на сегодня',
        purpose: 'Всё, что ждёт вашего действия, в одной очереди: проверка документов, подписи, задачи, письма без ответа, встречи и новые обращения. Разбито на группы «Просрочено», «Сегодня», «На этой неделе» и «Позже».',
        steps: [
          'Сузьте очередь фильтрами вверху: Все, Срочные, Документы, Задачи, Почта, Подписи, Встречи, Обращения.',
          'Завершите дело прямо в строке: «Принять», «Отклонить» (с выбором причины), «Готово», «+1 день» или «Открыть».',
          'Если нажали по ошибке, в течение 5 секунд нажмите «Отменить» в уведомлении.',
        ],
        tips: [
          'Клавиши: J / K — вниз / вверх, Enter — открыть, A — принять / готово.',
          'Причина отклонения отправляется клиенту на его языке.',
          'Администратор может выбрать вид «Команда» и «Группировать по сотрудникам».',
        ],
      },
      en: {
        title: 'My work today',
        purpose: 'Everything waiting for your action in one queue: document reviews, signatures, tasks, unanswered e-mails, appointments and new leads, grouped into Overdue, Today, This week and Later.',
        steps: [
          'Narrow the queue with the filters at the top: All, Urgent, Documents, Tasks, Mail, Signatures, Bookings, Leads.',
          'Finish the item right in its row: “Accept”, “Reject” (pick a reason), “Done”, “+1 day” or “Open”.',
          'Clicked by mistake? Press “Undo” in the toast within 5 seconds.',
        ],
        tips: [
          'Keys: J / K move down / up, Enter opens, A accepts / marks done.',
          'The rejection reason is sent to the client in their own language.',
          'Admins can switch the view to “Team” and “Group by assignee”.',
        ],
      },
      de: {
        title: 'Meine Arbeit heute',
        purpose: 'Alles, was auf Ihre Aktion wartet, in einer Liste: Dokumentprüfungen, Unterschriften, Aufgaben, unbeantwortete E-Mails, Termine und neue Anfragen, gruppiert nach Überfällig, Heute, Diese Woche und Später.',
        steps: [
          'Grenzen Sie die Liste mit den Filtern oben ein: Alle, Dringend, Dokumente, Aufgaben, Mail, Unterschriften, Termine, Anfragen.',
          'Erledigen Sie den Eintrag direkt in der Zeile: „Annehmen“, „Ablehnen“ (Grund wählen), „Erledigt“, „+1 Tag“ oder „Öffnen“.',
          'Versehentlich geklickt? Innerhalb von 5 Sekunden in der Meldung „Rückgängig“ drücken.',
        ],
        tips: [
          'Tasten: J / K nach unten / oben, Enter öffnet, A nimmt an / erledigt.',
          'Der Ablehnungsgrund geht in der Sprache des Kunden an den Kunden.',
          'Admins können die Ansicht „Team“ und „Nach Mitarbeitenden gruppieren“ wählen.',
        ],
      },
    },
  },
  {
    route: 'my-day',
    text: {
      az: {
        title: 'Bu günüm',
        purpose: 'Günün planı bir baxışda: bu günün tapşırıqları, gecikən müraciətlər, cavabsız müştəri mesajları, 7 günlük görüş və müsahibələr, yeni müraciətlər (lead). Yalnız sizə aid işlər göstərilir.',
        steps: [
          'Yuxarıdakı göstəricilərə (Gecikmiş, Bu günün tapşırıqları, Cavabsız mesajlar, Bu gün görüşlər, Yeni müraciətlər) baxın.',
          'Bölmədəki sətrin düyməsi ilə işi bitirin və ya açın; çox sətir varsa «Hamısı» ilə siyahını genişləndirin.',
          'Tam siyahı üçün «Bütün iş növbəsi» düyməsini basın.',
        ],
        tips: ['«Başlanğıc səhifəm» açarı bu səhifəni /admin açılanda göstərir.', 'Səhifə yeni hadisələrdə özü yenilənir; «Yenilə» ilə dərhal yeniləyin.'],
      },
      ru: {
        title: 'Мой день',
        purpose: 'План дня на одном экране: задачи на сегодня, просроченные заявки, сообщения клиентов без ответа, встречи и собеседования на 7 дней и новые обращения (лиды). Показываются только ваши дела.',
        steps: [
          'Посмотрите на показатели вверху: Просрочено, Задачи сегодня, Без ответа, Встречи сегодня, Новые обращения.',
          'Кнопкой в строке раздела выполните или откройте дело; если строк много, раскройте список кнопкой «Все».',
          'Для полного списка нажмите «Вся очередь работы».',
        ],
        tips: ['Переключатель «Моя стартовая страница» показывает эту страницу при открытии /admin.', 'Страница обновляется сама при новых событиях; «Обновить» — сразу.'],
      },
      en: {
        title: 'My day',
        purpose: 'Your day plan at a glance: today’s tasks, overdue cases, unanswered client messages, appointments and interviews for 7 days, and new leads. Only your own work is shown.',
        steps: [
          'Check the figures at the top: Overdue, Tasks today, Unanswered, Appointments today, New leads.',
          'Use a row’s button to finish or open the item; if a section is long, expand it with “All”.',
          'For the complete list, click “Full work queue”.',
        ],
        tips: ['The “My start page” toggle shows this page whenever /admin opens.', 'The page refreshes itself on new events; “Refresh” updates it at once.'],
      },
      de: {
        title: 'Mein Tag',
        purpose: 'Ihr Tagesplan auf einen Blick: heutige Aufgaben, überfällige Anträge, unbeantwortete Kundennachrichten, Termine und Gespräche der nächsten 7 Tage sowie neue Anfragen. Es wird nur Ihre eigene Arbeit gezeigt.',
        steps: [
          'Prüfen Sie die Kennzahlen oben: Überfällig, Aufgaben heute, Unbeantwortet, Termine heute, Neue Anfragen.',
          'Mit der Schaltfläche einer Zeile erledigen oder öffnen Sie den Eintrag; lange Abschnitte klappen Sie mit „Alle“ auf.',
          'Für die vollständige Liste klicken Sie auf „Gesamte Arbeitsliste“.',
        ],
        tips: ['Der Schalter „Meine Startseite“ zeigt diese Seite beim Öffnen von /admin.', 'Die Seite aktualisiert sich bei neuen Ereignissen selbst; „Aktualisieren“ sofort.'],
      },
    },
  },
  {
    route: 'dashboard',
    text: {
      az: {
        title: 'Panel',
        purpose: 'Agentliyin ümumi vəziyyəti vidcetlərlə: bu günün işləri, müraciət göstəriciləri, statuslar, görüşlər və son fəaliyyət. Hər əməkdaş paneli öz zövqünə görə düzə bilər.',
        steps: [
          'Səhər paneli açın və vidcetlərdəki rəqəmlərə baxın; vidcetə basmaq uyğun siyahını açır.',
          '«Düzəni dəyiş» ilə vidcetləri sürüşdürüb sıralayın, ölçüsünü (Kiçik, Orta, Geniş) seçin və lazımsızları gizlədin; sonda «Hazırdır» basın.',
          'Tam siyahılar üçün «Bu günün işləri» və ya «Bütün müraciətlər» düyməsini basın.',
        ],
        tips: ['«Standarta qaytar» ilkin düzəni bərpa edir.', 'Söndürülmüş modulların vidcetləri avtomatik gizlənir.', 'Rəqəmlər hər 2 dəqiqədən bir yenilənir.'],
      },
      ru: {
        title: 'Панель',
        purpose: 'Общее состояние агентства в виджетах: дела на сегодня, показатели заявок, статусы, встречи и последняя активность. Каждый сотрудник может настроить панель под себя.',
        steps: [
          'Утром откройте панель и посмотрите на цифры в виджетах; клик по виджету открывает соответствующий список.',
          '«Настроить панель»: перетаскивайте виджеты, выбирайте размер (Малый, Средний, Широкий) и скрывайте лишние; затем нажмите «Готово».',
          'Для полных списков нажмите «Мои дела на сегодня» или «Все заявки».',
        ],
        tips: ['«Вернуть по умолчанию» восстанавливает исходную раскладку.', 'Виджеты отключённых модулей скрываются автоматически.', 'Цифры обновляются каждые 2 минуты.'],
      },
      en: {
        title: 'Dashboard',
        purpose: 'The agency at a glance in widgets: today’s work, case figures, statuses, appointments and recent activity. Every staff member can arrange the dashboard their own way.',
        steps: [
          'Open the dashboard in the morning and read the widget figures; clicking a widget opens the matching list.',
          'Click “Customise layout” to drag widgets, pick a size (Small, Medium, Wide) and hide what you do not need, then click “Done”.',
          'For full lists, use “My work today” or “All cases”.',
        ],
        tips: ['“Reset to default” restores the original layout.', 'Widgets of switched-off modules are hidden automatically.', 'Figures refresh every 2 minutes.'],
      },
      de: {
        title: 'Übersicht',
        purpose: 'Die Agentur auf einen Blick in Widgets: heutige Arbeit, Antragszahlen, Status, Termine und letzte Aktivitäten. Jede Mitarbeiterin und jeder Mitarbeiter kann die Übersicht selbst anordnen.',
        steps: [
          'Öffnen Sie morgens die Übersicht und lesen Sie die Zahlen; ein Klick auf ein Widget öffnet die passende Liste.',
          'Mit „Layout anpassen“ Widgets verschieben, Größe wählen (Klein, Mittel, Breit) und Unnötiges ausblenden, dann „Fertig“ klicken.',
          'Für vollständige Listen „Meine Arbeit heute“ oder „Alle Anträge“ nutzen.',
        ],
        tips: ['„Standard wiederherstellen“ stellt das ursprüngliche Layout her.', 'Widgets abgeschalteter Module werden automatisch ausgeblendet.', 'Die Zahlen werden alle 2 Minuten aktualisiert.'],
      },
    },
  },
  {
    route: 'kanban',
    text: {
      az: {
        title: 'Kanban',
        purpose: 'Bütün açıq müraciətlər status üzrə sütunlarda. Müraciətləri əməkdaşlar arasında bölmək və gecikmələri görmək üçündür.',
        steps: [
          'Filtrlərlə «Mənim», «Bütün əməkdaşlar» və ya bir əməkdaşı, viza növünü seçin; lazım olsa «Bağlananları göstər» işarələyin.',
          'Təyin etmək üçün kartı yuxarıdakı əməkdaş sətrinə sürüşdürün; təyinatı silmək üçün «Təyinatı sil» sahəsinə atın.',
          'Kartdakı ada basaraq müraciəti açın və işi orada davam etdirin.',
        ],
        tips: [
          'Sürüşdürmə yalnız məsul əməkdaşı dəyişir, statusu yox.',
          '«Gecikir» və «Kritik» nişanları müraciətin eyni statusda çox qaldığını göstərir — onlardan başlayın.',
        ],
      },
      ru: {
        title: 'Канбан',
        purpose: 'Все открытые заявки в колонках по статусам. Нужна, чтобы распределять заявки между сотрудниками и видеть задержки.',
        steps: [
          'Фильтрами выберите «Мои», «Все сотрудники» или сотрудника и тип визы; при необходимости отметьте «Показать закрытые».',
          'Чтобы назначить, перетащите карточку на сотрудника в строке вверху; чтобы снять назначение — в область «Снять назначение».',
          'Нажмите на имя на карточке, чтобы открыть заявку и продолжить работу там.',
        ],
        tips: [
          'Перетаскивание меняет только ответственного, а не статус.',
          'Значки «Просрочено» и «Критично» показывают, что заявка долго стоит в одном статусе, — начинайте с них.',
        ],
      },
      en: {
        title: 'Kanban',
        purpose: 'Every open case in a column per status. Use it to share cases between staff and to spot delays.',
        steps: [
          'Use the filters to pick “Mine”, “All staff” or one person and a visa type; tick “Show closed” if needed.',
          'To assign, drag a card onto a staff member in the row at the top; to remove the assignment, drop it on “Unassign”.',
          'Click the name on a card to open the case and carry on there.',
        ],
        tips: [
          'Dragging changes only the assigned staff member, never the status.',
          'The “Overdue” and “Critical” badges mean a case has sat in one status too long — start with those.',
        ],
      },
      de: {
        title: 'Kanban',
        purpose: 'Alle offenen Anträge in Spalten nach Status. Damit verteilen Sie Anträge im Team und erkennen Verzögerungen.',
        steps: [
          'Wählen Sie mit den Filtern „Meine“, „Alle Mitarbeiter“ oder eine Person und die Visumart; bei Bedarf „Abgeschlossene anzeigen“ anhaken.',
          'Zum Zuweisen die Karte auf eine Person in der Zeile oben ziehen; zum Entfernen auf „Zuweisung entfernen“ ziehen.',
          'Klicken Sie auf den Namen der Karte, um den Antrag zu öffnen und dort weiterzuarbeiten.',
        ],
        tips: [
          'Ziehen ändert nur die zuständige Person, nie den Status.',
          'Die Abzeichen „Überfällig“ und „Kritisch“ zeigen Anträge, die zu lange im selben Status stehen — beginnen Sie mit diesen.',
        ],
      },
    },
  },
  {
    route: 'tasks/*',
    text: {
      az: {
        title: 'Tapşırıqlar',
        purpose: 'Komandanın daxili tapşırıqları: məsul şəxslər, prioritet, son tarix və müraciətə bağlılıq. Lövhə, Siyahı və Təqvim görünüşləri eyni filtrlərlə işləyir.',
        steps: [
          '«Mənim» və ya «Hamısı» seçin, sonra görünüşü dəyişin: Lövhə, Siyahı, Təqvim.',
          'İcraçı, Prioritet, Status, Son tarix və Müraciət filtrləri ilə siyahını daraldın.',
          '«Yeni tapşırıq» ilə tapşırıq yaradın; tapşırığa basanda sağda paneli açılır, lövhədə isə kartı başqa sütuna sürüşdürüb statusu dəyişin.',
        ],
        tips: ['Qısayol: N — yeni tapşırıq, / — axtarış, Esc — paneli bağla.', 'Tapşırığı yalnız onun yaradıcısı, icraçısı və ya Admin dəyişə bilər.'],
      },
      ru: {
        title: 'Задачи',
        purpose: 'Внутренние задачи команды: исполнители, приоритет, срок и привязка к заявке. Виды «Доска», «Список» и «Календарь» работают с одними и теми же фильтрами.',
        steps: [
          'Выберите «Мои» или «Все», затем вид: Доска, Список, Календарь.',
          'Сузьте список фильтрами Исполнитель, Приоритет, Статус, Срок и Заявка.',
          'Создайте задачу кнопкой «Новая задача»; клик по задаче открывает панель справа, а на доске статус меняется перетаскиванием карточки в другую колонку.',
        ],
        tips: ['Горячие клавиши: N — новая задача, / — поиск, Esc — закрыть панель.', 'Изменять задачу могут только её автор, исполнители или Администратор.'],
      },
      en: {
        title: 'Tasks',
        purpose: 'The team’s internal tasks: assignees, priority, due date and link to a case. The Board, List and Calendar views share the same filters.',
        steps: [
          'Choose “Mine” or “All”, then a view: Board, List, Calendar.',
          'Narrow the list with the Assignee, Priority, Status, Due date and Case filters.',
          'Create a task with “New task”; clicking a task opens its panel on the right, and on the board you change the status by dragging the card to another column.',
        ],
        tips: ['Shortcuts: N new task, / search, Esc closes the panel.', 'Only the creator, the assignees or an Admin can change a task.'],
      },
      de: {
        title: 'Aufgaben',
        purpose: 'Die internen Aufgaben des Teams: Zuständige, Priorität, Frist und Bezug zu einem Antrag. Die Ansichten Board, Liste und Kalender nutzen dieselben Filter.',
        steps: [
          'Wählen Sie „Meine“ oder „Alle“, dann eine Ansicht: Board, Liste, Kalender.',
          'Grenzen Sie die Liste mit den Filtern Zuständig, Priorität, Status, Frist und Antrag ein.',
          'Mit „Neue Aufgabe“ anlegen; ein Klick öffnet das Aufgabenpanel rechts, auf dem Board ändern Sie den Status durch Ziehen in eine andere Spalte.',
        ],
        tips: ['Tastenkürzel: N neue Aufgabe, / Suche, Esc schließt das Panel.', 'Nur Ersteller, Zuständige oder ein Admin können eine Aufgabe ändern.'],
      },
    },
  },
  {
    route: 'client-tasks',
    text: {
      az: {
        title: 'Müştəri tapşırıqları',
        purpose: 'Bütün müraciətlər üzrə müştərilərə verilmiş tapşırıqlar (məsələn, sənəd yükləmək) bir siyahıda — gecikən və yaxınlaşan son tarixlər əvvəldə.',
        steps: [
          'Filtr seçin: Gecikmiş, Tezliklə (2 gün), Açıq, Tamamlanmış və ya Hamısı; lazım olsa «Yalnız mənim müraciətlərim» işarələyin.',
          'Axtarış sahəsində tapşırığı, müştərini və ya müraciət nömrəsini tapın.',
          'Açıq tapşırıqda «Xatırlat» ilə müştəriyə xatırlatma göndərin və ya «Hazırdır» ilə bağlayın; başlığa basmaq müraciəti açır.',
        ],
        tips: ['Tapşırıqlar müraciət səhifəsində verilir.', 'Admin aşağıdakı «Tipik müddətlər (ETA)» blokunda müştəriyə göstərilən müddətləri təyin edir.'],
      },
      ru: {
        title: 'Задачи клиентов',
        purpose: 'Задачи, выданные клиентам по всем заявкам (например, загрузить документ), в одном списке — просроченные и ближайшие сроки первыми.',
        steps: [
          'Выберите фильтр: Просроченные, Скоро срок (2 дня), Открытые, Выполненные или Все; при необходимости отметьте «Только мои заявки».',
          'Найдите задачу, клиента или номер заявки через поле поиска.',
          'У открытой задачи нажмите «Напомнить», чтобы отправить клиенту напоминание, или «Готово», чтобы закрыть её; клик по названию открывает заявку.',
        ],
        tips: ['Задачи выдаются на странице заявки.', 'Администратор задаёт сроки, которые видит клиент, в блоке «Типичные сроки (ETA)» внизу.'],
      },
      en: {
        title: 'Client tasks',
        purpose: 'Tasks given to clients across all cases (for example, uploading a document) in one list — overdue and upcoming deadlines first.',
        steps: [
          'Pick a filter: Overdue, Due soon (2 days), Open, Done or All; tick “Only my cases” if needed.',
          'Find a task, client or case number with the search box.',
          'On an open task, click “Remind” to send the client a reminder or “Done” to close it; clicking the title opens the case.',
        ],
        tips: ['Tasks are given on the case page.', 'Admins set the durations shown to clients in the “Typical durations (ETA)” block below.'],
      },
      de: {
        title: 'Kundenaufgaben',
        purpose: 'Aufgaben für Kunden über alle Anträge (zum Beispiel ein Dokument hochladen) in einer Liste — überfällige und bald fällige Fristen zuerst.',
        steps: [
          'Filter wählen: Überfällig, Bald fällig (2 Tage), Offen, Erledigt oder Alle; bei Bedarf „Nur meine Anträge“ anhaken.',
          'Aufgabe, Kunde oder Antrags-Nr. über das Suchfeld finden.',
          'Bei einer offenen Aufgabe „Erinnern“ sendet dem Kunden eine Erinnerung, „Erledigt“ schließt sie; ein Klick auf den Titel öffnet den Antrag.',
        ],
        tips: ['Aufgaben werden auf der Antragsseite vergeben.', 'Admins legen im Block „Typische Dauer (ETA)“ unten fest, welche Dauer Kunden sehen.'],
      },
    },
  },
  {
    route: 'notifications',
    text: {
      az: {
        title: 'Bildirişlər',
        purpose: 'Bütün bildirişlərinizin tarixçəsi və bildiriş parametrləri. Başlıqdakı zəngdə «Bütün bildirişlər» bu səhifəni açır.',
        steps: [
          'Hamısı / Oxunmamış və növ filtri (Müraciətlər, Sənədlər, Mesajlar, Tapşırıqlar, Ödənişlər, Sistem) ilə siyahını süzün.',
          'Bildirişə basıb əlaqəli səhifəni açın; «Hamısını oxunmuş et» ilə siyahını təmizləyin.',
          'Aşağıdakı «Bildiriş parametrləri» blokunda e-poçt və push bildirişlərini yandırın və ya söndürün.',
        ],
        tips: ['Paneldəki bildirişlər həmişə saxlanılır; parametrlər yalnız e-poçt və push-a aiddir.', 'Yeni bildirişlər səhifəni yeniləmədən görünür.'],
      },
      ru: {
        title: 'Уведомления',
        purpose: 'История всех ваших уведомлений и их настройки. Ссылка «Все уведомления» в колокольчике в шапке открывает эту страницу.',
        steps: [
          'Отфильтруйте список: Все / Непрочитанные и тип (Заявки, Документы, Сообщения, Задачи, Платежи, Система).',
          'Нажмите на уведомление, чтобы открыть связанную страницу; кнопка «Отметить все как прочитанные» очищает список.',
          'В блоке «Настройки уведомлений» внизу включите или выключите уведомления по e-mail и push.',
        ],
        tips: ['Уведомления в панели сохраняются всегда; настройки касаются только e-mail и push.', 'Новые уведомления появляются без перезагрузки страницы.'],
      },
      en: {
        title: 'Notifications',
        purpose: 'The history of all your notifications and their settings. “All notifications” in the header bell opens this page.',
        steps: [
          'Filter the list: All / Unread and a type (Applications, Documents, Messages, Tasks, Payments, System).',
          'Click a notification to open the related page; “Mark all as read” clears the list.',
          'In the “Notification settings” block below, switch e-mail and push notifications on or off.',
        ],
        tips: ['In-panel notifications are always kept; the settings only cover e-mail and push.', 'New notifications appear without reloading the page.'],
      },
      de: {
        title: 'Benachrichtigungen',
        purpose: 'Der Verlauf all Ihrer Benachrichtigungen und deren Einstellungen. „Alle Benachrichtigungen“ in der Glocke oben öffnet diese Seite.',
        steps: [
          'Filtern Sie die Liste: Alle / Ungelesen und eine Art (Anträge, Dokumente, Nachrichten, Aufgaben, Zahlungen, System).',
          'Klicken Sie auf eine Benachrichtigung, um die zugehörige Seite zu öffnen; „Alle als gelesen markieren“ leert die Liste.',
          'Im Block „Benachrichtigungseinstellungen“ unten schalten Sie E-Mail- und Push-Benachrichtigungen ein oder aus.',
        ],
        tips: ['Benachrichtigungen im Panel bleiben immer erhalten; die Einstellungen betreffen nur E-Mail und Push.', 'Neue Benachrichtigungen erscheinen ohne Neuladen.'],
      },
    },
  },
  {
    route: 'inbox',
    text: {
      az: {
        title: 'Mesajlar',
        purpose: 'Açıq müraciətlərinizdəki müştəri yazışmaları: cavab gözləyənlər əvvəldə (ən uzun gözləyən yuxarıda), sonra son yazışmalar. Telefonda işləmək üçün də rahatdır.',
        steps: [
          '«Hamısı» və ya «Cavab gözləyənlər» filtrini seçin.',
          'Sətirdə «Cavab yaz» ilə müştəriyə dərhal cavab verin və ya «Oxundu» ilə işarələyin.',
          'Sətrə basaraq müraciətin yazışma bölməsini açın.',
        ],
        tips: ['Telefonda sətri sağa sürüşdürmək — cavab, sola — oxundu.', 'Admin «Komanda» seçərək bütün komandanın yazışmalarını görür.'],
      },
      ru: {
        title: 'Сообщения',
        purpose: 'Переписка с клиентами по вашим открытым заявкам: сначала ожидающие ответа (дольше всех ждущие — сверху), затем недавние. Удобно и на телефоне.',
        steps: [
          'Выберите фильтр «Все» или «Ждут ответа».',
          'В строке нажмите «Ответить», чтобы сразу ответить клиенту, или «Прочитано», чтобы отметить сообщение.',
          'Нажмите на строку, чтобы открыть переписку в заявке.',
        ],
        tips: ['На телефоне смахните строку вправо — ответ, влево — прочитано.', 'Администратор, выбрав «Команда», видит переписку всей команды.'],
      },
      en: {
        title: 'Messages',
        purpose: 'Client conversations of your open cases: those waiting for an answer first (longest wait on top), then recent threads. Works well on a phone too.',
        steps: [
          'Pick the “All” or “Waiting” filter.',
          'In a row, click “Reply” to answer the client straight away or “Read” to mark it read.',
          'Click the row to open the conversation in the case.',
        ],
        tips: ['On a phone, swipe a row right to reply and left to mark it read.', 'Admins can choose “Team” to see the whole team’s conversations.'],
      },
      de: {
        title: 'Nachrichten',
        purpose: 'Kundengespräche Ihrer offenen Anträge: wartende Antworten zuerst (längste Wartezeit oben), danach die letzten Gespräche. Funktioniert auch gut auf dem Handy.',
        steps: [
          'Wählen Sie den Filter „Alle“ oder „Wartende“.',
          'Klicken Sie in einer Zeile auf „Antworten“, um dem Kunden sofort zu antworten, oder auf „Gelesen“.',
          'Klicken Sie auf die Zeile, um das Gespräch im Antrag zu öffnen.',
        ],
        tips: ['Auf dem Handy: Zeile nach rechts wischen = antworten, nach links = gelesen.', 'Admins sehen mit „Team“ die Gespräche des ganzen Teams.'],
      },
    },
  },
  {
    route: 'help',
    text: {
      az: {
        title: 'Kömək mərkəzi',
        purpose: 'Admin panelinin ətraflı bələdçiləri bir yerdə, menyu kimi qruplaşdırılıb. Yeni əməkdaşlar və hər hansı səhifənin necə işlədiyini unudanlar üçündür.',
        steps: [
          'Soldakı siyahıdan qrup və bələdçi seçin.',
          'Axtarış sahəsinə söz yazın — başlıq, xülasə, addımlar və məsləhətlər üzrə axtarılır.',
          'Bələdçinin addımlarını oxuyun və uyğun səhifəyə keçin.',
        ],
        tips: ['Hər səhifədə başlıqdakı «?» düyməsi həmin səhifənin qısa izahını açır.', 'Bələdçi linkini (?g=…) həmkarınıza göndərə bilərsiniz.'],
      },
      ru: {
        title: 'Центр помощи',
        purpose: 'Подробные руководства по админ-панели в одном месте, сгруппированные как меню. Для новых сотрудников и тех, кто забыл, как работает страница.',
        steps: [
          'Выберите группу и руководство в списке слева.',
          'Введите слово в поле поиска — поиск идёт по заголовку, описанию, шагам и советам.',
          'Прочитайте шаги руководства и перейдите на нужную страницу.',
        ],
        tips: ['На каждой странице кнопка «?» в шапке открывает краткое описание этой страницы.', 'Ссылку на руководство (?g=…) можно отправить коллеге.'],
      },
      en: {
        title: 'Help centre',
        purpose: 'The detailed admin guides in one place, grouped like the menu. For new staff and anyone who forgot how a page works.',
        steps: [
          'Pick a group and a guide in the list on the left.',
          'Type a word in the search box — it searches titles, summaries, steps and tips.',
          'Read the guide’s steps and go to the page it describes.',
        ],
        tips: ['On every page, the “?” button in the header opens a short explanation of that page.', 'You can send a colleague the link to a guide (?g=…).'],
      },
      de: {
        title: 'Hilfe-Center',
        purpose: 'Die ausführlichen Anleitungen zum Admin-Bereich an einem Ort, gruppiert wie das Menü. Für neue Mitarbeitende und alle, die vergessen haben, wie eine Seite funktioniert.',
        steps: [
          'Wählen Sie links eine Gruppe und eine Anleitung.',
          'Geben Sie ein Wort ins Suchfeld ein — gesucht wird in Titeln, Zusammenfassungen, Schritten und Tipps.',
          'Lesen Sie die Schritte und wechseln Sie zur beschriebenen Seite.',
        ],
        tips: ['Auf jeder Seite öffnet die Schaltfläche „?“ oben eine kurze Erklärung dieser Seite.', 'Den Link zu einer Anleitung (?g=…) können Sie Kollegen schicken.'],
      },
    },
  },
  {
    route: 'announcements',
    text: {
      az: {
        title: 'Elanlar',
        purpose: 'Komanda üçün elanlar — iş sahəsinin ana səhifəsindəki elanların eynisi. Hamı oxuyur; Admin yaradır, redaktə edir, sancır və silir.',
        steps: [
          'Elanı oxuyun və «Oxundu kimi işarələ» basın.',
          'Admin: «Yeni elan» ilə başlıq və mətn (Markdown) yazın, «Önizləmə» ilə yoxlayın.',
          'Lazım olsa «Yuxarıda sancılsın» işarələyin, «Bitmə tarixi» seçin və «Dərc et» basın.',
        ],
        tips: ['Admin vaxtı bitmiş elanları da görür.', 'Bu səhifə «Elanlar» modulu söndürüləndə menyudan gizlənir.'],
      },
      ru: {
        title: 'Объявления',
        purpose: 'Объявления для команды — те же, что на главной рабочего пространства. Читают все; Администратор создаёт, редактирует, закрепляет и удаляет.',
        steps: [
          'Прочитайте объявление и нажмите «Отметить прочитанным».',
          'Администратор: «Новое объявление» — введите заголовок и текст (Markdown), проверьте через «Предпросмотр».',
          'При необходимости отметьте «Закрепить сверху», выберите «Дата истечения» и нажмите «Опубликовать».',
        ],
        tips: ['Администратор видит и истёкшие объявления.', 'Страница скрывается из меню, если модуль «Объявления» выключен.'],
      },
      en: {
        title: 'Announcements',
        purpose: 'Announcements for the team — the same ones as on the workspace home. Everyone reads them; Admins create, edit, pin and delete them.',
        steps: [
          'Read an announcement and click “Mark as read”.',
          'Admins: click “New announcement”, write a title and text (Markdown) and check it with “Preview”.',
          'Tick “Pin to the top” and choose an “Expiry date” if needed, then click “Publish”.',
        ],
        tips: ['Admins also see expired announcements.', 'The page disappears from the menu when the “Announcements” module is switched off.'],
      },
      de: {
        title: 'Ankündigungen',
        purpose: 'Ankündigungen für das Team — dieselben wie auf der Startseite des Arbeitsbereichs. Alle lesen sie; Admins erstellen, bearbeiten, heften an und löschen.',
        steps: [
          'Ankündigung lesen und „Als gelesen markieren“ klicken.',
          'Admins: „Neue Ankündigung“ klicken, Titel und Text (Markdown) schreiben und mit „Vorschau“ prüfen.',
          'Bei Bedarf „Oben anheften“ und ein „Ablaufdatum“ wählen, dann „Veröffentlichen“.',
        ],
        tips: ['Admins sehen auch abgelaufene Ankündigungen.', 'Die Seite verschwindet aus dem Menü, wenn das Modul „Ankündigungen“ abgeschaltet ist.'],
      },
    },
  },
  {
    route: 'system/modules',
    text: {
      az: {
        title: 'Modullar',
        purpose: 'İstifadə olunmayan funksiyaları hamı üçün söndürmək: menyu, bölmə tabları, Ctrl+K və panel vidcetləri sadələşir. Yalnız Super admin üçündür.',
        steps: [
          'Siyahıda modulun təsvirini və ona aid «Səhifələr»i oxuyun.',
          'Lazım olmayan modulun açarını söndürün — dəyişiklik dərhal yadda saxlanılır.',
          'Modulu geri qaytarmaq üçün açarı yenidən yandırın.',
        ],
        tips: ['Söndürmək məlumatları silmir; server xidmətləri işləməyə davam edir.', 'Hansı səhifənin az açıldığını «İstifadə statistikası» səhifəsində görün.'],
      },
      ru: {
        title: 'Модули',
        purpose: 'Отключение неиспользуемых функций для всех: меню, вкладки разделов, Ctrl+K и виджеты панели становятся проще. Только для Суперадмина.',
        steps: [
          'Прочитайте в списке описание модуля и его «Страницы».',
          'Выключите переключатель ненужного модуля — изменение сохраняется сразу.',
          'Чтобы вернуть модуль, включите переключатель снова.',
        ],
        tips: ['Отключение не удаляет данные; серверные службы продолжают работать.', 'Какие страницы открывают редко, видно на странице «Статистика использования».'],
      },
      en: {
        title: 'Modules',
        purpose: 'Switch unused features off for everyone: the menu, hub tabs, Ctrl+K and dashboard widgets become simpler. Super admin only.',
        steps: [
          'Read each module’s description and its “Pages” in the list.',
          'Switch off the toggle of a module you do not need — the change is saved at once.',
          'To bring a module back, switch its toggle on again.',
        ],
        tips: ['Switching off deletes no data; server services keep running.', 'See which pages are rarely opened on the “Usage statistics” page.'],
      },
      de: {
        title: 'Module',
        purpose: 'Ungenutzte Funktionen für alle abschalten: Menü, Bereichs-Tabs, Strg+K und Widgets der Übersicht werden schlanker. Nur für Super-Admins.',
        steps: [
          'Lesen Sie in der Liste die Beschreibung jedes Moduls und seine „Seiten“.',
          'Schalten Sie den Schalter eines nicht benötigten Moduls aus — die Änderung wird sofort gespeichert.',
          'Um ein Modul zurückzuholen, schalten Sie es wieder ein.',
        ],
        tips: ['Abschalten löscht keine Daten; Serverdienste laufen weiter.', 'Welche Seiten selten geöffnet werden, zeigt die Seite „Nutzungsstatistik“.'],
      },
    },
  },
  {
    route: 'system/usage',
    text: {
      az: {
        title: 'İstifadə statistikası',
        purpose: 'Admin panelinin hər səhifəsinin nə qədər və neçə nəfər tərəfindən açıldığı; az istifadə olunanlar yuxarıda. Menyunu sadələşdirmək üçün Super admin istifadə edir.',
        steps: [
          '«Dövr» seçin: 7, 30 və ya 90 gün.',
          'Cədvəldə Açılma, İstifadəçi və Son açılma sütunlarına baxın; «Səhifə axtar» ilə səhifəni tapın.',
          'Lazımsız modula aid səhifənin yanında «Modulu söndür» basın (geri qaytarmaq üçün «Modulu yandır»).',
        ],
        tips: ['Hər səhifə baxışı bir dəfə sayılır.', 'Modulları ətraflı «Modullar» səhifəsində idarə edin.'],
      },
      ru: {
        title: 'Статистика использования',
        purpose: 'Сколько раз и сколько людей открывали каждую страницу админ-панели; редко используемые — сверху. Суперадмин использует её, чтобы упростить меню.',
        steps: [
          'Выберите «Период»: 7, 30 или 90 дней.',
          'Смотрите столбцы «Открытий», «Пользователей» и «Последнее открытие»; страницу найдёт «Поиск страницы».',
          'Рядом со страницей ненужного модуля нажмите «Отключить модуль» (вернуть — «Включить модуль»).',
        ],
        tips: ['Каждый просмотр страницы считается один раз.', 'Подробно модулями управляют на странице «Модули».'],
      },
      en: {
        title: 'Usage statistics',
        purpose: 'How often, and by how many people, each admin page was opened; the least used are on top. The Super admin uses it to simplify the menu.',
        steps: [
          'Choose a “Period”: 7, 30 or 90 days.',
          'Read the Opens, Users and Last opened columns; find a page with “Search pages”.',
          'Next to a page of an unneeded module, click “Switch module off” (“Switch module on” brings it back).',
        ],
        tips: ['Every page view is counted once.', 'Manage modules in detail on the “Modules” page.'],
      },
      de: {
        title: 'Nutzungsstatistik',
        purpose: 'Wie oft und von wie vielen Personen jede Admin-Seite geöffnet wurde; die am wenigsten genutzten stehen oben. Der Super-Admin nutzt sie, um das Menü zu verschlanken.',
        steps: [
          'Wählen Sie einen „Zeitraum“: 7, 30 oder 90 Tage.',
          'Lesen Sie die Spalten Aufrufe, Nutzer und Zuletzt geöffnet; eine Seite finden Sie mit „Seite suchen“.',
          'Neben der Seite eines nicht benötigten Moduls „Modul ausschalten“ klicken („Modul einschalten“ macht es rückgängig).',
        ],
        tips: ['Jeder Seitenaufruf wird einmal gezählt.', 'Module im Detail verwalten Sie auf der Seite „Module“.'],
      },
    },
  },
  {
    route: 'system/brand',
    text: {
      az: {
        title: 'Brend',
        purpose: 'Bu serverin adı, loqosu, ikonları, rəngləri, əlaqə və göndərən e-poçtu. Sayt, kabinetlər, e-poçtlar, PDF-lər və SEO bu məlumatları istifadə edir. Yalnız Super admin üçündür.',
        steps: [
          '«Ad və təsvir», «Əlaqə», «Göndərən e-poçt» və «Dillər» bloklarını doldurun; boş sahə standart dəyəri saxlayır.',
          '«Loqo və ikonlar» blokunda açıq və tünd fon üçün loqoları və kvadrat ikonu (ən azı 512 × 512) «Yüklə» ilə əlavə edin, «Rənglər»i seçin.',
          '«Önizləmə»yə baxın və «Yadda saxla» basın.',
        ],
        tips: ['«Hamısını standarta qaytar» bütün brend dəyişikliklərini ləğv edir.'],
      },
      ru: {
        title: 'Бренд',
        purpose: 'Название, логотип, иконки, цвета, контакты и адрес отправителя этого сервера. Их используют сайт, кабинеты, письма, PDF и SEO. Только для Суперадмина.',
        steps: [
          'Заполните блоки «Название и описание», «Контакты», «Отправитель писем» и «Языки»; пустое поле оставляет значение по умолчанию.',
          'В блоке «Логотип и иконки» загрузите логотипы для светлого и тёмного фона и квадратную иконку (не меньше 512 × 512), выберите «Цвета».',
          'Проверьте «Предпросмотр» и нажмите «Сохранить».',
        ],
        tips: ['«Сбросить всё по умолчанию» отменяет все изменения бренда.'],
      },
      en: {
        title: 'Brand',
        purpose: 'This server’s name, logo, icons, colours, contact details and sender e-mail. The website, portals, e-mails, PDFs and SEO use them. Super admin only.',
        steps: [
          'Fill in the “Name and description”, “Contact”, “Sender e-mail” and “Languages” blocks; an empty field keeps the default.',
          'In “Logo and icons”, upload logos for light and dark backgrounds and a square icon (at least 512 × 512) with “Upload”, then pick the “Colours”.',
          'Check the “Preview” and click “Save”.',
        ],
        tips: ['“Reset everything to default” undoes all brand changes.'],
      },
      de: {
        title: 'Marke',
        purpose: 'Name, Logo, Icons, Farben, Kontakt und Absender-E-Mail dieses Servers. Website, Portale, E-Mails, PDFs und SEO verwenden sie. Nur für Super-Admins.',
        steps: [
          'Füllen Sie die Blöcke „Name und Beschreibung“, „Kontakt“, „Absender-E-Mail“ und „Sprachen“ aus; ein leeres Feld behält den Standard.',
          'Unter „Logo und Icons“ Logos für hellen und dunklen Hintergrund und ein quadratisches Icon (mind. 512 × 512) mit „Hochladen“ hinzufügen, dann „Farben“ wählen.',
          'Prüfen Sie die „Vorschau“ und klicken Sie auf „Speichern“.',
        ],
        tips: ['„Alles auf Standard zurücksetzen“ macht alle Markenänderungen rückgängig.'],
      },
    },
  },
  {
    route: 'system/license',
    text: {
      az: {
        title: 'Lisenziya',
        purpose: 'Bu serverin lisenziyasının vəziyyəti: plan, əməkdaş yerləri, modullar, domen və bitmə tarixi. Yalnız Super admin üçündür; səhifə yalnız göstərir.',
        steps: [
          'Status, plan və qalan günlərə baxın.',
          'Əməkdaş yerlərinin və plana daxil modulların siyahısını yoxlayın.',
          'Müddət bitməyə yaxındırsa, «Lisenziyanı yeniləmək» blokundakı addımlarla yeni açarı serverə qoyun.',
        ],
        tips: [
          'Açar serverdə .env.production faylında LICENSE_KEY kimi saxlanılır.',
          'Müddət bitdikdən sonra güzəşt dövrü var, sonra əməkdaşlar yalnız oxuya bilir; müştərilər öz məlumatlarına həmişə çatır.',
        ],
      },
      ru: {
        title: 'Лицензия',
        purpose: 'Состояние лицензии этого сервера: план, места сотрудников, модули, домен и срок действия. Только для Суперадмина; страница лишь показывает данные.',
        steps: [
          'Посмотрите статус, план и оставшиеся дни.',
          'Проверьте места сотрудников и список модулей, входящих в план.',
          'Если срок подходит к концу, установите новый ключ по шагам блока «Продление лицензии».',
        ],
        tips: [
          'Ключ хранится на сервере в файле .env.production как LICENSE_KEY.',
          'После истечения есть льготный период, затем сотрудники могут только читать; клиенты всегда сохраняют доступ к своим данным.',
        ],
      },
      en: {
        title: 'License',
        purpose: 'The state of this server’s licence: plan, staff seats, modules, domain and expiry date. Super admin only; the page is read-only.',
        steps: [
          'Check the status, plan and days left.',
          'Review the staff seats and the modules included in the plan.',
          'If expiry is near, install the new key following the “Renewing the licence” block.',
        ],
        tips: [
          'The key is stored on the server in .env.production as LICENSE_KEY.',
          'After expiry there is a grace period, then staff can only read; clients never lose access to their data.',
        ],
      },
      de: {
        title: 'Lizenz',
        purpose: 'Der Stand der Lizenz dieses Servers: Plan, Mitarbeiterplätze, Module, Domain und Ablaufdatum. Nur für Super-Admins; die Seite zeigt nur an.',
        steps: [
          'Prüfen Sie Status, Plan und verbleibende Tage.',
          'Kontrollieren Sie die Mitarbeiterplätze und die im Plan enthaltenen Module.',
          'Läuft die Lizenz bald ab, installieren Sie den neuen Schlüssel nach dem Block „Lizenz verlängern“.',
        ],
        tips: [
          'Der Schlüssel steht auf dem Server in .env.production als LICENSE_KEY.',
          'Nach Ablauf gibt es eine Kulanzzeit, danach können Mitarbeitende nur noch lesen; Kunden behalten immer Zugriff auf ihre Daten.',
        ],
      },
    },
  },
  {
    route: 'system/customers',
    text: {
      az: {
        title: 'Müştəri agentliklər',
        purpose: 'Platformanı alan agentliklərin siyahısı: domen, plan, qiymət, lisenziya müddəti və aylıq gəlir. Yalnız platforma sahibinin serverində və Super admin üçündür.',
        steps: [
          '«Müştəri əlavə et» ilə agentliyin adını, əlaqə məlumatlarını, domenini, planını və qiymətini yazın.',
          'Lisenziya açarını öz kompüterinizdə yaradın və yoxlama üçün «Verilmiş lisenziya açarı» sahəsinə yapışdırın — imza dərhal yoxlanılır.',
          'Hesab-faktura üçün «Şirkət yarat» basın; sətirdə «Redaktə et» və «Sil» də var.',
        ],
        tips: ['Şəxsi açar heç vaxt serverə yüklənmir — açar burada yaradılmır.', 'Bitməyə az qalan lisenziyalar «… gün qalıb» nişanı ilə görünür.'],
      },
      ru: {
        title: 'Агентства-клиенты',
        purpose: 'Список агентств, купивших платформу: домен, план, цена, срок лицензии и ежемесячный доход. Только на сервере владельца платформы и только для Суперадмина.',
        steps: [
          '«Добавить клиента»: укажите название агентства, контакты, домен, план и цену.',
          'Создайте ключ лицензии на своём компьютере и вставьте его в поле «Выданный ключ лицензии» — подпись проверяется сразу.',
          'Для выставления счетов нажмите «Создать компанию»; в строке также есть «Изменить» и «Удалить».',
        ],
        tips: ['Закрытый ключ никогда не загружается на сервер — ключи здесь не создаются.', 'Лицензии с близким сроком помечены «осталось … дн.».'],
      },
      en: {
        title: 'Customer agencies',
        purpose: 'The agencies that bought the platform: domain, plan, price, licence expiry and monthly revenue. Only on the platform owner’s server and only for the Super admin.',
        steps: [
          'Click “Add customer” and enter the agency’s name, contact details, domain, plan and price.',
          'Generate the licence key on your own computer and paste it into the “Issued licence key” field — the signature is checked at once.',
          'Click “Create company” to invoice the agency; each row also has “Edit” and “Delete”.',
        ],
        tips: ['The private key never goes to the server — keys are not generated here.', 'Licences about to expire show a “… days left” badge.'],
      },
      de: {
        title: 'Kunden-Agenturen',
        purpose: 'Die Agenturen, die die Plattform gekauft haben: Domain, Plan, Preis, Lizenzablauf und Monatsumsatz. Nur auf dem Server des Plattform-Anbieters und nur für Super-Admins.',
        steps: [
          '„Kunde hinzufügen“ klicken und Name, Kontakt, Domain, Plan und Preis der Agentur eintragen.',
          'Den Lizenzschlüssel auf Ihrem Rechner erzeugen und in das Feld „Ausgestellter Lizenzschlüssel“ einfügen — die Signatur wird sofort geprüft.',
          'Mit „Firma anlegen“ die Agentur für Rechnungen anlegen; jede Zeile hat auch „Bearbeiten“ und „Löschen“.',
        ],
        tips: ['Der private Schlüssel kommt nie auf den Server — Schlüssel werden hier nicht erzeugt.', 'Bald ablaufende Lizenzen zeigen das Abzeichen „noch … Tage“.'],
      },
    },
  },
  {
    route: 'system/onboarding',
    text: {
      az: {
        title: 'Quraşdırma ustası',
        purpose: 'Yeni agentlik serverinin ilk quraşdırılması addım-addım: Brend, Dillər, Ölkələr və vizalar, Modullar, Komanda, Sənəd tələbləri, E-poçt, İlk işəgötürən və İşə başlama. Yalnız Super admin üçündür.',
        steps: [
          'Addımı açın, sahələri doldurun və «Saxla və davam et» basın; lazım deyilsə «Ötür».',
          '«Komanda» addımında əməkdaşları dəvət edin, «E-poçt» addımında «Test məktubu göndər» ilə göndərməni yoxlayın.',
          '«İşə başlama» yoxlama siyahısına baxın və «Quraşdırmanı tamamla» basın.',
        ],
        tips: ['Proqres yadda saxlanılır — istənilən vaxt davam edə və ya addımı «Yenidən aç» edə bilərsiniz.', 'Qırmızı bəndlər işə başlamağa mane olmur, amma tövsiyə olunur.'],
      },
      ru: {
        title: 'Мастер настройки',
        purpose: 'Первичная настройка нового сервера агентства по шагам: Бренд, Языки, Страны и визы, Модули, Команда, Требования к документам, Почта, Первый работодатель и Запуск. Только для Суперадмина.',
        steps: [
          'Откройте шаг, заполните поля и нажмите «Сохранить и продолжить»; если шаг не нужен — «Пропустить».',
          'На шаге «Команда» пригласите сотрудников, на шаге «Почта» проверьте отправку кнопкой «Отправить тестовое письмо».',
          'Просмотрите чек-лист шага «Запуск» и нажмите «Завершить настройку».',
        ],
        tips: ['Прогресс сохраняется — можно продолжить позже или «Открыть снова» любой шаг.', 'Красные пункты не блокируют запуск, но рекомендуются.'],
      },
      en: {
        title: 'Onboarding wizard',
        purpose: 'Step-by-step first setup of a new agency server: Brand, Languages, Countries and visas, Modules, Team, Document requirements, E-mail, First employer and Go live. Super admin only.',
        steps: [
          'Open a step, fill in the fields and click “Save and continue”; if you do not need it, click “Skip”.',
          'In “Team”, invite your colleagues; in “E-mail”, check sending with “Send test e-mail”.',
          'Review the “Go live” checklist and click “Complete setup”.',
        ],
        tips: ['Progress is saved — continue any time or “Reopen” a step.', 'Red items do not block going live, but are recommended.'],
      },
      de: {
        title: 'Einrichtungsassistent',
        purpose: 'Schrittweise Ersteinrichtung eines neuen Agentur-Servers: Marke, Sprachen, Länder und Visa, Module, Team, Dokumentanforderungen, E-Mail, Erster Arbeitgeber und Start. Nur für Super-Admins.',
        steps: [
          'Schritt öffnen, Felder ausfüllen und „Speichern und weiter“ klicken; wird er nicht gebraucht, „Überspringen“.',
          'Unter „Team“ Kolleginnen und Kollegen einladen, unter „E-Mail“ den Versand mit „Test-E-Mail senden“ prüfen.',
          'Die Checkliste unter „Start“ durchgehen und „Einrichtung abschließen“ klicken.',
        ],
        tips: ['Der Fortschritt wird gespeichert — jederzeit weitermachen oder einen Schritt „Wieder öffnen“.', 'Rote Punkte blockieren den Start nicht, werden aber empfohlen.'],
      },
    },
  },
  {
    route: 'design-system',
    text: {
      az: {
        title: 'Dizayn sistemi',
        purpose: 'Panelin dizayn tokenləri və komponentlərinin kataloqu: rənglər, status tonları, tipoqrafiya, düymələr, formalar, cədvəllər və s. Yeni səhifələr bunlara əsaslanır. Admin və Super admin üçündür.',
        steps: [
          '«Səth» seçin: Admin (dəqiq) və ya Sayt / portal (isti).',
          '«Mövzu»nu Açıq və Tünd arasında dəyişib rəngləri yoxlayın.',
          'Bölmələrə (Rənglər, Düymələr, Forma elementləri, Cədvəl və s.) baxın və nümunə pəncərələri sınayın.',
        ],
        tips: ['Bu səhifə yalnız göstərir — burada heç nə dəyişmir.', 'Brend rəngləri «Brend» və ya mövzu parametrlərində dəyişdirilir.'],
      },
      ru: {
        title: 'Дизайн-система',
        purpose: 'Каталог дизайн-токенов и компонентов панели: цвета, тона статусов, типографика, кнопки, формы, таблицы и т. д. На них строятся новые страницы. Для Администратора и Суперадмина.',
        steps: [
          'Выберите «Поверхность»: Админка (строгая) или Сайт / портал (тёплая).',
          'Переключите «Тему» между Светлой и Тёмной, чтобы проверить цвета.',
          'Просмотрите разделы (Цвета, Кнопки, Элементы форм, Таблица и др.) и попробуйте примеры окон.',
        ],
        tips: ['Страница только показывает — здесь ничего не меняется.', 'Цвета бренда меняются на странице «Бренд» или в настройках темы.'],
      },
      en: {
        title: 'Design system',
        purpose: 'The catalogue of the panel’s design tokens and components: colours, status tones, typography, buttons, forms, tables and more. New pages are built on them. For Admins and Super admins.',
        steps: [
          'Choose a “Surface”: Admin (crisp) or Site / portal (warm).',
          'Switch the “Theme” between Light and Dark to check the colours.',
          'Browse the sections (Colours, Buttons, Form elements, Table, …) and try the sample dialogs.',
        ],
        tips: ['This page only shows things — nothing is changed here.', 'Brand colours are changed on the “Brand” page or in the theme settings.'],
      },
      de: {
        title: 'Designsystem',
        purpose: 'Der Katalog der Design-Tokens und Komponenten des Panels: Farben, Statustöne, Typografie, Schaltflächen, Formulare, Tabellen und mehr. Neue Seiten bauen darauf auf. Für Admins und Super-Admins.',
        steps: [
          'Wählen Sie eine „Oberfläche“: Admin (präzise) oder Website / Portal (warm).',
          'Wechseln Sie das „Theme“ zwischen Hell und Dunkel, um die Farben zu prüfen.',
          'Sehen Sie sich die Abschnitte an (Farben, Schaltflächen, Formularelemente, Tabelle …) und probieren Sie die Beispieldialoge aus.',
        ],
        tips: ['Diese Seite zeigt nur an — hier wird nichts geändert.', 'Markenfarben ändern Sie auf der Seite „Marke“ oder in den Theme-Einstellungen.'],
      },
    },
  },
];
