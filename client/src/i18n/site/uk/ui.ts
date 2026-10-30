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
    // Confirmation dialogs appear on logged-in screens only: strings fall back to English.
    confirmDlg: {},
  },
};

export default copy;
