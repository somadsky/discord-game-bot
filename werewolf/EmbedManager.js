"use strict";

// ===================================
// werewolf/EmbedManager.js
// Semua pembuatan EmbedBuilder terpusat di sini.
// ===================================

const { EmbedBuilder } = require("discord.js");
const { fmtList, voteBar } = require("./Utils");

const COLOR = {
  LOBBY: "#2ECC71",
  NIGHT: "#1A1A2E",
  MORNING: "#F1C40F",
  VOTE: "#E67E22",
  RESULT: "#9B59B6",
  WIN_VILLAGER: "#3498DB",
  WIN_WEREWOLF: "#E74C3C",
  INFO: "#00E1FF"
};

function playerNames(game) {
  return [...game.players.values()].map((p) => p.username);
}

function lobbyEmbed(game) {
  const names = playerNames(game);
  return new EmbedBuilder()
    .setTitle("🐺 GAME WEREWOLF — LOBBY")
    .setColor(COLOR.LOBBY)
    .setDescription(
      `Host: <@${game.hostId}>\n\n` +
        `Klik **Join** untuk ikut bermain.\n` +
        `Minimal **4** pemain, maksimal **20** pemain.\n` +
        `Host dapat menekan **Start** kapan saja setelah minimal pemain terpenuhi.`
    )
    .addFields({
      name: `👥 Pemain (${names.length}/20)`,
      value: fmtList(names)
    })
    .setFooter({
      text: "Lobby akan otomatis batal setelah 180 detik jika tidak dimulai."
    })
    .setTimestamp();
}

function roleDmEmbed(role, description) {
  return new EmbedBuilder()
    .setTitle("🎭 Role Kamu")
    .setColor(COLOR.INFO)
    .setDescription(description)
    .setFooter({
      text: "Role ini rahasia. Jangan diberitahukan di room."
    });
}

function roleRevealEmbed(secondsLeft) {
  return new EmbedBuilder()
    .setTitle("🎭 Role telah dibagikan")
    .setColor(COLOR.INFO)
    .setDescription(
      `Cek DM masing-masing.\n\nGame dimulai dalam **${secondsLeft}** detik.`
    );
}

function nightStartEmbed(round) {
  const isFirstNight = round === 1;
  return new EmbedBuilder()
    .setTitle(isFirstNight ? "🌙 Malam Pertama" : `🌙 Malam ke-${round}`)
    .setColor(COLOR.NIGHT)
    .setDescription(
      "Semua warga tertidur...\n" +
        "Role yang memiliki kemampuan sedang menjalankan aksinya.\n\n" +
        "Chat room dikunci sampai pagi tiba."
    );
}

function seerDmEmbed() {
  return new EmbedBuilder()
    .setTitle("🔮 Giliran Seer")
    .setColor(COLOR.INFO)
    .setDescription(
      "Pilih pemain yang ingin diterawang.\nKamu punya **60 detik**." +
        "\n\nJika waktu habis, kamu tidak menerawang siapa pun."
    );
}

function seerResultEmbed(targetName, isWerewolfAppearance) {
  return new EmbedBuilder()
    .setTitle("🔮 Hasil Terawang")
    .setColor(COLOR.INFO)
    .setDescription(
      `**${targetName}** adalah **${
        isWerewolfAppearance ? "Werewolf 🐺" : "Bukan Werewolf ✅"
      }**.`
    );
}

function guardDmEmbed() {
  return new EmbedBuilder()
    .setTitle("🛡️ Giliran Bodyguard")
    .setColor(COLOR.INFO)
    .setDescription(
      "Pilih siapa yang ingin dilindungi (boleh diri sendiri).\nKamu punya **60 detik**." +
        "\n\nJika waktu habis, kamu tidak melindungi siapa pun."
    );
}

function wolfDmEmbed() {
  return new EmbedBuilder()
    .setTitle("🐺 Giliran Werewolf")
    .setColor(COLOR.NIGHT)
    .setDescription(
      "Pilih satu korban malam ini.\nKamu punya **60 detik**." +
        "\n\nJika waktu habis, Werewolf tidak menyerang."
    );
}

function actionSentEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setDescription("✅ Aksi berhasil dikirim.");
}

function gameOverDmEmbed() {
  return new EmbedBuilder()
    .setColor("#555555")
    .setDescription("🏁 Permainan telah selesai.");
}

function morningEmbed(round, victimName) {
  const desc = victimName
    ? `☀️ Matahari terbit...\n\n💀 **${victimName}** ditemukan meninggal.`
    : `☀️ Matahari terbit...\n\nTidak ada korban malam ini. Semua pemain selamat! 🎉`;

  return new EmbedBuilder()
    .setTitle(`☀️ Pagi Hari — Round ${round}`)
    .setColor(COLOR.MORNING)
    .setDescription(
      desc + "\n\nChat room dibuka. Diskusi akan segera dimulai."
    );
}

function discussionEmbed(secondsLeft) {
  return new EmbedBuilder()
    .setTitle("💬 Waktu Diskusi")
    .setColor(COLOR.MORNING)
    .setDescription(
      `Silakan berdiskusi dan cari siapa Werewolf-nya.\n\nSisa waktu: **${secondsLeft}** detik.`
    );
}

function voteEmbed(alivePlayers) {
  const names = alivePlayers.map((p) => p.username);
  return new EmbedBuilder()
    .setTitle("🗳️ Voting")
    .setColor(COLOR.VOTE)
    .setDescription(
      "Pilih pemain yang menurutmu adalah Werewolf.\nVote bersifat **rahasia**.\nKamu punya **45 detik**."
    )
    .addFields({ name: "Pemain Hidup", value: fmtList(names) });
}

function voteResultEmbed(voteCounts, hangedPlayer, hangedRole) {
  const entries = [...voteCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = entries.length ? entries[0][1] : 0;

  const lines = entries.map(
    ([name, count]) => `${name} ${voteBar(count, maxCount)} ${count}`
  );

  const desc = hangedPlayer
    ? `**${hangedPlayer}** digantung warga.\nRole: **${hangedRole}**`
    : `Tidak ada pemain yang digantung (abstain/tidak ada suara).`;

  return new EmbedBuilder()
    .setTitle("📊 Hasil Voting")
    .setColor(COLOR.RESULT)
    .setDescription(desc)
    .addFields({
      name: "Rincian Vote",
      value: lines.length ? lines.join("\n") : "-"
    });
}

function winnerEmbed(winnerTeam, winnerNames, reward) {
  const isVillager = winnerTeam === "villager";
  return new EmbedBuilder()
    .setTitle(isVillager ? "🎉 VILLAGER MENANG!" : "🐺 WEREWOLF MENANG!")
    .setColor(isVillager ? COLOR.WIN_VILLAGER : COLOR.WIN_WEREWOLF)
    .setDescription(
      `Tim **${isVillager ? "Villager" : "Werewolf"}** memenangkan permainan!\n\n` +
        `**Pemenang:**\n${fmtList(winnerNames)}\n\n` +
        `💰 Setiap pemenang mendapat **+${reward} Score**`
    )
    .setTimestamp();
}

function summaryEmbed(game, winnerTeam) {
  // ✅ FIX: fmtList menerima array string, bukan array objek
  const lines = [...game.players.values()].map((p) => {
    const status = p.alive ? "Hidup" : "Mati";
    return `**${p.username}** — ${p.role} (${status})`;
  });

  return new EmbedBuilder()
    .setTitle("📋 Game Summary")
    .setColor(COLOR.RESULT)
    .addFields(
      { name: "Total Round", value: `${game.round}`, inline: true },
      {
        name: "Pemenang",
        value: winnerTeam === "villager" ? "Villager" : "Werewolf",
        inline: true
      },
      { name: "Daftar Pemain & Role", value: fmtList(lines) }
    )
    .setFooter({ text: "Room akan otomatis dihapus dalam 15 detik." })
    .setTimestamp();
}

function errorNoticeEmbed(text) {
  return new EmbedBuilder()
    .setColor("#E74C3C")
    .setDescription(`⚠️ ${text}`);
}

module.exports = {
  COLOR,
  lobbyEmbed,
  roleDmEmbed,
  roleRevealEmbed,
  nightStartEmbed,
  seerDmEmbed,
  seerResultEmbed,
  guardDmEmbed,
  wolfDmEmbed,
  actionSentEmbed,
  gameOverDmEmbed,
  morningEmbed,
  discussionEmbed,
  voteEmbed,
  voteResultEmbed,
  winnerEmbed,
  summaryEmbed,
  errorNoticeEmbed
};