import type { PageHelpEntry } from '../types.js';

/** Admin page help: compliance, AI and system pages. */
export const PAGES_SYSTEM: PageHelpEntry[] = [
  {
    route: 'privacy-requests/*',
    text: {
      az: {
        title: 'Məxfilik sorğuları',
        purpose: 'Müştərilərin DSGVO sorğuları (məlumatların surəti, düzəliş, silinmə, məhdudlaşdırma, etiraz) və razılıq jurnalı. Hər sorğuya 30 gün ərzində cavab verilməlidir. Administrator və Super admin üçündür.',
        steps: [
          '«Sorğular» tabında Açıq, İcradadır, Vaxtı keçib və «7 gün ərzində» göstəricilərinə baxın; siyahını status, növ, «Yalnız vaxtı keçənlər» və e-poçt ilə süzün.',
          'Sorğunu açın, sorğuçunu, əlaqəli hesabı və razılıq qeydlərini yoxlayın, sonra «İcraya götür» basın.',
          'Qərar qeydini yazıb «İcra edildi» və ya səbəblə «Rədd et» basın; sübut lazımdırsa «Razılıq jurnalı» tabında «CSV yüklə» edin.',
        ],
        tips: [
          'Hesabın silinməsini yalnız Super admin, sorğu «İcradadır» statusunda olanda icra edə bilər; bu geri qaytarılmır.',
          'Qərar qeydi sorğuçuya e-poçtla gedir — mətni diqqətlə yazın.',
        ],
      },
      ru: {
        title: 'Запросы о данных',
        purpose: 'Запросы клиентов по DSGVO (копия данных, исправление, удаление, ограничение, возражение) и журнал согласий. На каждый запрос нужно ответить в течение 30 дней. Для администраторов и суперадмина.',
        steps: [
          'На вкладке «Запросы» смотрите показатели Открыты, В работе, Просрочены и «Срок в течение 7 дней»; фильтруйте по статусу, типу, «Только просроченные» и e-mail.',
          'Откройте запрос, проверьте заявителя, связанный аккаунт и согласия, затем нажмите «Взять в работу».',
          'Напишите заметку о решении и нажмите «Выполнен» или «Отклонить» с причиной; для доказательств во вкладке «Журнал согласий» нажмите «Скачать CSV».',
        ],
        tips: [
          'Удаление аккаунта выполняет только суперадмин и только для запроса «В работе»; отменить его нельзя.',
          'Заметка о решении уходит заявителю по e-mail — формулируйте аккуратно.',
        ],
      },
      en: {
        title: 'Privacy requests',
        purpose: 'Clients’ GDPR requests (copy of data, rectification, deletion, restriction, objection) and the consent log. Every request must be answered within 30 days. For admins and the super admin.',
        steps: [
          'On the «Requests» tab check Open, In progress, Overdue and «Due within 7 days»; filter by status, type, «Overdue only» and e-mail.',
          'Open a request, check the requester, the linked account and the consent entries, then click «Start work».',
          'Write the decision note and click «Mark completed», or «Decline» with a reason; for evidence use «Download CSV» on the «Consent log» tab.',
        ],
        tips: [
          'Only the super admin can execute an account deletion, and only while the request is in progress; it cannot be undone.',
          'The decision note is e-mailed to the requester, so word it carefully.',
        ],
      },
      de: {
        title: 'Datenschutz-Anfragen',
        purpose: 'DSGVO-Anfragen der Kunden (Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch) und das Einwilligungsprotokoll. Jede Anfrage muss innerhalb von 30 Tagen beantwortet werden. Für Admins und Super-Admin.',
        steps: [
          'Im Tab „Anfragen“ die Kennzahlen Offen, In Bearbeitung, Überfällig und „In 7 Tagen fällig“ prüfen; nach Status, Art, „Nur überfällige“ und E-Mail filtern.',
          'Anfrage öffnen, Anfragende Person, verknüpftes Konto und Einwilligungen prüfen, dann „In Bearbeitung nehmen“ klicken.',
          'Entscheidungsnotiz schreiben und „Erledigt“ oder mit Begründung „Ablehnen“ klicken; als Nachweis im Tab „Einwilligungsprotokoll“ „CSV herunterladen“.',
        ],
        tips: [
          'Eine Kontolöschung führt nur der Super-Admin aus, und nur bei einer Anfrage in Bearbeitung; sie ist endgültig.',
          'Die Entscheidungsnotiz geht per E-Mail an die anfragende Person.',
        ],
      },
    },
  },
  {
    route: 'legal/*',
    text: {
      az: {
        title: 'Hüquqi mətnlər',
        purpose: 'AGB, məxfilik siyasəti və cookie siyasətinin versiyaları. Dərc edilən versiya saytda göstərilir, əvvəlki avtomatik arxivə düşür. Administrator və Super admin üçündür.',
        steps: [
          'Sənəd növünü seçin və «Yeni versiya» basın; başlığı, versiyanı, qüvvəyə minmə tarixini və hər dil üçün mətni yazın.',
          '«Önizləmə» və «Fərqlər» tablarında nəticəni və əvvəlki versiyadan fərqi yoxlayıb «Yadda saxla» basın.',
          'Lazımdırsa «Yenidən qəbul tələb olunur» işarəsini qoyun və «Dərc et» basın.',
        ],
        tips: [
          'Dərc edilmiş və arxiv versiyaları dəyişdirilmir — düzəliş üçün yeni versiya yaradın; lazımsız qaralamanı «Qaralamanı sil» ilə silin.',
          'Mətnləri dərc etməzdən əvvəl hüquqşünasa yoxlatdırın.',
        ],
      },
      ru: {
        title: 'Юридические тексты',
        purpose: 'Версии условий (AGB), политики конфиденциальности и политики cookie. Опубликованная версия показывается на сайте, предыдущая автоматически уходит в архив. Для администраторов и суперадмина.',
        steps: [
          'Выберите вид документа и нажмите «Новая версия»; заполните заголовок, версию, дату вступления в силу и текст на каждом языке.',
          'Проверьте результат и отличия от прошлой версии на вкладках «Предпросмотр» и «Изменения», затем нажмите «Сохранить».',
          'При необходимости отметьте «Требуется повторное согласие» и нажмите «Опубликовать».',
        ],
        tips: [
          'Опубликованные и архивные версии не редактируются — создайте новую; ненужный черновик удалите кнопкой «Удалить черновик».',
          'Перед публикацией дайте тексты на проверку юристу.',
        ],
      },
      en: {
        title: 'Legal texts',
        purpose: 'Versions of the terms (AGB), privacy policy and cookie policy. The published version is shown on the website and the previous one is archived automatically. For admins and the super admin.',
        steps: [
          'Pick the document type and click «New version»; fill in title, version, effective date and the text for each language.',
          'Check the result and the difference to the previous version on the «Preview» and «Changes» tabs, then click «Save».',
          'Tick «Requires re-acceptance» if needed and click «Publish».',
        ],
        tips: [
          'Published and archived versions are read-only: create a new version to change them; remove an unused draft with «Delete draft».',
          'Have a lawyer check the texts before publishing.',
        ],
      },
      de: {
        title: 'Rechtstexte',
        purpose: 'Versionen von AGB, Datenschutzerklärung und Cookie-Richtlinie. Die veröffentlichte Version erscheint auf der Website, die vorherige wird automatisch archiviert. Für Admins und Super-Admin.',
        steps: [
          'Dokumentart wählen und „Neue Version“ klicken; Titel, Version, Gültigkeitsdatum und den Text je Sprache ausfüllen.',
          'Ergebnis und Unterschied zur Vorversion in den Tabs „Vorschau“ und „Änderungen“ prüfen, dann „Speichern“.',
          'Bei Bedarf „Erneute Zustimmung erforderlich“ anhaken und „Veröffentlichen“ klicken.',
        ],
        tips: [
          'Veröffentlichte und archivierte Versionen sind schreibgeschützt: für Änderungen eine neue Version anlegen; unnötige Entwürfe mit „Entwurf löschen“ entfernen.',
          'Texte vor der Veröffentlichung anwaltlich prüfen lassen.',
        ],
      },
    },
  },
  {
    route: 'history',
    text: {
      az: {
        title: 'Dəyişikliklər',
        purpose: 'Müraciətlər, istifadəçilər və şirkətlər üzrə sahə səviyyəsində tarixçə: kim, nə vaxt, hansı sahəni nədən nəyə dəyişdi. Səhv dəyişiklik buradan geri qaytarılır. Administrator və Super admin üçündür.',
        steps: [
          'Filtrlərlə axtarın: Obyekt, Sahə, İcraçı, Mənbə (Əməkdaş, Müştəri, Sistem, Avtomatlaşdırma və s.) və tarix aralığı.',
          'Qeyddə köhnə və yeni dəyəri müqayisə edin; bir əməliyyatın bütün dəyişiklikləri birlikdə qruplaşdırılıb.',
          'Səhv dəyişiklikdə «Geri qaytar» (və ya qrup üçün «Hamısını geri qaytar») basın və pəncərədə nəticəni yoxlayıb təsdiqləyin.',
        ],
        tips: [
          'Geri qaytarma da tarixçəyə «geri qaytarma» kimi yazılır; filtri təmizləmək üçün «Sıfırla» basın.',
          'Eyni tarixçə müraciət, müştəri profili və şirkət səhifələrində də açılır.',
        ],
      },
      ru: {
        title: 'Изменения',
        purpose: 'История на уровне полей по заявкам, пользователям и компаниям: кто, когда и какое поле изменил. Отсюда же ошибочное изменение отменяется. Для администраторов и суперадмина.',
        steps: [
          'Ищите через фильтры: Объект, Поле, Кто изменил, Источник (сотрудник, клиент, система, автоматизация и др.) и период.',
          'Сравните старое и новое значение; изменения одной операции сгруппированы вместе.',
          'При ошибке нажмите «Отменить» (или «Отменить всё» для группы), проверьте результат в окне и подтвердите.',
        ],
        tips: [
          'Отмена тоже попадает в историю с пометкой «отмена»; фильтры сбрасываются кнопкой «Сбросить».',
          'Та же история открывается на странице заявки, профиля клиента и компании.',
        ],
      },
      en: {
        title: 'Changes',
        purpose: 'Field-level history of cases, users and companies: who changed which field, when, from what to what. A wrong change can be reverted from here. For admins and the super admin.',
        steps: [
          'Search with the filters: Record, Field, Changed by, Source (staff, client, system, automation …) and date range.',
          'Compare the old and new value; all changes of one operation are grouped together.',
          'For a wrong change click «Revert» (or «Revert all» for a group), check the result in the dialog and confirm.',
        ],
        tips: [
          'A revert is logged too, marked as a revert; clear the filters with «Reset».',
          'The same history opens on the case, client profile and company pages.',
        ],
      },
      de: {
        title: 'Änderungen',
        purpose: 'Feldgenauer Verlauf von Anträgen, Benutzern und Firmen: wer wann welches Feld von was auf was geändert hat. Fehlerhafte Änderungen lassen sich hier zurücknehmen. Für Admins und Super-Admin.',
        steps: [
          'Mit den Filtern suchen: Objekt, Feld, Bearbeiter, Quelle (Mitarbeiter, Kunde, System, Automatisierung …) und Zeitraum.',
          'Alten und neuen Wert vergleichen; alle Änderungen eines Vorgangs sind gruppiert.',
          'Bei einem Fehler „Rückgängig“ (bzw. „Alle rückgängig“ für die Gruppe) klicken, das Ergebnis im Dialog prüfen und bestätigen.',
        ],
        tips: [
          'Auch das Zurücknehmen wird protokolliert; Filter mit „Zurücksetzen“ leeren.',
          'Derselbe Verlauf öffnet sich auf der Antrags-, Kundenprofil- und Firmenseite.',
        ],
      },
    },
  },
  {
    route: 'security',
    text: {
      az: {
        title: 'Təhlükəsizlik',
        purpose: 'Öz hesabınızın təhlükəsizliyi: iki addımlı doğrulama (2FA), şifrə və e-poçt dəyişikliyi, səhər icmalı e-poçtu. 2FA əməkdaşlar üçün məcburidir — qurulmayana qədər panelin qalan hissəsi bağlıdır.',
        steps: [
          '«Quraşdırmaya başla» basın, QR kodu autentifikator tətbiqi ilə skan edin, 6 rəqəmli kodu yazıb «Aktivləşdir» basın.',
          'Bərpa kodlarını «Endir (.txt)» və ya «Hamısını kopyala» ilə saxlayın; azaldıqda «Yeni bərpa kodları» yaradın.',
          'Aşağıdakı kartlarda şifrənizi və e-poçtunuzu dəyişin, səhər icmalını aktiv edin və ya söndürün.',
        ],
        tips: [
          'Super admin «Əməkdaşların 2FA vəziyyəti» siyahısında telefonunu itirmiş əməkdaşın 2FA-sını «Sıfırla» ilə sıfırlayır.',
          'Administratorlar burada ehtiyat nüsxələrin həftəlik bərpa testinin nəticəsini də görür.',
        ],
      },
      ru: {
        title: 'Безопасность',
        purpose: 'Безопасность вашего аккаунта: двухфакторная аутентификация (2FA), смена пароля и e-mail, утренняя сводка по почте. Для сотрудников 2FA обязательна — без неё остальная панель закрыта.',
        steps: [
          'Нажмите «Начать настройку», отсканируйте QR-код приложением-аутентификатором, введите 6-значный код и нажмите «Включить».',
          'Сохраните коды восстановления через «Скачать (.txt)» или «Копировать все»; когда их мало, создайте «Новые коды восстановления».',
          'В карточках ниже смените пароль и e-mail, включите или выключите утреннюю сводку.',
        ],
        tips: [
          'Суперадмин в списке «Статус 2FA сотрудников» сбрасывает 2FA сотрудника, потерявшего телефон, кнопкой «Сбросить».',
          'Администраторы видят здесь и результат еженедельной проверки восстановления резервных копий.',
        ],
      },
      en: {
        title: 'Security',
        purpose: 'Your own account security: two-factor authentication (2FA), password and e-mail change, the morning digest e-mail. 2FA is mandatory for staff: the rest of the panel stays locked until it is set up.',
        steps: [
          'Click «Start setup», scan the QR code with an authenticator app, type the 6-digit code and click «Activate».',
          'Save the recovery codes with «Download (.txt)» or «Copy all»; when they run low, create «New recovery codes».',
          'Use the cards below to change your password and e-mail and to switch the morning digest on or off.',
        ],
        tips: [
          'The super admin resets the 2FA of a colleague who lost their phone in «Staff 2FA status» with «Reset».',
          'Admins also see the result of the weekly backup restore test here.',
        ],
      },
      de: {
        title: 'Sicherheit',
        purpose: 'Sicherheit Ihres eigenen Kontos: Zwei-Faktor-Authentifizierung (2FA), Passwort- und E-Mail-Änderung, Morgen-Zusammenfassung per E-Mail. 2FA ist für Mitarbeitende Pflicht – ohne sie bleibt der Rest des Panels gesperrt.',
        steps: [
          '„Einrichtung starten“ klicken, QR-Code mit einer Authenticator-App scannen, 6-stelligen Code eingeben und „Aktivieren“.',
          'Wiederherstellungscodes mit „Herunterladen (.txt)“ oder „Alle kopieren“ sichern; werden sie knapp, „Neue Wiederherstellungscodes“ erzeugen.',
          'In den Karten darunter Passwort und E-Mail ändern und die Morgen-Zusammenfassung ein- oder ausschalten.',
        ],
        tips: [
          'Der Super-Admin setzt unter „2FA-Status der Mitarbeiter“ die 2FA bei verlorenem Telefon mit „Zurücksetzen“ zurück.',
          'Admins sehen hier auch das Ergebnis des wöchentlichen Backup-Wiederherstellungstests.',
        ],
      },
    },
  },
  {
    route: 'security-alerts',
    text: {
      az: {
        title: 'Təhlükəsizlik xəbərdarlıqları',
        purpose: 'Şübhəli girişlər və hesab fəaliyyəti üzrə qayda xəbərdarlıqları. Qaydalar hər 10 dəqiqədən bir və kritik hadisələrdə dərhal yoxlanılır. Yalnız Super admin üçündür.',
        steps: [
          'Filtrlərdən birini seçin: Açıq, Baxılıb, Yalnış həyəcan, Hamısı; dərhal yoxlamaq üçün «İndi yoxla» basın.',
          'Kartda faktları oxuyun, lazım olsa «AI ilə izah et» basın.',
          'Hərəkət edin: «Baxdım», «Sessiyaları bağla», «İstifadəçini deaktiv et», «2FA-nı sıfırla» və ya «Yalnış həyəcan».',
        ],
        tips: [
          '«Yalnış həyəcan» eyni halı 7 gün susdurur.',
          'Aşağıdakı «Qaydalar və hədlər» panelində hədləri, e-poçt xəbərdarlığını və AI izahını tənzimləyin.',
        ],
      },
      ru: {
        title: 'Предупреждения безопасности',
        purpose: 'Предупреждения правил о подозрительных входах и активности аккаунтов. Правила проверяются каждые 10 минут и сразу после критических событий. Только для суперадмина.',
        steps: [
          'Выберите фильтр: Открытые, Просмотренные, Ложные, Все; для немедленной проверки нажмите «Проверить сейчас».',
          'Прочитайте факты в карточке, при необходимости нажмите «Объяснить с AI».',
          'Действуйте: «Просмотрено», «Завершить сессии пользователя», «Отключить пользователя», «Сбросить 2FA» или «Ложная тревога».',
        ],
        tips: [
          '«Ложная тревога» отключает тот же случай на 7 дней.',
          'В панели «Правила и пороги» ниже настраиваются пороги, e-mail-оповещения и объяснение AI.',
        ],
      },
      en: {
        title: 'Security alerts',
        purpose: 'Rule-based alerts about suspicious sign-ins and account activity. The rules run every 10 minutes and immediately after critical events. Super admin only.',
        steps: [
          'Choose a filter: Open, Acknowledged, False positive, All; click «Check now» to run the rules at once.',
          'Read the facts on the card and click «Explain with AI» if needed.',
          'Act: «Acknowledge», «Revoke this user’s sessions», «Disable user», «Reset 2FA» or «Mark false positive».',
        ],
        tips: [
          '«Mark false positive» keeps the same pattern silent for 7 days.',
          'Tune thresholds, e-mail alerts and the AI explanation in the «Rules and thresholds» panel below.',
        ],
      },
      de: {
        title: 'Sicherheitswarnungen',
        purpose: 'Regelbasierte Warnungen zu verdächtigen Anmeldungen und Kontoaktivität. Die Regeln laufen alle 10 Minuten und sofort nach kritischen Ereignissen. Nur für den Super-Admin.',
        steps: [
          'Filter wählen: Offen, Gesehen, Fehlalarm, Alle; mit „Jetzt prüfen“ sofort prüfen.',
          'Fakten auf der Karte lesen, bei Bedarf „Mit KI erklären“ klicken.',
          'Handeln: „Gesehen“, „Sitzungen beenden“, „Benutzer deaktivieren“, „2FA zurücksetzen“ oder „Fehlalarm“.',
        ],
        tips: [
          '„Fehlalarm“ schaltet das gleiche Muster 7 Tage stumm.',
          'Grenzwerte, E-Mail-Benachrichtigung und KI-Erklärung im Bereich „Regeln und Grenzwerte“ unten einstellen.',
        ],
      },
    },
  },
  {
    route: 'sensitive-access',
    text: {
      az: {
        title: 'Həssas məlumat girişləri',
        purpose: 'Hansı rollar üçün pasport nömrəsi, IBAN və digər həssas sahələrin gizlədildiyi və kimin onları hansı səbəblə açdığı. Yalnız Super admin üçündür.',
        steps: [
          '«Gizlətmə qaydaları» bölməsində Əməkdaş və Admin rolları üçün gizlədiləcək sahə qruplarını seçib «Yadda saxla» basın.',
          '«Açılma jurnalı»nda kim, nə vaxt, hansı sahəni və hansı səbəblə açdığını görün.',
          'Jurnalı İcraçı, Obyekt, Sahə və tarix üzrə süzün; lazım olsa «CSV ixrac» basın.',
        ],
        tips: [
          'Gizlədilmiş sahələr API cavablarında və ixraclarda «•••• 3456» kimi görünür; Super admin həmişə tam məlumatı görür.',
        ],
      },
      ru: {
        title: 'Доступ к конфиденциальным данным',
        purpose: 'Для каких ролей скрываются номер паспорта, IBAN и другие чувствительные поля, и кто, когда и почему их открывал. Только для суперадмина.',
        steps: [
          'В блоке «Правила маскирования» выберите группы полей для ролей Сотрудники и Админ и нажмите «Сохранить».',
          'В «Журнале открытий» смотрите, кто, когда, какое поле и по какой причине открыл.',
          'Фильтруйте журнал по сотруднику, объекту, полю и дате; при необходимости нажмите «Экспорт CSV».',
        ],
        tips: [
          'Скрытые поля показываются в ответах API и выгрузках как «•••• 3456»; суперадмин всегда видит полные данные.',
        ],
      },
      en: {
        title: 'Sensitive data access',
        purpose: 'Which roles see passport numbers, IBANs and other sensitive fields masked, and who revealed them, when and why. Super admin only.',
        steps: [
          'In «Masking rules» pick the field groups to mask for the Staff and Admin roles and click «Save».',
          'In the «Reveal log» see who revealed which field, when and for what reason.',
          'Filter the log by person, record, field and date; click «Export CSV» if needed.',
        ],
        tips: [
          'Masked fields appear as «•••• 3456» in API responses and exports; the super admin always sees the full data.',
        ],
      },
      de: {
        title: 'Zugriffe auf sensible Daten',
        purpose: 'Für welche Rollen Passnummer, IBAN und andere sensible Felder maskiert werden und wer sie wann und aus welchem Grund aufgedeckt hat. Nur für den Super-Admin.',
        steps: [
          'Unter „Maskierungsregeln“ die Feldgruppen für die Rollen Mitarbeitende und Admin wählen und „Speichern“.',
          'Im „Protokoll der Aufdeckungen“ sehen, wer wann welches Feld mit welchem Grund aufgedeckt hat.',
          'Protokoll nach Person, Objekt, Feld und Datum filtern; bei Bedarf „CSV-Export“.',
        ],
        tips: [
          'Maskierte Felder erscheinen in API-Antworten und Exporten als „•••• 3456“; der Super-Admin sieht immer alles.',
        ],
      },
    },
  },
  {
    route: 'access',
    text: {
      az: {
        title: 'Giriş Mərkəzi',
        purpose: 'Kimin nəyi görə və dəyişə biləcəyini bir yerdə idarə edin: əməkdaş rolları, görünən müraciətlər, partnyorlar, işəgötürənlər və həssas sahələr. Hər dəyişiklik jurnala yazılır.',
        steps: [
          '«Əməkdaş rolları» bölməsində əməkdaşa şablon seçin (məsələn Mühasib) və lazım olsa ayrıca icazə açın və ya bağlayın.',
          '«Müraciətlərin görünməsi» bölməsində əməkdaşın hamısını, yalnız öz müraciətlərini və ya komandasının müraciətlərini görməsini seçin.',
          '«Nə edə bilər?» basıb nəticəni yoxlayın; təcili girişləri aşağıdakı siyahıda izləyin və lazım olsa ləğv edin.',
        ],
        tips: ['Standart şablon bugünkü girişdir: heç nə dəyişməsəniz, heç kimin girişi dəyişmir. Super admin həmişə hər şeyi görür.'],
      },
      ru: {
        title: 'Центр доступа',
        purpose: 'Кто что может видеть и менять — в одном месте: роли сотрудников, видимость дел, партнёры, работодатели и чувствительные поля. Каждое изменение записывается в журнал.',
        steps: [
          'В «Ролях сотрудников» назначьте шаблон (например, Бухгалтер) и при необходимости откройте или закройте отдельные права.',
          'В «Видимости дел» выберите: все дела, только свои или дела команды.',
          'Нажмите «Что может?», чтобы проверить итог; экстренный доступ смотрите и отзывайте в списке ниже.',
        ],
        tips: ['Стандартный шаблон — это текущий доступ: если ничего не менять, ни у кого ничего не изменится. Супер-админ всегда видит всё.'],
      },
      en: {
        title: 'Access Center',
        purpose: 'Manage in one place who may see and change what: staff roles, case visibility, partners, employers and sensitive fields. Every change is logged.',
        steps: [
          'In «Staff roles» pick a template for a staff member (e.g. Accountant) and open or close single permissions if needed.',
          'In «Case visibility» choose whether they see all cases, only their own or their team’s cases.',
          'Click «What can they do?» to check the result; review and revoke emergency access in the list below.',
        ],
        tips: ['The default template is today’s access: if you change nothing, nobody’s access changes. Super admins always see everything.'],
      },
      de: {
        title: 'Access Center',
        purpose: 'An einem Ort festlegen, wer was sehen und ändern darf: Mitarbeiterrollen, Sichtbarkeit der Fälle, Partner, Arbeitgeber und sensible Felder. Jede Änderung wird protokolliert.',
        steps: [
          'Unter «Mitarbeiterrollen» eine Vorlage wählen (z. B. Buchhaltung) und bei Bedarf einzelne Rechte öffnen oder sperren.',
          'Unter «Sichtbarkeit der Fälle» festlegen: alle Fälle, nur eigene oder die des Teams.',
          'Mit «Was darf die Person?» das Ergebnis prüfen; Notfallzugriffe in der Liste unten einsehen und widerrufen.',
        ],
        tips: ['Die Standardvorlage ist der bisherige Zugriff: Ohne Änderung ändert sich für niemanden etwas. Super-Admins sehen immer alles.'],
      },
    },
  },
  {
    route: 'storage',
    text: {
      az: {
        title: 'Yaddaş hesabatı',
        purpose: 'Drive-da nə qədər yer tutulduğunu göstərir: bölmələr, qovluqlar, yükləyənlər, fayl növləri, zibil qutusu və köhnə versiyalar; həmçinin bağlanmış müraciət qovluqlarının arxiv və silinmə müddəti. Administrator və Super admin üçündür.',
        steps: [
          'Yuxarıda «Cari fayllar», «Köhnə versiyalar» və «Zibil qutusu» həcmlərinə və «Aylıq artım»a baxın.',
          '«Ən böyük qovluqlar» və «Ən böyük fayllar» siyahılarından yeri tutan faylları tapıb açın.',
          '«Saxlama müddəti və arxiv» bölməsində arxivə köçürmə və silinmə ay sayını yazıb «Yadda saxla» basın; növbəti günlərin siyahısını yoxlayın.',
        ],
        tips: [
          'Final qovluqlar və «legal hold» olanlar heç vaxt arxivə və ya zibilə atılmır; qovluğu «Saxla (legal hold)» ilə qoruyun.',
          'Drive silinmə müddəti Parametrlərdəki sənəd saxlama müddətindən qısa olmamalıdır.',
        ],
      },
      ru: {
        title: 'Отчёт о хранилище',
        purpose: 'Сколько места занимает диск: разделы, папки, загрузившие, типы файлов, корзина и старые версии; а также сроки архивации и удаления папок закрытых заявок. Для администраторов и суперадмина.',
        steps: [
          'Вверху посмотрите объёмы «Текущие файлы», «Старые версии», «Корзина» и «Рост по месяцам».',
          'В списках «Самые большие папки» и «Самые большие файлы» найдите и откройте то, что занимает место.',
          'В блоке «Срок хранения и архив» укажите месяцы до архивации и удаления и нажмите «Сохранить»; проверьте список на ближайшие дни.',
        ],
        tips: [
          'Финальные папки и папки с legal hold никогда не архивируются и не удаляются; защитите папку кнопкой «Legal hold».',
          'Срок удаления на диске не должен быть короче срока хранения документов в Настройках.',
        ],
      },
      en: {
        title: 'Storage report',
        purpose: 'How much space the drive uses: sections, folders, uploaders, file types, recycle bin and old versions, plus the archive and deletion periods for folders of closed cases. For admins and the super admin.',
        steps: [
          'At the top check «Current files», «Old versions», «Recycle bin» and «Growth per month».',
          'Use «Largest folders» and «Largest files» to find and open what takes up the space.',
          'In «Retention and archive» set the months until archiving and deletion, click «Save» and check the preview of the coming days.',
        ],
        tips: [
          'Final folders and folders on legal hold are never archived or deleted; protect a folder with «Legal hold».',
          'The drive deletion period should not be shorter than the case document retention in Settings.',
        ],
      },
      de: {
        title: 'Speicherbericht',
        purpose: 'Wie viel Platz das Drive belegt: Bereiche, Ordner, Uploader, Dateitypen, Papierkorb und alte Versionen, dazu Archiv- und Löschfristen für Ordner abgeschlossener Anträge. Für Admins und Super-Admin.',
        steps: [
          'Oben „Aktuelle Dateien“, „Alte Versionen“, „Papierkorb“ und „Wachstum pro Monat“ prüfen.',
          'Über „Größte Ordner“ und „Größte Dateien“ die Platzfresser finden und öffnen.',
          'Unter „Aufbewahrung und Archiv“ die Monate bis Archivierung und Löschung eintragen, „Speichern“ und die Vorschau der nächsten Tage prüfen.',
        ],
        tips: [
          'Finale Ordner und Ordner mit Legal Hold werden nie archiviert oder gelöscht; Ordner mit „Legal Hold“ schützen.',
          'Die Drive-Löschfrist sollte nicht kürzer sein als die Aufbewahrung der Antragsdokumente in den Einstellungen.',
        ],
      },
    },
  },
  {
    route: 'ai',
    text: {
      az: {
        title: 'AI köməkçi',
        purpose: 'Super adminin iş köməkçisi: Disk, cədvəllər, müştərilər və hesablaşmalar üzrə sual verin və ya tapşırıq yazın. Hər dəyişiklik yalnız sizin təsdiqinizlə icra olunur.',
        steps: [
          'Tapşırığı yazın (məs. «Bu həftə müddəti bitən sənədləri göstər») və ya nümunə suallardan birini seçin.',
          'Köməkçi dəyişiklik təklif edəndə təsdiq kartını oxuyun və «Təsdiqlə» və ya «İmtina et» basın.',
          'Köhnə söhbətlərə «Söhbətlər» siyahısından qayıdın, yenisi üçün «Yeni söhbət» basın.',
        ],
        tips: [
          'Model və xərc limitləri «Parametrlər» düyməsi ilə açılan AI parametrlərindədir; e-poçt təhlili qaydaları ayrıca düymədədir.',
          'AI səhv edə bilər — nəticələri yoxlayın. Bölmə «AI köməkçi» modulu söndürüləndə gizlənir.',
        ],
      },
      ru: {
        title: 'AI-помощник',
        purpose: 'Рабочий помощник суперадмина: вопросы и задачи по диску, таблицам, клиентам и расчётам. Любое изменение выполняется только после вашего подтверждения.',
        steps: [
          'Опишите задачу (например, «Покажи документы, срок которых истекает на этой неделе») или выберите пример.',
          'Когда помощник предлагает изменение, прочитайте карточку подтверждения и нажмите «Подтвердить» или «Отклонить».',
          'Возвращайтесь к прошлым диалогам через список «Чаты», новый начните кнопкой «Новый чат».',
        ],
        tips: [
          'Модели и лимиты расходов — в настройках ИИ (кнопка «Настройки»); правила анализа почты — отдельной кнопкой.',
          'AI может ошибаться — проверяйте результат. Раздел скрыт, если модуль AI-помощника выключен.',
        ],
      },
      en: {
        title: 'AI assistant',
        purpose: 'The super admin’s operations assistant: ask questions or give tasks about the drive, sheets, clients and settlements. Every change runs only after you confirm it.',
        steps: [
          'Describe the task (e.g. «Show documents expiring this week») or pick one of the examples.',
          'When the assistant proposes a change, read the confirmation card and click «Confirm» or «Reject».',
          'Go back to earlier conversations in the «Chats» list or start a «New chat».',
        ],
        tips: [
          'Models and cost limits are in the AI settings («Settings» button); mail triage rules have their own button.',
          'The AI can make mistakes, so check the results. The page is hidden when the AI assistant module is switched off.',
        ],
      },
      de: {
        title: 'KI-Assistent',
        purpose: 'Arbeitsassistent des Super-Admins: Fragen und Aufgaben zu Drive, Tabellen, Kunden und Abrechnungen. Jede Änderung wird erst nach Ihrer Bestätigung ausgeführt.',
        steps: [
          'Aufgabe eingeben (z. B. „Zeig Dokumente, die diese Woche ablaufen“) oder ein Beispiel wählen.',
          'Schlägt der Assistent eine Änderung vor, die Bestätigungskarte lesen und „Bestätigen“ oder „Ablehnen“ klicken.',
          'Frühere Unterhaltungen über die Liste „Chats“ öffnen, mit „Neuer Chat“ neu beginnen.',
        ],
        tips: [
          'Modelle und Kostenlimits stehen in den KI-Einstellungen (Button „Einstellungen“); die Regeln der E-Mail-Analyse haben einen eigenen Button.',
          'Die KI kann irren – Ergebnisse prüfen. Die Seite ist ausgeblendet, wenn das Modul KI-Assistent aus ist.',
        ],
      },
    },
  },
  {
    route: 'ai/settings',
    text: {
      az: {
        title: 'AI parametrləri',
        purpose: 'AI köməkçinin modelləri, OpenRouter açarı, xərc limitləri və istifadə statistikası. Yalnız Super admin üçündür.',
        steps: [
          'Yuxarıda «Bu ay xərclənib» və «Açarda qalan kredit» göstəricilərini yoxlayın.',
          '«Modellər» bölməsində müştəri və admin modellərini seçin, «Müştəri köməkçisi» və «AI sənəd yoxlaması»nı aktiv edin və ya söndürün, lazım olsa açarı yazın.',
          '«Limitlər»də aylıq büdcəni və gündəlik limitləri yazıb «Yadda saxla» basın; «İstifadə» bölməsində günlər və istifadəçilər üzrə xərcə baxın.',
        ],
        tips: [
          'Aylıq büdcə dolanda AI sorğuları dayanır — limitləri real istifadəyə görə qurun.',
          'Açar sahəsi boş qalsa, serverdəki açar istifadə olunur.',
        ],
      },
      ru: {
        title: 'Настройки ИИ',
        purpose: 'Модели AI-помощника, ключ OpenRouter, лимиты расходов и статистика использования. Только для суперадмина.',
        steps: [
          'Вверху проверьте «Потрачено в этом месяце» и «Остаток на ключе».',
          'В блоке «Модели» выберите модели для клиентов и админа, включите или выключите помощника клиентов и AI-проверку документов, при необходимости введите ключ.',
          'В «Лимитах» задайте месячный бюджет и дневные лимиты и нажмите «Сохранить»; в «Использовании» смотрите расходы по дням и пользователям.',
        ],
        tips: [
          'Когда месячный бюджет исчерпан, запросы к AI останавливаются — ставьте лимиты по реальному расходу.',
          'Если поле ключа пустое, используется ключ сервера.',
        ],
      },
      en: {
        title: 'AI settings',
        purpose: 'Models of the AI assistant, the OpenRouter key, cost limits and usage statistics. Super admin only.',
        steps: [
          'At the top check «Spent this month» and «Key credit left».',
          'Under «Models» pick the client and admin models, switch the client assistant and the AI document check on or off, and enter a key if needed.',
          'Under «Limits» set the monthly budget and daily limits and click «Save»; «Usage» shows costs per day and per user.',
        ],
        tips: [
          'When the monthly budget is used up, AI requests stop, so set limits that match real usage.',
          'If the key field is empty, the server key is used.',
        ],
      },
      de: {
        title: 'KI-Einstellungen',
        purpose: 'Modelle des KI-Assistenten, OpenRouter-Schlüssel, Kostenlimits und Nutzungsstatistik. Nur für den Super-Admin.',
        steps: [
          'Oben „Diesen Monat ausgegeben“ und „Restguthaben des Schlüssels“ prüfen.',
          'Unter „Modelle“ die Kunden- und Admin-Modelle wählen, Kunden-Assistent und KI-Dokumentenprüfung ein- oder ausschalten, bei Bedarf den Schlüssel eintragen.',
          'Unter „Limits“ Monatsbudget und Tageslimits setzen und „Speichern“; „Nutzung“ zeigt Kosten pro Tag und Benutzer.',
        ],
        tips: [
          'Ist das Monatsbudget aufgebraucht, stoppen die KI-Anfragen – Limits an der echten Nutzung ausrichten.',
          'Bleibt das Schlüsselfeld leer, wird der Schlüssel des Servers verwendet.',
        ],
      },
    },
  },
  {
    route: 'ai/mail-triage',
    text: {
      az: {
        title: 'Poçt triajı',
        purpose: 'Gələn məktubların AI təhlili qaydaları: kateqoriya, təcililik, qısa xülasə və cavab layihəsi. AI yalnız təklif edir, hərəkəti əməkdaş bir kliklə edir. Yalnız Super admin üçündür.',
        steps: [
          '«AI təhlili aktivdir» açarını yandırın və avtomatik lid, məsula bildiriş və «AI · …» etiketləri seçimlərini təyin edin.',
          '«Avtomatik təhlil olunan poçt qutuları» siyahısında lazımi ünvanları işarələyin.',
          '«Yönləndirmə» bölməsində hər kateqoriya (Namizəd, İşəgötürən, Partnyor və s.) üçün məsul əməkdaşı seçib «Yadda saxla» basın.',
        ],
        tips: [
          'Açar söndürüləndə heç bir AI sorğusu göndərilmir — nə avtomatik, nə kliklə.',
          'Mövcud müştərilərin məktubları avtomatik onların menecerinə təklif olunur.',
        ],
      },
      ru: {
        title: 'Сортировка почты',
        purpose: 'Правила AI-анализа входящих писем: категория, срочность, краткое резюме и черновик ответа. AI только предлагает, действует сотрудник одним кликом. Только для суперадмина.',
        steps: [
          'Включите «AI-анализ включён» и задайте опции: автоматический лид, уведомление ответственного и метки «AI · …».',
          'В списке «Автоматически анализируемые ящики» отметьте нужные адреса.',
          'В блоке «Маршрутизация» выберите ответственного для каждой категории (Кандидат, Работодатель, Партнёр и др.) и нажмите «Сохранить».',
        ],
        tips: [
          'Если анализ выключен, запросы к AI не отправляются вовсе — ни автоматически, ни по клику.',
          'Письма текущих клиентов автоматически предлагаются их менеджеру.',
        ],
      },
      en: {
        title: 'Mail triage',
        purpose: 'Rules for the AI analysis of incoming e-mail: category, urgency, a short summary and a reply draft. The AI only proposes; staff act with one click. Super admin only.',
        steps: [
          'Turn on «AI triage is on» and set the options: automatic lead, notify the responsible person and «AI · …» labels.',
          'In «Mailboxes analyzed automatically» tick the addresses you want.',
          'Under «Routing» pick the responsible person per category (Candidate, Employer, Partner …) and click «Save».',
        ],
        tips: [
          'When triage is off, no AI requests are sent at all, neither automatic nor on click.',
          'E-mails from existing clients are suggested to their case manager automatically.',
        ],
      },
      de: {
        title: 'E-Mail-Triage',
        purpose: 'Regeln für die KI-Analyse eingehender E-Mails: Kategorie, Dringlichkeit, kurze Zusammenfassung und Antwortentwurf. Die KI schlägt nur vor; das Team handelt mit einem Klick. Nur für den Super-Admin.',
        steps: [
          '„KI-Analyse aktiv“ einschalten und die Optionen setzen: automatischer Lead, Benachrichtigung der zuständigen Person und „KI · …“-Labels.',
          'Unter „Automatisch analysierte Postfächer“ die gewünschten Adressen anhaken.',
          'Unter „Weiterleitung“ pro Kategorie (Bewerber, Arbeitgeber, Partner …) die zuständige Person wählen und „Speichern“.',
        ],
        tips: [
          'Ist die Analyse aus, werden gar keine KI-Anfragen gesendet – weder automatisch noch per Klick.',
          'E-Mails von Bestandskunden werden automatisch ihrem Fallbearbeiter vorgeschlagen.',
        ],
      },
    },
  },
  {
    route: 'settings',
    text: {
      az: {
        title: 'Parametrlər',
        purpose: 'Saytın və panelin əsas parametrləri: əlaqə məlumatları və ofislər, sosial şəbəkələr, avtomatik təyinat, «Almaniyada həyat» rəqəmləri, Impressum, məxfilik siyasəti və DSGVO saxlama müddətləri. Administrator və Super admin üçündür.',
        steps: [
          '«Əlaqə məlumatları» və «Sosial şəbəkələr» bölmələrində telefon, e-poçt, ofisləri və linkləri yeniləyin.',
          '«Avtomatik təyinat»da rejimi (söndürülüb, növbə ilə, ən az yüklü) və əməkdaş hovuzunu seçin.',
          'Impressum, məxfilik siyasəti və saxlama müddətlərini doldurun; hər bölməni öz «Yadda saxla» düyməsi ilə saxlayın.',
        ],
        tips: [
          'Dəyişikliklər saytda dərhal görünür; hüquqi mətnləri hüquqşünasa yoxlatdırın.',
          'Saxlama müddəti bitəndə bağlanmış müraciətlərin sənəd faylları geri qaytarılmadan silinir.',
          '«Mövzu (dizayn)» panelini yalnız Super admin görür.',
        ],
      },
      ru: {
        title: 'Настройки',
        purpose: 'Основные параметры сайта и панели: контакты и офисы, соцсети, автоназначение, цифры «Жизнь в Германии», Impressum, политика конфиденциальности и сроки хранения по DSGVO. Для администраторов и суперадмина.',
        steps: [
          'В блоках «Контактные данные» и «Социальные сети» обновите телефон, e-mail, офисы и ссылки.',
          'В «Автоназначении» выберите режим (выключено, по очереди, наименее загруженному) и пул сотрудников.',
          'Заполните Impressum, политику конфиденциальности и сроки хранения; каждый блок сохраняйте своей кнопкой «Сохранить».',
        ],
        tips: [
          'Изменения сразу видны на сайте; юридические тексты проверяйте у юриста.',
          'По истечении срока хранения файлы документов закрытых заявок удаляются безвозвратно.',
          'Панель «Тема (дизайн)» видит только суперадмин.',
        ],
      },
      en: {
        title: 'Settings',
        purpose: 'Core settings of the site and panel: contact details and offices, social networks, automatic assignment, «Life in Germany» numbers, Impressum, privacy policy and GDPR retention periods. For admins and the super admin.',
        steps: [
          'Update phone, e-mail, offices and links in «Contact details» and «Social networks».',
          'Under «Automatic assignment» choose the mode (off, round-robin, least loaded) and the staff pool.',
          'Fill in the Impressum, privacy policy and retention periods; save each section with its own «Save» button.',
        ],
        tips: [
          'Changes are live on the site immediately; have a lawyer check the legal texts.',
          'When the retention period ends, document files of closed cases are deleted for good.',
          'Only the super admin sees the «Theme (design)» panel.',
        ],
      },
      de: {
        title: 'Einstellungen',
        purpose: 'Grundeinstellungen von Website und Panel: Kontaktdaten und Büros, soziale Netzwerke, automatische Zuweisung, Zahlen „Leben in Deutschland“, Impressum, Datenschutzerklärung und DSGVO-Aufbewahrungsfristen. Für Admins und Super-Admin.',
        steps: [
          'Unter „Kontaktdaten“ und „Soziale Netzwerke“ Telefon, E-Mail, Büros und Links pflegen.',
          'Unter „Automatische Zuweisung“ den Modus (aus, reihum, am wenigsten ausgelastet) und den Mitarbeiter-Pool wählen.',
          'Impressum, Datenschutzerklärung und Aufbewahrungsfristen ausfüllen; jeden Bereich mit seinem eigenen „Speichern“ sichern.',
        ],
        tips: [
          'Änderungen sind sofort auf der Website sichtbar; Rechtstexte anwaltlich prüfen lassen.',
          'Nach Ablauf der Aufbewahrungsfrist werden Dokumentdateien abgeschlossener Anträge endgültig gelöscht.',
          'Den Bereich „Theme (Design)“ sieht nur der Super-Admin.',
        ],
      },
    },
  },
  {
    route: 'trust',
    text: {
      az: {
        title: 'Etibar mərkəzi və AVV',
        purpose: 'İctimai Etibar mərkəzi üçün faktlar və işəgötürənlər üçün AVV (DSGVO maddə 28) şablonu, həmçinin işəgötürənlərlə imzalanmış AVV-lər. Administrator və Super admin üçündür.',
        steps: [
          '«Etibar mərkəzi – sahibin məlumatları» bölməsində yalnız özünüzün yoxladığı faktları (məs. məlumat mərkəzinin yeri) yazıb «Yadda saxla» basın.',
          '«Nümunə PDF» ilə AVV şablonuna baxın; hüquqşünas yoxladıqdan sonra «AVV şablonu təsdiqlənib» açarını yandırın.',
          '«İşəgötürənlərlə AVV» siyahısında imzalanmış müqavilələri izləyin və «İkinci imzaya keç» ilə bizim imzanı qoyun.',
        ],
        tips: [
          'Şablon təsdiqlənməyənə qədər işəgötürənlər AVV-ni portalda görmür; yeni şablon versiyası yenidən təsdiq tələb edir.',
          'Boş sahələr saytda göstərilmir. Tədbirlər və alt-emalçılar koddan və konfiqurasiyadan avtomatik gəlir.',
        ],
      },
      ru: {
        title: 'Центр доверия и AVV',
        purpose: 'Факты для публичного Центра доверия, шаблон AVV (ст. 28 DSGVO) для работодателей и подписанные с работодателями AVV. Для администраторов и суперадмина.',
        steps: [
          'В блоке «Центр доверия – данные владельца» укажите только проверенные вами факты (например, местонахождение дата-центра) и нажмите «Сохранить».',
          'Посмотрите шаблон через «Образец PDF»; после проверки юристом включите «Шаблон AVV утверждён».',
          'В списке «AVV с работодателями» следите за подписанными договорами и ставьте нашу подпись через «Ко второй подписи».',
        ],
        tips: [
          'Пока шаблон не утверждён, работодатели не видят AVV в портале; новая версия шаблона требует нового утверждения.',
          'Пустые поля на сайте не показываются. Меры и субподрядчики подтягиваются из кода и конфигурации.',
        ],
      },
      en: {
        title: 'Trust Center & DPA',
        purpose: 'Facts for the public Trust Center, the DPA template for employers (Art. 28 GDPR) and the DPAs signed with employers. For admins and the super admin.',
        steps: [
          'In «Trust Center – owner facts» enter only facts you have checked yourself (e.g. data centre location) and click «Save».',
          'Look at the template via «View sample PDF»; after a lawyer has reviewed it, switch on «DPA template approved».',
          'Track signed agreements in «DPAs with employers» and add our signature via «Go to countersignature».',
        ],
        tips: [
          'Until the template is approved, employers do not see the DPA in their portal; a new template version needs a new approval.',
          'Empty fields are not shown publicly. Measures and sub-processors come from the code and configuration.',
        ],
      },
      de: {
        title: 'Trust Center & AVV',
        purpose: 'Angaben für das öffentliche Trust Center, die AVV-Vorlage für Arbeitgeber (Art. 28 DSGVO) und die mit Arbeitgebern geschlossenen AVV. Für Admins und Super-Admin.',
        steps: [
          'Unter „Trust Center – Angaben des Inhabers“ nur selbst geprüfte Fakten (z. B. Standort des Rechenzentrums) eintragen und „Speichern“.',
          'Vorlage über „Muster-PDF ansehen“ prüfen; nach anwaltlicher Prüfung „AVV-Vorlage freigegeben“ einschalten.',
          'Unter „AVV mit Arbeitgebern“ unterschriebene Verträge verfolgen und über „Zur Gegenzeichnung“ gegenzeichnen.',
        ],
        tips: [
          'Ohne Freigabe sehen Arbeitgeber den AVV nicht im Portal; eine neue Vorlagenversion braucht eine neue Freigabe.',
          'Leere Felder erscheinen nicht öffentlich. Maßnahmen und Unterauftragsverarbeiter kommen aus Code und Konfiguration.',
        ],
      },
    },
  },
  {
    route: 'tv-settings',
    text: {
      az: {
        title: 'TV rejimi',
        purpose: 'Ofisdəki divar televizoru üçün ekran: bu günün görüşləri, yeni müraciətlər, gözləyən işlər, təsdiqlənən vizalar və gəlişlər. Burada TV keçidləri və ekran parametrləri idarə olunur. Administrator və Super admin üçündür.',
        steps: [
          '«TV ekranları» bölməsində TV-yə ad verib «Keçid yarat» basın; keçidi TV brauzerində açın və ya QR kodu skan edin.',
          'Göstəriləcək panelləri seçin və sıralayın, səhifə dəyişmə müddətini, «Viza gəldi!» bayramını və səsi təyin edib «Yadda saxla» basın.',
          'Nəticəni «Bu kompüterdə aç» ilə yoxlayın; lazımsız və ya itmiş TV keçidini «Ləğv et» ilə bağlayın.',
        ],
        tips: [
          'Keçid yalnız yaradılanda bir dəfə göstərilir və yalnız TV məlumatını oxuyur.',
          'TV-də adlar yalnız «ad + soyadın ilk hərfi» kimi görünür; əlaqə məlumatı və sənədlər göstərilmir.',
        ],
      },
      ru: {
        title: 'Режим ТВ',
        purpose: 'Экран для настенного телевизора в офисе: встречи на сегодня, новые заявки, дела в ожидании, одобренные визы и прибытия. Здесь управляются ссылки для ТВ и настройки экрана. Для администраторов и суперадмина.',
        steps: [
          'В блоке «ТВ-экраны» дайте ТВ имя и нажмите «Создать ссылку»; откройте её в браузере ТВ или отсканируйте QR-код.',
          'Выберите и упорядочьте «Панели», задайте «Смену страниц», праздник «Виза пришла!» и звук, нажмите «Сохранить».',
          'Проверьте вид через «Открыть на этом компьютере»; ненужную или утерянную ссылку закройте кнопкой «Отозвать».',
        ],
        tips: [
          'Ссылка показывается только один раз при создании и даёт доступ только к данным ТВ.',
          'На ТВ люди показываются как «имя + инициал»; контакты и документы не показываются.',
        ],
      },
      en: {
        title: 'TV mode',
        purpose: 'Screen for the office wall TV: today’s appointments, new inquiries, cases waiting on the team, approved visas and arrivals. Manage the TV links and screen settings here. For admins and the super admin.',
        steps: [
          'Under «TV screens» name the TV and click «Create link»; open the link in the TV’s browser or scan the QR code.',
          'Choose and order the «Panels», set «Page rotation», the «Visa arrived!» celebration and sound, then click «Save».',
          'Check the result with «Open on this computer»; close an unused or lost TV link with «Revoke».',
        ],
        tips: [
          'The link is shown only once, when created, and can only read TV data.',
          'People appear on the TV only as first name + initial; contact data and documents are never shown.',
        ],
      },
      de: {
        title: 'TV-Modus',
        purpose: 'Bildschirm für den Wand-TV im Büro: heutige Termine, neue Anfragen, wartende Fälle, erteilte Visa und Ankünfte. Hier werden TV-Links und Bildschirmeinstellungen verwaltet. Für Admins und Super-Admin.',
        steps: [
          'Unter „TV-Bildschirme“ den TV benennen und „Link erstellen“; Link im TV-Browser öffnen oder QR-Code scannen.',
          '„Bereiche“ wählen und sortieren, „Seitenwechsel“, „Visum da!“-Feier und Ton einstellen, dann „Speichern“.',
          'Ergebnis mit „Auf diesem Computer öffnen“ prüfen; ungenutzte oder verlorene Links mit „Widerrufen“ sperren.',
        ],
        tips: [
          'Der Link wird nur einmal beim Erstellen angezeigt und liest nur TV-Daten.',
          'Personen erscheinen nur als „Vorname + Initiale“; Kontaktdaten und Dokumente nie.',
        ],
      },
    },
  },
  {
    route: 'integrations',
    text: {
      az: {
        title: 'İnteqrasiyalar',
        purpose: 'Şəxsi təqvim axını, tərəfdaş sistemlər üçün API açarları və webhook-lar, API sənədləri. Təqvim axını hər əməkdaş üçün işləyir; açarları və webhook-ları yalnız Administrator və Super admin idarə edir.',
        steps: [
          '«Təqvim axını»nda «Axını yarat» basın və linki Google, Outlook və ya Apple təqviminə abunəlik kimi əlavə edin.',
          '«API açarları»nda «Yeni açar» basın, ad, icazələr və şirkəti seçin; açarı dərhal kopyalayın.',
          '«Webhook-lar»da «Yeni webhook» ilə URL və hadisələri seçin, «Test göndər» ilə yoxlayın; tərəfdaşa «OpenAPI (JSON)» linkini verin.',
        ],
        tips: [
          'API açarı və webhook secret-i yalnız bir dəfə göstərilir; lazımsız açarı «Ləğv et» ilə bağlayın.',
          'Təqvim linki şəxsidir; sızıbsa «Linki yenilə» basın.',
        ],
      },
      ru: {
        title: 'Интеграции',
        purpose: 'Личная лента календаря, API-ключи и вебхуки для партнёрских систем, документация API. Ленту календаря может создать любой сотрудник; ключами и вебхуками управляют только администраторы и суперадмин.',
        steps: [
          'В «Ленте календаря» нажмите «Создать ленту» и добавьте ссылку как подписку в Google, Outlook или Apple Calendar.',
          'В «API-ключах» нажмите «Новый ключ», задайте название, права и компанию; сразу скопируйте ключ.',
          'В «Вебхуках» через «Новый вебхук» укажите URL и события, проверьте «Отправить тест»; партнёру дайте ссылку «OpenAPI (JSON)».',
        ],
        tips: [
          'API-ключ и секрет вебхука показываются только один раз; ненужный ключ закройте кнопкой «Отозвать».',
          'Ссылка календаря личная; если она утекла, нажмите «Обновить ссылку».',
        ],
      },
      en: {
        title: 'Integrations',
        purpose: 'Your personal calendar feed, API keys and webhooks for partner systems, and the API docs. Every staff member can use the calendar feed; only admins and the super admin manage keys and webhooks.',
        steps: [
          'In «Calendar feed» click «Create feed» and add the link as a subscription in Google, Outlook or Apple Calendar.',
          'In «API keys» click «New key», set name, scopes and company, and copy the key right away.',
          'In «Webhooks» use «New webhook» to set URL and events and check it with «Send test»; give partners the «OpenAPI (JSON)» link.',
        ],
        tips: [
          'API keys and webhook secrets are shown only once; close an unused key with «Revoke».',
          'The calendar link is personal; if it leaks, click «Renew link».',
        ],
      },
      de: {
        title: 'Integrationen',
        purpose: 'Persönlicher Kalender-Feed, API-Schlüssel und Webhooks für Partnersysteme sowie die API-Dokumentation. Den Kalender-Feed nutzt jede Mitarbeiterin und jeder Mitarbeiter; Schlüssel und Webhooks verwalten nur Admins und Super-Admin.',
        steps: [
          'Unter „Kalender-Feed“ „Feed erstellen“ klicken und den Link als Abo in Google, Outlook oder Apple Kalender eintragen.',
          'Unter „API-Schlüssel“ „Neuer Schlüssel“ klicken, Name, Berechtigungen und Firma setzen und den Schlüssel sofort kopieren.',
          'Unter „Webhooks“ mit „Neuer Webhook“ URL und Ereignisse wählen, mit „Test senden“ prüfen; Partnern den Link „OpenAPI (JSON)“ geben.',
        ],
        tips: [
          'API-Schlüssel und Webhook-Secret werden nur einmal angezeigt; ungenutzte Schlüssel widerrufen.',
          'Der Kalender-Link ist persönlich; bei Weitergabe den Link erneuern.',
        ],
      },
    },
  },
  {
    route: 'automation',
    text: {
      az: {
        title: 'Avtomatlaşdırma',
        purpose: 'Kodsuz qaydalar (NƏ VAXT → ŞƏRTLƏR → NƏ ETMƏLİ), müraciətlərin avtomatik təyinatı və məzuniyyət əvəzetmələri. Administrator və Super admin üçündür.',
        steps: [
          '«Qaydalar» tabında «Yeni qayda» basın: tətiki seçin, şərtləri və ardıcıl əməliyyatları əlavə edib saxlayın.',
          'Qaydanı açarla aktiv edin və ya söndürün; «Jurnal» ilə onun nə vaxt və necə işlədiyini yoxlayın.',
          '«Təyinat» tabında avtomatik təyinat rejimini, «Əvəzetmə» tabında məzuniyyətdə olan əməkdaşların müraciətlərinin kimə keçdiyini idarə edin.',
        ],
        tips: [
          'Yeni qaydaya başlamaq üçün «Nümunə» qaydalarından istifadə edin.',
          'Qayda silinəndə onun jurnalı da silinir; müvəqqəti dayandırmaq üçün söndürmək kifayətdir.',
        ],
      },
      ru: {
        title: 'Автоматизация',
        purpose: 'Правила без кода (КОГДА → УСЛОВИЯ → ТОГДА), автоматическое назначение заявок и замещения на время отпуска. Для администраторов и суперадмина.',
        steps: [
          'На вкладке «Правила» нажмите «Новое правило»: выберите триггер, добавьте условия и действия по порядку и сохраните.',
          'Включайте и выключайте правило переключателем; кнопка «Журнал» показывает, когда и как оно срабатывало.',
          'На вкладке «Назначение» настройте режим автоназначения, на вкладке «Замещения» — кому переходят заявки сотрудников в отпуске.',
        ],
        tips: [
          'Для старта используйте готовые правила-«Примеры».',
          'При удалении правила удаляется и его журнал; чтобы приостановить, достаточно выключить.',
        ],
      },
      en: {
        title: 'Automation',
        purpose: 'No-code rules (WHEN → IF → THEN), automatic case assignment and absence cover. For admins and the super admin.',
        steps: [
          'On the «Rules» tab click «New rule»: pick a trigger, add conditions and actions in order, and save.',
          'Switch a rule on or off with its toggle; «Run log» shows when and how it ran.',
          'Use the «Assignment» tab for the automatic assignment mode and «Absence cover» to see whose cases moved to a substitute during leave.',
        ],
        tips: [
          'Start from one of the «Example» rules.',
          'Deleting a rule also deletes its run log; to pause it, just switch it off.',
        ],
      },
      de: {
        title: 'Automatisierung',
        purpose: 'Regeln ohne Code (WENN → BEDINGUNGEN → DANN), automatische Zuweisung von Anträgen und Urlaubsvertretungen. Für Admins und Super-Admin.',
        steps: [
          'Im Tab „Regeln“ „Neue Regel“ klicken: Auslöser wählen, Bedingungen und Aktionen der Reihe nach hinzufügen und speichern.',
          'Regel per Schalter ein- oder ausschalten; „Protokoll“ zeigt, wann und wie sie lief.',
          'Im Tab „Zuweisung“ den Modus der automatischen Zuweisung einstellen, unter „Vertretungen“ sehen, wessen Anträge im Urlaub vertreten werden.',
        ],
        tips: [
          'Mit einer „Beispiel“-Regel starten.',
          'Beim Löschen einer Regel wird auch ihr Protokoll gelöscht; zum Pausieren einfach ausschalten.',
        ],
      },
    },
  },
  {
    route: 'problems',
    text: {
      az: {
        title: 'Problem bildirişləri',
        purpose: 'Saytdan, kabinetlərdən və admin paneldən gələn problem bildirişləri; hər biri üçün komanda tapşırığı yaradılır. Administratorlar və parametrlərdə seçilmiş əməkdaş görür.',
        steps: [
          'Siyahını status (Yeni, İcrada, Həll olunub, Düzəldilməyəcək) üzrə süzün və ya mətn və səhifə üzrə axtarın.',
          'Bildirişi açın: səhifəni, brauzeri, ekran görüntüsünü və konsol xətalarını yoxlayın, əlaqəli tapşırığa keçin.',
          'Statusu dəyişin, «Daxili qeyd» yazıb «Qeydi saxla» basın və lazım olsa «Cavabı göndər» ilə bildirənə cavab verin.',
        ],
        tips: [
          'Administrator yuxarıdakı «Tapşırıq kimə verilsin» seçimi ilə yeni bildirişlərin kimə getdiyini təyin edir; boşdursa — bütün adminlərə.',
        ],
      },
      ru: {
        title: 'Сообщения о проблемах',
        purpose: 'Сообщения о проблемах с сайта, из кабинетов и админ-панели; для каждого создаётся задача команды. Видят администраторы и сотрудник, выбранный в настройках.',
        steps: [
          'Фильтруйте список по статусу (Новое, В работе, Решено, Не будет исправлено) или ищите по тексту и странице.',
          'Откройте сообщение: проверьте страницу, браузер, скриншот и ошибки консоли, перейдите к связанной задаче.',
          'Смените статус, напишите «Внутреннюю заметку» и нажмите «Сохранить заметку»; при необходимости ответьте отправителю через «Отправить ответ».',
        ],
        tips: [
          'Администратор в настройке «Кому назначать задачу» выбирает получателя новых сообщений; если пусто — всем администраторам.',
        ],
      },
      en: {
        title: 'Problem reports',
        purpose: 'Problem reports from the website, the portals and the admin panel; each one creates a team task. Visible to admins and the staff member chosen in the settings.',
        steps: [
          'Filter by status (New, In progress, Done, Won’t fix) or search the text and page.',
          'Open a report: check the page, browser, screenshot and console errors, and jump to the linked task.',
          'Change the status, write an «Internal note» and click «Save note»; reply to the reporter with «Send reply» if needed.',
        ],
        tips: [
          'Admins choose who receives new reports with «Assign the task to»; if empty, all admins get them.',
        ],
      },
      de: {
        title: 'Problemmeldungen',
        purpose: 'Problemmeldungen aus Website, Kundenbereichen und Adminbereich; für jede wird eine Team-Aufgabe angelegt. Sichtbar für Admins und die in den Einstellungen gewählte Person.',
        steps: [
          'Nach Status (Neu, In Bearbeitung, Erledigt, Wird nicht behoben) filtern oder in Text und Seite suchen.',
          'Meldung öffnen: Seite, Browser, Screenshot und Konsolenfehler prüfen, zur verknüpften Aufgabe springen.',
          'Status ändern, „Interne Notiz“ schreiben und „Notiz speichern“; bei Bedarf mit „Antwort senden“ der meldenden Person antworten.',
        ],
        tips: [
          'Admins legen unter „Aufgabe zuweisen an“ fest, wer neue Meldungen bekommt; leer = alle Admins.',
        ],
      },
    },
  },
];
