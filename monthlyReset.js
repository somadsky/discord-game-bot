// =========================================
// monthlyReset.js — Versi Fixed
// =========================================
//
// Fitur:
// - Reset skor otomatis pada tanggal 15 & 30 jam 07:00 WIB
// - Kirim pengumuman + sertifikat ke top 3
// - Cleanup sertifikat lama
// - Anti double-reset (idempotency key pakai timezone WIB)
// - Cleanup interval saat shutdown
// =========================================

const generateCertificate = require("./certificateGenerator");
const { cleanupOldCerts } = require("./certificateGenerator");
const config = require("./config");

module.exports = (client, data, saveData) => {
  console.log("✅ [MODULE] monthlyReset.js berhasil dimuat!");

  // =========================================
  // KONFIGURASI
  // =========================================
  const CONFIG = {
    TARGET_CHANNEL: config.monthlyResetChannelId,
    RESET_HOUR: 7,
    RESET_DATES: [15, 30],
    CHECK_INTERVAL: 60000, // 1 menit
    TIMEZONE: "Asia/Jakarta",
    TOP_COUNT: 3,
    CERT_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000 // 7 hari
  };

  // =========================================
  // VALIDASI CONFIG
  // =========================================
  if (!CONFIG.TARGET_CHANNEL) {
    console.warn(
      "⚠️ [monthlyReset] MONTHLY_RESET_CHANNEL_ID kosong, modul dinonaktifkan."
    );
    return;
  }

  // =========================================
  // ANTI-DUPLICATE LOAD
  // =========================================
  if (client.__monthlyResetLoaded) {
    console.warn("⚠️ [monthlyReset] Sudah terdaftar, skip duplikat.");
    return;
  }
  client.__monthlyResetLoaded = true;

  // =========================================
  // STATE
  // =========================================
  let lastResetKey = null;
  let isResetting = false;

  // =========================================
  // HELPER: DAPATKAN TANGGAL WIB
  // =========================================
  function getWIBParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: CONFIG.TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false
    });

    const parts = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour)
    };
  }

  // =========================================
  // CEK WAKTU RESET
  // =========================================
  async function checkResetTime() {
    if (isResetting) return;

    try {
      const { year, month, day, hour } = getWIBParts();

      const isResetHour = hour === CONFIG.RESET_HOUR;
      const isResetDate = CONFIG.RESET_DATES.includes(day);

      // Idempotency key pakai timezone WIB (bukan lokal)
      const resetKey = `${year}-${month}-${day}`;
      const alreadyReset = lastResetKey === resetKey;

      if (isResetHour && isResetDate && !alreadyReset) {
        console.log(
          `🔔 [RESET] Memulai reset untuk tanggal ${day} (${resetKey})...`
        );

        isResetting = true;
        lastResetKey = resetKey;

        try {
          await doReset(day);
        } finally {
          isResetting = false;
        }
      }
    } catch (err) {
      console.error("❌ [monthlyReset] checkResetTime error:", err.message);
      isResetting = false;
    }
  }

  // =========================================
  // LAKUKAN RESET
  // =========================================
  async function doReset(dateNumber) {
    let channel = null;

    try {
      // -----------------------------------
      // FETCH CHANNEL
      // -----------------------------------
      channel = await client.channels
        .fetch(CONFIG.TARGET_CHANNEL)
        .catch(() => null);

      if (!channel) {
        console.error("❌ [monthlyReset] Channel tidak ditemukan!");
        return;
      }

      // -----------------------------------
      // AMBIL TOP WINNERS
      // -----------------------------------
      const topWinners = Object.entries(data || {})
        .filter(([_, obj]) => obj && typeof obj.cash === "number" && obj.cash > 0)
        .sort((a, b) => b[1].cash - a[1].cash)
        .slice(0, CONFIG.TOP_COUNT);

      if (topWinners.length === 0) {
        await channel
          .send("📊 Belum ada data score bulan ini.")
          .catch(() => null);
        console.log("⚠️ [monthlyReset] Tidak ada pemenang.");
        return;
      }

      // -----------------------------------
      // KUMPULKAN DATA WINNERS
      // -----------------------------------
      const winners = [];

      for (let i = 0; i < topWinners.length; i++) {
        const [userId, obj] = topWinners[i];
        const rankNumber = i + 1;

        let user = null;
        try {
          user = await client.users.fetch(userId);
        } catch (err) {
          console.warn(
            `⚠️ [monthlyReset] Gagal fetch user ${userId}:`,
            err.message
          );
        }

        const username = user ? user.username : `User ${userId}`;
        const avatarURL = user
          ? user.displayAvatarURL({ extension: "png", size: 512 })
          : null;

        winners.push({
          rank: rankNumber,
          userId,
          username,
          score: obj.cash,
          avatarURL
        });
      }

      // -----------------------------------
      // KIRIM PENGUMUMAN
      // -----------------------------------
      const periodLabel = dateNumber === 15 ? "PARUH BULAN" : "AKHIR BULAN";
      const rankEmojis = { 1: "🥇", 2: "🥈", 3: "🥉" };

      let announceText = [
        `🏆 **HASIL KOMPETISI ${periodLabel}**`,
        `📅 Tanggal: ${dateNumber} ${new Date().toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric"
        })}`,
        ``,
        `**🎖️ PARA JUARA:**`
      ];

      for (const w of winners) {
        announceText.push(
          `${rankEmojis[w.rank] || "🏅"} **Juara ${w.rank}** — <@${w.userId}> (**${w.score.toLocaleString(
            "id-ID"
          )} poin**)`
        );
      }

      announceText.push(``);
      announceText.push(`🎉 Selamat kepada para pemenang!`);
      announceText.push(`📜 Sertifikat akan dikirim sebentar lagi...`);

      await channel.send(announceText.join("\n")).catch((err) => {
        console.error("❌ [monthlyReset] Gagal kirim pengumuman:", err.message);
      });

      console.log("📢 [monthlyReset] Pengumuman pemenang terkirim");

      // -----------------------------------
      // KIRIM SERTIFIKAT (handle null)
      // -----------------------------------
      const certDate = new Date();
      certDate.setDate(dateNumber);

      for (const w of winners) {
        try {
          console.log(
            `🎨 [monthlyReset] Membuat sertifikat untuk ${w.username} (Rank ${w.rank})...`
          );

          const filePath = await generateCertificate({
            userId: w.userId,
            username: w.username,
            rank: w.rank,
            score: w.score,
            avatarURL: w.avatarURL,
            issuer: config.certificateIssuer,
            certDate
          });

          // ✅ GUARD: filePath bisa null
          if (!filePath) {
            console.warn(
              `⚠️ [monthlyReset] Sertifikat ${w.username} gagal dibuat (return null).`
            );
            await channel
              .send(`⚠️ Gagal membuat sertifikat untuk <@${w.userId}>`)
              .catch(() => null);
            continue;
          }

          await channel.send({
            content: `${rankEmojis[w.rank]} **Sertifikat Juara ${w.rank} — <@${w.userId}>**`,
            files: [
              {
                attachment: filePath,
                name: `sertifikat_juara${w.rank}_${dateNumber}.png`
              }
            ]
          }).catch((err) => {
            console.error(
              `❌ [monthlyReset] Gagal kirim sertifikat ${w.username}:`,
              err.message
            );
          });

          console.log(`✅ [monthlyReset] Sertifikat ${w.username} terkirim`);
        } catch (err) {
          console.error(
            `❌ [monthlyReset] Error sertifikat ${w.username}:`,
            err.message
          );
          await channel
            .send(`⚠️ Gagal mengirim sertifikat untuk <@${w.userId}>`)
            .catch(() => null);
        }
      }

      // -----------------------------------
      // CLEANUP SERTIFIKAT LAMA
      // -----------------------------------
      try {
        const certDir = require("path").join(__dirname, "certs");
        const deleted = cleanupOldCerts(certDir, CONFIG.CERT_MAX_AGE_MS);
        if (deleted > 0) {
          console.log(`🧹 [monthlyReset] ${deleted} sertifikat lama dihapus.`);
        }
      } catch (err) {
        console.warn(
          "⚠️ [monthlyReset] Gagal cleanup sertifikat lama:",
          err.message
        );
      }

      // -----------------------------------
      // RESET DATA
      // -----------------------------------
      console.log("🔄 [monthlyReset] Mereset semua skor...");

      let resetCount = 0;
      for (const id of Object.keys(data || {})) {
        if (data[id] && typeof data[id].cash === "number" && data[id].cash > 0) {
          data[id].cash = 0;
          resetCount++;
        }
      }

      try {
        saveData();
      } catch (err) {
        console.error("❌ [monthlyReset] Gagal save data:", err.message);
      }

      await channel
        .send(
          `✅ **Reset selesai!** ${resetCount} user telah direset.\n` +
            `🎯 Kompetisi baru dimulai sekarang!`
        )
        .catch(() => null);

      console.log(
        `✅ [monthlyReset] Reset selesai. ${resetCount} user direset.`
      );
    } catch (err) {
      console.error("❌ [monthlyReset] Error saat reset:", err);

      try {
        if (channel) {
          await channel
            .send(`❌ Terjadi error saat reset. Admin mohon cek logs!`)
            .catch(() => null);
        }
      } catch {}
    }
  }

  // =========================================
  // START INTERVAL CHECKER
  // =========================================
  const interval = setInterval(checkResetTime, CONFIG.CHECK_INTERVAL);

  console.log(
    `⏰ [monthlyReset] Reset checker aktif (interval: ${
      CONFIG.CHECK_INTERVAL / 1000
    }s)`
  );
  console.log(
    `📅 [monthlyReset] Reset akan berjalan pada tanggal: ${CONFIG.RESET_DATES.join(
      ", "
    )} jam ${CONFIG.RESET_HOUR}:00 WIB`
  );

  // Jalankan sekali saat startup
  checkResetTime();

  // =========================================
  // CLEANUP SAAT SHUTDOWN
  // =========================================
  if (!client.__monthlyResetCleanupRegistered) {
    client.__monthlyResetCleanupRegistered = true;

    const cleanup = () => {
      if (client.__monthlyResetInterval) {
        clearInterval(client.__monthlyResetInterval);
        client.__monthlyResetInterval = null;
        console.log("🧹 [monthlyReset] Interval dibersihkan.");
      }
    };

    client.__monthlyResetInterval = interval;

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  } else {
    client.__monthlyResetInterval = interval;
  }
};