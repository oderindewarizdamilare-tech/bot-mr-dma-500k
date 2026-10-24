# DMA BOT — MR DMA 500K

A starter project with Telegram controls and a WhatsApp Web connection using Baileys. This is not yet the full command list from the inspiration menu.

## Included and implemented
- Telegram `/start`, `/myid`, `/menu`, `/alive`, `/status`, `/pair`
- Owner-only pairing controls
- WhatsApp commands: `.menu`, `.alive`, `.owner`, `.status`
- Persistent WhatsApp auth files when deployed with the included Render disk
- MR DMA channel link shown in the menu

## Important limitations
- WhatsApp Web automation uses an unofficial library and may break or trigger WhatsApp account restrictions. Use an account you control and review WhatsApp's terms before connecting.
- The pairing code is sensitive. Do not forward it or post it publicly.
- The required-channel link is displayed, but this starter does **not** automatically verify WhatsApp Channel membership.
- Commands such as AI, media downloads, anti-delete, group moderation, weather, games, and image generation are not included yet. They must be added and tested before appearing in the menu.
- This build pairs one owner-controlled WhatsApp account. It does not provide separate WhatsApp pairing sessions for every public user.
- Do not put Telegram bot tokens or WhatsApp session files in a public repository.

## Deploy on Render
1. Create a private GitHub repository and upload these project files.
2. In Render, create a **Background Worker** from that repository.
3. Set Build Command to `npm install` and Start Command to `npm start`.
4. Add a persistent disk mounted at `/opt/render/project/src/auth_info` (1 GB is enough for the starter).
5. Add environment variables:
   - `TELEGRAM_BOT_TOKEN` — the token from BotFather
   - `OWNER_TELEGRAM_ID` — your numeric Telegram ID (send `/myid` to your bot after the first deployment; then add the value and redeploy)
   - `OWNER_WHATSAPP_NUMBER` — your WhatsApp number with country code, digits only, e.g. Nigeria: `2348012345678`
   - `REQUIRED_CHANNEL_URL` — `https://whatsapp.com/channel/0029VbD3i9hAInPm8CdFCe1M`
   - `PREFIX` — `.`
   - `BOT_NAME` — `DMA BOT — MR DMA 500K`
6. First deployment needs `OWNER_TELEGRAM_ID` configured because the process exits without it. To get your ID before setting it, use a trusted Telegram ID bot, or temporarily set it to your own numeric Telegram ID if you already know it. Never share your bot token in chat.
7. Once deployed, open your Telegram bot privately and send `/pair`. The pairing code should be delivered only to the configured owner. Enter it in WhatsApp's **Linked devices** flow when prompted.
8. Send `/status` in Telegram and test `.alive` in a WhatsApp chat.

## Local testing
- Install Node.js 20 or newer.
- Copy `.env.example` to `.env`, fill in values, then run `npm install` and `npm start`.
- Keep `.env` and `auth_info/` private.
