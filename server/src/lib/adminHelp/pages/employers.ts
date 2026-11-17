import type { PageHelpEntry } from '../types.js';

/** Admin page help: Employers hub pages. */
export const PAGES_EMPLOYERS: PageHelpEntry[] = [
  {
    route: 'companies',
    text: {
      az: {
        title: 'Şirkətlər',
        purpose: 'İşəgötürən şirkətlərin siyahısı: yeni qeydiyyatları təsdiqləyin, məlumatları yeniləyin və şirkət istifadəçilərini dəvət edin. Bütün əməkdaşlar istifadə edir.',
        steps: [
          'Şirkəti ad, şəhər, e-poçt və ya ƏDV nömrəsi ilə axtarın; «Təsdiq gözləyir», «Aktiv», «Dayandırılıb» ilə süzün.',
          'Şirkətə klikləyin: sağ paneldə «Təsdiqlə», «Dayandır» və ya «Gözləməyə qaytar» basın, məlumatları düzəldib «Yadda saxla» edin.',
          '«İstifadəçi dəvət et» ilə işəgötürən əməkdaşını dəvət edin; «Yeni şirkət» ilə şirkəti özünüz əlavə edin, «Tam profil» ilə ətraflı səhifəni açın.',
        ],
        tips: [
          'Şirkət dayandırılanda aktiv vakansiyaları avtomatik bağlanır.',
          '«Səbəb / qeyd» işəgötürənə göndərilir; yalnız əməkdaşlar üçün olanı «Daxili qeyd»ə yazın.',
          'Bank məlumatlarını yalnız Administrator görür və dəyişir.',
        ],
      },
      ru: {
        title: 'Компании',
        purpose: 'Список компаний-работодателей: одобряйте новые регистрации, обновляйте данные и приглашайте пользователей компании. Пользуются все сотрудники.',
        steps: [
          'Найдите компанию по названию, городу, e-mail или НДС-номеру; фильтруйте «Ожидает одобрения», «Активна», «Приостановлена».',
          'Нажмите на компанию: в боковой панели нажмите «Одобрить», «Приостановить» или «Вернуть в ожидание», исправьте данные и «Сохранить».',
          '«Пригласить пользователя» — пригласить сотрудника работодателя; «Новая компания» — добавить вручную; «Полный профиль» — открыть подробную страницу.',
        ],
        tips: [
          'При приостановке компании её активные вакансии закрываются автоматически.',
          'Текст «Причина / комментарий» уходит работодателю; служебное пишите во «Внутреннюю заметку».',
          'Банковские данные видит и меняет только Администратор.',
        ],
      },
      en: {
        title: 'Companies',
        purpose: 'The list of employer companies: approve new sign-ups, keep their data up to date and invite company users. Used by all staff.',
        steps: [
          'Search by name, city, email or VAT ID; filter with “Awaiting approval”, “Active” and “Suspended”.',
          'Click a company: in the side panel use “Approve”, “Suspend” or “Back to pending”, correct the data and click “Save”.',
          'Use “Invite a user” for employer staff, “New company” to add one yourself and “Full profile” to open the detailed page.',
        ],
        tips: [
          'Suspending a company closes its open vacancies automatically.',
          'The “Reason / note” text is sent to the employer; put internal remarks in the “Internal note”.',
          'Only Admins see and change bank details.',
        ],
      },
      de: {
        title: 'Firmen',
        purpose: 'Die Liste der Arbeitgeber: neue Registrierungen freischalten, Firmendaten pflegen und Benutzer der Firma einladen. Für alle Mitarbeitenden.',
        steps: [
          'Nach Name, Stadt, E-Mail oder USt-IdNr. suchen; mit „Freigabe ausstehend“, „Aktiv“ und „Gesperrt“ filtern.',
          'Firma anklicken: im Seitenbereich „Freischalten“, „Sperren“ oder „Zurück auf ausstehend“ wählen, Daten korrigieren und „Speichern“.',
          'Mit „Benutzer einladen“ Arbeitgeber-Personal einladen, mit „Neues Unternehmen“ selbst anlegen, mit „Vollständiges Profil“ die Detailseite öffnen.',
        ],
        tips: [
          'Beim Sperren werden die offenen Stellen der Firma automatisch geschlossen.',
          'Der Text unter „Grund / Hinweis“ geht an den Arbeitgeber; Internes gehört in die „Interne Notiz“.',
          'Bankdaten sehen und ändern nur Admins.',
        ],
      },
    },
  },
  {
    route: 'companies/:id',
    text: {
      az: {
        title: 'Şirkət profili',
        purpose: 'Bir işəgötürən haqqında hər şey bir səhifədə: əsas rəqəmlər (prosesdə olan işçilər, təsdiqlənmiş vizalar, imtinalar, açıq vakansiyalar, aktiv müqavilə) və sekmələrdə ətraflı məlumat.',
        steps: [
          '«Məlumat» sekməsində hüquqi məlumatları (Betriebsnummer, reyestr, imzalayan) yoxlayın və «Redaktə et» ilə düzəldin.',
          '«Müqavilələr», «Əlaqə şəxsləri», «İşçilər / müraciətlər» və «Vakansiyalar» sekmələrində şirkətin müqavilələrini, adamlarını və işlərini izləyin.',
          '«Sənədlər»də e-imza sorğularına, «Tarixçə»də dəyişikliklərə baxın; «Qeydlər»ə daxili qeyd yazıb saxlayın.',
        ],
        tips: [
          '«Fakturalar / təkliflər» sekməsindəki fakturaları yalnız Administrator görür.',
          '«Qeydlər» yalnız əməkdaşlara görünür, işəgötürən görmür.',
          '«Şirkətlər» linki ilə siyahıya qayıdın.',
        ],
      },
      ru: {
        title: 'Профиль компании',
        purpose: 'Всё о работодателе на одной странице: ключевые цифры (работники в процессе, одобренные визы, отказы, открытые вакансии, активный договор) и подробности во вкладках.',
        steps: [
          'Во вкладке «Данные» проверьте юридические данные (Betriebsnummer, реестр, подписант) и исправьте их через «Изменить».',
          'Во вкладках «Договоры», «Контактные лица», «Работники / заявки» и «Вакансии» следите за договорами, людьми и делами компании.',
          'В «Документах» смотрите запросы на эл. подпись, в «Истории» — изменения; во «Заметках» пишите внутреннюю заметку.',
        ],
        tips: [
          'Счета во вкладке «Счета / предложения» видят только админы.',
          '«Заметки» видят только сотрудники, работодатель их не видит.',
          'Ссылка «Компании» возвращает к списку.',
        ],
      },
      en: {
        title: 'Company profile',
        purpose: 'Everything about one employer on a single page: key numbers (workers in process, approved visas, refusals, open vacancies, active contract) and the details in tabs.',
        steps: [
          'In the “Details” tab check the legal data (Betriebsnummer, register, signatory) and correct it with “Edit”.',
          'Follow the company’s contracts, people and cases in the “Contracts”, “Contact persons”, “Workers / cases” and “Vacancies” tabs.',
          'See e-signature requests under “Documents” and all changes under “History”; keep an internal note under “Notes”.',
        ],
        tips: [
          'Invoices in the “Invoices / quotes” tab are visible to Admins only.',
          '“Notes” are visible to staff only, never to the employer.',
          'The “Companies” link takes you back to the list.',
        ],
      },
      de: {
        title: 'Firmenprofil',
        purpose: 'Alles zu einem Arbeitgeber auf einer Seite: Kennzahlen (Fachkräfte im Verfahren, erteilte Visa, Ablehnungen, offene Stellen, aktiver Vertrag) und die Details in Reitern.',
        steps: [
          'Im Reiter „Daten“ die Rechtsdaten (Betriebsnummer, Register, Unterzeichner) prüfen und mit „Bearbeiten“ korrigieren.',
          'In „Verträge“, „Ansprechpartner“, „Fachkräfte / Anträge“ und „Stellen“ Verträge, Personen und Fälle der Firma verfolgen.',
          'Unter „Dokumente“ E-Signatur-Anfragen, unter „Verlauf“ alle Änderungen ansehen; unter „Notizen“ eine interne Notiz pflegen.',
        ],
        tips: [
          'Rechnungen im Reiter „Rechnungen / Angebote“ sehen nur Admins.',
          '„Notizen“ sehen nur Mitarbeitende, nie der Arbeitgeber.',
          'Über „Firmen“ geht es zurück zur Liste.',
        ],
      },
    },
  },
  {
    route: 'vacancies',
    text: {
      az: {
        title: 'Vakansiyalar',
        purpose: 'İşəgötürənlərin və şirkətin öz vakansiyaları burada yoxlanır, dörd dildə hazırlanır və saytda dərc olunur. Müraciətlər və uyğun namizəd təklifləri də buradadır.',
        steps: [
          'Siyahını status («Qaralama», «Yoxlamada», «Aktiv», «Bağlı»), şirkət və axtarışla süzün.',
          'Yoxlamadakı vakansiyanı açın, lazım olsa «Redaktə (4 dil)» ilə düzəldin, sonra «Təsdiqlə və dərc et» və ya səbəb yazıb «Düzəlişə qaytar» basın.',
          '«Müraciətlər»də namizədlərin statusunu idarə edin, «Uyğun namizəd təklifləri»ndən əlavə edin; yer dolanda «Bağla» basın.',
        ],
        tips: [
          'Öz vakansiyanız üçün «Yeni vakansiya» basın; şirkət seçilməsə, vakansiya şirkətsiz qalır.',
          'Müraciəti olan vakansiyanı silmək olmur — bağlayın.',
          'İş elanı portallarına paylaşım vakansiyanın «Paylaşım» bölməsində seçilir.',
        ],
      },
      ru: {
        title: 'Вакансии',
        purpose: 'Здесь проверяют, переводят на четыре языка и публикуют на сайте вакансии работодателей и собственные вакансии. Здесь же отклики и подходящие кандидаты.',
        steps: [
          'Фильтруйте список по статусу («Черновик», «На проверке», «Опубликована», «Закрыта»), компании и поиском.',
          'Откройте вакансию на проверке, при необходимости исправьте через «Редактирование (4 языка)», затем «Одобрить и опубликовать» или «Вернуть на доработку» с причиной.',
          'В «Откликах» ведите статусы кандидатов, добавляйте «Подходящих кандидатов»; когда место занято — «Закрыть».',
        ],
        tips: [
          'Свою вакансию создайте кнопкой «Новая вакансия»; без выбора компании она будет «Без компании».',
          'Вакансию с откликами удалить нельзя — закройте её.',
          'Публикация на порталах вакансий выбирается в разделе «Paylaşım» вакансии.',
        ],
      },
      en: {
        title: 'Vacancies',
        purpose: 'Employer vacancies and our own are reviewed, prepared in four languages and published on the website here, together with their applications and suggested candidates.',
        steps: [
          'Filter the list by status (“Draft”, “In review”, “Published”, “Closed”), company and search.',
          'Open a vacancy in review, fix it with “Edit (4 languages)” if needed, then “Approve and publish” or “Send back for changes” with a reason.',
          'Manage candidate statuses under “Applications”, add people from “Suggested candidates”, and click “Close” once the position is filled.',
        ],
        tips: [
          'Create your own with “New vacancy”; without a company it is listed as “No company”.',
          'A vacancy with applications cannot be deleted — close it instead.',
          'Job board distribution is chosen in the vacancy’s “Paylaşım” section.',
        ],
      },
      de: {
        title: 'Stellen',
        purpose: 'Hier werden Arbeitgeber- und eigene Stellen geprüft, in vier Sprachen aufbereitet und auf der Website veröffentlicht – samt Bewerbungen und Kandidatenvorschlägen.',
        steps: [
          'Liste nach Status („Entwurf“, „In Prüfung“, „Veröffentlicht“, „Geschlossen“), Unternehmen und Suche filtern.',
          'Stelle in Prüfung öffnen, bei Bedarf mit „Bearbeiten (4 Sprachen)“ korrigieren, dann „Freigeben und veröffentlichen“ oder mit Grund „Zur Überarbeitung zurück“.',
          'Unter „Bewerbungen“ Status pflegen, aus „Passende Kandidaten“ hinzufügen und bei besetzter Stelle „Schließen“.',
        ],
        tips: [
          'Eigene Stelle über „Neue Stelle“; ohne Unternehmen läuft sie als „Ohne Unternehmen“.',
          'Stellen mit Bewerbungen lassen sich nicht löschen – schließen Sie sie.',
          'Die Verteilung an Jobbörsen wählt man im Abschnitt „Paylaşım“ der Stelle.',
        ],
      },
    },
  },
  {
    route: 'job-channels',
    text: {
      az: {
        title: 'İş elanı kanalları',
        purpose: 'Vakansiyaların Indeed, StepStone, Bundesagentur für Arbeit (Jobbörse) və digər portallara ötürülməsi: feed ünvanları, gizli açar, statuslar və xətalı elanlar. Yalnız Administrator üçündür.',
        steps: [
          '«Feed ünvanları»ndan lazımi kanalın ünvanını «Kopyala» ilə götürüb portala (məs. Indeed menecerinə) göndərin.',
          '«Xətalı elanlar» siyahısında çatışmayan sahələri (şəhər, PLZ, BA peşə kodu) görün və vakansiyada düzəldin; sonra «İndi yenilə» basın.',
          'BA bölməsində Supplier ID, Partner ID, sertifikat və parolu daxil edib «Yadda saxla»; «XML faylını yüklə» və ya «İndi göndər» istifadə edin.',
        ],
        tips: [
          '«Açarı yenilə»dən sonra köhnə ünvanlar dərhal işləmir — portallara yenisini göndərin.',
          'Feedlər 10 dəqiqədən bir avtomatik yenilənir.',
          'Hansı vakansiyanın hansı kanala getdiyi vakansiyanın «Paylaşım» bölməsində seçilir.',
        ],
      },
      ru: {
        title: 'Каналы вакансий',
        purpose: 'Передача вакансий на Indeed, StepStone, в Jobbörse Агентства по труду (BA) и другие порталы: адреса фидов, секретный ключ, статусы и вакансии с ошибками. Только для Администратора.',
        steps: [
          'В «Адресах фидов» нажмите «Копировать» у нужного канала и передайте адрес порталу (например, менеджеру Indeed).',
          'В «Вакансиях с ошибками» посмотрите, чего не хватает (город, PLZ, код профессии BA), исправьте в вакансии и нажмите «Обновить сейчас».',
          'В блоке BA введите Supplier ID, Partner ID, сертификат и пароль, «Сохранить»; затем «Скачать XML-файл» или «Загрузить сейчас».',
        ],
        tips: [
          'После «Обновить ключ» старые адреса сразу перестают работать — отправьте порталам новые.',
          'Фиды обновляются автоматически каждые 10 минут.',
          'Каналы для каждой вакансии выбираются в её разделе «Paylaşım».',
        ],
      },
      en: {
        title: 'Job board channels',
        purpose: 'Sends vacancies to Indeed, StepStone, the BA Jobbörse and other boards: feed URLs, the secret token, statuses and vacancies with errors. Admins only.',
        steps: [
          'Under “Feed URLs” click “Copy” next to a channel and give the URL to the board (e.g. your Indeed account manager).',
          'Check “Vacancies with errors” for missing fields (city, postal code, BA occupation code), fix them in the vacancy and click “Rebuild now”.',
          'In the BA block enter Supplier ID, Partner ID, certificate and passphrase and click “Save”; then “Download XML file” or “Upload now”.',
        ],
        tips: [
          'After “Rotate token” the old URLs stop working at once — send the new ones to the boards.',
          'Feeds rebuild automatically every 10 minutes.',
          'Which channels a vacancy goes to is chosen in its “Paylaşım” section.',
        ],
      },
      de: {
        title: 'Jobbörsen-Kanäle',
        purpose: 'Ausspielung der Stellen an Indeed, StepStone, die Jobbörse der Bundesagentur für Arbeit und weitere Portale: Feed-Adressen, geheimer Schlüssel, Status und fehlerhafte Stellen. Nur für Admins.',
        steps: [
          'Unter „Feed-Adressen“ beim Kanal „Kopieren“ klicken und die Adresse dem Portal geben (z. B. Indeed-Ansprechpartner).',
          'In „Stellen mit Fehlern“ fehlende Angaben (Stadt, PLZ, BA-Berufskennziffer) sehen, in der Stelle ergänzen und „Jetzt aktualisieren“ klicken.',
          'Im BA-Block Supplier-ID, Partner-ID, Zertifikat und Passwort eintragen, „Speichern“; dann „XML-Datei herunterladen“ oder „Jetzt hochladen“.',
        ],
        tips: [
          'Nach „Schlüssel erneuern“ funktionieren die alten Adressen sofort nicht mehr – neue an die Portale senden.',
          'Die Feeds werden alle 10 Minuten automatisch neu gebaut.',
          'Die Kanäle je Stelle wählt man im Abschnitt „Paylaşım“ der Stelle.',
        ],
      },
    },
  },
  {
    route: 'candidate-requests/*',
    text: {
      az: {
        title: 'Toplu namizəd sorğuları',
        purpose: 'İşəgötürənlərin portalda yaratdığı kadr sorğuları (məs. «10 TIR sürücüsü»): uyğun namizədləri seçib işəgötürənə təqdim edirsiniz və gedişatı izləyirsiniz.',
        steps: [
          'Siyahını status («Açıq», «İcrada», «Tamamlandı», «Ləğv edildi»), şirkət və axtarışla süzün, sorğunu açın.',
          'Sorğuda vakansiya yoxdursa «Vakansiya yarat» basın; «Təklif olunan namizədlər»dən uyğunları işarələyib «İşəgötürənə təqdim et» basın.',
          '«Status və daxili qeyd» blokunda statusu dəyişin, qeyd yazıb yadda saxlayın.',
        ],
        tips: [
          'Təkliflər alman dili və sürücülük vəsiqəsi tələbinə görə süzülür və uyğunluğa görə sıralanır (ilk 50).',
          'Artıq təqdim olunmuş namizəd ikinci dəfə göndərilmir.',
          'Daxili qeydi işəgötürən görmür.',
        ],
      },
      ru: {
        title: 'Запросы кандидатов',
        purpose: 'Кадровые запросы работодателей из портала (например, «10 водителей фур»): вы подбираете подходящих кандидатов, предлагаете их работодателю и следите за ходом.',
        steps: [
          'Фильтруйте список по статусу («Открыта», «В работе», «Закрыта», «Отменена»), компании и поиском, откройте запрос.',
          'Если вакансии нет, нажмите «Создать вакансию»; отметьте подходящих в «Рекомендуемых кандидатах» и нажмите «Предложить работодателю».',
          'В блоке «Статус и внутренняя заметка» смените статус, допишите заметку и сохраните.',
        ],
        tips: [
          'Рекомендации учитывают уровень немецкого и права и сортируются по совпадению (первые 50).',
          'Уже предложенный кандидат повторно не отправляется.',
          'Внутреннюю заметку работодатель не видит.',
        ],
      },
      en: {
        title: 'Candidate requests',
        purpose: 'Staffing requests employers create in their portal (e.g. “10 truck drivers”): you pick matching candidates, propose them to the employer and follow the progress.',
        steps: [
          'Filter the list by status (“Open”, “In progress”, “Filled”, “Cancelled”), company and search, then open a request.',
          'If it has no vacancy yet, click “Create vacancy”; tick matching people in “Suggested candidates” and click “Propose to employer”.',
          'In “Status and internal note” change the status, add a note and save.',
        ],
        tips: [
          'Suggestions are filtered by German level and driving licence and ranked by match (top 50).',
          'A candidate already proposed is not sent twice.',
          'The employer never sees the internal note.',
        ],
      },
      de: {
        title: 'Personalanfragen',
        purpose: 'Personalanfragen, die Arbeitgeber im Portal stellen (z. B. „10 Lkw-Fahrer“): Sie wählen passende Kandidaten aus, schlagen sie dem Arbeitgeber vor und verfolgen den Fortschritt.',
        steps: [
          'Liste nach Status („Offen“, „In Bearbeitung“, „Besetzt“, „Storniert“), Unternehmen und Suche filtern und die Anfrage öffnen.',
          'Fehlt eine Stelle, „Stelle anlegen“ klicken; in „Vorgeschlagene Kandidaten“ Passende markieren und „Dem Arbeitgeber vorschlagen“.',
          'Im Block „Status und interne Notiz“ den Status ändern, Notiz ergänzen und speichern.',
        ],
        tips: [
          'Vorschläge berücksichtigen Deutschniveau und Führerschein und sind nach Passung sortiert (Top 50).',
          'Bereits vorgeschlagene Kandidaten werden nicht doppelt gesendet.',
          'Die interne Notiz sieht der Arbeitgeber nicht.',
        ],
      },
    },
  },
  {
    route: 'candidate-pool',
    text: {
      az: {
        title: 'Anonim namizəd bazası',
        purpose: 'İşəgötürənlərin adsız gördüyü namizəd profilləri, onların maraq sorğuları və baxış jurnalı. Namizəd yalnız öz razılığı ilə bazada görünür.',
        steps: [
          '«Profillər» sekməsində vəziyyətə görə («Görünür», «Tövsiyə edilib, razılıq yoxdur», «Gizlədilib» və s.) süzün, profili açıb «Redaktə et» basın.',
          'Namizədi «Bazaya tövsiyə et», lazım olsa «Bazadan gizlət»; ictimai qısa təsviri və bacarıqları yazıb «Yadda saxla» basın.',
          '«Maraq sorğuları»nda işəgötürən sorğusunun statusunu dəyişin; «Baxış jurnalı»nda kimin hansı profilə baxdığını görün.',
        ],
        tips: [
          'İctimai təsvirdə ad və əlaqə məlumatı yazmayın — işəgötürənlər onu görür.',
          'Tövsiyə etsəniz də, namizədin razılığı olmadan profil görünmür.',
        ],
      },
      ru: {
        title: 'База кандидатов',
        purpose: 'Анонимные профили кандидатов, которые видят работодатели, их запросы и журнал просмотров. Кандидат виден в базе только с собственного согласия.',
        steps: [
          'Во вкладке «Профили» фильтруйте по состоянию («Виден», «Рекомендован, без согласия», «Скрыт» и др.), откройте профиль и нажмите «Редактировать».',
          'Отметьте «Рекомендовать в базу» или «Скрыть из базы»; напишите публичное описание и навыки и нажмите «Сохранить».',
          'Во вкладке «Запросы» меняйте статус запроса работодателя; в «Журнале просмотров» видно, кто какие профили открывал.',
        ],
        tips: [
          'В публичном описании нельзя указывать имя и контакты — его видят работодатели.',
          'Даже рекомендованный профиль не виден без согласия кандидата.',
        ],
      },
      en: {
        title: 'Candidate pool',
        purpose: 'Anonymous candidate profiles that employers can browse, their interest requests and the view log. A candidate is visible only with their own consent.',
        steps: [
          'In “Profiles” filter by state (“Visible”, “Recommended, no consent”, “Hidden” …), open a profile and click “Edit”.',
          'Tick “Recommend for the pool” or “Hide from the pool”, write the public summary and skills and click “Save”.',
          'In “Interest requests” update the status of employer requests; the “View log” shows which company opened which profile.',
        ],
        tips: [
          'Never put names or contacts in the public summary — employers read it.',
          'A recommended profile stays invisible until the candidate consents.',
        ],
      },
      de: {
        title: 'Kandidatenpool',
        purpose: 'Anonyme Kandidatenprofile, die Arbeitgeber durchsuchen, deren Anfragen und das Abrufprotokoll. Sichtbar ist ein Kandidat nur mit eigener Einwilligung.',
        steps: [
          'Im Reiter „Profile“ nach Zustand filtern („Sichtbar“, „Empfohlen, ohne Einwilligung“, „Ausgeblendet“ …), Profil öffnen und „Bearbeiten“.',
          '„Für den Pool empfehlen“ oder „Aus dem Pool ausblenden“ setzen, öffentliches Kurzprofil und Fähigkeiten eintragen und „Speichern“.',
          'Unter „Anfragen“ den Status der Arbeitgeberanfrage ändern; das „Abrufprotokoll“ zeigt, welche Firma welches Profil geöffnet hat.',
        ],
        tips: [
          'Im öffentlichen Kurzprofil keine Namen oder Kontakte – Arbeitgeber lesen es.',
          'Ein empfohlenes Profil bleibt unsichtbar, bis der Kandidat einwilligt.',
        ],
      },
    },
  },
  {
    route: 'interviews',
    text: {
      az: {
        title: 'Müsahibələr',
        purpose: 'Namizədlərlə işəgötürənlər arasında onlayn müsahibələri (video görüşlər) planlaşdırın və izləyin. Bütün əməkdaşlar istifadə edir.',
        steps: [
          '«Həftə» və ya «Siyahı» görünüşünü seçin; status düymələri və şirkət seçimi ilə süzün.',
          '«Yeni müsahibə» basın, namizədi, lazım olsa müraciəti / vakansiyanı və şirkəti seçin, vaxtı və müddəti yazıb «Yarat» basın.',
          'Müsahibəni açıb «Təsdiqlə», «Vaxtı dəyiş» və ya səbəblə «Ləğv et» basın; görüşdən sonra «Keçirildi» və ya «Gəlmədi» qeyd edin.',
        ],
        tips: [
          'Təsdiqlənmiş müsahibədən 24 saat və 1 saat əvvəl hamıya avtomatik xatırlatma gedir.',
          'Vaxt dəyişəndə müsahibə yenidən təsdiq tələb edir.',
        ],
      },
      ru: {
        title: 'Собеседования',
        purpose: 'Планирование и контроль онлайн-собеседований (видеовстреч) между кандидатами и работодателями. Пользуются все сотрудники.',
        steps: [
          'Выберите вид «Неделя» или «Список»; фильтруйте кнопками статусов и выбором компании.',
          'Нажмите «Новое собеседование», выберите кандидата, при необходимости заявку / вакансию и компанию, укажите время и длительность и нажмите «Создать».',
          'Откройте встречу и нажмите «Подтвердить», «Перенести» или «Отменить» с причиной; после встречи отметьте «Проведено» или «Не явился».',
        ],
        tips: [
          'За 24 часа и за 1 час до подтверждённого собеседования всем уходит автоматическое напоминание.',
          'После переноса собеседование снова требует подтверждения.',
        ],
      },
      en: {
        title: 'Interviews',
        purpose: 'Plan and follow online interviews (video meetings) between candidates and employers. Used by all staff.',
        steps: [
          'Choose the “Week” or “List” view; filter with the status buttons and the company selector.',
          'Click “New interview”, pick the candidate and, if needed, the application / vacancy and company, set time and duration and click “Create”.',
          'Open an interview and use “Confirm”, “Reschedule” or “Cancel” with a reason; afterwards record “Done” or “No-show”.',
        ],
        tips: [
          'Everyone gets an automatic reminder 24 hours and 1 hour before a confirmed interview.',
          'A rescheduled interview needs confirming again.',
        ],
      },
      de: {
        title: 'Interviews',
        purpose: 'Online-Interviews (Videotermine) zwischen Kandidaten und Arbeitgebern planen und verfolgen. Für alle Mitarbeitenden.',
        steps: [
          'Ansicht „Woche“ oder „Liste“ wählen; mit den Status-Schaltflächen und der Unternehmensauswahl filtern.',
          '„Neues Interview“ klicken, Kandidat und bei Bedarf Bewerbung / Stelle und Unternehmen wählen, Beginn und Dauer eintragen und „Erstellen“.',
          'Interview öffnen und „Bestätigen“, „Verschieben“ oder mit Grund „Absagen“; danach „Durchgeführt“ oder „Nicht erschienen“ festhalten.',
        ],
        tips: [
          '24 Stunden und 1 Stunde vor einem bestätigten Interview geht automatisch eine Erinnerung an alle.',
          'Ein verschobenes Interview muss erneut bestätigt werden.',
        ],
      },
    },
  },
  {
    route: 'employment-contracts',
    text: {
      az: {
        title: 'Əmək müqavilələri',
        purpose: 'İşçilərin Almaniyadakı əmək müqavilələrinə nəzarət: xəbərdarlığı olan müqavilələr (Blue Card həddindən aşağı maaş, minimum əmək haqqı, 48 saatdan çox və s.) və sınaq müddəti 30 gün ərzində bitənlər.',
        steps: [
          'Yuxarıda «Xəbərdarlıqlar», «Sınaq müddəti bitir» və ya «Hamısı» filtrini seçin.',
          'Sətirdə işəgötürəni, vəzifəni, maaşı, xəbərdarlıqları və sınaq sonunu yoxlayın.',
          'İş nömrəsinə klikləyin — müraciətin müqavilə bölməsi açılır, orada məlumatları düzəldin.',
        ],
        tips: [
          'Müqavilə məlumatları müraciət səhifəsində daxil edilir; bu səhifə yalnız icmaldır.',
          'Sınaq müddəti bitənlər üçün işçi və işəgötürənlə vaxtında əlaqə saxlayın.',
        ],
      },
      ru: {
        title: 'Трудовые договоры',
        purpose: 'Контроль трудовых договоров работников в Германии: договоры с замечаниями (зарплата ниже порога Blue Card или минимальной оплаты, более 48 ч и др.) и испытательные сроки, заканчивающиеся в ближайшие 30 дней.',
        steps: [
          'Выберите вверху фильтр «Замечания», «Конец испытательного срока» или «Все».',
          'В строке проверьте работодателя, должность, зарплату, замечания и конец испытательного срока.',
          'Нажмите на номер дела — откроется раздел договора в деле, там и исправляйте данные.',
        ],
        tips: [
          'Данные договора вводятся в карточке дела; эта страница — только обзор.',
          'Свяжитесь с работником и работодателем заранее, пока испытательный срок не закончился.',
        ],
      },
      en: {
        title: 'Employment contracts',
        purpose: 'Oversight of workers’ German employment contracts: contracts with warnings (below the Blue Card threshold or minimum wage, over 48 hours, etc.) and probation periods ending within 30 days.',
        steps: [
          'Choose the “Warnings”, “Probation ending” or “All” filter at the top.',
          'Check employer, job title, salary, warnings and probation end in each row.',
          'Click the case number to open the contract section of the case and correct the data there.',
        ],
        tips: [
          'Contract data is entered on the case page; this page is an overview only.',
          'Contact the worker and employer before a probation period ends.',
        ],
      },
      de: {
        title: 'Arbeitsverträge',
        purpose: 'Überblick über die Arbeitsverträge der Fachkräfte: Verträge mit Hinweisen (unter Blue-Card-Grenze oder Mindestlohn, über 48 Std. usw.) und Probezeiten, die in den nächsten 30 Tagen enden.',
        steps: [
          'Oben den Filter „Hinweise“, „Probezeit endet“ oder „Alle“ wählen.',
          'In jeder Zeile Arbeitgeber, Tätigkeit, Gehalt, Hinweise und Probezeitende prüfen.',
          'Auf die Fallnummer klicken – der Vertragsabschnitt des Falls öffnet sich, dort die Daten korrigieren.',
        ],
        tips: [
          'Vertragsdaten werden im Fall erfasst; diese Seite ist nur die Übersicht.',
          'Vor Ende der Probezeit rechtzeitig Fachkraft und Arbeitgeber kontaktieren.',
        ],
      },
    },
  },
  {
    route: 'interview-prep',
    text: {
      az: {
        title: 'Müsahibə sualları',
        purpose: 'Müştərilərin portalda səfirlik və işəgötürən müsahibəsinə hazırlaşdığı sual bankı: sual, almanca nümunə cavab və məsləhətlər.',
        steps: [
          'Sualları axtarış, növ (Səfirlik / İşəgötürən), kateqoriya, viza növü və statusla süzün.',
          '«Yeni sual» basın: növü, kateqoriyanı, sualı, nümunə cavabı (sadə B1) və viza növlərini doldurun, «Dərc edilib» seçib «Yadda saxla» basın.',
          '«Yuxarı» / «Aşağı» ilə müştərilərin gördüyü sıranı dəyişin; lazımsız sualı «Sil» ilə silin.',
        ],
        tips: [
          'Redaktəni yalnız Administrator edə bilər; digər əməkdaşlar yalnız baxır.',
          'Viza növü seçilməsə, sual bütün viza növləri üçün göstərilir.',
          'Bölmə «Modullar» səhifəsində söndürülə bilər.',
        ],
      },
      ru: {
        title: 'Вопросы к собеседованию',
        purpose: 'Банк вопросов, по которому клиенты в портале готовятся к собеседованию в посольстве и у работодателя: вопрос, пример ответа на немецком и советы.',
        steps: [
          'Фильтруйте вопросы поиском, типом (Посольство / Работодатель), категорией, типом визы и статусом.',
          'Нажмите «Новый вопрос»: укажите тип, категорию, вопрос, пример ответа (простой B1) и типы виз, выберите «Опубликован» и «Сохранить».',
          'Кнопками вверх / вниз меняйте порядок, который видят клиенты; ненужный вопрос удалите через «Удалить».',
        ],
        tips: [
          'Редактировать может только Администратор; остальные сотрудники только смотрят.',
          'Если тип визы не выбран, вопрос показывается для всех виз.',
          'Раздел можно отключить на странице «Модули».',
        ],
      },
      en: {
        title: 'Interview questions',
        purpose: 'The question bank clients use in their portal to prepare for the embassy and the job interview: question, sample German answer and tips.',
        steps: [
          'Filter by search, kind (Embassy / Employer), category, visa type and status.',
          'Click “New question”: fill in kind, category, question, sample answer (plain B1) and visa types, set “Published” and click “Save”.',
          'Use the up / down buttons to change the order clients see; remove a question with “Delete”.',
        ],
        tips: [
          'Only Admins can edit; other staff have read-only access.',
          'With no visa type selected, a question is shown for every visa type.',
          'The section can be switched off on the “Modules” page.',
        ],
      },
      de: {
        title: 'Interviewfragen',
        purpose: 'Der Fragenkatalog, mit dem sich Kunden im Portal auf Botschaft und Vorstellungsgespräch vorbereiten: Frage, deutsche Beispielantwort und Tipps.',
        steps: [
          'Nach Suche, Art (Botschaft / Arbeitgeber), Kategorie, Visumart und Status filtern.',
          '„Neue Frage“ klicken: Art, Kategorie, Frage, Beispielantwort (einfaches B1) und Visumarten ausfüllen, „Veröffentlicht“ wählen und „Speichern“.',
          'Mit den Pfeilen nach oben / unten die Reihenfolge für Kunden ändern; überflüssige Fragen mit „Löschen“ entfernen.',
        ],
        tips: [
          'Bearbeiten dürfen nur Admins; andere Mitarbeitende haben Lesezugriff.',
          'Ohne gewählte Visumart erscheint eine Frage bei allen Visumarten.',
          'Der Bereich lässt sich auf der Seite „Module“ abschalten.',
        ],
      },
    },
  },
  {
    route: 'cover-letter-templates',
    text: {
      az: {
        title: 'Anschreiben şablonları',
        purpose: 'Xarici vakansiyalara Triad Vision vasitəsilə müraciətdə istifadə olunan alman dilində müşayiət məktubu (Anschreiben) şablonları — hər iş növü üçün bir. AI yoxdur, mətn yer tutucularla doldurulur. Yalnız Administrator üçündür.',
        steps: [
          'Siyahıdan iş növünü (məs. Sürücü / logistika, Qulluq / səhiyyə) seçin.',
          'Adı, «Mövzu (Betreff)» və mətni dəyişin; yer tutucuları siyahıdan düymə ilə əlavə edin.',
          '«Nümunə ilə önizləmə»də nəticəni yoxlayıb «Saxla» basın.',
        ],
        tips: [
          '[[ … ]] arasındakı hissə içindəki yer tutucu boş olanda çıxarılır.',
          '«Daxili variantı bərpa et» dəyişiklikləri silir və standart şablonu qaytarır.',
        ],
      },
      ru: {
        title: 'Шаблоны Anschreiben',
        purpose: 'Немецкие шаблоны сопроводительного письма (Anschreiben) для откликов на внешние вакансии через Triad Vision — по одному на тип работы. Без ИИ: текст заполняется плейсхолдерами. Только для Администратора.',
        steps: [
          'Выберите в списке тип работы (например, водитель / логистика, уход / медицина).',
          'Измените название, «Тему (Betreff)» и текст; плейсхолдеры вставляйте кнопками из списка.',
          'Проверьте результат в «Предпросмотре с примером» и нажмите «Сохранить».',
        ],
        tips: [
          'Часть в [[ … ]] выпадает, если плейсхолдер внутри пуст.',
          '«Вернуть встроенную версию» удаляет изменения и восстанавливает стандартный шаблон.',
        ],
      },
      en: {
        title: 'Cover letter templates',
        purpose: 'German cover letter (Anschreiben) templates used when clients apply to external vacancies via Triad Vision — one per job type. No AI: the text is only filled with placeholders. Admins only.',
        steps: [
          'Pick a job type from the list (e.g. driver / logistics, care / health).',
          'Edit the name, “Subject (Betreff)” and text; insert placeholders with the buttons in the list.',
          'Check the result in “Preview with sample data” and click “Save”.',
        ],
        tips: [
          'A part inside [[ … ]] is left out when a placeholder in it is empty.',
          '“Restore built-in version” discards the changes and brings back the default template.',
        ],
      },
      de: {
        title: 'Anschreiben-Vorlagen',
        purpose: 'Deutsche Anschreiben-Vorlagen für Bewerbungen auf externe Stellen über Triad Vision – eine je Stellenart. Keine KI: der Text wird nur mit Platzhaltern gefüllt. Nur für Admins.',
        steps: [
          'Stellenart in der Liste wählen (z. B. Fahrer / Logistik, Pflege / Gesundheit).',
          'Name, „Betreff“ und Text bearbeiten; Platzhalter über die Schaltflächen der Liste einfügen.',
          'Ergebnis in „Vorschau mit Beispieldaten“ prüfen und „Speichern“.',
        ],
        tips: [
          'Ein Abschnitt in [[ … ]] entfällt, wenn ein Platzhalter darin leer ist.',
          '„Eingebaute Fassung wiederherstellen“ verwirft die Änderungen und stellt die Standardvorlage her.',
        ],
      },
    },
  },
  {
    route: 'employer-checklist-templates',
    text: {
      az: {
        title: 'İşəgötürən gəliş siyahısı şablonları',
        purpose: 'İşəgötürənlərin hər yeni işçi üçün portalda işarələdiyi gəliş siyahısının bəndləri (mətnlər, tarixlər, görünüş). Dəyişiklik bütün şirkətlərə tətbiq olunur.',
        steps: [
          'Bəndin yanında «Dəyiş» basın: adları dörd dildə, «Tarix nəyə görə» (gəliş günü / ilk iş günü) və günləri təyin edin.',
          '«İşçi görür» və «Aktiv» işarələrini lazım olduğu kimi qoyub «Yadda saxla» basın.',
          'Yeni bənd üçün «Yeni bənd» basın; standart bəndi «Standarta qaytar» ilə ilkin vəziyyətə qaytarın.',
        ],
        tips: [
          'Hamı baxa bilər, dəyişikliyi yalnız Administrator edir.',
          'Söndürülmüş bənd artıq yaradılmış siyahılarda qalır, yeni işçilərə əlavə olunmur.',
        ],
      },
      ru: {
        title: 'Шаблоны чек-листа приезда',
        purpose: 'Пункты чек-листа приезда, который работодатели отмечают в портале для каждого нового работника (тексты, сроки, видимость). Изменения действуют для всех компаний.',
        steps: [
          'Нажмите «Изменить» у пункта: задайте названия на четырёх языках, «Срок относительно» (приезда / первого рабочего дня) и число дней.',
          'Отметьте «Видно сотруднику» и «Активен» как нужно и нажмите «Сохранить».',
          'Новый пункт — кнопка «Новый пункт»; стандартный пункт возвращается через «Вернуть стандарт».',
        ],
        tips: [
          'Смотреть могут все, менять — только Администратор.',
          'Отключённый пункт остаётся в уже созданных списках, но новым работникам не добавляется.',
        ],
      },
      en: {
        title: 'Arrival checklist templates',
        purpose: 'The items of the arrival checklist employers tick in their portal for each new worker (texts, due dates, visibility). Changes apply to all companies.',
        steps: [
          'Click “Edit” on an item: set the names in four languages, “Due date relative to” (arrival / first work day) and the number of days.',
          'Set “Visible to the worker” and “Active” as needed and click “Save”.',
          'Add your own with “New item”; bring a built-in item back with “Reset to default”.',
        ],
        tips: [
          'Everyone can view; only Admins can change.',
          'A deactivated item stays in existing checklists but is not added for new workers.',
        ],
      },
      de: {
        title: 'Ankunfts-Checkliste (Vorlagen)',
        purpose: 'Die Punkte der Ankunfts-Checkliste, die Arbeitgeber im Portal für jede neue Fachkraft abhaken (Texte, Fristen, Sichtbarkeit). Änderungen gelten für alle Firmen.',
        steps: [
          'Beim Punkt „Bearbeiten“ klicken: Namen in vier Sprachen, „Frist bezogen auf“ (Ankunft / ersten Arbeitstag) und Tage festlegen.',
          '„Für Mitarbeitende sichtbar“ und „Aktiv“ nach Bedarf setzen und „Speichern“.',
          'Eigene Punkte über „Neuer Punkt“; Standardpunkte mit „Auf Standard zurücksetzen“ wiederherstellen.',
        ],
        tips: [
          'Ansehen dürfen alle, ändern nur Admins.',
          'Ein deaktivierter Punkt bleibt in bestehenden Listen, wird neuen Fachkräften aber nicht hinzugefügt.',
        ],
      },
    },
  },
  {
    route: 'real-salaries',
    text: {
      az: {
        title: 'Real maaş bazası',
        purpose: 'Açıq «real maaşlar» səhifəsindəki maaş aralıqlarının mənbəyi: imzalanmış müqavilələrin maaşları. Məbləğlər hər iş üzrə yalnız əməkdaşlara görünür.',
        steps: [
          '«Müqavilələr» cədvəlində hər müqavilənin istifadə olunub-olunmadığını və səbəbini (məbləğ yoxdur, part-time və s.) yoxlayın.',
          'Səhv və ya xüsusi qeydi «Çıxar» ilə çıxarın, lazım olsa «Geri qaytar» basın.',
          '«Qruplar (daxili baxış)»da hansı qrupun dərc olunduğunu görün; Administrator «İndi yenidən hesabla» basa bilər.',
        ],
        tips: [
          '3 işçidən az olan qrup açıq səhifədə göstərilmir.',
          'Dəyişikliklər növbəti hesablamada tətbiq olunur; «Açıq səhifə» ilə nəticəyə baxın.',
        ],
      },
      ru: {
        title: 'База реальных зарплат',
        purpose: 'Источник диапазонов на публичной странице «реальных зарплат»: зарплаты из подписанных договоров. Суммы по делам видят только сотрудники.',
        steps: [
          'В таблице «Договоры» проверьте, учитывается ли каждый договор и почему нет (нет суммы, неполный день и т. п.).',
          'Ошибочную или особую запись уберите кнопкой «Исключить», при необходимости — «Вернуть».',
          'В «Группах (внутренний вид)» видно, какие группы публикуются; Администратор может нажать «Пересчитать сейчас».',
        ],
        tips: [
          'Группа менее чем из 3 работников на публичной странице не показывается.',
          'Изменения применяются при следующем расчёте; результат — по ссылке «Публичная страница».',
        ],
      },
      en: {
        title: 'Real salary database',
        purpose: 'The source of the ranges on the public “real salaries” page: salaries from signed contracts. Amounts per case are visible to staff only.',
        steps: [
          'In the “Contracts” table check whether each contract is used and, if not, why (no amount, part-time, etc.).',
          'Remove a wrong or special record with “Exclude”; use “Include again” to undo.',
          '“Groups (internal view)” shows which groups are published; Admins can click “Recompute now”.',
        ],
        tips: [
          'Groups with fewer than 3 workers are not shown publicly.',
          'Changes apply with the next computation; check the result via “Public page”.',
        ],
      },
      de: {
        title: 'Echte-Gehälter-Datenbank',
        purpose: 'Die Quelle der Spannen auf der öffentlichen Seite „Echte Gehälter“: Gehälter aus unterschriebenen Verträgen. Beträge je Fall sehen nur Mitarbeitende.',
        steps: [
          'In der Tabelle „Verträge“ prüfen, ob jeder Vertrag verwendet wird und warum nicht (kein Betrag, Teilzeit usw.).',
          'Fehlerhafte oder Sonderfälle mit „Ausschließen“ entfernen, bei Bedarf „Wieder aufnehmen“.',
          '„Gruppen (interne Ansicht)“ zeigt, welche Gruppen veröffentlicht werden; Admins können „Jetzt neu berechnen“.',
        ],
        tips: [
          'Gruppen mit weniger als 3 Beschäftigten erscheinen nicht öffentlich.',
          'Änderungen gelten ab der nächsten Berechnung; Ergebnis über „Öffentliche Seite“ prüfen.',
        ],
      },
    },
  },
];
