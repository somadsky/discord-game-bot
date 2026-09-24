// =========================================
// memberLogger.js — Versi Fixed
// =========================================
//
// Fitur:
// - Welcome message saat member join (+deteksi inviter)
// - Leave message saat member keluar sendiri
// - Skip leave message jika member di-kick / di-ban
// - Cache invite anti-race-condition
// - Anti-duplicate load
// =========================================

const { EmbedBuilder, AuditLogEvent } = require("discord.js");

// =========================================
// KONSTANTA
// =========================================

// Discord API timeout untuk fetch invites (ms)
const FETCH_TIMEOUT = 8000;

// Jendela waktu toleransi AuditLog (ms) — event dianggap "baru" jika
// terjadi dalam rentang ini
const AUDIT_WINDOW = 10000;

// Anti-duplicate load guard (per client)
const loadedClients = new WeakSet();

// =========================================
// HELPER: FETCH DENGAN TIMEOUT
// =========================================

function withTimeout(promise, ms, label = "operation") {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`${label} timeout (${ms}ms)`)),
      ms
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutHandle)
  );
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = async (client, config = {}) => {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!client || typeof client.on !== "function") {
    console.error("❌ memberLogger: client tidak valid.");
    return;
  }

  // Anti-duplicate load per client instance
  if (loadedClients.has(client)) {
    console.warn("⚠️ memberLogger sudah terdaftar, skip listener duplikat.");
    return;
  }
  loadedClients.add(client);

  // =========================================
  // KONFIGURASI
  // =========================================
  const {
    welcomeChannelId = "",
    leaveChannelId = "",
    footerText = "Discord Game Bot"
  } = config;

  // =========================================
  // CACHE INVITE
  // =========================================
  // key   : guild ID
  // value : Map<code, uses>
  // Disimpan sebagai Map sederhana supaya lebih ringan & mudah compare.
  // =========================================
  const inviteCache = new Map();

  // =========================================
  // HELPER: SNAPSHOT INVITES
  // =========================================
  async function snapshotInvites(guild) {
    try {
      const invites = await withTimeout(
        guild.invites.fetch(),
        FETCH_TIMEOUT,
        "invites.fetch"
      );

      const map = new Map();

      invites.forEach((inv) => {
        map.set(inv.code, inv.uses || 0);
      });

      inviteCache.set(guild.id, map);
      return map;
    } catch (err) {
      console.error(
        `❌ Gagal fetch invites guild ${guild.name}:`,
        err.message
      );
      return null;
    }
  }

  // =========================================
  // HELPER: DETEKSI INVITER
  // =========================================
  // Bandingkan snapshot lama vs baru. Invite yang uses-nya bertambah
  // adalah invite yang dipakai.
  // =========================================
  function findUsedInvite(oldMap, newInvites) {
    if (!oldMap || oldMap.size === 0) return null;

    let usedInvite = null;

    newInvites.forEach((inv) => {
      const oldUses = oldMap.get(inv.code) || 0;
      const newUses = inv.uses || 0;

      if (newUses > oldUses) {
        usedInvite = inv;
      }
    });

    return usedInvite;
  }

  // =========================================
  // READY — CACHE SEMUA INVITE
  // =========================================
  client.on("ready", async () => {
    for (const guild of client.guilds.cache.values()) {
      await snapshotInvites(guild);
    }
  });

  // =========================================
  // GUILD CREATE — CACHE INVITE GUILD BARU
  // =========================================
  client.on("guildCreate", async (guild) => {
    await snapshotInvites(guild);
  });

  // =========================================
  // GUILD DELETE — BERSIHKAN CACHE
  // =========================================
  client.on("guildDelete", (guild) => {
    inviteCache.delete(guild.id);
  });

  // =========================================
  // MEMBER JOIN (WELCOME)
  // =========================================
  client.on("guildMemberAdd", async (member) => {
    try {
      // -----------------------------------
      // DETEKSI INVITER (duluan, sebelum apapun)
      // -----------------------------------
      let inviterMention = "Tidak diketahui";

      try {
        const oldMap = inviteCache.get(member.guild.id);

        const newInvites = await withTimeout(
          member.guild.invites.fetch(),
          FETCH_TIMEOUT,
          "invites.fetch on join"
        ).catch(() => null);

        if (newInvites) {
          const usedInvite = findUsedInvite(oldMap, newInvites);

          if (usedInvite && usedInvite.inviter) {
            inviterMention = `<@${usedInvite.inviter.id}>`;
          }

          // Update cache dengan snapshot terbaru
          const newMap = new Map();
          newInvites.forEach((inv) => {
            newMap.set(inv.code, inv.uses || 0);
          });
          inviteCache.set(member.guild.id, newMap);
        }
      } catch (err) {
        console.error("❌ Gagal deteksi inviter:", err.message);
      }

      // -----------------------------------
      // KIRIM WELCOME MESSAGE
      // -----------------------------------
      if (!welcomeChannelId) return;

      const channel = member.guild.channels.cache.get(welcomeChannelId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor("#2B2D31")
        .setAuthor({
          name: `Welcome ${member.user.username}`,
          iconURL: member.user.displayAvatarURL()
        })
        .setDescription(
          `Jangan ragu untuk berkenalan, berpartisipasi dalam obrolan,\n` +
            `dan ikuti berbagai aktivitas seru yang kami sediakan.\n\n` +
            `👤 **User:** <@${member.id}>\n` +
            `📨 **Diundang oleh:** ${inviterMention}\n\n` +
            `Selamat bersenang-senang dan semoga betah! 😊`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: footerText })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch((err) => {
        console.error("❌ Gagal kirim welcome message:", err.message);
      });
    } catch (err) {
      console.error("❌ Error di guildMemberAdd:", err.message);
    }
  });

  // =========================================
  // MEMBER LEAVE (HANYA KELUAR SENDIRI)
  // =========================================
  client.on("guildMemberRemove", async (member) => {
    try {
      // -----------------------------------
      // CEK APAKAH MEMBER DI-KICK / DI-BAN
      // -----------------------------------
      let wasKicked = false;

      try {
        // Cek kick & ban sekaligus, limit lebih dari 1 untuk hindari
        // false positive (audit log bisa delay)
        const [kickLogs, banLogs] = await Promise.all([
          withTimeout(
            member.guild.fetchAuditLogs({
              limit: 5,
              type: AuditLogEvent.MemberKick
            }),
            FETCH_TIMEOUT,
            "fetchAuditLogs kick"
          ).catch(() => null),
          withTimeout(
            member.guild.fetchAuditLogs({
              limit: 5,
              type: AuditLogEvent.MemberBanAdd
            }),
            FETCH_TIMEOUT,
            "fetchAuditLogs ban"
          ).catch(() => null)
        ]);

        const now = Date.now();

        // Cek kick log: target cocok + entry baru (dalam AUDIT_WINDOW)
        if (kickLogs) {
          const entry = kickLogs.entries.find(
            (log) =>
              log.target?.id === member.id &&
              now - log.createdTimestamp < AUDIT_WINDOW
          );
          if (entry) wasKicked = true;
        }

        // Cek ban log: target cocok + entry baru
        if (!wasKicked && banLogs) {
          const entry = banLogs.entries.find(
            (log) =>
              log.target?.id === member.id &&
              now - log.createdTimestamp < AUDIT_WINDOW
          );
          if (entry) wasKicked = true;
        }
      } catch (err) {
        console.error("❌ Gagal cek audit log:", err.message);
      }

      // Jika di-kick atau di-ban → skip leave message
      if (wasKicked) return;

      // -----------------------------------
      // KIRIM LEAVE MESSAGE
      // -----------------------------------
      if (!leaveChannelId) return;

      const channel = member.guild.channels.cache.get(leaveChannelId);
      if (!channel) return;

      // Guard: member.user bisa undefined jika partial
      const username = member.user?.username || "Unknown";
      const avatarURL = member.user?.displayAvatarURL?.() || undefined;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setAuthor({
          name: "Member Leave",
          iconURL: avatarURL
        })
        .setDescription(
          `👤 **User:** ${username}\n` + `📌 **Status:** Keluar sendiri`
        )
        .setThumbnail(avatarURL || null)
        .setFooter({ text: footerText })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch((err) => {
        console.error("❌ Gagal kirim leave message:", err.message);
      });
    } catch (err) {
      console.error("❌ Error di guildMemberRemove:", err.message);
    }
  });

  console.log("👤 Module Member Logger dimuat.");
};