/**
 * Strings of the shared design-system components (components/ui/**): `ui.*`.
 * Bundled with the core resources because modals, tables and menus appear on every surface.
 * All four languages must keep an identical key structure.
 */

const az = {
  ui: {
    close: 'Bağla',
    cancel: 'Ləğv et',
    confirm: 'Təsdiq et',
    loading: 'Yüklənir…',
    noData: 'Məlumat yoxdur',
    moreActions: 'Digər əməliyyatlar',
    breadcrumb: 'Naviqasiya yolu',
    required: 'məcburi',
    typeToConfirm: 'Təsdiq üçün {{text}} yazın',
    sortAscending: 'Artan sıra ilə',
    sortDescending: 'Azalan sıra ilə',
    progress: 'Gedişat',
    uploadProgress: 'Yükləmə gedişatı',
    pagination: 'Səhifələr',
    previous: 'Əvvəlki',
    next: 'Növbəti',
    page: 'Səhifə {{page}}',
    range: '{{from}}–{{to}} / {{total}}',
    showPassword: 'Parolu göstər',
    hidePassword: 'Parolu gizlət',
  },
};

type Shape = typeof az;

const de: Shape = {
  ui: {
    close: 'Schließen',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    loading: 'Wird geladen…',
    noData: 'Keine Daten',
    moreActions: 'Weitere Aktionen',
    breadcrumb: 'Brotkrumennavigation',
    required: 'Pflichtfeld',
    typeToConfirm: 'Zum Bestätigen {{text}} eingeben',
    sortAscending: 'Aufsteigend',
    sortDescending: 'Absteigend',
    progress: 'Fortschritt',
    uploadProgress: 'Upload-Fortschritt',
    pagination: 'Seitennavigation',
    previous: 'Zurück',
    next: 'Weiter',
    page: 'Seite {{page}}',
    range: '{{from}}–{{to}} von {{total}}',
    showPassword: 'Passwort anzeigen',
    hidePassword: 'Passwort verbergen',
  },
};

const en: Shape = {
  ui: {
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading…',
    noData: 'No data',
    moreActions: 'More actions',
    breadcrumb: 'Breadcrumb',
    required: 'required',
    typeToConfirm: 'Type {{text}} to confirm',
    sortAscending: 'Ascending',
    sortDescending: 'Descending',
    progress: 'Progress',
    uploadProgress: 'Upload progress',
    pagination: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {{page}}',
    range: '{{from}}–{{to}} of {{total}}',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
};

const ru: Shape = {
  ui: {
    close: 'Закрыть',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    loading: 'Загрузка…',
    noData: 'Нет данных',
    moreActions: 'Другие действия',
    breadcrumb: 'Навигационная цепочка',
    required: 'обязательно',
    typeToConfirm: 'Введите {{text}} для подтверждения',
    sortAscending: 'По возрастанию',
    sortDescending: 'По убыванию',
    progress: 'Прогресс',
    uploadProgress: 'Ход загрузки',
    pagination: 'Страницы',
    previous: 'Назад',
    next: 'Далее',
    page: 'Страница {{page}}',
    range: '{{from}}–{{to}} из {{total}}',
    showPassword: 'Показать пароль',
    hidePassword: 'Скрыть пароль',
  },
};

export const uiCopy = { az, de, en, ru } as const;
