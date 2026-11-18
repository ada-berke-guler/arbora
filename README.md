# Arbora

*Tohumu ektiğin gün, meyveyi yediğin gün değildir.*
*The day you plant the seed is not the day you eat the fruit.*

**[Türkçe](#türkçe) · [English](#english)**

---

## Türkçe

Başı ve sonu belli bir yolculuk boyunca alışkanlıklarını, gün planını, anlarını,
günlüğünü, uykunu, ruh halini, vision board'unu ve kim olduğunu takip eden,
**hiçbir kullanıcı verisi toplamayan** kişisel bir web uygulaması (PWA).

### Özellikler

| Modül | Ne yapar |
| --- | --- |
| **Tanıtım** | Three.js ile prosedürel 3D ağaç: tohum → filiz → fide → fidan → genç ağaç → meyve |
| **Yolculuk** | 1–365 gün; kenar çubuğundaki 3D ağaç ilerlemeye göre gerçek zamanlı büyür; bitince özet |
| **Alışkanlıklar** | Haftalık tablo: tık = kısmen, çift tık = yapıldı, basılı tut = detay, sağ tık = atlandı |
| **Gün Kadranı** | İki halkalı 24 saat kadranı (iç 00–12, dış 12–24), yay üstü etiketler, çakışma kontrolü, öğlen/gece yarısı bölme, renk ve yazı rengi seçimi, sürükle-bırak, tek-an görevleri, kayıtlı günler, tarih gezinme |
| **Anlar** | Aylık takvim; gün penceresi o güne ait her şeyi toplar |
| **Günlük** | Serbest tarih/saatli kayıtlar, arama, anlara bağlantı |
| **Uyku & Ruh Hali** | Yatış/kalkış saatleri, 3 seviyeli ruh hali, grafikler |
| **Vision Board** | Piksel boyutlu panolar (telefon, tablet, masaüstü ya da özel boyut), PNG duvar kağıdı olarak indirme |
| **Kimlik** | "Ben … biriyim" cümleleri |
| **Temalar** | 10 hazır tema + **60-30-10 tema oluşturucu**, kontrast raporu, genel ya da **bölüm bölüm** uygulama |
| **Yedek** | JSON dışa/içe aktarma (eski Arbora yedekleri dahil) |
| **Şifreli eşitleme** | İsteğe bağlı; veri cihazda AES-256-GCM ile şifrelenir, sunucu okuyamaz |
| **Erişilebilirlik** | Türkçe/İngilizce, klavye desteği, ekran okuyucu etiketleri, hareket azaltma, mobil alt menü |

### Gizlilik

- Analitik, çerez, takip veya reklam yok. Yazı tipleri dahil her şey uygulamanın içinde; çalışırken hiçbir üçüncü taraf sunucuya istek atılmaz.
- Veriler yalnızca tarayıcının IndexedDB veritabanında durur.
- Eşitleme açılırsa kullanıcı adı + paroladan cihazda anahtar türetilir; sunucu yalnızca okuyamadığı şifreli bir dosya saklar. Şifre sıfırlama yoktur. Ayrıntılar: uygulamadaki Gizlilik ve KVKK sayfası.

### Çalıştırma

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # testler
npm run build        # üretim derlemesi → dist/
npm run sync-server  # (isteğe bağlı) şifreli kasa sunucusu, :8787
```

**Hesap / eşitleme sunucusu (önerilen: Cloudflare Workers + R2, ücretsiz):**

```bash
cd server/cloudflare
npm install
npx wrangler login     # tarayıcıda Cloudflare hesabınla giriş
npm run setup          # R2 kovasını oluşturur (bir kez)
npm run deploy         # → https://arbora-vault.<hesabın>.workers.dev
```

Alternatif: `server/server.mjs` kalıcı diski olan herhangi bir Node sunucusunda
çalışır (aynı API). Adresi derleme sırasında verirsen kullanıcılar sunucu
adresi yazmadan giriş yapar:

```bash
VITE_SYNC_SERVER=https://kasa.ornek.com npm run build
```

---

## English

A personal web app (PWA) that tracks your habits, day plan, moments, journal,
sleep, mood, vision board and identity across a journey with a real start and
end date — and **collects no user data at all**.

### Features

| Module | What it does |
| --- | --- |
| **Intro** | A procedural 3D tree built with Three.js: seed → sprout → seedling → sapling → young tree → fruit |
| **Journey** | 1–365 days; the 3D tree in the sidebar grows in real time with your progress; a recap at the end |
| **Habits** | Weekly grid: click = partial, double-click = done, hold = details, right-click = skipped |
| **Day Ring** | Two-ring 24h dial (inner 00–12, outer 12–24), labels along the arcs, overlap check, noon/midnight splitting, color and label-color picking, drag & drop, single-moment tasks, saved days, date navigation |
| **Moments** | Monthly calendar; each day gathers everything logged that day |
| **Journal** | Entries at any date and time, search, links to moments |
| **Sleep & Mood** | Bed/wake times, a three-level mood scale, charts |
| **Vision Board** | Pixel-sized boards (phone, tablet, desktop or custom), download as a PNG wallpaper |
| **Identity** | "I am a person who…" statements |
| **Themes** | 10 presets + a **60-30-10 theme builder**, contrast report, apply app-wide or **per section** |
| **Backup** | JSON export/import (old Arbora backups supported) |
| **Encrypted sync** | Optional; data is encrypted on your device with AES-256-GCM, the server can't read it |
| **Accessibility** | Turkish/English, keyboard support, screen-reader labels, reduced motion, mobile tab bar |

### Privacy

- No analytics, cookies, tracking or ads. Everything, fonts included, ships inside the app; no third-party server is contacted while it runs.
- Data lives only in your browser's IndexedDB.
- If sync is enabled, keys are derived from your username + password on your device; the server only stores an encrypted file it cannot read. There is no password reset. Details: the Privacy & KVKK page in the app.

### Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # tests
npm run build        # production build → dist/
npm run sync-server  # (optional) encrypted vault server, :8787
```

**Account / sync server (recommended: Cloudflare Workers + R2, free):**

```bash
cd server/cloudflare
npm install
npx wrangler login     # sign in to Cloudflare in the browser
npm run setup          # creates the R2 bucket (once)
npm run deploy         # → https://arbora-vault.<your-account>.workers.dev
```

Alternatively `server/server.mjs` runs on any Node host with a persistent disk
(same API). Bake the address in at build time so people sign in without typing
a URL:

```bash
VITE_SYNC_SERVER=https://vault.example.com npm run build
```

---

React 18 · TypeScript · Vite · Dexie (IndexedDB) · Three.js · Vitest

MIT License
