// =========================================
// http.js — Versi Fixed
// =========================================
//
// Fungsi:
// - getJSON(url, options) → GET request return JSON
// - postJSON(url, data, options) → POST request return JSON
//
// Fitur:
// - Auto-detect axios (preferred) atau fallback ke fetch
// - Timeout konsisten (axios & fetch)
// - Retry otomatis (2x)
// - AbortController untuk fetch
// - User-Agent header
// - Validasi input
// =========================================

// =========================================
// DETEKSI HTTP CLIENT
// =========================================

let axios = null;
let mode = "fetch"; // default
let clientDetected = false;

function detectClient() {
  if (clientDetected) return;

  clientDetected = true;

  try {
    axios = require("axios");
    mode = "axios";
    console.log("🔵 HTTP Mode: Axios aktif");
  } catch {
    axios = null;
    mode = "fetch";

    // Cek apakah fetch global tersedia (Node 18+)
    if (typeof fetch !== "function") {
      console.error(
        "❌ HTTP Mode: fetch tidak tersedia (butuh Node 18+ atau axios)."
      );
      mode = "unavailable";
    } else {
      console.log("🟢 HTTP Mode: Native Fetch aktif");
    }
  }
}

// Detect saat module load
detectClient();

// =========================================
// KONSTANTA
// =========================================

const DEFAULT_TIMEOUT = 10000; // 10 detik
const DEFAULT_RETRY = 2; // 2x percobaan
const RETRY_DELAY_MS = 500; // delay antar retry
const USER_AGENT = "Discord-Game-Bot/1.0";

// =========================================
// HELPER: VALIDASI URL
// =========================================

function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// =========================================
// HELPER: DELAY
// =========================================

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =========================================
// HELPER: FETCH DENGAN TIMEOUT
// =========================================

async function fetchWithTimeout(url, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(options.headers || {})
      },
      body: options.body,
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// =========================================
// HELPER: AXIOS REQUEST
// =========================================

async function axiosRequest(url, options = {}) {
  const res = await axios({
    url,
    method: options.method || "GET",
    timeout: options.timeout || DEFAULT_TIMEOUT,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(options.headers || {})
    },
    data: options.body,
    // Validasi response
    validateStatus: (status) => status >= 200 && status < 300
  });

  if (!res || res.data === undefined) {
    throw new Error("Response data kosong");
  }

  return res.data;
}

// =========================================
// CORE REQUEST
// =========================================

async function request(url, options = {}) {
  // =========================================
  // VALIDASI
  // =========================================
  if (!isValidUrl(url)) {
    throw new Error(`URL tidak valid: ${url}`);
  }

  if (mode === "unavailable") {
    throw new Error(
      "Tidak ada HTTP client tersedia. Install axios atau gunakan Node 18+."
    );
  }

  const maxRetry = Math.max(1, options.retry || DEFAULT_RETRY);
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      let data;

      if (mode === "axios" && axios) {
        data = await axiosRequest(url, options);
      } else {
        data = await fetchWithTimeout(url, options);
      }

      return data;
    } catch (err) {
      lastError = err;

      // Jangan retry kalau error validasi / client tidak ada
      if (
        err.name === "AbortError" ||
        err.message?.includes("timeout") ||
        err.code === "ECONNABORTED"
      ) {
        if (attempt < maxRetry) {
          console.warn(
            `⚠️ HTTP timeout (attempt ${attempt}/${maxRetry}): ${url}`
          );
          await delay(RETRY_DELAY_MS);
          continue;
        }
      }

      // Error lain: retry hanya jika bukan error logika
      if (attempt < maxRetry && !isNonRetryable(err)) {
        console.warn(
          `⚠️ HTTP error (attempt ${attempt}/${maxRetry}): ${err.message}`
        );
        await delay(RETRY_DELAY_MS);
        continue;
      }

      break;
    }
  }

  const errorMsg = lastError?.message || "Unknown error";
  console.error(`❌ HTTP gagal [${url}]:`, errorMsg);
  throw new Error(`HTTP request gagal: ${errorMsg}`);
}

// =========================================
// HELPER: NON-RETRYABLE ERROR
// =========================================

function isNonRetryable(err) {
  if (!err) return true;
  if (err.name === "AbortError") return true;

  const msg = String(err.message || "");

  // 4xx client errors → tidak retry
  if (/HTTP 4\d\d/.test(msg)) return true;

  return false;
}

// =========================================
// PUBLIC API
// =========================================

/**
 * GET JSON dari URL.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {number} [options.timeout] - timeout ms (default 10000)
 * @param {number} [options.retry] - jumlah percobaan (default 2)
 * @param {Object} [options.headers] - custom headers
 * @returns {Promise<any>}
 */
async function getJSON(url, options = {}) {
  return request(url, { ...options, method: "GET" });
}

/**
 * POST JSON ke URL.
 *
 * @param {string} url
 * @param {Object} data - body
 * @param {Object} [options]
 * @returns {Promise<any>}
 */
async function postJSON(url, data, options = {}) {
  const body = JSON.stringify(data);

  return request(url, {
    ...options,
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

// =========================================
// EXPORT
// =========================================

module.exports = {
  getJSON,
  postJSON,
  // Utility untuk debug
  getMode: () => mode
};