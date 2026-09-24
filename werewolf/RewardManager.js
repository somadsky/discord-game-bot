"use strict";

// ===================================
// werewolf/RewardManager.js
// Memberi reward ke tim pemenang.
// ===================================

const { getTeam } = require("./RoleManager");
const { ensureUser, logErr } = require("./Utils");

const REWARD_AMOUNT = 250;

function rewardWinners(game, winnerTeam, data, saveData) {
  const winners = [];

  if (!game || !game.players) {
    return { winners, reward: REWARD_AMOUNT };
  }

  for (const player of game.players.values()) {
    try {
      const team = getTeam(player.role);
      if (team !== winnerTeam) continue;

      ensureUser(data, player.id, saveData);

      // ✅ Guard: pastikan data[player.id] ada & cash number
      if (data[player.id] && typeof data[player.id].cash === "number") {
        data[player.id].cash += REWARD_AMOUNT;
      }

      winners.push(player.username);
      console.log(
        `[Werewolf] 💰 Reward +${REWARD_AMOUNT} untuk ${player.username} (${player.id})`
      );
    } catch (err) {
      logErr(
        `RewardManager.rewardWinners player(${player && player.id})`,
        err
      );
    }
  }

  try {
    if (typeof saveData === "function") saveData();
  } catch (err) {
    logErr("RewardManager.rewardWinners saveData", err);
  }

  return { winners, reward: REWARD_AMOUNT };
}

module.exports = { rewardWinners, REWARD_AMOUNT };