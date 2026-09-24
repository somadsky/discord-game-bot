// =========================================
// index.js — MAIN BOT FILE
// =========================================
// File utama bot yang menginisialisasi client Discord,
// memuat semua modul game, dan menangani command inti.
// =========================================

require("dotenv").config();

// =========================================
// VALIDASI ENVIRONMENT VARIABLE
// =========================================
if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === "your_discord_bot_token_here") {
  console.error("❌ BOT_TOKEN belum dikonfigurasi.");
  console.error("");
  console.error("Langkah perbaikan:");
  console.error("  1. Salin file .env.example menjadi .env");
  console.error("     Windows  : copy .env.example .env");
  console.error("     Linux/Mac: cp .env.example .env");
  console.error("  2. Buka file .env dan isi BOT_TOKEN dengan token bot Discord Anda");
  console.error("  3. Jalankan kembali: npm start");
  console.error("");
  process.exit(1);
}

// Cek sodium-native untuk voice encryption
try {
  require("sodium-native");
  console.log("🔐 sodium-native aktif");
} catch (e) {
  console.log("⚠️ sodium-native tidak tersedia, voice bisa bermasalah");
}

(async () => {
  // =========================================
  // IMPORT DEPENDENCY
  // =========================================
  const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder
  } = require("discord.js");

  const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState
  } = require("@discordjs/voice");

  const fs = require("fs");
  const path = require("path");
  const config = require("./config");

  // =========================================
  // IMPORT MODUL EKSTERNAL
  // =========================================
  const memberLogger = require("./memberLogger");
  const confessionSystem = require("./confession");

  // =========================================
  // KONSTANTA KONFIGURASI
  // =========================================
  const VOICE_ADMIN_IDS = config.voiceAdminIds;
  const MINORITY_ROLE_ID = config.minorityRoleId;
  const PROTECTED_USER_IDS = config.protectedUserIds;
  const MUSIC_ALLOWED_CHANNEL_ID = config.musicAllowedChannelId;
  const GAME_ALLOWED_CHANNEL_IDS = config.gameAllowedChannelIds;
  const JOCKIE_BOT_IDS = config.jockieBotIds;
  const GAME_BOT_IDS = config.gameBotIds;

  const MUSIC_WARNING =
    "🎵 Gunakan channel musik yang dikonfigurasi oleh administrator server.";

  const GAME_WARNING =
    "🐺 Gunakan channel game yang dikonfigurasi oleh administrator server.";

  // =========================================
  // DATA DIR & FILE
  // =========================================
  const DATA_DIR = path.join(__dirname, "runtime");
  const DATA_FILE = path.join(DATA_DIR, "data.json");

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SPAM = 1000;

  // =========================================
  // CLIENT DISCORD
  // =========================================
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  // =========================================
  // REGISTER MODUL BANTU
  // =========================================
  memberLogger(client, {
    welcomeChannelId: config.welcomeChannelId,
    leaveChannelId: config.leaveChannelId,
    footerText: config.footerText
  });

  confessionSystem(client);

  // =========================================
  // DATA STORE (Score & User)
  // =========================================
  let data = {};

  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
      data = {};
    }
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
  }

  function saveData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("❌ Gagal menyimpan data:", err.message);
    }
  }

  function userExists(id) {
    return Object.hasOwn(data, id);
  }

  function createUser(id) {
    data[id] = { cash: 0 };
    saveData();
  }

  function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // =========================================
  // GLOBAL LOCK PER SERVER
  // =========================================
  // Mencegah lebih dari satu game aktif di server yang sama.
  // =========================================
  const GLOBAL_LOCK = {};

  function initLock(gid) {
    if (!GLOBAL_LOCK[gid]) GLOBAL_LOCK[gid] = false;
  }

  // =========================================
  // REGISTER MODUL GAME
  // =========================================
  // Semua modul di bawah ini punya listener messageCreate sendiri
  // dan tidak melalui guard FITUR_BOT di index.js.
  // =========================================
  const monthlyReset = require("./monthlyReset");
  const profileCommand = require("./profileCommand");
  const cerdasCermat = require("./commands/cc1");
  const cerdasCermat2 = require("./commands/cc2");
  const family100 = require("./commands/family100");
  const cekSertif = require("./commands/ceksertif");
  const { initMarketBot } = require("./bot");
  const sambungKata = require("./commands/sambungkata");
  const tebakGambar = require("./commands/tebakgambar");
  const tebakMusik = require("./commands/tebakmusik");
  const tebakNegara = require("./commands/tebaknegara");
  const werewolf = require("./werewolf");

  // Inisialisasi modul
  monthlyReset(client, data, saveData);
  profileCommand(client, data);
  cekSertif(client, data, saveData);
  cerdasCermat(client, data, saveData);
  cerdasCermat2(client, data, saveData);
  family100(client, data, saveData);
  sambungKata(client, data, saveData);
  werewolf(client, data, saveData);
  tebakGambar(client, data, saveData, GLOBAL_LOCK);
  tebakMusik(client, data, saveData, GLOBAL_LOCK);
  tebakNegara(client, data, saveData, GLOBAL_LOCK);

  // =========================================
  // ANTI-SPAM
  // =========================================
  const cooldown = new Map();

  function isSpam(id) {
    const last = cooldown.get(id) || 0;
    return Date.now() - last < SPAM;
  }

  function setSpam(id) {
    cooldown.set(id, Date.now());
  }

  // =========================================
  // DAFTAR FITUR (untuk command "fitur")
  // =========================================
  // Ini adalah daftar untuk command "fitur", bukan guard.
  // =========================================
  const FITUR_BOT = [
    // Informasi
    "reg", "profile", "prf", "scr", "leaderboard", "fitur", "help1",

    // Game edukasi
    "mtk1", "mtk2", "mtk3", "fsk1", "cc1", "cc2", "scc1", "scc2", "ff100",

    // Game sosial
    "wolf1",
    "sk1", "joinsk1", "startsk1",

    // Game tebak-tebakan
    "gambar1", "tnegara1", "tnhint", "tmsk1", "tmskhint",

    // Admin voice
    "join1", "leave1",

    // Confession
    "confession", "confess",

    // Sertifikat (owner)
    "csrf"
  ];

  function logFeature(commandName) {
    console.log(`Fitur ${commandName} aktif!`);
  }

  // =========================================
  // TEXT HELPER
  // =========================================
  function getMessageFullText(msg) {
    const content = msg.content || "";

    const embedText =
      msg.embeds
        ?.map((e) => {
          const fieldsText =
            e.fields?.map((f) => `${f.name || ""} ${f.value || ""}`).join(" ") ||
            "";

          return [
            e.title,
            e.description,
            e.footer?.text,
            e.author?.name,
            fieldsText,
            e.url,
            e.image?.url,
            e.thumbnail?.url
          ]
            .filter(Boolean)
            .join(" ");
        })
        .join(" ") || "";

    return `${content} ${embedText}`.toLowerCase();
  }

  // =========================================
  // ANTI KOYAPP (hapus command avatar ke user terlindungi)
  // =========================================
  const pendingAvatarRequest = new Map();

  async function antiKoyappAvatar(msg) {
    try {
      if (!msg || !msg.guild) return false;

      const channelId = msg.channel.id;

      // USER command
      if (!msg.author?.bot) {
        const content = (msg.content || "").trim().toLowerCase();

        const isKoyappCommand =
          content === "koyapp" ||
          content.startsWith("koyapp ") ||
          content === "koya" ||
          content.startsWith("koya ");

        if (!isKoyappCommand) return false;

        let targetUserId = null;

        for (const pid of PROTECTED_USER_IDS) {
          const mentionTarget =
            msg.mentions?.users?.has(pid) ||
            content.includes(`<@${pid}>`) ||
            content.includes(`<@!${pid}>`) ||
            content.includes(pid);

          if (mentionTarget) {
            targetUserId = pid;
            break;
          }
        }

        if (!targetUserId) return false;

        if (msg.deletable) {
          await msg.delete().catch(() => null);
          console.log(
            `🗑️ Anti koyapp: command dihapus dari ${msg.author?.tag || "unknown"}`
          );
        }

        pendingAvatarRequest.set(channelId, targetUserId);
        return true;
      }

      // BOT reply
      if (msg.author?.bot) {
        if (!pendingAvatarRequest.has(channelId)) return false;

        const targetUserId = pendingAvatarRequest.get(channelId);
        if (!PROTECTED_USER_IDS.has(targetUserId)) return false;

        const hasAvatarContent =
          msg.attachments?.size > 0 ||
          msg.embeds?.some((e) => e.image?.url || e.thumbnail?.url);

        if (!hasAvatarContent) return false;

        if (msg.deletable) {
          await msg.delete().catch(() => null);
          console.log(
            `🗑️ Anti koyapp: balasan bot dihapus (target ${targetUserId})`
          );
        } else {
          console.log(
            "⚠️ Anti koyapp terdeteksi, tapi bot tidak punya izin hapus pesan."
          );
        }

        pendingAvatarRequest.delete(channelId);
        return true;
      }

      return false;
    } catch (err) {
      console.log("❌ Error antiKoyappAvatar:", err.message);
      return false;
    }
  }

  // =========================================
  // CHANNEL RESTRICTION (music & game bot)
  // =========================================
  function isJockieMusicMessage(msg) {
    const authorName =
      `${msg.author?.username || ""} ${msg.author?.tag || ""}`.toLowerCase();
    const content = (msg.content || "").toLowerCase().trim();
    const fullText = getMessageFullText(msg);

    const isJockieBot =
      JOCKIE_BOT_IDS.has(msg.author?.id) ||
      authorName.includes("jockie") ||
      authorName.includes("jockie music");

    const musicCommands = [
      "m!", "j!", "!play", "!p", "/play", "/p",
      "-play", "-p", ".play", ".p", "?play", "?p",
      "play", "p"
    ];

    const hasMusicCommand = musicCommands.some(
      (cmd) => content === cmd || content.startsWith(cmd + " ")
    );

    const hasMusicBotText =
      fullText.includes("now playing") ||
      fullText.includes("added to queue") ||
      fullText.includes("track added") ||
      fullText.includes("queued") ||
      fullText.includes("queue") ||
      fullText.includes("jockie music");

    return isJockieBot || hasMusicCommand || hasMusicBotText;
  }

  function isOwoOrHarukaMessage(msg) {
    const authorName =
      `${msg.author?.username || ""} ${msg.author?.tag || ""}`.toLowerCase();
    const content = (msg.content || "").toLowerCase().trim();
    const fullText = getMessageFullText(msg);

    const isGameBot =
      GAME_BOT_IDS.has(msg.author?.id) ||
      authorName.includes("owo") ||
      authorName.includes("haruka");

    const shortGameCommands = ["wh", "wb", "h", "h!", "owo", "owoh", "owob"];

    const hasShortCommand = shortGameCommands.some(
      (cmd) => content === cmd || content.startsWith(cmd + " ")
    );

    const longGameCommands = [
      "owo hunt", "owo battle", "owo cf", "owo pray", "owo daily",
      "owo cowoncy", "owo profile", "owo zoo", "owo inv", "owo sell",
      "owo use", "owo team", "owo weapon", "owo quest", "owo cash",
      "owohunt", "owobattle", "owocf", "haruka",
      "/hunt", "/battle", "/daily", "/profile", "/pray", "/cash"
    ];

    const hasLongCommand = longGameCommands.some(
      (cmd) => content === cmd || content.startsWith(cmd + " ")
    );

    const hasGameBotText =
      fullText.includes("cowoncy") ||
      fullText.includes("owo") ||
      fullText.includes("hunt") ||
      fullText.includes("battle") ||
      fullText.includes("haruka") ||
      fullText.includes("zoo") ||
      fullText.includes("weapon") ||
      fullText.includes("pray");

    return isGameBot || hasShortCommand || hasLongCommand || hasGameBotText;
  }

  const warningCooldown = new Map();

  async function sendTempWarning(channel, text, type = "default") {
    try {
      const key = `${channel.id}:${type}`;
      const now = Date.now();
      const last = warningCooldown.get(key) || 0;

      if (now - last < 5000) return;
      warningCooldown.set(key, now);

      const warningMsg = await channel.send(text).catch(() => null);

      if (warningMsg) {
        setTimeout(() => {
          warningMsg.delete().catch(() => null);
        }, 15000);
      }
    } catch {}
  }

  async function channelRestriction(msg) {
    try {
      if (!msg || !msg.guild) return false;
      if (msg.author?.id === client.user?.id) return false;

      const channelId = msg.channel.id;

      // Music restriction
      if (isJockieMusicMessage(msg)) {
        if (MUSIC_ALLOWED_CHANNEL_ID && channelId !== MUSIC_ALLOWED_CHANNEL_ID) {
          if (msg.deletable) {
            await msg.delete().catch(() => null);
          }
          await sendTempWarning(msg.channel, MUSIC_WARNING, "music");
          console.log(
            `🗑️ Music command/response salah room dihapus dari ${
              msg.author?.tag || "unknown"
            }`
          );
          return true;
        }
      }

      // Game bot restriction
      if (isOwoOrHarukaMessage(msg)) {
        if (GAME_ALLOWED_CHANNEL_IDS.size > 0 && !GAME_ALLOWED_CHANNEL_IDS.has(channelId)) {
          if (msg.deletable) {
            await msg.delete().catch(() => null);
          } else {
            console.log("⚠️ Pesan game terdeteksi, tapi tidak bisa dihapus.");
          }
          await sendTempWarning(msg.channel, GAME_WARNING, "game");
          console.log(
            `🗑️ Game command/response salah room dihapus dari ${
              msg.author?.tag || "unknown"
            } | isi: ${msg.content}`
          );
          return true;
        }
      }

      return false;
    } catch (err) {
      console.log("❌ Error channelRestriction:", err.message);
      return false;
    }
  }

  // =========================================
  // MESSAGE UPDATE HANDLER
  // =========================================
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    try {
      const msg = newMsg.partial
        ? await newMsg.fetch().catch(() => null)
        : newMsg;
      if (!msg) return;

      const deletedByAntiKoyapp = await antiKoyappAvatar(msg);
      if (deletedByAntiKoyapp) return;

      await channelRestriction(msg);
    } catch (err) {
      console.log("❌ Error messageUpdate moderation:", err.message);
    }
  });

  // =========================================
  // AUTO ROLE MEMBER BARU
  // =========================================
  client.on("guildMemberAdd", async (member) => {
    try {
      if (member.user.bot) return;
      if (!MINORITY_ROLE_ID) return;

      if (!member.roles.cache.has(MINORITY_ROLE_ID)) {
        await member.roles.add(MINORITY_ROLE_ID);
        console.log(`✅ Role Minoritas diberikan ke ${member.user.tag}`);
      }
    } catch (err) {
      console.log("❌ Auto Role Error:", err.message);
    }
  });

  // =========================================
  // SOAL GENERATORS
  // =========================================
  function safeEval(expr) {
    if (!/^[0-9+\-*/.() ]+$/.test(expr)) {
      throw new Error("Ekspresi tidak valid");
    }
    return Function(`"use strict"; return (${expr})`)();
  }

  function soalMTK1() {
    const a = rnd(1, 60);
    const b = rnd(1, 60);
    const c = rnd(1, 150);
    const ops = ["+", "-"];
    const op1 = ops[rnd(0, 1)];
    const op2 = ops[rnd(0, 1)];
    const q = `${a} ${op1} ${b} ${op2} ${c}`;
    const ans = safeEval(q);
    return { question: q, answer: ans, explanation: `${q} = ${ans}` };
  }

  function soalMTK2() {
    const mode = Math.random() < 0.5;

    if (mode) {
      const divisor = rnd(2, 10);
      const quotient = rnd(2, 20);
      const first = divisor * quotient;
      const b = rnd(2, 10);
      const c = rnd(2, 10);
      const op2 = Math.random() < 0.6 ? "*" : "/";
      const q = `${first} / ${b} ${op2} ${c}`;
      let ans = safeEval(q);
      if (ans % 1 !== 0) ans = Number(ans.toFixed(2));
      return {
        question: q,
        answer: ans,
        explanation: `${first} / ${b} ${op2} ${c} = ${ans}`
      };
    }

    const a = rnd(2, 20);
    const b = rnd(2, 12);
    const c = rnd(2, 10);
    const q = `${a} * ${b} / ${c}`;
    let ans = safeEval(q);
    if (ans % 1 !== 0) ans = Number(ans.toFixed(2));
    return {
      question: q,
      answer: ans,
      explanation: `${a} * ${b} / ${c} = ${ans}`
    };
  }

  function soalMTK3() {
    const r = Math.random() < 0.5;

    if (r) {
      const a = Math.floor(Math.random() * 20 + 2);
      const b = Math.floor(Math.random() * 10 + 2);
      const question = `√${a * a} + ${b}²`;
      const answer = a + b * b;
      const explanation = `√${a * a} = ${a}, ${b}² = ${
        b * b
      }, jadi ${a} + ${b * b} = ${answer}`;
      return { question, answer, explanation };
    } else {
      const n = Math.floor(Math.random() * 300 + 2);
      const m = Math.floor(Math.random() * 15 + 5);
      const question = `√${n} - ${m}² (2 desimal)`;
      const answer = Number(Math.sqrt(n).toFixed(2)) - m * m;
      const explanation = `√${n} ≈ ${Math.sqrt(n).toFixed(
        2
      )}, ${m}² = ${m * m}, jadi ${Math.sqrt(n).toFixed(2)} - ${
        m * m
      } = ${answer}`;
      return { question, answer, explanation };
    }
  }

  function soalFSK1() {
    const types = ["force", "speed", "ep", "ek"];
    const t = types[rnd(0, 3)];

    if (t === "force") {
      const m = rnd(1, 150);
      const a = rnd(1, 20);
      const q = `Hitung F = m×a (m=${m}kg, a=${a}m/s²)`;
      const ans = m * a;
      return {
        question: q,
        answer: ans,
        explanation: `F = ${m} * ${a} = ${ans}`
      };
    }

    if (t === "speed") {
      const s = rnd(10, 1000);
      const tsec = rnd(1, 200);
      const q = `Benda menempuh ${s}m dalam ${tsec}s. Hitung kecepatan.`;
      const ans = Number((s / tsec).toFixed(2));
      return {
        question: q,
        answer: ans,
        explanation: `Kecepatan = ${s} / ${tsec} = ${ans}`
      };
    }

    if (t === "ep") {
      const m = rnd(1, 100);
      const h = rnd(1, 50);
      const q = `Hitung EP = m×10×h (m=${m}, h=${h})`;
      const ans = m * 10 * h;
      return {
        question: q,
        answer: ans,
        explanation: `EP = ${m} * 10 * ${h} = ${ans}`
      };
    }

    const m2 = rnd(1, 100);
    const v = rnd(1, 30);
    const q = `Hitung EK = 1/2×m×v² (m=${m2}, v=${v})`;
    const ans = Number((0.5 * m2 * v * v).toFixed(2));
    return {
      question: q,
      answer: ans,
      explanation: `EK = 0.5 * ${m2} * ${v}² = ${ans}`
    };
  }

  // =========================================
  // MESSAGE HANDLER UTAMA
  // =========================================
  // Guard FITUR_BOT hanya berlaku untuk command yang
  // di-handle langsung di file ini (reg, scr, leaderboard, dst).
  //
  // Command game (cc1, cc2, ff100, sk1, wolf1, gambar1, tmsk1,
  // tnegara1) di-handle oleh modul masing-masing dan TIDAK melalui
  // guard FITUR_BOT di sini.
  // =========================================
  client.on("messageCreate", async (msg) => {
    try {
      // Anti koyapp paling atas
      const deletedByAntiKoyapp = await antiKoyappAvatar(msg);
      if (deletedByAntiKoyapp) return;

      // Channel restriction
      const deletedByChannelRestriction = await channelRestriction(msg);
      if (deletedByChannelRestriction) return;

      if (msg.author.bot) return;

      const parts = msg.content.trim().split(/ +/);
      const cmd = parts.shift()?.toLowerCase();
      const uid = msg.author.id;
      const gid = msg.guild?.id;

      // ===================================
      // VOICE COMMANDS (ADMIN)
      // ===================================
      if (cmd === "join1") {
        if (!VOICE_ADMIN_IDS.has(msg.author.id)) {
          return msg.reply("⛔ Command ini khusus admin.");
        }

        const voiceChannel = msg.member?.voice?.channel;
        if (!voiceChannel) {
          return msg.reply("Masuk voice channel dulu.");
        }

        try {
          const old = getVoiceConnection(msg.guild.id);
          if (old) old.destroy();

          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: msg.guild.id,
            adapterCreator: msg.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
          });

          connection.on("error", (error) => {
            console.error("❌ Voice connection error:", error);
          });

          connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5000)
              ]);
            } catch (error) {
              console.log("🔌 Voice disconnected, cleaning up...");
              connection.destroy();
            }
          });

          connection.on(VoiceConnectionStatus.Ready, () => {
            console.log("✅ Voice connection ready!");
          });

          return msg.reply(`🔊 Bot masuk ke **${voiceChannel.name}**`);
        } catch (error) {
          console.error("❌ Error joining voice:", error.message);
          return msg.reply(
            `❌ Gagal masuk voice: ${error.message}\n\n` +
              `**Solusi:**\n` +
              `1. Pastikan libsodium terinstall: \`npm install libsodium-wrappers\`\n` +
              `2. Atau install sodium-native: \`npm install sodium-native\`\n` +
              `3. Restart bot setelah install`
          );
        }
      }

      if (cmd === "leave1") {
        if (!VOICE_ADMIN_IDS.has(msg.author.id)) {
          return msg.reply("⛔ Command ini khusus admin.");
        }

        const conn = getVoiceConnection(msg.guild.id);
        if (!conn) return msg.reply("Bot tidak sedang di voice.");

        conn.destroy();
        return msg.reply("👋 Bot keluar dari voice channel.");
      }

      if (!cmd || !gid) return;
      initLock(gid);

      // ===================================
      // HANDLER COMMAND INTI
      // ===================================
      // Command di bawah ini di-handle langsung oleh index.js.
      // Command lain (game) di-handle oleh modul eksternal.
      // ===================================

      // -----------------------------------
      // FITUR (daftar fitur)
      // -----------------------------------
      if (cmd === "fitur") {
        const embed = new EmbedBuilder()
          .setTitle("📌 Fitur Bot Aktif")
          .setColor("#00E1FF")
          .setDescription(FITUR_BOT.map((f) => `• **${f}**`).join("\n"))
          .setFooter({ text: "Selalu update otomatis!" });

        return msg.reply({ embeds: [embed] });
      }

      // -----------------------------------
      // REG (registrasi)
      // -----------------------------------
      if (cmd === "reg") {
        if (userExists(uid)) return msg.reply("Kamu sudah terdaftar.");
        createUser(uid);
        return msg.reply("Registrasi berhasil!");
      }

      // -----------------------------------
      // Guard: user harus terdaftar
      // -----------------------------------
      if (!userExists(uid)) return msg.reply("Ketik **reg** untuk mendaftar.");

      if (isSpam(uid)) return;
      setSpam(uid);

      // -----------------------------------
      // SCR (lihat score)
      // -----------------------------------
      if (cmd === "scr") {
        return msg.reply(`Score kamu: **${data[uid].cash}** 🏅`);
      }

      // -----------------------------------
      // LEADERBOARD
      // -----------------------------------
      if (cmd === "leaderboard") {
        const top = Object.entries(data)
          .sort((a, b) => b[1].cash - a[1].cash)
          .slice(0, 10);

        if (!top.length) return msg.reply("Belum ada data.");

        let teks = "";

        for (let i = 0; i < top.length; i++) {
          const [id, obj] = top[i];
          let name = id;

          try {
            const u = await client.users.fetch(id);
            if (u) name = u.username;
          } catch {}

          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;

          teks += `${medal} **${name}** — ${obj.cash} 🏅\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle("🏆 Leaderboard Top 10")
          .setDescription(teks)
          .setColor("#FFD700")
          .setFooter({ text: `Diminta oleh ${msg.author.username}` })
          .setTimestamp();

        return msg.reply({ embeds: [embed] });
      }

      // -----------------------------------
      // HELP1
      // -----------------------------------
      if (cmd === "help1") {
        return msg.reply(
          "```\n" +
            "┌──────────────────────────────────────────────┐\n" +
            "│              ASELOLE BOT v2                  │\n" +
            "├──────────────────────────────────────────────┤\n" +
            "│ INFORMATION                                  │\n" +
            "├──────────────────┬───────────────────────────┤\n" +
            "│ reg              │ Registrasi Akun           │\n" +
            "│ profile          │ Profil Pengguna           │\n" +
            "│ scr              │ Lihat Score               │\n" +
            "│ leaderboard      │ Ranking Server            │\n" +
            "│ fitur            │ Daftar Fitur              │\n" +
            "├──────────────────┼───────────────────────────┤\n" +
            "│ GAME                                         │\n" +
            "├──────────────────┬───────────────────────────┤\n" +
            "│ wolf1            │ Werewolf                  │\n" +
            "│ sk1              │ Sambung Kata              │\n" +
            "│ joinsk1          │ Join Room                 │\n" +
            "│ startsk1         │ Mulai Permainan           │\n" +
            "│ ff100            │ Family 100                │\n" +
            "│ gambar1          │ Tebak Gambar              │\n" +
            "│ tnegara1         │ Tebak Negara              │\n" +
            "│ tmsk1            │ Tebak Musik               │\n" +
            "├──────────────────┼───────────────────────────┤\n" +
            "│ GAME EDUKASI                                 │\n" +
            "├──────────────────┼───────────────────────────┤\n" +
            "│ cc1              │ Cerdas Cermat             │\n" +
            "│ cc2              │ Cerdas Cermat Brutal      │\n" +
            "│ mtk1             │ Matematika Dasar          │\n" +
            "│ mtk2             │ Kali & Bagi               │\n" +
            "│ mtk3             │ Akar Kuadrat              │\n" +
            "│ fsk1             │ Soal Fisika               │\n" +
            "├──────────────────────────────────────────────┤\n" +
            "│ Gunakan command dengan benar.                │\n" +
            "│ Terima kasih telah menggunakan bot.          │\n" +
            "└──────────────────────────────────────────────┘\n" +
            "```"
        );
      }

      // -----------------------------------
      // MTK1
      // -----------------------------------
      if (cmd === "mtk1") {
        if (GLOBAL_LOCK[gid]) return msg.reply("Ada game lain yang aktif.");
        GLOBAL_LOCK[gid] = true;

        const { question, answer } = soalMTK1();

        await msg.channel.send(
          `Soal **MTK1**: **${question}**\nJawab dalam **10 detik**! (+50/-50)`
        );

        const collector = msg.channel.createMessageCollector({
          filter: (m) => !m.author.bot,
          time: 10000
        });

        let selesai = false;

        collector.on("collect", (m) => {
          const val = parseFloat(m.content);
          if (isNaN(val)) return;

          const id = m.author.id;
          if (!userExists(id)) return;

          if (val === answer) {
            data[id].cash += 50;
            saveData();
            m.reply("Benar! (+50)");
            selesai = true;
            collector.stop();
          } else {
            data[id].cash -= 50;
            saveData();
            m.reply("Salah. (-50)");
          }
        });

        collector.on("end", () => {
          if (!selesai) msg.channel.send(`Waktu habis! Jawaban: **${answer}**`);
          GLOBAL_LOCK[gid] = false;
        });
      }

      // -----------------------------------
      // MTK2
      // -----------------------------------
      if (cmd === "mtk2") {
        if (GLOBAL_LOCK[gid]) return msg.reply("Ada game lain yang aktif.");
        GLOBAL_LOCK[gid] = true;

        const soal = soalMTK2();
        let solved = false;

        await msg.channel.send(
          `Soal **MTK2**: **${soal.question}**\nJawab dalam **15 detik**! (+100/-100)`
        );

        const collector = msg.channel.createMessageCollector({
          filter: (m) => !m.author.bot,
          time: 15000
        });

        collector.on("collect", (m) => {
          const val = parseFloat(m.content.replace(",", "."));
          if (isNaN(val)) return;

          const id = m.author.id;
          if (!userExists(id)) return;

          const correct = Math.abs(val - Number(soal.answer)) < 0.01;

          if (correct) {
            data[id].cash += 100;
            saveData();
            m.reply("✅ Benar! (+100)");
            solved = true;
            collector.stop();
          } else {
            data[id].cash -= 100;
            saveData();
            m.reply("❌ Salah! (-100)");
          }
        });

        collector.on("end", () => {
          if (!solved) {
            msg.channel.send(
              `⏰ Waktu habis!\nJawaban: **${soal.answer}**\n\n${soal.explanation}`
            );
          }
          GLOBAL_LOCK[gid] = false;
        });
      }

      // -----------------------------------
      // MTK3
      // -----------------------------------
      if (cmd === "mtk3") {
        if (GLOBAL_LOCK[gid]) return msg.reply("Ada game lain yang aktif.");
        GLOBAL_LOCK[gid] = true;

        const soal = soalMTK3();

        await msg.channel.send(
          `Soal **MTK3**: **${soal.question}**\nJawab dalam **15 detik**! (+125 / -125)`
        );

        const collector = msg.channel.createMessageCollector({
          filter: (m) => !m.author.bot,
          time: 15000
        });

        let solved = false;

        collector.on("collect", (m) => {
          const val = parseFloat(m.content.replace(",", "."));
          if (isNaN(val)) return;

          const id = m.author.id;
          if (!userExists(id)) return;

          if (Math.abs(val - soal.answer) < 0.01) {
            data[id].cash += 125;
            saveData();
            m.reply(`✅ Benar! (+125)\n\n${soal.explanation}`);
            solved = true;
            collector.stop();
          } else {
            data[id].cash -= 125;
            saveData();
            m.reply("❌ Salah! (-125)");
          }
        });

        collector.on("end", () => {
          if (!solved) {
            msg.channel.send(
              `⏰ Waktu habis!\nJawaban: **${soal.answer}**\n\n${soal.explanation}`
            );
          }
          GLOBAL_LOCK[gid] = false;
        });
      }

      // -----------------------------------
      // FSK1
      // -----------------------------------
      if (cmd === "fsk1") {
        if (GLOBAL_LOCK[gid]) return msg.reply("Ada game lain yang aktif.");
        GLOBAL_LOCK[gid] = true;

        const q = soalFSK1();

        await msg.channel.send(
          `Soal **FSK1**: **${q.question}**\nJawab dalam **25 detik**! (+75/-75)`
        );

        const collector = msg.channel.createMessageCollector({
          filter: (m) => !m.author.bot,
          time: 25000
        });

        let solved = false;

        collector.on("collect", (m) => {
          const val = parseFloat(m.content.replace(",", "."));
          if (isNaN(val)) return;

          const id = m.author.id;
          if (!userExists(id)) return;

          const correct = Math.abs(val - Number(q.answer)) < 0.01;

          if (correct) {
            data[id].cash += 75;
            saveData();
            m.reply(`Benar! (+75)\n\n${q.explanation}`);
            solved = true;
            collector.stop();
          } else {
            data[id].cash -= 75;
            saveData();
            m.reply("Salah. (-75)");
          }
        });

        collector.on("end", () => {
          if (!solved)
            msg.channel.send(`Waktu habis! Jawaban: **${q.answer}**`);
          GLOBAL_LOCK[gid] = false;
        });
      }

    } catch (err) {
      console.error("❌ Error di messageCreate handler utama:", err);
    }
  });

  // =========================================
  // READY EVENT
  // =========================================
  client.once("ready", async () => {
    console.log(`${client.user.tag} aktif!`);
    console.log(`📊 Terhubung ke ${client.guilds.cache.size} server`);
    console.log(`👥 Melayani ${client.users.cache.size} user`);

    // Market Bot (opsional)
    if (config.marketChannelId) {
      initMarketBot(client, config.marketChannelId);
    }

    // AUTO ROLE SEMUA MEMBER (saat startup)
    if (MINORITY_ROLE_ID) {
      try {
        for (const guild of client.guilds.cache.values()) {
          console.log(`🔍 Mengecek server: ${guild.name}`);

          await guild.members.fetch();

          const role = guild.roles.cache.get(MINORITY_ROLE_ID);

          if (!role) {
            console.log(`❌ Role Minoritas tidak ditemukan di ${guild.name}`);
            continue;
          }

          let total = 0;

          for (const member of guild.members.cache.values()) {
            if (member.user.bot) continue;
            if (member.roles.cache.has(MINORITY_ROLE_ID)) continue;

            try {
              await member.roles.add(role);
              total++;
              console.log(`✅ ${member.user.tag} -> Minoritas`);
              await new Promise((r) => setTimeout(r, 500));
            } catch (e) {
              console.log(`❌ Gagal ${member.user.tag}: ${e.message}`);
            }
          }

          console.log(
            `🎉 Selesai! ${total} member ditambahkan ke Role Minoritas.`
          );
        }
      } catch (err) {
        console.log("❌ Auto Role Startup:", err.message);
      }
    }

    // AUTO JOIN VOICE (opsional)
    if (config.voiceChannelId) {
      try {
        const VOICE_CHANNEL_ID = config.voiceChannelId;

        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (!channel) {
          console.log("❌ Voice channel tidak ditemukan");
          return;
        }

        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log("✅ Auto join voice berhasil");
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5000)
            ]);
          } catch {
            console.log("🔌 Voice disconnected, reconnecting...");
            connection.destroy();
          }
        });
      } catch (err) {
        console.log("❌ Gagal auto join voice:", err.message);
      }
    }
  });

  // =========================================
  // ERROR HANDLERS
  // =========================================
  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled promise rejection:", error);
  });

  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught exception:", error);
  });

  client.on("error", (error) => {
    console.error("❌ Client error:", error);
  });

  // =========================================
  // LOGIN
  // =========================================
  try {
    await client.login(process.env.BOT_TOKEN);
  } catch (err) {
    console.error("❌ Gagal login ke Discord:");
    console.error(`   ${err.message}`);
    console.error("");
    console.error("Kemungkinan penyebab:");
    console.error("  1. BOT_TOKEN tidak valid atau sudah expired");
    console.error("  2. Koneksi internet bermasalah");
    console.error("  3. Bot di-banned oleh Discord");
    console.error("");
    console.error("Langkah perbaikan:");
    console.error("  1. Buka https://discord.com/developers/applications");
    console.error("  2. Pilih aplikasi bot Anda");
    console.error("  3. Buka tab Bot > Reset Token");
    console.error("  4. Salin token baru ke file .env");
    process.exit(1);
  }
})();