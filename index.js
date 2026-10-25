require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const TelegramBot = require("node-telegram-bot-api");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_TELEGRAM_ID = String(process.env.OWNER_TELEGRAM_ID || "").trim();
const OWNER_WHATSAPP_NUMBER = String(process.env.OWNER_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const PREFIX = process.env.PREFIX || ".";
const BOT_NAME = process.env.BOT_NAME || "DMA BOT — MR DMA 500K";
const CHANNEL_URL = process.env.REQUIRED_CHANNEL_URL || "https://whatsapp.com/channel/0029VbD3i9hAInPm8CdFCe1M";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  process.exit(1);
}
if (!OWNER_TELEGRAM_ID) {
  console.error("Missing OWNER_TELEGRAM_ID environment variable. Use /myid in Telegram to find your ID, then set it in Render.");
  process.exit(1);
}

const telegram = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const authDir = path.join(__dirname, "auth_info");
let waSocket = null;
let waReady = false;
let isPairing = false;

const menuText = () =>
`╭━━━〔 *${BOT_NAME}* 〕━━━╮
┃ Owner: *MR DMA*
┃ Prefix: \`${PREFIX}\`
┃ Version: 1.0.0
╰━━━━━━━━━━━━━━━━━━╯

*BASIC COMMANDS*
${PREFIX}menu — Show this menu
${PREFIX}alive — Check bot status
${PREFIX}owner — Owner information

*STATUS*
${PREFIX}status — WhatsApp connection status (owner only in Telegram)

*CHANNEL*
Support the MR DMA WhatsApp Channel:
${CHANNEL_URL}

Note: This is the starter build. More commands should only be listed after they are implemented and tested.`;

function isOwner(msg) { 
  return msg && msg.from && String(msg.from.id) === OWNER_TELEGRAM_ID;
}

async function telegramReply(chatId, text, options = {}) {
  return telegram.sendMessage(chatId, text, { disable_web_page_preview: true, ...options });
}

telegram.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  const intro =
`Welcome to ${BOT_NAME}.

Use /menu to view commands.
Use /myid to see your Telegram ID.
Only the configured owner can run WhatsApp pairing controls.

Please join/support the MR DMA channel:
${CHANNEL_URL}

Channel membership is not automatically verified by this starter.`;
  await telegramReply(msg.chat.id, intro);
});

telegram.onText(/^\/myid(?:@\w+)?$/, async (msg) => {
  await telegramReply(msg.chat.id, `Your Telegram ID is: ${msg.from.id}\nKeep this ID private if you prefer; it is not your bot token.`);
});

telegram.onText(/^\/menu(?:@\w+)?$/, async (msg) => {
  await telegramReply(msg.chat.id, menuText(), { parse_mode: "Markdown" });
});

telegram.onText(/^\/alive(?:@\w+)?$/, async (msg) => {
  await telegramReply(msg.chat.id, `${BOT_NAME} is online.\nWhatsApp: ${waReady ? "connected" : "not connected yet"}`);
});

telegram.onText(/^\/status(?:@\w+)?$/, async (msg) => {
  if (!isOwner(msg)) return telegramReply(msg.chat.id, "This command is only available to the bot owner.");
  await telegramReply(msg.chat.id, `WhatsApp status: ${waReady ? "connected" : "not connected"}\nPairing in progress: ${isPairing ? "yes" : "no"}`);
});

telegram.onText(/^\/pair(?:@\w+)?$/, async (msg) => {
  if (!isOwner(msg)) return telegramReply(msg.chat.id, "Pairing is owner-only. Ask the bot owner to run this command.");
  if (!OWNER_WHATSAPP_NUMBER) {
    return telegramReply(msg.chat.id, "OWNER_WHATSAPP_NUMBER is not set in Render. Add your WhatsApp number with country code, digits only (Nigeria example: 2348012345678), then redeploy.");
  }
  if (waReady) return telegramReply(msg.chat.id, "WhatsApp is already connected.");
  if (isPairing) return telegramReply(msg.chat.id, "A pairing request is already in progress. Please wait.");
  isPairing = true;
  try {
    await startWhatsApp();
    if (!waSocket) throw new Error("WhatsApp socket was not created.");
    if (waSocket.authState?.creds?.registered) {
      isPairing = false;
      return telegramReply(msg.chat.id, "This session is already registered. Check /status.");
    }
    const code = await waSocket.requestPairingCode(OWNER_WHATSAPP_NUMBER);
    await telegramReply(msg.chat.id,
      `WhatsApp pairing code for your number:\n\n${code}\n\nEnter this code in WhatsApp on the phone for that number. Do not share it with anyone. If it expires, try /pair again after checking /status.`);
  } catch (err) {
    console.error("Pairing error:", err?.message || err);
    await telegramReply(msg.chat.id, "Could not create a pairing code. Check the Render logs and confirm the number includes the country code. Try again after fixing any error.");
    isPairing = false;
  }
});

telegram.on("polling_error", (err) => console.error("Telegram polling error:", err.message));
telegram.on("error", (err) => console.error("Telegram error:", err.message));

async function startWhatsApp() {
  if (waSocket) return;
  fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  waSocket = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["DMA BOT", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  waSocket.ev.on("creds.update", saveCreds);
  waSocket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      waReady = true;
      isPairing = false;
      console.log("WhatsApp connected.");
      try {
        await telegramReply(Number(OWNER_TELEGRAM_ID), `${BOT_NAME}: WhatsApp connected successfully.`);
      } catch (_) {}
    }
    if (connection === "close") {
      waReady = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("WhatsApp connection closed. Status:", statusCode || "unknown");
      if (statusCode !== DisconnectReason.loggedOut) {
        waSocket = null;
        setTimeout(() => startWhatsApp().catch((e) => console.error("Reconnect error:", e.message)), 5000);
      } else {
        console.error("WhatsApp session logged out. Remove the saved auth_info session only if you intend to pair again.");
        waSocket = null;
        isPairing = false;
      }
    }
  });

  waSocket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages || []) {
      if (!msg.message || msg.key?.fromMe) continue;
      const jid = msg.key?.remoteJid;
      if (!jid || jid === "status@broadcast") continue;
      const text = extractText(msg.message).trim();
      if (!text.startsWith(PREFIX)) continue;
      const [commandRaw] = text.slice(PREFIX.length).trim().split(/\s+/);
      const command = (commandRaw || "").toLowerCase();
      let response = null;

      if (command === "menu") response = menuText().replace(/\*/g, "").replace(/`/g, "");
      if (command === "alive") response = `${BOT_NAME} is online.\nWhatsApp connection is active.`;
      if (command === "owner") response = "Bot owner: MR DMA\nBot name: DMA BOT — MR DMA 500K";
      if (command === "status") response = `WhatsApp: ${waReady ? "connected" : "not connected"}`;
      if (response) {
        try { await waSocket.sendMessage(jid, { text: response }); }
        catch (e) { console.error("Message send error:", e.message); }
      }
    }
  });
}

function extractText(message) {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) return message.listResponseMessage.singleSelectReply.selectedRowId;
  return "";
}

// Start a WhatsApp socket on launch so an existing saved session reconnects.
// Pairing codes are only sent to the configured owner's private Telegram chat.
startWhatsApp().catch((err) => console.error("WhatsApp startup error:", err.message));

process.on("SIGTERM", async () => {
  try { await telegram.stopPolling(); } catch (_) {}
  process.exit(0);
});
