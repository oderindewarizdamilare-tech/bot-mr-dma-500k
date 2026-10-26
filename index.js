require("dotenv").config();
const path = require("path");
const pino = require("pino");
const TelegramBot = require("node-telegram-bot-api");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_TELEGRAM_ID || "");
const OWNER_WA = String(process.env.OWNER_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const BOT_NAME = process.env.BOT_NAME || "MR DMA 500K BOT";
const CHANNEL_URL = process.env.REQUIRED_CHANNEL_URL || "https://whatsapp.com/channel/0029VbD3i9hAInPm8CdFCe1M";
if (!TOKEN) { console.error("Missing TELEGRAM_BOT_TOKEN environment variable"); process.exit(1); }

const telegram = new TelegramBot(TOKEN, { polling: true });
let waSocket = null, waReady = false, waConnecting = false, pairCodeBusy = false;
const profiles = {
  "samsung galaxy a06": {g:190,r:185,x2:175,x4:160,s:100,f:150,d:450},
  "samsung a06": {g:190,r:185,x2:175,x4:160,s:100,f:150,d:450},
  "samsung a05": {g:190,r:185,x2:175,x4:160,s:100,f:150,d:450},
  "samsung a04e": {g:190,r:185,x2:170,x4:155,s:95,f:145,d:440},
  "infinix hot 50i": {g:195,r:190,x2:180,x4:165,s:105,f:150,d:480},
  "infinix hot 40i": {g:195,r:190,x2:180,x4:165,s:105,f:150,d:480},
  "infinix hot 10": {g:185,r:180,x2:170,x4:155,s:95,f:145,d:430},
  "infinix smart 5": {g:185,r:180,x2:170,x4:155,s:95,f:140,d:420},
  "tecno pop 9": {g:190,r:185,x2:175,x4:160,s:100,f:145,d:450},
  "tecno spark 8c": {g:190,r:185,x2:175,x4:155,s:100,f:145,d:450},
  "iphone 11": {g:180,r:175,x2:165,x4:150,s:95,f:140,d:"Default"}
};
function getProfile(device) {
  const name = String(device || "default").trim().toLowerCase();
  const key = Object.keys(profiles).find(k => name === k || name.includes(k) || k.includes(name));
  return {name: device || "Default phone", ...(profiles[key] || {g:190,r:185,x2:175,x4:160,s:100,f:150,d:450})};
}
function sensi(device) {
  const s = getProfile(device);
  return ["MR DMA 500K SENSITIVITY", "Device: " + s.name, "General: " + s.g, "Red Dot: " + s.r, "2x Scope: " + s.x2, "4x Scope: " + s.x4, "Sniper: " + s.s, "Free Look: " + s.f, "Suggested DPI: " + s.d, "", "These are starting settings. Adjust gradually to your device."].join("\n");
}
function menu() {
  return [BOT_NAME, "/start - Start bot", "/help or /menu - Show commands", "/alive or /ping - Test reply", "/status - Telegram and WhatsApp status", "/myid - Show Telegram ID", "/devices - Supported phones", "/sensi <phone> - Free Fire sensitivity", "/pair - Pair WhatsApp (owner only)", "/channel - Channel link", "/math 12+5 - Calculator", "Example: /sensi Samsung Galaxy A06"].join("\n");
}

telegram.onText(/^\/(start|help|menu)(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, "Welcome to " + BOT_NAME + "!\n\n" + menu()));
telegram.onText(/^\/(alive|ping)(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, BOT_NAME + " is online. Response: OK"));
telegram.onText(/^\/myid(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, "Your Telegram ID: " + m.from.id));
telegram.onText(/^\/status(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, "Telegram: running\nWhatsApp: " + (waReady ? "connected" : "not connected")));
telegram.onText(/^\/devices(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, "Supported phones:\n" + Object.keys(profiles).join("\n")));
telegram.onText(/^\/sensi(?:@\w+)?(?:\s+(.+))?$/i, (m,a) => telegram.sendMessage(m.chat.id, sensi(a && a[1])));
telegram.onText(/^\/channel(?:@\w+)?$/i, m => telegram.sendMessage(m.chat.id, "MR DMA channel:\n" + CHANNEL_URL));
telegram.onText(/^\/math(?:@\w+)?\s+(-?\d+(?:\.\d+)?)\s*([+*/%-])\s*(-?\d+(?:\.\d+)?)$/i, (m,a) => {
  const x = Number(a[1]), y = Number(a[3]); let n;
  switch (a[2]) { case "+": n=x+y; break; case "-": n=x-y; break; case "*": n=x*y; break; case "/": n=y===0?NaN:x/y; break; case "%": n=y===0?NaN:x%y; break; }
  return telegram.sendMessage(m.chat.id, Number.isFinite(n) ? "Answer: " + n : "Cannot divide by zero.");
});
telegram.onText(/^\/pair(?:@\w+)?$/i, async m => {
  if (!OWNER_ID || String(m.from.id) !== OWNER_ID) return telegram.sendMessage(m.chat.id, "This command is for the bot owner only.");
  if (!OWNER_WA) return telegram.sendMessage(m.chat.id, "Set OWNER_WHATSAPP_NUMBER in Render to your WhatsApp number with country code, digits only.");
  if (!waSocket || waReady) return telegram.sendMessage(m.chat.id, waReady ? "WhatsApp is already connected." : "WhatsApp is still starting. Wait a few seconds and try /pair again.");
  if (pairCodeBusy) return telegram.sendMessage(m.chat.id, "A pairing request is already running. Wait a moment.");
  pairCodeBusy = true;
  try {
    const code = await waSocket.requestPairingCode(OWNER_WA);
    await telegram.sendMessage(m.chat.id, "WhatsApp pairing code: " + code + "\nOpen WhatsApp > Linked devices > Link a device > Link with phone number, then enter this code. Do not share it.");
  } catch (e) {
    await telegram.sendMessage(m.chat.id, "Could not create a pairing code yet. Check OWNER_WHATSAPP_NUMBER in Render and try again.");
    console.error("Pairing code error:", e.message);
  } finally { pairCodeBusy = false; }
});

telegram.on("message", async m => {
  if (!m.text || m.text.startsWith("/")) return;
  const t = m.text.trim().toLowerCase(); let answer;
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(t)) answer = "Hello! " + BOT_NAME + " is online. Send /menu to see commands.";
  else if (t === "menu") answer = menu();
  else if (t.includes("sensi") || t.includes("sensitivity")) answer = "Send /sensi followed by your phone model. Example: /sensi Samsung Galaxy A06";
  else answer = "I'm " + BOT_NAME + ". Send /menu for commands or /sensi Samsung Galaxy A06 for Free Fire settings.";
  telegram.sendMessage(m.chat.id, answer).catch(e => console.error("Telegram reply error:", e.message));
});

async function connectWhatsApp() {
  if (waConnecting) return;
  waConnecting = true;
  try {
    const {state, saveCreds} = await useMultiFileAuthState(path.join(__dirname, "auth_info"));
    waSocket = makeWASocket({auth:state, logger:pino({level:"silent"}), printQRInTerminal:false, browser:["MR DMA 500K BOT","Chrome","1.0.0"]});
    waSocket.ev.on("creds.update", saveCreds);
    waSocket.ev.on("connection.update", u => {
      if (u.connection === "open") { waReady = true; waConnecting = false; console.log("WhatsApp connected"); }
      if (u.connection === "close") {
        waReady = false; waConnecting = false;
        const c = u.lastDisconnect?.error?.output?.statusCode;
        if (c !== DisconnectReason.loggedOut) setTimeout(() => connectWhatsApp().catch(console.error), 5000);
        else console.error("WhatsApp logged out. Check the account, then use /pair.");
      }
    });
    waSocket.ev.on("messages.upsert", async ({messages,type}) => {
      if (type !== "notify") return;
      for (const m of messages || []) {
        if (!m.message || m.key.fromMe || m.key.remoteJid === "status@broadcast") continue;
        const x = m.message;
        const body = x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || "";
        if (!body.trim()) continue;
        const t = body.trim(), low = t.toLowerCase(); let answer;
        if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(low)) answer = "Hello! MR DMA 500K BOT is online. Send menu for commands.";
        else if (["menu", ".menu", "/menu"].includes(low)) answer = menu();
        else if (/^([./])?sensi(?:\s+(.+))?$/i.test(t)) answer = sensi(t.match(/^([./])?sensi(?:\s+(.+))?$/i)?.[2]);
        else if (["alive", "ping", ".alive", "/alive"].includes(low)) answer = "MR DMA 500K BOT is online.";
        else if (["devices", ".devices", "/devices"].includes(low)) answer = "Supported phones:\n" + Object.keys(profiles).join("\n");
        else answer = "MR DMA 500K BOT\nSend menu for commands or sensi Samsung Galaxy A06 for settings.";
        try { await waSocket.sendMessage(m.key.remoteJid, {text:answer}); } catch (e) { console.error("WhatsApp reply error:", e.message); }
      }
    });
  } catch (e) {
    waConnecting = false; console.error("WhatsApp startup error:", e.message);
    setTimeout(() => connectWhatsApp().catch(console.error), 10000);
  }
}
telegram.on("polling_error", e => console.error("Telegram polling error:", e.message));
telegram.on("error", e => console.error("Telegram error:", e.message));
console.log(BOT_NAME + " starting...");
connectWhatsApp().catch(e => console.error("WhatsApp startup:", e.message));
