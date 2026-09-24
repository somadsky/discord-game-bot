"use strict";

// ===================================
// werewolf/LobbyManager.js
// ===================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags
} = require("discord.js");

const RoomManager = require("./RoomManager");
const EmbedManager = require("./EmbedManager");
const CleanupManager = require("./CleanupManager");
const { logErr } = require("./Utils");

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 20;
const LOBBY_TIMEOUT_MS = 180000;

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function buildLobbyRow(gameId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ww:lobby:join:${gameId}`)
      .setLabel("Join")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`ww:lobby:leave:${gameId}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚪")
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`ww:lobby:start:${gameId}`)
      .setLabel("Start")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("▶️")
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`ww:lobby:cancel:${gameId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️")
      .setDisabled(disabled)
  );
}

async function updateLobbyMessage(game) {
  if (!game || !game.lobbyMessage) return;
  try {
    const embed = EmbedManager.lobbyEmbed(game);
    await game.lobbyMessage.edit({
      embeds: [embed],
      components: [buildLobbyRow(game.id)]
    });
  } catch (err) {
    logErr("LobbyManager.updateLobbyMessage", err);
  }
}

async function disableLobbyButtons(game) {
  if (!game || !game.lobbyMessage) return;
  try {
    await game.lobbyMessage.edit({
      components: [buildLobbyRow(game.id, true)]
    });
  } catch (err) {
    logErr("LobbyManager.disableLobbyButtons", err);
  }
}

async function createLobby(message, client, data, saveData, gm, onStartGame) {
  const guild = message.guild;
  const hostId = message.author.id;

  if (!guild) {
    return message
      .reply("⛔ Command ini hanya bisa dipakai di server.")
      .catch(() => null);
  }

  // ✅ Guard: host harus sudah terdaftar (reg)
  if (!data || !Object.hasOwn(data, hostId)) {
    return message
      .reply(
        "❌ Kamu belum terdaftar di sistem.\nKetik **reg** terlebih dahulu."
      )
      .catch(() => null);
  }

  if (gm.isUserInGame(hostId)) {
    return message
      .reply(
        "⛔ Kamu sedang berada di game Werewolf lain. Selesaikan dulu sebelum membuat room baru."
      )
      .catch(() => null);
  }

  let roomChannel;
  try {
    roomChannel = await RoomManager.createRoomChannel(guild, hostId);
  } catch (err) {
    logErr("LobbyManager.createLobby createRoomChannel", err);
    return message
      .reply(
        "❌ Gagal membuat room. Pastikan bot punya permission **Manage Channels**."
      )
      .catch(() => null);
  }

  const game = gm.createGame({ guild, hostId, roomChannel });
  gm.addPlayer(game, message.author);

  console.log(
    `[Werewolf] 🎮 Lobby dibuat oleh ${message.author.tag} → room ${roomChannel.name}`
  );

  const embed = EmbedManager.lobbyEmbed(game);

  let lobbyMsg;
  try {
    lobbyMsg = await roomChannel.send({
      embeds: [embed],
      components: [buildLobbyRow(game.id)]
    });
  } catch (err) {
    logErr("LobbyManager.createLobby sendLobbyMessage", err);
    await CleanupManager.cleanupGame(game, gm, {});
    return message
      .reply("❌ Gagal mengirim pesan lobby. Room dibatalkan.")
      .catch(() => null);
  }
  game.lobbyMessage = lobbyMsg;

  await message
    .reply(`🐺 Room Werewolf dibuat: ${roomChannel}`)
    .catch((err) => logErr("LobbyManager.createLobby replyRoomCreated", err));

  const collector = lobbyMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: LOBBY_TIMEOUT_MS
  });
  game.lobbyCollector = collector;

  collector.on("collect", async (interaction) => {
    try {
      const action = interaction.customId.split(":")[2];

      if (action === "join") {
        await handleJoin(interaction, game, gm, data);
      } else if (action === "leave") {
        await handleLeave(interaction, game, gm, collector);
      } else if (action === "start") {
        const started = await handleStart(
          interaction,
          game,
          gm,
          onStartGame
        );
        if (started) collector.stop("started");
      } else if (action === "cancel") {
        await handleCancel(interaction, game, gm);
        collector.stop("cancelled");
      }
    } catch (err) {
      logErr("LobbyManager.createLobby collector.collect", err);
    }
  });

  collector.on("end", async (_collected, reason) => {
    // ✅ Skip kalau game sudah dibersihkan
    if (game._cleaned) return;

    if (game.state === "lobby") {
      console.log(
        `[Werewolf] ⏰ Lobby ${game.id} timeout, dibatalkan.`
      );
      game.state = "ended";
      await game.roomChannel
        .send(
          "⌛ Waktu lobby habis. Room dibatalkan karena game belum dimulai."
        )
        .catch((err) =>
          logErr("LobbyManager.createLobby lobbyTimeoutNotice", err)
        );
      await disableLobbyButtons(game);
      await CleanupManager.cleanupGame(game, gm, {});
    }
  });

  return game;
}

async function handleJoin(interaction, game, gm, data) {
  if (game.state !== "lobby") {
    return interaction
      .reply({
        content: "⛔ Lobby sudah tidak menerima pemain baru.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  // ✅ Guard: user harus terdaftar (reg)
  if (!data || !Object.hasOwn(data, interaction.user.id)) {
    return interaction
      .reply({
        content:
          "❌ Kamu belum terdaftar.\nKetik **reg** terlebih dahulu.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  // ✅ Race condition guard: cek ulang di sini
  if (game.players.has(interaction.user.id)) {
    return interaction
      .reply({
        content: "Kamu sudah berada di room ini.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  if (gm.isUserInGame(interaction.user.id)) {
    return interaction
      .reply({
        content: "⛔ Kamu sedang berada di game Werewolf lain.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  if (game.players.size >= MAX_PLAYERS) {
    return interaction
      .reply({
        content: "⛔ Room sudah penuh (maksimal 20 pemain).",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  gm.addPlayer(game, interaction.user);
  await RoomManager.grantPlayerAccess(
    game.roomChannel,
    interaction.user.id
  );
  await updateLobbyMessage(game);

  console.log(
    `[Werewolf] ✅ ${interaction.user.tag} join room ${game.roomChannel.name}`
  );

  return interaction
    .reply({
      content: "✅ Kamu berhasil join room.",
      ...EPHEMERAL
    })
    .catch(() => null);
}

async function handleLeave(interaction, game, gm, collector) {
  if (!game.players.has(interaction.user.id)) {
    return interaction
      .reply({
        content: "Kamu tidak berada di room ini.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  if (game.state !== "lobby") {
    return interaction
      .reply({
        content:
          "⛔ Game sudah dimulai, kamu tidak bisa leave dari sini.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  if (interaction.user.id === game.hostId) {
    await interaction
      .reply({
        content:
          "👑 Kamu adalah host. Lobby dibatalkan karena host keluar.",
        ...EPHEMERAL
      })
      .catch(() => null);
    game.state = "ended";
    await disableLobbyButtons(game);
    await game.roomChannel
      .send("✖️ Lobby dibatalkan karena host meninggalkan room.")
      .catch((err) =>
        logErr("LobbyManager.handleLeave hostLeftNotice", err)
      );
    if (collector) collector.stop("host_left");
    return CleanupManager.cleanupGame(game, gm, {});
  }

  gm.removePlayer(game, interaction.user.id);
  await RoomManager.revokePlayerAccess(
    game.roomChannel,
    interaction.user.id
  );
  await updateLobbyMessage(game);

  console.log(
    `[Werewolf] 🚪 ${interaction.user.tag} leave room ${game.roomChannel.name}`
  );

  return interaction
    .reply({
      content: "🚪 Kamu keluar dari room.",
      ...EPHEMERAL
    })
    .catch(() => null);
}

async function handleStart(interaction, game, gm, onStartGame) {
  if (interaction.user.id !== game.hostId) {
    await interaction
      .reply({
        content: "⛔ Hanya host yang bisa memulai game.",
        ...EPHEMERAL
      })
      .catch(() => null);
    return false;
  }

  if (game.state !== "lobby") {
    await interaction
      .reply({
        content: "⛔ Game sudah dimulai/berakhir.",
        ...EPHEMERAL
      })
      .catch(() => null);
    return false;
  }

  if (game.players.size < MIN_PLAYERS) {
    await interaction
      .reply({
        content: `⛔ Minimal ${MIN_PLAYERS} pemain untuk memulai.`,
        ...EPHEMERAL
      })
      .catch(() => null);
    return false;
  }

  game.state = "starting";
  await disableLobbyButtons(game);
  await interaction
    .reply({
      content: "▶️ Game dimulai!",
      ...EPHEMERAL
    })
    .catch(() => null);

  console.log(
    `[Werewolf] ▶️ Game ${game.id} dimulai dengan ${game.players.size} pemain.`
  );

  onStartGame(game).catch((err) => {
    logErr(`LobbyManager.handleStart onStartGame(game ${game.id})`, err);
  });

  return true;
}

async function handleCancel(interaction, game, gm) {
  if (interaction.user.id !== game.hostId) {
    return interaction
      .reply({
        content: "⛔ Hanya host yang bisa membatalkan lobby.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  if (game.state !== "lobby") {
    return interaction
      .reply({
        content:
          "⛔ Game sudah dimulai, tidak bisa dibatalkan dari sini.",
        ...EPHEMERAL
      })
      .catch(() => null);
  }

  game.state = "ended";
  await disableLobbyButtons(game);
  await interaction
    .reply({
      content: "✖️ Lobby dibatalkan.",
      ...EPHEMERAL
    })
    .catch(() => null);
  await game.roomChannel
    .send("✖️ Lobby dibatalkan oleh host.")
    .catch((err) => logErr("LobbyManager.handleCancel cancelNotice", err));

  console.log(`[Werewolf] ✖️ Lobby ${game.id} dibatalkan oleh host.`);

  return CleanupManager.cleanupGame(game, gm, {});
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  createLobby,
  updateLobbyMessage,
  disableLobbyButtons,
  buildLobbyRow
};