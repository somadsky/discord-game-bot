# Public Release Audit

## Removed from release

- `.env` and local credentials
- `node_modules/`, caches, npm logs, and backup archives
- Personal certificate images
- Personal logo asset
- Hard-coded server/channel/user IDs from the original deployment

## Configurable values

Server-specific IDs are loaded through `.env` and `config.js`.

## Important review items before production

- Add your own authorized logo and fonts if desired.
- Confirm that all music/audio URLs and datasets are legally distributable.
- Review every command's permissions before enabling it on a public server.
- Consider per-guild storage if the bot will serve multiple servers.
- Do not publish real user records or generated certificates.


## Final audit pass (2026-09-24)

### Completed
- Replaced private branding defaults with configurable public branding variables.
- Replaced market alert wording that could be interpreted as financial advice with neutral informational wording.
- Added configurable `BOT_NAME`, `CERTIFICATE_ISSUER`, and `MARKET_FOOTER`.
- Fixed the monthly reset idempotency key to use the Asia/Jakarta year and month, not the host machine's local year/month.
- Added documentation about the current single-community/local score-storage limitation.
- Syntax check passed for all 39 JavaScript files.

### Not fully verifiable in this environment
- `npm install --ignore-scripts --no-audit --no-fund` timed out, so dependency installation and native voice modules were not runtime-verified here.
- No live Discord token/server was available, so gateway login, permissions, intents, voice playback, and every command were not integration-tested.
- Score data is still keyed by user ID rather than a guild-scoped storage model. Treat the current release as a single-community deployment unless you migrate storage to include `guildId`.

### Required before production
1. Run `npm install` locally or on the target host.
2. Run `npm run check:all`.
3. Configure and verify the required privileged intents in the Discord Developer Portal.
4. Test each command in a private test server.
5. Review the third-party audio/data URLs and their usage rights.
6. Never commit `.env`, runtime data, logs, generated certificates, or user exports.
