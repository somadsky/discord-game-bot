# 🎮 Discord Game Bot

Bot Discord komunitas multi-fitur dengan mini-games, sistem skor, leaderboard, dan utilitas manajemen komunitas. Dibangun dengan Node.js dan discord.js v14.

## ⚠️ Peringatan Keamanan

**Jangan pernah meng-commit file `.env` atau token bot Discord ke version control.**

Jika Anda yakin token Anda telah ter-expose, segera reset melalui [Discord Developer Portal](https://discord.com/developers/applications).

---

## 📑 Daftar Isi

- [Fitur](#-fitur)
  - [Mini Games](#-mini-games)
  - [Game Edukasi](#-game-eduasi)
  - [Sistem Skor & Leaderboard](#-sistem-skor--leaderboard)
  - [Generator Sertifikat](#-generator-sertifikat)
  - [Confession Anonim](#-confession-anonim)
  - [Member Logger](#-member-logger)
  - [Auto Role](#-auto-role)
  - [Market Update](#-market-update)
  - [Sistem Proteksi](#-sistem-proteksi)
  - [Music Player](#-music-player)
- [Persyaratan](#-persyaratan)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [Command List](#-command-list)
- [Struktur Project](#-struktur-project)
- [Testing](#-testing)
- [Batasan](#-batasan)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)
- [Disclaimer](#-disclaimer)

---

## ✨ Fitur

### 🎲 Mini Games

| Game | Command | Deskripsi |
|------|---------|-----------|
| **Cerdas Cermat (CC1)** | `cc1` | Kuis pilihan ganda dari bank soal. Jawab benar dapat poin. |
| **Cerdas Cermat Brutal (CC2)** | `cc2` | Versi sulit dari CC1 dengan soal lebih menantang. |
| **Family 100** | `ff100` | Tebak jawaban paling populer dari survei. |
| **Tebak Gambar** | `gambar1` | Tebak gambar dari deskripsi yang diberikan. |
| **Tebak Musik** | `tmsk1` | Tebak judul lagu dari audio yang diputar. |
| **Tebak Negara** | `tnegara1` | Tebak negara dari emoji bendera. |
| **Sambung Kata** | `sk1` | Rantai kata — lanjutkan kata dari huruf terakhir. |
| **Werewolf** | `wolf1` | Game deduksi sosial — cari werewolf di antara pemain. |

**Detail Setiap Game:**

#### 🧠 Cerdas Cermat (CC1/CC2)
- **Cara main:** Ketik `cc1` atau `cc2` → soal muncul → jawab dalam waktu yang ditentukan
- **Poin:** +100 benar, -50 salah (CC1); +150 benar, -75 salah (CC2)
- **Bank soal:** Dari `commands/cc1_data.json`
- **Anti-duplicate:** Soal tidak diulang dalam sesi yang sama

#### 👨‍👩‍👧‍👦 Family 100
- **Cara main:** Ketik `ff100` → pertanyaan muncul → jawab jawaban paling populer
- **Poin:** Tergantung peringkat jawaban (100, 80, 60, dst)
- **Data:** Dari `commands/family100_data.json`
- **Multi-answer:** Bisa ada beberapa jawaban benar

#### 🖼️ Tebak Gambar
- **Cara main:** Ketik `gambar1` → gambar muncul → tebak apa yang ada di gambar
- **Poin:** +100 benar
- **Hint:** Ada command `tnhint` untuk hint

#### 🎵 Tebak Musik
- **Cara main:** Ketik `tmsk1` → bot join voice → putar musik → tebak judulnya
- **Poin:** +100 benar
- **Hint:** Ada command `tmskhint`
- **Catatan:** Butuh voice permission & FFmpeg

#### 🌍 Tebak Negara
- **Cara main:** Ketik `tnegara1` → emoji bendera muncul → tebak negaranya
- **Poin:** +75 benar
- **Hint:** Ada command `tnhint`

#### 🔗 Sambung Kata
- **Cara main:**
  1. Ketik `sk1` → room dibuat
  2. Ketik `joinsk1` → join room
  3. Ketik `startsk1` → mulai permainan
- **Aturan:** Lanjutkan kata dari huruf terakhir kata sebelumnya
- **Validasi:** Kata harus ada di `kbbi.json`
- **Poin:** +50 per kata benar

#### 🐺 Werewolf
- **Cara main:** Ketik `wolf1` → lobby dibuat → tunggu pemain → mulai
- **Role:** Werewolf, Villager, Seer, Doctor, dll
- **Fase:** Lobby → Night → Day → Vote → Repeat
- **Menang:** Werewolf menang kalau jumlahnya ≥ Villager; Villager menang kalau semua werewolf dieliminasi
- **Modul:** ~25 file di folder `werewolf/`

---

### 🎓 Game Edukasi

| Game | Command | Deskripsi |
|------|---------|-----------|
| **Matematika Dasar** | `mtk1` | Penjumlahan & pengurangan |
| **Kali & Bagi** | `mtk2` | Perkalian & pembagian |
| **Akar Kuadrat** | `mtk3` | Akar kuadrat & pangkat |
| **Fisika** | `fsk1` | Soal fisika (F=ma, kecepatan, EP, EK) |

**Detail:**

#### 🔢 MTK1 — Matematika Dasar
- **Soal:** `a + b - c` atau variasi
- **Poin:** +50 benar, -50 salah
- **Waktu:** 10 detik

#### 🔢 MTK2 — Kali & Bagi
- **Soal:** `a * b / c` atau `a / b * c`
- **Poin:** +100 benar, -100 salah
- **Waktu:** 15 detik
- **Format jawaban:** Desimal dengan titik (contoh: `3.14`)

#### 🔢 MTK3 — Akar Kuadrat
- **Soal:** `√(a²) + b²` atau `√n - m²`
- **Poin:** +125 benar, -125 salah
- **Waktu:** 15 detik
- **Format jawaban:** 2 desimal

#### ⚡ FSK1 — Fisika
- **Tipe soal:**
  - Gaya: `F = m × a`
  - Kecepatan: `v = s / t`
  - Energi Potensial: `EP = m × 10 × h`
  - Energi Kinetik: `EK = ½ × m × v²`
- **Poin:** +75 benar, -75 salah
- **Waktu:** 25 detik

---

### 📊 Sistem Skor & Leaderboard

**Fitur:**
- ✅ Registrasi user via `reg`
- ✅ Skor disimpan di `runtime/data.json`
- ✅ Persistence otomatis setiap perubahan
- ✅ Leaderboard top 10
- ✅ Profil user via `/prf` atau `profile`

**Command:**

| Command | Fungsi |
|---------|--------|
| `reg` | Daftar akun |
| `scr` | Lihat skor sendiri |
| `leaderboard` | Lihat top 10 |
| `profile` / `prf` | Lihat profil lengkap (level, buff, gelar) |

**Detail Profil (`/prf`):**
- 🧠 **Level Otak** — Dihitung dari total skor (`skor / 100`)
- 💰 **Total Score** — Total poin
- ✨ **Buff Mingguan** — Berdasarkan level:
  - Level 15+: 🧠 Brainstorm Aura
  - Level 10+: 💡 Logic Boost
  - Level 5+: ✨ Focus Pulse
- 👑 **Gelar Juara** — Berdasarkan ranking server:
  - Juara 1: 🏆 Penguasa Nalar Semesta
  - Juara 2: 🥈 Ahli Logika Anti Gagal
  - Juara 3: 🥉 Pemikir Berkarisma Rendah

---

### 📜 Generator Sertifikat

**Fitur:**
- ✅ Generate sertifikat PNG otomatis
- ✅ Desain elegan dengan border, medali, laurel, owl
- ✅ Avatar penerima (bulat dengan border emas)
- ✅ Fallback jika avatar gagal load (inisial)
- ✅ Fallback jika font tidak ada
- ✅ Timeout & retry pada fetch avatar
- ✅ Sanitasi filename (anti path traversal)

**Kapan dipakai:**
- Otomatis saat **reset bulanan** (tanggal 15 & 30 jam 07:00 WIB)
- Bisa dipanggil manual via command (jika ada)

**Isi Sertifikat:**
- Judul: "SERTIFIKAT PENGHARGAAN ISTIMEWA"
- Badge: "JUARA [1/2/3] • [PARUH/AKHIR] BULAN"
- Nama penerima (font cursive)
- Avatar (bulat, border emas)
- Total skor
- Tanggal & issuer
- Ornamen owl & laurel

**Command:**

| Command | Fungsi |
|---------|--------|
| `csrf` | Generate sertifikat manual (khusus owner) |
| `ceksertif` | Cek sertifikat yang sudah digenerate |

**Kustomisasi:**
- Font: taruh di folder `fonts/` (Playfair Display, Great Vibes, Montserrat, Merriweather, Lato)
- Logo: taruh di `assets/logo.png`
- Issuer: set via `CERTIFICATE_ISSUER` di `.env`

---

### 💬 Confession Anonim

**Fitur lengkap:**
- ✅ Kirim confession anonim via tombol
- ✅ Upload media: gambar (PNG/JPG/GIF/WEBP) & video (MP4/MOV/WEBM/MKV)
- ✅ Batas video: 10 MB
- ✅ Mode skip (tanpa media)
- ✅ Mode batal
- ✅ Thread balasan otomatis per confession
- ✅ Balas anonim via DM
- ✅ ID confession unik (6 karakter)
- ✅ Nomor urut confession (#1, #2, dst)
- ✅ Timeout upload media: 2 menit
- ✅ Validasi tipe & ukuran file
- ✅ Publish ke channel dengan embed
- ✅ Anti-spam via cooldown

**Cara Kerja:**

1. User klik tombol **"Kirim Confession"** di channel confession
2. User isi modal dengan teks curhat
3. User pilih salah satu:
   - 📤 **Upload Media** — Kirim gambar/video via DM
   - ⏭️ **Lewati** — Kirim tanpa media
   - ❌ **Batal** — Batalkan confession
4. Confession dipublish ke channel dengan embed + ID unik
5. Setiap confession otomatis dibuat **thread balasan**
6. User lain bisa balas via tombol **"Balas"** (anonim, via DM)

**Format Media yang Didukung:**

| Tipe | Format | Maks Ukuran |
|------|--------|-------------|
| Gambar | PNG, JPG, JPEG, GIF, WEBP | 8 MB (Discord limit) |
| Video | MP4, MOV, WEBM, MKV | 10 MB |

**Command:**

| Command | Fungsi |
|---------|--------|
| `confess` | Buka modal confession |
| `confession` | Info sistem confession |

**Setup:**
- Set `CONFESSION_CHANNEL_ID` di `.env`
- Bot otomatis kirim pesan pembuka dengan tombol saat ready

**Catatan:**
- User harus mengaktifkan DM dari server untuk upload media
- Video > 10 MB akan ditolak dengan pesan error

---

### 👋 Member Logger

**Fitur:**
- ✅ Welcome message saat member join
- ✅ Deteksi inviter (via invite cache)
- ✅ Leave message saat member keluar sendiri
- ✅ Skip leave message jika member di-kick/di-ban (via AuditLog)
- ✅ Cache invite anti-race-condition
- ✅ Timeout pada fetch invites & audit logs
- ✅ Anti-duplicate load

**Detail Welcome Message:**
- Author: "Welcome [username]"
- Icon: avatar user
- Thumbnail: avatar user
- Isi:
  - Sapaan hangat
  - Mention user
  - "Diundang oleh: [inviter]"
  - Ucapan selamat datang

**Detail Leave Message:**
- Author: "Member Leave"
- Icon: avatar user
- Isi:
  - Username
  - Status: "Keluar sendiri"
- **Skip** jika member di-kick/di-ban

**Setup:**
- Set `WELCOME_CHANNEL_ID` & `LEAVE_CHANNEL_ID` di `.env`

---

### 🎭 Auto Role

**Fitur:**
- ✅ Beri role otomatis ke member baru saat join
- ✅ Cek semua member saat startup (untuk yang belum punya)
- ✅ Delay 500ms antar member (hindari rate limit)
- ✅ Skip bot & member yang sudah punya role

**Setup:**
- Set `MINORITY_ROLE_ID` di `.env`
- Role harus sudah dibuat di server

**Kapan berjalan:**
- Saat `guildMemberAdd` (member baru join)
- Saat `ready` (startup, cek semua member)

---

### 📈 Market Update

**Fitur:**
- ✅ Update harga crypto dari Indodax
- ✅ Kurs USD/IDR
- ✅ Alert saat BTC turun di bawah threshold (per-guild)
- ✅ Scheduler otomatis pada menit tertentu
- ✅ Persentase perubahan harga
- ✅ Anti-duplicate load & cleanup interval
- ✅ Timeout request (10 detik)
- ✅ Guard response kosong

**Coin Default:** BTC, SOL, XRP, ETH, BNB, DOGE

**Format Embed:**
- Judul: "✨ Market Update"
- Timestamp (dengan timezone config)
- Field "💱 KURS" — USD/IDR
- Field "📊 CRYPTO (USDT)" — harga + % perubahan
- Footer: interval update + footer text

**Alert BTC:**
- Trigger: harga BTC ≤ `BTC_BASE - (BTC_BASE × DROP_PERCENT / 100)`
- Mention user via `ALERT_USER_ID` (opsional)
- Reset alert kalau harga naik lagi

**Setup:**
- Set `MARKET_CHANNEL_ID` di `.env`
- Konfigurasi opsional:
  - `MARKET_COINS` — coin yang dipantau
  - `MARKET_BTC_BASE` — base price BTC (default: 70000)
  - `MARKET_BTC_DROP_PERCENT` — % drop untuk alert (default: 3)
  - `MARKET_UPDATE_INTERVAL_MS` — interval cek (default: 30000)
  - `MARKET_UPDATE_MINUTES` — menit kirim update (default: 0,15,30,45)
  - `MARKET_TIMEZONE` — timezone (default: Asia/Jakarta)

---

### 🛡️ Sistem Proteksi

**Fitur:**
- ✅ Anti-Koyapp — Hapus command avatar ke user terlindungi
- ✅ Channel restriction — Batasi music & game bot ke channel tertentu
- ✅ Auto-delete pesan salah channel
- ✅ Warning sementara (auto-delete 15 detik)

**Anti-Koyapp:**
- Hapus command `koyapp` / `koya` yang mention user di `PROTECTED_USER_IDS`
- Hapus balasan bot yang berisi avatar user terlindungi

**Channel Restriction:**
- **Music:** Batasi command & response Jockie Music ke `MUSIC_ALLOWED_CHANNEL_ID`
- **Game:** Batasi command & response OwO/Haruka ke `GAME_ALLOWED_CHANNEL_IDS`

**Setup:**
- Set `PROTECTED_USER_IDS` — user yang dilindungi dari Koyapp
- Set `MUSIC_ALLOWED_CHANNEL_ID` — channel khusus musik
- Set `GAME_ALLOWED_CHANNEL_IDS` — channel khusus game bot
- Set `JOCKIE_BOT_IDS` — ID bot Jockie Music
- Set `GAME_BOT_IDS` — ID bot OwO/Haruka

---

### 🎵 Music Player

**Fitur:**
- ✅ Music player singleton dengan voice reconnect
- ✅ Auto-reconnect saat disconnect
- ✅ Max retry (5x) untuk connect
- ✅ Cleanup lengkap (stream, transcoder, audioPlayer)
- ✅ Auto-loop playlist
- ✅ Auto-update status bot (now playing)
- ✅ Redirect handling pada HTTP stream
- ✅ Timeout pada HTTP request

**Setup:**
- Isi `playlist.js` dengan array URL MP3
- Set `VOICE_CHANNEL_ID` di `.env` untuk auto-join
- Butuh FFmpeg (`ffmpeg-static` sudah include)
- Butuh voice encryption (`sodium-native` atau `libsodium-wrappers`)

**Command:**

| Command | Fungsi |
|---------|--------|
| `join1` | Bot join voice channel (khusus admin) |
| `leave1` | Bot keluar dari voice channel (khusus admin) |

**Catatan:**
- Playlist kosong default (`module.exports = []`)
- Isi sendiri dengan URL MP3 yang legal

---

## 📋 Persyaratan

- **Node.js** 18.18.0 atau lebih baru
- **npm** (bundled dengan Node.js)
- Discord Application dengan bot token
- Intents yang harus diaktifkan:
  - ✅ **Server Members Intent**
  - ✅ **Message Content Intent**
  - ✅ **Presence Intent** (opsional)
  - ✅ **Guild Invites Intent** (untuk member logger)
  - ✅ **Guild Voice States Intent** (untuk music player)

### Opsional

- **FFmpeg** — Untuk fitur voice/music (`ffmpeg-static` sudah include)
- **sodium-native** atau **libsodium-wrappers** — Untuk voice encryption

---

## 🚀 Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/somadsky/discord-game-bot.git
cd discord-game-bot
