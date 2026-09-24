// =========================================
// player.js — Versi Fixed
// =========================================
//
// Fitur:
// - Music player singleton dengan voice reconnect
// - Anti-duplicate listener
// - Max retry untuk reconnect
// - Cleanup lengkap (stream, transcoder, audioPlayer)
// - Guard untuk semua akses object
// =========================================

const https = require("https");
const prism = require("prism-media");
const ffmpegPath = require("ffmpeg-static");

// Set FFmpeg path sebelum require apapun yang butuh
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice");

// =========================================
// PLAYLIST (dengan guard)
// =========================================

let playlist = [];

try {
  const loaded = require("./playlist");
  if (Array.isArray(loaded)) {
    playlist = loaded.filter((u) => typeof u === "string" && u.trim());
  }
} catch (err) {
  console.warn("⚠️ Gagal load playlist:", err.message);
}

// =========================================
// KONFIGURASI
// =========================================

const DEFAULT_VOLUME = 0.3;
const AUTO_RECONNECT = true;
const AUTO_LOOP = true;
const AUTO_STATUS = true;

const VOICE_READY_TIMEOUT = 20000;
const VOICE_RESUME_TIMEOUT = 5000;
const CONNECT_RETRY_DELAY = 5000;
const MAX_CONNECT_RETRY = 5; // Batas retry

// =========================================
// LOGGER
// =========================================

const LINE = "━━━━━━━━━━━━━━━━━━";

function box(lines) {
  console.log(LINE);
  for (const l of lines) console.log(l);
  console.log(LINE);
}

function logInfo(message) {
  console.log(`ℹ️ [musicPlayer] ${message}`);
}

function logDetail(message) {
  console.log(`   ↳ ${message}`);
}

// =========================================
// MUSIC PLAYER CLASS
// =========================================

class MusicPlayer {
  constructor(client) {
    this.client = client;
    this.connection = null;
    this.voiceChannelId = null;

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      }
    });

    this.currentIndex = 0;
    this.currentStream = null;
    this.currentTranscoder = null;
    this.currentResource = null;

    this.isDestroyed = false;
    this.isPlayingSomething = false;
    this.isVoiceReady = false;
    this.isConnecting = false;

    this.connectRetryCount = 0;

    this._bindPlayerEvents();
  }

  // =====================================================
  // AUDIO PLAYER EVENTS
  // =====================================================
  _bindPlayerEvents() {
    const handleError = (error) => {
      box(["❌ Playback Error"]);
      logDetail(error?.message || String(error));
      this.isPlayingSomething = false;
      this._cleanupCurrentStream();
      this._handlePlaybackFailure();
    };

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.isDestroyed || !this.isPlayingSomething) return;
      this.isPlayingSomething = false;
      this._cleanupCurrentStream();
      this._playNext();
    });

    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      logInfo("status: playing");
    });

    this.audioPlayer.on(AudioPlayerStatus.Buffering, () => {
      logInfo("status: buffering");
    });

    this.audioPlayer.on(AudioPlayerStatus.AutoPaused, () => {
      logInfo("status: auto paused");
    });

    this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
      logInfo("status: paused");
    });

    this.audioPlayer.on(AudioPlayerStatus.Error, handleError);
    this.audioPlayer.on("error", handleError);
  }

  // =====================================================
  // KONEKSI VOICE
  // =====================================================
  async connect(voiceChannelId) {
    if (this.isDestroyed) return;

    if (!voiceChannelId || typeof voiceChannelId !== "string") {
      logDetail(`❌ voiceChannelId tidak valid: ${voiceChannelId}`);
      return;
    }

    this.voiceChannelId = voiceChannelId;
    this.connectRetryCount = 0; // reset saat connect manual
    await this._tryConnect();
  }

  async _tryConnect() {
    if (this.isDestroyed || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const channel = await this.client.channels
        .fetch(this.voiceChannelId)
        .catch(() => null);

      if (!channel) {
        logDetail(
          `❌ Voice channel tidak ditemukan: ${this.voiceChannelId}`
        );
        this._scheduleRetry();
        return;
      }

      let connection = getVoiceConnection(channel.guild.id);
      const needsNewConnection =
        !connection ||
        connection.state.status === VoiceConnectionStatus.Destroyed;

      if (needsNewConnection) {
        box(["🔊 Joining Voice"]);
        connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false
        });
        this._setupConnectionEvents(connection);
      } else if (connection.joinConfig.channelId !== channel.id) {
        connection.rejoin({
          channelId: channel.id,
          selfDeaf: true,
          selfMute: false
        });
      }

      this.connection = connection;
      this.connection.subscribe(this.audioPlayer);

      try {
        await entersState(
          connection,
          VoiceConnectionStatus.Ready,
          VOICE_READY_TIMEOUT
        );

        this.isVoiceReady = true;
        this.connectRetryCount = 0;
        box(["✅ Voice Ready"]);

        if (!this.isPlayingSomething) {
          this.start();
        }
      } catch (err) {
        box(["❌ Voice Ready Timeout"]);
        logDetail(err?.message || "Timeout menunggu Voice Ready");

        try {
          if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
          }
        } catch {}

        this._scheduleRetry();
      }
    } catch (err) {
      logDetail(
        `❌ Voice Connect Error: ${err?.message || String(err)}`
      );
      this._scheduleRetry();
    } finally {
      this.isConnecting = false;
    }
  }

  _scheduleRetry() {
    if (this.isDestroyed) return;

    if (this.connectRetryCount >= MAX_CONNECT_RETRY) {
      logDetail(
        `❌ Retry connect mencapai batas (${MAX_CONNECT_RETRY}x), stop.`
      );
      return;
    }

    this.connectRetryCount++;

    logDetail(
      `🔁 Retry connect #${this.connectRetryCount}/${MAX_CONNECT_RETRY} dalam ${CONNECT_RETRY_DELAY / 1000}s`
    );

    setTimeout(() => {
      this._tryConnect().catch((err) => {
        logDetail(
          `❌ Retry connect gagal: ${err?.message || String(err)}`
        );
      });
    }, CONNECT_RETRY_DELAY);
  }

  _setupConnectionEvents(connection) {
    connection.on(VoiceConnectionStatus.Signalling, () =>
      logInfo("status: signalling")
    );

    connection.on(VoiceConnectionStatus.Connecting, () =>
      logInfo("status: connecting")
    );

    connection.on(VoiceConnectionStatus.Ready, () => {
      this.isVoiceReady = true;
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      this.isVoiceReady = false;

      if (!AUTO_RECONNECT || this.isDestroyed) return;

      box(["🔄 Voice Reconnecting"]);

      try {
        await Promise.race([
          entersState(
            connection,
            VoiceConnectionStatus.Signalling,
            VOICE_RESUME_TIMEOUT
          ),
          entersState(
            connection,
            VoiceConnectionStatus.Connecting,
            VOICE_RESUME_TIMEOUT
          )
        ]);

        await entersState(
          connection,
          VoiceConnectionStatus.Ready,
          VOICE_READY_TIMEOUT
        );

        this.isVoiceReady = true;
        box(["✅ Voice Reconnected"]);
      } catch (err) {
        logDetail(
          `❌ Reconnect gagal: ${err?.message || "unknown"}`
        );

        try {
          if (
            connection.state.status !== VoiceConnectionStatus.Destroyed
          ) {
            connection.destroy();
          }
        } catch {}

        this._scheduleRetry();
      }
    });

    connection.on(VoiceConnectionStatus.Destroying, () =>
      logInfo("status: destroying")
    );

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.isVoiceReady = false;
      logInfo("Voice connection destroyed");
    });

    connection.on("error", (err) => {
      logDetail(`❌ Voice Error: ${err?.message || String(err)}`);
    });
  }

  // =====================================================
  // PLAYLIST / PLAYBACK
  // =====================================================
  start() {
    if (!Array.isArray(playlist) || !playlist.length) {
      logDetail("❌ Playlist kosong, tidak ada yang bisa diputar");
      return;
    }

    if (this.isPlayingSomething) return;
    this._playIndex(this.currentIndex, true);
  }

  _playNext() {
    if (this.isDestroyed) return;
    if (!Array.isArray(playlist) || !playlist.length) return;

    this.currentIndex++;

    let restarted = false;

    if (this.currentIndex >= playlist.length) {
      if (!AUTO_LOOP) return;

      this.currentIndex = 0;
      restarted = true;
      box(["🔁 Playlist Restart"]);
    } else {
      box(["⏭ Next Song"]);
    }

    // Hindari stack overflow: gunakan setImmediate
    setImmediate(() => this._playIndex(this.currentIndex, false));
  }

  _songName(index) {
    const url = playlist[index];
    if (!url) return "Unknown";

    try {
      const cleanPath = url.split("?")[0];
      const decoded = decodeURIComponent(cleanPath);
      const fileName = decoded.split("/").pop() || url;
      return fileName.replace(/\.mp3$/i, "");
    } catch {
      return url;
    }
  }

  async _playIndex(index, isFirstLog) {
    if (this.isDestroyed) return;

    const url = playlist[index];
    if (!url) {
      // Skip ke berikutnya kalau index invalid
      this._handlePlaybackFailure();
      return;
    }

    try {
      const httpStream = await this._getHttpStream(url);
      this.currentStream = httpStream;

      const transcoder = new prism.FFmpeg({
        args: [
          "-analyzeduration", "0",
          "-loglevel", "0",
          "-f", "s16le",
          "-ar", "48000",
          "-ac", "2"
        ]
      });
      this.currentTranscoder = transcoder;

      let failed = false;
      const failOnce = (logFn, err) => {
        if (failed || this.isDestroyed) return;
        failed = true;
        box([logFn]);
        logDetail(err?.message || String(err));
        logDetail(`URL: ${url}`);
        this._handlePlaybackFailure();
      };

      httpStream.on("error", (err) =>
        failOnce("❌ Stream Error", err)
      );
      transcoder.on("error", (err) =>
        failOnce("❌ FFmpeg Error", err)
      );

      const pcmStream = httpStream.pipe(transcoder);
      pcmStream.on("error", () => {});

      const resource = createAudioResource(pcmStream, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });
      this.currentResource = resource;

      if (resource.volume) {
        try {
          resource.volume.setVolume(DEFAULT_VOLUME);
        } catch (err) {
          logDetail(`⚠️ Gagal set volume: ${err.message}`);
        }
      }

      this.isPlayingSomething = true;
      this.audioPlayer.play(resource);

      if (isFirstLog) {
        box([
          "🎵 Playing",
          this._songName(index),
          `${index + 1}/${playlist.length}`
        ]);
      }

      if (AUTO_STATUS) {
        this._updateStatus(this._songName(index));
      }
    } catch (err) {
      box(["❌ Playback Error"]);
      logDetail(err?.message || String(err));
      logDetail(`URL: ${url}`);
      this._handlePlaybackFailure();
    }
  }

  _handlePlaybackFailure() {
    if (this.isDestroyed) return;
    this._cleanupCurrentStream();
    // Skip otomatis ke lagu berikutnya
    setImmediate(() => this._playNext());
  }

  _cleanupCurrentStream() {
    try {
      if (this.currentStream) {
        this.currentStream.unpipe?.();
        this.currentStream.destroy?.();
        this.currentStream = null;
      }
    } catch {}

    try {
      if (this.currentTranscoder) {
        this.currentTranscoder.unpipe?.();
        this.currentTranscoder.destroy?.();
        this.currentTranscoder = null;
      }
    } catch {}

    this.currentResource = null;
  }

  _getHttpStream(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: { "User-Agent": "Discord-Game-Bot/1.0" }
        },
        (res) => {
          const status = res.statusCode || 0;

          // Handle redirect
          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location
          ) {
            res.resume();
            return this._getHttpStream(res.headers.location)
              .then(resolve)
              .catch(reject);
          }

          if (status < 200 || status >= 300) {
            res.resume();
            return reject(new Error(`HTTP ${status}`));
          }

          resolve(res);
        }
      );

      request.on("error", (err) => reject(err));

      request.setTimeout(15000, () => {
        request.destroy(new Error("Connection timeout"));
      });
    });
  }

  _updateStatus(songName) {
    try {
      if (!this.client.user) return;

      this.client.user.setPresence({
        activities: [
          {
            name: `🎵 ${songName}`,
            type: 2
          }
        ],
        status: "online"
      });
    } catch (err) {
      logDetail(`❌ Presence Error: ${err?.message || String(err)}`);
    }
  }

  destroy() {
    this.isDestroyed = true;

    this._cleanupCurrentStream();

    try {
      this.audioPlayer.stop(true);
      this.audioPlayer.removeAllListeners();
    } catch {}

    try {
      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }
    } catch {}

    logInfo("MusicPlayer destroyed");
  }
}

// =========================================
// SINGLETON STATE
// =========================================

let musicPlayerInstance = null;
let voiceStateListenerRegistered = false;

// =========================================
// ENTRY POINT
// =========================================

function startMusicPlayer(client, voiceChannelId) {
  if (!client || typeof client.on !== "function") {
    console.error("❌ startMusicPlayer: client tidak valid.");
    return;
  }

  if (!voiceChannelId || typeof voiceChannelId !== "string") {
    console.error("❌ startMusicPlayer: voiceChannelId tidak valid.");
    return;
  }

  if (!musicPlayerInstance) {
    musicPlayerInstance = new MusicPlayer(client);
  }

  musicPlayerInstance.connect(voiceChannelId).catch((err) => {
    logDetail(
      `❌ startMusicPlayer error: ${err?.message || String(err)}`
    );
  });

  // =========================================
  // VOICE STATE LISTENER (anti-duplicate)
  // =========================================
  if (voiceStateListenerRegistered) return;
  voiceStateListenerRegistered = true;

  client.on("voiceStateUpdate", (oldState, newState) => {
    try {
      // Guard: client.user bisa null saat startup
      if (!client.user) return;

      if (oldState.member?.id !== client.user.id) return;

      const wasInChannel = !!oldState.channelId;
      const nowNotInChannel = !newState.channelId;

      if (wasInChannel && nowNotInChannel) {
        logInfo(
          "Bot dikeluarkan dari voice channel, mencoba join kembali..."
        );

        setTimeout(() => {
          if (!musicPlayerInstance || musicPlayerInstance.isDestroyed)
            return;

          // Reset retry counter karena ini manual rejoin
          musicPlayerInstance.connectRetryCount = 0;
          musicPlayerInstance.connect(voiceChannelId).catch((err) => {
            logDetail(
              `❌ Rejoin error: ${err?.message || String(err)}`
            );
          });
        }, 3000);
      }
    } catch (err) {
      logDetail(
        `❌ voiceStateUpdate error: ${err?.message || String(err)}`
      );
    }
  });

  // =========================================
  // CLEANUP ON SHUTDOWN
  // =========================================
  if (!client.__musicPlayerCleanupRegistered) {
    client.__musicPlayerCleanupRegistered = true;

    const cleanup = () => {
      if (musicPlayerInstance) {
        musicPlayerInstance.destroy();
        musicPlayerInstance = null;
        console.log("🧹 Music player dibersihkan.");
      }
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("beforeExit", cleanup);
  }
}

module.exports = startMusicPlayer;