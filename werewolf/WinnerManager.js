"use strict";

// ===================================
// werewolf/WinnerManager.js
// ===================================

const { ROLES } = require("./RoleManager");
const { logErr } = require("./Utils");

function checkWinner(game) {
  try {
    if (!game || !game.players) return null;

    const alive = [...game.players.values()].filter((p) => p.alive);

    // ✅ Guard: tidak ada pemain hidup → game berakhir seri (villager)
    if (alive.length === 0) {
      console.warn(
        `[Werewolf] ⚠️ Tidak ada pemain hidup di game ${game.id}, default villager.`
      );
      return "villager";
    }

    const werewolvesAlive = alive.filter(
      (p) => p.role === ROLES.WEREWOLF
    ).length;
    const villagersAlive = alive.length - werewolvesAlive;

    if (werewolvesAlive === 0) return "villager";
    if (werewolvesAlive >= villagersAlive) return "werewolf";

    return null;
  } catch (err) {
    logErr(`WinnerManager.checkWinner(game ${game && game.id})`, err);
    return null;
  }
}

module.exports = { checkWinner };