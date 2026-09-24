// =========================================
// commands/tebakmusik.js
// GAME TEBAK MUSIK — Versi Fixed
// =========================================
//
// Fitur:
// - Command: tmsk1, tebakmusik1, tmusik1, tbkmusik1, tebakmsk1
// - Hint command: tmskhint
// - Hint pertama tersedia setelah 15 detik
// - Cooldown antar hint: 10 detik
// - Reward: +100 Score
// - Waktu: Tidak terbatas
// - Support trim audio jika > 15 MB
// =========================================

const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// =========================================
// KONFIGURASI
// =========================================

const DATA_URL = process.env.MUSIC_DATA_URL || "";

const REWARD = 100;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_AUDIO_DURATION = 45; // detik
const HTTP_TIMEOUT = 30000; // 30 detik
const MAX_ATTEMPT = 5; // retry saat download gagal

// =========================================
// COMMANDS
// =========================================

const COMMANDS = new Set([
  "tmsk1",
  "tebakmusik1",
  "tmusik1",
  "tbkmusik1",
  "tebakmsk1"
]);

const HINT_COMMAND = "tmskhint";

const HINT_FIRST_DELAY = 15 * 1000; // 15 detik
const HINT_COOLDOWN = 10 * 1000;    // 10 detik

// =========================================
// STATE
// =========================================

const activeGames = new Map();

let musicCache = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 menit

// =========================================
// DETEKSI FFMPEG
// =========================================

let FFMPEG_PATH = null;

try {
  FFMPEG_PATH = require("ffmpeg-static");

  if (FFMPEG_PATH && fs.existsSync(FFMPEG_PATH)) {
    console.log(`✅ ffmpeg-static terdeteksi: ${FFMPEG_PATH}`);
  } else {
    FFMPEG_PATH = null;
  }
} catch (err) {
  console.log("⚠️ ffmpeg-static tidak tersedia.");
}

// =========================================
// FETCH JSON
// =========================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "Discord-TebakMusik-Bot",
          Accept: "application/json"
        }
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          return fetchJSON(res.headers.location).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        });
        res.on("error", reject);
      }
    );

    req.setTimeout(HTTP_TIMEOUT, () => {
      req.destroy(new Error("Request JSON timeout"));
    });
    req.on("error", reject);
  });
}

// =========================================
// NORMALIZE MUSIC ITEM
// =========================================

function normalizeMusicItem(item) {
  if (!item || typeof item !== "object") return null;

  const judul = typeof item.judul === "string" ? item.judul.trim() : "";
  const artis = typeof item.artis === "string" ? item.artis.trim() : "";
  const lagu = typeof item.lagu === "string" ? item.lagu.trim() : "";

  if (!judul || !artis || !lagu) return null;
  if (!lagu.startsWith("http")) return null;

  return { judul, artis, lagu };
}

// =========================================
// GET DATABASE MUSIK
// =========================================

async function getMusicData() {
  if (!DATA_URL) {
    throw new Error(
      "MUSIC_DATA_URL belum dikonfigurasi di .env"
    );
  }

  const now = Date.now();

  if (
    Array.isArray(musicCache) &&
    musicCache.length > 0 &&
    now - cacheTime < CACHE_DURATION
  ) {
    return musicCache;
  }

  console.log("📥 Mengambil database Tebak Musik...");

  const json = await fetchJSON(DATA_URL);

  if (!Array.isArray(json)) {
    throw new Error("Format database tidak valid (bukan array).");
  }

  const valid = json.map(normalizeMusicItem).filter(Boolean);

  if (!valid.length) {
    throw new Error("Tidak ada data musik yang valid.");
  }

  // Deduplikasi berdasarkan judul+artis+url
  const unique = [];
  const seen = new Set();

  for (const item of valid) {
    const key = `${item.judul.toLowerCase()}|${item.artis.toLowerCase()}|${item.lagu}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  musicCache = unique;
  cacheTime = now;

  console.log(`🎵 Database Tebak Musik: ${unique.length} lagu unik`);

  return unique;
}

// =========================================
// RANDOM MUSIC
// =========================================

function randomMusic(musics) {
  return musics[Math.floor(Math.random() * musics.length)];
}

// =========================================
// NORMALIZE JAWABAN
// =========================================

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"`''""]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// =========================================
// HINT — HITUNG TOTAL HURUF
// =========================================

function getTotalLetters(title) {
  return String(title || "").replace(/[^a-zA-Z]/g, "").length;
}

// =========================================
// HINT — BUAT CLUE PROGRESSIVE
// =========================================
// Buka 1 huruf vokal per hint (kalau tidak ada vokal, pakai konsonan)
// =========================================

function buildProgressiveHint(title, revealedCount) {
  const normalized = String(title || "");
  const letterPositions = [];

  // Kumpulkan posisi huruf vokal
  for (let i = 0; i < normalized.length; i++) {
    if (/[aiueoAIUEO]/.test(normalized[i])) {
      letterPositions.push(i);
    }
  }

  // Kalau tidak ada vokal, fallback ke semua huruf
  if (letterPositions.length === 0) {
    for (let i = 0; i < normalized.length; i++) {
      if (/[a-zA-Z]/.test(normalized[i])) {
        letterPositions.push(i);
      }
    }
  }

  const revealed = new Set(letterPositions.slice(0, revealedCount));

  let result = "";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === " ") {
      result += "  ";
      continue;
    }

    if (revealed.has(i)) {
      result += char.toUpperCase();
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      result += "_";
      continue;
    }

    result += char;
  }

  return result;
}

// =========================================
// HINT — FORMAT EMBED
// =========================================

function getHintText(game) {
  const totalLetters = getTotalLetters(game.music.judul);
  const clue = buildProgressiveHint(game.music.judul, game.revealedCount);

  return (
    "💡 **CLUE TEBAK MUSIK**\n\n" +
    `\`${clue}\`\n\n` +
    `🔓 Huruf terbuka: **${game.revealedCount}/${totalLetters}**`
  );
}

// =========================================
// EXEC FILE ASYNC
// =========================================

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

// =========================================
// DOWNLOAD AUDIO BUFFER
// =========================================

function downloadAudioBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error("Terlalu banyak redirect."));
    }

    const lib = url.startsWith("https") ? https : http;

    let req;

    try {
      req = lib.get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            Accept: "audio/*,*/*"
          }
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return downloadAudioBuffer(res.headers.location, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          const chunks = [];
          let size = 0;
          let destroyed = false;

          res.on("data", (c) => {
            if (destroyed) return;
            size += c.length;
            if (size > 30 * 1024 * 1024) {
              destroyed = true;
              req.destroy(new Error("Audio terlalu besar (>30MB)"));
              return;
            }
            chunks.push(c);
          });

          res.on("end", () => {
            if (destroyed) return;
            if (size <= 0) return reject(new Error("Audio kosong."));
            resolve(Buffer.concat(chunks));
          });

          res.on("error", (err) => {
            if (destroyed) return;
            destroyed = true;
            reject(err);
          });
        }
      );
    } catch (err) {
      return reject(err);
    }

    req.setTimeout(60000, () => req.destroy(new Error("Download timeout")));
    req.on("error", reject);
  });
}

// =========================================
// TRIM AUDIO (jika > MAX_AUDIO_SIZE)
// =========================================

async function trimAudioIfNeeded(buffer) {
  if (buffer.length <= MAX_AUDIO_SIZE) {
    return { buffer, ext: "mp3", trimmed: false };
  }

  if (!FFMPEG_PATH) {
    throw new Error(
      `Audio terlalu besar (${(buffer.length / 1024 / 1024).toFixed(2)}MB) dan FFmpeg tidak tersedia.`
    );
  }

  console.log(
    `✂️ Audio ${(buffer.length / 1024 / 1024).toFixed(2)}MB > 15MB, memotong...`
  );

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "tebakmusik-trim-")
  );

  const inputPath = path.join(tempDir, "input.mp3");
  const outputPath = path.join(tempDir, "output.mp3");

  try {
    await fs.promises.writeFile(inputPath, buffer);

    await execFileAsync(
      FFMPEG_PATH,
      [
        "-y",
        "-i", inputPath,
        "-t", String(MAX_AUDIO_DURATION),
        "-acodec", "libmp3lame",
        "-b:a", "96k",
        "-ar", "44100",
        outputPath
      ],
      { timeout: 60000 }
    );

    const stat = await fs.promises.stat(outputPath);

    if (stat.size <= 0) {
      throw new Error("Hasil trim kosong.");
    }

    if (stat.size > MAX_AUDIO_SIZE) {
      throw new Error(
        `Setelah dipotong masih terlalu besar (${(stat.size / 1024 / 1024).toFixed(2)}MB).`
      );
    }

    const trimmed = await fs.promises.readFile(outputPath);

    console.log(
      `✅ Audio dipotong: ${(buffer.length / 1024 / 1024).toFixed(2)}MB → ${(trimmed.length / 1024 / 1024).toFixed(2)}MB`
    );

    return { buffer: trimmed, ext: "mp3", trimmed: true };
  } finally {
    await fs.promises
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => {});
  }
}

// =========================================
// PREPARE AUDIO
// =========================================

async function prepareAudio(music) {
  const rawBuffer = await downloadAudioBuffer(music.lagu);
  const result = await trimAudioIfNeeded(rawBuffer);
  return result;
}

// =========================================
// COUNTDOWN HINT PERTAMA
// =========================================

async function runFirstHintCountdown(channel, game) {
  if (game.solved || game.firstCountdownRunning) return;
  game.firstCountdownRunning = true;

  try {
    let countdownMessage = null;

    while (!game.solved && Date.now() < game.nextHintAt) {
      const seconds = Math.max(
        1,
        Math.ceil((game.nextHintAt - Date.now()) / 1000)
      );

      const content =
        "🔒 **Bantuan belum tersedia**\n\n" +
        `Tunggu **${seconds} detik** untuk menggunakan \`tmskhint\``;

      try {
        if (!countdownMessage) {
          countdownMessage = await channel.send(content);
        } else {
          await countdownMessage.edit(content);
        }
      } catch (err) {
        console.error(
          "❌ Gagal update countdown awal Tebak Musik:",
          err.message
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (game.solved) return;

    if (countdownMessage) {
      try {
        await countdownMessage.edit(
          "✅ **Bantuan tersedia!**\n\nKetik **tmskhint** untuk membuka 1 huruf."
        );
      } catch (err) {
        console.error(
          "❌ Gagal update status countdown awal Tebak Musik:",
          err.message
        );
      }
    }
  } finally {
    game.firstCountdownRunning = false;
  }
}

// =========================================
// COUNTDOWN HINT BERIKUTNYA
// =========================================

async function runHintCountdown(channel, game) {
  if (game.solved || game.countdownRunning) return;
  game.countdownRunning = true;

  try {
    let countdownMessage = null;

    while (!game.solved && Date.now() < game.nextHintAt) {
      const seconds = Math.max(
        1,
        Math.ceil((game.nextHintAt - Date.now()) / 1000)
      );

      const content =
        "⏳ **Bantuan berikutnya**\n\n" +
        `Tunggu command berikut **${seconds} detik**`;

      try {
        if (!countdownMessage) {
          countdownMessage = await channel.send(content);
        } else {
          await countdownMessage.edit(content);
        }
      } catch (err) {
        console.error(
          "❌ Gagal update countdown Tebak Musik:",
          err.message
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (game.solved) return;

    if (countdownMessage) {
      try {
        await countdownMessage.edit(
          "✅ **Bantuan tersedia!**\n\nKetik **tmskhint** untuk membuka 1 huruf lagi."
        );
      } catch (err) {
        console.error(
          "❌ Gagal update status countdown Tebak Musik:",
          err.message
        );
      }
    }
  } finally {
    game.countdownRunning = false;
  }
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = function tebakMusik(client, data, saveData, GLOBAL_LOCK) {
  // Anti-duplicate load
  if (client.__tebakMusikLoaded) {
    console.warn("⚠️ tebakMusik sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__tebakMusikLoaded = true;

  console.log("🎵 Module Tebak Musik dimuat.");

  // Cek MUSIC_DATA_URL
  if (!DATA_URL) {
    console.warn(
      "⚠️ MUSIC_DATA_URL belum dikonfigurasi, Tebak Musik tidak akan berfungsi."
    );
  }

  client.on("messageCreate", async (msg) => {
    try {
      if (msg.author?.bot) return;
      if (!msg.guild) return;

      const command = String(msg.content || "").trim().toLowerCase();
      const gid = msg.guild.id;
      const uid = msg.author.id;

      // =================================
      // HINT
      // =================================
      if (command === HINT_COMMAND) {
        const game = activeGames.get(gid);

        if (!game || game.solved) {
          return msg.reply(
            "❌ Tidak ada game **Tebak Musik** yang sedang berlangsung."
          );
        }

        const elapsed = Date.now() - game.startedAt;

        if (elapsed < HINT_FIRST_DELAY) {
          const remaining = Math.ceil(
            (HINT_FIRST_DELAY - elapsed) / 1000
          );
          return msg.reply(
            "🔒 **Bantuan belum tersedia!**\n\n" +
              `⏳ Tunggu **${remaining} detik** lagi sebelum menggunakan \`tmskhint\`.`
          );
        }

        if (Date.now() < game.nextHintAt) {
          const remaining = Math.ceil(
            (game.nextHintAt - Date.now()) / 1000
          );
          return msg.reply(
            "⏳ **Bantuan masih cooldown!**\n\n" +
              `Tunggu command berikut **${remaining} detik**.`
          );
        }

        const totalLetters = getTotalLetters(game.music.judul);

        if (game.revealedCount >= totalLetters) {
          return msg.reply(
            "💡 **Semua huruf sudah terbuka!**\n\nSekarang tinggal tebak lagunya."
          );
        }

        game.revealedCount += 1;
        game.nextHintAt = Date.now() + HINT_COOLDOWN;

        await msg.reply(
          getHintText(game) +
            "\n\n⏳ Bantuan berikutnya tersedia dalam **10 detik**."
        );

        runHintCountdown(msg.channel, game);
        return;
      }

      // =================================
      // CEK COMMAND
      // =================================
      if (!COMMANDS.has(command)) return;

      // =================================
      // CEK DATA_URL
      // =================================
      if (!DATA_URL) {
        return msg.reply(
          "❌ **MUSIC_DATA_URL** belum dikonfigurasi.\n" +
            "Silakan hubungi administrator bot."
        );
      }

      // =================================
      // CEK GAME LAIN
      // =================================
      if (GLOBAL_LOCK[gid]) {
        return msg.reply(
          "🎮 **Masih ada game yang sedang berlangsung!**\n\n" +
            "Selesaikan game yang sedang aktif terlebih dahulu."
        );
      }

      // =================================
      // CEK REGISTER
      // =================================
      if (!Object.hasOwn(data, uid)) {
        return msg.reply(
          "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu."
        );
      }

      // =================================
      // LOCK
      // =================================
      GLOBAL_LOCK[gid] = true;

      // =================================
      // AMBIL DATABASE
      // =================================
      let musics;

      try {
        musics = await getMusicData();
      } catch (err) {
        GLOBAL_LOCK[gid] = false;
        console.error("❌ Gagal ambil database Tebak Musik:", err.message);
        return msg.reply(
          "❌ Gagal mengambil database musik.\nSilakan coba lagi."
        );
      }

      // =================================
      // RETRY DOWNLOAD
      // =================================
      let music, correctAnswer, audioResult;
      let lastError = null;
      let success = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
        music = randomMusic(musics);
        correctAnswer = normalize(music.judul);

        console.log(
          `🎵 [Attempt ${attempt}/${MAX_ATTEMPT}] "${music.judul}" - ${music.artis}`
        );

        try {
          audioResult = await prepareAudio(music);
          success = true;
          break;
        } catch (err) {
          lastError = err;
          console.warn(`⚠️ [Attempt ${attempt}] Gagal: ${err.message}`);
        }
      }

      if (!success) {
        GLOBAL_LOCK[gid] = false;
        console.error(
          `❌ Gagal setelah ${MAX_ATTEMPT} attempt. Error:`,
          lastError?.message
        );
        return msg.reply(
          `❌ Gagal mengambil audio setelah ${MAX_ATTEMPT} percobaan.\n\n` +
            "Silakan coba `tmsk1` lagi."
        );
      }

      // =================================
      // STATE
      // =================================
      const now = Date.now();

      const game = {
        music,
        correctAnswer,
        solved: false,
        collector: null,
        channelId: msg.channel.id,
        startedBy: uid,
        gameId: `${gid}-${now}`,
        startedAt: now,
        nextHintAt: now + HINT_FIRST_DELAY,
        revealedCount: 0,
        countdownRunning: false,
        firstCountdownRunning: false
      };

      activeGames.set(gid, game);

      // =================================
      // KIRIM SOAL
      // =================================
      try {
        const trimInfo = audioResult.trimmed
          ? " ✂️ (dipotong 45 detik)"
          : "";

        await msg.channel.send({
          content:
            "🎵 **TEBAK MUSIK**\n\n" +
            `🎤 Penyanyi: **${music.artis}**${trimInfo}\n\n` +
            "🎧 Dengarkan lagu di bawah ini!\n\n" +
            "💰 Hadiah: **+100 Score**\n" +
            "❌ Salah: **tidak ada pengurangan**\n" +
            "⏰ Waktu: **Tidak terbatas**\n\n" +
            "👥 Semua member dapat menjawab.\n" +
            "🎯 Jawaban pertama yang benar memenangkan game.\n\n" +
            "💡 Bantuan: ketik **tmskhint**\n" +
            "⏳ Hint pertama tersedia setelah **15 detik**.",
          files: [
            {
              attachment: audioResult.buffer,
              name: `tebakmusik.${audioResult.ext || "mp3"}`
            }
          ]
        });
      } catch (err) {
        activeGames.delete(gid);
        GLOBAL_LOCK[gid] = false;
        console.error("❌ Gagal kirim audio Tebak Musik:", err.message);
        return msg.reply("❌ Gagal mengirim audio musik.");
      }

      // =================================
      // COUNTDOWN HINT PERTAMA
      // =================================
      runFirstHintCountdown(msg.channel, game);

      // =================================
      // COLLECTOR
      // =================================
      const collector = msg.channel.createMessageCollector({
        filter: (answerMsg) => !answerMsg.author.bot
      });

      game.collector = collector;

      collector.on("collect", async (answerMsg) => {
        try {
          if (game.solved) return;

          const answer = normalize(answerMsg.content);
          if (!answer) return;
          if (answer === HINT_COMMAND) return;
          if (answer !== correctAnswer) return;

          const winnerId = answerMsg.author.id;

          if (!Object.hasOwn(data, winnerId)) {
            return answerMsg.reply(
              "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu."
            );
          }

          // Guard double-check
          if (game.solved) return;
          game.solved = true;

          if (typeof data[winnerId].cash !== "number") {
            data[winnerId].cash = 0;
          }

          data[winnerId].cash += REWARD;
          saveData();

          collector.stop("correct");

          await answerMsg.reply(
            "🎉 **JAWABAN BENAR!**\n\n" +
              `🎵 Lagu: **${game.music.judul}**\n` +
              `🎤 Penyanyi: **${game.music.artis}**\n` +
              `👑 Pemenang: **${answerMsg.author.username}**\n` +
              `💰 Score: **+${REWARD}**\n` +
              `🏆 Total Score: **${data[winnerId].cash}**`
          );
        } catch (err) {
          console.error("❌ Tebak Musik Answer Error:", err.message);
        }
      });

      collector.on("end", () => {
        activeGames.delete(gid);
        GLOBAL_LOCK[gid] = false;

        console.log(
          game.solved
            ? `✅ Tebak Musik selesai di ${msg.guild.name}`
            : `⚠️ Collector Tebak Musik berhenti di ${msg.guild.name}`
        );
      });
    } catch (err) {
      console.error("❌ Tebak Musik Error:", err.message);

      if (msg.guild?.id) {
        const gid = msg.guild.id;
        GLOBAL_LOCK[gid] = false;
        activeGames.delete(gid);
      }
    }
  });
};