import type { PageHelpEntry } from '../types.js';

/** Admin page help: communication and leads pages (messaging, calls, campaigns, surveys, inquiries, analytics, partners, agents, events). */
export const PAGES_COMMS: PageHelpEntry[] = [
  {
    route: 'messaging',
    text: {
      az: {
        title: 'Mesajlaşma',
        purpose: 'Müştərilərə gedən WhatsApp və SMS mesajlarının jurnalı, provayderlərin vəziyyəti və bildiriş mətnləri. Mesajın çatıb-çatmadığını yoxlamaq və bildiriş şablonlarını dəyişmək üçündür.',
        steps: [
          '«Göndərişlər» tabında kanal və status filtrləri, nömrə, mətn və ya müraciət № üzrə axtarışla mesajı tapın; «Uğursuz» olanı səbəbi düzəldəndən sonra «Yenidən göndər» ilə təkrarlayın.',
          '«Provayderlər» tabında WhatsApp və SMS-in qoşulub-qoşulmadığını yoxlayın və «Telefon xatırlatmaları (WhatsApp / SMS)» bölməsində görüşlərdən nə qədər əvvəl xatırlatma getdiyini təyin edin.',
          '«Bildiriş şablonları» tabında bildiriş növünü seçin, hər dil üçün başlıq və mətni dəyişin, dəyişənləri əlavə edin, önizləməyə baxıb «Yadda saxla» basın.',
        ],
        tips: [
          'Yenidən göndərmək, xatırlatma ayarları və şablonlar yalnız Administrator və Super admin üçündür; test mesajını yalnız Super admin göndərir.',
          '«Konsol (test)» statusu provayderin qoşulmadığını göstərir — mesaj həqiqətən göndərilməyib.',
          '«Standarta qaytar» həmin dil üçün standart mətni bərpa edir.',
        ],
      },
      ru: {
        title: 'Сообщения',
        purpose: 'Журнал сообщений WhatsApp и SMS клиентам, состояние провайдеров и тексты уведомлений. Здесь проверяют, дошло ли сообщение, и меняют шаблоны уведомлений.',
        steps: [
          'Во вкладке «Журнал отправок» найдите сообщение фильтрами канала и статуса или поиском по номеру, тексту или № заявки; «Ошибка» после устранения причины повторите кнопкой «Отправить повторно».',
          'Во вкладке «Провайдеры» проверьте, подключены ли WhatsApp и SMS, и в блоке «Напоминания по телефону (WhatsApp / SMS)» задайте, за сколько до встречи уходит напоминание.',
          'Во вкладке «Шаблоны уведомлений» выберите тип уведомления, измените заголовок и текст для каждого языка, вставьте переменные, проверьте предпросмотр и нажмите «Сохранить».',
        ],
        tips: [
          'Повторная отправка, настройки напоминаний и шаблоны доступны только Администратору и Супер-админу; тестовое сообщение отправляет только Супер-админ.',
          'Статус «Консоль (тест)» значит, что провайдер не подключён и сообщение реально не ушло.',
          '«Вернуть стандарт» восстанавливает стандартный текст для этого языка.',
        ],
      },
      en: {
        title: 'Messaging',
        purpose: 'The log of WhatsApp and SMS messages to clients, the provider status and the notification texts. Use it to check whether a message arrived and to change notification templates.',
        steps: [
          'In the “Outbound log” tab, find a message with the channel and status filters or search by number, text or case no.; once the cause of a “Failed” message is fixed, click “Resend”.',
          'In the “Providers” tab, check that WhatsApp and SMS are connected and, under “Phone reminders (WhatsApp / SMS)”, set how long before an appointment the reminder goes out.',
          'In the “Notification templates” tab, choose the notification type, edit the title and text per language, insert placeholders, check the preview and click “Save”.',
        ],
        tips: [
          'Resending, reminder settings and templates are for Administrator and Super admin only; only the Super admin sends test messages.',
          'The “Console (test)” status means no provider is connected — the message was not actually sent.',
          '“Reset to default” restores the standard text for that language.',
        ],
      },
      de: {
        title: 'Messaging',
        purpose: 'Protokoll der WhatsApp- und SMS-Nachrichten an Kunden, Status der Anbieter und Texte der Benachrichtigungen. Hier prüfen Sie, ob eine Nachricht angekommen ist, und ändern Benachrichtigungsvorlagen.',
        steps: [
          'Im Tab „Versandprotokoll“ finden Sie Nachrichten über Kanal- und Statusfilter oder die Suche nach Nummer, Text oder Fallnummer; eine fehlgeschlagene Nachricht nach Behebung mit „Erneut senden“ wiederholen.',
          'Im Tab „Anbieter“ prüfen, ob WhatsApp und SMS angebunden sind, und unter „Erinnerungen per Telefon (WhatsApp / SMS)“ festlegen, wie lange vor einem Termin erinnert wird.',
          'Im Tab „Benachrichtigungsvorlagen“ den Typ wählen, Titel und Text je Sprache ändern, Platzhalter einfügen, die Vorschau prüfen und „Speichern“ klicken.',
        ],
        tips: [
          'Erneut senden, Erinnerungseinstellungen und Vorlagen nur für Administrator und Super-Admin; Testnachrichten sendet nur der Super-Admin.',
          'Der Status „Konsole (Test)“ bedeutet: kein Anbieter angebunden, die Nachricht wurde nicht wirklich gesendet.',
          '„Auf Standard zurücksetzen“ stellt den Standardtext dieser Sprache wieder her.',
        ],
      },
    },
  },
  {
    route: 'canned-replies',
    text: {
      az: {
        title: 'Hazır cavablar',
        purpose: 'Tez-tez yazılan mətnlərin şablonları. Müraciət mesajlarında, canlı söhbətdə və sorğu qeydlərində «/» yazıb qısa kodla bir saniyədə əlavə olunur.',
        steps: [
          '«Hamısı», «Şəxsi» və «Komanda» filtrləri və axtarışla (ad, qısa kod, mətn) mövcud cavablara baxın.',
          '«Yeni cavab» basın: ad, qısa kod (məs. salam), müştərinin dili, kim görür və mətni yazın; «Dəyişən əlavə et» ilə ad, müraciət nömrəsi kimi sahələri qoyun.',
          'Önizləməni yoxlayıb yadda saxlayın, sonra hər hansı mesaj qutusunda «/» və qısa kodu yazın.',
        ],
        tips: [
          'Eyni qısa kodla hər dil üçün ayrıca variant yaradın — müştərinin dilindəki variant avtomatik seçilir.',
          'Komanda cavablarını yalnız Administrator idarə edir; şəxsi cavabları yalnız siz görürsünüz.',
          'Poçt şablonları da bu siyahıda görünür.',
        ],
      },
      ru: {
        title: 'Шаблоны ответов',
        purpose: 'Шаблоны часто используемых текстов. В сообщениях по заявке, живом чате и заметках к запросам наберите «/» и код — текст вставится за секунду.',
        steps: [
          'Просмотрите шаблоны фильтрами «Все», «Личные», «Команда» и поиском по названию, коду или тексту.',
          'Нажмите «Новый шаблон»: укажите название, код (напр. privet), язык клиента, кто видит и текст; кнопкой вставки переменной добавьте имя, номер заявки и т. п.',
          'Проверьте предпросмотр, сохраните и затем в любом поле сообщения наберите «/» и код.',
        ],
        tips: [
          'Создавайте по варианту на каждый язык с тем же кодом — автоматически выбирается вариант на языке клиента.',
          'Командными шаблонами управляет только Администратор; личные видите только вы.',
          'Почтовые шаблоны тоже показаны в этом списке.',
        ],
      },
      en: {
        title: 'Canned replies',
        purpose: 'Templates for texts you write often. In case messages, live chat and inquiry notes, type “/” and the shortcut to insert them in a second.',
        steps: [
          'Browse the replies with the “All”, “Personal” and “Team” filters and search by name, shortcut or text.',
          'Click “New reply”: enter the name, a shortcut (e.g. hello), the client language, who can see it and the text; use “Insert variable” for fields such as the first name or case number.',
          'Check the preview, save, then type “/” and the shortcut in any message box.',
        ],
        tips: [
          'Create one variant per language with the same shortcut — the client’s language is picked automatically.',
          'Only an Administrator manages team replies; personal replies are visible only to you.',
          'Mail templates also appear in this list.',
        ],
      },
      de: {
        title: 'Textbausteine',
        purpose: 'Vorlagen für häufig geschriebene Texte. In Fallnachrichten, Live-Chat und Anfragenotizen „/“ und das Kürzel tippen – der Text ist sofort eingefügt.',
        steps: [
          'Bausteine über die Filter „Alle“, „Persönlich“ und „Team“ sowie die Suche nach Name, Kürzel oder Text durchsehen.',
          '„Neuer Baustein“ klicken: Name, Kürzel (z. B. hallo), Sprache des Kunden, Sichtbarkeit und Text eingeben; mit „Variable einfügen“ Felder wie Vorname oder Fallnummer setzen.',
          'Vorschau prüfen, speichern und dann in jedem Nachrichtenfeld „/“ und das Kürzel tippen.',
        ],
        tips: [
          'Pro Sprache eine Variante mit demselben Kürzel anlegen – die Sprache des Kunden wird automatisch gewählt.',
          'Team-Bausteine verwaltet nur ein Administrator; persönliche sehen nur Sie.',
          'Mailvorlagen erscheinen ebenfalls in dieser Liste.',
        ],
      },
    },
  },
  {
    route: 'calls',
    text: {
      az: {
        title: 'Zənglər',
        purpose: 'Müştərilərlə zənglərin jurnalı, saytdan gələn geri zəng sifarişləri və telefon provayderinin ayarları.',
        steps: [
          '«Zəng jurnalı» tabında bütün zənglərə və onların nəticəsinə baxın; yalnız özünüzünkülər üçün «Yalnız mənim» işarələyin.',
          '«Geri zəng sifarişləri» tabında «Gözləyən» sorğuları açın: müştərinin istədiyi vaxta (Bakı vaxtı) baxıb «Zəng et» basın və nəticəni qeyd edin; lazım olmayanı «Ləğv et» ilə bağlayın.',
          'Administrator «Ayarlar» tabında provayderi (Twilio və ya sipgate), zəng edən nömrəni, iş saatlarını və zəng yazısını qurur.',
        ],
        tips: [
          'Vaxtı keçmiş sifarişlər «gecikir» nişanı ilə göstərilir.',
          'Provayder qoşulmayıbsa, öz telefonunuzdan zəng edib nəticəni «Zəngi qeyd et» ilə yaza bilərsiniz.',
          'Bölmə «Zənglər» modulu söndürüləndə menyuda görünmür.',
        ],
      },
      ru: {
        title: 'Звонки',
        purpose: 'Журнал звонков клиентам, запросы на обратный звонок с сайта и настройки телефонного провайдера.',
        steps: [
          'Во вкладке «Журнал звонков» смотрите все звонки и их результат; отметьте «Только мои», чтобы видеть свои.',
          'Во вкладке «Обратные звонки» откройте «Ожидают»: проверьте желаемое время (по Баку), нажмите «Позвонить» и сохраните результат; ненужный запрос закройте кнопкой «Отменить».',
          'Администратор во вкладке «Настройки» задаёт провайдера (Twilio или sipgate), номер звонящего, рабочие часы и запись звонков.',
        ],
        tips: [
          'Просроченные запросы отмечены меткой «просрочено».',
          'Без провайдера можно позвонить со своего телефона и записать результат через «Записать звонок».',
          'Раздел скрыт, если модуль «Звонки» отключён.',
        ],
      },
      en: {
        title: 'Calls',
        purpose: 'The log of calls with clients, callback requests from the website and the phone provider settings.',
        steps: [
          'In the “Call log” tab, see all calls and their outcome; tick “Only mine” to see just your own.',
          'In the “Callback requests” tab, open “Pending”: check the requested time (Baku time), click “Call” and save the outcome; close an unneeded request with “Cancel”.',
          'In the “Settings” tab an Administrator sets the provider (Twilio or sipgate), caller ID, office hours and call recording.',
        ],
        tips: [
          'Requests past their time window are marked “overdue”.',
          'Without a provider you can call from your own phone and record the result with “Log call”.',
          'The page is hidden when the Calls module is switched off.',
        ],
      },
      de: {
        title: 'Anrufe',
        purpose: 'Protokoll der Anrufe mit Kunden, Rückrufwünsche von der Website und Einstellungen des Telefonanbieters.',
        steps: [
          'Im Tab „Anrufprotokoll“ alle Anrufe und ihr Ergebnis ansehen; „Nur meine“ anhaken, um nur eigene zu sehen.',
          'Im Tab „Rückrufwünsche“ die offenen Wünsche öffnen: gewünschte Zeit (Bakuer Zeit) prüfen, „Anrufen“ klicken und das Ergebnis speichern; nicht mehr nötige mit „Abbrechen“ schließen.',
          'Im Tab „Einstellungen“ legt ein Administrator Anbieter (Twilio oder sipgate), Rufnummer, Bürozeiten und Aufzeichnung fest.',
        ],
        tips: [
          'Wünsche nach Ablauf des Zeitfensters sind als „überfällig“ markiert.',
          'Ohne Anbieter vom eigenen Telefon anrufen und das Ergebnis mit „Anruf erfassen“ eintragen.',
          'Die Seite ist ausgeblendet, wenn das Modul Anrufe abgeschaltet ist.',
        ],
      },
    },
  },
  {
    route: 'campaigns/*',
    text: {
      az: {
        title: 'Kampaniyalar',
        purpose: 'Seçilmiş müştəri seqmentlərinə e-poçt, SMS və kabinet bildirişi göndərmək. Reklam mesajları yalnız açıq razılıq verənlərə gedir.',
        steps: [
          'Əvvəlcə «Seqmentlər» bölməsində «Yeni seqment» ilə alıcı qrupunu (filtrlərlə) yaradın.',
          '«Yeni kampaniya» basın və addımları keçin: «Seqment», «Mətn» (hər dil üçün), «Kanallar və vaxt», «Yoxla və göndər»; «Mənə test göndər» ilə yoxlayın.',
          '«İndi göndər» və ya «Planlaşdır» seçin; kampaniyanı açıb statistikanı izləyin, lazım olsa «Dayandır», «Davam et» və ya «Ləğv et» basın.',
        ],
        tips: [
          'Yalnız Administrator və Super admin üçündür; modul söndürülə bilər.',
          '«Xidmət məlumatı» bildiriş ayarlarına hörmət edir, «Reklam» yalnız razılıq verənlərə gedir; hər məktubda imtina linki olur.',
          'Açılma sayı təxminidir (Apple Mail və şəkil proksiləri onu artırır).',
        ],
      },
      ru: {
        title: 'Кампании',
        purpose: 'Рассылка e-mail, SMS и уведомлений в кабинете выбранным сегментам клиентов. Рекламные сообщения уходят только тем, кто дал явное согласие.',
        steps: [
          'Сначала в разделе «Сегменты» создайте группу получателей кнопкой «Новый сегмент» (с фильтрами).',
          'Нажмите «Новая кампания» и пройдите шаги «Сегмент», «Содержание» (по языкам), «Каналы и время», «Проверка и отправка»; проверьте кнопкой «Отправить тест себе».',
          'Выберите «Отправить сейчас» или «Запланировать»; откройте кампанию для статистики и при необходимости нажмите «Пауза», «Продолжить» или «Отменить».',
        ],
        tips: [
          'Доступно только Администратору и Супер-админу; модуль можно отключить.',
          'Тип «Сервисная информация» учитывает настройки уведомлений, «Реклама» уходит только с согласием; в каждом письме есть ссылка отписки.',
          'Число открытий приблизительное (Apple Mail и прокси картинок его завышают).',
        ],
      },
      en: {
        title: 'Campaigns',
        purpose: 'Send e-mail, SMS and in-portal notifications to selected client segments. Marketing messages only go to people who have explicitly opted in.',
        steps: [
          'First create the recipient group under “Segments” with “New segment” (using filters).',
          'Click “New campaign” and go through “Segment”, “Content” (per language), “Channels & schedule” and “Review & send”; check it with “Send test to me”.',
          'Choose “Send now” or “Schedule”; open the campaign to follow the stats and use “Pause”, “Resume” or “Cancel” if needed.',
        ],
        tips: [
          'Administrator and Super admin only; the module can be switched off.',
          '“Service” messages respect notification settings, “Marketing” goes to opted-in recipients only; every e-mail has an unsubscribe link.',
          'Open counts are approximate (Apple Mail and image proxies inflate them).',
        ],
      },
      de: {
        title: 'Kampagnen',
        purpose: 'E-Mail, SMS und Portal-Benachrichtigungen an ausgewählte Kundensegmente senden. Werbung geht nur an Personen mit ausdrücklicher Einwilligung.',
        steps: [
          'Zuerst unter „Segmente“ mit „Neues Segment“ die Empfängergruppe (per Filter) anlegen.',
          '„Neue Kampagne“ klicken und die Schritte „Segment“, „Inhalt“ (je Sprache), „Kanäle & Zeitpunkt“ und „Prüfen & senden“ durchlaufen; mit „Test an mich senden“ prüfen.',
          '„Jetzt senden“ oder „Planen“ wählen; die Kampagne öffnen, um die Statistik zu verfolgen, und bei Bedarf „Pausieren“, „Fortsetzen“ oder „Abbrechen“.',
        ],
        tips: [
          'Nur für Administrator und Super-Admin; das Modul kann abgeschaltet werden.',
          'Service-Nachrichten beachten die Benachrichtigungseinstellungen, Werbung geht nur mit Einwilligung; jede E-Mail enthält einen Abmeldelink.',
          'Öffnungen sind Schätzwerte (Apple Mail und Bild-Proxys erhöhen sie).',
        ],
      },
    },
  },
  {
    route: 'rule-changes',
    text: {
      az: {
        title: 'Qayda dəyişiklikləri',
        purpose: 'Qanun və ya səfirlik qaydası dəyişəndə həmin viza növü üzrə aktiv müştərilərə kabinetdə bildiriş və e-poçt göndərmək üçündür.',
        steps: [
          '«Yeni dəyişiklik» basın, başlıq və mətni yazın (Azərbaycan dili mütləqdir, digər dillər istəyə görə).',
          '«Hansı viza növlərinə aiddir?» bölməsində viza növlərini, qüvvəyə minmə tarixini və rəsmi mənbəni seçin — neçə aktiv müştəriyə təsir etdiyi dərhal görünür; «Qaralamanı saxla» basın.',
          '«Tarixçə»də qaralamanı yoxlayın və «Dərc et və göndər» ilə müştərilərə göndərin.',
        ],
        tips: [
          'Qaralamanı hər əməkdaş yaza bilər, dərc etməyi yalnız Administrator və Super admin edir.',
          'Dərc ediləndən sonra mətni dəyişmək olmur — göndərməzdən əvvəl diqqətlə yoxlayın.',
          'Mənbə kimi rəsmi saytlar (make-it-in-germany.com, auswaertiges-amt.de və s.) göstərin.',
        ],
      },
      ru: {
        title: 'Изменения правил',
        purpose: 'Когда меняется закон или правило посольства, отсюда активным клиентам с этим типом визы отправляют уведомление в кабинете и письмо.',
        steps: [
          'Нажмите «Новое изменение» и напишите заголовок и текст (азербайджанский обязателен, остальные языки по желанию).',
          'Отметьте «Затронутые типы виз», дату вступления в силу и официальный источник — сразу видно, скольких активных клиентов это касается; нажмите «Сохранить черновик».',
          'В «Истории» проверьте черновик и отправьте его кнопкой «Опубликовать и отправить».',
        ],
        tips: [
          'Черновик может написать любой сотрудник, публикует только Администратор или Супер-админ.',
          'После публикации текст изменить нельзя — проверьте его до отправки.',
          'Указывайте официальные источники (make-it-in-germany.com, auswaertiges-amt.de и т. п.).',
        ],
      },
      en: {
        title: 'Rule changes',
        purpose: 'When a law or embassy rule changes, use this page to send a portal notice and e-mail to active clients with the affected visa types.',
        steps: [
          'Click “New change” and write the title and text (Azerbaijani is required, other languages are optional).',
          'Tick the “Affected visa types”, the effective date and the official source — the number of affected active clients appears right away; click “Save draft”.',
          'Check the draft under “History” and send it with “Publish and send”.',
        ],
        tips: [
          'Any staff member can write a draft; only Administrator and Super admin can publish.',
          'Once published the text cannot be changed — check it carefully before sending.',
          'Cite official sources (make-it-in-germany.com, auswaertiges-amt.de, etc.).',
        ],
      },
      de: {
        title: 'Regeländerungen',
        purpose: 'Ändert sich ein Gesetz oder eine Botschaftsregel, senden Sie hier aktiven Kunden der betroffenen Visumarten eine Portalmitteilung und eine E-Mail.',
        steps: [
          '„Neue Änderung“ klicken und Titel und Text schreiben (Aserbaidschanisch ist Pflicht, andere Sprachen optional).',
          '„Betroffene Visumarten“, „Gilt ab“ und die offizielle Quelle angeben – die Zahl der betroffenen aktiven Kunden erscheint sofort; „Entwurf speichern“ klicken.',
          'Den Entwurf unter „Verlauf“ prüfen und mit „Veröffentlichen und senden“ verschicken.',
        ],
        tips: [
          'Entwürfe kann jede Mitarbeiterin und jeder Mitarbeiter schreiben; veröffentlichen dürfen nur Administrator und Super-Admin.',
          'Nach der Veröffentlichung ist der Text nicht mehr änderbar – vorher sorgfältig prüfen.',
          'Offizielle Quellen angeben (make-it-in-germany.com, auswaertiges-amt.de usw.).',
        ],
      },
    },
  },
  {
    route: 'surveys/*',
    text: {
      az: {
        title: 'Məmnuniyyət sorğuları',
        purpose: 'Viza təsdiqindən və ya müraciət bağlandıqdan sonra müştərilərə gedən daxili sorğunun (NPS) nəticələri: cavab faizi, orta qiymətlər və şərhlər.',
        steps: [
          '«Başlanğıc» və «Son» tarixlərini seçin və yuxarıda NPS, cavab faizi və «Aylıq dinamika»ya baxın.',
          '«Əməkdaşlar üzrə» cədvəlində hər əməkdaşın nəticəsini müqayisə edin.',
          '«Cavablar və şərhlər» siyahısını əməkdaş, səbəb, qiymət (məs. «Tənqidçilər (0–6)») və «Yalnız şərhli» filtrləri ilə süzün və narazı müştərilərlə əlaqə saxlayın.',
        ],
        tips: [
          'Adi əməkdaş yalnız öz nəticələrini görür.',
          'Cavab gözlənilən sorğunu yalnız Administrator «Yenidən göndər» ilə təkrar göndərə bilər.',
          'Modul söndürülə bilər.',
        ],
      },
      ru: {
        title: 'Опросы удовлетворённости',
        purpose: 'Результаты внутреннего опроса (NPS), который уходит клиентам после одобрения визы или закрытия заявки: доля ответов, средние оценки и комментарии.',
        steps: [
          'Выберите даты «С» и «По» и посмотрите NPS, долю ответов и «Динамику по месяцам».',
          'В таблице «По сотрудникам» сравните результаты каждого сотрудника.',
          'Отфильтруйте «Ответы и комментарии» по сотруднику, поводу, оценке (напр. «Критики (0–6)») и «Только с комментарием» и свяжитесь с недовольными клиентами.',
        ],
        tips: [
          'Обычный сотрудник видит только свои результаты.',
          'Повторно отправить неотвеченный опрос («Отправить снова») может только Администратор.',
          'Модуль можно отключить.',
        ],
      },
      en: {
        title: 'Satisfaction surveys',
        purpose: 'Results of the internal survey (NPS) sent to clients after a visa approval or case closure: response rate, average ratings and comments.',
        steps: [
          'Pick the “From” and “To” dates and look at the NPS, response rate and “Monthly trend” at the top.',
          'Compare each staff member’s results in the “By staff member” table.',
          'Filter “Answers and comments” by staff, trigger, score (e.g. “Detractors (0–6)”) and “With comment only”, and follow up with unhappy clients.',
        ],
        tips: [
          'Regular staff see only their own results.',
          'Only an Administrator can resend an unanswered survey with “Resend”.',
          'The module can be switched off.',
        ],
      },
      de: {
        title: 'Zufriedenheitsumfragen',
        purpose: 'Ergebnisse der internen Umfrage (NPS), die Kunden nach der Visumerteilung oder dem Fallabschluss erhalten: Antwortquote, Durchschnittsnoten und Kommentare.',
        steps: [
          'Daten „Von“ und „Bis“ wählen und oben NPS, Antwortquote und „Monatlicher Verlauf“ ansehen.',
          'In der Tabelle „Nach Mitarbeitenden“ die Ergebnisse einzelner Mitarbeitender vergleichen.',
          '„Antworten und Kommentare“ nach Mitarbeitenden, Anlass, Bewertung (z. B. „Kritiker (0–6)“) und „Nur mit Kommentar“ filtern und unzufriedene Kunden kontaktieren.',
        ],
        tips: [
          'Normale Mitarbeitende sehen nur ihre eigenen Ergebnisse.',
          'Eine offene Umfrage kann nur ein Administrator mit „Erneut senden“ nochmals verschicken.',
          'Das Modul kann abgeschaltet werden.',
        ],
      },
    },
  },
  {
    route: 'reviews',
    text: {
      az: {
        title: 'Rəylər',
        purpose: 'Viza təsdiqindən sonra namizədlərdən rəy istənilir. Burada rəylər saytda görünməzdən əvvəl yoxlanılır, təsdiqlənir və ya rədd edilir.',
        steps: [
          'Status filtrindən «Moderasiya gözləyir»i seçin və rəyin mətni ilə qiymətini oxuyun.',
          'Lazım olsa «Düzəliş et» ilə göstərilən adı və ya yazı səhvlərini düzəldin, sonra «Təsdiqlə» və ya «Rədd et» basın.',
          '«Rəysiz təsdiqlənmiş müraciətlər» siyahısında «Dəvət et» ilə rəyi dərhal istəyin; cavab verməyənlərə «Dəvəti yenidən göndər» ilə xatırladın.',
        ],
        tips: [
          'Təsdiqləmək, rədd etmək, düzəliş və dəvət yalnız Administrator və Super admin üçündür.',
          'Saytda yalnız «Dərcə razılıq var» olan təsdiqlənmiş rəylər görünür.',
          'Avtomatik dəvət viza təsdiqindən 3 gün sonra gedir; rəyin mənasını dəyişməyin.',
        ],
      },
      ru: {
        title: 'Отзывы',
        purpose: 'После одобрения визы кандидатов просят оставить отзыв. Здесь отзывы проверяют до публикации на сайте, одобряют или отклоняют.',
        steps: [
          'В фильтре статуса выберите «Ждёт модерации» и прочитайте текст и оценку.',
          'При необходимости исправьте отображаемое имя или опечатки через «Редактировать», затем нажмите «Одобрить» или «Отклонить».',
          'В списке «Одобренные заявки без отзыва» сразу запросите отзыв кнопкой «Пригласить»; не ответившим напомните через «Отправить приглашение снова».',
        ],
        tips: [
          'Одобрять, отклонять, редактировать и приглашать могут только Администратор и Супер-админ.',
          'На сайте видны только одобренные отзывы с пометкой «Есть согласие на публикацию».',
          'Автоприглашение уходит через 3 дня после одобрения визы; не меняйте смысл отзыва.',
        ],
      },
      en: {
        title: 'Reviews',
        purpose: 'Candidates are asked for a review after their visa is approved. Here reviews are checked before they appear on the website and approved or rejected.',
        steps: [
          'Choose “Awaiting moderation” in the status filter and read the text and rating.',
          'If needed, fix the display name or typos with “Edit”, then click “Approve” or “Reject”.',
          'In “Approved cases without a review”, ask right away with “Invite”; remind people who have not answered with “Resend invitation”.',
        ],
        tips: [
          'Approving, rejecting, editing and inviting are for Administrator and Super admin only.',
          'Only approved reviews marked “Consent to publish” appear on the website.',
          'The automatic invitation goes out 3 days after the visa approval; never change a review’s meaning.',
        ],
      },
      de: {
        title: 'Bewertungen',
        purpose: 'Nach der Visumerteilung werden Kandidaten um eine Bewertung gebeten. Hier werden Bewertungen vor der Veröffentlichung geprüft, freigegeben oder abgelehnt.',
        steps: [
          'Im Statusfilter „Wartet auf Prüfung“ wählen und Text und Bewertung lesen.',
          'Bei Bedarf Anzeigenamen oder Tippfehler mit „Bearbeiten“ korrigieren, dann „Freigeben“ oder „Ablehnen“ klicken.',
          'Unter „Erteilte Visa ohne Bewertung“ sofort mit „Einladen“ anfragen; wer nicht antwortet, mit „Einladung erneut senden“ erinnern.',
        ],
        tips: [
          'Freigeben, Ablehnen, Bearbeiten und Einladen nur für Administrator und Super-Admin.',
          'Auf der Website erscheinen nur freigegebene Bewertungen mit „Einverständnis zur Veröffentlichung“.',
          'Die automatische Einladung geht 3 Tage nach der Visumerteilung raus; den Sinn einer Bewertung nie verändern.',
        ],
      },
    },
  },
  {
    route: 'inquiries',
    text: {
      az: {
        title: 'Sorğular',
        purpose: 'Saytdakı əlaqə formu və şirkət əməkdaşlıq formasından gələn müraciətlər (lidlər). Hər sorğuya cavab verilməli və statusu yenilənməlidir.',
        steps: [
          'Status çipləri («Yeni», «İcrada», «Tamamlandı», «Arxivdə»), «Mənim» / «Təyin olunmayıb», «Filtrlər» və axtarışla siyahını süzün; «Qaynar lidlər» kartı ən perspektivliləri göstərir.',
          'Sorğuya klikləyin: yan paneldə mətn, əlaqə şəxsi, şirkət, işçi sayı və dil görünür; e-poçt, zəng və ya WhatsApp ilə cavab verin.',
          'Statusu sətirdə dəyişin; bir neçə sorğunu seçib aşağıdakı paneldən birdən təyin edin, statusunu dəyişin və ya ixrac edin.',
        ],
        tips: [
          'Status daxili qeyddir — göndərənə avtomatik məktub getmir.',
          'Bal qaydalarını («Bal qaydaları») yalnız Administrator dəyişir.',
          'Sorğular silinmir; köhnələri «Arxivdə» statusuna keçirin.',
        ],
      },
      ru: {
        title: 'Запросы',
        purpose: 'Обращения (лиды) из контактной формы сайта и формы сотрудничества для компаний. На каждый запрос нужно ответить и обновить статус.',
        steps: [
          'Отфильтруйте список чипами статуса («Новый», «В работе», «Выполнен», «В архиве»), «Мои» / «Не назначены», кнопкой «Фильтры» и поиском; плитка «Горячие лиды» показывает самые перспективные.',
          'Нажмите на запрос: в боковой панели видны текст, контактное лицо, компания, число работников и язык; ответьте по e-mail, телефону или WhatsApp.',
          'Меняйте статус прямо в строке; выделите несколько запросов и в нижней панели массово назначьте, смените статус или экспортируйте.',
        ],
        tips: [
          'Статус — внутренняя отметка, отправитель автоматического письма не получает.',
          '«Правила баллов» меняет только Администратор.',
          'Запросы не удаляются — старые переводите в «В архиве».',
        ],
      },
      en: {
        title: 'Inquiries',
        purpose: 'Messages (leads) from the website’s contact form and company partnership form. Every inquiry should be answered and its status kept up to date.',
        steps: [
          'Filter with the status chips (“New”, “In progress”, “Done”, “Archived”), “Mine” / “Unassigned”, “Filters” and search; the “Hot leads” tile shows the most promising ones.',
          'Click an inquiry: the side panel shows the text, contact person, company, workers needed and language; reply by e-mail, phone or WhatsApp.',
          'Change the status inline; select several inquiries to assign, change status or export them at once from the bar at the bottom.',
        ],
        tips: [
          'The status is an internal marker — the sender gets no automatic e-mail.',
          'Only an Administrator can change the “Score rules”.',
          'Inquiries cannot be deleted; set old ones to “Archived”.',
        ],
      },
      de: {
        title: 'Anfragen',
        purpose: 'Nachrichten (Leads) aus dem Kontaktformular der Website und dem Kooperationsformular für Firmen. Jede Anfrage beantworten und den Status aktuell halten.',
        steps: [
          'Mit den Status-Chips („Neu“, „In Bearbeitung“, „Erledigt“, „Archiviert“), „Meine“ / „Nicht zugewiesen“, „Filter“ und der Suche filtern; die Kachel „Heiße Leads“ zeigt die vielversprechendsten.',
          'Anfrage anklicken: Im Seitenpanel stehen Text, Ansprechperson, Firma, benötigte Arbeitskräfte und Sprache; per E-Mail, Telefon oder WhatsApp antworten.',
          'Status direkt in der Zeile ändern; mehrere Anfragen markieren und über die Leiste unten gesammelt zuweisen, Status ändern oder exportieren.',
        ],
        tips: [
          'Der Status ist nur intern – der Absender erhält keine automatische E-Mail.',
          'Die „Score-Regeln“ ändert nur ein Administrator.',
          'Anfragen lassen sich nicht löschen; alte auf „Archiviert“ setzen.',
        ],
      },
    },
  },
  {
    route: 'bookings',
    text: {
      az: {
        title: 'Görüşlər',
        purpose: 'Saytda konsultasiya üçün təklif olunan boş vaxtlar və müştərilərin təyin etdiyi görüşlər; ayrıca tabda ofisə gəlişlər.',
        steps: [
          '«Konsultasiyalar» tabında «Gün», «Həftə» və ya «Siyahı» görünüşünü seçin; «Vaxt əlavə et» ilə tək vaxt, «Həftəlik şablon» ilə bir neçə həftəni birdən doldurun.',
          'Tutulmuş vaxta klikləyin: əlaqə, mövzu və mesajı görün, vaxtı gələndə «Görüşü aç» basın, sonra «Keçirildi» və ya «Gəlmədi» qeyd edin.',
          'Görüşü «Ləğv et» ilə ləğv edin (müştəriyə məktub gedir); müştərilərin ofis vizitlərini «Ofisə gəlişlər» tabında idarə edin.',
        ],
        tips: [
          'Tutulmuş vaxtı silmək olmur — əvvəlcə görüşü ləğv edin.',
          'Administrator «Əməkdaş» seçimi ilə istənilən əməkdaşın vaxtlarını idarə edə bilər.',
          'Konsultasiyalar Workspace təqviminə avtomatik düşür.',
        ],
      },
      ru: {
        title: 'Встречи',
        purpose: 'Свободное время для консультаций на сайте и встречи, забронированные клиентами; в отдельной вкладке — визиты в офис.',
        steps: [
          'Во вкладке «Консультации» выберите вид «День», «Неделя» или «Список»; кнопкой «Добавить время» создайте одно окно, «Недельный шаблон» заполнит сразу несколько недель.',
          'Нажмите на занятое время: контакты, тема и сообщение; в назначенное время нажмите «Открыть встречу», затем отметьте «Состоялась» или «Неявка».',
          'Отмените встречу кнопкой «Отменить» (клиенту уходит письмо); визиты клиентов в офис ведите во вкладке «Визиты в офис».',
        ],
        tips: [
          'Занятое время удалить нельзя — сначала отмените встречу.',
          'Администратор через выбор «Сотрудник» управляет временем любого сотрудника.',
          'Консультации автоматически попадают в календарь Workspace.',
        ],
      },
      en: {
        title: 'Bookings',
        purpose: 'Free consultation times offered on the website and the meetings clients have booked; office visits are in a separate tab.',
        steps: [
          'In the “Consultations” tab choose “Day”, “Week” or “List”; add a single time with “Add time” or fill several weeks at once with “Weekly template”.',
          'Click a booked time to see contact, topic and message; at the agreed time click “Open meeting”, then mark it “Done” or “No-show”.',
          'Cancel a meeting with “Cancel” (the client gets an e-mail); manage client office visits in the “Office visits” tab.',
        ],
        tips: [
          'A booked time cannot be deleted — cancel the meeting first.',
          'An Administrator can manage any staff member’s times with the “Staff” selector.',
          'Consultations appear automatically in the Workspace calendar.',
        ],
      },
      de: {
        title: 'Termine',
        purpose: 'Freie Beratungszeiten auf der Website und von Kunden gebuchte Gespräche; Bürotermine stehen in einem eigenen Tab.',
        steps: [
          'Im Tab „Beratungen“ die Ansicht „Tag“, „Woche“ oder „Liste“ wählen; mit „Termin anlegen“ einzelne Zeiten, mit „Wochenvorlage“ mehrere Wochen auf einmal anlegen.',
          'Gebuchten Termin anklicken: Kontakt, Thema und Nachricht; zur vereinbarten Zeit „Gespräch öffnen“ klicken und danach „Durchgeführt“ oder „Nicht erschienen“ markieren.',
          'Ein Gespräch mit „Absagen“ stornieren (der Kunde erhält eine E-Mail); Bürobesuche der Kunden im Tab „Bürotermine“ verwalten.',
        ],
        tips: [
          'Gebuchte Zeiten lassen sich nicht löschen – zuerst das Gespräch absagen.',
          'Ein Administrator verwaltet über die Auswahl „Mitarbeiter“ die Zeiten aller Mitarbeitenden.',
          'Beratungen erscheinen automatisch im Workspace-Kalender.',
        ],
      },
    },
  },
  {
    route: 'overview',
    text: {
      az: {
        title: 'İcmal',
        purpose: 'Analitikanın giriş səhifəsi: seçilmiş dövr üzrə müraciətlər, gəlir və vizalar, əsas göstəricilər, sorğudan gəlişədək qıf və diqqət tələb edən müraciətlər.',
        steps: [
          'Yuxarıda dövrü seçin («Bu ay», «30 gün», «Rüb», «İlin əvvəlindən» və s.); rəqəmlər əvvəlki dövrlə müqayisə olunur.',
          'Əsas qrafikdə «Müraciətlər», «Gəlir» və «Vizalar» arasında keçin, «Sorğudan gəlişədək» qıfını «Mənbə» üzrə süzün.',
          '«Diqqət tələb edən müraciətlər» siyahısından gecikən müraciətləri açın; hesabat üçün «İxrac (CSV)» basın.',
        ],
        tips: [
          '«İllik hədəf»i yalnız Administrator qoyur və dəyişir.',
          'Daha ətraflı rəqəmlər «Analitika» səhifəsindədir.',
        ],
      },
      ru: {
        title: 'Обзор',
        purpose: 'Стартовая страница аналитики: заявки, выручка и визы за период, ключевые показатели, воронка от запроса до приезда и заявки, требующие внимания.',
        steps: [
          'Вверху выберите период («Этот месяц», «30 дней», «Квартал», «С начала года» и др.); цифры сравниваются с предыдущим периодом.',
          'В главном графике переключайте «Заявки», «Выручка» и «Визы»; воронку «От запроса до приезда» фильтруйте по «Источнику».',
          'Откройте застрявшие заявки из списка «Заявки, требующие внимания»; для отчёта нажмите «Экспорт (CSV)».',
        ],
        tips: [
          '«Годовую цель» задаёт и меняет только Администратор.',
          'Подробные цифры — на странице «Аналитика».',
        ],
      },
      en: {
        title: 'Overview',
        purpose: 'The analytics landing page: cases, revenue and visas for the period, key figures, the funnel from inquiry to arrival and the cases that need a look.',
        steps: [
          'Choose the period at the top (“This month”, “30 days”, “Quarter”, “Year to date”, etc.); figures are compared with the previous period.',
          'Switch the main chart between “Cases”, “Revenue” and “Visas” and filter the “From inquiry to arrival” funnel by “Source”.',
          'Open stuck cases from “Cases that need a look”; click “Export (CSV)” for reports.',
        ],
        tips: [
          'Only an Administrator sets and changes the “Annual goal”.',
          'More detailed figures are on the “Analytics” page.',
        ],
      },
      de: {
        title: 'Übersicht',
        purpose: 'Einstiegsseite der Auswertungen: Anträge, Umsatz und Visa im Zeitraum, Kennzahlen, der Funnel von der Anfrage bis zur Ankunft und Anträge, die Aufmerksamkeit brauchen.',
        steps: [
          'Oben den Zeitraum wählen („Dieser Monat“, „30 Tage“, „Quartal“, „Seit Jahresbeginn“ usw.); die Zahlen werden mit dem Vorzeitraum verglichen.',
          'Im Hauptdiagramm zwischen „Anträge“, „Umsatz“ und „Visa“ wechseln und den Funnel „Von der Anfrage bis zur Ankunft“ nach „Quelle“ filtern.',
          'Hängende Fälle aus „Anträge, die Aufmerksamkeit brauchen“ öffnen; für Berichte „Export (CSV)“ klicken.',
        ],
        tips: [
          'Das „Jahresziel“ setzt und ändert nur ein Administrator.',
          'Detailliertere Zahlen stehen auf der Seite „Analytik“.',
        ],
      },
    },
  },
  {
    route: 'analytics',
    text: {
      az: {
        title: 'Analitika',
        purpose: 'Sayt ziyarətindən viza təsdiqinədək bütün yol üzrə konversiya: neçə nəfər gəlib, qeydiyyatdan keçib, müraciət açıb və viza alıb. Məlumat ümumiləşdirilmişdir, kukisiz və şəxsi məlumatsız.',
        steps: [
          'Dövrü seçin: «7 gün», «30 gün», «90 gün» və ya «Seçilmiş» (tarixləri yazıb «Tətbiq et» basın).',
          '«Konversiya qıfı» və «Dinamika»da hər mərhələnin sayını və əvvəlki mərhələdən keçid faizini izləyin; «Əsas mənbələr»də ziyarətçilərin haradan gəldiyinə baxın.',
          '«Viza addımları üzrə itki» və «Viza kateqoriyaları üzrə» bölmələrində müraciətlərin harada dayandığını görün; hesabat üçün «CSV ixrac» basın.',
        ],
        tips: [
          'Qısa dövrlərdə faizlər çox dəyişir — nəticə üçün 30–90 gün seçin.',
          '«Do Not Track» aktiv olan ziyarətçilər sayılmır.',
        ],
      },
      ru: {
        title: 'Аналитика',
        purpose: 'Конверсия по всему пути от визита на сайт до одобрения визы: сколько пришло, зарегистрировалось, открыло заявку и получило визу. Данные агрегированы, без cookies и личных данных.',
        steps: [
          'Выберите период: «7 дней», «30 дней», «90 дней» или «Период» (введите даты и нажмите «Применить»).',
          'В «Воронке конверсии» и «Динамике» следите за числом на каждом этапе и процентом перехода; в «Основных источниках» смотрите, откуда приходят посетители.',
          'В блоках «Отсев по шагам визы» и «По категориям виз» видно, где останавливаются заявки; для отчёта нажмите «Экспорт CSV».',
        ],
        tips: [
          'На коротких периодах проценты сильно колеблются — для выводов берите 30–90 дней.',
          'Посетители с включённым «Do Not Track» не учитываются.',
        ],
      },
      en: {
        title: 'Analytics',
        purpose: 'Conversion along the whole path from a website visit to an approved visa: how many came, registered, opened a case and got a visa. Data is aggregated, with no cookies and no personal data.',
        steps: [
          'Choose the period: “7 days”, “30 days”, “90 days” or “Custom” (enter the dates and click “Apply”).',
          'In the “Conversion funnel” and “Over time” follow the count per stage and the rate from the previous stage; “Top sources” shows where visitors come from.',
          '“Drop-off by visa step” and “By visa category” show where cases stop; click “Export CSV” for reports.',
        ],
        tips: [
          'Percentages swing a lot over short periods — use 30–90 days before drawing conclusions.',
          'Visitors with “Do Not Track” enabled are not counted.',
        ],
      },
      de: {
        title: 'Analytik',
        purpose: 'Conversion entlang des ganzen Wegs vom Website-Besuch bis zur Visumerteilung: wie viele kamen, sich registrierten, einen Fall eröffneten und ein Visum erhielten. Aggregiert, ohne Cookies und ohne personenbezogene Daten.',
        steps: [
          'Zeitraum wählen: „7 Tage“, „30 Tage“, „90 Tage“ oder „Zeitraum“ (Daten eingeben und „Anwenden“ klicken).',
          'Im „Conversion-Funnel“ und im „Verlauf“ die Zahl je Stufe und die Quote zur Vorstufe verfolgen; „Top-Quellen“ zeigt, woher Besucher kommen.',
          '„Abbruch pro Visumschritt“ und „Nach Visumkategorie“ zeigen, wo Fälle stehen bleiben; für Berichte „CSV exportieren“ klicken.',
        ],
        tips: [
          'In kurzen Zeiträumen schwanken die Quoten stark – für Schlüsse 30–90 Tage wählen.',
          'Besucher mit aktiviertem „Do Not Track“ werden nicht gezählt.',
        ],
      },
    },
  },
  {
    route: 'year-review',
    text: {
      az: {
        title: 'İlin yekunu',
        purpose: 'Seçilmiş il üzrə yekunlar: açılan və təsdiqlənən müraciətlər, ən məşğul ay, top peşələr və şəhərlər, ən sürətli təsdiq.',
        steps: [
          '«İl» siyahısından ili seçin.',
          '«Aylar üzrə» qrafikinə, «Top peşələr», «Top şəhərlər (təsdiqlənənlər)» və «Ən sürətli təsdiq» kartlarına baxın.',
          'Komanda görüşündə göstərmək üçün «Hekayə kimi oynat» basın.',
        ],
        tips: [
          '«Əməkdaşlar üzrə» cədvəlini yalnız Administrator və Super admin görür.',
          'Ailə üzvlərinin müraciətləri sayılmır; aylar Bakı vaxtı ilə hesablanır.',
        ],
      },
      ru: {
        title: 'Итоги года',
        purpose: 'Итоги выбранного года: открытые и одобренные заявки, самый загруженный месяц, топ профессий и городов, самое быстрое одобрение.',
        steps: [
          'Выберите год в списке «Год».',
          'Посмотрите график «По месяцам» и карточки «Топ профессий», «Топ городов (одобренные)» и «Самое быстрое одобрение».',
          'Чтобы показать итоги на встрече команды, нажмите «Показать как историю».',
        ],
        tips: [
          'Таблицу «По сотрудникам» видят только Администратор и Супер-админ.',
          'Заявки членов семьи не учитываются; месяцы считаются по бакинскому времени.',
        ],
      },
      en: {
        title: 'Year in review',
        purpose: 'The highlights of a chosen year: cases opened and approved, the busiest month, top professions and cities and the fastest approval.',
        steps: [
          'Pick the year in the “Year” list.',
          'Look at the “By month” chart and the “Top professions”, “Top cities (approved)” and “Fastest approval” cards.',
          'Click “Play as a story” to present the year in a team meeting.',
        ],
        tips: [
          'The “Per staff member” table is visible to Administrator and Super admin only.',
          'Family members’ applications are not counted; months are in Baku time.',
        ],
      },
      de: {
        title: 'Jahresrückblick',
        purpose: 'Die Highlights eines gewählten Jahres: eröffnete und genehmigte Anträge, stärkster Monat, Top-Berufe und -Städte sowie die schnellste Zusage.',
        steps: [
          'Im Feld „Jahr“ das Jahr wählen.',
          'Das Diagramm „Nach Monaten“ und die Karten „Top-Berufe“, „Top-Städte (genehmigt)“ und „Schnellste Zusage“ ansehen.',
          'Mit „Als Story abspielen“ das Jahr im Teammeeting präsentieren.',
        ],
        tips: [
          'Die Tabelle „Pro Mitarbeiter:in“ sehen nur Administrator und Super-Admin.',
          'Anträge von Familienangehörigen zählen nicht; Monate nach Bakuer Zeit.',
        ],
      },
    },
  },
  {
    route: 'partners/*',
    text: {
      az: {
        title: 'Partnyorlar',
        purpose: 'Bizə müştəri gətirən vasitəçilər (şəxslər və şirkətlər): müqavilələr, gətirdikləri müştərilər, komissiyalar və kvotalar.',
        steps: [
          'Siyahını axtarış, növ, ölkə, teq, müqavilə və kvota filtrləri ilə süzün, sütun başlığına klikləyib sıralayın.',
          'Partnyorun profilini açın: «Məlumat», «Müqavilələr», «Müştərilər / müraciətlər», «Komissiyalar», «Sənədlər», «Tarixçə» və s. tabları var.',
          'Yuxarıdakı düymələrlə «Bütün komissiyalar», «Ablehnung hesabatı» və «Məktəblər və dil kursları» səhifələrini açın və ya CSV yükləyin.',
        ],
        tips: [
          '«Partnyor əlavə et» və əlavə sahələrin idarəsi yalnız Administrator üçündür.',
          'Hər müraciətdə partnyoru qeyd edin ki, komissiyalar qarışmasın.',
          'Modul söndürülə bilər.',
        ],
      },
      ru: {
        title: 'Партнёры',
        purpose: 'Посредники (частные лица и компании), которые приводят клиентов: договоры, приведённые клиенты, комиссии и квоты.',
        steps: [
          'Фильтруйте список поиском, типом, страной, тегом, договором и квотой; сортируйте кликом по заголовку столбца.',
          'Откройте профиль партнёра: вкладки «Данные», «Договоры», «Клиенты / заявки», «Комиссии», «Документы», «История» и др.',
          'Кнопками вверху откройте «Все комиссии», «Отчёт Ablehnung» и «Школы и языковые школы» или скачайте CSV.',
        ],
        tips: [
          '«Добавить партнёра» и управление доп. полями доступны только Администратору.',
          'Указывайте партнёра в каждой заявке, чтобы не путать комиссии.',
          'Модуль можно отключить.',
        ],
      },
      en: {
        title: 'Referral partners',
        purpose: 'Middlemen (individuals and companies) who bring us clients: contracts, referred clients, commissions and quotas.',
        steps: [
          'Filter the list by search, type, country, tag, contract and quota; click a column header to sort.',
          'Open a partner’s profile: tabs “Details”, “Contracts”, “Clients / cases”, “Commissions”, “Documents”, “History” and more.',
          'Use the buttons at the top to open “All commissions”, the “Ablehnung report” and “Schools & language schools”, or download a CSV.',
        ],
        tips: [
          '“Add partner” and managing custom fields are for Administrators only.',
          'Set the partner on every case so commissions never get mixed up.',
          'The module can be switched off.',
        ],
      },
      de: {
        title: 'Vermittler',
        purpose: 'Vermittler (Personen und Firmen), die uns Kunden bringen: Verträge, vermittelte Kunden, Provisionen und Kontingente.',
        steps: [
          'Liste über Suche, Typ, Land, Tag, Vertrag und Kontingent filtern; per Klick auf die Spaltenüberschrift sortieren.',
          'Profil eines Vermittlers öffnen: Tabs „Stammdaten“, „Verträge“, „Kunden / Anträge“, „Provisionen“, „Dokumente“, „Verlauf“ u. a.',
          'Über die Schaltflächen oben „Alle Provisionen“, den „Ablehnungs-Bericht“ und „Schulen & Sprachschulen“ öffnen oder eine CSV herunterladen.',
        ],
        tips: [
          '„Vermittler hinzufügen“ und die Verwaltung eigener Felder nur für Administratoren.',
          'Bei jedem Fall den Vermittler eintragen, damit Provisionen nicht verwechselt werden.',
          'Das Modul kann abgeschaltet werden.',
        ],
      },
    },
  },
  {
    route: 'public-api-keys',
    text: {
      az: {
        title: 'Vakansiya API açarları',
        purpose: 'Tərəfdaşlar (kolleclər, dil məktəbləri, agentliklər) bizim dərc olunmuş vakansiyalarımızı öz saytlarında göstərmək üçün API açarı alır. Burada açarlar yaradılır və istifadəsi izlənir.',
        steps: [
          '«Yeni açar» basın, tərəfdaşı seçin, ad və limit (sorğu / dəqiqə) yazıb «Yarat» basın.',
          'Açarı dərhal kopyalayın və tərəfdaşa təhlükəsiz kanalla göndərin, «Sənədlər (/developers)» linkini də verin.',
          'Cədvəldə sorğuları, limitə düşənləri və link ilə gələn müraciətləri izləyin; lazım olsa «Limiti dəyiş» və ya «Ləğv et» basın.',
        ],
        tips: [
          'Yalnız Administrator və Super admin üçündür.',
          'Açar bir dəfə göstərilir; ləğv edilmiş açarı geri qaytarmaq olmur.',
          'API-yə yalnız öz açıq vakansiyalarımız daxildir, üçüncü tərəf elanları yox.',
        ],
      },
      ru: {
        title: 'Ключи API вакансий',
        purpose: 'Партнёры (колледжи, языковые школы, агентства) получают API-ключ, чтобы показывать наши опубликованные вакансии на своих сайтах. Здесь ключи создают и следят за их использованием.',
        steps: [
          'Нажмите «Новый ключ», выберите партнёра, укажите название и лимит (запросов в минуту) и создайте ключ.',
          'Сразу скопируйте ключ, передайте его партнёру по защищённому каналу и дайте ссылку «Документация (/developers)».',
          'В таблице следите за запросами, превышениями лимита и откликами по ссылке; при необходимости нажмите «Изменить лимит» или «Отозвать».',
        ],
        tips: [
          'Только для Администратора и Супер-админа.',
          'Ключ показывается один раз; отозванный ключ не восстановить.',
          'В API попадают только наши открытые вакансии, без сторонних объявлений.',
        ],
      },
      en: {
        title: 'Vacancy API keys',
        purpose: 'Partners (colleges, language schools, agencies) get an API key to show our published vacancies on their own websites. Here you create keys and track their usage.',
        steps: [
          'Click “New key”, choose the partner, enter a name and the limit (requests / minute) and create it.',
          'Copy the key right away, send it to the partner over a secure channel and share the “Documentation (/developers)” link.',
          'Track requests, rate-limited calls and applications via link in the table; use “Change limit” or “Revoke” when needed.',
        ],
        tips: [
          'Administrator and Super admin only.',
          'A key is shown only once; a revoked key cannot be restored.',
          'Only our own open vacancies are in the API, no third-party listings.',
        ],
      },
      de: {
        title: 'Stellen-API-Schlüssel',
        purpose: 'Partner (Schulen, Sprachschulen, Agenturen) erhalten einen API-Schlüssel, um unsere veröffentlichten Stellen auf ihrer Website zu zeigen. Hier werden Schlüssel erstellt und ihre Nutzung verfolgt.',
        steps: [
          '„Neuer Schlüssel“ klicken, Partner wählen, Name und Limit (Anfragen / Minute) eingeben und „Erstellen“ klicken.',
          'Schlüssel sofort kopieren, über einen sicheren Kanal an den Partner senden und den Link „Dokumentation (/developers)“ mitgeben.',
          'In der Tabelle Anfragen, Limit-Treffer und Bewerbungen über Link verfolgen; bei Bedarf „Limit ändern“ oder „Widerrufen“.',
        ],
        tips: [
          'Nur für Administrator und Super-Admin.',
          'Ein Schlüssel wird nur einmal angezeigt; widerrufene Schlüssel lassen sich nicht wiederherstellen.',
          'Die API liefert nur unsere eigenen offenen Stellen, keine Fremdanzeigen.',
        ],
      },
    },
  },
  {
    route: 'agents/*',
    text: {
      az: {
        title: 'Agentlər',
        purpose: 'Partnyor proqramı: agentlər öz referal kodu və linki ilə müştəri gətirir, siz onların komissiyalarını təsdiqləyir və ödənildi kimi qeyd edirsiniz.',
        steps: [
          '«Agentlər» tabında «Yeni agent» basın, məlumatları və «Komissiya şərtləri»ni doldurub «Yarat və dəvət göndər» basın.',
          'Agentin sətrinə klikləyib profili açın: referal linkini kopyalayın, şərtləri və IBAN-ı dəyişin, müştərini agentə bağlayın və ya ayırın.',
          '«Komissiyalar» tabında gözləyən komissiyaları «Təsdiqlə», bank köçürməsindən sonra «Ödənildi kimi qeyd et» basın; «CSV ixrac» mühasibat üçündür.',
        ],
        tips: [
          'Yalnız Administrator və Super admin üçündür; modul söndürülə bilər.',
          'Bonus və ya düzəliş üçün «Əl ilə komissiya» istifadə edin.',
          'Agentlər öz kabinetini saytda /agent ünvanında görür.',
        ],
      },
      ru: {
        title: 'Агенты',
        purpose: 'Партнёрская программа: агенты приводят клиентов по своему реферальному коду и ссылке, а вы одобряете их комиссии и отмечаете выплату.',
        steps: [
          'Во вкладке «Агенты» нажмите «Новый агент», заполните данные и «Условия комиссии» и нажмите «Создать и пригласить».',
          'Кликните строку агента, чтобы открыть профиль: скопируйте реферальную ссылку, измените условия и IBAN, привяжите или отвяжите клиента.',
          'Во вкладке «Комиссии» нажмите «Одобрить» для ожидающих, после перевода — «Отметить как выплаченные»; «Экспорт CSV» — для бухгалтерии.',
        ],
        tips: [
          'Только для Администратора и Супер-админа; модуль можно отключить.',
          'Для бонусов и корректировок используйте «Ручная комиссия».',
          'Агенты видят свой кабинет на сайте по адресу /agent.',
        ],
      },
      en: {
        title: 'Agents',
        purpose: 'Partner programme: agents bring in clients with their own referral code and link, and you approve their commissions and mark them as paid.',
        steps: [
          'In the “Agents” tab click “New agent”, fill in the details and the “Commission terms” and click “Create and invite”.',
          'Click an agent’s row to open the profile: copy the referral link, change the terms and IBAN, attribute a client to the agent or detach one.',
          'In the “Commissions” tab click “Approve” on pending ones and, after the bank transfer, “Mark as paid”; “Export CSV” is for accounting.',
        ],
        tips: [
          'Administrator and Super admin only; the module can be switched off.',
          'Use “Manual commission” for bonuses or corrections.',
          'Agents see their own portal on the website at /agent.',
        ],
      },
      de: {
        title: 'Agenten',
        purpose: 'Partnerprogramm: Agenten bringen Kunden über ihren eigenen Empfehlungscode und Link, Sie geben ihre Provisionen frei und markieren sie als ausgezahlt.',
        steps: [
          'Im Tab „Agenten“ auf „Neuer Agent“ klicken, Daten und „Provisionsbedingungen“ ausfüllen und „Anlegen und einladen“ klicken.',
          'Zeile eines Agenten anklicken, um das Profil zu öffnen: Empfehlungslink kopieren, Bedingungen und IBAN ändern, Kunden zuordnen oder lösen.',
          'Im Tab „Provisionen“ offene Provisionen „Freigeben“ und nach der Überweisung „Als ausgezahlt markieren“; „CSV exportieren“ für die Buchhaltung.',
        ],
        tips: [
          'Nur für Administrator und Super-Admin; das Modul kann abgeschaltet werden.',
          'Für Boni oder Korrekturen „Manuelle Provision“ verwenden.',
          'Agenten sehen ihr eigenes Portal auf der Website unter /agent.',
        ],
      },
    },
  },
  {
    route: 'events',
    text: {
      az: {
        title: 'Tədbirlər',
        purpose: 'Vebinarlar və məlumat sessiyaları: qeydiyyat, xatırlatmalar, iştirak və tədbirdən sonrakı məktub. Dərc olunmuş tədbirin saytda öz səhifəsi olur.',
        steps: [
          '«Yeni tədbir» basın: başlıq, təsvir, tarix, vaxt, müddət, onlayn/oflayn, link və ya ünvan, tutum və dili doldurub yadda saxlayın.',
          '«Qarşıdakı» və ya «Keçmiş» seçib tədbirə klikləyin; «Qeydiyyatlar» siyahısında hər iştirakçını «İştirak etdi» və ya «Gəlmədi» kimi qeyd edin.',
          'Tədbirdən sonra «Sonrakı məktub» bölməsində auditoriyanı seçib «Göndər» basın; video yazının linkini də əlavə edə bilərsiniz.',
        ],
        tips: [
          'Tədbiri ləğv etdikdə bütün qeydiyyatlılara məktub gedir.',
          'Tədbiri silmək yalnız Administrator üçündür.',
          'Kartda tədbirdən gələn sorğu, müştəri və müraciət sayı göstərilir.',
        ],
      },
      ru: {
        title: 'Мероприятия',
        purpose: 'Вебинары и инфосессии: регистрации, напоминания, посещаемость и письмо после мероприятия. У опубликованного мероприятия есть своя страница на сайте.',
        steps: [
          'Нажмите «Новое мероприятие»: заполните название, описание, дату, время, длительность, онлайн/офлайн, ссылку или адрес, вместимость и язык и сохраните.',
          'Выберите «Предстоящие» или «Прошедшие» и кликните мероприятие; в списке «Регистрации» отметьте каждого как «Пришли» или «Не пришли».',
          'После мероприятия в блоке «Письмо после мероприятия» выберите аудиторию и нажмите «Отправить»; можно добавить ссылку на запись.',
        ],
        tips: [
          'При отмене мероприятия всем зарегистрированным уходит письмо.',
          'Удалять мероприятия может только Администратор.',
          'В карточке видно число запросов, клиентов и заявок от мероприятия.',
        ],
      },
      en: {
        title: 'Events',
        purpose: 'Webinars and info sessions: registrations, reminders, attendance and the follow-up e-mail. A published event gets its own page on the website.',
        steps: [
          'Click “New event”: fill in title, description, date, time, duration, online/offline, link or address, capacity and language, then save.',
          'Choose “Upcoming” or “Past” and click an event; in “Registrations” mark each person as “Attended” or “No-show”.',
          'After the event, choose the audience under “Follow-up e-mail” and click “Send”; you can also add the recording link.',
        ],
        tips: [
          'Cancelling an event e-mails every registrant.',
          'Only an Administrator can delete events.',
          'Each card shows the inquiries, clients and cases that came from the event.',
        ],
      },
      de: {
        title: 'Veranstaltungen',
        purpose: 'Webinare und Infoveranstaltungen: Anmeldungen, Erinnerungen, Anwesenheit und Follow-up-Mail. Eine veröffentlichte Veranstaltung erhält eine eigene Seite auf der Website.',
        steps: [
          '„Neue Veranstaltung“ klicken: Titel, Beschreibung, Datum, Uhrzeit, Dauer, online/vor Ort, Link oder Adresse, Kapazität und Sprache ausfüllen und speichern.',
          '„Kommend“ oder „Vergangen“ wählen und eine Veranstaltung anklicken; unter „Anmeldungen“ jede Person als „Teilgenommen“ oder „Nicht erschienen“ markieren.',
          'Danach unter „Follow-up-Mail“ die Zielgruppe wählen und „Senden“ klicken; auch der Link zur Aufzeichnung lässt sich ergänzen.',
        ],
        tips: [
          'Bei einer Absage erhalten alle Angemeldeten eine E-Mail.',
          'Veranstaltungen löschen kann nur ein Administrator.',
          'Jede Karte zeigt Anfragen, Kunden und Anträge, die aus der Veranstaltung entstanden sind.',
        ],
      },
    },
  },
];
