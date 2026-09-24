// =========================================
// commands/tebaknegara.js
// GAME TEBAK NEGARA — Versi Fixed
// =========================================
//
// Fitur:
// - Command: tnegara1, tn1, tebaknegara1, tebakn1, tbkn1, tbknegara1
// - Hint command: tnhint
// - Hint pertama tersedia setelah 15 detik
// - Cooldown antar hint: 10 detik
// - Reward: +100 Score
// - Waktu: Tidak terbatas
// =========================================

const https = require("https");

// =========================================
// KONFIGURASI
// =========================================

const DATA_URL =
  "https://raw.githubusercontent.com/BOTCAHX/database/refs/heads/master/games/tebakbendera.json";

const REWARD = 100;

// Daftar command untuk memulai game
const COMMANDS = new Set([
  "tnegara1",
  "tn1",
  "tebaknegara1",
  "tebakn1",
  "tbkn1",
  "tbknegara1"
]);

// Command untuk hint
const HINT_COMMAND = "tnhint";

// Hint pertama baru bisa dipakai 15 detik setelah soal muncul
const FIRST_HINT_DELAY = 15;

// Jeda setiap kali hint digunakan
const HINT_COOLDOWN = 10;

// =========================================
// ACTIVE GAME
// =========================================
// Satu game aktif untuk setiap server.
// key   = guild ID
// value = data game
// =========================================

const activeGames = new Map();

// =========================================
// CACHE DATABASE
// =========================================

let countryCache = null;
let cacheTime = 0;

const CACHE_DURATION = 30 * 60 * 1000; // 30 menit

// =========================================
// FETCH JSON
// =========================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Discord-TebakNegara-Bot"
        }
      },
      (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          try {
            const json = JSON.parse(body);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });

        res.on("error", reject);
      }
    );

    request.setTimeout(15000, () => {
      request.destroy(new Error("Request JSON timeout"));
    });

    request.on("error", reject);
  });
}

// =========================================
// GET COUNTRIES
// =========================================

async function getCountries() {
  const now = Date.now();

  // Gunakan cache kalau masih valid
  if (
    Array.isArray(countryCache) &&
    countryCache.length > 0 &&
    now - cacheTime < CACHE_DURATION
  ) {
    return countryCache;
  }

  const data = await fetchJSON(DATA_URL);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Database negara kosong atau format JSON tidak valid.");
  }

  // Filter data yang valid
  const valid = data.filter(
    (item) =>
      item &&
      typeof item.img === "string" &&
      typeof item.name === "string" &&
      item.img.trim() &&
      item.name.trim()
  );

  if (valid.length === 0) {
    throw new Error("Tidak ada data negara yang valid.");
  }

  countryCache = valid;
  cacheTime = now;

  return valid;
}

// =========================================
// RANDOM COUNTRY
// =========================================

function randomCountry(countries) {
  return countries[Math.floor(Math.random() * countries.length)];
}

// =========================================
// NORMALIZE
// =========================================

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// =========================================
// HITUNG POSISI HURUF
// =========================================
// Contoh:
// INDONESIA
// posisi:
// I = 0, N = 1, D = 2, O = 3, N = 4,
// E = 5, S = 6, I = 7, A = 8
// =========================================

function getLetterPositions(answer) {
  const positions = [];

  for (let i = 0; i < answer.length; i++) {
    if (/[a-z]/i.test(answer[i])) {
      positions.push(i);
    }
  }

  return positions;
}

// =========================================
// BUAT CLUE
// =========================================
// Setiap hint membuka 1 huruf.
// Contoh:
// Awal     : _ _ _ _ _ _ _ _ _
// Hint 1   : I _ _ _ _ _ _ _ _
// Hint 2   : I N _ _ _ _ _ _ _
// dst.
// =========================================

function createHint(answer, revealedCount) {
  const normalized = normalize(answer);
  const positions = getLetterPositions(normalized);
  const revealed = new Set(positions.slice(0, revealedCount));

  let result = "";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    // Spasi
    if (char === " ") {
      result += "  ";
      continue;
    }

    // Huruf sudah terbuka
    if (revealed.has(i)) {
      result += char.toUpperCase();
      continue;
    }

    // Huruf belum terbuka
    if (/[a-z]/i.test(char)) {
      result += "_";
      continue;
    }

    // Karakter lainnya
    result += char;
  }

  return result;
}

// =========================================
// FORMAT CLUE
// =========================================

function getHintText(game) {
  const clue = createHint(game.country.name, game.revealedCount);

  const totalLetters = getLetterPositions(
    normalize(game.country.name)
  ).length;

  return (
    "💡 **CLUE TEBAK NEGARA**\n\n" +
    `\`${clue}\`\n\n` +
    `🔓 Huruf terbuka: **${game.revealedCount}/${totalLetters}**`
  );
}

// =========================================
// COUNTDOWN COOLDOWN
// =========================================
// Menggunakan SATU pesan yang diedit:
// 10 detik → 9 detik → ... → 1 detik → selesai
// =========================================

async function startHintCountdown(channel, game) {
  try {
    let countdownMessage = null;

    for (let seconds = HINT_COOLDOWN; seconds >= 1; seconds--) {
      // Kalau game sudah selesai, hentikan countdown
      if (game.solved) return;

      // Pastikan cooldown masih berlaku
      const remaining = game.nextHintAt - Date.now();
      if (remaining <= 0) break;

      const text =
        "⏳ **Bantuan berikutnya**\n\n" +
        `Tunggu command berikut **${seconds} detik**`;

      try {
        if (!countdownMessage) {
          countdownMessage = await channel.send(text);
        } else {
          await countdownMessage.edit(text);
        }
      } catch (err) {
        console.error("❌ Gagal mengirim countdown hint:", err.message);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Tunggu sampai waktu benar-benar selesai
    while (!game.solved && Date.now() < game.nextHintAt) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Kalau game sudah selesai, tidak perlu kirim status
    if (game.solved) return;

    // Beritahu bahwa hint sudah tersedia lagi
    if (countdownMessage) {
      try {
        await countdownMessage.edit(
          "✅ **Bantuan tersedia!**\n\n" +
            "Ketik **tnhint** untuk membuka 1 huruf lagi."
        );
      } catch (err) {
        console.error("❌ Gagal update countdown hint:", err.message);
      }
    }
  } catch (err) {
    console.error("❌ Hint countdown error:", err);
  }
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = function tebakNegara(client, data, saveData, GLOBAL_LOCK) {
  // Anti-duplicate load
  if (client.__tebakNegaraLoaded) {
    console.warn("⚠️ tebakNegara sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__tebakNegaraLoaded = true;

  console.log("🌍 Module Tebak Negara dimuat.");

  client.on("messageCreate", async (msg) => {
    try {
      // Abaikan bot
      if (msg.author.bot) return;

      // Hanya server
      if (!msg.guild) return;

      const command = String(msg.content || "").trim().toLowerCase();
      const gid = msg.guild.id;
      const uid = msg.author.id;

      // ===================================
      // HANDLER TNHINT
      // ===================================
      if (command === HINT_COMMAND) {
        const game = activeGames.get(gid);

        // Tidak ada game Tebak Negara
        if (!game) {
          return msg.reply(
            "❌ Tidak ada game **Tebak Negara** yang sedang berlangsung."
          );
        }

        // Game sudah selesai
        if (game.solved) {
          return msg.reply("❌ Game Tebak Negara sudah selesai.");
        }

        // Cek 15 detik pertama
        const elapsed = Date.now() - game.startedAt;
        const firstDelayMs = FIRST_HINT_DELAY * 1000;

        if (elapsed < firstDelayMs) {
          const remaining = Math.ceil((firstDelayMs - elapsed) / 1000);

          return msg.reply(
            "🔒 **Bantuan belum tersedia!**\n\n" +
              `⏳ Tunggu **${remaining} detik** lagi sebelum menggunakan \`tnhint\`.`
          );
        }

        // Cek cooldown
        if (Date.now() < game.nextHintAt) {
          const remaining = Math.ceil(
            (game.nextHintAt - Date.now()) / 1000
          );

          return msg.reply(
            "⏳ **Bantuan masih cooldown!**\n\n" +
              `Tunggu command berikut **${remaining} detik**.`
          );
        }

        // Total huruf
        const totalLetters = getLetterPositions(
          normalize(game.country.name)
        ).length;

        // Semua huruf sudah terbuka
        if (game.revealedCount >= totalLetters) {
          return msg.reply(
            "💡 **Semua huruf sudah terbuka!**\n\n" +
              "Sekarang tinggal tebak negaranya."
          );
        }

        // Buka 1 huruf
        game.revealedCount += 1;

        // Set cooldown
        game.nextHintAt = Date.now() + HINT_COOLDOWN * 1000;

        // Kirim clue
        await msg.reply(
          getHintText(game) +
            "\n\n" +
            `⏳ Bantuan berikutnya tersedia dalam **${HINT_COOLDOWN} detik**.`
        );

        // Start countdown
        startHintCountdown(msg.channel, game);
        return;
      }

      // ===================================
      // BUKAN COMMAND TEBAK NEGARA
      // ===================================
      if (!COMMANDS.has(command)) return;

      // ===================================
      // CEK GAME LAIN
      // ===================================
      if (GLOBAL_LOCK[gid]) {
        return msg.reply(
          "🎮 **Masih ada game yang sedang berlangsung!**\n\n" +
            "Selesaikan game yang sedang aktif terlebih dahulu."
        );
      }

      // ===================================
      // CEK REGISTER
      // ===================================
      if (!Object.hasOwn(data, uid)) {
        return msg.reply(
          "❌ Kamu belum terdaftar.\n" +
            "Ketik **reg** terlebih dahulu."
        );
      }

      // ===================================
      // LOCK SERVER
      // ===================================
      GLOBAL_LOCK[gid] = true;

      // ===================================
      // AMBIL DATABASE
      // ===================================
      let countries;

      try {
        countries = await getCountries();
      } catch (err) {
        GLOBAL_LOCK[gid] = false;

        console.error(
          "❌ Gagal mengambil database Tebak Negara:",
          err
        );

        return msg.reply(
          "❌ Gagal mengambil database negara.\n" +
            "Silakan coba lagi."
        );
      }

      // ===================================
      // RANDOM SOAL
      // ===================================
      const country = randomCountry(countries);
      const correctAnswer = normalize(country.name);

      // ===================================
      // STATE GAME
      // ===================================
      const game = {
        country,
        correctAnswer,
        startedAt: Date.now(),
        revealedCount: 0,
        nextHintAt: Date.now() + FIRST_HINT_DELAY * 1000,
        solved: false,
        collector: null
      };

      // Simpan active game
      activeGames.set(gid, game);

      // ===================================
      // KIRIM SOAL
      // ===================================
      try {
        await msg.channel.send({
          content:
            "🌍 **TEBAK NEGARA**\n\n" +
            "Tebak negara berdasarkan bendera di bawah!\n\n" +
            "💰 Hadiah: **+100 Score**\n" +
            "❌ Salah: **tidak ada pengurangan**\n" +
            "⏰ Waktu: **Tidak terbatas**\n\n" +
            "👥 Semua member dapat menjawab.\n" +
            "🎯 Jawaban pertama yang benar memenangkan game.\n\n" +
            "💡 Bantuan: ketik **tnhint**\n" +
            "⏳ Hint pertama tersedia setelah **15 detik**.",
          files: [country.img]
        });
      } catch (err) {
        activeGames.delete(gid);
        GLOBAL_LOCK[gid] = false;

        console.error(
          "❌ Gagal mengirim soal Tebak Negara:",
          err
        );

        return;
      }

      // ===================================
      // COLLECTOR
      // ===================================
      // Tidak ada timer. Game berjalan sampai ada jawaban benar.
      // ===================================
      const collector = msg.channel.createMessageCollector({
        filter: (answerMsg) => !answerMsg.author.bot
      });

      game.collector = collector;

      // ===================================
      // HANDLE JAWABAN
      // ===================================
      collector.on("collect", async (answerMsg) => {
        try {
          // Game sudah selesai
          if (game.solved) return;

          const answer = normalize(answerMsg.content);

          // Kosong
          if (!answer) return;

          // TNHINT (jangan dianggap jawaban)
          if (answer === HINT_COMMAND) return;

          // Bukan jawaban yang benar
          if (answer !== correctAnswer) return;

          // ===================================
          // JAWABAN BENAR
          // ===================================
          const answerUserId = answerMsg.author.id;

          // Cek register
          if (!Object.hasOwn(data, answerUserId)) {
            return answerMsg.reply(
              "❌ Kamu belum terdaftar.\n" +
                "Ketik **reg** terlebih dahulu."
            );
          }

          // Guard double-check (race condition)
          if (game.solved) return;

          // Mark solved
          game.solved = true;

          // Tambah score
          if (typeof data[answerUserId].cash !== "number") {
            data[answerUserId].cash = 0;
          }

          data[answerUserId].cash += REWARD;

          // Simpan data
          saveData();

          // Stop collector
          collector.stop("correct");

          // Kirim hasil
          await answerMsg.reply(
            "🎉 **JAWABAN BENAR!**\n\n" +
              `🌍 Negara: **${game.country.name}**\n` +
              `👤 Pemenang: **${answerMsg.author.username}**\n` +
              `💰 Score: **+${REWARD}**\n` +
              `🏆 Total Score: **${data[answerUserId].cash}**`
          );
        } catch (err) {
          console.error("❌ Tebak Negara Answer Error:", err);
        }
      });

      // ===================================
      // COLLECTOR END
      // ===================================
      collector.on("end", (collected, reason) => {
        // Tandai selesai
        game.solved = true;

        // Hapus active game
        activeGames.delete(gid);

        // Buka lock
        GLOBAL_LOCK[gid] = false;

        console.log(
          reason === "correct"
            ? `✅ Tebak Negara selesai di ${msg.guild.name}`
            : `⚠️ Tebak Negara collector berhenti di ${msg.guild.name}`
        );
      });

    } catch (err) {
      console.error("❌ Tebak Negara Error:", err);

      // Cleanup
      if (msg.guild?.id) {
        const gid = msg.guild.id;
        GLOBAL_LOCK[gid] = false;
        activeGames.delete(gid);
      }
    }
  });
};