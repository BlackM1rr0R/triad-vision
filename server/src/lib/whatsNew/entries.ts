/**
 * "Yeniliklər" (what's new) — the code registry of staff release notes, newest first. Each entry: a stable id, the
 * date, short texts in az / ru / en / de (2–3 simple sentences), the staff roles that see it and the admin page it
 * links to. Admins add more entries from the UI (WhatsNewEntry rows) and may hide code entries
 * (lib/whatsNew/service.ts). Older notes whose texts live in the client i18n (sp.whatsNew.items.*) come from
 * lib/staffUi RELEASE_NOTES.
 */

export const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface L10nText {
  az: string;
  ru: string;
  en: string;
  de: string;
}

export interface WhatsNewCodeEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: L10nText;
  body: L10nText;
  roles: readonly StaffRole[];
  /** Admin page (path starting with /admin). */
  link: string;
}

const ALL: readonly StaffRole[] = STAFF_ROLES;
const ADMINS: readonly StaffRole[] = ['ADMIN', 'SUPER_ADMIN'];
const OWNER: readonly StaffRole[] = ['SUPER_ADMIN'];

export const WHATS_NEW_ENTRIES: WhatsNewCodeEntry[] = [
  {
    id: '2026-11-training-checklist',
    date: '2026-11-17',
    roles: ALL,
    link: '/admin/training-checklist',
    title: { az: 'Yeni əməkdaş üçün tapşırıq siyahısı', ru: 'Чек-лист для нового сотрудника', en: 'New staff checklist', de: 'Checkliste für neue Mitarbeitende' },
    body: {
      az: '10 kiçik tapşırıq real sistemdə: müraciət açmaq, qeyd yazmaq, sənəd linki göndərmək və s. Sistem çoxunu özü görür və işarələyir. Hamısı bitənə qədər kart idarə panelində görünür.',
      ru: '10 небольших заданий в реальной системе: открыть заявку, написать заметку, отправить ссылку для документов и т. д. Большинство система отмечает сама. Карточка видна на панели, пока всё не выполнено.',
      en: '10 small tasks in the real system: open a case, write a note, send an upload link and more. Most are ticked automatically. The card stays on the dashboard until everything is done.',
      de: '10 kleine Aufgaben im echten System: Fall öffnen, Notiz schreiben, Upload-Link senden usw. Die meisten hakt das System selbst ab. Die Karte bleibt auf dem Dashboard, bis alles erledigt ist.',
    },
  },
  {
    id: '2026-11-setup-checklist',
    date: '2026-11-17',
    roles: ADMINS,
    link: '/admin/setup-checklist',
    title: { az: 'Sahibin quraşdırma siyahısı', ru: 'Чек-лист настройки для владельца', en: 'Owner setup checklist', de: 'Einrichtungs-Checkliste für Inhaber' },
    body: {
      az: 'Yeni funksiyaların işə düşməsi üçün qalan addımlar bir yerdə: Google rəy linki, AVV, Trust Center, TV, proqramlar və s. Mümkün olanları sistem özü yoxlayır. Hər bəndin yanında harada edildiyinə link var.',
      ru: 'Все оставшиеся шаги для запуска новых функций в одном месте: ссылка на отзывы Google, AVV, Trust Center, ТВ, программы и др. Что можно, система проверяет сама. У каждого пункта есть ссылка на нужную страницу.',
      en: 'All remaining steps to switch on the new features in one place: Google review link, AVV, Trust Center, TV, programmes and more. The system checks what it can by itself. Each item links to where it is done.',
      de: 'Alle offenen Schritte, um die neuen Funktionen einzuschalten, an einem Ort: Google-Bewertungslink, AVV, Trust Center, TV, Studiengänge usw. Was möglich ist, prüft das System selbst. Jeder Punkt verlinkt auf die passende Seite.',
    },
  },
  {
    id: '2026-11-past-placements',
    date: '2026-11-17',
    roles: ALL,
    link: '/admin/past-placements',
    title: { az: 'Keçmiş yerləşdirmələr', ru: 'Прошлые трудоустройства', en: 'Past placements', de: 'Frühere Vermittlungen' },
    body: {
      az: 'Sistemdən əvvəlki real yerləşdirmələri şəhər və peşə üzrə daxil edin. Onlar saytdakı xəritənin rəqəmlərinə əlavə olunur (ən azı 3 nəfər olan qruplar). Redaktə adminlər üçündür.',
      ru: 'Вносите реальные трудоустройства до системы по городам и профессиям. Они добавляются к цифрам карты на сайте (группы от 3 человек). Редактируют администраторы.',
      en: 'Enter real placements from before the system by city and profession. They are added to the public map numbers (groups of at least 3). Editing is for admins.',
      de: 'Echte Vermittlungen aus der Zeit vor dem System nach Stadt und Beruf erfassen. Sie fließen in die Zahlen der öffentlichen Karte ein (Gruppen ab 3 Personen). Bearbeiten dürfen Admins.',
    },
  },
  {
    id: '2026-11-germany-ready',
    date: '2026-11-17',
    roles: ALL,
    link: '/admin/germany-ready',
    title: { az: 'Germany Ready sertifikatları', ru: 'Сертификаты Germany Ready', en: 'Germany Ready certificates', de: 'Germany-Ready-Zertifikate' },
    body: {
      az: 'Müştərilər oyun və testləri bitirib "Germany Ready" sertifikatı alır. Bu səhifədə sertifikatları görə, ləğv edə və bərpa edə bilərsiniz. Həftəlik çağırışın sırasını adminlər qurur.',
      ru: 'Клиенты проходят игры и тесты и получают сертификат «Germany Ready». На этой странице сертификаты можно смотреть, отзывать и восстанавливать. Порядок еженедельного задания настраивают администраторы.',
      en: 'Clients finish games and quizzes and get a "Germany Ready" certificate. On this page you can view, revoke and restore certificates. Admins set the order of the weekly challenge.',
      de: 'Kundinnen und Kunden schließen Spiele und Quiz ab und erhalten ein „Germany Ready“-Zertifikat. Hier lassen sich Zertifikate ansehen, widerrufen und wiederherstellen. Die Reihenfolge der Wochen-Challenge legen Admins fest.',
    },
  },
  {
    id: '2026-11-google-review',
    date: '2026-11-17',
    roles: ALL,
    link: '/admin/reviews',
    title: { az: 'Google rəy sorğuları avtomatik', ru: 'Запросы отзывов Google автоматически', en: 'Automatic Google review requests', de: 'Automatische Google-Bewertungsanfragen' },
    body: {
      az: 'Viza təsdiqi, gəliş və ya bağlanışdan sonra müştəri qiymət səhifəsinə dəvət alır. Aşağı qiymətdə əməkdaşa tapşırıq yaranır — rəy filtrlənmir (Google qaydası). Parametrlər "Rəylər" səhifəsindədir.',
      ru: 'После одобрения визы, приезда или закрытия клиент получает приглашение на страницу оценки. При низкой оценке создаётся задача сотруднику — отзывы не фильтруются (правило Google). Настройки на странице «Отзывы».',
      en: 'After visa approval, arrival or closing, the client is invited to a rating page. A low rating creates a task for staff — reviews are never filtered (Google policy). Settings are on the Reviews page.',
      de: 'Nach Visum-Zusage, Ankunft oder Abschluss erhält der Kunde eine Einladung zur Bewertungsseite. Eine niedrige Bewertung erzeugt eine Aufgabe fürs Team — gefiltert wird nicht (Google-Richtlinie). Einstellungen unter „Bewertungen“.',
    },
  },
  {
    id: '2026-11-data-freshness',
    date: '2026-11-17',
    roles: ADMINS,
    link: '/admin/data-freshness',
    title: { az: 'Məlumatların aktuallığı', ru: 'Актуальность данных', en: 'Data freshness', de: 'Datenaktualität' },
    body: {
      az: 'Hər il dəyişən rəqəmlər (minimum maaş, Kindergeld və s.) bir siyahıdadır: mənbə və növbəti yoxlama tarixi ilə. Vaxtı çatanda adminlər xatırlatma alır. Yoxladıqdan sonra "Yoxlandı" basın.',
      ru: 'Ежегодно меняющиеся цифры (минимальная зарплата, Kindergeld и др.) собраны в одном списке с источником и датой проверки. Администраторы получают напоминание. После проверки нажмите «Проверено».',
      en: 'Yearly figures (minimum wage, Kindergeld and more) are in one list with their source and next review date. Admins get a reminder when one is due. Press "Reviewed" after checking.',
      de: 'Jährlich wechselnde Zahlen (Mindestlohn, Kindergeld usw.) stehen in einer Liste mit Quelle und nächstem Prüftermin. Admins werden erinnert. Nach der Prüfung „Geprüft“ drücken.',
    },
  },
  {
    id: '2026-11-featured-tools',
    date: '2026-11-17',
    roles: ADMINS,
    link: '/admin/tool-analytics',
    title: { az: 'Seçilmiş alətlər', ru: 'Избранные инструменты', en: 'Featured tools', de: 'Hervorgehobene Tools' },
    body: {
      az: '/tools səhifəsində yuxarıda göstərilən "ən faydalı" alətləri özünüz seçin. Bunu "Alət analitikası" səhifəsində edirsiniz. Sıra sürüşdürməklə dəyişir.',
      ru: 'Выбирайте «самые полезные» инструменты вверху страницы /tools. Это делается на странице «Аналитика инструментов». Порядок меняется перетаскиванием.',
      en: 'Choose the "most useful" tools shown at the top of /tools. You do this on the Tool analytics page. Drag to change the order.',
      de: 'Wählen Sie die „nützlichsten“ Tools oben auf /tools. Das geht auf der Seite „Tool-Analyse“. Die Reihenfolge per Ziehen ändern.',
    },
  },
  {
    id: '2026-11-tool-analytics',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/tool-analytics',
    title: { az: 'Alət analitikası', ru: 'Аналитика инструментов', en: 'Tool analytics', de: 'Tool-Analyse' },
    body: {
      az: 'Saytdakı pulsuz alətlərə baxış, istifadə və nəticə e-poçtları sayılır. Hansı alətin qeydiyyata gətirdiyini görürsünüz. Yalnız ümumi rəqəmlər, şəxsi məlumat yoxdur.',
      ru: 'Считаются просмотры, использование и письма с результатами бесплатных инструментов сайта. Видно, какой инструмент приводит к регистрации. Только общие цифры, без личных данных.',
      en: 'Views, uses and result e-mails of the free site tools are counted. You see which tool leads to sign-ups. Only totals, no personal data.',
      de: 'Aufrufe, Nutzung und Ergebnis-E-Mails der kostenlosen Tools werden gezählt. Sie sehen, welches Tool zu Registrierungen führt. Nur Summen, keine personenbezogenen Daten.',
    },
  },
  {
    id: '2026-11-real-salaries',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/real-salaries',
    title: { az: 'Real maaş bazası', ru: 'База реальных зарплат', en: 'Real salary database', de: 'Echte-Gehälter-Datenbank' },
    body: {
      az: 'İmzalanmış müqavilələrdən anonim maaş statistikası yaranır (ən azı 3 qeyd). Səhv qeydi statistikadan çıxara bilərsiniz. Saytda yalnız ümumi rəqəmlər görünür.',
      ru: 'Из подписанных договоров строится анонимная статистика зарплат (от 3 записей). Ошибочную запись можно исключить. На сайте видны только общие цифры.',
      en: 'Signed contracts feed an anonymous salary statistic (at least 3 records). You can exclude a wrong record. The site only shows totals.',
      de: 'Aus unterschriebenen Verträgen entsteht eine anonyme Gehaltsstatistik (mindestens 3 Einträge). Falsche Einträge lassen sich ausschließen. Die Website zeigt nur Summen.',
    },
  },
  {
    id: '2026-11-quarterly-report',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/quarterly-report',
    title: { az: 'Rüblük hesabat', ru: 'Квартальный отчёт', en: 'Quarterly report', de: 'Quartalsbericht' },
    body: {
      az: 'Hər rüb üçün yerləşdirmə, peşə və şəhər rəqəmləri avtomatik toplanır. Adminlər giriş mətni yazıb PDF kimi dərc edir. Kiçik qruplar (3-dən az) gizlədilir.',
      ru: 'Цифры по трудоустройствам, профессиям и городам собираются за каждый квартал автоматически. Администраторы пишут вступление и публикуют PDF. Маленькие группы (меньше 3) скрываются.',
      en: 'Placement, profession and city figures are collected for each quarter automatically. Admins write an intro and publish a PDF. Small groups (under 3) are hidden.',
      de: 'Zahlen zu Vermittlungen, Berufen und Städten werden je Quartal automatisch gesammelt. Admins schreiben eine Einleitung und veröffentlichen ein PDF. Kleine Gruppen (unter 3) werden ausgeblendet.',
    },
  },
  {
    id: '2026-11-public-api-keys',
    date: '2026-11-16',
    roles: ADMINS,
    link: '/admin/public-api-keys',
    title: { az: 'Tərəfdaşlar üçün vakansiya API', ru: 'API вакансий для партнёров', en: 'Vacancy API for partners', de: 'Stellen-API für Partner' },
    body: {
      az: 'Tərəfdaşlara vakansiyalarımızı öz saytlarında göstərmək üçün açar verin. İstifadə və gələn müraciətlər sayılır. Açarı istənilən vaxt ləğv etmək olar.',
      ru: 'Выдавайте партнёрам ключ, чтобы показывать наши вакансии на их сайтах. Использование и заявки считаются. Ключ можно отозвать в любой момент.',
      en: 'Give partners a key to show our vacancies on their own sites. Usage and resulting applications are counted. A key can be revoked at any time.',
      de: 'Partner erhalten einen Schlüssel, um unsere Stellen auf ihrer Website zu zeigen. Nutzung und Bewerbungen werden gezählt. Schlüssel lassen sich jederzeit widerrufen.',
    },
  },
  {
    id: '2026-11-partner-schools',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/partners',
    title: { az: 'Tərəfdaş məktəblər', ru: 'Школы-партнёры', en: 'Partner schools', de: 'Partnerschulen' },
    body: {
      az: 'Kolleclər və dil məktəbləri ayrıca kateqoriyadır. Onların göndərdiyi tələbə qeydlərini yoxlayıb təsdiqləyirsiniz. Hamısı "Tərəfdaşlar" səhifəsindədir.',
      ru: 'Колледжи и языковые школы — отдельная категория. Вы проверяете и подтверждаете присланные ими записи студентов. Всё на странице «Партнёры».',
      en: 'Colleges and language schools are their own category. You review and approve the student records they send. Everything is on the Partners page.',
      de: 'Colleges und Sprachschulen sind eine eigene Kategorie. Von ihnen gemeldete Schülerdaten prüfen und bestätigen Sie. Alles auf der Seite „Partner“.',
    },
  },
  {
    id: '2026-11-trust-avv',
    date: '2026-11-16',
    roles: ADMINS,
    link: '/admin/trust',
    title: { az: 'Trust Center və AVV', ru: 'Trust Center и AVV', en: 'Trust Center and AVV', de: 'Trust Center und AVV' },
    body: {
      az: 'İşəgötürənlər üçün /trust səhifəsi: məlumatların harada saxlandığı və təhlükəsizlik tədbirləri. AVV (məlumat emalı müqaviləsi) şablonu hüquqşünas yoxlayandan və siz təsdiqləyəndən sonra görünür.',
      ru: 'Страница /trust для работодателей: где хранятся данные и какие меры защиты. Шаблон AVV (договор обработки данных) появится после проверки юристом и вашего подтверждения.',
      en: 'The /trust page for employers: where data is stored and which security measures apply. The AVV (data processing agreement) template appears only after a lawyer checked it and you approved it.',
      de: 'Die Seite /trust für Arbeitgeber: Speicherort der Daten und Schutzmaßnahmen. Die AVV-Vorlage erscheint erst nach anwaltlicher Prüfung und Ihrer Freigabe.',
    },
  },
  {
    id: '2026-11-ezb-wizard',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/official-forms',
    title: { az: 'EzB köməkçisi', ru: 'Мастер EzB', en: 'EzB wizard', de: 'EzB-Assistent' },
    body: {
      az: '"Erklärung zum Beschäftigungsverhältnis" üçün addım-addım köməkçi: işəgötürən və əməkdaş məlumatları doldurur. Nəticə formaya köçürmək üçün məlumat vərəqidir. Çatışmayan sahələr sarı ilə göstərilir.',
      ru: 'Пошаговый мастер для «Erklärung zum Beschäftigungsverhältnis»: данные заполняют работодатель и сотрудник. Результат — лист данных для переноса в форму. Недостающие поля выделены жёлтым.',
      en: 'A step-by-step wizard for the "Erklärung zum Beschäftigungsverhältnis": employer and staff fill in the data. The result is a data sheet to copy into the form. Missing fields are marked yellow.',
      de: 'Schritt-für-Schritt-Assistent für die „Erklärung zum Beschäftigungsverhältnis“: Arbeitgeber und Team füllen die Daten aus. Ergebnis ist ein Datenblatt zum Übertragen ins Formular. Fehlende Felder sind gelb markiert.',
    },
  },
  {
    id: '2026-11-saas-onboarding',
    date: '2026-11-16',
    roles: OWNER,
    link: '/admin/system/customers',
    title: { az: 'SaaS müştəriləri', ru: 'Клиенты SaaS', en: 'SaaS customers', de: 'SaaS-Kunden' },
    body: {
      az: 'Platformanı istəyən agentliklərin demo sorğuları bir boru xəttindədir. Yeni server üçün quraşdırma ustası brend, dillər və komandanı addım-addım qurur. Yalnız super admin görür.',
      ru: 'Заявки агентств на демо платформы собраны в одной воронке. Мастер настройки нового сервера пошагово задаёт бренд, языки и команду. Видит только суперадмин.',
      en: 'Demo requests from agencies that want the platform are in one pipeline. The setup wizard of a new server walks through brand, languages and team. Super admins only.',
      de: 'Demo-Anfragen von Agenturen, die die Plattform möchten, stehen in einer Pipeline. Der Einrichtungsassistent eines neuen Servers führt durch Marke, Sprachen und Team. Nur für Super-Admins.',
    },
  },
  {
    id: '2026-11-year-review',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/year-review',
    title: { az: 'İlin yekunu', ru: 'Итоги года', en: 'Year in review', de: 'Jahresrückblick' },
    body: {
      az: 'İl üzrə müraciətlər, peşələr, şəhərlər və ən sürətli iş bir səhifədə. Adminlər əməkdaşlar üzrə də baxa bilər. Komanda görüşləri üçün yaxşıdır.',
      ru: 'Заявки, профессии, города и самое быстрое дело за год на одной странице. Администраторы видят и по сотрудникам. Удобно для встреч команды.',
      en: 'Cases, professions, cities and the fastest case of the year on one page. Admins can also see it per staff member. Handy for team meetings.',
      de: 'Fälle, Berufe, Städte und der schnellste Fall des Jahres auf einer Seite. Admins sehen es auch pro Person. Praktisch für Team-Meetings.',
    },
  },
  {
    id: '2026-11-employer-checklist',
    date: '2026-11-16',
    roles: ALL,
    link: '/admin/employer-checklist-templates',
    title: { az: 'İşəgötürən üçün gəliş siyahısı', ru: 'Чек-лист приезда для работодателя', en: 'Employer arrival checklist', de: 'Ankunfts-Checkliste für Arbeitgeber' },
    body: {
      az: 'İşçi gəlməzdən əvvəl işəgötürənin edəcəkləri: mənzil, Anmeldung, ilk iş günü. Tarixlər gəliş gününə görə avtomatik hesablanır. Şablonları adminlər dəyişir.',
      ru: 'Что делает работодатель до приезда работника: жильё, Anmeldung, первый рабочий день. Сроки считаются от даты приезда автоматически. Шаблоны меняют администраторы.',
      en: 'What the employer does before the worker arrives: housing, Anmeldung, first working day. Due dates are calculated from the arrival date. Admins edit the templates.',
      de: 'Was der Arbeitgeber vor der Ankunft erledigt: Wohnung, Anmeldung, erster Arbeitstag. Fristen werden ab dem Ankunftsdatum berechnet. Vorlagen bearbeiten Admins.',
    },
  },
  {
    id: '2026-11-upload-links',
    date: '2026-11-15',
    roles: ALL,
    link: '/admin/cases',
    title: { az: 'Sənəd linki (girişsiz yükləmə)', ru: 'Ссылка для документов (без входа)', en: 'Upload link (no login)', de: 'Upload-Link (ohne Login)' },
    body: {
      az: 'Müraciət səhifəsində "Linklə sənəd istə" seçin və lazım olan sənədləri işarələyin. Müştəri girişsiz, yalnız həmin sənədləri yükləyir. Link müddətlidir və ləğv edilə bilər.',
      ru: 'На странице заявки выберите «Запросить документы по ссылке» и отметьте нужные документы. Клиент загружает только их, без входа. Ссылка ограничена по сроку и её можно отозвать.',
      en: 'On the case page choose "Request documents via link" and tick the documents you need. The client uploads only those, without logging in. The link expires and can be revoked.',
      de: 'Auf der Fallseite „Dokumente per Link anfordern“ wählen und die benötigten Dokumente ankreuzen. Der Kunde lädt nur diese hoch, ohne Login. Der Link läuft ab und kann widerrufen werden.',
    },
  },
  {
    id: '2026-11-data-quality',
    date: '2026-11-15',
    roles: ALL,
    link: '/admin/data-quality',
    title: { az: 'Məlumat keyfiyyəti', ru: 'Качество данных', en: 'Data quality', de: 'Datenqualität' },
    body: {
      az: 'Aktiv müraciətlərdə çatışmayan sahələr, sənədlər və bitən müddətlər bal ilə göstərilir. Ən zəif müraciətlər yuxarıdadır. Hər gün bir neçəsini düzəltmək kifayətdir.',
      ru: 'Для активных заявок показаны недостающие поля, документы и истекающие сроки — с баллом. Самые слабые заявки сверху. Достаточно исправлять несколько в день.',
      en: 'Active cases are scored for missing fields, documents and expiring dates. The weakest cases are on top. Fixing a few every day is enough.',
      de: 'Aktive Fälle werden nach fehlenden Feldern, Dokumenten und ablaufenden Fristen bewertet. Die schwächsten stehen oben. Täglich ein paar beheben genügt.',
    },
  },
  {
    id: '2026-11-rule-changes',
    date: '2026-11-15',
    roles: ALL,
    link: '/admin/rule-changes',
    title: { az: 'Qayda dəyişiklikləri', ru: 'Изменения правил', en: 'Rule changes', de: 'Regeländerungen' },
    body: {
      az: 'Qanun və ya səfirlik qaydası dəyişəndə qısa bildiriş yazın və viza növlərini seçin. Yalnız həmin müştərilər kabinetdə və e-poçtla xəbər alır. Rəsmi mənbə linkini əlavə edin.',
      ru: 'Когда меняется закон или правило посольства, напишите короткое уведомление и выберите типы виз. Сообщение получат только эти клиенты — в портале и по почте. Добавьте ссылку на официальный источник.',
      en: 'When a law or embassy rule changes, write a short notice and pick the visa types. Only those clients are told, in the portal and by e-mail. Add the official source link.',
      de: 'Ändert sich ein Gesetz oder eine Botschaftsregel, kurze Mitteilung schreiben und Visumarten wählen. Nur diese Kunden werden informiert, im Portal und per E-Mail. Offizielle Quelle verlinken.',
    },
  },
  {
    id: '2026-11-originals-qr',
    date: '2026-11-15',
    roles: ALL,
    link: '/admin/originals',
    title: { az: 'Orijinallar üçün QR qəbz', ru: 'QR-квитанция за оригиналы', en: 'QR receipt for originals', de: 'QR-Quittung für Originale' },
    body: {
      az: 'Müştəridən orijinal sənəd alanda qəbz çap edin. Üzərindəki QR kodla müştəri qəbzin həqiqiliyini yoxlayır. Qaytaranda qəbzi bağlayın.',
      ru: 'Принимая оригиналы от клиента, распечатайте квитанцию. По QR-коду клиент проверяет её подлинность. При возврате закройте квитанцию.',
      en: 'Print a receipt when you take original documents from a client. The client checks it with the QR code. Close the receipt when you hand them back.',
      de: 'Bei Annahme von Originaldokumenten eine Quittung drucken. Per QR-Code prüft der Kunde ihre Echtheit. Bei Rückgabe die Quittung schließen.',
    },
  },
  {
    id: '2026-11-tv-mode',
    date: '2026-11-15',
    roles: ADMINS,
    link: '/admin/tv-settings',
    title: { az: 'Ofis TV rejimi', ru: 'Режим офисного ТВ', en: 'Office TV mode', de: 'Büro-TV-Modus' },
    body: {
      az: 'Ofisdəki ekran üçün ayrıca token yaradın: o, yalnız ümumi rəqəmləri göstərir. Şəxsi məlumat görünmür. Token istənilən vaxt ləğv edilir.',
      ru: 'Создайте отдельный токен для экрана в офисе: он показывает только общие цифры. Личные данные не видны. Токен можно отозвать в любой момент.',
      en: 'Create a separate token for the office screen: it shows only totals. No personal data is visible. The token can be revoked at any time.',
      de: 'Für den Bildschirm im Büro ein eigenes Token anlegen: Es zeigt nur Summen. Keine personenbezogenen Daten. Das Token lässt sich jederzeit widerrufen.',
    },
  },
  {
    id: '2026-11-canned-replies',
    date: '2026-11-14',
    roles: ALL,
    link: '/admin/canned-replies',
    title: { az: 'Hazır cavablar ("/")', ru: 'Шаблоны ответов («/»)', en: 'Canned replies ("/")', de: 'Textbausteine („/“)' },
    body: {
      az: 'Mesaj yazarkən "/" basın və hazır cavabı seçin. Ad və müraciət nömrəsi kimi dəyişənlər avtomatik doldurulur. Öz cavablarınızı bu səhifədə yarada bilərsiniz.',
      ru: 'При написании сообщения нажмите «/» и выберите готовый ответ. Имя и номер заявки подставляются автоматически. Свои ответы можно создать на этой странице.',
      en: 'While writing a message press "/" and pick a reply. Variables like the name and case number are filled in. You can create your own replies on this page.',
      de: 'Beim Schreiben „/“ drücken und einen Baustein wählen. Platzhalter wie Name und Fallnummer werden ausgefüllt. Eigene Bausteine legen Sie auf dieser Seite an.',
    },
  },
  {
    id: '2026-11-client-360',
    date: '2026-11-14',
    roles: ALL,
    link: '/admin/cases',
    title: { az: 'Müştəri 360°', ru: 'Клиент 360°', en: 'Client 360°', de: 'Kunde 360°' },
    body: {
      az: 'Müraciət səhifəsindəki "360" linki müştərinin bütün tarixçəsini bir lentdə açır: mesajlar, sənədlər, qeydlər. Teqlər əlavə etmək olar. Yeni işə başlayanda əvvəlcə buna baxın.',
      ru: 'Ссылка «360» на странице заявки открывает всю историю клиента в одной ленте: сообщения, документы, заметки. Можно добавлять теги. Начиная работу с клиентом, загляните сюда.',
      en: 'The "360" link on the case page opens the client’s whole history in one timeline: messages, documents, notes. You can add tags. Look here first when you take over a client.',
      de: 'Der „360“-Link auf der Fallseite öffnet die ganze Kundenhistorie in einer Zeitleiste: Nachrichten, Dokumente, Notizen. Tags sind möglich. Bei Übernahme eines Kunden zuerst hier schauen.',
    },
  },
  {
    id: '2026-11-team-load',
    date: '2026-11-14',
    roles: ALL,
    link: '/admin/team-load',
    title: { az: 'Komanda yükü', ru: 'Загрузка команды', en: 'Team load', de: 'Teamauslastung' },
    body: {
      az: 'Kimdə neçə aktiv müraciət və gecikən iş olduğunu görün. Əməkdaş öz kartını, adminlər bütün komandanı görür. Yeni müraciəti kimə vermək üçün təklif də var.',
      ru: 'Видно, у кого сколько активных заявок и просроченных дел. Сотрудник видит свою карточку, администраторы — всю команду. Есть подсказка, кому передать новую заявку.',
      en: 'See who has how many active cases and overdue items. Staff see their own card, admins the whole team. There is also a suggestion for whom to give a new case.',
      de: 'Sehen, wer wie viele aktive Fälle und überfällige Aufgaben hat. Mitarbeitende sehen ihre Karte, Admins das ganze Team. Mit Vorschlag, wer einen neuen Fall übernehmen soll.',
    },
  },
];
