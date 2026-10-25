import type { pagesA11yStatement } from '../../pagesA11yStatement';
import type { SiteCopy } from '../types';

const copy: SiteCopy<(typeof pagesA11yStatement)['en']> = {
  a11yStatement: {
    title: 'Erişilebilirlik beyanı',
    lead: '{{brand}} web sitesini ({{brandDomain}}) ve müşteri portalını herkesin – görme, işitme, hareket veya bilişsel engeli olan kişiler dahil – kullanabileceği şekilde geliştiriyoruz.',
    scopeTitle: 'Kapsam',
    scopeText: 'Bu beyan, herkese açık web sitesini (içerik sayfaları, vize ve iş ilanı katalogları, hesaplayıcılar, kayıt, giriş ve iletişim formları) ve müşteri portalını kapsar. Çalışanlara yönelik dahili çalışma alanı (yönetim paneli, çalışma alanı) bu beyanın kapsamı dışındadır, ancak aynı bileşenlerle oluşturulmuştur.',
    statusTitle: 'Uyumluluk durumu',
    statusText: 'Web sitesi WCAG 2.2 (Web Content Accessibility Guidelines) AA düzeyi ve Avrupa standardı EN 301 549 ile kısmen uyumludur. Aşağıda belirtilen kısıtlamalar henüz tamamen giderilmemiştir.',
    measuresTitle: 'Halihazırda yapılanlar',
    measures: [
      'Klavye ile kullanım: menüler, formlar ve iletişim kutuları Tab, Enter ve Esc ile kullanılabilir; bir iletişim kutusu açıkken odak onun içinde kalır ve kapatıldığında önceki yerine döner. Her sayfanın başında “İçeriğe geç” bağlantısı bulunur.',
      'Klavye odağı her yerde aynı, açıkça görünen bir çerçeveyle gösterilir.',
      'Metin renklerinin kontrast oranı en az 4,5:1’dir; ayrıca karanlık mod ve yüksek kontrast modu da vardır.',
      'Erişilebilirlik paneli (Alt+A): %150’ye kadar metin boyutu, satır ve harf aralığı, kolay okunan yazı tipi, vurgulanmış bağlantılar, okuma cetveli, büyük imleç ve sesli okuma.',
      'Animasyonlar panelden durdurulabilir; işletim sistemindeki “hareketi azalt” ayarı otomatik olarak dikkate alınır.',
      'Form alanlarının görünür etiketleri vardır, hata mesajları ilgili alana bağlıdır ve ekran okuyuculara duyurulur; bildirimler (toast) canlı bölge üzerinden duyurulur.',
      'Sayfalar üst bilgi, gezinme, ana içerik ve alt bilgi bölgelerine ayrılmıştır; bilgi içeren görsellerin alternatif metni vardır, dekoratif görseller ekran okuyuculardan gizlenmiştir.',
      'Web sitesi 4 dilde (Azerbaycan Türkçesi, Almanca, İngilizce, Rusça) kullanılabilir; dil değiştirildiğinde sayfanın dil özniteliği de güncellenir.',
      'Her yeni sürüm yayından önce WCAG kurallarına göre otomatik olarak (axe-core) denetlenir; ciddi hatalar bulunursa yayınlanmaz.',
    ],
    limitsTitle: 'Bilinen kısıtlamalar',
    limits: [
      'Çoğu tarayıcıda Azerbaycan Türkçesi için konuşma sentezi yoktur; sesli okuma Türkçe veya İngilizce bir ses kullanır.',
      'Elektronik imzada imza fare, parmak veya kalemle çizilir. Bunu yapamıyorsanız bize yazın; imzayı başka bir yolla ayarlarız.',
      'Etkileşimli harita (/map) klavye veya ekran okuyucuyla tam olarak kullanılamayabilir. Aynı bilgileri talep üzerine size metin olarak göndeririz.',
      'Üçüncü taraflara ait bazı belgeler (PDF) tam olarak erişilebilir olmayabilir – talep üzerine metin sürümünü göndeririz.',
      'Bazı dekoratif efektler (arka plan görselleri, küre, kaydırma animasyonları) tamamen görseldir; erişilebilirlik panelinden kapatılabilir.',
      'Otomatik testler her sorunu bulamaz. Ekran okuyucularla sistematik inceleme hâlâ sürmektedir.',
    ],
    preparedTitle: 'Beyanın hazırlanması',
    preparedText: 'Bu beyan {{date}} tarihinde hazırlanmıştır. Bir öz değerlendirmeye dayanır: otomatik testler (axe-core, Lighthouse) ve klavye ile kullanımın manuel olarak incelenmesi.',
    date: '23.10.2026',
    contactTitle: 'Geri bildirim ve iletişim',
    contactText: 'Web sitesinin bir bölümünü kullanamıyorsanız veya bir engel fark ettiyseniz lütfen bize yazın. En kısa sürede yanıt verir ve bilgiyi size uygun bir formatta sunarız.',
    emailLabel: 'E-posta',
    contactCta: 'İletişim formu',
    enforcementTitle: 'Denetim makamı',
    enforcementText: 'Yanıtımızdan memnun kalmazsanız, Almanya’daki Erişilebilirliği Güçlendirme Yasası (BFSG) kapsamında yetkili piyasa gözetim makamına başvurabilirsiniz: Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen (MLBF), Magdeburg.',
    openWidget: 'Erişilebilirlik panelini aç',
  },
};

export default copy;
