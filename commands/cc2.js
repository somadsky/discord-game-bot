// =========================================
// commands/cc2.js — Versi Fixed
// =========================================
//
// Fitur:
// - Command: cc2
// - Cerdas Cermat Brutal dengan tombol A/B/C/D
// - Bank soal internal (hardcoded)
// - Lock per server menggunakan GLOBAL_LOCK shared
// =========================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

// =========================================
// KONSTANTA
// =========================================

const COLLECTOR_TIMEOUT = 60000;
const MAX_USED_PER_GUILD = 100; // hindari Set membengkak

// Anti-duplicate load
const loadedClients = new WeakSet();

// =========================================
// HELPER
// =========================================

function safeLabel(text, max = 75) {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

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

// =========================================
// BANK SOAL CC2
// =========================================

const BANK = [
  {
    q: "Jika semua A adalah B dan sebagian B bukan C, pernyataan yang PASTI benar adalah?",
    opts: {
      a: "Sebagian A bukan C",
      b: "Semua A bukan C",
      c: "Sebagian B mungkin A",
      d: "Tidak ada A yang C"
    },
    a: "c"
  },
  {
    q: "Manakah yang PALING tidak sejenis?",
    opts: { a: "Analisis", b: "Sintesis", c: "Evaluasi", d: "Emosi" },
    a: "d"
  },
  {
    q: "Planet dengan densitas rata-rata paling rendah di tata surya adalah?",
    opts: { a: "Saturnus", b: "Jupiter", c: "Uranus", d: "Neptunus" },
    a: "a"
  },
  {
    q: "Manakah yang BUKAN kondisi terjadinya race condition?",
    opts: {
      a: "Shared resource",
      b: "Concurrent execution",
      c: "Atomic operation",
      d: "Non-deterministic timing"
    },
    a: "c"
  },
  {
    q: "Tujuan utama Politik Etis bagi pemerintah kolonial Belanda adalah?",
    opts: {
      a: "Balas budi murni",
      b: "Kesejahteraan pribumi",
      c: "Menjamin tenaga kerja terdidik",
      d: "Kemerdekaan Hindia Belanda"
    },
    a: "c"
  },
  {
    q: "Padanan kata 'tidur' dalam bahasa Jawa krama inggil adalah?",
    opts: { a: "Turu", b: "Tilem", c: "Sare", d: "Lelampahan" },
    a: "c"
  },
  {
    q: "Kata 'anjeunna' dalam bahasa Sunda berarti?",
    opts: { a: "Saya", b: "Kamu", c: "Dia", d: "Mereka" },
    a: "c"
  },
  {
    q: "Dalihan Na Tolu dalam budaya Batak merujuk pada?",
    opts: {
      a: "Upacara adat",
      b: "Sistem kekerabatan",
      c: "Hukum adat",
      d: "Struktur kerajaan"
    },
    a: "b"
  },
  {
    q: "Konsep Tri Hita Karana TIDAK mencakup hubungan manusia dengan?",
    opts: { a: "Tuhan", b: "Sesama manusia", c: "Alam", d: "Negara" },
    a: "d"
  },
  {
    q: "Karapan sapi di Madura awalnya berkaitan erat dengan?",
    opts: {
      a: "Hiburan bangsawan",
      b: "Teknik pertanian",
      c: "Upacara keagamaan",
      d: "Upacara kematian"
    },
    a: "b"
  }
];

// =========================================
// MODULE EXPORT
// =========================================

module.exports = (client, data, saveData) => {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!client || typeof client.on !== "function") {
    console.error("❌ cc2: client tidak valid.");
    return;
  }

  if (!data || typeof data !== "object") {
    console.error("❌ cc2: data tidak valid.");
    return;
  }

  // =========================================
  // ANTI-DUPLICATE LOAD
  // =========================================
  if (loadedClients.has(client)) {
    console.warn("⚠️ cc2 sudah terdaftar, skip listener duplikat.");
    return;
  }
  loadedClients.add(client);

  // =========================================
  // LOCK (GLOBAL_LOCK shared atau fallback lokal)
  // =========================================
  const GLOBAL_LOCK = client.__globalLock || {};
  const LOCK = GLOBAL_LOCK;

  if (!client.__globalLock) {
    console.warn(
      "⚠️ GLOBAL_LOCK tidak tersedia di cc2, pakai lock lokal (bisa bentrok)."
    );
  }

  // =========================================
  // USED SOAL PER GUILD
  // =========================================
  const USED = {};

  console.log("🧠 Module Cerdas Cermat Brutal (CC2) dimuat.");

  // =========================================
  // SOAL GENERATOR
  // =========================================
  function generateSoal(usedSet) {
    if (!BANK.length) return null;

    // Coba cari soal yang belum dipakai (maks 10 attempt)
    const valid = BANK.filter(isValidSoal);

    if (!valid.length) return null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = valid[Math.floor(Math.random() * valid.length)];

      if (!usedSet || !usedSet.has(candidate.q)) {
        return candidate;
      }
    }

    // Fallback: reset used kalau semua sudah terpakai
    if (usedSet) usedSet.clear();

    return valid[Math.floor(Math.random() * valid.length)];
  }

  // =========================================
  // MESSAGE HANDLER
  // =========================================
  client.on("messageCreate", async (msg) => {
    try {
      if (msg.author?.bot) return;
      if (!msg.guild) return;

      const content = (msg.content || "").toLowerCase().trim();
      if (content !== "cc2") return;

      const gid = msg.guild.id;

      // -------------------------------------
      // CEK LOCK
      // -------------------------------------
      if (LOCK[gid]) {
        return msg
          .reply("⏳ Game CC2 masih berjalan di server ini.")
          .catch(() => null);
      }

      // -------------------------------------
      // LOCK
      // -------------------------------------
      LOCK[gid] = true;

      // -------------------------------------
      // INIT USED SET
      // -------------------------------------
      if (!USED[gid]) USED[gid] = new Set();

      // Batasi ukuran Set agar tidak membengkak
      if (USED[gid].size > MAX_USED_PER_GUILD) {
        // Simpan 50 soal terakhir saja
        const arr = Array.from(USED[gid]).slice(-50);
        USED[gid] = new Set(arr);
      }

      // -------------------------------------
      // GENERATE SOAL
      // -------------------------------------
      const q = generateSoal(USED[gid]);

      if (!q) {
        LOCK[gid] = false;
        return msg
          .reply("❌ Bank soal CC2 kosong atau tidak valid.")
          .catch(() => null);
      }

      USED[gid].add(q.q);

      // -------------------------------------
      // EMBED SOAL
      // -------------------------------------
      const embed = new EmbedBuilder()
        .setTitle("🧠 Cerdas Cermat Brutal (CC2)")
        .setDescription(
          `**${q.q}**\n\n` +
            `A. ${q.opts.a}\n` +
            `B. ${q.opts.b}\n` +
            `C. ${q.opts.c}\n` +
            `D. ${q.opts.d}`
        )
        .setColor("#FF6A00")
        .setFooter({ text: "Waktu menjawab: 60 detik" });

      const row = new ActionRowBuilder().addComponents(
        ["a", "b", "c", "d"].map((k) =>
          new ButtonBuilder()
            .setCustomId(k)
            .setLabel(`${k.toUpperCase()}. ${safeLabel(q.opts[k])}`)
            .setStyle(ButtonStyle.Primary)
        )
      );

      let sent;

      try {
        sent = await msg.channel.send({
          embeds: [embed],
          components: [row]
        });
      } catch (err) {
        console.error("❌ Gagal kirim soal CC2:", err.message);
        LOCK[gid] = false;
        return;
      }

      // -------------------------------------
      // COLLECTOR
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

          const benar = i.customId.toLowerCase() === q.a.toLowerCase();
          data[i.user.id].cash += benar ? 150 : -150;

          try {
            saveData();
          } catch (err) {
            console.error("❌ Gagal save data CC2:", err.message);
          }

          const result = new EmbedBuilder()
            .setTitle(benar ? "✔ Jawaban Benar!" : "❌ Jawaban Salah!")
            .setDescription(
              `👤 ${i.user.username}\n` +
                `Jawaban: **${i.customId.toUpperCase()}**\n` +
                `Kunci: **${q.a.toUpperCase()}**\n` +
                `${benar ? "🏆 +150" : "💥 -150"} poin`
            )
            .setColor(benar ? "#00cc66" : "#ff3333");

          await sent
            .edit({
              embeds: [result],
              components: []
            })
            .catch(() => null);

          LOCK[gid] = false;
        } catch (err) {
          console.error("❌ Error di collector CC2:", err.message);
          LOCK[gid] = false;
        }
      });

      collector.on("end", async (collected, reason) => {
        LOCK[gid] = false;

        // Hanya tampilkan timeout jika belum ada yang jawab
        if (reason === "time") {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⌛ Waktu Habis!")
            .setDescription(
              `Tidak ada yang menjawab.\n\n` +
                `✅ Jawaban benar: **${q.a.toUpperCase()}**\n` +
                `📝 ${q.opts[q.a]}`
            )
            .setColor("#888888");

          await sent
            .edit({
              embeds: [timeoutEmbed],
              components: []
            })
            .catch(() => null);
        }
      });
    } catch (err) {
      console.error("❌ Error di handler CC2:", err.message);

      // Cleanup lock
      if (msg.guild?.id) {
        LOCK[msg.guild.id] = false;
      }
    }
  });
};