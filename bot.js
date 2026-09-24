// =========================================
// bot.js — Market Update Bot (Fixed)
// =========================================
//
// Fitur:
// - Update harga crypto dari Indodax
// - Kurs USD/IDR
// - Alert saat BTC turun di bawah threshold (per-guild)
// - Scheduler otomatis pada menit tertentu
// - Anti-duplicate load & cleanup interval
// =========================================

require("dotenv").config();

const axios = require("axios");
const config = require("./config");
const { EmbedBuilder } = require("discord.js");

// =========================================
// KONFIGURASI
// =========================================

// Default coins — bisa dioverride via MARKET_COINS di .env
const DEFAULT_COINS = ["BTC", "SOL", "XRP", "ETH", "BNB", "DOGE"];
const COINS = (() => {
  const raw = String(process.env.MARKET_COINS || "").trim();
  if (!raw) return DEFAULT_COINS;
  const parsed = raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_COINS;
})();

const ALERT_USER_ID = config.alertUserId || "";
const MARKET_FOOTER = config.marketFooter || "Discord Game Bot";

const BTC_BASE = Number(config.marketBtcBase) || 70000;
const BTC_DROP_PERCENT = Number(config.marketBtcDropPercent) || 3;
const BTC_DROP_PRICE = BTC_BASE - (BTC_BASE * BTC_DROP_PERCENT) / 100;

// Simpan harga terakhir (untuk hitung % perubahan)
const lastPrices = {};

// Alert BTC per-guild (bukan global) → fix bug multi-guild
const btcAlertSent = new Map();

// Timeout request (10 detik)
const REQUEST_TIMEOUT = 10000;

// Indodax base URL
const INDODAX_BASE = "https://indodax.com/api";

// =========================================
// HELPER: VALIDASI ANGKA
// =========================================

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// =========================================
// HELPER: REQUEST DENGAN TIMEOUT & ERROR HANDLING
// =========================================

async function safeFetch(url) {
  try {
    const res = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Discord-Market-Bot",
        Accept: "application/json"
      }
    });

    if (!res || !res.data) return null;
    return res.data;
  } catch (err) {
    console.error(`❌ HTTP Error [${url}]:`, err.message);
    return null;
  }
}

// =========================================
// AMBIL KURS USD/IDR (via Indodax USDT/IDR)
// =========================================

async function getUSDIDR() {
  try {
    const data = await safeFetch(`${INDODAX_BASE}/ticker/usdtidr`);

    if (!data) return null;

    const price = safeNumber(data?.ticker?.last);
    return price;
  } catch (err) {
    console.error("❌ Gagal ambil kurs USD/IDR:", err.message);
    return null;
  }
}

// =========================================
// AMBIL HARGA CRYPTO DALAM USDT
// =========================================
// Optimization: kurs USDT/IDR dikirim dari luar,
// tidak perlu fetch berulang tiap coin.
// =========================================

async function getPriceCryptoUSDT(coin, usdtPrice) {
  try {
    if (!usdtPrice || usdtPrice <= 0) return null;

    const coinData = await safeFetch(
      `${INDODAX_BASE}/ticker/${coin.toLowerCase()}idr`
    );

    if (!coinData) return null;

    const coinPrice = safeNumber(coinData?.ticker?.last);

    if (!coinPrice) return null;

    return coinPrice / usdtPrice;
  } catch (err) {
    console.error(`❌ Gagal ambil harga ${coin}:`, err.message);
    return null;
  }
}

// =========================================
// FORMAT TIMESTAMP (dengan timezone config)
// =========================================

function formatDate() {
  const n = new Date();

  // Gunakan timezone dari config agar konsisten
  const tz = config.marketTimezone || "Asia/Jakarta";

  try {
    const formatter = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    // Output id-ID format: "24/09/2026, 14.30.15"
    return formatter.format(n).replace(",", ",");
  } catch (err) {
    // Fallback jika timezone invalid
    const pad = (num) => String(num).padStart(2, "0");

    return (
      `${pad(n.getDate())}/${pad(n.getMonth() + 1)}/${n.getFullYear()}, ` +
      `${pad(n.getHours())}.${pad(n.getMinutes())}.${pad(n.getSeconds())}`
    );
  }
}

// =========================================
// INIT MARKET BOT
// =========================================

function initMarketBot(client, channelId) {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!client || typeof client.on !== "function") {
    console.error("❌ initMarketBot: client tidak valid.");
    return;
  }

  if (!channelId || typeof channelId !== "string") {
    console.error("❌ initMarketBot: channelId tidak valid.");
    return;
  }

  // =========================================
  // ANTI-DUPLICATE LOAD
  // =========================================
  if (client.__marketBotLoaded) {
    console.warn("⚠️ Market Bot sudah terdaftar, skip duplikat.");
    return;
  }
  client.__marketBotLoaded = true;

  console.log("📡 Market Bot diinisialisasi.");
  console.log(`📡 Market channel: ${channelId}`);
  console.log(`📡 Coin yang dipantau: ${COINS.join(", ")}`);

  let lastMinuteSent = null;

  // =========================================
  // FUNGSI KIRIM UPDATE
  // =========================================

  async function sendUpdate() {
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);

      if (!ch) {
        console.error("❌ Channel market tidak ditemukan.");
        return;
      }

      // =========================================
      // KURS — fetch sekali, pakai berkali-kali
      // =========================================
      const usd = await getUSDIDR();

      const usdText = usd
        ? `USD/IDR : Rp ${usd.toLocaleString("id-ID")}`
        : "USD/IDR : -";

      // =========================================
      // CRYPTO + % PERUBAHAN
      // =========================================
      let cryptoText = "";

      for (const c of COINS) {
        const price = await getPriceCryptoUSDT(c, usd);

        if (price === null) {
          cryptoText += `${c.padEnd(6)}: -\n`;
          continue;
        }

        const last = lastPrices[c];
        let changeText = "⏸ 0.00%";

        if (last && isFinite(last) && last > 0) {
          const diff = ((price - last) / last) * 100;
          const sign = diff > 0 ? "🔼" : diff < 0 ? "🔽" : "⏸";

          changeText = `${sign} ${
            diff > 0 ? "+" : ""
          }${diff.toFixed(2)}%`;
        }

        lastPrices[c] = price;

        cryptoText += `${c.padEnd(6)}: $${price.toFixed(4)}  ${changeText}\n`;

        // =========================================
        // BTC ALERT (per-guild)
        // =========================================
        if (c === "BTC") {
          const guildId = ch.guild?.id || "global";
          const alreadySent = btcAlertSent.get(guildId) || false;

          if (price <= BTC_DROP_PRICE && !alreadySent) {
            btcAlertSent.set(guildId, true);

            // Guard ALERT_USER_ID agar tidak menghasilkan mention rusak
            const mentionLine = ALERT_USER_ID
              ? `\n👤 <@${ALERT_USER_ID}>`
              : "";

            const alertMsg =
              "🚨 **BTC berada di bawah ambang batas yang dikonfigurasi.**\n" +
              "📊 Ini adalah notifikasi informasi pasar, bukan saran keuangan." +
              mentionLine;

            try {
              await ch.send(alertMsg);
            } catch (err) {
              console.error("❌ Gagal kirim BTC alert:", err.message);
            }
          }

          // Reset alert kalau naik lagi di atas baseline
          if (price > BTC_BASE) {
            btcAlertSent.set(guildId, false);
          }
        }
      }

      // =========================================
      // BUAT EMBED
      // =========================================
      const embed = new EmbedBuilder()
        .setTitle("✨ Market Update")
        .setDescription(`📅 ${formatDate()}`)
        .setColor(0x00d4ff)
        .addFields(
          {
            name: "💱 KURS",
            value: "```" + usdText + "```",
            inline: false
          },
          {
            name: "📊 CRYPTO (USDT)",
            value: "```" + cryptoText + "```",
            inline: false
          }
        )
        .setFooter({
          text: `Update otomatis setiap ${config.marketUpdateIntervalMs / 60000} menit • ${MARKET_FOOTER}`
        })
        .setTimestamp();

      // =========================================
      // KIRIM
      // =========================================
      try {
        await ch.send({ embeds: [embed] });
        console.log("📤 Market update terkirim");
      } catch (err) {
        console.error("❌ Gagal kirim market update:", err.message);
      }
    } catch (err) {
      console.error("❌ Error di sendUpdate:", err.message);
    }
  }

  // =========================================
  // SCHEDULER
  // =========================================
  // Cek setiap interval (default 30 detik) apakah menit saat ini
  // termasuk dalam daftar menit yang dikonfigurasi.
  // Gunakan `lastMinuteSent` untuk mencegah kirim berulang.
  // =========================================

  const updateMinutes = Array.isArray(config.marketUpdateMinutes)
    ? config.marketUpdateMinutes
    : [];

  if (updateMinutes.length === 0) {
    console.warn(
      "⚠️ MARKET_UPDATE_MINUTES kosong, scheduler tidak akan mengirim update."
    );
  }

  const interval = setInterval(async () => {
    try {
      const now = new Date();
      const minute = now.getMinutes();

      if (updateMinutes.includes(minute) && minute !== lastMinuteSent) {
        lastMinuteSent = minute;
        await sendUpdate();
      }
    } catch (err) {
      console.error("❌ Error di market scheduler:", err.message);
    }
  }, config.marketUpdateIntervalMs);

  // Simpan reference interval di client untuk cleanup
  client.__marketBotInterval = interval;

  console.log(
    `📡 Market scheduler aktif (menit: ${updateMinutes.join(", ")})`
  );

  // =========================================
  // CLEANUP ON SHUTDOWN
  // =========================================
  // Hindari memory leak / interval ganda saat bot shutdown/restart
  if (!client.__marketBotCleanupRegistered) {
    client.__marketBotCleanupRegistered = true;

    const cleanup = () => {
      if (client.__marketBotInterval) {
        clearInterval(client.__marketBotInterval);
        client.__marketBotInterval = null;
        console.log("🧹 Market Bot interval dibersihkan.");
      }
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  }
}

// =========================================
// MODULE EXPORT
// =========================================

module.exports = { initMarketBot };