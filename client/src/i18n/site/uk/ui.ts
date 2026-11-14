import type { uiCopy } from '../../ui';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof uiCopy)['en']> = {
  ui: {
    close: 'Закрити',
    cancel: 'Скасувати',
    confirm: 'Підтвердити',
    loading: 'Завантаження…',
    noData: 'Немає даних',
    moreActions: 'Інші дії',
    breadcrumb: 'Навігаційний ланцюжок',
    required: 'обов’язково',
    typeToConfirm: 'Введіть {{text}}, щоб підтвердити',
    sortAscending: 'За зростанням',
    sortDescending: 'За спаданням',
    progress: 'Поступ',
    uploadProgress: 'Хід завантаження',
    empty: {
      filteredTitle: 'За фільтрами нічого не знайдено',
      filteredText: 'Змініть пошук або фільтри.',
      clearFilters: 'Скинути фільтри',
    },
    phone: {
      invalid: 'Вкажіть номер з кодом країни, наприклад +994 50 123 45 67.',
    },
    // Confirmation dialogs appear on logged-in screens only: strings fall back to English.
    confirmDlg: {},
  },
};

export default copy;
