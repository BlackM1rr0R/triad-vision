/** Page help texts in Turkish: the public pages only (portal pages fall back to English, see ../registry.ts). */
import type { PublicHelpTexts } from '../registry';

export const HELP_TR: PublicHelpTexts = {
  // start + hubs
  '/start': {
    what: "Bu sayfa size 3 soru sorar: kimsiniz, mesleğiniz ne ve Almancanız hangi seviyede.",
    why: "Cevaplarınıza göre size özel bir plan hazırlanır.",
    todo: "Üç soruyu cevaplayın ve planınızı açın.",
  },
  '/start/plan': {
    what: "Bu sayfa size özel planınızdır: adım adım ne yapmanız gerektiği.",
    why: "Hangi adımla başlamanız gerektiğini hemen görürsünüz.",
    todo: "Adımları sırayla okuyun, araçları ve ilanları açın, sonra kayıt olun.",
  },
  '/tools': {
    what: "Bu sayfada tüm ücretsiz araçlar bir aradadır.",
    why: "İhtiyacınız olan hesaplayıcıyı, testi veya oyunu hızlıca bulursunuz.",
    todo: "Arama kutusuna bir kelime yazın veya bir bölüm seçin, sonra aracı açın.",
  },
  '/for/:profession': {
    what: "Bu sayfa tek bir meslek içindir: araçlar, Almanca kelimeler, deneme sınavı ve ilanlar.",
    why: "Mesleğinizle ilgili her şeyi tek yerde görürsünüz.",
    todo: "Kelimeleri öğrenin, deneme sınavını yapın ve ilanlara bakın.",
  },
  // am I eligible?
  '/path-finder': {
    what: "Bu sayfa 5 soruyla Almanya'ya size uygun yolu gösterir.",
    why: "Size uygun vizeyi, tahmini maaşı ve süreyi öğrenirsiniz.",
    todo: "Soruları cevaplayın ve sonuca bakın.",
  },
  '/uygunluq-testi': {
    what: "Bu kısa test size uygun yolu bulur: iş, Ausbildung, Fırsat Kartı veya aile.",
    why: "Nereden başlayacağınızı bilmediğinizde yardımcı olur.",
    todo: "7 soruyu cevaplayın ve sonucu okuyun.",
  },
  '/eligibility': {
    what: "Bu sayfa bir vize testidir.",
    why: "Hangi vize türünün size uygun olduğunu öğrenirsiniz.",
    todo: "Soruları cevaplayın ve öneriye bakın.",
  },
  '/compare-visas': {
    what: "Bu sayfa farklı vize yollarını tek bir tabloda karşılaştırır.",
    why: "Yolların farkını ve hangisinin size yakın olduğunu görürsünüz.",
    todo: "Tabloyu okuyun ve size uygun yolu seçin.",
  },
  '/blue-card-check': {
    what: "Bu sayfa maaşınızın Mavi Kart için yeterli olup olmadığını kontrol eder.",
    why: "Mavi Kart için bir maaş sınırı vardır.",
    todo: "Teklif edilen maaşı ve mesleğinizi yazın, sonuca bakın.",
  },
  '/chancenkarte-calculator': {
    what: "Bu sayfa Fırsat Kartı (Chancenkarte) için puanınızı hesaplar.",
    why: "Puanınızın yeterli olup olmadığını ve neyin eksik olduğunu görürsünüz.",
    todo: "Eğitim, dil, yaş ve deneyim sorularını cevaplayın.",
  },
  '/anerkennung': {
    what: "Bu sayfa diplomanızın Almanya'da tanınmasını (Anerkennung) anlatır.",
    why: "Birçok meslekte çalışmak için diplomanız tanınmalıdır.",
    todo: "Mesleğinizi seçin ve adımları sırayla okuyun.",
  },
  '/family-reunification-check': {
    what: "Bu sayfa ailenizin yanınıza gelip gelemeyeceğini kontrol eder.",
    why: "Eş ve çocuklar için gelir, konut ve dil şartları vardır.",
    todo: "Aileniz, geliriniz ve eviniz hakkındaki soruları cevaplayın.",
  },
  '/germany-vs-other-countries': {
    what: "Bu sayfa Almanya'yı başka ülkelerle karşılaştırır.",
    why: "Maaş, vize ve aile şartlarını yan yana görürsünüz.",
    todo: "Ülkeleri seçin ve tabloyu okuyun.",
  },
  '/visa-document-checklist': {
    what: "Bu sayfa vize için gereken belgelerin listesini verir.",
    why: "Elçiliğe hiçbir belgeyi unutmadan gitmeniz için.",
    todo: "Vize türünü ve mesleğinizi seçin, listeyi yazdırın.",
  },
  '/visa-refusal': {
    what: "Bu sayfa vize reddedildiğinde ne yapmanız gerektiğini anlatır.",
    why: "Reddin sebebini ve kalan yolları anlarsınız.",
    todo: "Ret sebebini seçin ve sonraki adımları okuyun.",
  },
  '/grade-converter': {
    what: "Bu sayfa diploma notunuzu Alman notuna çevirir.",
    why: "Almanya'da notlar farklı hesaplanır.",
    todo: "Notunuzu ve not ölçeğini yazın.",
  },
  // money
  '/salary-calculator': {
    what: "Bu sayfa brüt maaşınızdan net maaşı hesaplar.",
    why: "Elinize ne kadar para kalacağını bilirsiniz.",
    todo: "Maaşı yazın ve vergi sınıfını seçin.",
  },
  '/cost-calculator': {
    what: "Bu sayfa Almanya'ya taşınmanın masraflarını tahmini hesaplar.",
    why: "Ne kadar para biriktirmeniz gerektiğini önceden bilirsiniz.",
    todo: "Vize türünü ve gereken hizmetleri seçin.",
  },
  '/budget': {
    what: "Bu sayfa Almanya'daki ilk ayın bütçesini hesaplar.",
    why: "İlk maaşa kadar ne kadar para gerektiğini görürsünüz.",
    todo: "Maaşınızı, şehri ve kirayı yazın.",
  },
  '/payslip-explained': {
    what: "Bu sayfa Alman maaş bordrosunu (Lohnabrechnung) satır satır açıklar.",
    why: "Maaşınızdan neyin neden kesildiğini anlarsınız.",
    todo: "Bordrodaki bir satıra dokunun ve açıklamayı okuyun.",
  },
  '/tax-refund-calculator': {
    what: "Bu sayfa vergi beyannamesiyle ne kadar para geri alabileceğinizi hesaplar.",
    why: "Ödediğiniz verginin bir kısmı çoğu zaman geri döner.",
    todo: "Maaşınızı ve masraflarınızı, örneğin işe yolu, yazın.",
  },
  '/shift-pay-calculator': {
    what: "Bu sayfa gece, pazar ve bayram ek ödemelerini hesaplar.",
    why: "Bu ek ödemelerin bir kısmı vergisizdir ve net maaşı artırır.",
    todo: "Saatlik ücretinizi ve çalışma saatlerinizi yazın.",
  },
  '/tax-class-chooser': {
    what: "Bu sayfa evli çiftler için vergi sınıflarını karşılaştırır.",
    why: "Doğru vergi sınıfıyla her ay daha fazla para kalabilir.",
    todo: "İkinizin de maaşını yazın ve sonuçları karşılaştırın.",
  },
  '/rent-check': {
    what: "Bu sayfa kiranın normal olup olmadığını kontrol eder.",
    why: "Çok pahalı bir daire tutmamanız için.",
    todo: "Şehri, dairenin büyüklüğünü ve kirayı yazın.",
  },
  '/send-money-home': {
    what: "Bu sayfa her ay ailenize ne kadar para gönderebileceğinizi hesaplar.",
    why: "Masraflardan sonra ne kaldığını görürsünüz.",
    todo: "Maaşınızı ve masraflarınızı yazın.",
  },
  '/real-salaries': {
    what: "Bu sayfa çalışanlarımızın sözleşmelerindeki gerçek maaşları gösterir.",
    why: "Mesleğinizde ve şehrinizde gerçekte ne kadar ödendiğini görürsünüz.",
    todo: "Mesleği ve şehri seçin.",
  },
  '/health-insurance-comparison': {
    what: "Bu sayfa Alman sağlık sigortası kasalarını (Krankenkasse) karşılaştırır.",
    why: "Kasalar arasında fiyat farkı vardır.",
    todo: "Maaşınızı yazın ve en ucuz kasalara bakın.",
  },
  // plan the move
  '/when-in-germany': {
    what: "Bu sayfa Almanya'ya yaklaşık ne zaman gelebileceğinizi gösterir.",
    why: "Planlarınızı zamanında yapmanız için.",
    todo: "Vize türünü ve şu anki adımınızı seçin.",
  },
  '/permanent-residence': {
    what: "Bu sayfa kalıcı oturum ve vatandaşlık için en erken tarihi gösterir.",
    why: "Almanya'daki uzun vadeli planınızı görürsünüz.",
    todo: "Geliş tarihinizi ve durumunuzu yazın.",
  },
  '/five-years-in-germany': {
    what: "Bu sayfa Almanya'daki ilk 5 yılınızı yıl yıl gösterir.",
    why: "Maaş, birikim ve oturum izninin nasıl değişeceğini görürsünüz.",
    todo: "Mesleğinizi ve şehri seçin, yıllara bakın.",
  },
  '/which-city': {
    what: "Bu sayfa size uygun Alman şehrini bulur.",
    why: "Hangi şehirde yaşamanın sizin için daha iyi olduğunu öğrenirsiniz.",
    todo: "8 soruyu cevaplayın ve sonuca bakın.",
  },
  '/residence-card-explained': {
    what: "Bu sayfa Alman oturum kartını (eAT) açıklar.",
    why: "Karttaki her yazının anlamını anlarsınız.",
    todo: "Örnek karttaki bir alana dokunun ve açıklamayı okuyun.",
  },
  '/calculator': {
    what: "Bu sayfa Almanya'da işe ne zaman başlayabileceğinizi tahmin eder.",
    why: "Planlarınızı tarihe göre yaparsınız.",
    todo: "Vize türünü ve başlangıç tarihini seçin.",
  },
  '/cities': {
    what: "Bu sayfa Alman şehirlerini karşılaştırır.",
    why: "Kira, ulaşım ve aylık masrafları görürsünüz.",
    todo: "Şehirleri seçin ve rakamları karşılaştırın.",
  },
  '/events': {
    what: "Bu sayfada ücretsiz etkinlikler ve web seminerleri var.",
    why: "Sorularınızı sorabilir ve yeni bilgiler öğrenebilirsiniz.",
    todo: "Bir etkinlik seçin ve kayıt olun.",
  },
  '/status': {
    what: "Bu sayfa başvurunuzun hangi aşamada olduğunu gösterir.",
    why: "Giriş yapmadan durumu kontrol edebilirsiniz.",
    todo: "Başvuru numaranızı ve doğum tarihinizi yazın.",
  },
  '/changes-2027': {
    what: "Bu sayfa 2027'de Almanya'da nelerin değiştiğini gösterir.",
    why: "Maaş, vergi ve diğer kurallardaki yenilikleri bilirsiniz.",
    todo: "Listeyi okuyun: eski ve yeni değer yan yanadır.",
  },
  // life in Germany
  '/life-in-germany': {
    what: "Bu sayfa Almanya'daki hayatınızı canlandırır.",
    why: "Maaş, kira ve masraflardan sonra ne kaldığını görürsünüz.",
    todo: "Mesleğinizi ve şehri seçin.",
  },
  '/driving-licence-germany': {
    what: "Bu sayfa yabancı ehliyetin Almanya'da nasıl kullanıldığını anlatır.",
    why: "Ehliyetinizi zamanında değiştirmeniz gerekebilir.",
    todo: "Ehliyet türünüzü seçin ve adımları okuyun.",
  },
  '/german-apartment': {
    what: "Bu sayfa sanal bir Alman dairesidir.",
    why: "Evdeki günlük kuralları önceden öğrenirsiniz.",
    todo: "Dairedeki noktalara dokunun ve açıklamaları okuyun.",
  },
  '/apartment-viewing': {
    what: "Bu sayfada daire görmeyi Almanca olarak çalışırsınız.",
    why: "Görüşmeye hazır gider ve dolandırıcılığı tanırsınız.",
    todo: "Diyaloğu çalışın ve kiracı formunu (Mieterselbstauskunft) doldurun.",
  },
  '/german-street': {
    what: "Bu sayfa sanal bir Alman sokağıdır: resmî daire, banka, istasyon, market, doktor.",
    why: "Günlük durumları oyunla çalışırsınız.",
    todo: "Bir binaya dokunun ve oyunu açın.",
  },
  '/holiday-planner': {
    what: "Bu sayfa Alman resmî tatillerini ve köprü günlerini gösterir.",
    why: "İzninizi akıllıca planlarsınız.",
    todo: "Eyaleti ve yılı seçin, takviminize ekleyin.",
  },
  '/advent-calendar': {
    what: "Bu sayfa bir Advent takvimidir: 1-24 Aralık her gün bir kapı.",
    why: "Alman Noel geleneklerini ve ifadelerini öğrenirsiniz.",
    todo: "Bugünün kapısını açın.",
  },
  '/weekend-trips': {
    what: "Bu sayfa trenle hafta sonu gezileri önerir.",
    why: "Deutschlandticket ile ucuz gezi yerleri bulursunuz.",
    todo: "Şehrinizi seçin ve gezi yerlerine bakın.",
  },
  '/driving-time-calculator': {
    what: "Bu sayfa şoförler için sürüş ve dinlenme süresini kontrol eder.",
    why: "Kuralları çiğneyip ceza almamanız için.",
    todo: "Haftalık sürüş ve dinlenme saatlerinizi yazın.",
  },
  '/work-schedule-check': {
    what: "Bu sayfa çalışma planınızın kurallara uygun olup olmadığını kontrol eder.",
    why: "Çalışma saatleri ve dinlenme için kurallar vardır.",
    todo: "Vardiyalarınızı yazın ve sonuca bakın.",
  },
  '/emergency-wallpaper': {
    what: "Bu sayfa telefonunuz için acil durum ekran resmi oluşturur.",
    why: "Önemli numaralar ve adresiniz hep ekranda olur.",
    todo: "Bilgileri yazın ve resmi indirin.",
  },
  '/pocket-guide': {
    what: "Bu sayfa yazdırmak için bir Almanya cep rehberidir.",
    why: "Önemli numaralar ve ifadeler hep yanınızda olur.",
    todo: "PDF'i indirin ve yazdırın.",
  },
  // explore
  '/map': {
    what: "Bu harita çalışanlarımızın Almanya'nın hangi şehirlerinde çalıştığını gösterir.",
    why: "Başkalarının nerede işe başladığını görürsünüz.",
    todo: "Haritada bir şehre dokunun.",
  },
  '/azerbaijan-in-germany': {
    what: "Bu harita Almanya'da Azerbaycan ile ilgili yerleri gösterir.",
    why: "Elçiliği, dernekleri ve tanıdık yerleri bulursunuz.",
    todo: "Bir şehir seçin ve yerlere bakın.",
  },
  '/guides': {
    what: "Bu sayfada vize, Anerkennung ve taşınma hakkında rehberler var.",
    why: "Sorularınıza ayrıntılı cevap bulursunuz.",
    todo: "Bir konu seçin ve yazıyı okuyun.",
  },
  '/glossary': {
    what: "Bu sayfa Alman resmî işlerinde kullanılan kelimelerin sözlüğüdür.",
    why: "Mektuplardaki ve formlardaki kelimeleri anlarsınız.",
    todo: "Kelimeyi arayın ve basit açıklamayı okuyun.",
  },
  '/shortage-barometer': {
    what: "Bu sayfa Almanya'da hangi mesleklerde eleman eksik olduğunu gösterir.",
    why: "Mesleğinizin nerede daha çok arandığını görürsünüz.",
    todo: "Mesleğinizi seçin ve haritaya bakın.",
  },
  '/jobs': {
    what: "Bu sayfada Almanya'daki açık iş ilanları var.",
    why: "Size uygun işi bulursunuz.",
    todo: "Bir ilan seçin ve başvurun.",
  },
  '/visas': {
    what: "Bu sayfa tüm çalışma vizesi türlerini gösterir.",
    why: "Her vizenin şartlarını öğrenirsiniz.",
    todo: "Bir vize türü seçin ve ayrıntıları okuyun.",
  },
  // learn German
  '/german-mock-exam': {
    what: "Bu sayfada Almanca deneme sınavları var.",
    why: "Gerçek sınavdan önce çalışırsınız.",
    todo: "A1 veya B1 seçin ve başlayın.",
  },
  '/german-mock-exam/a1': {
    what: "Bu sayfa A1 seviyesinde bir deneme sınavıdır.",
    why: "Gerçek A1 sınavına ne kadar hazır olduğunuzu görürsünüz.",
    todo: "Zamanlayıcıyı başlatın ve her bölümü çözün.",
  },
  '/german-mock-exam/b1': {
    what: "Bu sayfa B1 seviyesinde bir deneme sınavıdır.",
    why: "Gerçek B1 sınavına ne kadar hazır olduğunuzu görürsünüz.",
    todo: "Zamanlayıcıyı başlatın ve dört bölümü çözün.",
  },
  '/german-level-test-self': {
    what: "Bu sayfa Almanca seviyenizi kendiniz değerlendirmenize yardım eder.",
    why: "Seviyenizi ve sonraki adımı bilirsiniz.",
    todo: "Cümleleri okuyun ve neler yapabildiğinizi seçin.",
  },
  '/german-simulator': {
    what: "Bu sayfada resmî dairede, bankada ve doktorda Almanca konuşmayı çalışırsınız.",
    why: "Gerçek durumda ne diyeceğinizi bilirsiniz.",
    todo: "Bir durum seçin ve doğru cevabı seçin.",
  },
  '/pronunciation': {
    what: "Bu sayfa Almanca telaffuzu çalışmanıza yardım eder.",
    why: "Doğru konuşmanız için.",
    todo: "Cümleyi dinleyin, sesli söyleyin ve sonuca bakın.",
  },
  '/price-game': {
    what: "Bu oyunda Almanya'daki fiyatları tahmin edersiniz.",
    why: "Günlük masrafları önceden öğrenirsiniz.",
    todo: "Fiyatı tahmin edin ve doğru cevabı görün.",
  },
  '/traffic-signs': {
    what: "Bu sayfa Alman trafik işaretlerini öğretir.",
    why: "Almanya'da araba kullanmak veya yürümek için gerekir.",
    todo: "İşaretleri öğrenin, sonra testi yapın.",
  },
  '/waste-sorting': {
    what: "Bu oyunda çöpü doğru kutuya atmayı öğrenirsiniz.",
    why: "Almanya'da çöpler türlerine göre ayrılır.",
    todo: "Her eşyayı doğru kutuya atın.",
  },
  '/ticket-machine': {
    what: "Bu sayfa bir Alman bilet otomatını canlandırır.",
    why: "Doğru bileti alır ve cezadan kaçınırsınız.",
    todo: "Görevi okuyun ve bileti alın.",
  },
  '/supermarket-game': {
    what: "Bu oyunda bir Alman süpermarketinde alışveriş yaparsınız.",
    why: "Ürünlerin Almanca adlarını öğrenirsiniz.",
    todo: "Listedeki ürünleri raflarda bulun.",
  },
  '/workplace-etiquette': {
    what: "Bu sayfa Alman iş yerindeki davranış kuralları hakkında bir testtir.",
    why: "İşte neyin normal olduğunu önceden bilirsiniz.",
    todo: "Durumu okuyun ve bir cevap seçin.",
  },
  '/work-scenes': {
    what: "Bu sayfada iş yerlerinin resimleri ve Almanca kelimeler var.",
    why: "İşte gereken kelimeleri öğrenirsiniz.",
    todo: "Bir iş yeri seçin.",
  },
  '/work-scenes/restaurant-kitchen': {
    what: "Bu resim Almanca kelimelerle bir restoran mutfağıdır.",
    why: "Mutfakta gereken kelimeleri öğrenirsiniz.",
    todo: "Bir eşyaya dokunun, kelimeyi dinleyin, sonra testi yapın.",
  },
  '/work-scenes/truck-cab': {
    what: "Bu resim Almanca kelimelerle bir kamyon kabinidir.",
    why: "Şoför olarak gereken kelimeleri öğrenirsiniz.",
    todo: "Bir eşyaya dokunun, kelimeyi dinleyin, sonra testi yapın.",
  },
  '/work-scenes/hospital-ward': {
    what: "Bu resim Almanca kelimelerle bir hastane odasıdır.",
    why: "Hastanede gereken kelimeleri öğrenirsiniz.",
    todo: "Bir eşyaya dokunun, kelimeyi dinleyin, sonra testi yapın.",
  },
  '/work-scenes/construction-site': {
    what: "Bu resim Almanca kelimelerle bir inşaat alanıdır.",
    why: "İnşaatta gereken kelimeleri ve güvenlik kurallarını öğrenirsiniz.",
    todo: "Bir eşyaya dokunun, kelimeyi dinleyin, sonra testi yapın.",
  },
  '/work-scenes/electrical-panel': {
    what: "Bu resim Almanca kelimelerle bir elektrik panosudur.",
    why: "Elektrik işinde gereken kelimeleri öğrenirsiniz.",
    todo: "Bir eşyaya dokunun, kelimeyi dinleyin, sonra testi yapın.",
  },
  // employers
  '/employer-cost-calculator': {
    what: "Bu sayfa işveren için bir çalışanın maliyetini hesaplar.",
    why: "Yurt dışından eleman almanın gerçek maliyetini görürsünüz.",
    todo: "Brüt maaşı yazın ve maliyetlere bakın.",
  },
  '/employer-guide-azerbaijan': {
    what: "Bu sayfa Azerbaycan'dan eleman alan işverenler için bir rehberdir.",
    why: "Eğitim, diplomalar ve süreç hakkında bilgi edinirsiniz.",
    todo: "Bölümleri okuyun ve sorunuz varsa bize yazın.",
  },
  '/kandidaten': {
    what: "Bu sayfa Almanya'da çalışmaya hazır adayların anonim kataloğudur.",
    why: "İşveren olarak uygun eleman bulursunuz.",
    todo: "Mesleğe ve dile göre filtreleyin, bir aday için talep gönderin.",
  },
  '/novruz-card': {
    what: "Bu sayfa bir Nevruz tebrik kartı oluşturur.",
    why: "Azerbaycanlı çalışanlarınızı doğru şekilde tebrik edersiniz.",
    todo: "Kartı seçin, adı yazın ve indirin.",
  },
};
