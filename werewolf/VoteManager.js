"use strict";

// ===================================
// werewolf/VoteManager.js
// ===================================

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags
} = require("discord.js");

const EmbedManager = require("./EmbedManager");
const { logErr, logStep } = require("./Utils");

const VOTE_TIMEOUT_MS = 45000;
const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function buildVoteRow(gameId, alivePlayers) {
  const options = alivePlayers
    .slice(0, 25)
    .map((p) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(p.username)
        .setValue(p.id)
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ww:vote:${gameId}`)
    .setPlaceholder("Pilih pemain yang akan divote")
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

async function runVote(game) {
  try {
    if (game._cleaned)
      return { hangedId: null, hangedName: null, hangedRole: null };

    const alive = [...game.players.values()].filter((p) => p.alive);
    game.state = "voting";

    logStep(game, "Vote");
    console.log(
      `[Werewolf] 🗳️ Voting round ${game.round} dimulai. Pemain hidup: ${alive.length}`
    );

    const embed = EmbedManager.voteEmbed(alive);
    const row = buildVoteRow(game.id, alive);

    let voteMessage;
    try {
      voteMessage = await game.roomChannel.send({
        embeds: [embed],
        components: [row]
      });
    } catch (err) {
      logErr("VoteManager.runVote sendVoteMessage", err);
      return { hangedId: null, hangedName: null, hangedRole: null };
    }

    const votes = new Map();
    const aliveIds = new Set(alive.map((p) => p.id));

    await new Promise((resolve) => {
      let collector;
      try {
        collector = voteMessage.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: VOTE_TIMEOUT_MS
        });
      } catch (err) {
        logErr("VoteManager.runVote createCollector", err);
        resolve();
        return;
      }

      // ✅ Safety resolve kalau collector tidak fire end
      const safetyTimer = setTimeout(resolve, VOTE_TIMEOUT_MS + 5000);

      collector.on("collect", async (interaction) => {
        try {
          if (!aliveIds.has(interaction.user.id)) {
            await interaction.reply({
              content: "⛔ Kamu tidak sedang hidup di game ini.",
              ...EPHEMERAL
            });
            return;
          }

          const targetId = interaction.values[0];
          votes.set(interaction.user.id, targetId);

          console.log(
            `[Werewolf] 🗳️ ${interaction.user.tag} vote (rahasia)`
          );

          await interaction.reply({
            content: "🗳️ Vote kamu berhasil dikirim (rahasia).",
            ...EPHEMERAL
          });

          if (votes.size >= aliveIds.size) {
            collector.stop("all_voted");
          }
        } catch (err) {
          logErr("VoteManager.runVote collect", err);
        }
      });

      collector.on("end", () => {
        clearTimeout(safetyTimer);
        resolve();
      });
    });

    await voteMessage
      .edit({ components: [] })
      .catch(() => null);

    if (game._cleaned)
      return { hangedId: null, hangedName: null, hangedRole: null };

    const tally = new Map();
    for (const targetId of votes.values()) {
      if (!targetId) continue;
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }

    let hangedId = null;
    if (tally.size > 0) {
      let max = -1;
      let winners = [];
      for (const [id, count] of tally.entries()) {
        if (count > max) {
          max = count;
          winners = [id];
        } else if (count === max) {
          winners.push(id);
        }
      }
      hangedId = winners[Math.floor(Math.random() * winners.length)];
    }

    const nameById = (id) => game.players.get(id)?.username || "Unknown";
    const voteCountsByName = new Map();
    for (const [id, count] of tally.entries()) {
      voteCountsByName.set(nameById(id), count);
    }

    let hangedName = null;
    let hangedRole = null;

    if (hangedId) {
      const hangedPlayer = game.players.get(hangedId);
      if (hangedPlayer) {
        hangedPlayer.alive = false;
        hangedName = hangedPlayer.username;
        hangedRole = hangedPlayer.role;
      }
    }

    logStep(game, "Result");
    console.log(
      `[Werewolf] 📊 Hasil vote round ${game.round}: ${
        hangedName || "tidak ada yang digantung"
      }`
    );

    if (!game._cleaned) {
      await game.roomChannel
        .send({
          embeds: [
            EmbedManager.voteResultEmbed(
              voteCountsByName,
              hangedName,
              hangedRole
            )
          ]
        })
        .catch((err) => logErr("VoteManager.runVote sendResult", err));
    }

    return { hangedId, hangedName, hangedRole };
  } catch (err) {
    logErr(`VoteManager.runVote(game ${game && game.id})`, err);
    return { hangedId: null, hangedName: null, hangedRole: null };
  }
}

module.exports = { runVote, VOTE_TIMEOUT_MS };