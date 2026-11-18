# Arbora 2 — Ürün Gereksinimleri Dokümanı (PRD)

*"Tohumu ektiğin gün, meyveyi yediğin gün değildir."*

Durum: v2.0 · Tarih: 2026-11-18

## 1. Amaç

Arbora; alışkanlık, gün planı, anlar, günlük, uyku/ruh hali, vision board ve
kimlik cümlelerini **başı ve sonu belli bir yolculuk** içinde toplayan kişisel
bir yaşam takip uygulamasıdır. v2, eski Arbora ile Gün Kadranı (day planner)
uygulamasını tek üründe birleştirir, arayüzü baştan tasarlar ve uygulamayı
herkes için (mobil, klavye, ekran okuyucu, iki dil) kullanılabilir hale getirir.

## 2. İlkeler

1. **Sıfır veri toplama.** Analitik, telemetri, reklam, üçüncü taraf istek yok.
   Yazı tipleri pakete gömülü (Google Fonts'a istek atılmaz). Uygulama çalışırken
   hiçbir sunucuya kullanıcı verisi gitmez.
2. **Önce yerel.** Bütün veri cihazdaki IndexedDB veritabanında. Hesap yok.
   İnternetsiz çalışır, PWA olarak kurulabilir.
3. **Opsiyonel şifreli eşitleme.** Kullanıcı isterse cihazlar arası eşitleme
   açabilir. Veri cihazda parola ile şifrelenir (AES-GCM, PBKDF2); sunucu sadece
   okunamayan bir blob saklar — kim olduğunu, ne yazdığını bilemez. Varsayılan:
   kapalı.
4. **Yedek bir özelliktir.** Tam dışa/içe aktarma, eski Arbora yedekleriyle uyumlu.
5. **Erişilebilirlik.** WCAG AA kontrast kontrolü, tam klavye desteği, ARIA,
   `prefers-reduced-motion`, mobilde alt gezinme çubuğu.
6. **İki dil.** Türkçe (varsayılan) ve İngilizce, Ayarlar'dan değiştirilebilir.

## 3. Kapsam — modüller

### 3.1 Tanıtım ve logo (YENİLENİYOR)
- İlk açılışta **3D, animasyonlu bir ağaç**: tohum → filiz → fide → fidan →
  genç ağaç → meyve. Three.js ile prosedürel üretilir, yavaşça döner.
- Ardından modülleri anlatan kısa slaytlar (Day Ring dahil). "Atla" her zaman var.
- Tekrar izleme Ayarlar'dan; tekrar izlemede yalnızca logo animasyonu oynar.
- WebGL yoksa veya hareket azaltma açıksa: aynı aşamayı gösteren 2D SVG ağaç.

### 3.2 Büyüyen ağaç
- Kenar çubuğunda / üst barda aynı 3D ağaç, yolculuğun ilerleme oranına
  (`geçen gün / toplam gün`) göre gerçek zamanlı büyür. Aşama adı ve "Gün X / Y"
  yazılır. Tıklanınca yolculuk ayarları açılır.

### 3.3 Yolculuk (KORUNUYOR)
- Ad, başlangıç ve bitiş tarihi (1–365 gün), canlı "N gün · H hafta · A ay" özeti.
- Ayarlardan ad ve bitiş tarihi değişir. Bittiğinde özet (recap) bir kez açılır;
  yeni yolculuk başlatılır, eskiler geçmiş olarak saklanır.

### 3.4 Alışkanlıklar (KORUNUYOR)
- Haftalık tablo: tık = kısmen, çift tık = yapıldı, basılı tut = detay,
  sağ tık / Alt+Enter = bilerek atlandı. Mobilde dokunma aynı şekilde çalışır.
- Tür (edin/bırak), sıklık (her gün / haftada X), öncelik, renk.
- Detay: bu hafta, toplam, kısmi, seri.

### 3.5 Day Ring (Gün Kadranı ile BİRLEŞİYOR)
- **Görünüm Gün Kadranı'ndan:** iki iç içe dolu halka (iç 00–12, dış 12–24),
  her blok kendi süresi kadar dolu bir dilim; ad dilimin yayı üzerinde yazılır
  (alt yarıda ters çevrilir, dar dilimde gizlenir). Saat çizgileri ve etiketleri,
  merkezde "Şu an" saati ve boş süre.
- **Çakışma kontrolü:** çakışan blok eklenemez/kaydedilemez; hangi blokla, hangi
  saatte çakıştığı söylenir.
- **Otomatik bölme:** öğleni veya gece yarısını geçen bloklar iki halkaya bölünür.
- **Renk:** temanın paleti + serbest renk seçici; yazı rengi (beyaz/siyah)
  otomatik kontrasta göre seçilir, elle değiştirilebilir.
- **Nokta görevler** (tek saat) halka üzerinde işaretçi olarak kalır.
- **Sürükle-bırak** ile saat değiştirme (5 dk adım), bırakırken çakışma kontrolü.
- **Düzenleme:** dilime veya listedeki satıra tıklayınca düzenleme penceresi.
- **Tarih gezinme:** önceki/sonraki gün, bugün, tarih seçici.
- **Liste:** halkaya göre gruplu, üzerine gelince kadranda vurgulanır;
  dolu/boş süre toplamları.
- **Kayıtlı günler (şablonlar):** o anki gün isim ve renkle kaydedilir; ayrı
  sekmede mini kadranlar olarak görünür; tıklayınca seçili güne uygulanır
  (mevcut plan değiştirilir, geri alınabilir); kayıtlı gün güncellenebilir ve
  silinebilir.

### 3.6 Anlar (KORUNUYOR)
- Aylık takvim, günün başlığı ve yazısı; gün penceresinde o güne ait alışkanlık,
  ruh hali, uyku, günlük **ve Day Ring planı** özeti. Günlüğe derin bağlantı.

### 3.7 Günlük (KORUNUYOR)
- Serbest tarih/saatli kayıt, düzenleme, silme (geri al), "O güne git" bağlantısı.

### 3.8 Uyku ve ruh hali (KORUNUYOR)
- Yatış/kalkış saati (gece yarısını geçen uyku kalkış gününe yazılır), 3 seviyeli
  ruh hali, SVG çizgi grafikler, kayıt tablosu.

### 3.9 Vision Board (GENİŞLİYOR)
- Birden fazla pano. Her panonun **kullanıcının belirlediği piksel boyutu** var:
  hazır ayarlar (Telefon 1080×2400, iPhone 1179×2556, Masaüstü 1920×1080,
  QHD 2560×1440, Tablet 2048×1536) veya özel genişlik×yükseklik.
- Pano ekrana sığacak şekilde ölçeklenir; öğeler pano koordinatında saklanır.
- Görsel ve not ekleme, sürükleme, boyutlandırma, döndürme, öne/arkaya alma,
  klavye ile kaydırma, silme (geri al). Arka plan rengi.
- **PNG olarak dışa aktar** — tam piksel boyutunda; telefon veya masaüstü duvar
  kağıdı olarak kullanılabilir.

### 3.10 Kimlik (KORUNUYOR)
- "Ben … biriyim" cümleleri; ekle, düzenle, sırala, sil.

### 3.11 İletişim (KORUNUYOR)
- E-posta adresi, mailto bağlantısı, kopyala butonu. Form yok, servis yok.

### 3.12 Arama (KORUNUYOR)
- Günlük ve anlarda metin arama, sonuçtan doğrudan kayda gitme. Ctrl/⌘+K.

### 3.13 Temalar (YENİ SİSTEM)
- **Hazır temalar:** eski Arbora ve Gün Kadranı temalarından derlenen paletler
  (Altın Gece, Matcha, Gece Eriği, Buzul, Arduvaz Gül, Bahçe, Onyx, Orkide,
  Kil, Çim).
- **60-30-10 tema oluşturucu:** kullanıcı üç renk seçer —
  %60 baskın (arka plan), %30 ikincil (paneller, kenar çubuğu, yüzeyler),
  %10 vurgu (butonlar, seçili öğeler, odak). Metin, kenarlık, soluk metin ve
  vurgu üstü metin bu üç renkten otomatik türetilir. Canlı önizleme, oranları
  gösteren 60/30/10 şeridi, kontrast (WCAG) uyarısı, "rastgele uyumlu palet".
- **Uygulama geneli veya bölüm bölüm:** tema tüm uygulamaya ya da yalnızca
  seçilen bölümlere (Alışkanlıklar, Day Ring, Anlar, Günlük, Uyku & Ruh Hali,
  Vision Board, Kimlik, İletişim) uygulanabilir. Bölüm teması yoksa genel tema.
- Kişisel temalar kaydedilir, düzenlenir, silinir; yedeğe dahildir.

### 3.14 Ayarlar (YENİ SAYFA)
- Tema & renkler, dil, yedek (dışa/içe aktar), şifreli eşitleme, tanıtımı tekrar
  izle, gizlilik açıklaması, veriyi tamamen silme.

### 3.15 Yedek
- **Dışa aktar:** tüm tablolar (görseller base64) tek JSON dosyası.
- **İçe aktar:** dosya doğrulanır, içerik özeti (kaç kayıt) gösterilir, onayla
  tüm veri değiştirilir; tek transaction — yarım kalmaz.
- **Eski Arbora (v1, "life-tracker") yedekleri de içe aktarılabilir.**
- 7 günden eski yedek için hatırlatma.

### 3.16 Şifreli eşitleme (opsiyonel)
- Ayarlar'da sunucu adresi + kasa kimliği + parola. "Gönder" yerel veriyi
  şifreleyip yükler, "Al" indirip çözer ve içe aktarır.
- Sunucu (`server/`): bağımlılıksız Node; yalnızca `PUT/GET /vault/:id`
  ile şifreli blob saklar. Log tutmaz, IP saklamaz.

## 4. Gezinme ve düzen
- Masaüstü: sol kenar çubuğu (logo + ağaç, yolculuk, arama, modüller, ayarlar).
- Mobil (< 768px): üst bar + alt sekme çubuğu (ana modüller) + "Daha fazla".
- Sayfa geçişlerinde kısa animasyon (hareket azaltmada kapalı).

## 5. Teknik
- React 18 + TypeScript + Vite, Dexie (IndexedDB), react-router (hash),
  Three.js (yalnızca ağaç), @fontsource ile gömülü yazı tipleri, Vitest.
- Satırlar: `id, createdAt, updatedAt, deletedAt` — silmeler yumuşak, geri alınabilir.
- Tarihler yerel `YYYY-MM-DD`; `toISOString()` ile tarih türetilmez.
- Upsert'ler transaction içinde.

## 6. Kabul kriterleri
- `npm run test` yeşil: Day Ring geometri/çakışma, yedek gidiş-dönüş (eski format
  dahil), 60-30-10 türetme ve kontrast, şifreleme gidiş-dönüş, tarih yardımcıları.
- `npm run build` hatasız (tsc + vite).
- Çalışma anında dış ağ isteği yok (eşitleme açılmadıkça).

## 7. Kapsam dışı (v2)
- Hesap sistemi, bildirimler, sosyal paylaşım, gerçek zamanlı çakışma çözümlü sync.
