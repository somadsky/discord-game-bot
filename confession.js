// =========================================
// confession.js
// Sistem Confession Anonim
// =========================================
// Fitur:
// - User klik tombol "Kirim Confession" di channel confession
// - User isi modal
// - User pilih: Upload Media / Lewati / Batal
// - Confession dikirim ke channel dengan thread balasan
// - User lain bisa balas confession secara anonim via DM
// =========================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
  AttachmentBuilder
} = require("discord.js");

const config = require("./config");

module.exports = (client) => {
  // =========================================
  // KONFIGURASI
  // =========================================
  const CONFESSION_CHANNEL = config.confessionChannelId;

  // Kalau channel confession tidak diset, matikan modul
  if (!CONFESSION_CHANNEL) {
    console.log("ℹ️ Confession channel tidak diset, modul confession dinonaktifkan.");
    return;
  }

  let confessionCount = 0;

  // =========================================
  // KONFIGURASI UPLOAD MEDIA
  // =========================================
  const VIDEO_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  // Deteksi tipe media: "image" | "video" | null
  function detectMediaType(attachment) {
    const contentType = attachment.contentType || "";
    const fileName = (attachment.name || "").toLowerCase();

    const isImage =
      contentType.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName);

    const isVideo =
      contentType.startsWith("video/") ||
      /\.(mp4|mov|webm|mkv)$/i.test(fileName);

    if (isImage) return "image";
    if (isVideo) return "video";
    return null;
  }

  // =========================================
  // MEMORY PENDING CONFESSION
  // =========================================
  // key   : userId
  // value : { userId, confessionID, confessionNumber, confessionText, createdAt, status, timeoutHandle }
  const pendingConfessions = new Map();

  // =========================================
  // FUNGSI PUBLISH CONFESSION
  // =========================================
  async function publishConfession(pending, media) {
    try {
      const channel = await client.channels
        .fetch(CONFESSION_CHANNEL)
        .catch(() => null);

      if (!channel) {
        console.error("❌ Channel confession tidak ditemukan.");
        return;
      }

      const embed = new EmbedBuilder()
        .setColor("#FF5C8D")
        .setTitle(`Confession Anonim (#${pending.confessionNumber})`)
        .setDescription(`"${pending.confessionText}"`)
        .addFields({
          name: "ID Confession",
          value: pending.confessionID,
          inline: true
        })
        .setTimestamp();

      const sendOptions = { embeds: [embed] };

      if (media && media.type === "image") {
        // GAMBAR: gunakan embed.setImage()
        embed.setImage(media.url);
      } else if (media && media.type === "video") {
        // VIDEO: kirim sebagai attachment Discord
        const videoFile = new AttachmentBuilder(media.url, {
          name: media.name || "confession-video.mp4"
        });
        sendOptions.files = [videoFile];
      }

      const msg = await channel.send(sendOptions);

      const thread = await msg.startThread({
        name: `Balasan - #${pending.confessionNumber} (${pending.confessionID})`,
        type: ChannelType.PublicThread,
        autoArchiveDuration: 1440
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confess_new")
          .setLabel("Kirim Confession")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`confess_reply_${thread.id}`)
          .setLabel("Balas")
          .setStyle(ButtonStyle.Secondary)
      );

      await msg.edit({ components: [row] });
    } catch (err) {
      console.error("❌ Gagal publish confession:", err.message);
    }
  }

  // =========================================
  // MEMORY PENDING REPLY
  // =========================================
  const pendingReplies = new Map();

  // =========================================
  // FUNGSI PUBLISH REPLY
  // =========================================
  async function publishReply(pending, media) {
    try {
      const thread = await client.channels
        .fetch(pending.threadId)
        .catch(() => null);

      if (!thread) {
        console.error("❌ Thread balasan tidak ditemukan.");
        return;
      }

      const embed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setDescription(pending.replyText)
        .setFooter({ text: "Balasan Anonim" })
        .setTimestamp();

      const sendOptions = { embeds: [embed] };

      if (media && media.type === "image") {
        embed.setImage(media.url);
      } else if (media && media.type === "video") {
        const videoFile = new AttachmentBuilder(media.url, {
          name: media.name || "reply-video.mp4"
        });
        sendOptions.files = [videoFile];
      }

      await thread.send(sendOptions);
    } catch (err) {
      console.error("❌ Gagal publish balasan:", err.message);
    }
  }

  // =========================================
  // SAAT BOT SIAP
  // =========================================
  // ⚠️ PERBAIKAN: event yang benar adalah "ready", bukan "clientReady"
  // =========================================
  client.on("ready", async () => {
    console.log("✅ Modul Confession aktif");

    try {
      const channel = await client.channels
        .fetch(CONFESSION_CHANNEL)
        .catch(() => null);

      if (!channel) {
        console.error("❌ Channel confession tidak ditemukan saat ready.");
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confess_new")
          .setLabel("Kirim Confession")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        content:
          "**Fitur Confession anonim aktif 🤫**\nKlik tombol di bawah untuk mengirim curhatan anonim.",
        components: [row]
      });
    } catch (err) {
      console.error("❌ Gagal mengirim pesan pembuka confession:", err.message);
    }
  });

  // =========================================
  // HANDLER DM: CONFESSION
  // =========================================
  async function handleConfessionDM(message, pending) {
    const content = (message.content || "").trim().toLowerCase();

    try {
      // USER MENGETIK "batal"
      if (content === "batal") {
        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingConfessions.delete(message.author.id);
        await message.channel.send("❌ Confession dibatalkan.");
        return;
      }

      // USER MENGETIK "skip"
      if (content === "skip") {
        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingConfessions.delete(message.author.id);
        await publishConfession(pending, null);
        await message.channel.send(
          "✅ Confession berhasil dipublish tanpa gambar."
        );
        return;
      }

      // USER MENGIRIM ATTACHMENT
      const attachment = message.attachments.first();

      if (!attachment) {
        await message.channel.send(
          "❌ File tidak didukung.\n\n" +
            "Format yang diterima:\n" +
            "🖼 PNG, JPG, JPEG, GIF, WEBP\n" +
            "🎥 MP4, MOV, WEBM, MKV\n\n" +
            "Silakan kirim media, ketik `skip`, atau ketik `batal`."
        );
        return;
      }

      // Validasi tipe media
      const mediaType = detectMediaType(attachment);

      if (!mediaType) {
        await message.channel.send(
          "❌ File tidak didukung.\n\n" +
            "Format yang diterima:\n" +
            "🖼 PNG, JPG, JPEG, GIF, WEBP\n" +
            "🎥 MP4, MOV, WEBM, MKV"
        );
        return;
      }

      // Validasi ukuran video (maks 10 MB)
      if (mediaType === "video" && attachment.size > VIDEO_MAX_SIZE) {
        await message.channel.send(
          "❌ Video terlalu besar.\n\n" +
            "Ukuran maksimal video adalah 10 MB.\n" +
            "Silakan kompres video terlebih dahulu lalu kirim ulang."
        );
        return;
      }

      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
      pendingConfessions.delete(message.author.id);

      await publishConfession(pending, {
        type: mediaType,
        url: attachment.url,
        name: attachment.name
      });

      await message.channel.send(
        mediaType === "video"
          ? "✅ Confession berhasil dipublish dengan video."
          : "✅ Confession berhasil dipublish dengan gambar."
      );
    } catch (err) {
      console.error("❌ Gagal memproses upload media confession:", err.message);
    }
  }

  // =========================================
  // HANDLER DM: REPLY
  // =========================================
  async function handleReplyDM(message, pending) {
    const content = (message.content || "").trim().toLowerCase();

    try {
      // USER MENGETIK "batal"
      if (content === "batal") {
        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingReplies.delete(message.author.id);
        await message.channel.send("❌ Balasan dibatalkan.");
        return;
      }

      // USER MENGETIK "skip"
      if (content === "skip") {
        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingReplies.delete(message.author.id);
        await publishReply(pending, null);
        await message.channel.send(
          "✅ Balasan berhasil dipublish tanpa gambar."
        );
        return;
      }

      // USER MENGIRIM ATTACHMENT
      const attachment = message.attachments.first();

      if (!attachment) {
        await message.channel.send(
          "❌ File tidak didukung.\n\n" +
            "Format yang diterima:\n" +
            "🖼 PNG, JPG, JPEG, GIF, WEBP\n" +
            "🎥 MP4, MOV, WEBM, MKV\n\n" +
            "Silakan kirim media, ketik `skip`, atau ketik `batal`."
        );
        return;
      }

      const mediaType = detectMediaType(attachment);

      if (!mediaType) {
        await message.channel.send(
          "❌ File tidak didukung.\n\n" +
            "Format yang diterima:\n" +
            "🖼 PNG, JPG, JPEG, GIF, WEBP\n" +
            "🎥 MP4, MOV, WEBM, MKV"
        );
        return;
      }

      if (mediaType === "video" && attachment.size > VIDEO_MAX_SIZE) {
        await message.channel.send(
          "❌ Video terlalu besar.\n\n" +
            "Ukuran maksimal video adalah 10 MB.\n" +
            "Silakan kompres video terlebih dahulu lalu kirim ulang."
        );
        return;
      }

      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
      pendingReplies.delete(message.author.id);

      await publishReply(pending, {
        type: mediaType,
        url: attachment.url,
        name: attachment.name
      });

      await message.channel.send(
        mediaType === "video"
          ? "✅ Balasan berhasil dipublish dengan video."
          : "✅ Balasan berhasil dipublish dengan gambar."
      );
    } catch (err) {
      console.error("❌ Gagal memproses upload media balasan:", err.message);
    }
  }

  // =========================================
  // LISTENER DM (UPLOAD MEDIA)
  // =========================================
  // Satu listener messageCreate untuk semua fitur DM (confession & reply).
  // Hanya membaca pesan DM. Tidak membaca channel server.
  // =========================================
  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      if (message.channel.type !== ChannelType.DM) return;

      const pendingConfession = pendingConfessions.get(message.author.id);
      if (pendingConfession && pendingConfession.status === "awaiting_image") {
        return handleConfessionDM(message, pendingConfession);
      }

      const pendingReply = pendingReplies.get(message.author.id);
      if (pendingReply && pendingReply.status === "awaiting_image") {
        return handleReplyDM(message, pendingReply);
      }
    } catch (err) {
      console.error("❌ Error di messageCreate DM handler:", err.message);
    }
  });

  // =========================================
  // INTERAKSI (BUTTON & MODAL)
  // =========================================
  client.on("interactionCreate", async (interaction) => {
    try {
      // =====================================
      // TOMBOL CONFESSION (BUKA MODAL)
      // =====================================
      if (interaction.isButton() && interaction.customId === "confess_new") {
        if (interaction.channel.id !== CONFESSION_CHANNEL) return;

        const modal = new ModalBuilder()
          .setCustomId("confess_modal")
          .setTitle("Kirim Curhat Anonim");

        const textInput = new TextInputBuilder()
          .setCustomId("text")
          .setLabel("Tulis isi curhatan kamu")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(textInput)
        );

        return interaction.showModal(modal);
      }

      // =====================================
      // TOMBOL PENDING: UPLOAD MEDIA
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "confess_pending_upload"
      ) {
        const pending = pendingConfessions.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada confession yang sedang menunggu.",
            ephemeral: true
          });
        }

        try {
          const dmChannel = await interaction.user.createDM();
          await dmChannel.send(
            "━━━━━━━━━━━━━━━━━━━━\n\n" +
              "📤 Upload Media\n\n" +
              "Silakan kirim:\n\n" +
              "🖼 Gambar\n" +
              "• PNG\n" +
              "• JPG\n" +
              "• JPEG\n" +
              "• GIF\n" +
              "• WEBP\n\n" +
              "🎥 Video\n" +
              "• MP4\n" +
              "• MOV\n" +
              "• WEBM\n" +
              "• MKV\n\n" +
              "📦 Maksimal video:\n10 MB\n\n" +
              "📹 Disarankan durasi:\n30–60 detik\n\n" +
              "Atau ketik:\n\nskip\nuntuk tanpa media\n\n" +
              "batal\nuntuk membatalkan\n\n" +
              "Waktu upload maksimal 2 menit.\n\n" +
              "━━━━━━━━━━━━━━━━━━━━"
          );
        } catch (err) {
          return interaction.reply({
            content:
              "❌ Saya tidak bisa mengirim DM kepada Anda.\n" +
              "Silakan aktifkan Direct Message terlebih dahulu.",
            ephemeral: true
          });
        }

        pending.status = "awaiting_image";

        pending.timeoutHandle = setTimeout(async () => {
          const stillPending = pendingConfessions.get(interaction.user.id);

          if (stillPending && stillPending.status === "awaiting_image") {
            pendingConfessions.delete(interaction.user.id);

            try {
              const dmChannel = await interaction.user.createDM();
              await dmChannel.send(
                "⌛ Waktu upload telah habis.\nConfession dibatalkan."
              );
            } catch (err) {
              // DM tidak bisa dikirim, abaikan
            }
          }
        }, 120000);

        return interaction.update({
          content: "📩 Silakan cek DM kamu untuk mengirim media confession.",
          components: []
        });
      }

      // =====================================
      // TOMBOL PENDING: LEWATI
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "confess_pending_skip"
      ) {
        const pending = pendingConfessions.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada confession yang sedang menunggu.",
            ephemeral: true
          });
        }

        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingConfessions.delete(interaction.user.id);

        await publishConfession(pending, null);

        return interaction.update({
          content: "✅ Confession berhasil dipublish tanpa gambar.",
          components: []
        });
      }

      // =====================================
      // TOMBOL PENDING: BATAL
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "confess_pending_cancel"
      ) {
        const pending = pendingConfessions.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada confession yang sedang menunggu.",
            ephemeral: true
          });
        }

        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingConfessions.delete(interaction.user.id);

        return interaction.update({
          content: "❌ Confession dibatalkan.",
          components: []
        });
      }

      // =====================================
      // TOMBOL BALAS (BUKA MODAL)
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId.startsWith("confess_reply_")
      ) {
        const threadId = interaction.customId.split("_")[2];

        const modal = new ModalBuilder()
          .setCustomId(`reply_modal_${threadId}`)
          .setTitle("Balas Confession");

        const textInput = new TextInputBuilder()
          .setCustomId("text")
          .setLabel("Tulis balasan kamu")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(textInput)
        );

        return interaction.showModal(modal);
      }

      // =====================================
      // TOMBOL PENDING REPLY: UPLOAD MEDIA
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "reply_pending_upload"
      ) {
        const pending = pendingReplies.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada balasan yang sedang menunggu.",
            ephemeral: true
          });
        }

        try {
          const dmChannel = await interaction.user.createDM();
          await dmChannel.send(
            "━━━━━━━━━━━━━━━━━━━━\n\n" +
              "📤 Upload Media\n\n" +
              "Silakan kirim:\n\n" +
              "🖼 Gambar\n" +
              "• PNG\n" +
              "• JPG\n" +
              "• JPEG\n" +
              "• GIF\n" +
              "• WEBP\n\n" +
              "🎥 Video\n" +
              "• MP4\n" +
              "• MOV\n" +
              "• WEBM\n" +
              "• MKV\n\n" +
              "📦 Maksimal video:\n10 MB\n\n" +
              "📹 Disarankan durasi:\n30–60 detik\n\n" +
              "Atau ketik:\n\nskip\nuntuk tanpa media\n\n" +
              "batal\nuntuk membatalkan\n\n" +
              "Waktu upload maksimal 2 menit.\n\n" +
              "━━━━━━━━━━━━━━━━━━━━"
          );
        } catch (err) {
          return interaction.reply({
            content:
              "❌ Saya tidak dapat mengirim DM.\n" +
              "Silakan aktifkan Direct Message.",
            ephemeral: true
          });
        }

        pending.status = "awaiting_image";

        pending.timeoutHandle = setTimeout(async () => {
          const stillPending = pendingReplies.get(interaction.user.id);

          if (stillPending && stillPending.status === "awaiting_image") {
            pendingReplies.delete(interaction.user.id);

            try {
              const dmChannel = await interaction.user.createDM();
              await dmChannel.send(
                "⌛ Waktu upload telah habis.\nBalasan dibatalkan."
              );
            } catch (err) {
              // DM tidak bisa dikirim, abaikan
            }
          }
        }, 120000);

        return interaction.update({
          content: "📩 Silakan cek DM kamu untuk mengirim media balasan.",
          components: []
        });
      }

      // =====================================
      // TOMBOL PENDING REPLY: LEWATI
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "reply_pending_skip"
      ) {
        const pending = pendingReplies.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada balasan yang sedang menunggu.",
            ephemeral: true
          });
        }

        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingReplies.delete(interaction.user.id);

        await publishReply(pending, null);

        return interaction.update({
          content: "✅ Balasan berhasil dipublish tanpa gambar.",
          components: []
        });
      }

      // =====================================
      // TOMBOL PENDING REPLY: BATAL
      // =====================================
      if (
        interaction.isButton() &&
        interaction.customId === "reply_pending_cancel"
      ) {
        const pending = pendingReplies.get(interaction.user.id);

        if (!pending) {
          return interaction.reply({
            content: "❌ Tidak ada balasan yang sedang menunggu.",
            ephemeral: true
          });
        }

        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        pendingReplies.delete(interaction.user.id);

        return interaction.update({
          content: "❌ Balasan dibatalkan.",
          components: []
        });
      }

      // =====================================
      // SUBMIT CONFESSION (MODAL)
      // =====================================
      if (
        interaction.isModalSubmit() &&
        interaction.customId === "confess_modal"
      ) {
        if (interaction.channel.id !== CONFESSION_CHANNEL) return;

        confessionCount++;

        const text = interaction.fields.getTextInputValue("text");
        const confessionID = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();

        pendingConfessions.set(interaction.user.id, {
          userId: interaction.user.id,
          confessionID,
          confessionNumber: confessionCount,
          confessionText: text,
          createdAt: Date.now(),
          status: "awaiting_choice",
          timeoutHandle: null
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confess_pending_upload")
            .setLabel("Upload Media")
            .setEmoji("📤")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("confess_pending_skip")
            .setLabel("Lewati")
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("confess_pending_cancel")
            .setLabel("Batal")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({
          content:
            "✅ Confession berhasil disimpan.\nSilakan pilih salah satu.",
          components: [row],
          ephemeral: true
        });
      }

      // =====================================
      // SUBMIT BALASAN (MODAL)
      // =====================================
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("reply_modal_")
      ) {
        const threadId = interaction.customId.split("_")[2];
        const thread = await client.channels
          .fetch(threadId)
          .catch(() => null);

        if (!thread) return;

        const text = interaction.fields.getTextInputValue("text");

        pendingReplies.set(interaction.user.id, {
          userId: interaction.user.id,
          threadId,
          replyText: text,
          createdAt: Date.now(),
          status: "awaiting_choice",
          timeoutHandle: null
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("reply_pending_upload")
            .setLabel("Upload Media")
            .setEmoji("📤")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("reply_pending_skip")
            .setLabel("Lewati")
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("reply_pending_cancel")
            .setLabel("Batal")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({
          content: "✅ Balasan berhasil disimpan.\nSilakan pilih.",
          components: [row],
          ephemeral: true
        });
      }
    } catch (err) {
      console.error("❌ Error di interactionCreate handler:", err.message);
    }
  });
};