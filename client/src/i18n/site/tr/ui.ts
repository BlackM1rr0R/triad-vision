import type { uiCopy } from '../../ui';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof uiCopy)['en']> = {
  ui: {
    close: 'Kapat',
    cancel: 'İptal',
    confirm: 'Onayla',
    loading: 'Yükleniyor…',
    noData: 'Veri yok',
    moreActions: 'Diğer işlemler',
    breadcrumb: 'Gezinme yolu',
    required: 'zorunlu',
    typeToConfirm: 'Onaylamak için {{text}} yazın',
    sortAscending: 'Artan',
    sortDescending: 'Azalan',
    progress: 'İlerleme',
    uploadProgress: 'Yükleme ilerlemesi',
    empty: {
      filteredTitle: 'Filtrelere uyan sonuç yok',
      filteredText: 'Aramayı veya filtreleri değiştirin.',
      clearFilters: 'Filtreleri temizle',
    },
    phone: {
      invalid: 'Numarayı ülke koduyla yazın, örneğin +994 50 123 45 67.',
    },
    // Confirmation dialogs appear on logged-in screens only: strings fall back to English.
    confirmDlg: {},
  },
};

export default copy;
