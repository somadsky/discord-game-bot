"use strict";

// ===================================
// werewolf/index.js
// Entry point module Werewolf.
// Command: wolf1, wolf1 create, wolfcreate
// ===================================

const GameManager = require("./GameManager");
const { logErr } = require("./Utils");

// Anti-spam: userId -> timestamp terakhir create lobby
const createCooldown = new Map();
const CREATE_COOLDOWN_MS = 60 * 1000;

// ✅ Anti-duplicate load
const loadedClients = new WeakSet();

function werewolf(client, data, saveData) {
  // ✅ Guard input
  if (!client || typeof client.on !== "function") {
    console.error("❌ werewolf: client tidak valid.");
    return;
  }

  if (!data || typeof data !== "object") {
    console.error("❌ werewolf: data tidak valid.");
    return;
  }

  // ✅ Anti-duplicate load
  if (loadedClients.has(client)) {
    console.warn("⚠️ Werewolf sudah terdaftar, skip duplikat.");
    return;
  }
  loadedClients.add(client);

  // ✅ Lazy require untuk hindari circular dependency
  let wwCommand = null;
  try {
    wwCommand = require("../commands/ww");
  } catch (err) {
    console.error(
      "❌ werewolf: gagal require ../commands/ww:",
      err.message
    );
    return;
  }

  const gm = new GameManager();

  console.log(
    "🐺 [Werewolf] Module dimuat & siap (command: wolf1, wolfcreate)."
  );

  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      const parts = message.content.trim().split(/ +/);
      const cmd = (parts[0] || "").toLowerCase();
      const sub = (parts[1] || "").toLowerCase();

      const isWwCommand = cmd === "wolf1" || cmd === "wolfcreate";

      if (!isWwCommand) return;

      if (cmd === "wolf1" && sub && sub !== "create") {
        return message
          .reply(
            "Gunakan `wolf1` atau `wolf1 create` untuk membuat room Werewolf baru."
          )
          .catch(() => null);
      }

      // Anti-spam
      const uid = message.author.id;
      const last = createCooldown.get(uid) || 0;
      if (Date.now() - last < CREATE_COOLDOWN_MS) {
        const remaining = Math.ceil(
          (CREATE_COOLDOWN_MS - (Date.now() - last)) / 1000
        );
        return message
          .reply(
            `⏳ Tunggu **${remaining} detik** lagi sebelum membuat lobby Werewolf baru.`
          )
          .catch(() => null);
      }
      createCooldown.set(uid, Date.now());

      // Bersihkan cache kalau > 100 entry
      if (createCooldown.size > 100) {
        const now = Date.now();
        for (const [id, ts] of createCooldown.entries()) {
          if (now - ts > 5 * 60 * 1000) createCooldown.delete(id);
        }
      }

      await wwCommand(
        message,
        client,
        data,
        saveData,
        gm,
        (game) => gm.startGame(game, data, saveData)
      );
    } catch (err) {
      logErr("werewolf/index.js messageCreate", err);
    }
  });

  // ✅ Cleanup cooldown saat shutdown
  if (!client.__werewolfCleanupRegistered) {
    client.__werewolfCleanupRegistered = true;

    const cleanup = () => {
      createCooldown.clear();
      console.log("🧹 Werewolf cooldown dibersihkan.");
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  }
}

module.exports = werewolf;