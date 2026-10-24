import type { siteNavCopy } from '../../siteNav';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof siteNavCopy)['en']> = {
  siteNav: {
    workers: 'Çalışanlar için',
    employers: 'İşverenler için',
    tools: 'Araçlar',
    book: 'Danışmanlık randevusu al',
    bookShort: 'Danışmanlık',
    portal: 'Panelim',
    workersMenu: 'Çalışanlar için menü',
    employersMenu: 'İşverenler için menü',
    overview: {
      worker: { title: 'Çalışanlar için her şey', text: 'İş ilanları, vizeler, Ausbildung ve her adımda destek.' },
      employer: { title: 'İşverenler için her şey', text: 'Yurt dışından nitelikli personel: seçim, vize ve uyum tek ekipten.' },
    },
    w: {
      how: 'Nasıl işler',
      visas: 'Vizeler',
      ausbildung: 'Ausbildung',
      jobs: 'İş ilanları',
      tools: 'Hesaplayıcılar ve testler',
      stories: 'Başarı hikâyeleri',
      faq: 'Sorular ve cevaplar',
      events: 'Etkinlikler ve webinarlar',
      apply: 'Ücretsiz kayıt ol',
    },
    e: {
      services: 'Şirketlere yönelik hizmetler',
      how: 'İşe alım nasıl işler',
      cooperation: 'İş birliği',
      request: 'Aday talep et',
      register: 'Şirket kaydı',
      partners: 'Partnerlerimiz',
      stories: 'Şirketlerin görüşleri',
    },
    footer: {
      workers: 'Çalışanlar için',
      employers: 'İşverenler için',
      resources: 'Kaynaklar',
      company: 'Şirket',
      cookiePolicy: 'Çerez politikası',
      status: 'Başvuru durumu',
    },
    home: {
      question: 'Siz kimsiniz?',
      hint: 'Seçin — size yalnızca sizinle ilgili olanı gösterelim.',
      worker: { title: 'Çalışanım', text: 'Almanya’da iş, vize veya Ausbildung arıyorum' },
      employer: { title: 'İşverenim', text: 'Şirketim için yurt dışından personel arıyorum' },
      showingWorker: 'Çalışanlar için içerik',
      showingEmployer: 'İşverenler için içerik',
      switchToWorker: 'Çalışan olarak görüntüle',
      switchToEmployer: 'İşveren olarak görüntüle',
      showAll: 'Tümünü göster',
      fullPage: 'Sayfanın tamamına git',
    },
  },
};

export default copy;
