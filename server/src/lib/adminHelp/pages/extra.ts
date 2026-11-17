import type { PageHelpEntry } from '../types.js';

/** Admin page help: pages added after the first round (what's new, new staff checklist, owner setup checklist). */
export const PAGES_EXTRA: PageHelpEntry[] = [
  {
    route: 'whats-new',
    text: {
      az: {
        title: 'Yeniliklər',
        purpose: 'Son həftələrdə sistemə nə əlavə olunduğunu rolunuza uyğun göstərir. Hər yeniliyin yanında aid olduğu səhifəyə link var.',
        steps: [
          '«Oxunmamış» filtri ilə hələ baxmadığınız yenilikləri açın.',
          'Maraqlı olanın yanındakı «Aç» düyməsi ilə həmin səhifəyə keçin.',
          'Bitirəndə «Hamısını oxunmuş et» basın — yuxarı paneldəki nişan sıfırlanır.',
        ],
        tips: ['Administrator «Yenilikləri idarə et» bölməsində koddakı yenilikləri gizlədə və özünün yenisini əlavə edə bilər.', 'Azərbaycanca mətn məcburidir; digər dillər boş qalsa azərbaycanca göstərilir.'],
      },
      ru: {
        title: 'Что нового',
        purpose: 'Показывает, что добавилось в систему за последние недели, с учётом вашей роли. У каждой новости есть ссылка на страницу.',
        steps: [
          'Фильтром «Непрочитанные» откройте то, что вы ещё не видели.',
          'Кнопкой «Открыть» перейдите на нужную страницу.',
          'В конце нажмите «Отметить всё прочитанным» — значок в шапке обнулится.',
        ],
        tips: ['Администратор в блоке «Управление новостями» может скрыть новости из кода и добавить свои.', 'Азербайджанский текст обязателен; пустые языки показываются на азербайджанском.'],
      },
      en: {
        title: 'What’s new',
        purpose: 'Shows what was added to the system in the last weeks, filtered for your role. Every entry links to its page.',
        steps: [
          'Use the “Unread” filter to see what you have not looked at yet.',
          'Press “Open” next to an entry to go to that page.',
          'When done, press “Mark all as read” — the badge in the header resets.',
        ],
        tips: ['Admins can hide built-in entries and add their own under “Manage entries”.', 'The Azerbaijani text is required; empty languages fall back to it.'],
      },
      de: {
        title: 'Neuigkeiten',
        purpose: 'Zeigt, was in den letzten Wochen ins System kam — passend zu Ihrer Rolle. Jeder Eintrag verlinkt die zugehörige Seite.',
        steps: [
          'Mit dem Filter „Ungelesen“ sehen Sie, was Sie noch nicht angeschaut haben.',
          'Mit „Öffnen“ springen Sie zur betreffenden Seite.',
          'Zum Schluss „Alle als gelesen markieren“ — das Abzeichen in der Kopfzeile verschwindet.',
        ],
        tips: ['Admins können unter „Einträge verwalten“ mitgelieferte Einträge ausblenden und eigene anlegen.', 'Der aserbaidschanische Text ist Pflicht; leere Sprachen zeigen ihn an.'],
      },
    },
  },
  {
    route: 'training-checklist',
    text: {
      az: {
        title: 'Yeni əməkdaş üçün tapşırıqlar',
        purpose: 'Yeni əməkdaşın sistemi real işlə öyrənməsi üçün 10 tapşırıq. Çoxunu sistem özü görür və işarələyir.',
        steps: [
          'Siyahıdan növbəti tapşırığı seçin və «Ora keç» ilə lazımi səhifəni açın.',
          'Tapşırığı real sistemdə edin — sistem görəndə «Sistem gördü» yazılır.',
          'Sistem görmürsə, «Etdim» düyməsi ilə əl ilə işarələyin (səhvən olsa «Geri al»).',
        ],
        tips: ['Administrator aşağıda «Komandanın irəliləyişi» cədvəlində kimin hansı tapşırığının qaldığını görür.', 'Hər səhifənin «?» düyməsi həmin səhifənin nə etdiyini qısa izah edir.'],
      },
      ru: {
        title: 'Задания для нового сотрудника',
        purpose: '10 заданий, чтобы новый сотрудник освоил систему на реальной работе. Большинство система отмечает сама.',
        steps: [
          'Выберите следующее задание и кнопкой «Перейти» откройте нужную страницу.',
          'Выполните задание в системе — когда она это заметит, появится «Система заметила».',
          'Если система не заметила, отметьте кнопкой «Сделано» (по ошибке — «Отменить»).',
        ],
        tips: ['Администратор видит ниже таблицу «Прогресс команды»: у кого какие задания остались.', 'Кнопка «?» на каждой странице коротко объясняет, что она делает.'],
      },
      en: {
        title: 'New staff checklist',
        purpose: 'Ten tasks that teach a new staff member the system through real work. Most are detected automatically.',
        steps: [
          'Pick the next task and press “Go there” to open the right page.',
          'Do the task in the real system — once detected it shows “Detected by the system”.',
          'If it is not detected, tick it with “I did it” (“Undo” if by mistake).',
        ],
        tips: ['Admins see the “Team progress” table below: who still has which tasks open.', 'The “?” on every page explains briefly what that page does.'],
      },
      de: {
        title: 'Checkliste für neue Mitarbeitende',
        purpose: 'Zehn Aufgaben, mit denen neue Mitarbeitende das System bei echter Arbeit kennenlernen. Die meisten erkennt das System selbst.',
        steps: [
          'Nächste Aufgabe wählen und mit „Dorthin“ die passende Seite öffnen.',
          'Die Aufgabe im echten System erledigen — erkannte Aufgaben werden automatisch abgehakt.',
          'Wird sie nicht erkannt, mit „Erledigt“ von Hand abhaken („Rückgängig“ bei Versehen).',
        ],
        tips: ['Admins sehen unten die Tabelle „Teamfortschritt“: wer welche Aufgaben noch offen hat.', 'Das „?“ auf jeder Seite erklärt kurz, wofür sie da ist.'],
      },
    },
  },
  {
    route: 'setup-checklist',
    text: {
      az: {
        title: 'Quraşdırma siyahısı',
        purpose: 'Yeni funksiyaların tam işləməsi üçün sahibkarın/administratorun etməli olduğu qalan addımlar. Sistem bacardığını özü yoxlayır.',
        steps: [
          'Faizə və «Gözləyir» bəndlərinə baxın; «Ora keç» ilə aid səhifəni açıb addımı edin.',
          'Avtomatik yoxlanmayan bəndi «Hazırdır» və ya «Lazım deyil» kimi işarələyin, istəsəniz qeyd yazın.',
          'Dəyişiklikdən sonra «Yenidən yoxla» basın — avtomatik bəndlər yenilənir.',
        ],
        tips: ['Yalnız Administrator və Super admin üçündür.', '«İstəyə bağlı» bəndlər faizə mane olmur, amma faydalıdır.'],
      },
      ru: {
        title: 'Чек-лист настройки',
        purpose: 'Оставшиеся шаги владельца/администратора, чтобы новые функции работали полностью. Что может, система проверяет сама.',
        steps: [
          'Посмотрите процент и пункты «Ожидает»; кнопкой «Перейти» откройте страницу и выполните шаг.',
          'Пункт без автопроверки отметьте «Готово» или «Не нужно», при желании с заметкой.',
          'После изменений нажмите «Проверить снова» — автопункты обновятся.',
        ],
        tips: ['Только для администратора и супер-админа.', 'Пункты «Необязательно» не мешают проценту, но полезны.'],
      },
      en: {
        title: 'Setup checklist',
        purpose: 'The remaining steps the owner / admin must take so new features work fully. The system checks what it can by itself.',
        steps: [
          'Check the percentage and the “Open” items; press “Go there” to open the page and do the step.',
          'Mark items without an automatic check as “Done” or “Not needed”, optionally with a note.',
          'After changes press “Check again” — automatic items refresh.',
        ],
        tips: ['Admins and super admins only.', '“Optional” items do not block the percentage but are worth doing.'],
      },
      de: {
        title: 'Einrichtungs-Checkliste',
        purpose: 'Die restlichen Schritte für Inhaber / Admin, damit neue Funktionen voll arbeiten. Was es kann, prüft das System selbst.',
        steps: [
          'Prozentwert und offene Punkte ansehen; mit „Dorthin“ die Seite öffnen und den Schritt erledigen.',
          'Punkte ohne automatische Prüfung als „Erledigt“ oder „Nicht nötig“ markieren, optional mit Notiz.',
          'Nach Änderungen „Erneut prüfen“ — automatische Punkte werden aktualisiert.',
        ],
        tips: ['Nur für Admins und Super-Admins.', '„Optional“-Punkte bremsen den Prozentwert nicht, lohnen sich aber.'],
      },
    },
  },
];
