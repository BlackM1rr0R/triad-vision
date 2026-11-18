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
    loadFailed: 'Не вдалося завантажити дані.',
    retry: 'Спробувати ще раз',
    pagination: 'Сторінки',
    previous: 'Попередня',
    next: 'Наступна',
    page: 'Сторінка {{page}}',
    range: '{{from}}–{{to}} з {{total}}',
    showPassword: 'Показати пароль',
    hidePassword: 'Приховати пароль',
    // Confirmation dialogs (logged-in screens, including the client portal).
    confirmDlg: {
      title: 'Ви впевнені?',
      revokeLinkNamed: 'Відкликати посилання для «{{name}}»? Усі, хто його має, втратять доступ.',
      cancelRequest: 'Скасувати цей запит? Клієнт більше не зможе на нього відповісти.',
      deactivateNamed: 'Деактивувати «{{name}}»? Пізніше можна активувати знову.',
      deactivate: 'Деактивувати',
      deleteTitle: 'Видалити «{{name}}»?',
      unsavedTitle: 'Незбережені зміни',
      deleteNamed: 'Видалити «{{name}}»? Цю дію не можна скасувати.',
      deleteItem: 'Видалити цей елемент? Цю дію не можна скасувати.',
      removeNamed: 'Прибрати «{{name}}»?',
      resetNamed: 'Скинути «{{name}}»? Ваші зміни буде втрачено.',
      delete: 'Видалити',
      remove: 'Прибрати',
      archive: 'Архівувати',
      leave: 'Вийти',
      discard: 'Відхилити зміни',
      reset: 'Скинути',
      revoke: 'Відкликати',
      overwrite: 'Перезаписати',
      apply: 'Застосувати',
      yesCancel: 'Так, скасувати',
      undo: 'Скасувати дію',
    },
  },
};

export default copy;
