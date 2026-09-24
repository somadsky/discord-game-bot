"use strict";

// ===================================
// werewolf/GameManager.js
// ===================================

const { generateGameId, sleep, logErr, logStep } = require("./Utils");
const RoleManager = require("./RoleManager");
const EmbedManager = require("./EmbedManager");
const NightManager = require("./NightManager");
const DayManager = require("./DayManager");
const VoteManager = require("./VoteManager");
const WinnerManager = require("./WinnerManager");
const RewardManager = require("./RewardManager");
const CleanupManager = require("./CleanupManager");
const TimerManager = require("./TimerManager");
const RoomManager = require("./RoomManager");

// ===================================
// TIMER
// ===================================
const ROLE_REVEAL_MS = 8000;
const ROLE_REVEAL_CHECKPOINTS = [8, 6, 5, 4, 3, 2, 1];
const NIGHT_INTRO_PAUSE_MS = 2000;
const RESOLVE_PAUSE_MS = 3000;
const MORNING_PAUSE_MS = 5000;
const RESULT_PAUSE_MS = 5000;
const WINNER_PAUSE_MS = 3000;
const MAX_ROUNDS_SAFETY = 30;

class GameManager {
  constructor() {
    this.activeGames = new Map();
    this.playerGameMap = new Map();
    this.channelGameMap = new Map();
  }

  isUserInGame(userId) {
    return this.playerGameMap.has(userId);
  }

  createGame({ guild, hostId, roomChannel }) {
    const id = generateGameId();

    const game = {
      id,
      guild,
      guildId: guild.id,
      hostId,
      roomChannel,
      roomChannelId: roomChannel.id,
      state: "lobby",
      round: 0,
      stepCounter: 0,
      players: new Map(),
      lobbyMessage: null,
      lobbyCollector: null,
      nightData: {},
      voteData: null,
      timers: new Set(),
      createdAt: Date.now(),
      _cleaned: false,
      _cleanupHandle: null
    };

    this.activeGames.set(id, game);
    this.channelGameMap.set(roomChannel.id, id);

    logStep(game, "Lobby dibuat");
    return game;
  }

  getGame(gameId) {
    return this.activeGames.get(gameId) || null;
  }

  getGameByChannel(channelId) {
    const id = this.channelGameMap.get(channelId);
    return id ? this.activeGames.get(id) : null;
  }

  getGameByUser(userId) {
    const id = this.playerGameMap.get(userId);
    return id ? this.activeGames.get(id) : null;
  }

  addPlayer(game, user) {
    if (!game || !user) return;

    game.players.set(user.id, {
      id: user.id,
      username: user.username,
      user,
      role: null,
      alive: true,
      dmChannel: null,
      lastDmMessage: null,
      dmFailed: false
    });
    this.playerGameMap.set(user.id, game.id);
  }

  removePlayer(game, userId) {
    game.players.delete(userId);
    this.playerGameMap.delete(userId);
  }

  alivePlayers(game) {
    return [...game.players.values()].filter((p) => p.alive);
  }

  deleteGame(game) {
    for (const userId of game.players.keys()) {
      this.playerGameMap.delete(userId);
    }
    this.channelGameMap.delete(game.roomChannelId);
    this.activeGames.delete(game.id);
  }

  _safeCheckWinner(game) {
    try {
      return WinnerManager.checkWinner(game);
    } catch (err) {
      logErr(`GameManager._safeCheckWinner(game ${game.id})`, err);
      return null;
    }
  }

  async _sendRoleDms(game) {
    logStep(game, "Role dibagikan");
    console.log(
      `[Werewolf] 📨 Mengirim DM ke ${game.players.size} pemain...`
    );

    const failed = [];

    await Promise.all(
      [...game.players.values()].map(async (player) => {
        try {
          const dmChannel =
            player.dmChannel || (await player.user.createDM());
          player.dmChannel = dmChannel;

          const dmMessage = await dmChannel.send({
            embeds: [
              EmbedManager.roleDmEmbed(
                player.role,
                RoleManager.roleDescription(player.role)
              )
            ]
          });
          player.lastDmMessage = dmMessage;
          console.log(`[Werewolf] ✅ DM terkirim ke ${player.username}`);
        } catch (err) {
          logErr(`GameManager._sendRoleDms(${player.username})`, err);
          player.dmFailed = true;
          failed.push(player.username);
          console.log(
            `⚠️ [Werewolf] Gagal kirim DM ke ${player.username}`
          );
        }
      })
    );

    if (failed.length > 0 && !game._cleaned) {
      try {
        await game.roomChannel.send(
          `⚠️ **Perhatian:** User berikut tidak bisa di-DM:\n` +
            failed.map((n) => `• **${n}**`).join("\n") +
            `\n\nUser-user ini tetap bisa main, tapi cek DM harus dibuka manual.`
        );
      } catch (err) {
        logErr("GameManager._sendRoleDms sendFallbackNotice", err);
      }
    }
  }

  async _runRoleRevealCountdown(game) {
    console.log(
      `[Werewolf] ⏱️ Mulai countdown role reveal (${ROLE_REVEAL_MS}ms)...`
    );

    let countdownMessage = null;
    try {
      countdownMessage = await game.roomChannel.send({
        embeds: [EmbedManager.roleRevealEmbed(ROLE_REVEAL_CHECKPOINTS[0])]
      });
    } catch (err) {
      logErr("GameManager._runRoleRevealCountdown send", err);
    }

    try {
      await TimerManager.runCheckpointCountdown(
        game,
        ROLE_REVEAL_MS,
        ROLE_REVEAL_CHECKPOINTS.slice(1),
        async (secondsLeft) => {
          if (!countdownMessage || game._cleaned) return;
          try {
            await countdownMessage.edit({
              embeds: [EmbedManager.roleRevealEmbed(secondsLeft)]
            });
          } catch (err) {
            logErr("GameManager._runRoleRevealCountdown edit", err);
          }
        }
      );
    } catch (err) {
      logErr("GameManager._runRoleRevealCountdown runCountdown", err);
    }
  }

  async _runRound(game) {
    let victimName = null;

    // ✅ Guard cleanup
    if (game._cleaned) return null;

    await sleep(NIGHT_INTRO_PAUSE_MS);
    if (game._cleaned) return null;

    try {
      const result = await NightManager.runNight(game);
      victimName = result ? result.victimName : null;
    } catch (err) {
      logErr(`GameManager._runRound runNight(game ${game.id})`, err);
    }

    // ✅ Guard cleanup setelah night
    if (game._cleaned) return null;

    let winnerTeam = this._safeCheckWinner(game);
    if (winnerTeam) return winnerTeam;

    await sleep(RESOLVE_PAUSE_MS);
    if (game._cleaned) return null;

    try {
      await DayManager.runMorning(game, victimName);
    } catch (err) {
      logErr(`GameManager._runRound runMorning(game ${game.id})`, err);
    }

    await sleep(MORNING_PAUSE_MS);
    if (game._cleaned) return null;

    try {
      await DayManager.runDiscussion(game);
    } catch (err) {
      logErr(`GameManager._runRound runDiscussion(game ${game.id})`, err);
    }

    if (game._cleaned) return null;

    try {
      await VoteManager.runVote(game);
    } catch (err) {
      logErr(`GameManager._runRound runVote(game ${game.id})`, err);
    }

    await sleep(RESULT_PAUSE_MS);
    if (game._cleaned) return null;

    return this._safeCheckWinner(game);
  }

  _forceDetermineWinner(game) {
    const alive = this.alivePlayers(game);
    const werewolvesAlive = alive.filter(
      (p) => p.role === RoleManager.ROLES.WEREWOLF
    ).length;
    const villagersAlive = alive.length - werewolvesAlive;

    // ✅ Kalau tidak ada werewolf / tidak ada villager, force villager
    if (werewolvesAlive === 0) return "villager";
    if (villagersAlive === 0) return "werewolf";

    return werewolvesAlive >= villagersAlive ? "werewolf" : "villager";
  }

  async startGame(game, data, saveData) {
    logStep(game, "Game dimulai");
    console.log(
      `[Werewolf] 🎮 Membagikan role untuk game ${game.id} (${game.players.size} pemain)`
    );

    let winnerTeam = null;

    try {
      if (game._cleaned) return;

      // 1. ASSIGN ROLE
      const playerIds = [...game.players.keys()];
      const assignment = RoleManager.assignRoles(playerIds);

      for (const [userId, role] of assignment.entries()) {
        const player = game.players.get(userId);
        if (player) player.role = role;
      }

      // 2. KUNCI ROOM
      try {
        await RoomManager.lockRoomToPlayers(game.roomChannel, playerIds);
      } catch (err) {
        logErr("GameManager.startGame lockRoomToPlayers", err);
      }

      // 3. KIRIM DM ROLE
      if (game._cleaned) return;
      await this._sendRoleDms(game);

      // 4. ANNOUNCEMENT
      if (game._cleaned) return;
      try {
        await game.roomChannel.send(
          "🎭 Role telah dibagikan lewat DM. Cek DM kamu! Game akan segera dimulai..."
        );
      } catch (err) {
        logErr("GameManager.startGame sendRoleAnnouncement", err);
      }

      // 5. COUNTDOWN
      if (game._cleaned) return;
      await this._runRoleRevealCountdown(game);

      // 6. LOOP RONDE
      let roundsPlayed = 0;
      while (!winnerTeam) {
        if (game._cleaned) return;

        roundsPlayed += 1;
        console.log(
          `[Werewolf] 🎯 === RONDE ${roundsPlayed} (game ${game.id}) ===`
        );

        if (roundsPlayed > MAX_ROUNDS_SAFETY) {
          console.log(
            `[Werewolf] ⚠️ Game ${game.id} melebihi batas aman ${MAX_ROUNDS_SAFETY} ronde.`
          );
          winnerTeam = this._forceDetermineWinner(game);
          break;
        }

        winnerTeam = await this._runRound(game);

        if (game._cleaned) return;
      }

      // 7. REWARD
      logStep(game, "Winner");
      await sleep(WINNER_PAUSE_MS);

      if (game._cleaned) return;

      const { winners, reward } = RewardManager.rewardWinners(
        game,
        winnerTeam,
        data,
        saveData
      );

      try {
        await game.roomChannel.send({
          embeds: [EmbedManager.winnerEmbed(winnerTeam, winners, reward)]
        });
      } catch (err) {
        logErr("GameManager.startGame sendWinnerEmbed", err);
      }

      try {
        await game.roomChannel.send({
          embeds: [EmbedManager.summaryEmbed(game, winnerTeam)]
        });
      } catch (err) {
        logErr("GameManager.startGame sendSummaryEmbed", err);
      }

      console.log(
        `[Werewolf] ✅ Game ${game.id} selesai. Pemenang: ${winnerTeam}. +${reward} untuk ${winners.length} pemain.`
      );
    } catch (err) {
      logErr(`GameManager.startGame FATAL(game ${game.id})`, err);
      try {
        if (!game._cleaned) {
          await game.roomChannel.send({
            embeds: [
              EmbedManager.errorNoticeEmbed(
                "Terjadi error internal. Game dihentikan paksa, room akan segera dibersihkan."
              )
            ]
          });
        }
      } catch (sendErr) {
        logErr("GameManager.startGame sendFatalNotice", sendErr);
      }
    } finally {
      try {
        await CleanupManager.cleanupGame(game, this, {});
      } catch (err) {
        logErr(`GameManager.startGame cleanupGame(game ${game.id})`, err);
      }
    }
  }
}

module.exports = GameManager;