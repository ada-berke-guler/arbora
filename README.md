# Arbora

*Tohumu ektiğin gün, meyveyi yediğin gün değildir.*

Başı ve sonu belli bir yolculuk boyunca alışkanlıklarını, gününü, anlarını,
günlüğünü, uykunu, ruh halini, vision board'unu ve kim olduğunu takip eden,
**hiçbir kullanıcı verisi toplamayan** kişisel bir web uygulaması (PWA).

Arbora v2, eski Arbora ile Gün Kadranı (day planner) uygulamalarının
birleşimidir. Ürün gereksinimleri: [`docs/PRD.md`](docs/PRD.md).

## Özellikler

| Modül | Ne yapar |
| --- | --- |
| **Tanıtım** | Three.js ile prosedürel 3D ağaç: tohum → filiz → fide → fidan → genç ağaç → meyve |
| **Yolculuk** | 1–365 gün; kenar çubuğundaki 3D ağaç ilerlemeye göre gerçek zamanlı büyür; bitince özet |
| **Alışkanlıklar** | Haftalık tablo: tık = kısmen, çift tık = yapıldı, basılı tut = detay, sağ tık = atlandı |
| **Gün Kadranı** | İki halkalı 24 saat kadranı (iç 00–12, dış 12–24), yay üstü etiketler, çakışma kontrolü, öğlen/gece yarısı bölme, renk + yazı rengi seçimi, sürükle-bırak, tek-an görevleri, kayıtlı günler (mini kadranlar), tarih gezinme |
| **Anlar** | Aylık takvim; gün penceresi o güne ait her şeyi (Gün Kadranı planı dahil) toplar |
| **Günlük** | Serbest tarih/saatli kayıtlar, arama, anlara derin bağlantı |
| **Uyku & Ruh Hali** | Yatış/kalkış, 3 seviyeli ruh hali, SVG grafikler |
| **Vision Board** | Piksel boyutlu panolar (telefon, iPhone, tablet, masaüstü, QHD, ultra geniş ya da özel W×H), PNG duvar kağıdı olarak indirme |
| **Kimlik** | "Ben … biriyim" cümleleri |
| **Temalar** | 10 hazır tema + **60-30-10 tema oluşturucu** (baskın / ikincil / vurgu), WCAG kontrast raporu, genel ya da **bölüm bölüm** uygulama |
| **Yedek** | Tam JSON dışa/içe aktarma (eski Arbora v1 yedekleri dahil), içe aktarmadan önce özet |
| **Şifreli eşitleme** | İsteğe bağlı; veri cihazda AES-256-GCM ile şifrelenir, sunucu okuyamaz |
| **Erişilebilirlik** | TR/EN, klavye desteği, ARIA, hareket azaltma, mobil alt menü |

## Gizlilik

- Analitik, çerez, takip, reklam yok. Yazı tipleri pakete gömülü — çalışırken
  hiçbir üçüncü taraf sunucuya istek atılmaz.
- Veri yalnızca tarayıcının IndexedDB'sinde durur.
- Eşitleme açılırsa: anahtar paroladan cihazda türetilir (PBKDF2, 250k tur),
  sunucu sadece şifreli blob'u rastgele bir kasa kimliği altında saklar;
  log tutmaz, IP saklamaz, şifresiz veriyi reddeder.

## Çalıştırma

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # Vitest
npm run build        # tsc + vite build → dist/
npm run preview      # derlenmiş sürümü yerelde sun
npm run sync-server  # (isteğe bağlı) şifreli kasa sunucusu, :8787
```

`dist/` tamamen statik bir PWA'dır; herhangi bir statik sunucuya konabilir.

## Teknoloji

React 18 · TypeScript · Vite · Dexie (IndexedDB) · react-router (hash) ·
Three.js (yalnızca ağaç, tembel yüklenir) · @fontsource · Vitest + Testing Library.

## Proje yapısı

```
src/
  db/          şema, modül veri katmanları, yedek, birleşik görünümler
  lib/         tarih, renk & 60-30-10 tema motoru, kadran geometrisi, şifreleme
  i18n/        tr.ts / en.ts sözlükleri
  components/  Shell, Intro, tree/ (3D ağaç), seçiciler, modal, bildirimler
  features/    her ekran kendi klasöründe
server/        bağımlılıksız şifreli kasa sunucusu
docs/PRD.md    ürün gereksinimleri
```

## Lisans

MIT
