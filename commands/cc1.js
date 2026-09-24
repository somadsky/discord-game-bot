// =========================================
// commands/cc1.js — Versi Fixed
// =========================================
//
// Fitur:
// - Command: cc1 (mulai game), scc1 (cek sisa soal)
// - Game cerdas cermat dengan tombol A/B/C/D
// - Soal diambil dari runtime/cc1_data.json
// - Soal yang sudah dipakai disimpan di runtime/cc1_used.json
// - Lock per server menggunakan GLOBAL_LOCK shared
// =========================================

const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

// =========================================
// KONSTANTA
// =========================================

const DATA_DIR = path.join(__dirname, "..", "runtime");
const DATA_FILE = path.join(DATA_DIR, "cc1_data.json");
const USED_FILE = path.join(DATA_DIR, "cc1_used.json");

// Timeout tunggu klik tombol (60 detik)
const COLLECTOR_TIMEOUT = 60000;

// Delay sebelum tombol muncul (3 detik)
const BUTTON_DELAY = 3000;

// Anti-duplicate load
const loadedClients = new WeakSet();

// =========================================
// HELPER: SAFE READ/WRITE JSON
// =========================================

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error("❌ Gagal buat direktori runtime:", err.message);
    return false;
  }
}

function safeReadJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;

    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    console.error(`❌ Gagal baca ${path.basename(file)}:`, err.message);
    return fallback;
  }
}

function safeWriteJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return true;
  } catch (err) {
    console.error(`❌ Gagal tulis ${path.basename(file)}:`, err.message);
    return false;
  }
}

// =========================================
// HELPER: VALIDASI SOAL
// =========================================

function isValidSoal(item) {
  if (!item || typeof item !== "object") return false;
  if (typeof item.q !== "string" || !item.q.trim()) return false;
  if (typeof item.a !== "string" || !item.a.trim()) return false;
  if (!item.opts || typeof item.opts !== "object") return false;

  for (const key of ["a", "b", "c", "d"]) {
    if (typeof item.opts[key] !== "string" || !item.opts[key].trim()) {
      return false;
    }
  }

  return ["a", "b", "c", "d"].includes(item.a.toLowerCase());
}

function safeLabel(text, max = 75) {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = (client, data, saveData) => {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!client || typeof client.on !== "function") {
    console.error("❌ cc1: client tidak valid.");
    return;
  }

  if (!data || typeof data !== "object") {
    console.error("❌ cc1: data tidak valid.");
    return;
  }

  // =========================================
  // ANTI-DUPLICATE LOAD
  // =========================================
  if (loadedClients.has(client)) {
    console.warn("⚠️ cc1 sudah terdaftar, skip listener duplikat.");
    return;
  }
  loadedClients.add(client);

  // =========================================
  // PASTIKAN FILE ADA
  // =========================================
  if (!ensureDataDir()) return;

  if (!fs.existsSync(DATA_FILE)) safeWriteJSON(DATA_FILE, []);
  if (!fs.existsSync(USED_FILE)) safeWriteJSON(USED_FILE, []);

  // =========================================
  // LOCK (GLOBAL_LOCK shared atau fallback lokal)
  // =========================================
  const GLOBAL_LOCK = client.__globalLock || {};
  const LOCK = GLOBAL_LOCK;

  if (!client.__globalLock) {
    console.warn(
      "⚠️ GLOBAL_LOCK tidak tersedia di cc1, pakai lock lokal (bisa bentrok)."
    );
  }

  console.log("🧠 Module Cerdas Cermat (CC1) dimuat.");

  // =========================================
  // FUNGSI: LOAD / SAVE SOAL
  // =========================================
  function loadSoal() {
    const list = safeReadJSON(DATA_FILE, []);
    return list.filter(isValidSoal);
  }

  function loadUsed() {
    return safeReadJSON(USED_FILE, []);
  }

  function saveUsedSoal(q) {
    const used = loadUsed();
    used.push(q);
    safeWriteJSON(USED_FILE, used);
  }

  function removeSoal(q) {
    const soal = loadSoal().filter((s) => s.q !== q.q);
    safeWriteJSON(DATA_FILE, soal);
  }

  // =========================================
  // MESSAGE HANDLER
  // =========================================
  client.on("messageCreate", async (msg) => {
    try {
      if (msg.author?.bot) return;
      if (!msg.guild) return;

      const content = (msg.content || "").toLowerCase().trim();
      const gid = msg.guild.id;

      // =====================================
      // SISA SOAL (scc1)
      // =====================================
      if (content === "scc1") {
        const totalSisa = loadSoal().length;
        const totalTerpakai = loadUsed().length;

        const embed = new EmbedBuilder()
          .setTitle("📊 Status Soal CC1")
          .setDescription(
            `🧠 Soal tersisa: **${totalSisa}**\n` +
              `📦 Soal terpakai: **${totalTerpakai}**`
          )
          .setColor("#ffaa00");

        return msg.reply({ embeds: [embed] }).catch(() => null);
      }

      // =====================================
      // START GAME (cc1)
      // =====================================
      if (content !== "cc1") return;

      // -------------------------------------
      // CEK LOCK SERVER
      // -------------------------------------
      if (LOCK[gid]) {
        return msg
          .reply("⏳ Masih ada game yang sedang berjalan di server ini.")
          .catch(() => null);
      }

      // -------------------------------------
      // LOAD SOAL
      // -------------------------------------
      const soal = loadSoal();

      if (!soal.length) {
        return msg
          .reply(
            "⚠️ Semua soal sudah habis.\n" +
              "Silakan main game lain sambil menunggu update soal berikutnya."
          )
          .catch(() => null);
      }

      // -------------------------------------
      // AMBIL SOAL RANDOM
      // -------------------------------------
      const q = soal[Math.floor(Math.random() * soal.length)];

      // -------------------------------------
      // LOCK SERVER
      // -------------------------------------
      LOCK[gid] = true;

      // -------------------------------------
      // HAPUS SOAL DARI POOL & SIMPAN KE USED
      // (atomic-ish: remove dulu, kalau gagal, soal tidak hilang)
      // -------------------------------------
      removeSoal(q);
      saveUsedSoal(q);

      // -------------------------------------
      // KIRIM SOAL (tanpa tombol dulu)
      // -------------------------------------
      const embedSoal = new EmbedBuilder()
        .setTitle("🧠 Cerdas Cermat")
        .setDescription(`**${q.q}**`)
        .setColor("#00E1FF");

      let sent;

      try {
        sent = await msg.channel.send({ embeds: [embedSoal] });
      } catch (err) {
        console.error("❌ Gagal kirim soal CC1:", err.message);
        LOCK[gid] = false;
        return;
      }

      // -------------------------------------
      // DELAY SEBELUM TOMBOL MUNCUL
      // -------------------------------------
      const delayTimer = setTimeout(async () => {
        try {
          // Pastikan pesan masih ada
          if (!sent || sent.deleted) {
            LOCK[gid] = false;
            return;
          }

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("a")
              .setLabel(`A. ${safeLabel(q.opts.a)}`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("b")
              .setLabel(`B. ${safeLabel(q.opts.b)}`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("c")
              .setLabel(`C. ${safeLabel(q.opts.c)}`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("d")
              .setLabel(`D. ${safeLabel(q.opts.d)}`)
              .setStyle(ButtonStyle.Primary)
          );

          const updatedEmbed = new EmbedBuilder()
            .setTitle("🧠 Cerdas Cermat")
            .setDescription(
              `**${q.q}**\n\n` +
                `A. ${q.opts.a}\n` +
                `B. ${q.opts.b}\n` +
                `C. ${q.opts.c}\n` +
                `D. ${q.opts.d}`
            )
            .setColor("#00E1FF")
            .setFooter({ text: "Waktu menjawab: 60 detik" });

          await sent
            .edit({
              embeds: [updatedEmbed],
              components: [row]
            })
            .catch((err) => {
              console.error("❌ Gagal edit soal CC1:", err.message);
              LOCK[gid] = false;
            });

          // -------------------------------------
          // COLLECTOR DENGAN TIMEOUT
          // -------------------------------------
          const collector = sent.createMessageComponentCollector({
            max: 1,
            time: COLLECTOR_TIMEOUT
          });

          collector.on("collect", async (i) => {
            try {
              await i.deferUpdate().catch(() => null);

              // -----------------------------------
              // VALIDASI DATA USER
              // -----------------------------------
              if (!data[i.user.id]) {
                data[i.user.id] = { cash: 0 };
              }

              if (typeof data[i.user.id].cash !== "number") {
                data[i.user.id].cash = 0;
              }

              const benar = i.customId === q.a.toLowerCase();
              data[i.user.id].cash += benar ? 100 : -100;

              // Simpan
              try {
                saveData();
              } catch (err) {
                console.error(
                  "❌ Gagal save data CC1:",
                  err.message
                );
              }

              const result = new EmbedBuilder()
                .setTitle(
                  benar ? "✔ Jawaban Benar!" : "❌ Jawaban Salah!"
                )
                .setDescription(
                  `👤 **${i.user.username}** menjawab **${i.customId.toUpperCase()}**\n\n` +
                    `✅ Jawaban benar: **${q.a.toUpperCase()}**\n` +
                    `${benar ? "🏆 +100 poin" : "💥 -100 poin"}`
                )
                .setColor(benar ? "#00cc66" : "#ff4444");

              await sent
                .edit({ embeds: [result], components: [] })
                .catch(() => null);
            } catch (err) {
              console.error("❌ Error di collector CC1:", err.message);
            }
          });

          collector.on("end", (collected, reason) => {
            LOCK[gid] = false;

            if (reason === "time") {
              const timeoutEmbed = new EmbedBuilder()
                .setTitle("⏰ Waktu Habis")
                .setDescription(
                  `Tidak ada yang menjawab.\n\n` +
                    `✅ Jawaban benar: **${q.a.toUpperCase()}**\n` +
                    `📝 ${q.opts[q.a]}`
                )
                .setColor("#888888");

              sent
                .edit({ embeds: [timeoutEmbed], components: [] })
                .catch(() => null);
            }
          });
        } catch (err) {
          console.error("❌ Error di delay timer CC1:", err.message);
          LOCK[gid] = false;
        }
      }, BUTTON_DELAY);

      // Simpan timer di client untuk cleanup
      if (!client.__cc1Timers) client.__cc1Timers = new Set();
      client.__cc1Timers.add(delayTimer);

      // Cleanup setelah selesai
      setTimeout(() => {
        if (client.__cc1Timers) {
          client.__cc1Timers.delete(delayTimer);
        }
      }, BUTTON_DELAY + COLLECTOR_TIMEOUT + 5000);
    } catch (err) {
      console.error("❌ Error di handler CC1:", err.message);

      // Cleanup lock
      if (msg.guild?.id) {
        LOCK[msg.guild.id] = false;
      }
    }
  });

  // =========================================
  // CLEANUP TIMERS
  // =========================================
  if (!client.__cc1CleanupRegistered) {
    client.__cc1CleanupRegistered = true;

    const cleanup = () => {
      if (client.__cc1Timers) {
        for (const t of client.__cc1Timers) {
          clearTimeout(t);
        }
        client.__cc1Timers.clear();
        console.log("🧹 CC1 timers dibersihkan.");
      }
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  }
};