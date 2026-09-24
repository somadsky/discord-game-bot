// =========================================
// rankingSystem.js — Versi Fixed
// =========================================
//
// Fungsi:
// - getTopPlayers(data) → { first, second, third } (backward compat)
// - getTopPlayers(data, N) → array of { id, cash } untuk top N
//
// Fix:
// - Null safety total
// - Guard obj.cash bukan number
// - Cache untuk performa
// - Dukungan top N
// =========================================

// =========================================
// CACHE
// =========================================
// Simpan hasil sort terakhir untuk hindari sort berulang
// pada data yang sama. Cache invalidated kalau `data` berubah
// reference-nya (weak check via Object.keys length + JSON hash ringan).
// =========================================

let cache = {
  ref: null,
  keysLen: 0,
  sorted: null,
  timestamp: 0
};

const CACHE_TTL_MS = 2000; // 2 detik

// =========================================
// HELPER: SANITIZE DATA
// =========================================

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildSortedList(data) {
  if (!data || typeof data !== "object") return [];

  const entries = Object.entries(data);
  const valid = [];

  for (const [id, obj] of entries) {
    if (!id || typeof id !== "string") continue;
    if (!obj || typeof obj !== "object") continue;

    // Cash bisa number atau string numerik
    const cash = toNumber(obj.cash, 0);

    // Skip kalau cash 0 atau negatif? Tidak — tetap masuk, karena
    // bisa saja champion punya cash 0 saat data masih kosong.
    valid.push({ id, cash });
  }

  // Sort descending by cash
  valid.sort((a, b) => b.cash - a.cash);

  return valid;
}

// =========================================
// MAIN: GET TOP PLAYERS
// =========================================

/**
 * Ambil top players dari data.
 *
 * @param {Object} data - Object { userId: { cash: number } }
 * @param {number} [topN] - (opsional) jika diisi, return array top N.
 *                          Jika kosong, return { first, second, third }.
 * @returns {Object|Array}
 */
function getTopPlayers(data, topN) {
  // =========================================
  // CACHE CHECK
  // =========================================
  const now = Date.now();
  const keysLen = data && typeof data === "object"
    ? Object.keys(data).length
    : 0;

  const cacheValid =
    cache.ref === data &&
    cache.keysLen === keysLen &&
    cache.sorted &&
    now - cache.timestamp < CACHE_TTL_MS;

  let sorted;

  if (cacheValid) {
    sorted = cache.sorted;
  } else {
    sorted = buildSortedList(data);
    cache = {
      ref: data,
      keysLen,
      sorted,
      timestamp: now
    };
  }

  // =========================================
  // MODE 1: Top N (array)
  // =========================================
  if (typeof topN === "number" && topN >= 0) {
    return sorted.slice(0, topN);
  }

  // =========================================
  // MODE 2: Top 3 (backward compat)
  // =========================================
  return {
    first: sorted[0]?.id || null,
    second: sorted[1]?.id || null,
    third: sorted[2]?.id || null
  };
}

// =========================================
// EXPORT
// =========================================

module.exports = getTopPlayers;

// Attach helper untuk advanced usage
module.exports.getTopN = function (data, n = 10) {
  return getTopPlayers(data, n);
};

module.exports.clearCache = function () {
  cache = {
    ref: null,
    keysLen: 0,
    sorted: null,
    timestamp: 0
  };
};