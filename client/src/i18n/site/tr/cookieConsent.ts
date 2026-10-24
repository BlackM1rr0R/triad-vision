import type { cookieConsentCopy } from '../../cookieConsent';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof cookieConsentCopy)['en']> = {
  legalDocs: {
    footer: { terms: 'Koşullar (AGB)', cookies: 'Çerez ayarları' },
    cookie: {
      title: 'Çerezler ve gizlilik',
      text: 'Zorunlu çerezleri (giriş, dil) her zaman kullanırız. Onay vermeniz halinde web sitesini iyileştirmek için istatistik çerezlerini ve reklamlarımızın başarısını ölçmek için pazarlama çerezlerini de kullanırız. Seçiminizi istediğiniz zaman değiştirebilirsiniz.',
      acceptAll: 'Tümünü kabul et',
      necessaryOnly: 'Yalnızca zorunlu',
      settings: 'Ayarlar',
      save: 'Seçimi kaydet',
      back: 'Geri',
      settingsTitle: 'Çerez ayarları',
      policy: 'Çerez politikası',
      privacy: 'Gizlilik politikası',
      always: 'Her zaman açık',
      saved: 'Seçiminiz kaydedildi',
      categories: {
        necessary: { title: 'Zorunlu', text: 'Giriş oturumu, dil, görünüm ve bu seçim. Bunlar olmadan web sitesi çalışmaz.' },
        analytics: { title: 'İstatistik', text: 'Sayfaların nasıl kullanıldığını anonim olarak ölçmemize ve web sitesini iyileştirmemize yardımcı olur.' },
        marketing: { title: 'Pazarlama', text: 'Reklam kampanyalarımızın başarısını ölçer.' },
      },
    },
    register: {
      termsBefore: '',
      termsLink: 'Genel İşlem Koşulları’nı (AGB)',
      termsAfter: ' okudum ve kabul ediyorum.',
      termsError: 'Devam etmek için lütfen koşulları (AGB) kabul edin.',
    },
  },
};

export default copy;
