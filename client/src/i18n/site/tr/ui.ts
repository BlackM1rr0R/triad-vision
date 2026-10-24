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
  },
};

export default copy;
