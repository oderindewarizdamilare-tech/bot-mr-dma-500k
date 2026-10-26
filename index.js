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

// ========================================
// MR DMA 500K BOT CONFIGURATION
// ========================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_TELEGRAM_ID = String(
  process.env.OWNER_TELEGRAM_ID || ""
).trim();

const OWNER_WHATSAPP_NUMBER = String(
  process.env.OWNER_WHATSAPP_NUMBER || ""
).replace(/\D/g, "");

const PREFIX = process.env.PREFIX || ".";
const BOT_NAME = process.env.BOT_NAME || "MR DMA 500K BOT";

const CHANNEL_URL =
  process.env.REQUIRED_CHANNEL_URL ||
  "https://whatsapp.com/channel/0029VbD3i9hAInPm8CdFCe1M";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment variables.");
  process.exit(1);
}

if (!OWNER_TELEGRAM_ID) {
  console.error("Missing OWNER_TELEGRAM_ID in environment variables.");
  process.exit(1);
}

const telegram = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const authDir = path.join(__dirname, "auth_info");

let waSocket = null;
let waReady = false;
let isPairing = false;
let reconnectTimer = null;

// ========================================
// GENERAL UTILITIES
// ========================================

function isOwner(msg) {
  return (
    msg &&
    msg.from &&
    String(msg.from.id) === OWNER_TELEGRAM_ID
  );
}

async function telegramReply(chatId, text, options = {}) {
  return telegram.sendMessage(chatId, text, {
    disable_web_page_preview: true,
    ...options,
  });
}

function extractText(message) {
  if (message.conversation) return message.conversation;

  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }

  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }

  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }

  if (message.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId;
  }

  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }

  return "";
}

// ========================================
// FREE FIRE SENSITIVITY
// ========================================

const sensitivityProfiles = {
  "samsung galaxy a06": {
    general: 190,
    redDot: 185,
    scope2x: 175,
    scope4x: 160,
    sniper: 100,
    freeLook: 150,
    dpi: 450,
  },

  "samsung a05": {
    general: 190,
    redDot: 185,
    scope2x: 175,
    scope4x: 160,
    sniper: 100,
    freeLook: 150,
    dpi: 450,
  },

  "samsung a04e": {
    general: 190,
    redDot: 185,
    scope2x: 170,
    scope4x: 155,
    sniper: 95,
    freeLook: 145,
    dpi: 440,
  },

  "infinix hot 50i": {
    general: 195,
    redDot: 190,
    scope2x: 180,
    scope4x: 165,
    sniper: 105,
    freeLook: 150,
    dpi: 480,
  },

  "infinix hot 40i": {
    general: 195,
    redDot: 190,
    scope2x: 180,
    scope4x: 165,
    sniper: 105,
    freeLook: 150,
    dpi: 480,
  },

  "tecno pop 9": {
    general: 190,
    redDot: 185,
    scope2x: 175,
    scope4x: 160,
    sniper: 100,
    freeLook: 145,
    dpi: 450,
  },

  "tecno spark 8c": {
    general: 190,
    redDot: 185,
    scope2x: 175,
    scope4x: 155,
    sniper: 100,
    freeLook: 145,
    dpi: 450,
  },

  "infinix hot 10": {
    general: 185,
    redDot: 180,
    scope2x: 170,
    scope4x: 155,
    sniper: 95,
    freeLook: 145,
    dpi: 430,
  },

  "infinix smart 5": {
    general: 185,
    redDot: 180,
    scope2x: 170,
    scope4x: 155,
    sniper: 95,
    freeLook: 140,
    dpi: 420,
  },

  "default": {
    general: 190,
    redDot: 185,
    scope2x: 175,
    scope4x: 160,
    sniper: 100,
    freeLook: 150,
    dpi: 450,
  },
};

function getSensitivity(device) {
  const name = String(device || "default")
    .toLowerCase()
    .trim();

  return sensitivityProfiles[name] || sensitivityProfiles.default;
}

function sensitivityText(device) {
  const s = getSensitivity(device);

  return `╭━━━〔 MR DMA 500K SENSI 〕━━━╮
┃ Device: ${device || "Default"}
┃ General: ${s.general}
┃ Red Dot: ${s.redDot}
┃ 2x Scope: ${s.scope2x}
┃ 4x Scope: ${s.scope4x}
┃ Sniper Scope: ${s.sniper}
┃ Free Look: ${s.freeLook}
┃ Suggested DPI: ${s.dpi}
╰━━━━━━━━━━━━━━━━━━━━━━╯

Recommended starting settings, not guaranteed headshots.

Adjust gradually to your screen, FPS and drag speed.
