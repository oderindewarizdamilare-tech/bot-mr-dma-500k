require("dotenv").config();

const path = require("path");
const pino = require("pino");
const TelegramBot = require("node-telegram-bot-api");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

// ========================================
// MR DMA 500K BOT
// ========================================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_TELEGRAM_ID || "").trim();
const OWNER_WA = String(
  process.env.OWNER_WHATSAPP_NUMBER || ""
).replace(/\D/g, "");

const BOT_NAME = process.env.BOT_NAME || "MR DMA 500K BOT";
const PREFIX = process.env.PREFIX || ".";
const CHANNEL_URL =
  process.env.REQUIRED_CHANNEL_URL ||
  "https://whatsapp.com/channel/0029VbD3i9hAInPm8CdFCe1M";

if (!TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  process.exit(1);
}

const telegram = new TelegramBot(TOKEN, { polling: true });
const authDir = path.join(__dirname, "auth_info");

let waSocket;
let waReady = false;
let connecting = false;

// ========================================
// FREE FIRE SENSITIVITY
// ========================================

const profiles = {
  "samsung galaxy a06": {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 160, sniper: 100, freeLook: 150, dpi: 450
  },
  "samsung a06": {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 160, sniper: 100, freeLook: 150, dpi: 450
  },
  "samsung a05": {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 160, sniper: 100, freeLook: 150, dpi: 450
  },
  "samsung a04e": {
    general: 190, redDot: 185, scope2x: 170,
    scope4x: 155, sniper: 95, freeLook: 145, dpi: 440
  },
  "infinix hot 50i": {
    general: 195, redDot: 190, scope2x: 180,
    scope4x: 165, sniper: 105, freeLook: 150, dpi: 480
  },
  "infinix hot 40i": {
    general: 195, redDot: 190, scope2x: 180,
    scope4x: 165, sniper: 105, freeLook: 150, dpi: 480
  },
  "infinix hot 10": {
    general: 185, redDot: 180, scope2x: 170,
    scope4x: 155, sniper: 95, freeLook: 145, dpi: 430
  },
  "infinix smart 5": {
    general: 185, redDot: 180, scope2x: 170,
    scope4x: 155, sniper: 95, freeLook: 140, dpi: 420
  },
  "tecno pop 9": {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 160, sniper: 100, freeLook: 145, dpi: 450
  },
  "tecno spark 8c": {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 155, sniper: 100, freeLook: 145, dpi: 450
  },
  default: {
    general: 190, redDot: 185, scope2x: 175,
    scope4x: 160, sniper: 100, freeLook: 150, dpi: 450
  }
};

function getProfile(device = "default") {
  const name = device.toLowerCase().trim();

  if (profiles[name]) return profiles[name];

  const match = Object.keys(profiles).find(
    key => key !== "default" &&
    (name.includes(key) || key.includes(name))
  );

  return profiles[match || "default"];
}

function sensitivityText(device = "default") {
  const s = getProfile(device);

  return [
    "╭━━━〔 MR DMA 500K SENSI 〕━━━╮",
    `┃ Device: ${device}`,
    `┃ General: ${s.general}`,
    `┃ Red Dot: ${s.redDot}`,
    `┃ 2x Scope: ${s.scope2x}`,
    `┃ 4x Scope: ${s.scope4x}`,
    `┃ Sniper Scope: ${s.sniper}`,
    `┃ Free Look: ${s.freeLook}`,
    `┃ Suggested DPI: ${s.dpi}`,
    "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    "",
    "These are starting settings, not guaranteed headshots.",
    "Adjust gradually to your screen and drag speed."
  ].join("\n");
}

function deviceList() {
  return Object.keys(profiles)
    .filter(name => name !== "default")
    .map(name => "• " + name)
    .join("\n");
}

// ========================================
// TELEGRAM COMMANDS
// ========================================

function menuText() {
  return [
    `╭━━〔 ${BOT_NAME} 〕━━╮`,
    "",
    "/start - Start the bot",
    "/help - Show commands",
    "/menu - Open this menu",
    "/alive - Check if the bot is running",
    "/ping - Test the response",
    "/status - Check WhatsApp connection",
    "/myid - Show your Telegram ID",
    "/devices - List supported phones",
    "/sensi <device> - Get sensitivity",
    "/channel - Open our channel",
    "/math <expression> - Calculate",
    "",
    "Example: /sensi Samsung Galaxy A06",
    "Example: /math 25*4",
    "",
    "MR DMA 500K"
  ].join("\n");
}

telegram.onText(/^\/start(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(
    msg.chat.id,
    `Welcome to ${BOT_NAME}!\n\nI'm online and ready.\n\n${menuText()}`
  );
});

telegram.onText(/^\/(?:help|menu)(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(msg.chat.id, menuText());
});

telegram.onText(/^\/(?:alive|ping)(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(
    msg.chat.id,
    `MR DMA 500K BOT is online.\nResponse: OK`
  );
});

telegram.onText(/^\/myid(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(
    msg.chat.id,
    `Your Telegram ID is: ${msg.from.id}`
  );
});

telegram.onText(/^\/status(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(
    msg.chat.id,
    `Telegram: Online\nWhatsApp: ${waReady ? "Connected" : "Not connected"}`
  );
});

telegram.onText(/^\/devices(?:@\w+)?$/, async msg => {
  await telegram.sendMessage(
    msg.chat.id,
    "Supported devices:\n\n" + deviceList() +
    "\n\nUse /sensi followed by your phone model."
  );
});

telegram.onText(/^\/sensi(?:@\w+)?(?:\s+(.+))?$/
