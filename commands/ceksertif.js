// =========================================
// commands/ceksertif.js
// PREVIEW SERTIFIKAT — Versi Fixed
// =========================================
//
// Fitur:
// - Command: csrf paruh / csrf akhir
// - Hanya untuk OWNER (dari config.ownerIds)
// - Generate preview sertifikat untuk testing
// =========================================

const fs = require("fs");
const generateCertificate = require("../certificateGenerator");
const config = require("../config");

// =========================================
// MODULE EXPORT
// =========================================

module.exports = (client, data, saveData) => {
  // Anti-duplicate load
  if (client.__ceksertifLoaded) {
    console.warn("⚠️ ceksertif sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__ceksertifLoaded = true;

  console.log("📜 Module Cek Sertifikat dimuat.");

  // =========================================
  // OWNER IDS
  // =========================================
  // config.ownerIds adalah Set, kita konversi ke array
  // untuk pengecekan dengan includes()
  // =========================================
  const OWNER_IDS = Array.isArray(config.ownerIds)
    ? config.ownerIds
    : [...(config.ownerIds || [])];

  if (OWNER_IDS.length === 0) {
    console.warn(
      "⚠️ OWNER_IDS tidak dikonfigurasi. Command csrf tidak akan berfungsi."
    );
  }

  // =========================================
  // MESSAGE HANDLER
  // =========================================

  client.on("messageCreate", async (msg) => {
    try {
      // Abaikan bot
      if (msg.author?.bot) return;

      // Cek command
      const content = (msg.content || "").trim();
      if (!content.toLowerCase().startsWith("csrf")) return;

      // =====================================
      // CEK PERMISSION (OWNER)
      // =====================================
      if (!OWNER_IDS.includes(msg.author.id)) {
        return msg.reply(
          "❌ Kamu tidak punya izin untuk menggunakan command ini.\n" +
            "Command ini hanya untuk **owner bot**."
        );
      }

      // =====================================
      // PARSE COMMAND
      // =====================================
      const args = content.split(/\s+/);
      const periode = (args[1] || "").toLowerCase();

      // =====================================
      // VALIDASI COMMAND
      // =====================================
      if (!periode || !["paruh", "akhir"].includes(periode)) {
        return msg.reply(
          "❌ **Format command salah.**\n\n" +
            "Gunakan:\n" +
            "• `csrf paruh` — Preview sertifikat paruh bulan\n" +
            "• `csrf akhir` — Preview sertifikat akhir bulan"
        );
      }

      // =====================================
      // KIRIM LOADING MESSAGE
      // =====================================
      let loadingMsg;

      try {
        loadingMsg = await msg.reply("⏳ Sedang membuat sertifikat preview...");
      } catch (err) {
        console.error("❌ Gagal kirim loading message:", err.message);
        return;
      }

      // =====================================
      // GENERATE SERTIFIKAT
      // =====================================
      let filePath;

      try {
        // Set tanggal sesuai periode
        const certDate = new Date();
        if (periode === "paruh") {
          certDate.setDate(15);
        } else {
          certDate.setDate(30);
        }

        // Data user
        const username = msg.author.username;
        const userId = msg.author.id;
        const avatarURL = msg.author.displayAvatarURL({
          extension: "png",
          size: 512
        });

        // Data sertifikat (default Juara 1)
        const rank = 1;
        const score = 98500;

        // Generate
        filePath = await generateCertificate({
          userId,
          username,
          rank,
          score,
          avatarURL,
          issuer: config.certificateIssuer || "Discord Game Bot",
          certDate
        });

        // Validasi hasil
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error("File sertifikat tidak berhasil dibuat.");
        }
      } catch (err) {
        console.error("❌ Error generate sertifikat:", err.message);

        try {
          await loadingMsg.edit(
            "❌ **Gagal membuat sertifikat.**\n\n" +
              `\`\`\`${err.message}\`\`\``
          );
        } catch (editErr) {
          // Abaikan
        }
        return;
      }

      // =====================================
      // KIRIM SERTIFIKAT
      // =====================================
      try {
        const periodEmoji = periode === "paruh" ? "🌓" : "🌕";
        const periodLabel =
          periode === "paruh" ? "PARUH BULAN" : "AKHIR BULAN";

        await loadingMsg.edit({
          content: `${periodEmoji} **Preview Sertifikat ${periodLabel}**`,
          files: [
            {
              attachment: filePath,
              name: `preview_${periode}_bulan.png`
            }
          ]
        });
      } catch (err) {
        console.error("❌ Gagal kirim sertifikat:", err.message);

        try {
          await loadingMsg.edit(
            "❌ **Gagal mengirim sertifikat.**\n\n" +
              `\`\`\`${err.message}\`\`\``
          );
        } catch (editErr) {
          // Abaikan
        }
      }
    } catch (err) {
      console.error("❌ Error di handler csrf:", err.message);
    }
  });
};