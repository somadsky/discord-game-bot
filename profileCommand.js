// =========================================
// profileCommand.js
// COMMAND PROFILE — Versi Fixed
// =========================================
//
// Fitur:
// - Command: /prf
// - Menampilkan profil user: Level, Buff, Gelar
// - Gelar berdasarkan ranking server (top 1, 2, 3)
// =========================================

const { EmbedBuilder } = require("discord.js");
const getTopPlayers = require("./rankingSystem");

// =========================================
// MODULE EXPORT
// =========================================

module.exports = function profileCommand(client, data) {
  // Anti-duplicate load
  if (client.__profileCommandLoaded) {
    console.warn("⚠️ profileCommand sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__profileCommandLoaded = true;

  console.log("👤 Module Profile Command dimuat.");

  // =========================================
  // MESSAGE HANDLER
  // =========================================

  client.on("messageCreate", async (msg) => {
    try {
      // Abaikan bot
      if (msg.author?.bot) return;

      // Cek command (case-insensitive)
      const content = (msg.content || "").trim().toLowerCase();
      if (content !== "/prf") return;

      const uid = msg.author.id;

      // =====================================
      // CEK REGISTER
      // =====================================
      if (!data[uid]) {
        return msg.reply(
          "❌ Kamu belum terdaftar di sistem permainan.\n" +
            "Ketik **reg** untuk mendaftar."
        );
      }

      // =====================================
      // VALIDASI DATA
      // =====================================
      if (typeof data[uid].cash !== "number") {
        data[uid].cash = 0;
      }

      // =====================================
      // HITUNG RANKING
      // =====================================
      let rank;

      try {
        rank = getTopPlayers(data);
      } catch (err) {
        console.error("❌ Gagal hitung ranking:", err.message);
        rank = { first: null, second: null, third: null };
      }

      // =====================================
      // TENTUKAN GELAR
      // =====================================
      let gelar = "—";

      if (rank) {
        if (uid === rank.first) {
          gelar = "🏆 Penguasa Nalar Semesta";
        } else if (uid === rank.second) {
          gelar = "🥈 Ahli Logika Anti Gagal";
        } else if (uid === rank.third) {
          gelar = "🥉 Pemikir Berkarisma Rendah";
        }
      }

      // =====================================
      // HITUNG LEVEL
      // =====================================
      const cash = data[uid].cash || 0;
      const level = Math.max(0, Math.floor(cash / 100));

      // =====================================
      // TENTUKAN BUFF
      // =====================================
      let buff = "—";

      if (level >= 15) {
        buff = "🧠 Brainstorm Aura";
      } else if (level >= 10) {
        buff = "💡 Logic Boost";
      } else if (level >= 5) {
        buff = "✨ Focus Pulse";
      }

      // =====================================
      // BUAT EMBED
      // =====================================
      const embed = new EmbedBuilder()
        .setTitle(`📘 Profil ${msg.author.username}`)
        .setColor("#00E5FF")
        .setThumbnail(msg.author.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: "🧠 Level Otak",
            value: `**${level}**`,
            inline: true
          },
          {
            name: "💰 Total Score",
            value: `**${cash.toLocaleString("id-ID")}**`,
            inline: true
          },
          {
            name: "✨ Buff Mingguan",
            value: buff,
            inline: true
          },
          {
            name: "👑 Gelar Juara",
            value: gelar,
            inline: false
          }
        )
        .setFooter({
          text: `ID: ${uid}`
        })
        .setTimestamp();

      // =====================================
      // KIRIM
      // =====================================
      try {
        await msg.reply({ embeds: [embed] });
      } catch (err) {
        console.error("❌ Gagal kirim embed profile:", err.message);
      }
    } catch (err) {
      console.error("❌ Error di profileCommand:", err.message);
    }
  });
};