// Admin → Sayt → Google axtarış nəticələri (/admin/search-performance): Search Console data, server lib/searchConsole.ts.
// Registered with registerCopy(pagesSearchConsole) by pages/admin/SearchPerformance.tsx.
const az = {
  gsc: {
    title: 'Google axtarış nəticələri',
    subtitle: 'Son 28 gün ({{from}} – {{to}}) · Google Search Console · {{site}}',
    refresh: 'Yenilə',
    cachedAt: 'Məlumat: {{time}} (6 saatda bir yenilənir)',
    clicks: 'Kliklər',
    impressions: 'Göstərilmələr',
    ctr: 'CTR',
    position: 'Orta mövqe',
    queries: 'Axtarış sorğuları',
    pages: 'Səhifələr',
    query: 'Sorğu',
    page: 'Səhifə',
    noRows: 'Bu dövr üçün məlumat yoxdur.',
    error: {
      AUTH_FAILED: 'Google girişi alınmadı: xidmət hesabının açarı səhvdir və ya ləğv edilib.',
      NO_ACCESS: 'Xidmət hesabının bu Search Console resursuna girişi yoxdur. Onun e-poçtunu Search Console-da istifadəçi kimi əlavə edin.',
      API_ERROR: 'Search Console məlumatı alınmadı. Bir azdan yenidən cəhd edin.',
    },
    setup: {
      title: 'Search Console qoşulmayıb',
      text: 'Bu səhifə Google Search Console-un son 28 gün üzrə məlumatını göstərir: ən çox klik gətirən sorğular və səhifələr, göstərilmələr, CTR və orta mövqe. Qoşmaq üçün:',
      steps: [
        'Google Cloud Console-da layihə yaradın (və ya mövcud olanı seçin), "Google Search Console API"-ni aktiv edin.',
        'IAM → Service Accounts → xidmət hesabı yaradın və JSON açarı yükləyin.',
        'Search Console → Ayarlar → İstifadəçilər və icazələr → İstifadəçi əlavə edin: xidmət hesabının e-poçtu, icazə "Məhdud" kifayətdir.',
        'Serverin .env faylına GSC_SERVICE_ACCOUNT_JSON (JSON açarın məzmunu, olduğu kimi və ya base64) və GSC_SITE_URL (məs. sc-domain:triad-vision.de) əlavə edin və API-ni yenidən başladın.',
      ],
      reason: {
        MISSING_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON təyin edilməyib.',
        INVALID_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON oxunmur: JSON açar faylının bütün məzmunu (client_email, private_key) lazımdır.',
        MISSING_SITE: 'GSC_SITE_URL təyin edilməyib (məs. sc-domain:triad-vision.de).',
      },
      account: 'Search Console-a əlavə ediləcək xidmət hesabı: {{email}}',
    },
  },
};

const de: typeof az = {
  gsc: {
    title: 'Google-Suchleistung',
    subtitle: 'Letzte 28 Tage ({{from}} – {{to}}) · Google Search Console · {{site}}',
    refresh: 'Aktualisieren',
    cachedAt: 'Stand: {{time}} (wird alle 6 Stunden aktualisiert)',
    clicks: 'Klicks',
    impressions: 'Impressionen',
    ctr: 'CTR',
    position: 'Ø Position',
    queries: 'Suchanfragen',
    pages: 'Seiten',
    query: 'Suchanfrage',
    page: 'Seite',
    noRows: 'Keine Daten für diesen Zeitraum.',
    error: {
      AUTH_FAILED: 'Anmeldung bei Google fehlgeschlagen: Der Schlüssel des Dienstkontos ist falsch oder widerrufen.',
      NO_ACCESS: 'Das Dienstkonto hat keinen Zugriff auf diese Search-Console-Property. Fügen Sie seine E-Mail in der Search Console als Nutzer hinzu.',
      API_ERROR: 'Search-Console-Daten konnten nicht geladen werden. Bitte gleich erneut versuchen.',
    },
    setup: {
      title: 'Search Console ist nicht verbunden',
      text: 'Diese Seite zeigt die Daten der Google Search Console der letzten 28 Tage: Suchanfragen und Seiten mit den meisten Klicks, Impressionen, CTR und durchschnittliche Position. So verbinden Sie sie:',
      steps: [
        'In der Google Cloud Console ein Projekt anlegen (oder wählen) und die „Google Search Console API“ aktivieren.',
        'IAM → Dienstkonten → Dienstkonto anlegen und einen JSON-Schlüssel herunterladen.',
        'Search Console → Einstellungen → Nutzer und Berechtigungen → Nutzer hinzufügen: die E-Mail des Dienstkontos, Berechtigung „Eingeschränkt“ genügt.',
        'In der .env des Servers GSC_SERVICE_ACCOUNT_JSON (Inhalt der JSON-Schlüsseldatei, direkt oder base64) und GSC_SITE_URL (z. B. sc-domain:triad-vision.de) setzen und die API neu starten.',
      ],
      reason: {
        MISSING_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON ist nicht gesetzt.',
        INVALID_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON ist nicht lesbar: Es wird der ganze Inhalt der JSON-Schlüsseldatei benötigt (client_email, private_key).',
        MISSING_SITE: 'GSC_SITE_URL ist nicht gesetzt (z. B. sc-domain:triad-vision.de).',
      },
      account: 'In der Search Console hinzuzufügendes Dienstkonto: {{email}}',
    },
  },
};

const en: typeof az = {
  gsc: {
    title: 'Google search performance',
    subtitle: 'Last 28 days ({{from}} – {{to}}) · Google Search Console · {{site}}',
    refresh: 'Refresh',
    cachedAt: 'Data as of {{time}} (refreshed every 6 hours)',
    clicks: 'Clicks',
    impressions: 'Impressions',
    ctr: 'CTR',
    position: 'Avg. position',
    queries: 'Search queries',
    pages: 'Pages',
    query: 'Query',
    page: 'Page',
    noRows: 'No data for this period.',
    error: {
      AUTH_FAILED: 'Google sign-in failed: the service account key is wrong or revoked.',
      NO_ACCESS: 'The service account has no access to this Search Console property. Add its e-mail as a user in Search Console.',
      API_ERROR: 'Could not load Search Console data. Please try again shortly.',
    },
    setup: {
      title: 'Search Console is not connected',
      text: 'This page shows Google Search Console data for the last 28 days: the queries and pages with the most clicks, impressions, CTR and average position. To connect it:',
      steps: [
        'In the Google Cloud Console, create (or pick) a project and enable the "Google Search Console API".',
        'IAM → Service accounts → create a service account and download a JSON key.',
        'Search Console → Settings → Users and permissions → Add user: the service account e-mail, permission "Restricted" is enough.',
        'Set GSC_SERVICE_ACCOUNT_JSON (the JSON key file content, as is or base64) and GSC_SITE_URL (e.g. sc-domain:triad-vision.de) in the server .env and restart the API.',
      ],
      reason: {
        MISSING_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON is not set.',
        INVALID_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON cannot be read: the whole content of the JSON key file is needed (client_email, private_key).',
        MISSING_SITE: 'GSC_SITE_URL is not set (e.g. sc-domain:triad-vision.de).',
      },
      account: 'Service account to add in Search Console: {{email}}',
    },
  },
};

const ru: typeof az = {
  gsc: {
    title: 'Эффективность в Google',
    subtitle: 'Последние 28 дней ({{from}} – {{to}}) · Google Search Console · {{site}}',
    refresh: 'Обновить',
    cachedAt: 'Данные на {{time}} (обновляются каждые 6 часов)',
    clicks: 'Клики',
    impressions: 'Показы',
    ctr: 'CTR',
    position: 'Средняя позиция',
    queries: 'Поисковые запросы',
    pages: 'Страницы',
    query: 'Запрос',
    page: 'Страница',
    noRows: 'Нет данных за этот период.',
    error: {
      AUTH_FAILED: 'Не удалось войти в Google: ключ сервисного аккаунта неверный или отозван.',
      NO_ACCESS: 'У сервисного аккаунта нет доступа к этому ресурсу Search Console. Добавьте его e-mail как пользователя в Search Console.',
      API_ERROR: 'Не удалось загрузить данные Search Console. Попробуйте чуть позже.',
    },
    setup: {
      title: 'Search Console не подключена',
      text: 'Эта страница показывает данные Google Search Console за последние 28 дней: запросы и страницы с наибольшим числом кликов, показы, CTR и среднюю позицию. Как подключить:',
      steps: [
        'В Google Cloud Console создайте (или выберите) проект и включите «Google Search Console API».',
        'IAM → Сервисные аккаунты → создайте сервисный аккаунт и скачайте JSON-ключ.',
        'Search Console → Настройки → Пользователи и разрешения → Добавить пользователя: e-mail сервисного аккаунта, разрешения «Ограниченный доступ» достаточно.',
        'Задайте в .env сервера GSC_SERVICE_ACCOUNT_JSON (содержимое JSON-ключа, как есть или в base64) и GSC_SITE_URL (например, sc-domain:triad-vision.de) и перезапустите API.',
      ],
      reason: {
        MISSING_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON не задан.',
        INVALID_CREDENTIALS: 'GSC_SERVICE_ACCOUNT_JSON не читается: нужно всё содержимое файла JSON-ключа (client_email, private_key).',
        MISSING_SITE: 'GSC_SITE_URL не задан (например, sc-domain:triad-vision.de).',
      },
      account: 'Сервисный аккаунт, который нужно добавить в Search Console: {{email}}',
    },
  },
};

export const pagesSearchConsole = { az, de, en, ru };
