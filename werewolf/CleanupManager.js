"use strict";

// ===================================
// werewolf/CleanupManager.js
// ===================================

const RoomManager = require("./RoomManager");
const EmbedManager = require("./EmbedManager");
const TimerManager = require("./TimerManager");
const { logErr, logStep } = require("./Utils");

const DELETE_ROOM_DELAY_MS = 15000;

async function disableAndCloseDm(message) {
  if (!message) return;
  try {
    await message.edit({
      embeds: [EmbedManager.gameOverDmEmbed()],
      components: []
    });
  } catch (err) {
    // Silent: DM mungkin sudah dihapus / channel closed
  }
}

async function cleanupGame(game, gm, opts = {}) {
  if (!game) return;

  if (game._cleaned) {
    console.log(
      `[Werewolf] Cleanup untuk game ${game.id} sudah pernah dijalankan, dilewati.`
    );
    return;
  }
  game._cleaned = true;

  logStep(game, "Cleanup");
  console.log(`[Werewolf] 🧹 Cleanup dimulai untuk game ${game.id}`);

  // 1. Batalkan semua timer aktif
  try {
    TimerManager.clearAllTimers(game);
  } catch (err) {
    logErr("CleanupManager.cleanupGame clearAllTimers", err);
  }

  // 2. Hentikan collector lobby jika masih berjalan
  if (game.lobbyCollector) {
    try {
      game.lobbyCollector.stop("cleanup");
    } catch (err) {
      logErr("CleanupManager.cleanupGame stopLobbyCollector", err);
    }
  }

  // 3. Disable component di pesan lobby
  // ✅ Fix: require di luar untuk hindari circular dependency issue
  try {
    const { disableLobbyButtons } = require("./LobbyManager");
    await disableLobbyButtons(game);
  } catch (err) {
    logErr("CleanupManager.cleanupGame disableLobbyButtons", err);
  }

  // 4. Disable & tutup semua DM player, reset status
  for (const player of game.players.values()) {
    try {
      await disableAndCloseDm(player.lastDmMessage);
    } catch (err) {
      logErr(`CleanupManager.cleanupGame disableDm(${player.username})`, err);
    }
    player.alive = false;
  }

  // 5. Bersihkan cache & hapus game dari activeGames
  game.nightData = {};
  game.voteData = null;
  game.state = "ended";

  try {
    gm.deleteGame(game);
  } catch (err) {
    logErr("CleanupManager.cleanupGame deleteGame", err);
  }

  console.log(
    `[Werewolf] Game ${game.id} dihapus dari activeGames. Room dihapus dalam ${DELETE_ROOM_DELAY_MS / 1000} detik.`
  );

  // 6. Hapus room setelah delay
  // ✅ Simpan handle di game._cleanupHandle supaya bisa dibatalkan
  //    kalau bot restart.
  const timeoutHandle = setTimeout(async () => {
    try {
      await RoomManager.deleteRoomChannel(game.roomChannel);
      console.log(`[Werewolf] Room untuk game ${game.id} telah dihapus.`);
    } catch (err) {
      logErr(`CleanupManager.cleanupGame deleteRoomChannel(${game.id})`, err);
    }
  }, DELETE_ROOM_DELAY_MS);

  game._cleanupHandle = timeoutHandle;

  // Optional external register
  if (opts && typeof opts.registerHandle === "function") {
    try {
      opts.registerHandle(timeoutHandle);
    } catch (err) {
      logErr("CleanupManager.cleanupGame registerHandle", err);
    }
  }
}

module.exports = { cleanupGame, DELETE_ROOM_DELAY_MS };