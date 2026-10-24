import type { details } from '../../details';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof details)['en']> = {
  svc: {
    eyebrow: 'Hizmetlerimiz',
    title: 'Personel aramadan varışa kadar tüm süreç',
    subtitle: 'Neleri kapsadığını ve nasıl işlediğini görmek için bir hizmete tıklayın.',
    included: 'Neler dahil',
    forCompany: 'Şirketler için',
    forCandidate: 'Adaylar için',
    forAll: 'Şirketler ve adaylar için',
    all: 'Tümü',
    related: 'Diğer hizmetler',
    getOffer: 'Ücretsiz danışmanlık',
    askTitle: 'Bu hizmetle ilgili sorunuz mu var?',
    askText: 'Formu doldurun, danışmanımız 24 saat içinde sizinle iletişime geçsin.',
    howItWorks: 'Nasıl işler',
  },
  detail: {
    open: 'Ayrıntılar',
    step: 'Adım',
    process: [
      'İlk görüşmede mesleğinizi, deneyiminizi, dil seviyenizi ve hedeflerinizi öğreniyoruz. Şirketler için pozisyon profilini birlikte hazırlıyoruz. Bu aşamada hangi vize türünün uygun olduğu belirlenir.',
      'Hesabınızda size özel bir belge listesi oluşturulur. Belgeleri çevrimiçi yüklersiniz; her birini kontrol eder, gerekirse düzeltme isteriz. Tercüme ve noter onayında da yardımcı oluyoruz.',
      'Uygun bir işverenle görüşme ayarlıyoruz. Anlaşma sağlandığında sözleşme hesabınıza gönderilir ve siz onu ekranda elektronik olarak imzalarsınız. İmzalı PDF anında iki tarafa da ulaşır.',
      'Konsolosluk için belge dosyası hazırlanır, Federal İş Ajansı’nın (Bundesagentur für Arbeit) onayı alınır ve konsolosluk randevusu ayarlanır. Sizi mülakata hazırlıyor, karar çıkana kadar her değişiklikten haberdar ediyoruz.',
      'Vize onaylandıktan sonra uçuşu planlıyor, sizi havalimanında karşılıyor ve konaklama yerinize yerleştiriyoruz. Adres kaydı (Anmeldung), banka hesabı ve sigorta konusunda yardımcı oluyoruz.',
      'İlk iş gününüzden itibaren hem sizin hem de işvereninizin sabit bir irtibat kişisi olur. İlk aylarda düzenli olarak iletişimde kalıyor, soruları hızla çözüyoruz.',
    ],
    why: [
      'Yalnızca resmî vize türleriyle çalışıyoruz: §18a, §18b, §19c, §16a, §16d ve mevsimlik çalışma. Her sözleşme Alman iş hukukuna uygunluk açısından kontrol edilir; gizli ücret yoktur.',
      'Hesabınızda belgelerinizi yükler, sözleşmeyi imzalar, durumu takip eder ve danışmanınızla yazışırsınız. Her adımda hem hesabınıza hem de e-postanıza bildirim gelir.',
      'Her aday ve şirkete ayrı bir sorumlu danışman atanır; böylece kime başvuracağınızı her zaman bilirsiniz.',
      'Belgeler eksiksiz olduğunda konsoloslukta işlem genellikle 3–8 hafta sürer. Hızlandırılmış nitelikli işgücü prosedürü (§81a) ile bu süre daha da kısaltılabilir.',
      'Ekibimiz Azerbaycan Türkçesi, Almanca, İngilizce ve Rusça konuşur. Site, hesap ve bildirimler de bu 4 dilde mevcuttur.',
      'Vizeden sonra da yanınızdayız: havalimanında karşılama, konaklama, kayıt, banka, sigorta ve işe uyum.',
    ],
  },
  authAside: {
    title: 'Tüm başvurunuz tek bir yerde',
    text: 'Belgelerden vize kararına kadar her adımı buradan yönetin — ofise gitmeden, sıra beklemeden.',
    features: ['Belgeleri telefonunuzla fotoğraflayıp yükleyin', 'Sözleşmeyi ekranda elektronik olarak imzalayın', 'Her adımda e-posta ve bildirim alın', 'Verileriniz GDPR (DSGVO) kapsamında korunur'],
    help: 'Yardım mı lazım?',
    helpText: 'Ekibimiz Pzt–Cum 09:00–18:00 arası yanıt verir.',
    secure: 'Güvenli bağlantı · GDPR',
  },
  faqPage: {
    searchPh: 'Soru arayın… (ör. dil, süre, imza)',
    noResults: 'Sonuç bulunamadı. Başka bir kelime deneyin veya bize yazın.',
    stillTitle: 'Size hangi vizenin uygun olduğundan emin değil misiniz?',
    stillText: '2 dakikalık testi yapın ya da kayıt olup danışmanınıza doğrudan yazın.',
    quiz: 'Vize testine başla',
    register: 'Kayıt ol',
    contact: 'Bize yazın',
  },
  article: { related: 'Diğer makaleler', share: 'Paylaş', copy: 'Bağlantıyı kopyala', copied: 'Bağlantı kopyalandı' },
  cookie: {
    text: 'Yalnızca zorunlu çerezleri kullanıyoruz (oturum ve dil seçimi). İzleme veya reklam çerezleri kullanılmaz.',
    accept: 'Anladım',
  },
  topbar: { hours: 'Pzt–Cum 09:00–18:00' },
};

export default copy;
