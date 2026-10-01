# Auto Comment Assistant (ekstensi Chrome)

Isi komentar **sekali klik** dari template atau saran AI di Dribbble, Behance, LinkedIn, X/Twitter,
Threads, Instagram, TikTok, Facebook, YouTube, Reddit, dan situs lain mana pun.

## Pasang (tanpa build)
1. Buka `chrome://extensions` (juga bisa di Edge, Brave, Arc, Opera).
2. Nyalakan **Developer mode** → **Load unpacked** → pilih folder `auto-comment-extension/`.
3. Halaman pengaturan terbuka otomatis. Sesuaikan template, dan isi API key bila mau memakai AI.

## Cara pakai
- Klik kotak komentar, lalu muncul tombol **💬**. Klik untuk membuka panel:
  - klik salah satu template, atau **🎲 Acak**
  - **✨ AI** membuat 3 saran yang spesifik ke postingan (muncul bila API key diisi)
- Shortcut: `Alt+Shift+C` isi template acak · `Alt+Shift+A` buka panel + saran AI
  (ubah di `chrome://extensions/shortcuts`).
- Klik kanan di kotak komentar → menu **Auto Comment**. Cara ini juga berfungsi di situs yang tidak ada di daftar.
- Situs lain: klik ikon ekstensi → **Aktifkan di tab ini**.
- Teks yang sudah Anda ketik (mis. `@mention`) tidak dihapus; komentar ditambahkan di belakangnya.

## Template
Satu per baris, per platform. Ada dua fitur:
- Variabel `{name}` `{firstName}` `{title}` `{platform}`. Bila tidak terdeteksi, dibuang beserta komanya.
- Spintax `{Keren|Mantap|Bagus}` agar setiap komentar berbeda. Bagian opsional: `{, {firstName}|}`.

Contoh: `{Beautiful|Super clean} shot{, {firstName}|}! {Love the palette|Great spacing} 🔥`
→ `Super clean shot, Jane! Great spacing 🔥`

## Saran AI (opsional)
Ekstensi memanggil Claude API langsung dari browser dengan API key Anda sendiri (`console.anthropic.com`).
- Default `claude-opus-5-5` (effort `low`, cukup untuk 1–2 kalimat). Bisa diganti ke Sonnet 5.5 / Haiku 4.5 di pengaturan.
- Untuk model 5.x, server-side fallback (`fallbacks: "default"`) aktif: bila classifier keamanan menolak,
  permintaan dijalankan ulang di model lain secara otomatis.
- Yang dikirim ke Anthropic: platform, nama penulis, judul halaman, teks postingan (maks 2000 karakter), dan URL gambar
  (bisa dimatikan). Bila gambar tidak bisa diunduh server, permintaan diulang otomatis tanpa gambar.
- API key disimpan di `chrome.storage.local` (lokal, tidak disinkronkan), tanpa enkripsi. Jangan pakai di komputer bersama.

## Kirim otomatis & batas aman
Mati secara default. Bila dinyalakan, tombol Kirim diklik otomatis setelah komentar diisi, **dengan batas**:
- jeda minimal antar kiriman (default 20 dtk) dan maks kiriman per hari (default 40);
- bila batas tercapai, komentar tetap diisi tetapi Anda yang menekan Kirim.

Ekstensi ini **sengaja tidak** menggulir feed lalu berkomentar sendiri tanpa klik Anda. Komentar massal otomatis
melanggar ketentuan LinkedIn, Instagram, X, dan Dribbble, dan pola cepat yang seragam biasanya berujung pembatasan
atau banned akun.

## Struktur
| File | Isi |
|---|---|
| `manifest.json` | MV3, izin: `storage`, `contextMenus`, `activeTab`, `scripting`, host `api.anthropic.com` |
| `platforms.js` | **Semua CSS selector per platform** (penulis, teks, tombol kirim) |
| `content.js` | Tombol 💬, panel (Shadow DOM), isi textarea/contenteditable, kirim otomatis |
| `background.js` | Menu klik kanan, shortcut, suntik ke situs lain, panggilan Claude API |
| `lib.js` | Fungsi murni (template, spintax, batas kirim) + pengaturan default |
| `popup.*`, `options.*`, `ui.css` | Popup & halaman pengaturan |

## Batasan
- Selector di `platforms.js` **belum diverifikasi terhadap situs live**, dan situs-situs ini sering mengubah markup.
  Pengisian kotak komentar tetap berjalan lewat deteksi generik (textarea/contenteditable yang fokus). Yang bisa meleset
  adalah nama penulis, teks postingan untuk AI, dan tombol Kirim. Bila meleset, inspect elemen di DevTools lalu
  perbarui selector-nya.
- Bila sebuah editor menolak isi otomatis, teks disalin ke clipboard. Tinggal tempel dengan `Ctrl+V`.
- Permintaan AI belum pernah dijalankan dengan API key sungguhan. Bentuk permintaannya diuji dengan `fetch` tiruan.

## Test
```bash
npm install            # hanya untuk test (playwright)
npm test               # unit test: template, spintax, batas kirim, bentuk permintaan API (fetch tiruan)
npm run test:e2e       # Chromium + ekstensi; halaman tiruan Dribbble & X disajikan via page.route (offline)
```
