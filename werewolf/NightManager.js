"use strict";

// ===================================
// werewolf/NightManager.js
// ===================================

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType
} = require("discord.js");

const EmbedManager = require("./EmbedManager");
const RoomManager = require("./RoomManager");
const { ROLES } = require("./RoleManager");
const { logErr, logStep, majorityTarget } = require("./Utils");

const ACTION_TIMEOUT_MS = 60000;

function buildTargetSelect(customId, targets, placeholder) {
  const options = targets
    .slice(0, 25)
    .map((p) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(p.username)
        .setValue(p.id)
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

async function disableMessageComponents(message) {
  if (!message) return;
  try {
    // ✅ Guard: kalau message sudah dihapus
    if (message.deleted) return;
    const disabledRows = message.components.map((row) => {
      const newRow = ActionRowBuilder.from(row);
      newRow.components = newRow.components.map((c) => c.setDisabled(true));
      return newRow;
    });
    await message.edit({ components: disabledRows });
  } catch (err) {
    // Silent: pesan mungkin sudah dihapus
  }
}

async function askSingleAction(player, embed, targets, customId, placeholder) {
  if (!player || !player.user) return null;

  if (!targets.length) {
    console.log(
      `[Werewolf] ⚠️ Tidak ada target untuk ${player.username}, aksi dilewati.`
    );
    return null;
  }

  let dmChannel;
  try {
    dmChannel = player.dmChannel || (await player.user.createDM());
    player.dmChannel = dmChannel;
  } catch (err) {
    logErr(`NightManager.askSingleAction createDM(${player.username})`, err);
    return null;
  }

  const row = buildTargetSelect(customId, targets, placeholder);

  let dmMessage;
  try {
    dmMessage = await dmChannel.send({ embeds: [embed], components: [row] });
    player.lastDmMessage = dmMessage;
    console.log(
      `[Werewolf] 📩 DM aksi terkirim ke ${player.username} (${customId})`
    );
  } catch (err) {
    logErr(`NightManager.askSingleAction send(${player.username})`, err);
    console.log(
      `[Werewolf] ⚠️ Gagal kirim DM ke ${player.username} — DM mungkin tertutup.`
    );
    return null;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let collector;

    try {
      collector = dmMessage.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: ACTION_TIMEOUT_MS,
        max: 1
      });
    } catch (err) {
      logErr(
        `NightManager.askSingleAction createCollector(${player.username})`,
        err
      );
      resolve(null);
      return;
    }

    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(
          `[Werewolf] ⏰ Safety timeout untuk ${player.username}, resolve null.`
        );
        resolve(null);
      }
    }, ACTION_TIMEOUT_MS + 5000);

    collector.on("collect", async (interaction) => {
      try {
        const targetId = interaction.values[0];
        await interaction.update({
          embeds: [EmbedManager.actionSentEmbed()],
          components: []
        });
        resolved = true;
        clearTimeout(safetyTimer);
        console.log(
          `[Werewolf] ✅ ${player.username} memilih target (${customId})`
        );
        resolve(targetId);
      } catch (err) {
        logErr(
          `NightManager.askSingleAction collect(${player.username})`,
          err
        );
        resolved = true;
        clearTimeout(safetyTimer);
        resolve(interaction.values ? interaction.values[0] : null);
      }
    });

    collector.on("end", async () => {
      if (!resolved) {
        await disableMessageComponents(dmMessage);
        clearTimeout(safetyTimer);
        console.log(
          `[Werewolf] ⏰ Waktu habis untuk ${player.username}, resolve null.`
        );
        resolve(null);
      }
    });
  });
}

async function askGroupAction(
  players,
  embed,
  targets,
  customIdPrefix,
  placeholder
) {
  const votes = new Map();

  if (!players || !players.length) return votes;

  await Promise.all(
    players.map(async (player) => {
      try {
        const targetId = await askSingleAction(
          player,
          embed,
          targets,
          `${customIdPrefix}:${player.id}`,
          placeholder
        );
        votes.set(player.id, targetId);
      } catch (err) {
        logErr(`NightManager.askGroupAction(${player.username})`, err);
        votes.set(player.id, null);
      }
    })
  );

  return votes;
}

async function runSeerPhase(game) {
  try {
    if (game._cleaned) return;

    const alive = [...game.players.values()].filter((p) => p.alive);
    const seer = alive.find((p) => p.role === ROLES.SEER);
    if (!seer) {
      console.log(`[Werewolf] ℹ️ Tidak ada Seer hidup di game ${game.id}`);
      return;
    }

    logStep(game, "Seer Start");
    console.log(`[Werewolf] 🔮 Seer: ${seer.username}`);

    const targets = alive.filter((p) => p.id !== seer.id);
    const embed = EmbedManager.seerDmEmbed();
    const targetId = await askSingleAction(
      seer,
      embed,
      targets,
      `ww:seer:${game.id}`,
      "Pilih pemain untuk diterawang"
    );

    if (targetId && !game._cleaned) {
      const target = game.players.get(targetId);
      if (target) {
        const isWerewolfAppearance =
          target.role === ROLES.WEREWOLF || target.role === ROLES.LYCAN;
        try {
          await seer.dmChannel.send({
            embeds: [
              EmbedManager.seerResultEmbed(
                target.username,
                isWerewolfAppearance
              )
            ]
          });
        } catch (err) {
          logErr("NightManager.runSeerPhase sendResult", err);
        }
      }
    }

    logStep(game, "Seer Done");
  } catch (err) {
    logErr(`NightManager.runSeerPhase(game ${game && game.id})`, err);
  }
}

async function runBodyguardPhase(game) {
  try {
    if (game._cleaned) return null;

    const alive = [...game.players.values()].filter((p) => p.alive);
    const guard = alive.find((p) => p.role === ROLES.BODYGUARD);
    if (!guard) {
      console.log(`[Werewolf] ℹ️ Tidak ada Bodyguard hidup di game ${game.id}`);
      return null;
    }

    logStep(game, "Guard Start");
    console.log(`[Werewolf] 🛡️ Bodyguard: ${guard.username}`);

    const targets = alive;
    const embed = EmbedManager.guardDmEmbed();
    const targetId = await askSingleAction(
      guard,
      embed,
      targets,
      `ww:guard:${game.id}`,
      "Pilih pemain untuk dilindungi"
    );

    logStep(game, "Guard Done");
    return targetId || null;
  } catch (err) {
    logErr(
      `NightManager.runBodyguardPhase(game ${game && game.id})`,
      err
    );
    return null;
  }
}

async function runWerewolfPhase(game) {
  try {
    if (game._cleaned) return null;

    const alive = [...game.players.values()].filter((p) => p.alive);
    const wolves = alive.filter((p) => p.role === ROLES.WEREWOLF);
    if (!wolves.length) {
      console.log(`[Werewolf] ℹ️ Tidak ada Werewolf hidup di game ${game.id}`);
      return null;
    }

    logStep(game, "Werewolf Start");
    console.log(
      `[Werewolf] 🐺 Werewolf (${wolves.length}): ${wolves
        .map((w) => w.username)
        .join(", ")}`
    );

    const targets = alive.filter((p) => p.role !== ROLES.WEREWOLF);
    const embed = EmbedManager.wolfDmEmbed();

    let result = null;
    if (wolves.length === 1) {
      result = await askSingleAction(
        wolves[0],
        embed,
        targets,
        `ww:wolf:${game.id}`,
        "Pilih korban malam ini"
      );
    } else {
      const votes = await askGroupAction(
        wolves,
        embed,
        targets,
        `ww:wolf:${game.id}`,
        "Pilih korban malam ini"
      );
      result = majorityTarget(votes);
    }

    logStep(game, "Werewolf Done");
    return result || null;
  } catch (err) {
    logErr(
      `NightManager.runWerewolfPhase(game ${game && game.id})`,
      err
    );
    return null;
  }
}

async function runNight(game) {
  try {
    if (game._cleaned) return { victimId: null, victimName: null };

    game.state = "night";
    game.round += 1;

    logStep(game, "Night Start");
    console.log(
      `[Werewolf] === Malam ke-${game.round} dimulai (game ${game.id}) ===`
    );

    try {
      await RoomManager.lockChannel(game.roomChannel);
    } catch (err) {
      logErr("NightManager.runNight lockChannel", err);
    }

    try {
      await game.roomChannel.send({
        embeds: [EmbedManager.nightStartEmbed(game.round)]
      });
    } catch (err) {
      logErr("NightManager.runNight sendNightEmbed", err);
    }

    await runSeerPhase(game);
    const guardTargetId = await runBodyguardPhase(game);
    const wolfTargetId = await runWerewolfPhase(game);

    if (game._cleaned) return { victimId: null, victimName: null };

    logStep(game, "Resolve");

    let victimId = null;
    if (wolfTargetId && wolfTargetId !== guardTargetId) {
      victimId = wolfTargetId;
      const victim = game.players.get(victimId);
      if (victim) victim.alive = false;
    }

    const victim = victimId ? game.players.get(victimId) : null;

    return { victimId, victimName: victim ? victim.username : null };
  } catch (err) {
    logErr(`NightManager.runNight(game ${game && game.id})`, err);
    return { victimId: null, victimName: null };
  }
}

module.exports = {
  runNight,
  askSingleAction,
  askGroupAction
};