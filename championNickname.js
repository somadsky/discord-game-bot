// =========================================
// championNickname.js — Versi Fixed
// =========================================
//
// Fitur:
// - Cek top player (champion) setiap N menit
// - Beri nickname + role khusus champion
// - Cabut role/nickname dari champion lama
// - Anti-duplicate load & cleanup interval
// =========================================

const getTopPlayers = require("./rankingSystem");

// =========================================
// KONFIGURASI
// =========================================

// Interval update (default 5 menit = 300000 ms)
// Minimal 60 detik untuk hindari rate limit
const UPDATE_INTERVAL_MS = Math.max(
  60000,
  Number(process.env.CHAMPION_UPDATE_INTERVAL_MS) || 300000
);

// Nama role champion
const CHAMPION_ROLE_NAME = "Penguasa Nalar Semesta";

// Warna role champion (hex, karena "Gold" tidak valid di djs v14)
const CHAMPION_ROLE_COLOR = 0xffd700;

// Prefix nickname champion
const CHAMPION_NICK_PREFIX = "🏆「Champion」";

// Batas maksimum panjang nickname Discord
const MAX_NICK_LENGTH = 32;

// Anti-duplicate load per client
const loadedClients = new WeakSet();

// =========================================
// HELPER: BUILD NICKNAME
// =========================================

function buildNickname(username) {
  const base = `${CHAMPION_NICK_PREFIX}${username}`;

  if (base.length <= MAX_NICK_LENGTH) return base;

  // Potong username agar total <= MAX_NICK_LENGTH
  const availableLength = MAX_NICK_LENGTH - CHAMPION_NICK_PREFIX.length;
  const trimmed = username.slice(0, Math.max(1, availableLength));

  return `${CHAMPION_NICK_PREFIX}${trimmed}`;
}

// =========================================
// HELPER: CLEAR CHAMPION DARI MEMBER LAIN
// =========================================

async function clearOldChampions(guild, role, keepId) {
  // Ambil semua member yang punya role champion
  const membersWithRole = guild.members.cache.filter(
    (m) =>
      m.id !== keepId &&
      m.roles.cache.has(role.id) &&
      !m.user?.bot
  );

  for (const member of membersWithRole.values()) {
    try {
      // Cabut role
      await member.roles.remove(role).catch(() => null);

      // Reset nickname (hanya jika punya permission)
      if (member.manageable && member.nickname) {
        await member.setNickname(null).catch(() => null);
      }
    } catch (err) {
      console.error(
        `⚠️ Gagal reset champion ${member.user?.username}:`,
        err.message
      );
    }
  }
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = function championNickname(client, data) {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!client || typeof client.on !== "function") {
    console.error("❌ championNickname: client tidak valid.");
    return;
  }

  if (!data || typeof data !== "object") {
    console.error("❌ championNickname: data tidak valid.");
    return;
  }

  // Anti-duplicate load
  if (loadedClients.has(client)) {
    console.warn("⚠️ championNickname sudah terdaftar, skip duplikat.");
    return;
  }
  loadedClients.add(client);

  console.log("🏆 Module Champion Nickname dimuat.");

  // =========================================
  // FUNGSI: APPLY CHAMPION KE GUILD
  // =========================================

  async function applyChampion(guild) {
    try {
      // -----------------------------------
      // DAPATKAN TOP PLAYER
      // -----------------------------------
      let rank;
      try {
        rank = getTopPlayers(data);
      } catch (err) {
        console.error("❌ Gagal hitung ranking:", err.message);
        return;
      }

      if (!rank || !rank.first) return;

      const championId = rank.first;

      // -----------------------------------
      // FETCH MEMBER
      // -----------------------------------
      // Coba ambil dari cache dulu, fallback ke fetch
      let member = guild.members.cache.get(championId);

      if (!member) {
        member = await guild.members.fetch(championId).catch(() => null);
      }

      if (!member) return;
      if (member.user?.bot) return;

      // -----------------------------------
      // DAPATKAN / BUAT ROLE CHAMPION
      // -----------------------------------
      let role = guild.roles.cache.find(
        (r) => r.name === CHAMPION_ROLE_NAME
      );

      if (!role) {
        try {
          role = await guild.roles.create({
            name: CHAMPION_ROLE_NAME,
            color: CHAMPION_ROLE_PREFIX_COLOR(),
            reason: "Champion role auto-created"
          });

          console.log(
            `✅ Role "${CHAMPION_ROLE_NAME}" dibuat di ${guild.name}`
          );
        } catch (err) {
          console.error(
            `❌ Gagal buat role champion di ${guild.name}:`,
            err.message
          );
          return;
        }
      }

      // -----------------------------------
      // CABUT CHAMPION DARI MEMBER LAIN
      // -----------------------------------
      await clearOldChampions(guild, role, championId);

      // -----------------------------------
      // APPLY NICKNAME + ROLE KE CHAMPION
      // -----------------------------------
      const nickname = buildNickname(member.user?.username || "Champion");

      if (member.manageable && member.nickname !== nickname) {
        await member.setNickname(nickname).catch((err) => {
          console.error(
            `⚠️ Gagal set nickname champion:`,
            err.message
          );
        });
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch((err) => {
          console.error(
            `⚠️ Gagal tambah role champion:`,
            err.message
          );
        });
      }
    } catch (err) {
      console.error(
        `❌ Error applyChampion di ${guild.name}:`,
        err.message
      );
    }
  }

  // =========================================
  // HELPER WARNA (fallback)
  // =========================================
  function CHAMPION_ROLE_PREFIX_COLOR() {
    return CHAMPION_ROLE_COLOR;
  }

  // =========================================
  // RUN SEKALI SAAT READY
  // =========================================
  client.on("ready", async () => {
    for (const guild of client.guilds.cache.values()) {
      await applyChampion(guild);
    }
  });

  // =========================================
  // INTERVAL
  // =========================================
  const interval = setInterval(async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        await applyChampion(guild);
      }
    } catch (err) {
      console.error("❌ Error di champion interval:", err.message);
    }
  }, UPDATE_INTERVAL_MS);

  // Simpan reference di client untuk cleanup
  client.__championInterval = interval;

  console.log(
    `🏆 Champion update interval aktif (${UPDATE_INTERVAL_MS / 1000}s)`
  );

  // =========================================
  // CLEANUP INTERVAL SAAT SHUTDOWN
  // =========================================
  if (!client.__championCleanupRegistered) {
    client.__championCleanupRegistered = true;

    const cleanup = () => {
      if (client.__championInterval) {
        clearInterval(client.__championInterval);
        client.__championInterval = null;
        console.log("🧹 Champion interval dibersihkan.");
      }
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  }
};