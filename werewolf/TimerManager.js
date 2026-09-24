"use strict";

// ===================================
// werewolf/TimerManager.js
// ===================================

const { logErr } = require("./Utils");

function wait(game, ms, opts = {}) {
  const { checkDone, onWarning, onTick } = opts;

  return new Promise((resolve) => {
    const start = Date.now();
    let warned = false;
    let finished = false;

    const interval = setInterval(() => {
      if (finished) return;

      const elapsed = Date.now() - start;
      const remaining = ms - elapsed;

      // ✅ Guard: cek game sudah di-cleanup
      if (game && game._cleaned) {
        return finish();
      }

      if (typeof onTick === "function") {
        try {
          onTick(Math.max(remaining, 0));
        } catch (err) {
          logErr("TimerManager.wait onTick", err);
        }
      }

      try {
        if (checkDone && checkDone()) {
          return finish();
        }
      } catch (err) {
        logErr("TimerManager.wait checkDone", err);
      }

      if (!warned && remaining <= 10000 && remaining > 0) {
        warned = true;
        if (typeof onWarning === "function") {
          try {
            onWarning();
          } catch (err) {
            logErr("TimerManager.wait onWarning", err);
          }
        }
      }

      if (elapsed >= ms) {
        return finish();
      }
    }, 1000);

    if (game && game.timers) game.timers.add(interval);

    const safetyTimer = setTimeout(() => {
      if (!finished) {
        console.log(
          `[Werewolf] ⏰ TimerManager safety timeout (${ms}ms -> ${
            Date.now() - start
          }ms)`
        );
        finish();
      }
    }, ms + 5000);

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(interval);
      clearTimeout(safetyTimer);
      if (game && game.timers) game.timers.delete(interval);
      resolve();
    }
  });
}

async function runCheckpointCountdown(
  game,
  totalMs,
  checkpoints,
  onCheckpoint,
  opts = {}
) {
  if (!checkpoints.length) return;
  let cpIndex = 0;

  await wait(game, totalMs, {
    checkDone: opts.checkDone,
    onTick: (remainingMs) => {
      const remainingSec = Math.ceil(remainingMs / 1000);
      while (
        cpIndex < checkpoints.length &&
        remainingSec <= checkpoints[cpIndex]
      ) {
        const value = checkpoints[cpIndex];
        cpIndex += 1;
        try {
          const result = onCheckpoint(value);
          if (result && typeof result.catch === "function") {
            result.catch((err) =>
              logErr("TimerManager.runCheckpointCountdown onCheckpoint", err)
            );
          }
        } catch (err) {
          logErr("TimerManager.runCheckpointCountdown onCheckpoint", err);
        }
      }
    }
  });
}

function clearAllTimers(game) {
  if (!game || !game.timers) return;
  for (const handle of game.timers) {
    try {
      // ✅ Node bisa throw kalau clearInterval pada timeout
      // Sebaiknya pakai try/catch terpisah
      clearInterval(handle);
    } catch {}
    try {
      clearTimeout(handle);
    } catch {}
  }
  game.timers.clear();
}

module.exports = { wait, runCheckpointCountdown, clearAllTimers };