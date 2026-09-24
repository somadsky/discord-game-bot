// =========================================
// commands/tebakgambar.js
// GAME TEBAK GAMBAR — Versi Fixed
// =========================================
//
// Fitur:
// - Command: gambar1
// - Pemain menebak gambar dari URL
// - Waktu: 120 detik
// - Reward benar: +150 Score
// - Penalti salah: -150 Score
// - Database: BochilTeam/database (games/tebakgambar.json)
// =========================================

const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

// =========================================
// KONFIGURASI
// =========================================

const DATABASE_URL =
  "https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakgambar.json";

const WAKTU_MS = 120000; // 120 detik
const REWARD_BENAR = 150;
const PENALTI_SALAH = 150;

// =========================================
// MODULE EXPORT
// =========================================

module.exports = (client, data, saveData, GLOBAL_LOCK) => {
  // Anti-duplicate load
  if (client.__tebakGambarLoaded) {
    console.warn("⚠️ tebakGambar sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__tebakGambarLoaded = true;

  console.log("🖼 Module Tebak Gambar dimuat.");

  // =========================================
  // HELPER
  // =========================================

  function initLock(gid) {
    if (!GLOBAL_LOCK[gid]) GLOBAL_LOCK[gid] = false;
  }

  function userExists(id) {
    return Object.hasOwn(data, id);
  }

  function randomColor() {
    return Math.floor(Math.random() * 0xffffff);
  }

  function normalizeAnswer(str) {
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  // =========================================
  // AMBIL SOAL DARI DATABASE
  // =========================================

  async function ambilSoal() {
    const res = await axios.get(DATABASE_URL, { timeout: 10000 });
    const list = res.data;

    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Database tebak gambar kosong.");
    }

    // Validasi struktur item
    const valid = list.filter(
      (item) =>
        item &&
        typeof item.img === "string" &&
        typeof item.jawaban === "string" &&
        item.img.trim() &&
        item.jawaban.trim()
    );

    if (valid.length === 0) {
      throw new Error("Tidak ada soal Tebak Gambar yang valid.");
    }

    const idx = Math.floor(Math.random() * valid.length);
    return valid[idx];
  }

  // =========================================
  // MESSAGE HANDLER
  // =========================================

  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;

      const parts = msg.content.trim().split(/ +/);
      const cmd = parts.shift()?.toLowerCase();

      if (cmd !== "gambar1") return;

      const gid = msg.guild.id;
      const uid = msg.author.id;

      initLock(gid);

      // Cek register
      if (!userExists(uid)) {
        return msg.reply(
          "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu."
        );
      }

      // Cek lock
      if (GLOBAL_LOCK[gid]) {
        return msg.reply(
          "🎮 **Masih ada game yang sedang berlangsung!**\n\n" +
            "Selesaikan game yang sedang aktif terlebih dahulu."
        );
      }

      // =====================================
      // AMBIL SOAL
      // =====================================
      let soal;

      try {
        soal = await ambilSoal();
      } catch (err) {
        console.error("❌ Error ambil database tebakgambar:", err.message);
        return msg.reply(
          "❌ Database Tebak Gambar sedang tidak tersedia.\nSilakan coba lagi."
        );
      }

      // =====================================
      // LOCK
      // =====================================
      GLOBAL_LOCK[gid] = true;

      const { img, deskripsi, jawaban } = soal;

      // =====================================
      // KIRIM SOAL
      // =====================================
      const soalEmbed = new EmbedBuilder()
        .setTitle("🖼 Tebak Gambar")
        .setDescription(
          "Jawablah gambar berikut.\n\n" +
            "**Waktu :**\n120 detik\n\n" +
            "**Hadiah :**\n+150 Score\n\n" +
            "**Penalti :**\n-150 Score (jawaban salah)"
        )
        .setImage(img)
        .setFooter({ text: "Ketik jawaban di chat" })
        .setColor(randomColor());

      try {
        await msg.channel.send({ embeds: [soalEmbed] });
      } catch (err) {
        GLOBAL_LOCK[gid] = false;
        console.error("❌ Gagal kirim soal Tebak Gambar:", err.message);
        return;
      }

      // =====================================
      // STATE
      // =====================================
      let selesai = false;
      const target = normalizeAnswer(jawaban);

      // =====================================
      // COLLECTOR
      // =====================================
      const collector = msg.channel.createMessageCollector({
        filter: (m) => !m.author.bot,
        time: WAKTU_MS
      });

      collector.on("collect", async (m) => {
        try {
          // Kalau sudah selesai, abaikan
          if (selesai) return;

          const id = m.author.id;

          if (!userExists(id)) return;

          const jawabUser = normalizeAnswer(m.content);

          // =====================================
          // JAWABAN BENAR
          // =====================================
          if (jawabUser === target) {
            // Guard double-check (race condition)
            if (selesai) return;
            selesai = true;
            collector.stop("correct");

            // Validasi cash
            if (typeof data[id].cash !== "number") {
              data[id].cash = 0;
            }

            data[id].cash += REWARD_BENAR;
            saveData();

            const benarEmbed = new EmbedBuilder()
              .setTitle("✅ Jawaban Benar")
              .setDescription(
                `**Pemenang :**\n<@${id}>\n\n` +
                  `**Jawaban :**\n${jawaban}\n\n` +
                  `**Hadiah :**\n+${REWARD_BENAR} Score\n\n` +
                  `**Total Score :**\n${data[id].cash}`
              )
              .setColor(randomColor());

            try {
              await msg.channel.send({ embeds: [benarEmbed] });
            } catch (err) {
              console.error("❌ Gagal kirim hasil Tebak Gambar:", err.message);
            }
            return;
          }

          // =====================================
          // JAWABAN SALAH → penalti
          // =====================================
          if (typeof data[id].cash !== "number") {
            data[id].cash = 0;
          }

          data[id].cash -= PENALTI_SALAH;
          saveData();

          try {
            await m.reply(`❌ Salah! (-${PENALTI_SALAH})`);
          } catch (err) {
            // Abaikan error reply
          }
        } catch (err) {
          console.error("❌ Error di collector Tebak Gambar:", err.message);
        }
      });

      collector.on("end", async (collected, reason) => {
        // Kalau bukan karena waktu habis (misal karena benar), skip
        if (!selesai) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Waktu Habis")
            .setDescription(
              `**Jawaban :**\n${jawaban}\n\n` +
                `**Deskripsi :**\n${deskripsi || "-"}`
            )
            .setColor(randomColor());

          try {
            await msg.channel.send({ embeds: [timeoutEmbed] });
          } catch (err) {
            console.error(
              "❌ Gagal kirim timeout Tebak Gambar:",
              err.message
            );
          }
        }

        // Buka lock
        GLOBAL_LOCK[gid] = false;

        console.log(
          `✅ Tebak Gambar selesai di ${msg.guild.name} | Reason: ${reason}`
        );
      });
    } catch (err) {
      console.error("❌ Error tebakgambar:", err.message);

      // Cleanup lock jika error
      if (msg.guild?.id) {
        GLOBAL_LOCK[msg.guild.id] = false;
      }
    }
  });
};