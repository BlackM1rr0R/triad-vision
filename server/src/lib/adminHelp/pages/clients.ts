import type { PageHelpEntry } from '../types.js';

/** Admin page help: clients hub pages (accounts, candidates, register, arrivals, after-arrival and preparation content). */
export const PAGES_CLIENTS: PageHelpEntry[] = [
  {
    route: 'users',
    text: {
      az: {
        title: 'İstifadəçilər',
        purpose: 'Platformadakı bütün hesablar — müştərilər, əməkdaşlar və adminlər. Burada əməkdaş hesabı yaradılır, rol dəyişdirilir, hesab söndürülür və ya silinir.',
        steps: [
          'Ad, soyad və ya e-poçtla axtarın; «Onlayn», rol düymələri və tərəfdaş filtri ilə siyahını daraldın.',
          'Yeni iş yoldaşı üçün «Yeni əməkdaş» basın: ad, soyad, e-poçt, rol və şifrə yazın, istəsəniz korporativ poçt qutusu da yaradın.',
          'Sətirdə rolu seçin, aktivlik açarı ilə hesabı söndürün və ya «Şifrə», «Çıxar», «Sil» düymələrindən istifadə edin; müştəri adına basıb onun kartını açın.',
        ],
        tips: [
          'Dəyişiklikləri və «Bütün müştərilər (Excel)» ixracını yalnız super admin edir; digər əməkdaşlar siyahını görür.',
          'Admin əməkdaş sətrində onun iş profilini (sadə yan menyu) seçə bilər.',
          'Silmək geri qaytarılmır — adətən hesabı söndürmək kifayətdir.',
        ],
      },
      ru: {
        title: 'Пользователи',
        purpose: 'Все аккаунты платформы — клиенты, сотрудники и администраторы. Здесь создают аккаунты сотрудников, меняют роли, отключают и удаляют аккаунты.',
        steps: [
          'Ищите по имени, фамилии или e-mail; сужайте список кнопками «Онлайн», ролями и фильтром партнёра.',
          'Для нового коллеги нажмите «Новый сотрудник»: имя, фамилия, e-mail, роль и пароль, при желании сразу создайте корпоративный почтовый ящик.',
          'В строке выберите роль, отключите аккаунт переключателем активности или используйте «Пароль», «Выйти», «Удалить»; по имени клиента откройте его карточку.',
        ],
        tips: [
          'Изменения и выгрузку «Все клиенты (Excel)» делает только суперадмин; остальные сотрудники видят список.',
          'Администратор может выбрать в строке сотрудника его рабочий профиль (упрощённое боковое меню).',
          'Удаление необратимо — обычно достаточно отключить аккаунт.',
        ],
      },
      en: {
        title: 'Users',
        purpose: 'Every account on the platform — clients, staff and administrators. Use it to create staff accounts, change roles, deactivate or delete accounts.',
        steps: [
          'Search by first name, last name or e-mail; narrow the list with “Online”, the role buttons and the partner filter.',
          'For a new colleague click “New staff member”: first name, last name, e-mail, role and password, optionally creating a company mailbox too.',
          'In a row pick the role, deactivate with the active switch or use “Password”, “Log out” and “Delete”; click a client’s name to open their client page.',
        ],
        tips: [
          'Changes and the “All clients (Excel)” export are for the super admin only; other staff can view the list.',
          'Admins can set a staff member’s work profile (a simpler sidebar) right in their row.',
          'Deleting cannot be undone — deactivating is usually enough.',
        ],
      },
      de: {
        title: 'Benutzer',
        purpose: 'Alle Konten der Plattform — Kunden, Mitarbeiter und Admins. Hier legen Sie Mitarbeiterkonten an, ändern Rollen, deaktivieren oder löschen Konten.',
        steps: [
          'Suchen Sie nach Vorname, Nachname oder E-Mail; grenzen Sie mit „Online“, den Rollen-Buttons und dem Partnerfilter ein.',
          'Für neue Kollegen „Neuer Mitarbeiter“ klicken: Vorname, Nachname, E-Mail, Rolle und Passwort, optional gleich ein Firmenpostfach anlegen.',
          'In der Zeile die Rolle wählen, mit dem Aktiv-Schalter deaktivieren oder „Passwort“, „Abmelden“, „Löschen“ nutzen; Klick auf einen Kundennamen öffnet die Kundenseite.',
        ],
        tips: [
          'Änderungen und der Export „Alle Kunden (Excel)“ sind nur für den Super-Admin; andere Mitarbeiter sehen die Liste.',
          'Admins können in der Zeile eines Mitarbeiters sein Arbeitsprofil (vereinfachtes Seitenmenü) festlegen.',
          'Löschen ist endgültig — meist reicht Deaktivieren.',
        ],
      },
    },
  },
  {
    route: 'clients/:id',
    text: {
      az: {
        title: 'Müştəri (360°)',
        purpose: 'Bir müştəri haqqında hər şey bir səhifədə: əlaqə, məsul əməkdaş, etiketlər, əsas göstəricilər, müraciətlər, ödənişlər və yazışma. Bütün əməkdaşlar istifadə edir.',
        steps: [
          'Yuxarıda əlaqə məlumatlarına, məsul əməkdaşa, razılıqlara və göstəricilərə baxın; zəng və ya WhatsApp düyməsi ilə müştəri ilə əlaqə saxlayın.',
          'Tablardan birini açın: Xronologiya, Müraciətlər, Ödənişlər, Mesajlar, Zənglər, Sənədlər, Tapşırıqlar, Ailə. Xronologiyanı növ və müraciətə görə filtr edin.',
          '«Etiket» ilə etiket əlavə edin və ya silin; müraciət nömrəsinə basıb müraciət səhifəsinə keçin.',
        ],
        tips: [
          'Səhifə «İstifadəçilər» siyahısında müştərinin adına basanda açılır.',
          'Ödənişlər tabındakı bütün hesab-fakturalara keçid yalnız adminlər üçündür.',
        ],
      },
      ru: {
        title: 'Клиент (360°)',
        purpose: 'Всё о клиенте на одной странице: контакты, ответственный, метки, ключевые показатели, заявки, платежи и переписка. Пользуются все сотрудники.',
        steps: [
          'Вверху посмотрите контакты, ответственного, согласия и показатели; свяжитесь с клиентом кнопкой звонка или WhatsApp.',
          'Откройте вкладку: Хронология, Заявки, Платежи, Сообщения, Звонки, Документы, Задачи, Семья. Хронологию можно фильтровать по типу и заявке.',
          'Добавляйте и удаляйте метки кнопкой «Метка»; по номеру заявки переходите на страницу заявки.',
        ],
        tips: [
          'Страница открывается по клику на имя клиента в списке «Пользователи».',
          'Ссылка на все счета во вкладке «Платежи» видна только администраторам.',
        ],
      },
      en: {
        title: 'Client (360°)',
        purpose: 'Everything about one client on one page: contact details, owner, tags, key figures, cases, payments and conversations. Used by all staff.',
        steps: [
          'At the top check contact details, owner, consents and key figures; reach the client with the call or WhatsApp button.',
          'Open a tab: Timeline, Cases, Payments, Messages, Calls, Documents, Tasks, Family. Filter the timeline by type and by case.',
          'Add or remove tags with “Tag”; click a case number to go to the case page.',
        ],
        tips: [
          'You get here by clicking a client’s name in the “Users” list.',
          'The link to all invoices on the Payments tab is shown to admins only.',
        ],
      },
      de: {
        title: 'Kunde (360°)',
        purpose: 'Alles zu einem Kunden auf einer Seite: Kontakt, Zuständige/r, Schlagwörter, Kennzahlen, Anträge, Zahlungen und Kommunikation. Für alle Mitarbeiter.',
        steps: [
          'Oben Kontakt, Zuständige/n, Einwilligungen und Kennzahlen prüfen; den Kunden per Anruf- oder WhatsApp-Button erreichen.',
          'Einen Tab öffnen: Verlauf, Anträge, Zahlungen, Nachrichten, Anrufe, Dokumente, Aufgaben, Familie. Den Verlauf nach Art und Antrag filtern.',
          'Mit „Schlagwort“ Schlagwörter hinzufügen oder entfernen; Klick auf eine Antragsnummer öffnet den Antrag.',
        ],
        tips: [
          'Sie gelangen hierher per Klick auf den Kundennamen in der Liste „Benutzer“.',
          'Der Link zu allen Rechnungen im Tab „Zahlungen“ ist nur für Admins sichtbar.',
        ],
      },
    },
  },
  {
    route: 'candidates',
    text: {
      az: {
        title: 'Namizədlər',
        purpose: 'Almaniyada iş axtaran qeydiyyatlı müştərilər. Burada onları vakansiyalara uyğunlaşdırır və müraciətlərini qısa siyahıdan işəgötürənə təqdimata və qəbula qədər aparırsınız.',
        steps: [
          'Ad, e-poçt, telefon və ya peşə ilə axtarın; alman dili, sürücülük vəsiqəsi, təcrübə və «Aktiv faylı var» / «Aktiv fayl yoxdur» filtrlərindən istifadə edin.',
          '«Vakansiyaya görə sırala…» ilə vakansiyanı seçin — siyahı uyğunluq faizinə görə düzülür; namizədə basıb profilini açın.',
          '«Vakansiyaya əlavə et» ilə müraciət yaradın, statusu irəli aparın, qəbuldan sonra «Viza faylını yarat / bağla» basın.',
        ],
        tips: [
          'Hər status dəyişikliyi namizədə bildiriş göndərir — mesajı diqqətlə yazın.',
          'Daxili qeydi namizəd görmür; bağlı vakansiyaya və aktiv olmayan şirkətə namizəd əlavə etmək olmur.',
        ],
      },
      ru: {
        title: 'Кандидаты',
        purpose: 'Зарегистрированные клиенты, которые ищут работу в Германии. Здесь их подбирают к вакансиям и ведут отклики от шорт-листа до представления работодателю и принятия.',
        steps: [
          'Ищите по имени, e-mail, телефону или профессии; используйте фильтры по немецкому, правам, опыту и «С активным делом» / «Без активного дела».',
          'В «Сортировать по совпадению с вакансией…» выберите вакансию — список упорядочится по проценту совпадения; кликните кандидата, чтобы открыть профиль.',
          'Создайте отклик через «Добавить к вакансии», двигайте статус дальше, после принятия нажмите «Создать / привязать визовое дело».',
        ],
        tips: [
          'Каждая смена статуса уведомляет кандидата — пишите сообщение внимательно.',
          'Внутреннюю заметку кандидат не видит; к закрытой вакансии или неактивной компании добавить кандидата нельзя.',
        ],
      },
      en: {
        title: 'Candidates',
        purpose: 'Registered clients looking for work in Germany. Here you match them to vacancies and move their applications from shortlist to presentation to the employer and acceptance.',
        steps: [
          'Search by name, e-mail, phone or profession; use the filters for German, driving licence, experience and “With active case” / “No active case”.',
          'Pick a vacancy in “Rank by match for vacancy…” to sort by match percentage; click a candidate to open the profile.',
          'Create an application with “Add to vacancy”, move its status forward and after acceptance click “Create / link visa case”.',
        ],
        tips: [
          'Every status change notifies the candidate — write the message carefully.',
          'The internal note is not visible to the candidate; closed vacancies and inactive companies cannot receive candidates.',
        ],
      },
      de: {
        title: 'Kandidaten',
        purpose: 'Registrierte Kunden, die Arbeit in Deutschland suchen. Hier ordnen Sie sie Stellen zu und führen Bewerbungen von der Vorauswahl über die Vorstellung beim Arbeitgeber bis zur Zusage.',
        steps: [
          'Nach Name, E-Mail, Telefon oder Beruf suchen; Filter für Deutsch, Führerschein, Erfahrung und „Mit aktivem Verfahren“ / „Ohne aktives Verfahren“ nutzen.',
          'In „Nach Passung für Stelle sortieren…“ eine Stelle wählen — die Liste wird nach Passung sortiert; Kandidat anklicken, um das Profil zu öffnen.',
          'Mit „Zur Stelle hinzufügen“ eine Bewerbung anlegen, den Status weiterführen und nach der Zusage „Visumverfahren anlegen / verknüpfen“ klicken.',
        ],
        tips: [
          'Jede Statusänderung benachrichtigt den Kandidaten — Nachricht sorgfältig schreiben.',
          'Die interne Notiz sieht der Kandidat nicht; geschlossene Stellen und inaktive Firmen nehmen keine Kandidaten an.',
        ],
      },
    },
  },
  {
    route: 'skill-videos',
    text: {
      az: {
        title: 'Bacarıq videoları',
        purpose: 'Namizədlərin bacarıq videolarının yoxlama növbəsi: işəgötürənlər görməzdən əvvəl hər videonu əməkdaş təsdiqləyir və ya rədd edir.',
        steps: [
          'Filtr seçin: «Yoxlanılır» (köhnələr əvvəldə), «Təsdiqlənib», «Qəbul edilmədi» və ya «Hamısı».',
          'Videoya baxın, namizədin razılığını və «İşəgötürən baxışları» sayını yoxlayın.',
          '«Təsdiqlə» basın və ya «Rədd et» ilə səbəb yazın — səbəb namizədə göndərilir.',
        ],
        tips: [
          'Namizəd razılıq verməyibsə, video təsdiqdən sonra da işəgötürənə görünmür.',
          'Başqa şəxsin üzü və ya şəxsi məlumat görünən videoları rədd edin və yenidən çəkməyi xahiş edin.',
        ],
      },
      ru: {
        title: 'Видео навыков',
        purpose: 'Очередь проверки видео навыков кандидатов: каждое видео сотрудник одобряет или отклоняет до того, как его увидят работодатели.',
        steps: [
          'Выберите фильтр: «На проверке» (старые сначала), «Одобрено», «Не принято» или «Все».',
          'Посмотрите видео, проверьте согласие кандидата и число просмотров работодателями.',
          'Нажмите «Одобрить» или «Отклонить» с причиной — причина уходит кандидату.',
        ],
        tips: [
          'Без согласия кандидата видео не видно работодателям даже после одобрения.',
          'Отклоняйте видео, где видно чужое лицо или личные данные, и просите записать заново.',
        ],
      },
      en: {
        title: 'Skill videos',
        purpose: 'Review queue of the candidates’ skill videos: staff approve or reject each video before employers can see it.',
        steps: [
          'Pick a filter: “Being checked” (oldest first), “Approved”, “Not accepted” or “All”.',
          'Watch the video and check the candidate’s consent and the employer views.',
          'Click “Approve”, or “Reject” with a reason — the reason is sent to the candidate.',
        ],
        tips: [
          'Without the candidate’s consent the video stays hidden from employers even when approved.',
          'Reject videos showing someone else’s face or personal data and ask for a new recording.',
        ],
      },
      de: {
        title: 'Kompetenzvideos',
        purpose: 'Prüfwarteschlange für die Kompetenzvideos der Kandidaten: Mitarbeiter geben jedes Video frei oder lehnen es ab, bevor Arbeitgeber es sehen.',
        steps: [
          'Filter wählen: „In Prüfung“ (älteste zuerst), „Freigegeben“, „Nicht angenommen“ oder „Alle“.',
          'Video ansehen, Einwilligung des Kandidaten und Aufrufe durch Arbeitgeber prüfen.',
          '„Freigeben“ klicken oder „Ablehnen“ mit Grund — der Grund geht an die Person.',
        ],
        tips: [
          'Ohne Einwilligung bleibt das Video auch nach Freigabe für Arbeitgeber unsichtbar.',
          'Videos mit fremden Gesichtern oder persönlichen Daten ablehnen und um eine neue Aufnahme bitten.',
        ],
      },
    },
  },
  {
    route: 'register',
    text: {
      az: {
        title: 'Müştəri reyestri',
        purpose: 'Bütün müraciətlər Excel kimi bir cədvəldə: müştəri məlumatları, müraciətin sahələri və əlavə sütunlar. Kütləvi baxış və sürətli redaktə üçündür.',
        steps: [
          'Ad, nömrə, pasport və ya telefonla axtarın; ailə üzvləri əsas müraciətin altında göstərilir.',
          'Xanaları birbaşa redaktə edin — dəyişikliklər «Yadda saxla» basılana qədər rənglənir, qırmızı xanalar xətanı göstərir.',
          'Cədvəli «Excel-ə çıxar» ilə endirin; nömrəyə basıb «Müraciəti aç».',
        ],
        tips: [
          '«Sütunlar» ilə əlavə sütun yaratmaq, sıralamaq və silmək yalnız admin üçündür.',
          '«Yenilə» və səhifədən çıxmaq saxlanılmamış dəyişiklikləri itirir — əvvəl yadda saxlayın.',
          'Ən çox ilk 5000 sətir göstərilir.',
        ],
      },
      ru: {
        title: 'Реестр клиентов',
        purpose: 'Все заявки в одной таблице в стиле Excel: данные клиента, поля заявки и дополнительные столбцы. Для общего обзора и быстрого редактирования.',
        steps: [
          'Ищите по имени, номеру, паспорту или телефону; члены семьи показаны под основной заявкой.',
          'Редактируйте ячейки прямо в таблице — изменения подсвечены до нажатия «Сохранить», красные ячейки означают ошибку.',
          'Скачайте таблицу через «Выгрузить в Excel»; по номеру нажмите «Открыть заявку».',
        ],
        tips: [
          'Создавать, упорядочивать и удалять дополнительные столбцы через «Столбцы» могут только администраторы.',
          '«Обновить» и уход со страницы теряют несохранённые изменения — сначала сохраните.',
          'Показываются максимум первые 5000 строк.',
        ],
      },
      en: {
        title: 'Client register',
        purpose: 'Every application in one Excel-like table: client data, case fields and extra columns. For an overview and quick bulk edits.',
        steps: [
          'Search by name, number, passport or phone; family members appear under the main application.',
          'Edit cells directly — changes stay highlighted until you click “Save”; red cells show an error.',
          'Download the table with “Export to Excel”; use the number to “Open application”.',
        ],
        tips: [
          'Adding, reordering and deleting extra columns via “Columns” is for admins only.',
          '“Refresh” and leaving the page drop unsaved changes — save first.',
          'At most the first 5000 rows are shown.',
        ],
      },
      de: {
        title: 'Kundenregister',
        purpose: 'Alle Anträge in einer Excel-ähnlichen Tabelle: Kundendaten, Antragsfelder und Zusatzspalten. Für den Überblick und schnelle Massenänderungen.',
        steps: [
          'Nach Name, Nummer, Pass oder Telefon suchen; Familienmitglieder stehen unter dem Hauptantrag.',
          'Zellen direkt bearbeiten — Änderungen bleiben markiert, bis Sie „Speichern“ klicken; rote Zellen zeigen einen Fehler.',
          'Tabelle mit „Nach Excel exportieren“ herunterladen; über die Nummer „Antrag öffnen“.',
        ],
        tips: [
          'Zusatzspalten über „Spalten“ anlegen, sortieren und löschen dürfen nur Admins.',
          '„Aktualisieren“ und Verlassen der Seite verwerfen ungespeicherte Änderungen — vorher speichern.',
          'Es werden höchstens die ersten 5000 Zeilen angezeigt.',
        ],
      },
    },
  },
  {
    route: 'duplicates',
    text: {
      az: {
        title: 'Dublikatlar',
        purpose: 'Eyni şəxsə aid ola biləcək müştəri hesablarının cütləri. Müqayisə edib əsas hesabı seçir və birləşdirirsiniz. Yalnız adminlər üçündür.',
        steps: [
          '«Açıq», «Dublikat deyil», «Birləşdirilib» filtrlərindən və axtarışdan istifadə edin; yeni cütlər üçün «İndi yoxla» basın.',
          '«Müqayisə et və birləşdir» ilə sahələri tutuşdurun və saxlanacaq hesabda «Əsas et» seçin.',
          'Seçimləri (faylların köçürülməsi, müştəriyə e-poçt) yoxlayıb «Birləşdir» basın; səhv cüt üçün «Dublikat deyil», sonra lazım olsa «Yenidən aç».',
        ],
        tips: [
          'Birləşdirməni geri qaytarmaq olmur — əvvəl hər iki hesabı diqqətlə yoxlayın.',
          '«Kim birləşdirə bilər» parametrini yalnız super admin dəyişir.',
        ],
      },
      ru: {
        title: 'Дубликаты',
        purpose: 'Пары аккаунтов клиентов, которые могут принадлежать одному человеку. Их сравнивают, выбирают основной аккаунт и объединяют. Только для администраторов.',
        steps: [
          'Используйте фильтры «Открытые», «Не дубликат», «Объединены» и поиск; для поиска новых пар нажмите «Проверить сейчас».',
          'В «Сравнить и объединить» сравните поля и отметьте сохраняемый аккаунт кнопкой «Сделать основным».',
          'Проверьте опции (перенос файлов, письмо клиенту) и нажмите «Объединить»; ошибочную пару отметьте «Не дубликат», при необходимости — «Открыть снова».',
        ],
        tips: [
          'Отменить объединение нельзя — сначала внимательно проверьте оба аккаунта.',
          'Настройку «Кто может объединять» меняет только суперадмин.',
        ],
      },
      en: {
        title: 'Duplicates',
        purpose: 'Pairs of client accounts that may belong to the same person. You compare them, choose the primary account and merge. Admins only.',
        steps: [
          'Use the “Open”, “Not a duplicate” and “Merged” filters and the search; click “Scan now” to look for new pairs.',
          'In “Compare and merge” compare the fields and mark the account to keep with “Make primary”.',
          'Check the options (moving files, e-mail to the client) and click “Merge”; mark a wrong pair as “Not a duplicate” and “Reopen” it if needed.',
        ],
        tips: [
          'There is no unmerge — check both accounts carefully first.',
          'Only the super admin can change the “Who may merge” setting.',
        ],
      },
      de: {
        title: 'Dubletten',
        purpose: 'Paare von Kundenkonten, die zur selben Person gehören könnten. Sie vergleichen sie, wählen das Hauptkonto und führen sie zusammen. Nur für Admins.',
        steps: [
          'Filter „Offen“, „Keine Dublette“, „Zusammengeführt“ und die Suche nutzen; „Jetzt prüfen“ sucht neue Paare.',
          'In „Vergleichen und zusammenführen“ die Felder vergleichen und das zu behaltende Konto „Als Hauptkonto“ markieren.',
          'Optionen (Dateien verschieben, E-Mail an den Kunden) prüfen und „Zusammenführen“ klicken; falsche Paare als „Keine Dublette“ markieren, bei Bedarf „Wieder öffnen“.',
        ],
        tips: [
          'Zusammenführen lässt sich nicht rückgängig machen — beide Konten vorher genau prüfen.',
          'Die Einstellung „Wer darf zusammenführen“ ändert nur der Super-Admin.',
        ],
      },
    },
  },
  {
    route: 'check-ins',
    text: {
      az: {
        title: 'Gəlişdən sonra',
        purpose: 'Almaniyaya gəlmiş işçilərə və işəgötürənə 1 / 3 / 6 ay sonra qısa sorğular: problemlər, işdən çıxma riski və işdə qalma göstəricisi.',
        steps: [
          'Yuxarıdakı göstəricilərə, «Mərhələlər üzrə», «Problemlər mövzu üzrə» və «İşdə qalma» bloklarına baxın.',
          '«İşçilər» siyahısını «Açıq problem», «Cavabsız», «İşləyir», «İşdən çıxıb» və risk filtri ilə daraldın, riskə görə sıralayın.',
          'Problemi həll edəndə «Həll olundu» basın; işçi işdən çıxıbsa «İşdən çıxıb» ilə tarix və səbəbi qeyd edin («Geri al» ilə ləğv olunur).',
        ],
        tips: [
          'Yoxlamalar gəliş planı «Gəldi» statusuna keçəndə avtomatik başlayır.',
          '«Vaxtı çatanları indi göndər» və «Parametrlər» (göndərmə günləri, işəgötürən sorğusu) yalnız adminlər üçündür.',
          'Bu modulu super admin söndürə bilər.',
        ],
      },
      ru: {
        title: 'После приезда',
        purpose: 'Короткие опросы работников и работодателя через 1 / 3 / 6 месяцев после приезда в Германию: проблемы, риск ухода и показатель удержания.',
        steps: [
          'Посмотрите показатели вверху и блоки по этапам, по темам проблем и удержания.',
          'Сузьте список работников фильтрами «Открытая проблема», «Без ответа», «Работают», «Уволились» и фильтром риска, отсортируйте по риску.',
          'Решив проблему, нажмите «Решено»; если работник ушёл, отметьте уход с датой и причиной (кнопка «Отменить» вернёт назад).',
        ],
        tips: [
          'Опросы стартуют автоматически, когда план приезда переходит в статус «Прибыл».',
          '«Отправить положенные сейчас» и «Настройки» (дни отправки, опрос работодателя) доступны только администраторам.',
          'Модуль может отключить суперадмин.',
        ],
      },
      en: {
        title: 'After arrival',
        purpose: 'Short check-ins with workers and their employer 1 / 3 / 6 months after arriving in Germany: problems, churn risk and retention.',
        steps: [
          'Review the key figures at the top and the blocks by stage, problems by topic and retention.',
          'Narrow the workers list with “Open problem”, “No answer”, “Employed”, “Left the job” and the risk filter; sort by risk.',
          'Click “Resolved” once a problem is handled; if a worker left, record it with date and reason (“Undo” reverts it).',
        ],
        tips: [
          'Check-ins start automatically when an arrival plan is marked as arrived.',
          '“Send what is due now” and “Settings” (send days, employer check-in) are for admins only.',
          'A super admin can switch this module off.',
        ],
      },
      de: {
        title: 'Nach der Ankunft',
        purpose: 'Kurze Check-ins mit Arbeitnehmern und Arbeitgeber 1 / 3 / 6 Monate nach der Ankunft in Deutschland: Probleme, Abwanderungsrisiko und Verbleib.',
        steps: [
          'Kennzahlen oben sowie die Blöcke nach Stufe, Problemen nach Thema und Verbleib ansehen.',
          'Die Arbeitnehmerliste mit „Offenes Problem“, „Ohne Antwort“, „Beschäftigt“, „Ausgeschieden“ und dem Risikofilter eingrenzen, nach Risiko sortieren.',
          'Gelöste Probleme mit „Erledigt“ schließen; ist jemand ausgeschieden, Datum und Grund erfassen („Rückgängig“ macht es rückgängig).',
        ],
        tips: [
          'Check-ins starten automatisch, sobald ein Ankunftsplan als angekommen abgeschlossen wird.',
          '„Fällige jetzt senden“ und „Einstellungen“ (Versandtage, Arbeitgeber-Check-in) sind nur für Admins.',
          'Der Super-Admin kann dieses Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'arrivals/*',
    text: {
      az: {
        title: 'Gəliş planları',
        purpose: 'Müştərilərin Almaniyaya gəlişi: reys, hava limanında qarşılanma və ilk yaşayış yeri. Müştəri planı öz kabinetində doldurur, komanda burada cavablandırır.',
        steps: [
          'Yuxarıdakı kartlara baxın (Yeni, Təsdiqlənib, Növbəti 14 gün, Qarşılanma gözləyir, Yaşayış axtarılır); axtarış və status filtrindən istifadə edin.',
          'Sətrə basıb planı açın: reys, sərnişinlər, müştərinin istəkləri; məsul əməkdaşı, qarşılanma və yaşayış məlumatlarını doldurub «Yadda saxla» basın.',
          'Plan hazırdırsa «Təsdiqlə», müştəri gələndə isə «Gəldi (tamamla)» basın.',
        ],
        tips: [
          '«Gəldi» statusu gəlişdən sonrakı yoxlamaları avtomatik başladır.',
          'Daxili qeydi müştəri görmür; müraciətə plandakı keçidlə keçə bilərsiniz.',
        ],
      },
      ru: {
        title: 'Приезды',
        purpose: 'Приезд клиентов в Германию: рейс, встреча в аэропорту и первое жильё. Клиент заполняет план в своём кабинете, команда отвечает здесь.',
        steps: [
          'Посмотрите карточки вверху (Новые, Подтверждены, Ближайшие 14 дней, Встреча не подтверждена, поиск жилья); используйте поиск и фильтр статуса.',
          'Кликните строку, чтобы открыть план: рейс, путешественники, пожелания клиента; заполните ответственного, данные встречи и жилья и нажмите «Сохранить».',
          'Когда всё готово — «Подтвердить», после приезда клиента — «Прибыл (завершить)».',
        ],
        tips: [
          'Статус «Прибыл» автоматически запускает опросы после приезда.',
          'Внутреннюю заметку клиент не видит; к заявке можно перейти по ссылке в плане.',
        ],
      },
      en: {
        title: 'Arrivals',
        purpose: 'Clients arriving in Germany: flight, airport pickup and first accommodation. The client fills in the plan in their account; the team answers here.',
        steps: [
          'Check the tiles at the top (New, Confirmed, Next 14 days, Pickup open, Housing searched); use the search and the status filter.',
          'Click a row to open the plan: flight, travellers, the client’s wishes; fill in who handles it, pickup and housing details and click “Save”.',
          'When everything is set click “Confirm”; once the client has landed click “Arrived (complete)”.',
        ],
        tips: [
          'Completing a plan as arrived starts the after-arrival check-ins automatically.',
          'The internal note is hidden from the client; the plan links to the case.',
        ],
      },
      de: {
        title: 'Anreisen',
        purpose: 'Ankunft der Kunden in Deutschland: Flug, Abholung am Flughafen und erste Unterkunft. Der Kunde füllt den Plan in seinem Konto aus, das Team antwortet hier.',
        steps: [
          'Kacheln oben prüfen (Neu, Bestätigt, Nächste 14 Tage, Abholung offen, Unterkunft gesucht); Suche und Statusfilter nutzen.',
          'Zeile anklicken, um den Plan zu öffnen: Flug, Reisende, Wünsche des Kunden; Zuständige/n, Abholung und Unterkunft eintragen und „Speichern“ klicken.',
          'Wenn alles steht „Bestätigen“, nach der Landung „Angekommen (abschließen)“ klicken.',
        ],
        tips: [
          'Der Abschluss als angekommen startet automatisch die Check-ins nach der Ankunft.',
          'Die interne Notiz sieht der Kunde nicht; der Plan verlinkt auf den Antrag.',
        ],
      },
    },
  },
  {
    route: 'family-reunion',
    text: {
      az: {
        title: 'Ailənin birləşməsi',
        purpose: 'Ailə üzvləri sonra gələcək ailələr: əsas işçinin vəziyyəti, ailə üçün şərtlərin hazırlığı və növbəti addım.',
        steps: [
          'Kartlara və filtrlərə baxın: «İşçi gözlənilir», «Başlamağa hazır», «Davam edir».',
          'Hər sətirdə əsas müraciəti, sonra gələcək üzvləri, çatışmayan şərtləri, növbəti addımı və açıq sənədlərin sayını görün.',
          'Müraciət nömrəsinə basıb müraciətin ailə blokunu açın və ailənin sənədləri ilə işə başlayın.',
        ],
        tips: [
          '«Başlamağa hazır» ailələr diqqət tələb edir — sənədlərin hazırlanmasına başlamaq vaxtıdır.',
          'Sənədləri biz hazırlayırıq; ailə səfirliyə özü müraciət edir.',
          'İlk 150 ailə göstərilir.',
        ],
      },
      ru: {
        title: 'Воссоединение семьи',
        purpose: 'Семьи, члены которых приедут позже: статус основного работника, готовность условий для семьи и следующий шаг.',
        steps: [
          'Посмотрите карточки и фильтры: «Ждём работника», «Готовы к старту», «В процессе».',
          'В каждой строке видны основная заявка, члены семьи, которые приедут позже, недостающие условия, следующий шаг и число открытых документов.',
          'Кликните номер заявки, чтобы открыть семейный блок заявки и начать работу с документами семьи.',
        ],
        tips: [
          'Семьи «Готовы к старту» требуют внимания — пора начинать подготовку документов.',
          'Документы готовим мы; в посольство семья обращается сама.',
          'Показаны первые 150 семей.',
        ],
      },
      en: {
        title: 'Family reunion',
        purpose: 'Families with members joining later: where the main worker stands, whether the requirements for the family are met, and the next step.',
        steps: [
          'Check the tiles and the filters “Waiting for the worker”, “Ready to start” and “In progress”.',
          'Each row shows the main case, the members joining later, missing requirements, the next step and the number of open documents.',
          'Click the case number to open the family block of the case and start on the family’s documents.',
        ],
        tips: [
          'Families that are “Ready to start” need attention — it is time to prepare their documents.',
          'We prepare the documents; the family applies to the embassy itself.',
          'The first 150 families are shown.',
        ],
      },
      de: {
        title: 'Familiennachzug',
        purpose: 'Familien mit nachziehenden Angehörigen: Stand der Bezugsperson, Voraussetzungen für den Nachzug und nächster Schritt.',
        steps: [
          'Kacheln und Filter „Warten auf Bezugsperson“, „Startbereit“ und „Läuft“ ansehen.',
          'Jede Zeile zeigt den Hauptantrag, die später nachziehenden Angehörigen, fehlende Voraussetzungen, den nächsten Schritt und offene Unterlagen.',
          'Antragsnummer anklicken, um den Familienbereich des Antrags zu öffnen und mit den Unterlagen der Familie zu beginnen.',
        ],
        tips: [
          '„Startbereite“ Familien brauchen Aufmerksamkeit — jetzt die Unterlagen vorbereiten.',
          'Wir bereiten die Unterlagen vor; den Antrag bei der Botschaft stellt die Familie selbst.',
          'Es werden die ersten 150 Familien angezeigt.',
        ],
      },
    },
  },
  {
    route: 'partner-housing',
    text: {
      az: {
        title: 'Tərəfdaş mənzillər',
        purpose: 'Etibarlı ev sahibləri və işçi mənzilləri, həmçinin müştərilərin Anmeldung (ünvan qeydiyyatı) müddətləri. Müştərilər yalnız uyğun şəhər/işəgötürən üzrə mənzilləri görür.',
        steps: [
          '«Mənzillər» tabında axtarın; admin «Yeni mənzil» ilə şəhər, işəgötürən, qiymət, foto və əlaqəni əlavə edir.',
          'Mənzildə «Təkliflər» siyahısına baxın; müştəriyə mənzili müraciət səhifəsindəki «Mənzil & Anmeldung» kartından təklif edin və tanışlıqdan sonra «Tanış edildi» qeyd edin.',
          '«Anmeldung müddətləri» tabında köçmə tarixi, görüş və qalan günləri izləyin, gecikənlərə diqqət edin.',
        ],
        tips: [
          'Əlaqə və ünvan müştəriyə yalnız «Tanış edildi»dən sonra göstərilir.',
          'Əməkdaşlar mənzilləri görür və təklif edir; redaktə yalnız admin üçündür.',
        ],
      },
      ru: {
        title: 'Арендодатели-партнёры',
        purpose: 'Проверенные арендодатели и жильё для работников, а также сроки Anmeldung (регистрации по адресу) клиентов. Клиенты видят только подходящее по городу / работодателю.',
        steps: [
          'Во вкладке «Жильё» ищите объекты; администратор добавляет «Новое жильё» с городом, работодателем, ценой, фото и контактом.',
          'Смотрите «Предложения» по объекту; предлагайте жильё клиенту в карточке «Жильё и Anmeldung» на странице заявки и после знакомства отметьте «Познакомили».',
          'Во вкладке «Сроки Anmeldung» следите за датой заезда, записью и оставшимися днями, особенно за просроченными.',
        ],
        tips: [
          'Контакт и адрес клиент видит только после «Познакомили».',
          'Сотрудники просматривают и предлагают жильё; редактирование — только для администраторов.',
        ],
      },
      en: {
        title: 'Partner landlords',
        purpose: 'Trusted landlords and worker accommodation, plus the clients’ Anmeldung (address registration) deadlines. Clients only see listings matching their city / employer.',
        steps: [
          'Search the “Listings” tab; admins add a “New listing” with city, employer, price, photos and contact.',
          'Check a listing’s “Proposals”; propose a listing to a client from the housing card on the case page and mark “Introduced” once you have connected them.',
          'On the “Anmeldung deadlines” tab follow move-in date, appointment and days left, especially overdue ones.',
        ],
        tips: [
          'Clients see contact and address only after “Introduced”.',
          'Staff can view and propose listings; editing is for admins.',
        ],
      },
      de: {
        title: 'Partnerunterkünfte',
        purpose: 'Geprüfte Vermieter und Mitarbeiterunterkünfte sowie die Anmeldefristen der Kunden. Kunden sehen nur Angebote passend zu Stadt / Arbeitgeber.',
        steps: [
          'Im Tab „Unterkünfte“ suchen; Admins legen mit „Neue Unterkunft“ Stadt, Arbeitgeber, Preis, Fotos und Kontakt an.',
          '„Vorschläge“ einer Unterkunft ansehen; Unterkünfte über die Wohnungskarte auf der Antragsseite vorschlagen und nach dem Kontakt „Vorgestellt“ markieren.',
          'Im Tab „Anmeldefristen“ Einzugsdatum, Termin und Resttage verfolgen, vor allem überfällige.',
        ],
        tips: [
          'Kontakt und Adresse sehen Kunden erst nach „Vorgestellt“.',
          'Mitarbeiter können ansehen und vorschlagen; bearbeiten können nur Admins.',
        ],
      },
    },
  },
  {
    route: 'journey',
    text: {
      az: {
        title: 'Müştəri yolu',
        purpose: 'Müştərinin kabinetində gördüyü əlavə məlumat: addımların gözlənilən müddəti, Almaniyada ilk addımlar, alman dili test sualları və dil kursları.',
        steps: [
          '«Proqnoz» tabında viza növü üzrə hər addım üçün «Min» və «Max» gün yazıb yadda saxlayın.',
          '«İlk addımlar» tabında gəlişdən sonra görüləcək işləri, «Test sualları» tabında səviyyəyə görə sualları əlavə edin.',
          '«Kurslar» tabında dil kurslarını (ad, təşkilatçı, şəhər, səviyyə, format) əlavə edin və sıralayın.',
        ],
        tips: [
          'Hamı baxa bilər, dəyişiklik yalnız adminlər üçündür.',
          'Müştərilər yalnız dərc edilmiş elementləri görür — müvəqqəti gizlətmək üçün qaralamaya keçirin.',
          'Bu modulu super admin söndürə bilər.',
        ],
      },
      ru: {
        title: 'Путь клиента',
        purpose: 'Дополнительная информация в кабинете клиента: ожидаемая длительность шагов, первые шаги в Германии, тестовые вопросы по немецкому и языковые курсы.',
        steps: [
          'Во вкладке «Прогноз» для типа визы укажите «Min» и «Max» дней по каждому шагу и сохраните.',
          'Во вкладке «Первые шаги» добавьте дела после приезда, во вкладке «Вопросы теста» — вопросы по уровням.',
          'Во вкладке «Курсы» добавьте языковые курсы (название, организатор, город, уровни, формат) и упорядочьте их.',
        ],
        tips: [
          'Смотреть могут все, менять — только администраторы.',
          'Клиенты видят только опубликованное — чтобы временно скрыть, переведите в черновик.',
          'Модуль может отключить суперадмин.',
        ],
      },
      en: {
        title: 'Client journey',
        purpose: 'Extra information clients see in their account: expected duration of the steps, first steps in Germany, German test questions and language courses.',
        steps: [
          'On the “Forecast” tab enter “Min” and “Max” days per step for a visa type and save.',
          'Add after-arrival tasks on “First steps” and questions per level on “Test questions”.',
          'On “Courses” add language courses (name, provider, city, levels, format) and order them.',
        ],
        tips: [
          'Everyone can view; only admins can change things.',
          'Clients only see published items — set an item to draft to hide it temporarily.',
          'A super admin can switch this module off.',
        ],
      },
      de: {
        title: 'Kundenreise',
        purpose: 'Zusatzinformationen im Kundenkonto: erwartete Dauer der Schritte, erste Schritte in Deutschland, Deutsch-Testfragen und Sprachkurse.',
        steps: [
          'Im Tab „Prognose“ pro Visumart für jeden Schritt „Min“ und „Max“ Tage eintragen und speichern.',
          'Unter „Erste Schritte“ Aufgaben nach der Ankunft, unter „Testfragen“ Fragen je Niveau anlegen.',
          'Unter „Kurse“ Sprachkurse (Name, Anbieter, Stadt, Niveaus, Format) anlegen und sortieren.',
        ],
        tips: [
          'Ansehen dürfen alle, ändern nur Admins.',
          'Kunden sehen nur Veröffentlichtes — zum vorübergehenden Ausblenden auf Entwurf setzen.',
          'Der Super-Admin kann dieses Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'exam-dates',
    text: {
      az: {
        title: 'İmtahan tarixləri',
        purpose: 'Bakıdakı yaxın Goethe, telc, ÖSD və TestDaF imtahanlarının siyahısı — namizədlər öz alman dili imtahanları üçün bu tarixlərdən seçir.',
        steps: [
          '«Tarix əlavə et» basın: imtahan, səviyyə, şəhər, yer, tarix və saat, qeydiyyatın son günü və link.',
          'Namizədlərə göstərmək üçün «Müştərilərə göstər» işarəsini qoyun; işarəsiz tarix «Gizli» qalır.',
          'Siyahıda hər tarixi neçə namizədin seçdiyini görün; lazım olsa redaktə edin və ya silin.',
        ],
        tips: [
          'Tarixləri yalnız adminlər dəyişə bilər.',
          'Tarix silinsə də, onu seçmiş namizədlərin imtahan məlumatları saxlanılır.',
          'Bu modulu super admin söndürə bilər.',
        ],
      },
      ru: {
        title: 'Даты экзаменов',
        purpose: 'Ближайшие экзамены Goethe, telc, ÖSD и TestDaF в Баку — кандидаты выбирают из этих дат свой экзамен по немецкому.',
        steps: [
          'Нажмите «Добавить дату»: экзамен, уровень, город, место, дата и время, крайний срок регистрации и ссылка.',
          'Чтобы показать дату кандидатам, отметьте «Видно клиентам»; без отметки дата остаётся «Скрыто».',
          'В списке видно, сколько кандидатов выбрали дату; при необходимости измените или удалите её.',
        ],
        tips: [
          'Изменять даты могут только администраторы.',
          'При удалении даты данные экзамена выбравших её кандидатов сохраняются.',
          'Модуль может отключить суперадмин.',
        ],
      },
      en: {
        title: 'Exam dates',
        purpose: 'Upcoming Goethe, telc, ÖSD and TestDaF exams in Baku — candidates pick one of these dates for their German exam.',
        steps: [
          'Click “Add date”: exam, level, city, venue, date and time, registration deadline and link.',
          'Tick “Visible to clients” to show the date to candidates; otherwise it stays “Hidden”.',
          'The list shows how many candidates picked each date; edit or delete dates as needed.',
        ],
        tips: [
          'Only admins can change dates.',
          'Deleting a date keeps the exam details of candidates who picked it.',
          'A super admin can switch this module off.',
        ],
      },
      de: {
        title: 'Prüfungstermine',
        purpose: 'Kommende Goethe-, telc-, ÖSD- und TestDaF-Prüfungen in Baku — Kandidaten wählen daraus den Termin für ihre Deutschprüfung.',
        steps: [
          '„Termin hinzufügen“ klicken: Prüfung, Niveau, Stadt, Ort, Datum und Uhrzeit, Anmeldeschluss und Link.',
          '„Für Kund/innen sichtbar“ anhaken, damit Kandidaten den Termin sehen; sonst bleibt er „Verborgen“.',
          'Die Liste zeigt, wie viele Kandidaten einen Termin gewählt haben; Termine bei Bedarf bearbeiten oder löschen.',
        ],
        tips: [
          'Nur Admins können Termine ändern.',
          'Beim Löschen bleiben die Prüfungsangaben der Kandidaten erhalten.',
          'Der Super-Admin kann dieses Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'waiting-room',
    text: {
      az: {
        title: 'Gözləmə zalı',
        purpose: 'Müştərilərin viza cavabını gözləyərkən kabinetdə gördüyü dərslər, videolar, testlər və siyahılar. Viza növü və mərhələyə görə məhdudlaşdırıla bilər.',
        steps: [
          '«Yeni material» basın: növ (Dərs, Video, Test, Siyahı), mövzu, başlıq, mətn və ya video linki, dəqiqə.',
          'Viza növlərini və mərhələləri seçin (heç biri seçilməyibsə — hamısı) və «Dərc edilib» / «Qaralama» vəziyyətini təyin edin.',
          'Sıranı «Yuxarı» / «Aşağı» ilə dəyişin; siyahıda neçə müştərinin tamamladığını görün.',
        ],
        tips: [
          'Boş zal üçün «Başlanğıc məzmunu yüklə» hazır materialları əlavə edir.',
          'Redaktə yalnız adminlər üçündür; digərləri yalnız baxır.',
          'Bu modulu super admin söndürə bilər.',
        ],
      },
      ru: {
        title: 'Зал ожидания',
        purpose: 'Уроки, видео, упражнения и чек-листы, которые клиенты видят в кабинете, пока ждут ответа по визе. Можно ограничить по типу визы и этапу заявки.',
        steps: [
          'Нажмите «Новый материал»: тип (Урок, Видео, Упражнение, Чек-лист), тема, заголовок, текст или ссылка на видео, минуты.',
          'Выберите типы виз и этапы (ничего не выбрано = все) и статус «Опубликовано» / «Черновик».',
          'Меняйте порядок кнопками «Выше» / «Ниже»; в списке видно, сколько клиентов выполнили материал.',
        ],
        tips: [
          'Для пустого зала «Загрузить стартовые материалы» добавляет готовый набор.',
          'Редактировать могут только администраторы; остальные только просматривают.',
          'Модуль может отключить суперадмин.',
        ],
      },
      en: {
        title: 'Waiting room',
        purpose: 'Lessons, videos, exercises and checklists clients see in their account while they wait for the visa decision. Can be limited by visa type and stage.',
        steps: [
          'Click “New item”: type (Lesson, Video, Exercise, Checklist), topic, title, text or video link and minutes.',
          'Choose visa types and stages (none selected = all) and set “Published” or “Draft”.',
          'Reorder with “Move up” / “Move down”; the list shows how many clients completed each item.',
        ],
        tips: [
          '“Load starter content” fills an empty waiting room with ready-made items.',
          'Editing needs admin rights; other staff can only view.',
          'A super admin can switch this module off.',
        ],
      },
      de: {
        title: 'Wartezimmer',
        purpose: 'Lektionen, Videos, Übungen und Checklisten, die Kunden in ihrem Konto sehen, während sie auf die Visumentscheidung warten. Nach Visumart und Stand einschränkbar.',
        steps: [
          '„Neuer Inhalt“ klicken: Art (Lektion, Video, Übung, Checkliste), Thema, Titel, Text oder Videolink und Minuten.',
          'Visumarten und Stände wählen (keine Auswahl = alle) und „Veröffentlicht“ oder „Entwurf“ setzen.',
          'Reihenfolge mit „Nach oben“ / „Nach unten“ ändern; die Liste zeigt, wie viele Kunden einen Inhalt erledigt haben.',
        ],
        tips: [
          '„Startinhalte laden“ füllt ein leeres Wartezimmer mit fertigen Inhalten.',
          'Bearbeiten erfordert Admin-Rechte; andere Mitarbeiter sehen nur.',
          'Der Super-Admin kann dieses Modul abschalten.',
        ],
      },
    },
  },
  {
    route: 'course',
    text: {
      az: {
        title: 'Hazırlıq kursu',
        purpose: 'Namizədlər üçün Almaniyaya hazırlıq kursları: modullar, dərslər, testlər və sertifikat. Adminlər kurs qurur, bütün əməkdaşlar irəliləyişi izləyir.',
        steps: [
          '«Kurslar» tabında «Yeni kurs» yaradın və ya hazır kurs üçün «"Almaniyaya hazırlıq" kursunu yarat» basın.',
          'Kursu açıb «Modul əlavə et» və «Dərs əlavə et» ilə məzmunu qurun, avtomatik qeydiyyat üçün müraciət statuslarını seçin və «Dərc et» basın.',
          '«Hesabat» tabında namizədlərin irəliləyişini, test nəticəsini və sertifikatı görün, «CSV ixrac» ilə endirin.',
        ],
        tips: [
          'Kursları yalnız adminlər redaktə edir; digər əməkdaşlar baxır və hesabatı görür.',
          'Dərc etməzdən əvvəl «Dərc etməzdən əvvəl» siyahısındakı çatışmazlıqları (boş test, videosuz dərs) düzəldin.',
        ],
      },
      ru: {
        title: 'Подготовительный курс',
        purpose: 'Курсы подготовки кандидатов к Германии: модули, уроки, тесты и сертификат. Администраторы создают курсы, все сотрудники следят за прогрессом.',
        steps: [
          'Во вкладке «Курсы» создайте «Новый курс» или нажмите «Создать курс «Almaniyaya hazırlıq»» для готового курса.',
          'Откройте курс, наполните его через «Добавить модуль» и «Добавить урок», выберите статусы заявки для автоматической записи и нажмите «Опубликовать».',
          'Во вкладке «Отчёт» смотрите прогресс кандидатов, результат теста и сертификат; выгрузите через «Экспорт CSV».',
        ],
        tips: [
          'Редактировать курсы могут только администраторы; остальные просматривают и видят отчёт.',
          'Перед публикацией исправьте замечания из списка проверки (пустой тест, урок без видео).',
        ],
      },
      en: {
        title: 'Preparation course',
        purpose: 'Courses that prepare candidates for Germany: modules, lessons, quizzes and a certificate. Admins build the courses; all staff follow progress.',
        steps: [
          'On the “Courses” tab create a “New course” or click “Create the "Almaniyaya hazırlıq" course” for the ready-made one.',
          'Open the course, build it with “Add module” and “Add lesson”, choose the case statuses for automatic enrollment and click “Publish”.',
          'On the “Report” tab see each candidate’s progress, quiz score and certificate; download with “Export CSV”.',
        ],
        tips: [
          'Only admins can edit courses; other staff can view them and the report.',
          'Before publishing fix the issues listed under “Before publishing” (empty quiz, video lesson without video).',
        ],
      },
      de: {
        title: 'Vorbereitungskurs',
        purpose: 'Kurse zur Vorbereitung der Kandidaten auf Deutschland: Module, Lektionen, Tests und Zertifikat. Admins bauen die Kurse, alle Mitarbeiter verfolgen den Fortschritt.',
        steps: [
          'Im Tab „Kurse“ einen „Neuen Kurs“ anlegen oder „Kurs „Almaniyaya hazırlıq“ anlegen“ für den fertigen Kurs klicken.',
          'Kurs öffnen, mit „Modul hinzufügen“ und „Lektion hinzufügen“ aufbauen, Fallstatus für die automatische Einschreibung wählen und „Veröffentlichen“.',
          'Im Tab „Bericht“ Fortschritt, Testergebnis und Zertifikat je Kandidat sehen; mit „CSV exportieren“ herunterladen.',
        ],
        tips: [
          'Kurse bearbeiten können nur Admins; andere Mitarbeiter sehen Kurse und Bericht.',
          'Vor dem Veröffentlichen die Hinweise der Prüfliste beheben (leerer Test, Videolektion ohne Video).',
        ],
      },
    },
  },
  {
    route: 'germany-ready',
    text: {
      az: {
        title: 'Germany Ready',
        purpose: 'Təlim oyunlarındakı «Germany Ready» təcrübə sertifikatları və həftəlik tapşırıqlar. Burada tapşırıqların sırası qurulur və sertifikatlar yoxlanılır.',
        steps: [
          '«Həftəlik tapşırıqların sırası» blokunda tapşırıqları «Yuxarı» / «Aşağı» ilə düzün və «Sıranı saxla» basın; «Növbəti həftələr» nəticəni göstərir.',
          '«Sertifikat axtarışı» blokunda nömrəni (GR-…) yazıb «Tap» basın.',
          'Lazım olsa səbəb yazıb «Ləğv et» və ya «Bərpa et» basın; «Yoxlama səhifəsi» ictimai yoxlamanı açır.',
        ],
        tips: [
          'Tapşırıqların sırasını yalnız adminlər dəyişir; sertifikat axtarışı bütün əməkdaşlar üçündür.',
          'Bu rəsmi imtahan və ya dil sertifikatı deyil, yalnız təcrübə nailiyyətidir.',
        ],
      },
      ru: {
        title: 'Germany Ready',
        purpose: 'Практические сертификаты «Germany Ready» из обучающих игр и задания недели. Здесь задают порядок заданий и проверяют сертификаты.',
        steps: [
          'В блоке «Порядок заданий недели» расставьте задания кнопками «Выше» / «Ниже» и нажмите «Сохранить порядок»; «Следующие недели» показывают результат.',
          'В «Поиск сертификата» введите номер (GR-…) и нажмите «Найти».',
          'При необходимости укажите причину и нажмите «Отозвать» или «Восстановить»; «Страница проверки» открывает публичную проверку.',
        ],
        tips: [
          'Порядок заданий меняют только администраторы; поиск сертификатов доступен всем сотрудникам.',
          'Это не официальный экзамен и не языковой сертификат, а практическое достижение.',
        ],
      },
      en: {
        title: 'Germany Ready',
        purpose: 'The “Germany Ready” practice certificates from the learning games and the weekly challenges. Set the challenge order and check certificates here.',
        steps: [
          'In “Weekly challenge order” arrange challenges with “Move up” / “Move down” and click “Save order”; “Next weeks” shows the result.',
          'In “Find a certificate” enter the number (GR-…) and click “Find”.',
          'If needed, give a reason and click “Revoke”, or “Restore”; “Verification page” opens the public check.',
        ],
        tips: [
          'Only admins can change the challenge order; certificate lookup is open to all staff.',
          'This is not an official exam or language certificate, only a practice achievement.',
        ],
      },
      de: {
        title: 'Germany Ready',
        purpose: 'Die „Germany Ready“-Praxisurkunden aus den Lernspielen und die Wochen-Challenges. Hier legen Sie die Reihenfolge fest und prüfen Urkunden.',
        steps: [
          'In „Reihenfolge der Wochen-Challenges“ mit „Nach oben“ / „Nach unten“ sortieren und „Reihenfolge speichern“; „Nächste Wochen“ zeigt das Ergebnis.',
          'In „Urkunde suchen“ die Nummer (GR-…) eingeben und „Suchen“ klicken.',
          'Bei Bedarf Grund angeben und „Widerrufen“ oder „Wiederherstellen“; „Prüfseite“ öffnet die öffentliche Prüfung.',
        ],
        tips: [
          'Die Reihenfolge ändern nur Admins; die Urkundensuche steht allen Mitarbeitern offen.',
          'Das ist keine offizielle Prüfung und kein Sprachzertifikat, sondern ein Praxiserfolg.',
        ],
      },
    },
  },
];
