// =========================================
// commands/sambungkata.js
// GAME SAMBUNG KATA — Versi Fixed
// =========================================
//
// Fitur:
// - Command: sk1 (create room), joinsk1, startsk1
// - Pemain bergiliran menyambung kata
// - Setiap jawaban salah = kurangi nyawa
// - Pemain dengan nyawa habis = tereliminasi
// - Pemenang terakhir dapat +500 Score
// =========================================

const config = require("../config");
const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

// =========================================
// KONFIGURASI
// =========================================
const MAIN_CHANNEL = config.mainChannelId;
const MAX_PLAYER = 8;
const TIME_LIMIT = 15; // detik per turn

// =========================================
// STATE PER SERVER
// =========================================
// key   : guild ID
// value : data room
// =========================================
const ROOMS = {};

// =========================================
// LOAD KBBI (database kata)
// =========================================
let KBBI = [];

try {
  const rawDB = require("../kbbi.json");

  if (Array.isArray(rawDB)) {
    KBBI = rawDB.map((k) => String(k).toLowerCase());
    console.log(`✅ KBBI dimuat: ${KBBI.length} kata`);
  } else {
    console.error("❌ KBBI bukan array, database kata kosong.");
  }
} catch (err) {
  console.error("❌ Gagal load kbbi.json:", err.message);
}

// =========================================
// HELPER
// =========================================

function randomKata() {
  if (!KBBI.length) return null;
  return KBBI[Math.floor(Math.random() * KBBI.length)];
}

function filterKata(text) {
  const last2 = text.slice(-2);
  if (last2 === "ng") return text.slice(-1);
  return last2;
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = function sambungKata(client, data, saveData) {
  // Anti-duplicate load
  if (client.__sambungKataLoaded) {
    console.warn("⚠️ Sambung Kata sudah terdaftar, skip listener duplikat.");
    return;
  }
  client.__sambungKataLoaded = true;

  // Cek database kata
  if (!KBBI.length) {
    console.error("❌ Database KBBI kosong, Sambung Kata tidak akan berfungsi.");
    return;
  }

  console.log("✅ Module Sambung Kata dimuat.");

  client.on("messageCreate", async (msg) => {
    try {
      if (msg.author.bot) return;
      if (!msg.guild) return;

      // Kalau MAIN_CHANNEL tidak diset, skip restriction
      if (MAIN_CHANNEL && msg.channel.id !== MAIN_CHANNEL) return;

      const cmd = msg.content.toLowerCase().trim();
      const guildId = msg.guild.id;

      // =====================================
      // CREATE ROOM (sk1)
      // =====================================
      if (cmd === "sk1") {
        if (ROOMS[guildId]) {
          return msg.reply(
            "⚠️ Masih ada room Sambung Kata yang aktif di server ini."
          );
        }

        // Cek register
        if (!Object.hasOwn(data, msg.author.id)) {
          return msg.reply(
            "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu."
          );
        }

        let channel;

        try {
          channel = await msg.guild.channels.create({
            name: `sk-room-${msg.author.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
              {
                id: msg.guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
              },
              {
                id: msg.author.id,
                allow: [PermissionsBitField.Flags.ViewChannel]
              }
            ]
          });
        } catch (err) {
          console.error("❌ Gagal create room Sambung Kata:", err.message);
          return msg.reply(
            "❌ Gagal membuat room.\n" +
              "Pastikan bot punya permission **Manage Channels**."
          );
        }

        ROOMS[guildId] = {
          host: msg.author.id,
          channelId: channel.id,
          players: [
            {
              id: msg.author.id,
              life: 2,
              wrong: 0
            }
          ],
          turnIndex: 0,
          kata: "",
          used: [],
          active: false,
          activeCollector: null
        };

        return msg.reply(`✅ Room dibuat: ${channel}`);
      }

      // =====================================
      // JOIN ROOM (joinsk1)
      // =====================================
      if (cmd === "joinsk1") {
        const room = ROOMS[guildId];

        if (!room) {
          return msg.reply("❌ Tidak ada room aktif.");
        }

        if (room.active) {
          return msg.reply("❌ Game sudah dimulai, tidak bisa join.");
        }

        if (room.players.length >= MAX_PLAYER) {
          return msg.reply("🚫 Room penuh (maks 8 pemain).");
        }

        if (room.players.find((p) => p.id === msg.author.id)) {
          return msg.reply("Kamu sudah join.");
        }

        // Cek register
        if (!Object.hasOwn(data, msg.author.id)) {
          return msg.reply(
            "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu."
          );
        }

        room.players.push({
          id: msg.author.id,
          life: 2,
          wrong: 0
        });

        // Beri akses ke room channel
        try {
          const gameChannel = await client.channels.fetch(room.channelId);

          await gameChannel.permissionOverwrites.edit(msg.author.id, {
            ViewChannel: true
          });
        } catch (err) {
          console.error("❌ Gagal memberi akses join:", err.message);
        }

        return msg.reply("✅ Join berhasil!");
      }

      // =====================================
      // START GAME (startsk1)
      // =====================================
      if (cmd === "startsk1") {
        const room = ROOMS[guildId];

        if (!room) {
          return msg.reply("❌ Tidak ada room aktif.");
        }

        if (msg.author.id !== room.host) {
          return msg.reply("Hanya host yang bisa memulai game.");
        }

        if (room.active) {
          return msg.reply("❌ Game sudah dimulai.");
        }

        if (room.players.length < 2) {
          return msg.reply("Minimal 2 pemain untuk memulai.");
        }

        const startKata = randomKata();

        if (!startKata) {
          return msg.reply("❌ Database kata kosong.");
        }

        room.active = true;
        room.kata = startKata;
        room.used.push(startKata);

        startTurn(client, guildId, data, saveData);
      }
    } catch (err) {
      console.error("❌ Error di handler Sambung Kata:", err.message);
    }
  });
};

// =========================================
// TURN SYSTEM
// =========================================

async function startTurn(client, guildId, data, saveData) {
  const room = ROOMS[guildId];

  if (!room) return;

  // =====================================
  // STOP COLLECTOR LAMA (anti memory leak)
  // =====================================
  if (room.activeCollector) {
    try {
      room.activeCollector.stop("turn_change");
    } catch (err) {
      // Abaikan
    }
    room.activeCollector = null;
  }

  if (!room.players.length) {
    delete ROOMS[guildId];
    return;
  }

  // Normalisasi turnIndex
  if (room.turnIndex >= room.players.length) {
    room.turnIndex = 0;
  }

  // =====================================
  // CEK PEMENANG
  // =====================================
  if (room.players.length === 1) {
    const winner = room.players[0];

    if (!data[winner.id]) {
      data[winner.id] = { cash: 0 };
    }

    if (typeof data[winner.id].cash !== "number") {
      data[winner.id].cash = 0;
    }

    data[winner.id].cash += 500;
    saveData();

    try {
      const channel = await client.channels.fetch(room.channelId);

      const winEmbed = new EmbedBuilder()
        .setTitle("🏆 SAMBUNG KATA SELESAI")
        .setDescription(
          `👑 Pemenang: <@${winner.id}>\n` + `💰 Hadiah: +500 Score`
        )
        .setColor("#FFD700")
        .setTimestamp();

      await channel.send({ embeds: [winEmbed] });

      // Announce ke MAIN_CHANNEL (jika diset)
      if (MAIN_CHANNEL) {
        try {
          const announceChannel = await client.channels
            .fetch(MAIN_CHANNEL)
            .catch(() => null);

          if (announceChannel) {
            const announceEmbed = new EmbedBuilder()
              .setTitle("🎉 PENGUMUMAN PEMENANG")
              .setDescription(
                `🏆 <@${winner.id}> memenangkan game **Sambung Kata**\n` +
                  `💰 Mendapatkan hadiah **+500 Score**`
              )
              .setColor("#00FF99")
              .setFooter({ text: "Leaderboard diperbarui" })
              .setTimestamp();

            await announceChannel.send({ embeds: [announceEmbed] });
          }
        } catch (err) {
          console.error("❌ Gagal kirim announce:", err.message);
        }
      }

      // Hapus channel room
      await channel.delete().catch(() => {});
    } catch (err) {
      console.error("❌ Gagal kirim pemenang Sambung Kata:", err.message);
    }

    delete ROOMS[guildId];
    return;
  }

  // =====================================
  // AMBIL PEMAIN SAAT INI
  // =====================================
  const player = room.players[room.turnIndex];
  const required = filterKata(room.kata);

  player.wrong = 0;
  let timeLeft = TIME_LIMIT;
  let selesaiTurn = false;

  let channel;

  try {
    channel = await client.channels.fetch(room.channelId);
  } catch (err) {
    console.error("❌ Gagal fetch channel Sambung Kata:", err.message);
    delete ROOMS[guildId];
    return;
  }

  // =====================================
  // KIRIM PESAN TURN
  // =====================================
  const embed = new EmbedBuilder()
    .setTitle("🔥 Sambung Kata")
    .setColor("#00E1FF")
    .setDescription(
      `🎯 Kata: **${room.kata.toUpperCase()}**\n` +
        `👉 Giliran: <@${player.id}>\n` +
        `❤️ Nyawa: ${player.life}\n` +
        `⏳ Waktu: ${timeLeft}s\n` +
        `Awalan: **${required.toUpperCase()}**`
    )
    .setFooter({ text: "Jawab sebelum waktu habis!" });

  let gameMsg;

  try {
    gameMsg = await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("❌ Gagal kirim pesan turn:", err.message);
    delete ROOMS[guildId];
    return;
  }

  // =====================================
  // INTERVAL COUNTDOWN
  // =====================================
  const interval = setInterval(() => {
    timeLeft--;

    // Kalau turn sudah selesai, hentikan
    if (selesaiTurn) {
      clearInterval(interval);
      return;
    }

    embed.setDescription(
      `🎯 Kata: **${room.kata.toUpperCase()}**\n` +
        `👉 Giliran: <@${player.id}>\n` +
        `❤️ Nyawa: ${player.life}\n` +
        `⏳ Waktu: ${timeLeft}s\n` +
        `Awalan: **${required.toUpperCase()}**`
    );

    gameMsg.edit({ embeds: [embed] }).catch(() => {});

    if (timeLeft <= 0) clearInterval(interval);
  }, 1000);

  // =====================================
  // COLLECTOR
  // =====================================
  const collector = channel.createMessageCollector({
    time: TIME_LIMIT * 1000
  });

  room.activeCollector = collector;

  collector.on("collect", async (m) => {
    try {
      // Hanya pemain saat ini yang boleh jawab
      if (m.author.id !== player.id) {
        await m.delete().catch(() => {});
        return;
      }

      const answer = m.content.toLowerCase().trim();

      // Validasi: harus dimulai dengan awalan, ada di KBBI, belum dipakai
      const validStart = answer.startsWith(required);
      const validKata = KBBI.includes(answer);
      const notUsed = !room.used.includes(answer);

      if (!validStart || !validKata || !notUsed) {
        player.wrong++;
        await m.reply(`❌ Salah (${player.wrong}/3)`);

        if (player.wrong >= 3) {
          selesaiTurn = true;
          clearInterval(interval);
          collector.stop("failed");
        }
        return;
      }

      // =====================================
      // JAWABAN BENAR
      // =====================================
      selesaiTurn = true;
      clearInterval(interval);
      collector.stop("correct");

      room.used.push(answer);
      room.kata = answer;
      room.turnIndex = (room.turnIndex + 1) % room.players.length;

      // Lanjut ke turn berikutnya
      startTurn(client, guildId, data, saveData);
    } catch (err) {
      console.error("❌ Error di collector Sambung Kata:", err.message);
    }
  });

  collector.on("end", async () => {
    clearInterval(interval);

    // Kalau turn sudah selesai karena jawaban benar, jangan lanjut
    if (selesaiTurn && room.turnIndex !== undefined && ROOMS[guildId]) {
      // Cek apakah turn sudah pindah (jawaban benar)
      // turnIndex sudah di-update di handler "correct"
      return;
    }

    // Kalau time out atau wrong >= 3
    if (!ROOMS[guildId]) return;

    player.life--;

    try {
      if (player.life <= 0) {
        await channel.send(`☠️ <@${player.id}> tereliminasi!`);
        room.players.splice(room.turnIndex, 1);

        if (room.turnIndex >= room.players.length) {
          room.turnIndex = 0;
        }
      } else {
        await channel.send(
          `💔 <@${player.id}> kehilangan 1 nyawa! (${player.life} tersisa)`
        );
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
      }
    } catch (err) {
      console.error("❌ Gagal kirim pesan life:", err.message);
    }

    // Lanjut ke turn berikutnya
    startTurn(client, guildId, data, saveData);
  });
}