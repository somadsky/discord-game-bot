require('dotenv').config();

function csv(value) {
  return new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean));
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numbers(value, fallback) {
  const parsed = String(value || '').split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  return parsed.length ? parsed : fallback;
}

module.exports = {
  voiceAdminIds: csv(process.env.VOICE_ADMIN_IDS),
  protectedUserIds: csv(process.env.PROTECTED_USER_IDS),
  jockieBotIds: csv(process.env.JOCKIE_BOT_IDS),
  gameBotIds: csv(process.env.GAME_BOT_IDS),
  gameAllowedChannelIds: csv(process.env.GAME_ALLOWED_CHANNEL_IDS),
  musicAllowedChannelId: process.env.MUSIC_ALLOWED_CHANNEL_ID || '',
  minorityRoleId: process.env.MINORITY_ROLE_ID || '',
  voiceChannelId: process.env.VOICE_CHANNEL_ID || '',
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || '',
  leaveChannelId: process.env.LEAVE_CHANNEL_ID || '',
  monthlyResetChannelId: process.env.MONTHLY_RESET_CHANNEL_ID || '',
  musicDataUrl: process.env.MUSIC_DATA_URL || '',
  footerText: process.env.FOOTER_TEXT || 'Your Community',
  ownerIds: csv(process.env.OWNER_IDS),
  mainChannelId: process.env.MAIN_CHANNEL_ID || '',
  alertUserId: process.env.ALERT_USER_ID || '',
  marketChannelId: process.env.MARKET_CHANNEL_ID || '',
  confessionChannelId: process.env.CONFESSION_CHANNEL_ID || '',
  botName: process.env.BOT_NAME || 'Discord Game Bot',
  certificateIssuer: process.env.CERTIFICATE_ISSUER || process.env.BOT_NAME || 'Discord Game Bot',
  marketFooter: process.env.MARKET_FOOTER || process.env.BOT_NAME || 'Discord Game Bot',
  marketBtcBase: number(process.env.MARKET_BTC_BASE, 70000),
  marketBtcDropPercent: number(process.env.MARKET_BTC_DROP_PERCENT, 3),
  marketUpdateIntervalMs: Math.max(10000, number(process.env.MARKET_UPDATE_INTERVAL_MS, 30000)),
  marketUpdateMinutes: numbers(process.env.MARKET_UPDATE_MINUTES, [0, 15, 30, 45]),
  marketTimezone: process.env.MARKET_TIMEZONE || 'Asia/Jakarta'
};
