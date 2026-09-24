"use strict";

// ===================================
// werewolf/RoleManager.js
// Menentukan komposisi role berdasarkan jumlah player,
// lalu mengacak & membagikannya.
// ===================================

const { shuffle, logErr } = require("./Utils");

const ROLES = {
  WEREWOLF: "Werewolf",
  VILLAGER: "Villager",
  LYCAN: "Lycan",
  SEER: "Seer",
  BODYGUARD: "Bodyguard"
};

const TEAM = {
  WEREWOLF: "werewolf",
  VILLAGER: "villager"
};

// ✅ Minimum player untuk game valid
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 20;

function getTeam(role) {
  return role === ROLES.WEREWOLF ? TEAM.WEREWOLF : TEAM.VILLAGER;
}

function getRoleCounts(playerCount) {
  // ✅ Guard: kalau player < 4, tetap return minimal 1 wolf
  if (playerCount < MIN_PLAYERS) {
    console.warn(
      `[Werewolf] ⚠️ getRoleCounts dipanggil dengan ${playerCount} pemain (< ${MIN_PLAYERS})`
    );
  }

  const werewolf = playerCount >= 8 ? 2 : 1;
  const seer = 1;
  const bodyguard = 1;
  const lycan = playerCount >= 5 ? 1 : 0;

  const fixed = werewolf + seer + bodyguard + lycan;
  const villager = Math.max(playerCount - fixed, 0);

  return { werewolf, seer, bodyguard, lycan, villager };
}

function buildRolePool(playerCount) {
  const counts = getRoleCounts(playerCount);
  const pool = [];

  for (let i = 0; i < counts.werewolf; i++) pool.push(ROLES.WEREWOLF);
  for (let i = 0; i < counts.seer; i++) pool.push(ROLES.SEER);
  for (let i = 0; i < counts.bodyguard; i++) pool.push(ROLES.BODYGUARD);
  for (let i = 0; i < counts.lycan; i++) pool.push(ROLES.LYCAN);
  for (let i = 0; i < counts.villager; i++) pool.push(ROLES.VILLAGER);

  return pool;
}

function assignRoles(playerIds) {
  try {
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new Error("playerIds kosong atau bukan array");
    }

    const pool = shuffle(buildRolePool(playerIds.length));
    const shuffledPlayers = shuffle(playerIds);

    const assignment = new Map();
    shuffledPlayers.forEach((userId, idx) => {
      assignment.set(userId, pool[idx]);
    });

    return assignment;
  } catch (err) {
    logErr("RoleManager.assignRoles", err);
    // Fallback darurat: semua jadi Villager kecuali satu Werewolf
    const assignment = new Map();
    playerIds.forEach((userId, idx) => {
      assignment.set(userId, idx === 0 ? ROLES.WEREWOLF : ROLES.VILLAGER);
    });
    return assignment;
  }
}

function roleDescription(role) {
  switch (role) {
    case ROLES.WEREWOLF:
      return "Kamu adalah **Werewolf** 🐺\nSetiap malam kamu memilih satu korban bersama sesama Werewolf.\nMenang jika jumlah Werewolf hidup ≥ jumlah warga hidup.";
    case ROLES.VILLAGER:
      return "Kamu adalah **Villager** 🧑\nKamu tidak memiliki skill khusus. Gunakan diskusi dan votingmu dengan bijak.";
    case ROLES.LYCAN:
      return "Kamu adalah **Lycan** 🐾\nKamu berada di tim Villager dan tidak memiliki skill. Namun jika diterawang Seer, kamu akan terlihat sebagai Werewolf.";
    case ROLES.SEER:
      return "Kamu adalah **Seer** 🔮\nSetiap malam kamu bisa menerawang satu pemain untuk mengetahui apakah dia Werewolf atau bukan.";
    case ROLES.BODYGUARD:
      return "Kamu adalah **Bodyguard** 🛡️\nSetiap malam kamu bisa melindungi satu pemain (boleh diri sendiri) dari serangan Werewolf.";
    default:
      return "Role tidak dikenali.";
  }
}

module.exports = {
  ROLES,
  TEAM,
  MIN_PLAYERS,
  MAX_PLAYERS,
  getTeam,
  getRoleCounts,
  buildRolePool,
  assignRoles,
  roleDescription
};