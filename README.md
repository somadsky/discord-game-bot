# Discord Game Bot

Bot Discord berbasis Node.js yang menyediakan berbagai fitur permainan dan utilitas komunitas. Dibangun menggunakan `discord.js` v14 dan mudah dikonfigurasi melalui file `.env`.

## ⚠️ Peringatan Keamanan

**Jangan pernah meng-commit file `.env` atau token bot Discord ke version control.**

Jika Anda yakin token Anda telah ter-expose, segera reset melalui [Discord Developer Portal](https://discord.com/developers/applications).

## Fitur

### 🎮 Permainan
- **Cerdas Cermat (CC1/CC2)** — Kuis pilihan ganda
- **Family 100** — Tebak jawaban paling populer
- **Tebak Gambar** — Tebak gambar dari deskripsi
- **Tebak Musik** — Tebak judul lagu dari audio
- **Tebak Negara** — Tebak negara dari bendera
- **Sambung Kata** — Permainan rantai kata
- **Werewolf** — Permainan deduksi sosial

### 👥 Fitur Komunitas
- **Sistem Skor** — Penyimpanan skor persisten
- **Leaderboard** — Peringkat pemain
- **Certificate Generator** — Sertifikat otomatis untuk pemenang
- **Confession Anonim** — Sistem curhat anonim
- **Member Logger** — Log member join/leave
- **Auto Role** — Pemberian role otomatis
- **Market Update** — Update harga crypto (opsional)

## Persyaratan

- **Node.js** 18.18.0 atau lebih baru
- **npm** (sudah include dengan Node.js)
- Aplikasi Discord dengan bot token
- Intent Discord yang diperlukan:
  - Server Members Intent
  - Message Content Intent
  - Presence Intent (opsional)

### Persyaratan Opsional

- **FFmpeg** — Untuk fitur voice/music (sudah include via `ffmpeg-static`)
- **sodium-native** atau **libsodium-wrappers** — Untuk enkripsi voice

## Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/somadsky/discord-game-bot
cd discord-game-bot
