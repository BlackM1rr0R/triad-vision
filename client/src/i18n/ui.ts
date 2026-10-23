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
  },
};

export const uiCopy = { az, de, en, ru } as const;
