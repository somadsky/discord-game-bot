"use strict";

// ===================================
// commands/ww.js
// Entry point command "wolf1" / "wolf1 create".
// ===================================

const LobbyManager = require("../werewolf/LobbyManager");

async function wwCommand(message, client, data, saveData, gm, onStartGame) {
  const parts = message.content.trim().split(/ +/);
  const sub = (parts[1] || "").toLowerCase();

  if (sub && sub !== "create") {
    return message.reply(
      "Gunakan `wolf1` atau `wolf1 create` untuk membuat room Werewolf baru."
    );
  }

  return LobbyManager.createLobby(
    message,
    client,
    data,
    saveData,
    gm,
    onStartGame
  );
}

module.exports = wwCommand;