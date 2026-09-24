"use strict";

// ===================================
// werewolf/RoomManager.js
// Lobby = PUBLIC, Game Start = PRIVATE
// ===================================

const { ChannelType, PermissionsBitField } = require("discord.js");
const { randomRoomName, logErr } = require("./Utils");

async function createRoomChannel(guild, hostId) {
  if (!guild) throw new Error("guild undefined");

  const name = randomRoomName();

  let botMember;
  try {
    botMember = guild.members.me || (await guild.members.fetchMe());
  } catch (err) {
    logErr("RoomManager.createRoomChannel fetchMe", err);
    botMember = guild.members.me;
  }

  const botId = botMember ? botMember.id : guild.client.user.id;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.UseExternalEmojis
      ]
    },
    {
      id: botId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.UseExternalEmojis
      ]
    }
  ];

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    permissionOverwrites,
    reason: "Room Werewolf dibuat (PUBLIC untuk lobby)"
  });

  console.log(
    `[Werewolf] 🏠 Room PUBLIC dibuat: ${channel.name} (${channel.id})`
  );

  return channel;
}

async function grantPlayerAccess(channel, userId) {
  console.log(`[Werewolf] ✅ User ${userId} join (room public)`);
}

async function revokePlayerAccess(channel, userId) {
  console.log(`[Werewolf] 🚪 User ${userId} leave (room public)`);
}

async function lockRoomToPlayers(channel, playerIds) {
  // ✅ Guard: channel & playerIds valid
  if (!channel) {
    logErr("RoomManager.lockRoomToPlayers", new Error("channel null"));
    return;
  }

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    logErr(
      "RoomManager.lockRoomToPlayers",
      new Error("playerIds kosong / bukan array")
    );
    return;
  }

  try {
    const botId = channel.guild.members.me?.id || channel.client.user.id;

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone.id,
      {
        ViewChannel: false,
        SendMessages: false,
        ReadMessageHistory: false
      }
    );

    await channel.permissionOverwrites.edit(botId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      ManageChannels: true,
      ManageMessages: true,
      EmbedLinks: true,
      AttachFiles: true,
      AddReactions: true,
      UseExternalEmojis: true
    });

    for (const userId of playerIds) {
      await channel.permissionOverwrites
        .edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          EmbedLinks: true,
          AttachFiles: true,
          AddReactions: true,
          UseExternalEmojis: true
        })
        .catch((err) =>
          logErr(`RoomManager.lockRoomToPlayers grant(${userId})`, err)
        );
    }

    console.log(
      `[Werewolf] 🔒 Room di-PRIVATE-kan. Hanya ${playerIds.length} player + bot yang bisa lihat.`
    );
  } catch (err) {
    logErr("RoomManager.lockRoomToPlayers", err);
  }
}

async function lockChannel(channel) {
  // ✅ Guard channel null
  if (!channel) {
    logErr("RoomManager.lockChannel", new Error("channel null"));
    return;
  }

  try {
    const botId = channel.guild.members.me?.id || channel.client.user.id;
    const overwrites = channel.permissionOverwrites.cache;

    const promises = [];

    for (const [id] of overwrites) {
      if (id === channel.guild.roles.everyone.id) continue;
      if (id === botId) continue;

      promises.push(
        channel.permissionOverwrites
          .edit(id, { SendMessages: false })
          .catch((err) => {
            logErr(`RoomManager.lockChannel overwrite(${id})`, err);
          })
      );
    }

    await Promise.race([
      Promise.all(promises),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);

    console.log(`[Werewolf] 🔒 Chat dikunci (private room)`);
  } catch (err) {
    logErr("RoomManager.lockChannel", err);
  }
}

async function unlockChannel(channel) {
  // ✅ Guard channel null
  if (!channel) {
    logErr("RoomManager.unlockChannel", new Error("channel null"));
    return;
  }

  try {
    const botId = channel.guild.members.me?.id || channel.client.user.id;
    const overwrites = channel.permissionOverwrites.cache;

    const promises = [];

    for (const [id] of overwrites) {
      if (id === channel.guild.roles.everyone.id) continue;
      if (id === botId) continue;

      promises.push(
        channel.permissionOverwrites
          .edit(id, { SendMessages: true })
          .catch((err) => {
            logErr(`RoomManager.unlockChannel overwrite(${id})`, err);
          })
      );
    }

    await Promise.race([
      Promise.all(promises),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);

    console.log(`[Werewolf] 🔓 Chat dibuka`);
  } catch (err) {
    logErr("RoomManager.unlockChannel", err);
  }
}

async function deleteRoomChannel(channel) {
  if (!channel) return;
  try {
    await channel.delete("Game Werewolf selesai, room dibersihkan");
  } catch (err) {
    logErr("RoomManager.deleteRoomChannel", err);
  }
}

module.exports = {
  createRoomChannel,
  grantPlayerAccess,
  revokePlayerAccess,
  lockRoomToPlayers,
  lockChannel,
  unlockChannel,
  deleteRoomChannel
};