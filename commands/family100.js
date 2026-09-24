// =========================================
// commands/family100.js
// GAME FAMILY 100 — Versi Fixed
// =========================================
//
// Fitur:
// - Command: ff100
// - Pemain menebak jawaban dari soal Family 100
// - Setiap jawaban benar dapat poin
// - Game selesai saat semua jawaban terbuka
// - Lock per server menggunakan GLOBAL_LOCK (shared)
// =========================================

const { EmbedBuilder } = require("discord.js");

module.exports = (client, data, saveData) => {
  // =========================================
  // LOAD DATABASE SOAL
  // =========================================
  let soal;

  try {
    soal = require("./family100_data.json");
  } catch (err) {
    console.error("❌ Gagal load family100_data.json:", err.message);
    return;
  }

  if (!Array.isArray(soal) || soal.length === 0) {
    console.error("❌ Database Family 100 kosong atau tidak valid.");
    return;
  }

  console.log(`✅ Module Family 100 dimuat (${soal.length} soal).`);

  // =========================================
  // GLOBAL LOCK
  // =========================================
  // Menggunakan GLOBAL_LOCK dari index.js (shared dengan game lain)
  // agar tidak bisa bentrok dengan MTK, FSK, CC, dll.
  // =========================================
  const GLOBAL_LOCK = client.__globalLock;

  // Jika GLOBAL_LOCK tidak tersedia, buat fallback lokal
  // (tapi ini seharusnya tidak terjadi jika index.js sudah benar)
  const LOCK = GLOBAL_LOCK || {};

  if (!GLOBAL_LOCK) {
    console.warn(
      "⚠️ GLOBAL_LOCK tidak tersedia di Family 100, menggunakan lock lokal."
    );
  }

  // =========================================
  // ANTI-DUPLICATE LOAD
  // =========================================
  if (client.__family100Loaded) {
    console.warn("⚠️ Family 100 sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__family100Loaded = true;

  // =========================================
  // MESSAGE HANDLER
  // =========================================
  client.on("messageCreate", async (msg) => {
    try {
      if (msg.author.bot) return;
      if (!msg.guild) return;

      const cmd = msg.content.toLowerCase().trim();
      if (cmd !== "ff100") return;

      const gid = msg.guild.id;
      const uid = msg.author.id;

      // =====================================
      // CEK LOCK
      // =====================================
      if (LOCK[gid]) {
        return msg.reply(
          "🎮 **Masih ada permainan yang sedang berlangsung!**\n\n" +
            "Selesaikan permainan yang sedang aktif terlebih dahulu."
        );
      }

      // =====================================
      // CEK REGISTER
      // =====================================
      if (!Object.hasOwn(data, uid)) {
        return msg.reply(
          "❌ Kamu belum terdaftar.\n" +
            "Ketik **reg** terlebih dahulu."
        );
      }

      // =====================================
      // LOCK SERVER
      // =====================================
      LOCK[gid] = true;

      // =====================================
      // AMBIL SOAL RANDOM
      // =====================================
      const q = soal[Math.floor(Math.random() * soal.length)];

      // Validasi struktur soal
      if (!q || !Array.isArray(q.jawaban) || q.jawaban.length === 0) {
        LOCK[gid] = false;
        return msg.reply(
          "❌ Soal Family 100 rusak.\nSilakan coba lagi."
        );
      }

      // =====================================
      // SUSUN BOARD
      // =====================================
      const board = q.jawaban.map((j, index) => ({
        ...j,
        idx: index + 1,
        opened: false
      }));

      // =====================================
      // KIRIM INTRO
      // =====================================
      const intro = new EmbedBuilder()
        .setTitle("🎉 FAMILY 100 DIMULAI!")
        .setDescription(
          `❓ **${q.q}**\n\n` +
            `Ada **${board.length} jawaban**.\n` +
            `Jawab langsung di chat!`
        )
        .setColor("#ffaa00")
        .setFooter({ text: "Ketik jawaban tanpa prefix" });

      try {
        await msg.channel.send({ embeds: [intro] });
      } catch (err) {
        LOCK[gid] = false;
        console.error("❌ Gagal kirim intro Family 100:", err.message);
        return;
      }

      // =====================================
      // COLLECTOR
      // =====================================
      const collector = msg.channel.createMessageCollector({
        filter: (m) => !m.author.bot
      });

      collector.on("collect", async (m) => {
        try {
          const jawab = m.content.toLowerCase().trim();

          // Cari jawaban yang cocok dan belum terbuka
          const match = board.find(
            (x) => x.j.toLowerCase() === jawab && !x.opened
          );

          // Salah atau duplikat → diam saja
          if (!match) return;

          // =====================================
          // JAWABAN BENAR
          // =====================================
          const answerUserId = m.author.id;

          // Cek register
          if (!Object.hasOwn(data, answerUserId)) {
            return m.reply(
              "❌ Kamu belum terdaftar.\n" +
                "Ketik **reg** terlebih dahulu."
            );
          }

          // Mark terbuka
          match.opened = true;

          // Tambah poin
          if (typeof data[answerUserId].cash !== "number") {
            data[answerUserId].cash = 0;
          }
          data[answerUserId].cash += match.p;
          saveData();

          // =====================================
          // SUSUN PAPAN JAWABAN
          // =====================================
          const papan = board
            .map((x) => {
              if (x.opened) return `${x.idx}. **${x.j}** — ${x.p} poin`;
              return `${x.idx}. `;
            })
            .join("\n");

          // =====================================
          // KIRIM HASIL
          // =====================================
          const emb = new EmbedBuilder()
            .setTitle("✔ Jawaban ditemukan!")
            .setDescription(
              `**${m.author.username}** menemukan jawaban!\n\n` +
                `💡 Jawaban: **${match.j}** (urutan **#${match.idx}**)\n` +
                `💰 Poin: **+${match.p}**\n\n` +
                papan
            )
            .setColor("#00cc66");

          try {
            await msg.channel.send({ embeds: [emb] });
          } catch (err) {
            console.error("❌ Gagal kirim hasil Family 100:", err.message);
          }

          // =====================================
          // CEK SEMUA TERBUKA
          // =====================================
          const semuaTerbuka = board.every((x) => x.opened);

          if (semuaTerbuka) {
            collector.stop("complete");

            const selesai = new EmbedBuilder()
              .setTitle("🎉 Semua jawaban berhasil ditemukan!")
              .setDescription(papan)
              .setColor("#00eaff");

            try {
              await msg.channel.send({ embeds: [selesai] });
            } catch (err) {
              console.error(
                "❌ Gagal kirim pesan selesai Family 100:",
                err.message
              );
            }
          }
        } catch (err) {
          console.error("❌ Error di collector Family 100:", err.message);
        }
      });

      collector.on("end", () => {
        LOCK[gid] = false;
        console.log(`✅ Family 100 selesai di ${msg.guild.name}`);
      });
    } catch (err) {
      console.error("❌ Error di handler Family 100:", err.message);

      // Cleanup lock jika error
      if (msg.guild?.id) {
        LOCK[msg.guild.id] = false;
      }
    }
  });
};