"use strict";

// ===================================
// werewolf/DayManager.js
// ===================================

const RoomManager = require("./RoomManager");
const EmbedManager = require("./EmbedManager");
const TimerManager = require("./TimerManager");
const { logErr, logStep } = require("./Utils");

const DISCUSSION_MS = 60000;
const DISCUSSION_CHECKPOINTS = [60, 45, 30, 15, 10, 5, 4, 3, 2, 1];

async function runMorning(game, victimName) {
  try {
    logStep(game, "Morning");

    await RoomManager.unlockChannel(game.roomChannel);
    game.state = "day";

    console.log(
      `[Werewolf] ☀️ Pagi round ${game.round}, korban: ${
        victimName || "tidak ada"
      }`
    );

    await game.roomChannel.send({
      embeds: [EmbedManager.morningEmbed(game.round, victimName)]
    });
  } catch (err) {
    logErr(`DayManager.runMorning(game ${game && game.id})`, err);
  }
}

async function runDiscussion(game) {
  try {
    // ✅ Guard: game sudah di-cleanup
    if (game._cleaned) return;

    logStep(game, "Discussion");

    let countdownMessage = null;
    try {
      countdownMessage = await game.roomChannel.send({
        embeds: [EmbedManager.discussionEmbed(DISCUSSION_CHECKPOINTS[0])]
      });
    } catch (err) {
      logErr("DayManager.runDiscussion sendCountdownMessage", err);
    }

    // ✅ Kalau countdownMessage gagal, tetap lanjut timer
    await TimerManager.runCheckpointCountdown(
      game,
      DISCUSSION_MS,
      DISCUSSION_CHECKPOINTS.slice(1),
      async (secondsLeft) => {
        if (!countdownMessage) return;
        // ✅ Guard: game sudah di-cleanup
        if (game._cleaned) return;
        try {
          await countdownMessage.edit({
            embeds: [EmbedManager.discussionEmbed(secondsLeft)]
          });
        } catch (err) {
          logErr("DayManager.runDiscussion editCountdownMessage", err);
        }
      }
    );

    if (game._cleaned) return;

    await game.roomChannel
      .send("🔔 Waktu diskusi selesai. Voting akan dimulai.")
      .catch((err) => logErr("DayManager.runDiscussion sendDone", err));
  } catch (err) {
    logErr(`DayManager.runDiscussion(game ${game && game.id})`, err);
  }
}

module.exports = {
  runMorning,
  runDiscussion,
  DISCUSSION_MS
};