import type { PageHelpEntry } from '../types.js';

/** Admin page help: Cases hub pages. */
export const PAGES_CASES: PageHelpEntry[] = [
  {
    route: 'cases',
    text: {
      az: {
        title: 'Müraciətlər',
        purpose: 'Müştərilərin bütün viza müraciətlərinin siyahısı: status, məsul, sənədlər və növbəti addım. Bütün əməkdaşlar gündəlik iş üçün buradan başlayır.',
        steps: [
          'Yuxarıdakı kartlardan birini seçin («Aktiv», «Mənim», «Təyinatsız», «Ləngiyən», «Bu həftə səfirlik») və ya axtarış, status, məsul, tarix və «Digər» filtrlərindən istifadə edin.',
          'Sətirə basın — sağda ön baxış açılır; tam səhifə üçün müraciət nömrəsinə basın. «Lövhə» düyməsi müraciətləri sənəd mərhələləri üzrə sütunlarda göstərir.',
          'Bir neçə sətri işarələyin və aşağıdakı paneldə toplu əməliyyat seçin (təyin et, status, mesaj, CSV). Tez-tez işlətdiyiniz filtrləri «Filtri saxla» ilə tab kimi saxlayın.',
        ],
        tips: [
          'Klaviatura: J / K — sətirlər arasında, Enter — açmaq, / — axtarış, Esc — bağlamaq.',
          '«Sürətli yoxlama» düyməsi gözləyən sənədləri bir ekranda yoxlamağa aparır.',
        ],
      },
      ru: {
        title: 'Заявки',
        purpose: 'Список всех визовых заявок клиентов: статус, ответственный, документы и следующий шаг. Отсюда все сотрудники начинают ежедневную работу.',
        steps: [
          'Выберите плитку вверху («Активные», «Мои», «Без ответственного», «Застряли», «Посольство на этой неделе») или используйте поиск, статус, ответственного, дату и «Ещё».',
          'Нажмите на строку — справа откроется предпросмотр; полную страницу откройте по номеру заявки. Кнопка «Доска» показывает заявки по этапам работы с документами.',
          'Отметьте несколько строк и выберите действие на нижней панели (назначить, статус, сообщение, CSV). Частые фильтры сохраните вкладкой через «Сохранить фильтр».',
        ],
        tips: [
          'Клавиатура: J / K — по строкам, Enter — открыть, / — поиск, Esc — закрыть.',
          'Кнопка «Быстрая проверка» ведёт к проверке ожидающих документов на одном экране.',
        ],
      },
      en: {
        title: 'Cases',
        purpose: 'The list of all client visa cases: status, owner, documents and the next step. Every staff member starts the daily work here.',
        steps: [
          'Pick a tile at the top (“Open”, “Mine”, “Unassigned”, “Stuck”, “Embassy this week”) or use search, status, owner, date and “More”.',
          'Click a row to open the preview on the right; click the case number for the full page. The “Board” button shows cases in columns by document stage.',
          'Tick several rows and choose an action in the bar at the bottom (assign, status, message, CSV). Keep frequent filters as a tab with “Save filter”.',
        ],
        tips: [
          'Keyboard: J / K move between rows, Enter opens, / focuses search, Esc closes.',
          'The “Fast review” button takes you to reviewing waiting documents on one screen.',
        ],
      },
      de: {
        title: 'Anträge',
        purpose: 'Liste aller Visumanträge der Kunden: Status, Zuständige, Dokumente und nächster Schritt. Hier beginnen alle Mitarbeitenden ihre tägliche Arbeit.',
        steps: [
          'Wählen Sie oben eine Kachel („Offen“, „Meine“, „Ohne Zuständigen“, „Stockend“, „Botschaft diese Woche“) oder nutzen Sie Suche, Status, Zuständige, Datum und „Mehr“.',
          'Ein Klick auf die Zeile öffnet rechts die Vorschau; die Antragsnummer öffnet die ganze Seite. Die Schaltfläche „Board“ zeigt die Anträge in Spalten nach Dokumentenstufe.',
          'Markieren Sie mehrere Zeilen und wählen Sie unten eine Sammelaktion (zuweisen, Status, Nachricht, CSV). Häufige Filter speichern Sie mit „Filter speichern“ als Tab.',
        ],
        tips: [
          'Tastatur: J / K wechseln die Zeile, Enter öffnet, / springt zur Suche, Esc schließt.',
          'Die Schaltfläche „Schnellprüfung“ führt zur Prüfung wartender Dokumente auf einem Bildschirm.',
        ],
      },
    },
  },
  {
    route: 'cases/:id',
    text: {
      az: {
        title: 'Müraciət səhifəsi',
        purpose: 'Bir müraciətin bütün işi: sənədlərin yoxlanması, müqavilə, səfirlik üçün sənəd dəsti və qərar. Biz sənədləri hazırlayırıq, müştəri səfirliyə özü müraciət edir, cavabı səfirlik verir.',
        steps: [
          'Yuxarıdakı «Növbəti addım» kartına baxın — indi nə etməli olduğunuzu və uyğun düyməni göstərir.',
          'Tablar arasında keçin: «Ümumi», «Sənədlər» (qəbul et / rədd et), «Ailə», «Gəlişdən sonra», «Maliyyə», «Mesajlar», «Tarixçə».',
          '«Digər əməliyyatlar» menyusundan məlumatları redaktə edin, «Şablondan müqavilə», «Səfirlik paketi», daxili qeyd və ya tapşırıq yaradın.',
        ],
        tips: [
          'Status dəyişikliyi, rədd edilən sənəd və qərar barədə müştəri avtomatik xəbərdar olur — səbəbləri aydın yazın.',
          'Daxili qeydləri müştəri görmür; «Mesajlar»dakı hər mesaj müştəriyə gedir.',
          'Müqavilə «Sənədlər» tabında bir dənədir: Əmək müqaviləsi (öz PDF-inizi yükləyin; əvvəl müştəri, sonra Triad Vision imzalayır). Sonra, ödəniş olduqda, alman sənədləri İş axınında hazırlanıb müştəriyə göndərilir. İşəgötürən imzalamır.',
        ],
      },
      ru: {
        title: 'Страница заявки',
        purpose: 'Вся работа по одной заявке: проверка документов, договор, комплект документов для посольства и решение. Мы готовим документы, клиент сам подаёт их в посольство, ответ даёт посольство.',
        steps: [
          'Посмотрите карточку «Следующий шаг» вверху — она подсказывает, что делать сейчас, и даёт нужную кнопку.',
          'Переключайтесь между вкладками: «Обзор», «Документы» (принять / отклонить), «Семья», «После приезда», «Финансы», «Сообщения», «История».',
          'В меню «Другие действия» измените данные, создайте «Договор из шаблона», «Пакет для посольства», внутреннюю заметку или задачу.',
        ],
        tips: [
          'О смене статуса, отклонённом документе и решении клиент узнаёт автоматически — пишите причины понятно.',
          'Внутренние заметки клиент не видит; каждое сообщение во вкладке «Сообщения» уходит клиенту.',
          'Договор во вкладке «Документы» один: Əmək müqaviləsi (загрузите свой PDF; сначала подписывает клиент, затем Triad Vision). Затем, после оплаты, немецкие документы готовятся в рабочем процессе и отправляются клиенту. Работодатель не подписывает.',
        ],
      },
      en: {
        title: 'Case page',
        purpose: 'All the work on one case: document review, contract, the embassy document set and the decision. We prepare the documents, the client applies to the embassy, the embassy answers.',
        steps: [
          'Check the “Next step” card at the top — it tells you what to do now and offers the matching button.',
          'Switch between the tabs: “Overview”, “Documents” (accept / reject), “Family”, “After arrival”, “Finance”, “Messages”, “History”.',
          'Use the “More actions” menu to edit details, create a “Contract from template”, the “Embassy package”, an internal note or a task.',
        ],
        tips: [
          'Status changes, rejected documents and decisions notify the client automatically — write reasons clearly.',
          'The client never sees internal notes; every message in “Messages” goes to the client.',
          'There is one contract on the “Documents” tab: the Əmək müqaviləsi (upload your own PDF; the client signs first, then Triad Vision). After that, once the client has paid, the German documents are prepared in the drive workflow and sent to the client. The employer does not sign.',
        ],
      },
      de: {
        title: 'Antragsseite',
        purpose: 'Die gesamte Arbeit an einem Antrag: Dokumentenprüfung, Vertrag, Unterlagen für die Botschaft und Entscheidung. Wir bereiten die Unterlagen vor, der Kunde beantragt selbst bei der Botschaft, die Botschaft entscheidet.',
        steps: [
          'Sehen Sie sich oben die Karte „Nächster Schritt“ an — sie sagt, was jetzt zu tun ist, und bietet die passende Schaltfläche.',
          'Wechseln Sie zwischen den Tabs: „Übersicht“, „Dokumente“ (annehmen / ablehnen), „Familie“, „Nach der Ankunft“, „Finanzen“, „Nachrichten“, „Verlauf“.',
          'Über „Weitere Aktionen“ bearbeiten Sie Angaben, erstellen einen „Vertrag aus Vorlage“, das „Botschaftspaket“, eine interne Notiz oder eine Aufgabe.',
        ],
        tips: [
          'Statuswechsel, abgelehnte Dokumente und Entscheidungen werden dem Kunden automatisch mitgeteilt — Gründe klar formulieren.',
          'Interne Notizen sieht der Kunde nicht; jede Nachricht unter „Nachrichten“ geht an den Kunden.',
          'Im Tab „Dokumente“ gibt es einen Vertrag: den Əmək müqaviləsi (eigenes PDF hochladen; zuerst unterschreibt der Kunde, dann Triad Vision). Danach werden nach der Zahlung die deutschen Unterlagen im Arbeitsablauf vorbereitet und an den Kunden gesendet. Der Arbeitgeber unterschreibt nicht.',
        ],
      },
    },
  },
  {
    route: 'review',
    text: {
      az: {
        title: 'Sürətli yoxlama',
        purpose: 'Bütün müraciətlərdə yoxlama gözləyən sənədlər bir ekranda, klaviatura ilə. Sənəd növbəsini tez boşaltmaq üçün.',
        steps: [
          'Yuxarıda növbəni seçin: «Hamısı» və ya «Mənimkilər», lazım olsa viza növü və tərəfdaş filtri.',
          'Sənədə və sağdakı tələb siyahısına baxın, sonra «Təsdiqlə», «Rədd et» (səbəb seçin) və ya «Keç» basın.',
          'Səhv qərarı «Geri al» ilə qaytarın; iş bitəndə «Yoxlamadan çıx» basın.',
        ],
        tips: [
          'Klaviatura: J / K — növbəti / əvvəlki, A — təsdiq, R — rədd, S — keç, Z — geri al.',
          'Qərar bir neçə saniyə sonra göndərilir — o vaxta qədər Z onu geri qaytarır.',
        ],
      },
      ru: {
        title: 'Быстрая проверка',
        purpose: 'Документы всех заявок, ожидающие проверки, на одном экране и с клавиатуры. Чтобы быстро разобрать очередь документов.',
        steps: [
          'Вверху выберите очередь: «Все» или «Мои», при необходимости фильтр по типу визы и партнёру.',
          'Посмотрите документ и чек-лист требований справа, затем нажмите «Принять», «Отклонить» (выберите причину) или «Пропустить».',
          'Ошибочное решение верните кнопкой «Отменить»; по окончании нажмите «Выйти из проверки».',
        ],
        tips: [
          'Клавиатура: J / K — следующий / предыдущий, A — принять, R — отклонить, S — пропустить, Z — отменить.',
          'Решение отправляется через несколько секунд — до этого Z его отменяет.',
        ],
      },
      en: {
        title: 'Fast review',
        purpose: 'Documents waiting for review across all cases on one screen, driven by the keyboard. Use it to clear the document queue quickly.',
        steps: [
          'Choose the queue at the top: “All” or “Mine”, plus visa type and partner filters if needed.',
          'Look at the document and the requirement checklist on the right, then click “Approve”, “Reject” (pick a reason) or “Skip”.',
          'Take back a wrong decision with “Undo”; when you are done click “Leave review”.',
        ],
        tips: [
          'Keyboard: J / K next / previous, A approve, R reject, S skip, Z undo.',
          'A decision is sent after a few seconds — until then Z takes it back.',
        ],
      },
      de: {
        title: 'Schnellprüfung',
        purpose: 'Wartende Dokumente aller Anträge auf einem Bildschirm, per Tastatur bedienbar. Damit leeren Sie die Prüfwarteschlange schnell.',
        steps: [
          'Wählen Sie oben die Warteschlange: „Alle“ oder „Meine“, bei Bedarf Filter nach Visumart und Partner.',
          'Prüfen Sie das Dokument und rechts die Anforderungsliste, dann „Annehmen“, „Ablehnen“ (Grund wählen) oder „Überspringen“.',
          'Eine falsche Entscheidung nehmen Sie mit „Rückgängig“ zurück; am Ende „Prüfung verlassen“.',
        ],
        tips: [
          'Tastatur: J / K weiter / zurück, A annehmen, R ablehnen, S überspringen, Z rückgängig.',
          'Eine Entscheidung wird erst nach einigen Sekunden gesendet — bis dahin nimmt Z sie zurück.',
        ],
      },
    },
  },
  {
    route: 'requirements',
    text: {
      az: {
        title: 'Sənəd tələbləri',
        purpose: 'Yeni müraciətlərin müştəridən istəyəcəyi sənədlərin şablonları: ümumi siyahı və viza növləri üzrə siyahılar, hər biri «İlkin sənədlər» və «Səfirlik sənədləri» bölmələri ilə.',
        steps: [
          'Soldan «Ümumi siyahı» və ya «Viza növləri» altında konkret viza növünü seçin.',
          'Lazımi bölmədə «Tələb əlavə et» basın: başlıq, təsvir, «Məcburi» və ya «İstəyə bağlı», lazım olsa açar (məs. PASSPORT) yazın.',
          'Viza növünə ayrıca siyahı lazımdırsa, «Ümumi siyahını bu viza növünə kopyala» basıb kopyanı redaktə edin.',
        ],
        tips: [
          'Dəyişikliklər yalnız YENİ müraciətlərə təsir edir; mövcud müraciətin siyahısı müraciət səhifəsində dəyişdirilir.',
          'Baxmaq hamıya açıqdır, dəyişməyi yalnız Administrator edə bilər.',
        ],
      },
      ru: {
        title: 'Требования к документам',
        purpose: 'Шаблоны документов, которые новые заявки запрашивают у клиента: общий список и списки по типам виз, каждый с разделами «Первичные документы» и «Документы для посольства».',
        steps: [
          'Слева выберите «Общий список» или конкретный тип в разделе «Типы визы».',
          'В нужном разделе нажмите «Добавить требование»: название, описание, «Обязательно» или «Необязательно», при необходимости ключ (например, PASSPORT).',
          'Если типу визы нужен свой список, нажмите «Скопировать общий список в этот тип визы» и отредактируйте копию.',
        ],
        tips: [
          'Изменения касаются только НОВЫХ заявок; список существующей заявки меняется на её странице.',
          'Смотреть могут все, менять — только Администратор.',
        ],
      },
      en: {
        title: 'Document requirements',
        purpose: 'Templates of the documents new cases ask the client for: a global list and lists per visa type, each with “Initial documents” and “Embassy documents”.',
        steps: [
          'On the left choose “Global list” or a specific visa type under “Visa types”.',
          'In the right section click “Add requirement”: title, description, “Required” or “Optional”, and a key if needed (e.g. PASSPORT).',
          'If a visa type needs its own list, click “Copy the global list to this visa type” and edit the copy.',
        ],
        tips: [
          'Changes affect NEW cases only; edit an existing case’s list on its case page.',
          'Everyone can view; only Administrators can change.',
        ],
      },
      de: {
        title: 'Dokumentvorlagen',
        purpose: 'Vorlagen der Unterlagen, die neue Anträge vom Kunden anfordern: eine allgemeine Liste und Listen je Visumtyp, jeweils mit „Erstdokumenten“ und „Botschaftsdokumenten“.',
        steps: [
          'Wählen Sie links „Allgemeine Liste“ oder einen Visumtyp unter „Visumtypen“.',
          'Klicken Sie im passenden Abschnitt auf „Anforderung hinzufügen“: Titel, Beschreibung, „Pflicht“ oder „Optional“, bei Bedarf ein Schlüssel (z. B. PASSPORT).',
          'Braucht ein Visumtyp eine eigene Liste, klicken Sie „Allgemeine Liste auf diesen Visumtyp kopieren“ und bearbeiten die Kopie.',
        ],
        tips: [
          'Änderungen wirken nur auf NEUE Anträge; die Liste eines bestehenden Antrags ändern Sie auf der Antragsseite.',
          'Ansehen dürfen alle, ändern nur Administratoren.',
        ],
      },
    },
  },
  {
    route: 'docs/audit',
    text: {
      az: {
        title: 'Sənəd audit jurnalı',
        purpose: 'Giriş, şifrə, istifadəçi və sənəd əməliyyatlarının tarixçəsi: kim, nə vaxt, hansı IP-dən nə edib. Yalnız Super admin üçündür.',
        steps: [
          'Yuxarıdakı «Əməliyyat» seçicisində hadisə növünü seçin, məsələn «Bütün sənəd əməliyyatları».',
          'Cədvəldə vaxt, əməliyyat, icraçı, hədəf, təfərrüat və IP-ni oxuyun.',
          'Köhnə qeydlər üçün aşağıdakı «Əvvəlki» / «Növbəti» düymələri ilə səhifələri çevirin.',
        ],
        tips: [
          'Jurnal yalnız oxunur: qeydləri dəyişmək və silmək olmur.',
          'Şübhəli hadisə görsəniz (eyni IP-dən çoxlu uğursuz giriş), «İstifadəçilər» səhifəsində tədbir görün.',
        ],
      },
      ru: {
        title: 'Журнал аудита документов',
        purpose: 'История входов, паролей, операций с пользователями и документами: кто, когда и с какого IP что сделал. Только для суперадмина.',
        steps: [
          'Выберите тип события в селекторе «Операция» вверху, например «Все операции с документами».',
          'В таблице смотрите время, операцию, исполнителя, объект, подробности и IP.',
          'Для старых записей листайте страницы кнопками «Назад» / «Далее» внизу.',
        ],
        tips: [
          'Журнал только для чтения: записи нельзя изменить или удалить.',
          'Заметили подозрительное (много неудачных входов с одного IP) — примите меры на странице «Пользователи».',
        ],
      },
      en: {
        title: 'Document audit log',
        purpose: 'History of login, password, user and document operations: who did what, when and from which IP. Super admin only.',
        steps: [
          'Choose the event type in the “Action” selector at the top, e.g. “All document operations”.',
          'Read time, action, actor, target, details and IP in the table.',
          'Page back to older entries with “Previous” / “Next” at the bottom.',
        ],
        tips: [
          'The log is read-only: entries cannot be changed or deleted.',
          'If something looks suspicious (many failed logins from one IP), act on the “Users” page.',
        ],
      },
      de: {
        title: 'Dokumenten-Audit',
        purpose: 'Verlauf von Anmeldungen, Passwort-, Benutzer- und Dokumentvorgängen: wer was wann von welcher IP getan hat. Nur für den Super-Admin.',
        steps: [
          'Wählen Sie oben im Feld „Vorgang“ die Ereignisart, z. B. „Alle Dokumentvorgänge“.',
          'Lesen Sie in der Tabelle Zeit, Vorgang, Ausführenden, Ziel, Details und IP.',
          'Ältere Einträge erreichen Sie unten mit „Zurück“ / „Weiter“.',
        ],
        tips: [
          'Das Protokoll ist schreibgeschützt: Einträge lassen sich weder ändern noch löschen.',
          'Bei Verdacht (viele fehlgeschlagene Anmeldungen von einer IP) handeln Sie auf der Seite „Benutzer“.',
        ],
      },
    },
  },
  {
    route: 'expiring',
    text: {
      az: {
        title: 'Vaxtı bitən sənədlər',
        purpose: 'Aktiv müraciətlərdə müddəti yaxınlaşan və ya bitmiş sənədlər (pasport, sertifikatlar və s.). Müştəri və məsul əməkdaş avtomatik xəbərdar edilir.',
        steps: [
          '«Müddət» üzrə dövrü seçin: 30, 60, 90 və ya 180 gün.',
          'Siyahını əməkdaş və viza növü üzrə süzün; «Müddəti bitib» və «Təcili» nişanlarına diqqət edin.',
          '«Müraciəti aç» ilə müraciətə keçin və müştəridən yeni sənəd istəyin.',
        ],
        tips: [
          '«anbar» nişanlı sətirlər müştərinin sənəd seyfindəndir — yalnız baxış üçündür.',
        ],
      },
      ru: {
        title: 'Истекающие документы',
        purpose: 'Документы в открытых заявках, срок которых скоро истекает или уже истёк (паспорт, сертификаты и т. д.). Клиент и ответственный получают напоминания автоматически.',
        steps: [
          'Выберите «Период»: 30, 60, 90 или 180 дней.',
          'Отфильтруйте по сотруднику и типу визы; обратите внимание на метки «Истёк» и «Срочно».',
          'Нажмите «Открыть заявку» и запросите у клиента новый документ.',
        ],
        tips: [
          'Строки с меткой «сейф» взяты из сейфа документов клиента — только для просмотра.',
        ],
      },
      en: {
        title: 'Expiring documents',
        purpose: 'Documents in open cases that expire soon or have expired (passport, certificates and more). The client and the owner are reminded automatically.',
        steps: [
          'Choose the period under “Within”: 30, 60, 90 or 180 days.',
          'Filter by staff and visa type; watch the “Expired” and “Urgent” badges.',
          'Click “Open case” and ask the client for a new document.',
        ],
        tips: [
          'Rows marked “vault” come from the client’s document vault — read-only.',
        ],
      },
      de: {
        title: 'Ablaufende Dokumente',
        purpose: 'Dokumente in laufenden Anträgen, die bald ablaufen oder abgelaufen sind (Pass, Zertifikate usw.). Kunde und Zuständige werden automatisch erinnert.',
        steps: [
          'Wählen Sie unter „Zeitraum“ 30, 60, 90 oder 180 Tage.',
          'Filtern Sie nach Mitarbeiter und Visumart; achten Sie auf die Markierungen „Abgelaufen“ und „Dringend“.',
          'Mit „Antrag öffnen“ wechseln Sie zum Antrag und fordern beim Kunden ein neues Dokument an.',
        ],
        tips: [
          'Zeilen mit „Safe“ stammen aus dem Dokumentensafe des Kunden — nur zur Ansicht.',
        ],
      },
    },
  },
  {
    route: 'data-quality',
    text: {
      az: {
        title: 'Məlumat keyfiyyəti',
        purpose: 'Aktiv müraciətlər 0–100 bal ilə qiymətləndirilir: çatışmayan profil sahələri, sənədlər, vaxtı bitən sənədlər və pasport müddəti. Ən pisləri əvvəldə.',
        steps: [
          'Əməkdaş filtrində «Mənim müraciətlərim» və ya başqa əməkdaşı, lazım olsa viza növünü seçin.',
          '«Yalnız problemli (< 85)» ilə yalnız zəif və orta balları göstərin.',
          'Hər sətirdə nəyin çatışmadığını oxuyun və «Müraciəti aç» ilə boşluqları doldurun.',
        ],
        tips: [
          'Bal səfirlik paketindən əvvəl yoxlama üçün faydalıdır: pasport müddəti 6 aydan az olanlar da göstərilir.',
        ],
      },
      ru: {
        title: 'Качество данных',
        purpose: 'Активные дела оцениваются баллом 0–100: незаполненные поля профиля, документы, просроченные документы и срок паспорта. Худшие сверху.',
        steps: [
          'В фильтре сотрудника выберите «Мои дела» или коллегу, при необходимости тип визы.',
          'Включите «Только с проблемами (< 85)», чтобы видеть только слабые и средние баллы.',
          'В каждой строке посмотрите, чего не хватает, и через «Открыть дело» заполните пробелы.',
        ],
        tips: [
          'Удобно перед подготовкой пакета для посольства: показываются и паспорта, истекающие в течение 6 месяцев.',
        ],
      },
      en: {
        title: 'Data quality',
        purpose: 'Active cases scored 0–100: missing profile fields, documents, expired documents and passport validity. The worst come first.',
        steps: [
          'In the staff filter pick “My cases” or a colleague, and a visa type if needed.',
          'Switch on “Only with problems (< 85)” to see only poor and fair scores.',
          'Read what is missing in each row and fill the gaps via “Open case”.',
        ],
        tips: [
          'Handy before preparing the embassy package: passports expiring within 6 months are flagged too.',
        ],
      },
      de: {
        title: 'Datenqualität',
        purpose: 'Aktive Anträge mit einem Score von 0–100: fehlende Profilangaben, Unterlagen, abgelaufene Dokumente und Passgültigkeit. Die schlechtesten zuerst.',
        steps: [
          'Wählen Sie im Mitarbeiterfilter „Meine Anträge“ oder eine Kollegin, bei Bedarf eine Visumart.',
          'Mit „Nur mit Problemen (< 85)“ sehen Sie nur schwache und mittlere Scores.',
          'Lesen Sie je Zeile, was fehlt, und ergänzen Sie es über „Antrag öffnen“.',
        ],
        tips: [
          'Praktisch vor dem Botschaftspaket: Pässe, die in 6 Monaten ablaufen, werden ebenfalls markiert.',
        ],
      },
    },
  },
  {
    route: 'recognition',
    text: {
      az: {
        title: 'Diplomun tanınması',
        purpose: 'Bütün müraciətlər üzrə Anerkennung (ixtisasın Almaniyada tanınması) prosesləri: status, orqan, son tarixlər və sənədlərin hazırlığı.',
        steps: [
          'Yuxarıda «Açıq», «14 gün ərzində» və ya «Hamısı» seçin; «Müddəti keçib» sayına baxın.',
          'Status, prosedur növü və «Orqan» filtrləri ilə siyahını daraldın.',
          'Sətirdən müraciətə keçin və tanınma bölməsində sənədləri, məktubları və son tarixləri yeniləyin.',
        ],
        tips: [
          '«Xatırlatmalar» blokunda son tarixdən neçə gün əvvəl xəbərdarlıq ediləcəyini yalnız Administrator dəyişə bilər.',
        ],
      },
      ru: {
        title: 'Признание дипломов',
        purpose: 'Процедуры Anerkennung (признания квалификации в Германии) по всем заявкам: статус, ведомство, сроки и готовность документов.',
        steps: [
          'Вверху выберите «Открытые», «В течение 14 дней» или «Все»; следите за счётчиком «Просрочено».',
          'Сузьте список фильтрами по статусу, виду процедуры и ведомству.',
          'Из строки перейдите в заявку и обновите документы, письма и сроки в разделе признания.',
        ],
        tips: [
          'В блоке «Напоминания» только Администратор задаёт, за сколько дней до срока приходит напоминание.',
        ],
      },
      en: {
        title: 'Recognition',
        purpose: 'Anerkennung (recognition of the qualification in Germany) procedures across all cases: status, authority, deadlines and document progress.',
        steps: [
          'At the top choose “Open”, “Within 14 days” or “All”; keep an eye on the “Overdue” count.',
          'Narrow the list with the status, procedure type and authority filters.',
          'Go from a row to the case and update documents, letters and deadlines in its recognition section.',
        ],
        tips: [
          'In the “Reminders” block only Administrators set how many days before a deadline the reminder is sent.',
        ],
      },
      de: {
        title: 'Anerkennung',
        purpose: 'Anerkennungsverfahren über alle Anträge: Status, zuständige Stelle, Fristen und Stand der Unterlagen.',
        steps: [
          'Wählen Sie oben „Offen“, „In 14 Tagen“ oder „Alle“; behalten Sie den Zähler „Überfällig“ im Blick.',
          'Grenzen Sie die Liste mit den Filtern Status, Verfahrensart und Stelle ein.',
          'Wechseln Sie aus der Zeile in den Antrag und pflegen Sie dort Unterlagen, Schreiben und Fristen.',
        ],
        tips: [
          'Im Block „Erinnerungen“ legen nur Administratoren fest, wie viele Tage vor einer Frist erinnert wird.',
        ],
      },
    },
  },
  {
    route: 'accelerated',
    text: {
      az: {
        title: '§ 81a prosedurları',
        purpose: 'Ausländerbehörde vasitəsilə sürətləndirilmiş ixtisaslı işçi prosedurları: cari addım, işəgötürən və ən yaxın son tarix.',
        steps: [
          'Yuxarıda «Açıq», «7 gün ərzində» və ya «Hamısı» seçin, lazım olsa statusa görə süzün.',
          '«Müddəti keçib», «7 gün ərzində» və «Rüsum ödənilməyib» saylarına baxın.',
          'Müraciət nömrəsinə basın — müraciət səhifəsinin § 81a bölməsi açılır, addımları orada yeniləyin.',
        ],
        tips: [
          'İlkin razılıqdan sonra səfirlik adətən təxminən 3 həftə ərzində görüş verir — bu son tarixi izləyin.',
        ],
      },
      ru: {
        title: 'Процедуры § 81a',
        purpose: 'Ускоренные процедуры для квалифицированных работников через Ausländerbehörde: текущий шаг, работодатель и ближайший срок.',
        steps: [
          'Вверху выберите «Открытые», «В течение 7 дней» или «Все», при необходимости фильтр по статусу.',
          'Следите за счётчиками «Просрочено», «В течение 7 дней» и «Сбор не оплачен».',
          'Нажмите номер заявки — откроется раздел § 81a на странице заявки, шаги обновляйте там.',
        ],
        tips: [
          'После предварительного согласия посольство обычно назначает запись примерно в течение 3 недель — следите за этим сроком.',
        ],
      },
      en: {
        title: '§ 81a procedures',
        purpose: 'Accelerated skilled-worker procedures via the Ausländerbehörde: current step, employer and the next deadline.',
        steps: [
          'At the top choose “Open”, “Within 7 days” or “All”, and filter by status if needed.',
          'Watch the “Overdue”, “Within 7 days” and “Fee unpaid” counts.',
          'Click the case number to open the § 81a section of the case page and update the steps there.',
        ],
        tips: [
          'After the pre-approval the embassy usually gives an appointment within about 3 weeks — track that deadline.',
        ],
      },
      de: {
        title: '§ 81a-Verfahren',
        purpose: 'Beschleunigte Fachkräfteverfahren über die Ausländerbehörde: aktueller Schritt, Arbeitgeber und nächste Frist.',
        steps: [
          'Wählen Sie oben „Offen“, „In 7 Tagen“ oder „Alle“, bei Bedarf einen Status.',
          'Achten Sie auf die Zähler „Überfällig“, „In 7 Tagen“ und „Gebühr offen“.',
          'Ein Klick auf die Antragsnummer öffnet den § 81a-Bereich der Antragsseite; dort pflegen Sie die Schritte.',
        ],
        tips: [
          'Nach der Vorabzustimmung vergibt die Botschaft meist innerhalb von etwa 3 Wochen einen Termin — diese Frist im Blick behalten.',
        ],
      },
    },
  },
  {
    route: 'authorities/*',
    text: {
      az: {
        title: 'Qurumlar (səfirlik, ABH)',
        purpose: 'Səfirliklər, Ausländerbehörde, Agentur für Arbeit və tanınma orqanlarının kataloqu: ünvan, əlaqə, tələblər, gözləmə müddəti və bağlı müraciətlər.',
        steps: [
          'Siyahını ad, şəhər, ünvan üzrə axtarın, növ, şəhər və status filtrlərindən istifadə edin.',
          'Quruma basın: əlaqə, tələb olunan sənədlər, orta gözləmə müddəti və «Bağlı işlər» görünür.',
          'Admin «Qurum əlavə et» və ya «Redaktə et» ilə məlumatı dəyişir, aşağıda isə sərbəst mətnli müraciətləri «Seçilənləri bağla» ilə quruma bağlayır.',
        ],
        tips: [
          'Kataloqu yalnız admin redaktə edə bilər; əlaqə şəxsləri və daxili qeydlər müştəriyə göstərilmir.',
          'Məlumatları rəsmi saytda yoxlayın.',
        ],
      },
      ru: {
        title: 'Ведомства (посольство, ABH)',
        purpose: 'Каталог посольств, Ausländerbehörde, Agentur für Arbeit и органов признания: адрес, контакты, требования, срок ожидания и связанные дела.',
        steps: [
          'Ищите по названию, городу, адресу; используйте фильтры по типу, городу и статусу.',
          'Откройте ведомство: контакты, обязательные документы, средний срок ожидания и «Связанные дела».',
          'Администратор меняет данные через «Добавить ведомство» или «Изменить», а внизу привязывает дела со свободным текстом кнопкой «Связать выбранные».',
        ],
        tips: [
          'Редактировать каталог могут только администраторы; контактные лица и внутренние заметки клиенту не показываются.',
          'Проверяйте данные на официальном сайте.',
        ],
      },
      en: {
        title: 'Authorities (embassy, ABH)',
        purpose: 'Catalogue of embassies, Ausländerbehörden, the Agentur für Arbeit and recognition bodies: address, contact, requirements, waiting time and linked cases.',
        steps: [
          'Search by name, city or address and use the type, city and status filters.',
          'Open an authority to see contact details, required documents, average waiting time and “Linked cases”.',
          'Admins use “Add authority” or “Edit” to change data, and link free-text cases at the bottom with “Link selected”.',
        ],
        tips: [
          'Only admins can edit the catalogue; contact persons and internal notes are never shown to clients.',
          'Check the details on the official website.',
        ],
      },
      de: {
        title: 'Behörden (Botschaft, ABH)',
        purpose: 'Katalog der Botschaften, Ausländerbehörden, der Agentur für Arbeit und der Anerkennungsstellen: Adresse, Kontakt, Anforderungen, Wartezeit und verknüpfte Fälle.',
        steps: [
          'Suchen Sie nach Name, Stadt oder Adresse und nutzen Sie die Filter Typ, Stadt und Status.',
          'Öffnen Sie eine Behörde: Kontakt, erforderliche Unterlagen, durchschnittliche Wartezeit und „Verknüpfte Fälle“.',
          'Admins ändern Daten mit „Behörde anlegen“ oder „Bearbeiten“ und verknüpfen unten Fälle mit Freitext über „Ausgewählte verknüpfen“.',
        ],
        tips: [
          'Den Katalog können nur Admins bearbeiten; Ansprechpartner und interne Notizen sieht der Kunde nie.',
          'Angaben auf der offiziellen Website prüfen.',
        ],
      },
    },
  },
  {
    route: 'originals',
    text: {
      az: {
        title: 'Orijinal sənədlər',
        purpose: 'Bütün müraciətlər üzrə fiziki orijinallar: ofisdə saxlanılan, təhvil verilən və kuryerdə olanlar, hərəkət tarixçəsi və təhvil aktları ilə.',
        steps: [
          'Siyahını axtarış (müştəri, müraciət, sənəd, izləmə nömrəsi), status, yer və əməkdaş üzrə süzün; «Yalnız gecikənlər» gecikən sənədləri göstərir.',
          'Sətirdə «Hərəkət» seçin (məs. təhvil vermək, kuryerlə göndərmək, müştəriyə qaytarmaq) və ya «Tarixçə»ni açın.',
          'Eyni müraciətin bir neçə sənədini işarələyib birlikdə «Hərəkət» edin.',
        ],
        tips: [
          'Orijinallar müraciət səhifəsindəki «Orijinallar» panelində qəbul edilir.',
          'Silmək yalnız Administrator üçündür. Modul söndürülə bilər.',
        ],
      },
      ru: {
        title: 'Оригиналы документов',
        purpose: 'Физические оригиналы по всем заявкам: в офисе, выданные или у курьера — с историей движений и актами приёма-передачи.',
        steps: [
          'Фильтруйте по поиску (клиент, заявка, документ, трек-номер), статусу, месту и сотруднику; «Только просроченные» покажет задержки.',
          'В строке выберите «Движение» (например, выдать, отправить курьером, вернуть клиенту) или откройте «История».',
          'Отметьте несколько документов одной заявки и проведите «Движение» сразу для всех.',
        ],
        tips: [
          'Оригиналы принимаются в панели «Оригиналы» на странице заявки.',
          'Удалять может только Администратор. Модуль можно отключить.',
        ],
      },
      en: {
        title: 'Original documents',
        purpose: 'Physical originals across all cases: in the office, handed out or with a courier — with movement history and hand-over records.',
        steps: [
          'Filter by search (client, case, document, tracking number), status, location and staff; “Overdue only” shows delays.',
          'In a row choose “Movement” (e.g. give out, send by courier, return to client) or open the “History”.',
          'Tick several documents of the same case and record one “Movement” for all of them.',
        ],
        tips: [
          'Originals are received in the “Originals” panel on the case page.',
          'Only Administrators can delete. The module can be switched off.',
        ],
      },
      de: {
        title: 'Originaldokumente',
        purpose: 'Physische Originale aller Anträge: im Büro, ausgehändigt oder beim Kurier — mit Bewegungsverlauf und Übergabeprotokollen.',
        steps: [
          'Filtern Sie nach Suche (Kunde, Antrag, Dokument, Sendungsnummer), Status, Ort und Mitarbeiter; „Nur überfällige“ zeigt Verzögerungen.',
          'Wählen Sie in der Zeile „Bewegung“ (z. B. aushändigen, per Kurier senden, an Kunden zurückgeben) oder öffnen Sie den „Verlauf“.',
          'Markieren Sie mehrere Dokumente desselben Antrags und erfassen Sie eine „Bewegung“ für alle.',
        ],
        tips: [
          'Originale werden im Bereich „Originale“ auf der Antragsseite entgegengenommen.',
          'Löschen dürfen nur Administratoren. Das Modul lässt sich abschalten.',
        ],
      },
    },
  },
  {
    route: 'signatures',
    text: {
      az: {
        title: 'İmzalar',
        purpose: 'PDF sənədləri bir və ya bir neçə tərəfə (namizəd, işəgötürən, Triad Vision və s.) onlayn imzaya göndərmək və gedişini izləmək üçün.',
        steps: [
          '«Yeni imza tələbi» basın, PDF seçin, tərəfləri və ardıcıllığı əlavə edib göndərin.',
          'Siyahını status düymələri, «Mənim» filtri və axtarışla süzün; sətirə basıb tərəflərin vəziyyətini və audit izini görün.',
          'Gecikən tərəfə xatırlatma göndərin; tamamlananda imzalanmış PDF-i yükləyin. Sizin imzanızı gözləyənlər yuxarıda görünür.',
        ],
        tips: [
          'Tərəflər imzadan əvvəl e-poçtla gələn kodla şəxsiyyətini təsdiqləyir.',
          'Bu, audit izi olan sadə elektron imzadır (eIDAS), ixtisaslı imza deyil.',
          'Əmək müqaviləsi müraciətin müqavilələr panelindən göndərilir; müştəri müqavilələrində işəgötürən imzalayan deyil (köhnə sorğularda işəgötürən tərəfi görünə bilər). İş müqaviləsi artıq göndərilmir.',
        ],
      },
      ru: {
        title: 'Подписи',
        purpose: 'Отправка PDF-документов одной или нескольким сторонам (кандидат, работодатель, Triad Vision и др.) на онлайн-подпись и контроль хода подписания.',
        steps: [
          'Нажмите «Новый запрос на подпись», выберите PDF, добавьте стороны и порядок и отправьте.',
          'Фильтруйте список кнопками статусов, «Мои» и поиском; нажмите строку, чтобы увидеть статус сторон и журнал аудита.',
          'Напомните опаздывающей стороне; после завершения скачайте подписанный PDF. Документы, ждущие вашей подписи, — вверху.',
        ],
        tips: [
          'Перед подписью стороны подтверждают личность кодом из e-mail.',
          'Это простая электронная подпись с журналом аудита (eIDAS), а не квалифицированная.',
          'Əmək müqaviləsi отправляется из блока договоров в заявке; работодатель не подписывает договоры клиента (в старых запросах сторона работодателя может быть видна). İş müqaviləsi больше не отправляется.',
        ],
      },
      en: {
        title: 'Signatures',
        purpose: 'Send PDF documents to one or more parties (candidate, employer, Triad Vision and others) for online signature and follow the progress.',
        steps: [
          'Click “New signature request”, choose the PDF, add the parties and the order, then send.',
          'Filter the list with the status chips, “Mine” and search; click a row to see each party’s state and the audit trail.',
          'Remind a late party; when complete, download the signed PDF. Documents waiting for your own signature are listed at the top.',
        ],
        tips: [
          'Parties confirm their identity with a code sent by email before signing.',
          'This is a simple electronic signature with an audit trail (eIDAS), not a qualified one.',
          'The Əmək müqaviləsi is sent from the case’s contracts panel; the employer is never a signer of client contracts (older requests may still show an employer party). The İş müqaviləsi is no longer sent.',
        ],
      },
      de: {
        title: 'Signaturen',
        purpose: 'PDF-Dokumente an eine oder mehrere Parteien (Kandidat, Arbeitgeber, Triad Vision u. a.) zur Online-Unterschrift senden und den Fortschritt verfolgen.',
        steps: [
          'Klicken Sie „Neue Signaturanfrage“, wählen Sie das PDF, fügen Sie Parteien und Reihenfolge hinzu und senden Sie.',
          'Filtern Sie mit den Status-Chips, „Meine“ und der Suche; ein Klick auf die Zeile zeigt den Stand jeder Partei und das Prüfprotokoll.',
          'Erinnern Sie säumige Parteien; nach Abschluss laden Sie das unterschriebene PDF. Was auf Ihre Unterschrift wartet, steht oben.',
        ],
        tips: [
          'Parteien bestätigen ihre Identität vor der Unterschrift mit einem Code per E-Mail.',
          'Es handelt sich um eine einfache elektronische Signatur mit Prüfprotokoll (eIDAS), keine qualifizierte.',
          'Der Əmək müqaviləsi wird über das Vertragsfeld im Antrag gesendet; der Arbeitgeber unterschreibt keine Kundenverträge (ältere Anfragen können noch eine Arbeitgeber-Partei zeigen). Der İş müqaviləsi wird nicht mehr gesendet.',
        ],
      },
    },
  },
  {
    route: 'signatures/sign/:signerId',
    text: {
      az: {
        title: 'Sənədi imzala',
        purpose: 'İmza tələbində sizin (Triad Vision əməkdaşı kimi) imzanızı gözləyən sənədin imzalanma ekranı.',
        steps: [
          '«Şəxsiyyətinizi təsdiqləyin» bölməsində «Kod göndər» basın və e-poçtdakı kodu daxil edin.',
          'PDF-i açın və imzalamazdan əvvəl sənədi tam oxuyun.',
          '«İmzanız» bölməsində «Çək» və ya «Yaz» seçin, razılıq qutusunu işarələyin və «Sənədi imzala» basın.',
        ],
        tips: [
          'Razı deyilsinizsə «İmtina et» seçin — tələb bağlanır.',
          'Növbə hələ sizdə deyilsə, əvvəlcə digər tərəf imzalamalıdır.',
        ],
      },
      ru: {
        title: 'Подписание документа',
        purpose: 'Экран подписания документа, который в запросе на подпись ждёт вашей подписи (как сотрудника Triad Vision).',
        steps: [
          'В блоке «Подтвердите личность» нажмите «Отправить код» и введите код из e-mail.',
          'Откройте PDF и полностью прочитайте документ перед подписанием.',
          'В блоке «Ваша подпись» выберите «Нарисовать» или «Напечатать», отметьте согласие и нажмите «Подписать документ».',
        ],
        tips: [
          'Если вы не согласны, нажмите «Отказаться» — запрос будет закрыт.',
          'Если ещё не ваша очередь, сначала должна подписать другая сторона.',
        ],
      },
      en: {
        title: 'Sign a document',
        purpose: 'The signing screen for a document in a signature request that waits for your own signature (as Triad Vision staff).',
        steps: [
          'Under “Confirm your identity” click “Send code” and enter the code from the email.',
          'Open the PDF and read the whole document before signing.',
          'Under “Your signature” choose “Draw” or “Type”, tick the consent box and click “Sign document”.',
        ],
        tips: [
          'If you do not agree, click “Decline” — the request is closed.',
          'If it is not your turn yet, another party has to sign first.',
        ],
      },
      de: {
        title: 'Dokument unterschreiben',
        purpose: 'Unterschriftsseite für ein Dokument einer Signaturanfrage, das auf Ihre eigene Unterschrift (als Mitarbeiter von Triad Vision) wartet.',
        steps: [
          'Klicken Sie unter „Bestätigen Sie Ihre Identität“ auf „Code senden“ und geben Sie den Code aus der E-Mail ein.',
          'Öffnen Sie das PDF und lesen Sie das ganze Dokument vor der Unterschrift.',
          'Wählen Sie unter „Ihre Unterschrift“ „Zeichnen“ oder „Tippen“, setzen Sie das Häkchen und klicken Sie „Dokument unterschreiben“.',
        ],
        tips: [
          'Sind Sie nicht einverstanden, klicken Sie „Ablehnen“ — die Anfrage wird geschlossen.',
          'Sind Sie noch nicht an der Reihe, muss zuerst eine andere Partei unterschreiben.',
        ],
      },
    },
  },
  {
    route: 'countersign',
    text: {
      az: {
        title: 'İkinci imza (Triad Vision)',
        purpose: 'Müştərinin imzaladığı xidmət müqavilələri burada Triad Vision-un səlahiyyətli imzaçısının ikinci imzasını gözləyir. Yalnız Administrator və Super admin üçündür.',
        steps: [
          '«İmza gözləyir» tabında müqaviləni tapın və «PDF-ə bax» ilə yoxlayın.',
          '«İmzala» basın, «Əl ilə çək» və ya «Adı yaz» seçin, səlahiyyət təsdiqini işarələyib imzalayın.',
          '«Parametrlər» tabında ikinci imzanı yandırın / söndürün, səlahiyyətli imzaçıları, standart imzaçını və xatırlatma intervalını təyin edin.',
        ],
        tips: [
          'Müraciət müqaviləsi yalnız ikinci imzadan sonra «imzalanıb» sayılır.',
          'Yalnız səlahiyyətli imzaçılar imzalaya bilər.',
          'Əmək müqaviləsində müştəri əvvəl, sonra Triad Vision imzalayır — müraciətin müqavilələr panelində; işəgötürən imzalamır. İş müqaviləsi artıq yoxdur.',
        ],
      },
      ru: {
        title: 'Вторая подпись (Triad Vision)',
        purpose: 'Договоры услуг, подписанные клиентом, ждут здесь второй подписи уполномоченного лица Triad Vision. Только для Администратора и Суперадмина.',
        steps: [
          'Во вкладке «Ожидают» найдите договор и проверьте его через «Открыть PDF».',
          'Нажмите «Подписать», выберите «Нарисовать» или «Ввести имя», подтвердите полномочия и подпишите.',
          'Во вкладке «Настройки» включите / выключите вторую подпись, задайте уполномоченных подписантов, подписанта по умолчанию и интервал напоминаний.',
        ],
        tips: [
          'Договор по делу считается подписанным только после второй подписи.',
          'Подписывать могут только уполномоченные лица.',
          'В Əmək müqaviləsi сначала подписывает клиент, затем Triad Vision — в блоке договоров заявки; работодатель не подписывает. İş müqaviləsi больше нет.',
        ],
      },
      en: {
        title: 'Countersignature (Triad Vision)',
        purpose: 'Service contracts signed by the client wait here for the countersignature of an authorised Triad Vision signatory. Administrators and Super admin only.',
        steps: [
          'On the “Pending” tab find the contract and check it with “View PDF”.',
          'Click “Countersign”, choose “Draw” or “Type name”, confirm your authority and sign.',
          'On the “Settings” tab switch countersignature on or off and set the authorised signatories, the default signer and the reminder interval.',
        ],
        tips: [
          'A case contract counts as signed only after the countersignature.',
          'Only authorised signatories can countersign.',
          'For the Əmək müqaviləsi the client signs first, then Triad Vision — in the case’s contracts panel; the employer does not sign. There is no İş müqaviləsi any more.',
        ],
      },
      de: {
        title: 'Gegenzeichnung (Triad Vision)',
        purpose: 'Vom Kunden unterschriebene Dienstleistungsverträge warten hier auf die Gegenzeichnung durch eine zeichnungsberechtigte Person von Triad Vision. Nur für Administratoren und Super-Admin.',
        steps: [
          'Suchen Sie im Tab „Offen“ den Vertrag und prüfen Sie ihn mit „PDF ansehen“.',
          'Klicken Sie „Gegenzeichnen“, wählen Sie „Zeichnen“ oder „Name tippen“, bestätigen Sie die Berechtigung und unterschreiben Sie.',
          'Im Tab „Einstellungen“ schalten Sie die Gegenzeichnung ein oder aus und legen Zeichnungsberechtigte, Standard-Unterzeichner und Erinnerungsintervall fest.',
        ],
        tips: [
          'Ein Fallvertrag gilt erst nach der Gegenzeichnung als unterschrieben.',
          'Nur zeichnungsberechtigte Personen können gegenzeichnen.',
          'Beim Əmək müqaviləsi unterschreibt zuerst der Kunde, dann Triad Vision – im Vertragsfeld des Antrags; der Arbeitgeber unterschreibt nicht. Den İş müqaviləsi gibt es nicht mehr.',
        ],
      },
    },
  },
  {
    route: 'official-forms',
    text: {
      az: {
        title: 'Rəsmi formlar',
        purpose: 'Doldurulan rəsmi PDF-lər (milli viza ərizəsi, Erklärung zum Beschäftigungsverhältnis və s.): sahələri məlumat mənbələrinə bağlamaq, nümunə işlə yoxlamaq və versiyanı aktivləşdirmək.',
        steps: [
          'İlk dəfə «Standart şablonları quraşdır» basın və ya «PDF yüklə» ilə öz rəsmi PDF-inizi əlavə edin.',
          '«Uyğunluğu redaktə et» ilə hər sahəni məlumat mənbəyinə bağlayın («Avtomatik təklif» kömək edir) və «Uyğunluğu yadda saxla» basın.',
          '«Nümunə işlə yoxla» ilə nəticəni yoxlayın, sonra versiyanı «Aktivləşdir» edin.',
        ],
        tips: [
          'Şablonları yalnız administrator dəyişə bilər; əməkdaşlar formları müraciətin «Sənədlər» tabında istifadə edir.',
        ],
      },
      ru: {
        title: 'Официальные формы',
        purpose: 'Заполняемые официальные PDF (анкета на национальную визу, Erklärung zum Beschäftigungsverhältnis и др.): привязка полей к источникам данных, проверка на примере дела и активация версии.',
        steps: [
          'Впервые нажмите «Установить стандартные шаблоны» или добавьте свой официальный PDF через «Загрузить PDF».',
          'В «Изменить сопоставление» привяжите каждое поле к источнику данных (поможет «Автоподбор») и нажмите «Сохранить сопоставление».',
          'Проверьте результат через «Проверить на примере дела», затем нажмите «Активировать».',
        ],
        tips: [
          'Шаблоны меняет только администратор; сотрудники используют формы во вкладке «Документы» заявки.',
        ],
      },
      en: {
        title: 'Official forms',
        purpose: 'Fillable official PDFs (national visa application, Erklärung zum Beschäftigungsverhältnis and others): map fields to data sources, check with a sample case and activate a version.',
        steps: [
          'The first time, click “Install default templates”, or add your own official PDF with “Upload PDF”.',
          'In “Edit mapping” link each field to a data source (“Auto-suggest” helps) and click “Save mapping”.',
          'Check the result with “Check with a sample case”, then click “Activate”.',
        ],
        tips: [
          'Only administrators change templates; staff use the forms on the case’s “Documents” tab.',
        ],
      },
      de: {
        title: 'Amtliche Formulare',
        purpose: 'Ausfüllbare amtliche PDFs (Antrag auf nationales Visum, Erklärung zum Beschäftigungsverhältnis u. a.): Felder Datenquellen zuordnen, mit einer Beispielakte prüfen, Version aktivieren.',
        steps: [
          'Klicken Sie beim ersten Mal „Standardvorlagen installieren“ oder fügen Sie mit „PDF hochladen“ ein eigenes amtliches PDF hinzu.',
          'Ordnen Sie unter „Zuordnung bearbeiten“ jedes Feld einer Datenquelle zu („Automatisch vorschlagen“ hilft) und klicken Sie „Zuordnung speichern“.',
          'Prüfen Sie das Ergebnis mit „Mit Beispielakte prüfen“ und klicken Sie dann „Aktivieren“.',
        ],
        tips: [
          'Vorlagen ändern nur Administratoren; Mitarbeitende nutzen die Formulare im Tab „Dokumente“ des Antrags.',
        ],
      },
    },
  },
  {
    route: 'case-forms',
    text: {
      az: {
        title: 'Ağıllı anketlər',
        purpose: 'Müştəriyə göndərilən anket şablonlarının konstruktoru: sahələr, şərtlər və cavabların profilə, müraciətə və ya VIDEX-ə yazılması.',
        steps: [
          'Soldan şablonu seçin və ya «Yeni şablon» yaradın; hazır şablonu «Surətini çıxar» ilə kopyalayın.',
          'Sahələr əlavə edin: sual, növ, «Məcburi», kömək mətni, «Göstər, əgər» şərti və «Bağlantı (hara yazılsın)».',
          'Sağdakı «Önizləmə»də anketi müştərinin gördüyü kimi yoxlayın və yadda saxlayın.',
        ],
        tips: [
          'Anketlər müraciətin «Ümumi» tabındakı «Müştəri məlumatları» panelindən göndərilir.',
          'Şablonları yalnız adminlər dəyişə bilər.',
        ],
      },
      ru: {
        title: 'Умные анкеты',
        purpose: 'Конструктор шаблонов анкет для клиентов: поля, условия и запись ответов в профиль, заявку или VIDEX.',
        steps: [
          'Слева выберите шаблон или создайте «Новый шаблон»; готовый шаблон скопируйте через «Дублировать».',
          'Добавьте поля: вопрос, тип, «Обязательно», текст подсказки, условие «Показывать, если» и «Связь (куда записать)».',
          'Проверьте анкету в «Предпросмотре» справа так, как её увидит клиент, и сохраните.',
        ],
        tips: [
          'Анкеты отправляются из панели «Данные клиента» на вкладке «Обзор» заявки.',
          'Изменять шаблоны могут только администраторы.',
        ],
      },
      en: {
        title: 'Smart questionnaires',
        purpose: 'Builder for questionnaire templates sent to clients: fields, conditions and where the answers are written (profile, case or VIDEX).',
        steps: [
          'Pick a template on the left or create a “New template”; copy a built-in one with “Duplicate”.',
          'Add fields: question, type, “Required”, help text, a “Show if” condition and the “Mapping (where to write)”.',
          'Check the questionnaire in the “Preview” as the client will see it, then save.',
        ],
        tips: [
          'Questionnaires are sent from the “Client data” panel on the case’s “Overview” tab.',
          'Only admins can change templates.',
        ],
      },
      de: {
        title: 'Smarte Fragebögen',
        purpose: 'Baukasten für Fragebogen-Vorlagen an Kunden: Felder, Bedingungen und wohin die Antworten geschrieben werden (Profil, Antrag oder VIDEX).',
        steps: [
          'Wählen Sie links eine Vorlage oder erstellen Sie eine „Neue Vorlage“; eine Standardvorlage kopieren Sie mit „Duplizieren“.',
          'Fügen Sie Felder hinzu: Frage, Typ, „Pflicht“, Hilfetext, Bedingung „Anzeigen, wenn“ und „Verknüpfung (wohin schreiben)“.',
          'Prüfen Sie den Fragebogen in der „Vorschau“ so, wie ihn der Kunde sieht, und speichern Sie.',
        ],
        tips: [
          'Fragebögen werden im Bereich „Kundendaten“ im Tab „Übersicht“ des Antrags versendet.',
          'Nur Admins können Vorlagen ändern.',
        ],
      },
    },
  },
  {
    route: 'contract-templates/*',
    text: {
      az: {
        title: 'Müqavilə şablonları',
        purpose: 'Əmək, Ausbildung, xidmət, işəgötürən və tərəfdaş müqavilələri üçün şablonlar. Yer tutucular müraciətin məlumatları ilə avtomatik doldurulur.',
        steps: [
          'Yuxarıdakı növ düymələri ilə siyahını süzün və şablonu açın.',
          '«Yeni şablon» ilə ad, növ, dil və mətni yazın; yer tutucuları «Yer tutucular» siyahısından basaraq əlavə edin.',
          'Lazım olsa «Bu növ və dil üçün standart» işarələyin və «Yadda saxla» basın.',
        ],
        tips: [
          'Əmək müqaviləsi (iş / Ausbildung) müraciətin «Sənədlər» tabındakı müqavilələr panelindən göndərilir: əvvəl müştəri, sonra Triad Vision imzalayır. Alman sənədləri (Arbeitsvertrag və s.) ödənişdən sonra İş axınından göndərilir. İşəgötürən müştəri müqavilələrini imzalamır.',
          'Müraciət səhifəsində «Digər əməliyyatlar» → «Şablondan müqavilə» önizləmə və PDF verir; oradan imzaya yalnız xidmət müqaviləsi göndərilir.',
          'Şablonları yalnız administrator dəyişə bilər; şablonlar hüquqi məsləhət deyil.',
        ],
      },
      ru: {
        title: 'Шаблоны договоров',
        purpose: 'Шаблоны трудовых, учебных (Ausbildung), сервисных договоров, договоров с работодателем и партнёром. Плейсхолдеры заполняются данными заявки.',
        steps: [
          'Отфильтруйте список кнопками видов вверху и откройте шаблон.',
          'Через «Новый шаблон» задайте название, вид, язык и текст; вставляйте плейсхолдеры кликом в списке «Плейсхолдеры».',
          'При необходимости отметьте «По умолчанию для этого вида и языка» и нажмите «Сохранить».',
        ],
        tips: [
          'Əmək müqaviləsi (работа / Ausbildung) отправляется из блока договоров во вкладке «Документы» заявки: сначала подписывает клиент, затем Triad Vision. Немецкие документы (трудовой договор и др.) отправляются после оплаты из рабочего процесса. Работодатель договоры клиента не подписывает.',
          'На странице заявки «Другие действия» → «Договор из шаблона» даёт предпросмотр и PDF; на подпись оттуда отправляется только договор услуг.',
          'Менять шаблоны может только администратор; шаблоны не являются юридической консультацией.',
        ],
      },
      en: {
        title: 'Contract templates',
        purpose: 'Templates for employment, training, service, employer and partner contracts. Placeholders are filled with the case data automatically.',
        steps: [
          'Filter the list with the kind chips at the top and open a template.',
          'With “New template” set the name, kind, language and text; insert placeholders by clicking them in “Placeholders”.',
          'Tick “Default for this kind and language” if needed and click “Save”.',
        ],
        tips: [
          'The Əmək müqaviləsi (work / training) is sent from the contracts panel on the case’s “Documents” tab: the client signs first, then Triad Vision. The German documents (employment contract etc.) go out from the drive workflow after payment. The employer never signs client contracts.',
          'On the case page, “More actions” → “Contract from template” gives a preview and the PDF; only service contracts are sent for signature from there.',
          'Only administrators can change templates; templates are not legal advice.',
        ],
      },
      de: {
        title: 'Vertragsvorlagen',
        purpose: 'Vorlagen für Arbeits-, Ausbildungs-, Dienstleistungs-, Arbeitgeber- und Partnerverträge. Platzhalter werden mit den Antragsdaten gefüllt.',
        steps: [
          'Filtern Sie die Liste oben nach Vertragsart und öffnen Sie eine Vorlage.',
          'Legen Sie mit „Neue Vorlage“ Name, Art, Sprache und Text an; Platzhalter fügen Sie per Klick unter „Platzhalter“ ein.',
          'Setzen Sie bei Bedarf „Standard für diese Art und Sprache“ und klicken Sie „Speichern“.',
        ],
        tips: [
          'Der Əmək müqaviləsi (Arbeit / Ausbildung) wird über das Vertragsfeld im Tab „Dokumente“ des Antrags gesendet: zuerst unterschreibt der Kunde, dann Triad Vision. Die deutschen Unterlagen (Arbeitsvertrag usw.) gehen nach der Zahlung aus dem Arbeitsablauf an den Kunden. Der Arbeitgeber unterschreibt keine Kundenverträge.',
          'Auf der Antragsseite liefert „Weitere Aktionen“ → „Vertrag aus Vorlage“ Vorschau und PDF; zur Signatur wird von dort nur der Dienstleistungsvertrag gesendet.',
          'Vorlagen ändern nur Administratoren; Vorlagen sind keine Rechtsberatung.',
        ],
      },
    },
  },
  {
    route: 'translations/*',
    text: {
      az: {
        title: 'Tərcümə sifarişləri (arxiv)',
        purpose: 'Triad Vision tərcümə və apostil xidməti göstərmir. Bu səhifə yalnız əvvəllər daxil olmuş sifarişlərin arxividir; yeni sifariş verilmir.',
        steps: [
          'Yuxarıdakı kartlarda açıq qalmış köhnə sifarişlərə baxın; axtarış, status, xidmət və icraçı ilə süzün.',
          'İşə başlanmamış köhnə sifarişi «Ləğv et» ilə səbəb yazaraq bağlayın.',
          'Artıq icra olunan sifarişdə hazır faylları yükləyin, «Hazırdır», sonra «Təhvil verildi» basın.',
        ],
        tips: [
          'Müştərilərə apostil və tərcüməni özlərinin etdirdiyini bildirin; yeni sifariş qəbul etməyin.',
          'Modul söndürülə bilər.',
        ],
      },
      ru: {
        title: 'Заказы переводов (архив)',
        purpose: 'Triad Vision не оказывает услуги перевода и апостиля. Эта страница — только архив ранее поступивших заказов; новые заказы не принимаются.',
        steps: [
          'В карточках вверху посмотрите открытые старые заказы; фильтруйте по поиску, статусу, услуге и исполнителю.',
          'Старый заказ, работа по которому не начата, закройте кнопкой «Отменить» с причиной.',
          'Для заказа в работе загрузите готовые файлы, нажмите «Отметить готовым», затем «Отметить доставленным».',
        ],
        tips: [
          'Сообщайте клиентам, что апостиль и перевод они оформляют самостоятельно; новые заказы не принимайте.',
          'Модуль можно отключить.',
        ],
      },
      en: {
        title: 'Translation orders (archive)',
        purpose: 'Triad Vision does not offer translation or apostille services. This page is only the archive of earlier orders; no new orders are taken.',
        steps: [
          'Check the open old orders in the tiles at the top; filter by search, status, service and assignee.',
          'Close an old order that was never started with “Cancel” and a reason.',
          'For an order already in progress, upload the finished files, click “Mark ready”, then “Mark delivered”.',
        ],
        tips: [
          'Tell clients they arrange apostille and translation themselves; do not take new orders.',
          'The module can be switched off.',
        ],
      },
      de: {
        title: 'Übersetzungsaufträge (Archiv)',
        purpose: 'Triad Vision bietet keine Übersetzungen oder Apostillen an. Diese Seite ist nur das Archiv früherer Aufträge; neue Aufträge werden nicht angenommen.',
        steps: [
          'Sehen Sie in den Kacheln oben die noch offenen alten Aufträge; filtern Sie nach Suche, Status, Leistung und Bearbeiter.',
          'Einen nie begonnenen alten Auftrag schließen Sie mit „Stornieren“ und einem Grund.',
          'Bei einem laufenden Auftrag laden Sie die fertigen Dateien hoch, klicken „Als fertig markieren“ und dann „Als zugestellt markieren“.',
        ],
        tips: [
          'Sagen Sie Kunden, dass sie Apostille und Übersetzung selbst veranlassen; keine neuen Aufträge annehmen.',
          'Das Modul lässt sich abschalten.',
        ],
      },
    },
  },
];
