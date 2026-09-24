// =========================================
// certificateGenerator.js
// Cute Certificate Generator (V7.2 - Fixed & Safe)
// =========================================
//
// Fitur:
// - Generate sertifikat PNG dengan canvas
// - Avatar, medal, laurel, owl, score card
// - Fallback untuk font, logo, avatar
// - Timeout & retry pada fetch
// - Path sanitization untuk keamanan
// =========================================

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const {
  createCanvas,
  loadImage,
  registerFont
} = require("@napi-rs/canvas");

// =========================================
// KONSTANTA
// =========================================

const FETCH_TIMEOUT = 10000; // 10 detik
const FETCH_RETRY = 2; // 2x retry

// =========================================
// REGISTER FONTS (dengan fallback aman)
// =========================================

const FONT_DIR = path.join(__dirname, "fonts");

const FONT_LIST = [
  { file: "PlayfairDisplay-Bold.ttf", family: "Playfair Display", weight: "bold" },
  { file: "GreatVibes-Regular.ttf", family: "Great Vibes" },
  { file: "Montserrat-Bold.ttf", family: "Montserrat", weight: "bold" },
  { file: "Merriweather-Italic.ttf", family: "Merriweather", style: "italic" },
  { file: "Lato-Regular.ttf", family: "Lato" }
];

let FONTS_REGISTERED = false;

function registerFontsSafe() {
  if (FONTS_REGISTERED) return;
  FONTS_REGISTERED = true;

  let registeredCount = 0;

  for (const font of FONT_LIST) {
    try {
      const fontPath = path.join(FONT_DIR, font.file);

      if (!fs.existsSync(fontPath)) {
        console.warn(`⚠️ Font tidak ditemukan: ${font.file} (pakai fallback)`);
        continue;
      }

      const options = { family: font.family };
      if (font.weight) options.weight = font.weight;
      if (font.style) options.style = font.style;

      registerFont(fontPath, options);
      registeredCount++;
    } catch (err) {
      console.warn(
        `⚠️ Gagal register font ${font.file}:`,
        err.message
      );
    }
  }

  console.log(
    `🎨 Font terdaftar: ${registeredCount}/${FONT_LIST.length}`
  );
}

// Register saat module load
registerFontsSafe();

// =========================================
// LOAD LOGO (cached, dengan fallback aman)
// =========================================

let LOGO_IMG = null;
let LOGO_LOADED = false;
const LOGO_PATH = path.join(__dirname, "assets", "logo.png");

async function getLogo() {
  if (LOGO_LOADED) return LOGO_IMG;
  LOGO_LOADED = true;

  try {
    if (!fs.existsSync(LOGO_PATH)) {
      console.warn("⚠️ logo.png tidak ditemukan (skip logo)");
      return null;
    }

    const buffer = fs.readFileSync(LOGO_PATH);

    if (!buffer || buffer.length === 0) {
      console.warn("⚠️ logo.png kosong");
      return null;
    }

    LOGO_IMG = await loadImage(buffer);
    console.log("✅ Logo berhasil di-load");
    return LOGO_IMG;
  } catch (err) {
    console.warn("⚠️ Gagal load logo:", err.message);
    return null;
  }
}

// =========================================
// UTIL
// =========================================

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error(`❌ Gagal buat direktori ${dir}:`, err.message);
    return false;
  }
}

function formatDate(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    d = new Date();
  }

  const m = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];

  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

function formatScore(score) {
  if (score === undefined || score === null || isNaN(score)) return "0";

  const n = Number(score);
  if (!isFinite(n)) return "0";

  return n.toLocaleString("id-ID");
}

function getPeriodLabel(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    d = new Date();
  }

  const day = d.getDate();

  // Toleransi: 14-16 dianggap paruh bulan, 29-31 dianggap akhir bulan
  if (day >= 14 && day <= 16) return "PARUH BULAN";
  if (day >= 29 && day <= 31) return "AKHIR BULAN";

  return null;
}

// =========================================
// SANITIZE FILENAME (anti path traversal)
// =========================================

function sanitizeFilename(name) {
  if (!name || typeof name !== "string") return "user";

  const sanitized = name
    .replace(/[^a-z0-9-_]/gi, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

  return sanitized || "user";
}

function sanitizeUserId(id) {
  if (!id || typeof id !== "string") return "0";
  return id.replace(/[^a-z0-9]/gi, "").slice(0, 32) || "0";
}

// =========================================
// LOAD IMAGE DENGAN TIMEOUT & RETRY
// =========================================

async function loadImageSafe(url, retries = FETCH_RETRY) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT
      );

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Discord-Game-Bot/1.0"
        }
      }).finally(() => clearTimeout(timeoutHandle));

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const arrayBuf = await res.arrayBuffer();

      if (!arrayBuf || arrayBuf.byteLength === 0) {
        throw new Error("Empty image buffer");
      }

      const buffer = Buffer.from(arrayBuf);

      if (buffer.length > 8 * 1024 * 1024) {
        throw new Error("Image too large (>8MB)");
      }

      return await loadImage(buffer);
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Gagal load image setelah ${retries} percobaan: ${err.message}`
        );
      }
      // Delay kecil sebelum retry
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// =========================================
// DRAWING HELPERS
// =========================================

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, stroke, lw = 2) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.closePath();
}

function drawMiniStar(ctx, cx, cy, size, color) {
  drawStar(ctx, cx, cy, 5, size, size * 0.45);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLeaf(ctx, x, y, length, angle, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, -length * 0.35, length, 0);
  ctx.quadraticCurveTo(length * 0.5, length * 0.35, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLaurelBranch(ctx, x, y, length, angle, flip = false, color = "#B8860B") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (flip) ctx.scale(1, -1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, length * 0.35, length, length * 0.15);
  ctx.stroke();

  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const t = (i + 1) / (leafCount + 1);
    const lx = length * t * 0.95;
    const ly = length * 0.35 * Math.sin(t * Math.PI) * 0.9;
    const size = length * 0.12;
    drawLeaf(ctx, lx, ly, size, -Math.PI / 4, color);
    drawLeaf(ctx, lx, ly, size, Math.PI * 0.75, color, 0.85);
  }
  ctx.restore();
}

function drawMedal(ctx, cx, cy, radius) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const mg = ctx.createRadialGradient(
    cx - radius * 0.3,
    cy - radius * 0.3,
    radius * 0.1,
    cx,
    cy,
    radius
  );
  mg.addColorStop(0, "#FFF1A8");
  mg.addColorStop(0.5, "#D4A017");
  mg.addColorStop(1, "#8B6508");
  ctx.fillStyle = mg;
  ctx.fill();

  ctx.strokeStyle = "#8B6508";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.stroke();

  drawStar(ctx, cx, cy + 3, 5, radius * 0.55, radius * 0.23);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#8B6508";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#0F1B33";
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.55, cy + radius * 0.95);
  ctx.lineTo(cx - radius * 0.85, cy + radius * 1.95);
  ctx.lineTo(cx - radius * 0.20, cy + radius * 1.55);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + radius * 0.55, cy + radius * 0.95);
  ctx.lineTo(cx + radius * 0.85, cy + radius * 1.95);
  ctx.lineTo(cx + radius * 0.20, cy + radius * 1.55);
  ctx.closePath();
  ctx.fill();
}

function drawOwlSilhouette(ctx, cx, cy, size, opacity = 0.35) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(cx, cy);

  const bodyGrad = ctx.createRadialGradient(
    -size * 0.1,
    -size * 0.1,
    size * 0.1,
    0,
    0,
    size * 0.75
  );
  bodyGrad.addColorStop(0, "#D4B483");
  bodyGrad.addColorStop(0.6, "#8B6F47");
  bodyGrad.addColorStop(1, "#4A3520");
  ctx.beginPath();
  ctx.ellipse(0, size * 0.15, size * 0.6, size * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  const headGrad = ctx.createRadialGradient(
    -size * 0.15,
    -size * 0.55,
    size * 0.05,
    0,
    -size * 0.45,
    size * 0.55
  );
  headGrad.addColorStop(0, "#E8CFA0");
  headGrad.addColorStop(0.7, "#9B7B50");
  headGrad.addColorStop(1, "#4A3520");
  ctx.beginPath();
  ctx.arc(0, -size * 0.45, size * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-size * 0.42, -size * 0.8);
  ctx.lineTo(-size * 0.3, -size * 0.95);
  ctx.lineTo(-size * 0.2, -size * 0.75);
  ctx.closePath();
  ctx.fillStyle = "#6B4F35";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.42, -size * 0.8);
  ctx.lineTo(size * 0.3, -size * 0.95);
  ctx.lineTo(size * 0.2, -size * 0.75);
  ctx.closePath();
  ctx.fill();

  // Mata kiri
  ctx.beginPath();
  ctx.arc(-size * 0.2, -size * 0.48, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#FFF6D5";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-size * 0.2, -size * 0.48, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#D4A017";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-size * 0.2, -size * 0.48, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  // Mata kanan
  ctx.beginPath();
  ctx.arc(size * 0.2, -size * 0.48, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#FFF6D5";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.2, -size * 0.48, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#D4A017";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.2, -size * 0.48, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  // Paruh
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.42);
  ctx.lineTo(-size * 0.06, -size * 0.3);
  ctx.lineTo(size * 0.06, -size * 0.3);
  ctx.closePath();
  ctx.fillStyle = "#E6C458";
  ctx.fill();

  // Top hat
  fillRoundRect(
    ctx,
    -size * 0.38,
    -size * 1.12,
    size * 0.76,
    size * 0.45,
    size * 0.05,
    "#1A1A1A"
  );
  ctx.fillStyle = "#C9A227";
  ctx.fillRect(-size * 0.38, -size * 0.8, size * 0.76, size * 0.06);
  fillRoundRect(
    ctx,
    -size * 0.55,
    -size * 0.72,
    size * 1.1,
    size * 0.08,
    size * 0.04,
    "#0A0A0A"
  );

  ctx.restore();
}

// =========================================
// MAIN FUNCTION
// =========================================

async function generateCuteCertificate({
  userId,
  username,
  rank,
  score = 0,
  avatarURL,
  backgroundURL,
  issuer = process.env.CERTIFICATE_ISSUER ||
    process.env.BOT_NAME ||
    "Discord Game Bot",
  outputDir = path.join(__dirname, "certs"),
  certDate = new Date()
}) {
  // =========================================
  // VALIDASI INPUT
  // =========================================
  if (!username || typeof username !== "string") {
    username = "Champion";
  }

  if (!rank || isNaN(Number(rank))) {
    rank = 1;
  } else {
    rank = Number(rank);
  }

  if (score === undefined || score === null || isNaN(Number(score))) {
    score = 0;
  } else {
    score = Number(score);
  }

  if (!issuer || typeof issuer !== "string") {
    issuer = "Discord Game Bot";
  }

  if (!(certDate instanceof Date) || isNaN(certDate.getTime())) {
    certDate = new Date();
  }

  // Pastikan output dir ada
  if (!ensureDir(outputDir)) {
    throw new Error(`Tidak bisa membuat direktori output: ${outputDir}`);
  }

  // =========================================
  // SETUP CANVAS
  // =========================================
  const WIDTH = 2480;
  const HEIGHT = 1754;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const C = {
    bg1: "#FFFDF5",
    bg2: "#F5E9C8",
    bg3: "#E8D9A8",
    navyDark: "#0F1B33",
    navy: "#1B2A4A",
    gold: "#B8860B",
    goldBright: "#D4A017",
    goldDeep: "#8B6508",
    goldLight: "#E6C458",
    cream: "#FFF8E1",
    red: "#7A0C1E",
    textMuted: "#4A4A4A"
  };

  // =========================================
  // BACKGROUND
  // =========================================
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, C.bg1);
  g.addColorStop(0.5, C.bg2);
  g.addColorStop(1, C.bg3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const rg = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT * 0.4,
    100,
    WIDTH / 2,
    HEIGHT * 0.4,
    WIDTH * 0.65
  );
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.6, "rgba(255,248,225,0.5)");
  rg.addColorStop(1, "rgba(255,248,225,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // =========================================
  // OWL SILHOUETTES
  // =========================================
  drawOwlSilhouette(ctx, 380, HEIGHT * 0.42, 750, 0.35);
  ctx.save();
  ctx.translate(WIDTH, 0);
  ctx.scale(-1, 1);
  drawOwlSilhouette(ctx, 380, HEIGHT * 0.42, 750, 0.35);
  ctx.restore();

  // =========================================
  // ORNAMEN LENGKUNG
  // =========================================
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 8;
  for (let r = 250; r <= 700; r += 80) {
    ctx.beginPath();
    ctx.arc(WIDTH / 2, 300, r, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  ctx.restore();

  // =========================================
  // BORDER BERLAPIS
  // =========================================
  const M = 40;

  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 24;
  ctx.strokeRect(M, M, WIDTH - M * 2, HEIGHT - M * 2);

  ctx.strokeStyle = C.navyDark;
  ctx.lineWidth = 8;
  ctx.strokeRect(
    M + 26,
    M + 26,
    WIDTH - (M + 26) * 2,
    HEIGHT - (M + 26) * 2
  );

  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(
    M + 44,
    M + 44,
    WIDTH - (M + 44) * 2,
    HEIGHT - (M + 44) * 2
  );

  ctx.strokeStyle = "rgba(15,27,51,0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    M + 56,
    M + 56,
    WIDTH - (M + 56) * 2,
    HEIGHT - (M + 56) * 2
  );

  // =========================================
  // LAUREL DI 4 SUDUT
  // =========================================
  const cornerPositions = [
    { x: M + 110, y: M + 110, a: Math.PI * 0.25, flip: false },
    { x: WIDTH - M - 110, y: M + 110, a: Math.PI * 0.75, flip: false },
    { x: M + 110, y: HEIGHT - M - 110, a: -Math.PI * 0.25, flip: true },
    {
      x: WIDTH - M - 110,
      y: HEIGHT - M - 110,
      a: -Math.PI * 0.75,
      flip: true
    }
  ];

  cornerPositions.forEach((p) => {
    drawLaurelBranch(ctx, p.x, p.y, 180, p.a, p.flip, C.gold);
    drawLaurelBranch(ctx, p.x, p.y, 180, p.a + Math.PI / 2, !p.flip, C.gold);
  });

  // =========================================
  // MEDALI
  // =========================================
  const medalY = 240;
  const medalR = 105;
  drawMedal(ctx, WIDTH / 2, medalY, medalR);

  // =========================================
  // JUDUL
  // =========================================
  ctx.font = "bold 155px 'Playfair Display', serif";
  ctx.save();
  ctx.shadowColor = "rgba(15,27,51,0.3)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = C.navyDark;
  ctx.fillText("SERTIFIKAT", WIDTH / 2, 620);
  ctx.restore();

  ctx.font = "bold 62px 'Montserrat', sans-serif";
  ctx.fillStyle = C.goldDeep;
  const subText = "PENGHARGAAN ISTIMEWA";
  ctx.fillText(subText, WIDTH / 2, 700);

  const subWidth = ctx.measureText(subText).width;
  drawLeaf(ctx, WIDTH / 2 - subWidth / 2 - 70, 685, 40, Math.PI, C.gold, 0.9);
  drawLeaf(
    ctx,
    WIDTH / 2 - subWidth / 2 - 40,
    685,
    35,
    Math.PI * 1.15,
    C.gold,
    0.9
  );
  drawLeaf(ctx, WIDTH / 2 + subWidth / 2 + 70, 685, 40, 0, C.gold, 0.9);
  drawLeaf(
    ctx,
    WIDTH / 2 + subWidth / 2 + 40,
    685,
    35,
    -Math.PI * 0.15,
    C.gold,
    0.9
  );

  // =========================================
  // BADGE JUARA
  // =========================================
  const badgeY = 780;
  const badgeH = 110;

  const period = getPeriodLabel(certDate);
  const badgeText = period
    ? `JUARA ${rank}   •   ${period}`
    : `JUARA ${rank}`;

  ctx.font = "bold 66px 'Montserrat', sans-serif";
  const badgeTextWidth = ctx.measureText(badgeText).width;
  const badgeW = badgeTextWidth + 220;
  const badgeX = WIDTH / 2 - badgeW / 2;

  fillRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2, C.navyDark);
  strokeRoundRect(
    ctx,
    badgeX,
    badgeY,
    badgeW,
    badgeH,
    badgeH / 2,
    C.gold,
    5
  );

  drawMiniStar(
    ctx,
    badgeX + 60,
    badgeY + badgeH / 2,
    22,
    C.goldBright
  );
  drawMiniStar(
    ctx,
    badgeX + badgeW - 60,
    badgeY + badgeH / 2,
    22,
    C.goldBright
  );

  ctx.fillStyle = "#FFF6D5";
  ctx.fillText(badgeText, WIDTH / 2, badgeY + badgeH / 2 + 24);

  // =========================================
  // DIBERIKAN KEPADA
  // =========================================
  ctx.font = "italic 58px 'Merriweather', serif";
  ctx.fillStyle = C.textMuted;
  ctx.fillText("Dengan bangga diberikan kepada", WIDTH / 2, 990);

  // =========================================
  // NAMA PENERIMA
  // =========================================
  const nameY = 1140;
  const nameFontSize = 170;

  ctx.font = `${nameFontSize}px 'Great Vibes', cursive`;
  ctx.save();
  ctx.shadowColor = "rgba(122,12,30,0.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = C.red;
  ctx.fillText(username, WIDTH / 2, nameY);
  ctx.restore();

  const nameW = Math.min(
    ctx.measureText(username).width + 300,
    WIDTH - 800
  );

  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - nameW / 2, nameY + 50);
  ctx.lineTo(WIDTH / 2 + nameW / 2, nameY + 50);
  ctx.stroke();

  drawLeaf(ctx, WIDTH / 2 - nameW / 2 - 10, nameY + 50, 40, Math.PI, C.gold);
  drawLeaf(ctx, WIDTH / 2 + nameW / 2 + 10, nameY + 50, 40, 0, C.gold);

  // =========================================
  // AVATAR (dengan fallback)
  // =========================================
  const AV = 280;
  const AV_CY = 1430;

  ctx.beginPath();
  ctx.arc(WIDTH / 2, AV_CY, AV / 2 + 25, 0, Math.PI * 2);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(WIDTH / 2, AV_CY, AV / 2 + 12, 0, Math.PI * 2);
  ctx.strokeStyle = C.navyDark;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(WIDTH / 2, AV_CY, AV / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.stroke();

  const avR = AV / 2 + 60;
  for (let i = 0; i < 6; i++) {
    const angle = ((Math.PI * 2) / 6) * i + Math.PI / 6;
    const fx = WIDTH / 2 + Math.cos(angle) * avR;
    const fy = AV_CY + Math.sin(angle) * avR;
    drawLeaf(ctx, fx, fy, 40, angle + Math.PI, C.gold, 0.85);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, AV_CY, AV / 2, 0, Math.PI * 2);
  ctx.clip();

  let avatarLoaded = false;

  if (avatarURL && typeof avatarURL === "string") {
    try {
      const av = await loadImageSafe(avatarURL);
      const scale = Math.max(AV / av.width, AV / av.height);
      const dw = av.width * scale;
      const dh = av.height * scale;
      ctx.drawImage(av, WIDTH / 2 - dw / 2, AV_CY - dh / 2, dw, dh);
      avatarLoaded = true;
    } catch (err) {
      console.warn("⚠️ Gagal load avatar:", err.message);
    }
  }

  if (!avatarLoaded) {
    // Fallback: gray circle
    ctx.fillStyle = "#E0E0E0";
    ctx.fillRect(WIDTH / 2 - AV / 2, AV_CY - AV / 2, AV, AV);
  }

  ctx.restore();

  // =========================================
  // SCORE CARD
  // =========================================
  const scoreY = 1560;
  const scoreH = 95;

  ctx.font = "bold 60px 'Montserrat', sans-serif";
  const scoreText = `${formatScore(score)} POIN`;
  const scoreTextWidth = ctx.measureText(scoreText).width;
  const scoreW = scoreTextWidth + 220;
  const scoreX = WIDTH / 2 - scoreW / 2;

  const sg = ctx.createLinearGradient(
    scoreX,
    scoreY,
    scoreX + scoreW,
    scoreY + scoreH
  );
  sg.addColorStop(0, "#FFF8E1");
  sg.addColorStop(1, "#F0D88A");

  fillRoundRect(
    ctx,
    scoreX,
    scoreY,
    scoreW,
    scoreH,
    scoreH / 2,
    sg
  );
  strokeRoundRect(
    ctx,
    scoreX,
    scoreY,
    scoreW,
    scoreH,
    scoreH / 2,
    C.gold,
    4
  );

  drawMiniStar(ctx, scoreX + 55, scoreY + scoreH / 2, 18, C.goldDeep);
  drawMiniStar(
    ctx,
    scoreX + scoreW - 55,
    scoreY + scoreH / 2,
    18,
    C.goldDeep
  );

  ctx.fillStyle = C.navyDark;
  ctx.fillText(scoreText, WIDTH / 2, scoreY + scoreH / 2 + 22);

  // =========================================
  // FOOTER
  // =========================================
  const footerY = 1580;

  ctx.font = "bold 50px 'Playfair Display', serif";
  ctx.fillStyle = C.navyDark;
  ctx.fillText(formatDate(certDate), WIDTH / 2 - 620, footerY);

  ctx.font = "32px 'Lato', sans-serif";
  ctx.fillStyle = "#777777";
  ctx.fillText("TANGGAL", WIDTH / 2 - 620, footerY + 45);

  ctx.font = "bold 50px 'Playfair Display', serif";
  ctx.fillStyle = C.navyDark;
  ctx.fillText(issuer, WIDTH / 2 + 620, footerY);

  ctx.font = "32px 'Lato', sans-serif";
  ctx.fillStyle = "#777777";
  ctx.fillText("PENYELENGGARA", WIDTH / 2 + 620, footerY + 45);

  const dividerY = footerY - 25;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 300, dividerY);
  ctx.lineTo(WIDTH / 2 - 80, dividerY);
  ctx.moveTo(WIDTH / 2 + 80, dividerY);
  ctx.lineTo(WIDTH / 2 + 300, dividerY);
  ctx.stroke();

  drawMiniStar(ctx, WIDTH / 2, dividerY, 16, C.gold);
  drawLeaf(ctx, WIDTH / 2 - 30, dividerY, 30, Math.PI, C.gold, 0.85);
  drawLeaf(ctx, WIDTH / 2 + 30, dividerY, 30, 0, C.gold, 0.85);

  // =========================================
  // SIMPAN (dengan sanitize)
  // =========================================
  const safeName = sanitizeFilename(username);
  const safeId = sanitizeUserId(userId);
  const filePath = path.join(outputDir, `${safeName}_${safeId}.png`);

  let buffer;
  try {
    buffer = canvas.toBuffer("image/png");
  } catch (err) {
    throw new Error(`Gagal membuat buffer PNG: ${err.message}`);
  }

  if (!buffer || buffer.length === 0) {
    throw new Error("Buffer PNG kosong.");
  }

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    throw new Error(`Gagal menulis file ${filePath}: ${err.message}`);
  }

  return filePath;
}

module.exports = generateCuteCertificate;