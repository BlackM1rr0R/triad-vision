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
    loadFailed: 'Veriler yüklenemedi.',
    retry: 'Tekrar dene',
    pagination: 'Sayfalama',
    previous: 'Önceki',
    next: 'Sonraki',
    page: 'Sayfa {{page}}',
    range: '{{from}}–{{to}} / {{total}}',
    showPassword: 'Şifreyi göster',
    hidePassword: 'Şifreyi gizle',
    // Confirmation dialogs (logged-in screens, including the client portal).
    confirmDlg: {
      title: 'Emin misiniz?',
      revokeLinkNamed: '“{{name}}” bağlantısı iptal edilsin mi? Bağlantıya sahip herkes erişimini kaybeder.',
      cancelRequest: 'Bu talep iptal edilsin mi? Müşteri artık yanıt veremez.',
      deactivateNamed: '“{{name}}” devre dışı bırakılsın mı? Daha sonra yeniden etkinleştirebilirsiniz.',
      deactivate: 'Devre dışı bırak',
      deleteTitle: '“{{name}}” silinsin mi?',
      unsavedTitle: 'Kaydedilmemiş değişiklikler',
      deleteNamed: '“{{name}}” silinsin mi? Bu işlem geri alınamaz.',
      deleteItem: 'Bu öğe silinsin mi? Bu işlem geri alınamaz.',
      removeNamed: '“{{name}}” kaldırılsın mı?',
      resetNamed: '“{{name}}” sıfırlansın mı? Değişiklikleriniz kaybolur.',
      delete: 'Sil',
      remove: 'Kaldır',
      archive: 'Arşivle',
      leave: 'Ayrıl',
      discard: 'Vazgeç',
      reset: 'Sıfırla',
      revoke: 'İptal et',
      overwrite: 'Üzerine yaz',
      apply: 'Uygula',
      yesCancel: 'Evet, iptal et',
      undo: 'Geri al',
    },
  },
};

export default copy;
