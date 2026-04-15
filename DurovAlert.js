require('dotenv').config();
const { Telegraf }       = require('telegraf');
const WebSocket          = require('ws');
const axios              = require('axios');
const PersistentStorage  = require('./persistentStorage');
const { formatAction }   = require('./actions');
const { getTonscanAddressbook } = require('./utils');

// ── Config ────────────────────────────────────────────────
const bot     = new Telegraf(process.env.BOT_TOKEN);
const storage = new PersistentStorage('transactions.json');

const DUROV_WALLET = process.env.DUROV_WALLET;
const CHANNEL_ID   = process.env.CHANNEL_ID;
const ADMIN_ID     = 336163;
const API_KEY      = process.env.TONCENTER_API_KEY;
const API_URL      = process.env.TON_API_URL || 'https://toncenter.com/api/v3/actions';
const WS_URL       = 'wss://toncenter.com/api/streaming/v2/ws';

const POLL_INTERVAL    = 60_000;
const POLL_INTERVAL_FB = 30_000;

let tonscanAddressbook = {};
let ws = null;
let reconnectAttempts  = 0;
let reconnectTimer     = null;
let pingTimer          = null;
let pollTimer          = null;
let streaming          = false;

// ── Rate Limiter (for REST requests) ──────────────────────
const rateLimiter = {
  lastTime: 0,
  async throttle() {
    const wait = 1000 - (Date.now() - this.lastTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastTime = Date.now();
  },
};

// ── NFT Info Cache ────────────────────────────────────────
const nftCache = {};

async function getNftInfo(nftAddress) {
  if (nftCache[nftAddress]) return nftCache[nftAddress];
  try {
    await rateLimiter.throttle();
    const { data } = await axios.get('https://toncenter.com/api/v3/nft/items', {
      params: { address: nftAddress },
      headers: { 'X-API-Key': API_KEY },
    });
    if (data?.metadata?.[nftAddress]?.is_indexed) {
      const ti = data.metadata[nftAddress].token_info;
      if (ti?.[0]) {
        const result = { name: ti[0].name || 'Item', image: ti[0].image || null };
        nftCache[nftAddress] = result;
        return result;
      }
    }
  } catch (e) {
    console.error(`NFT info error: ${e.message}`);
  }
  return { name: 'Item', image: null };
}

// ── Telegram Sender ───────────────────────────────────────
async function sendMessage(text) {
  try {
    await bot.telegram.sendMessage(CHANNEL_ID, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (error) {
    if (error.message.includes('429')) {
      const sec = parseInt(error.message.match(/retry after (\d+)/)?.[1] || '35', 10);
      console.log(`Telegram rate-limit, waiting ${sec}s`);
      await new Promise(r => setTimeout(r, sec * 1000));
      await bot.telegram.sendMessage(CHANNEL_ID, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } else {
      console.error(`Telegram send error: ${error.message}`);
    }
  }
}

// ── Process One Action ────────────────────────────────────
async function processAction(action, fullResponse) {
  const id = action.trace_id;
  if (!id || storage.hasProcessedTx(id)) return;

  try {
    const message = await formatAction(action, fullResponse, {
      durovWallet: DUROV_WALLET,
      tonscanAddressbook,
      getNftInfo,
    });

    if (message && message.__unknown) {
      console.log(`Unknown action type: ${message.type} [${id.substring(0, 10)}]`);
      try {
        await bot.telegram.sendMessage(ADMIN_ID,
          `⚠️ Unknown action type: <code>${message.type}</code>\n` +
          `<a href="${message.txLink}">View on Tonscan</a>`,
          { parse_mode: 'HTML', disable_web_page_preview: true },
        );
      } catch (e) {
        console.error(`Admin notify error: ${e.message}`);
      }
    } else if (message) {
      console.log(`Sending: ${action.type} [${id.substring(0, 10)}]`);
      await sendMessage(message);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (error) {
    console.error(`Action error (${id.substring(0, 10)}): ${error.message}`);
  }

  storage.markTxProcessed(id);
}

// ── Polling ───────────────────────────────────────────────
async function pollTransactions() {
  try {
    await rateLimiter.throttle();

    const { data } = await axios.get(API_URL, {
      params: { account: DUROV_WALLET, limit: 20, sort: 'desc' },
      headers: { 'X-API-Key': API_KEY },
    });

    if (!data?.actions?.length) return;

    const lastTime = storage.getLastProcessedTime();
    const fresh = data.actions
      .filter(a => a.start_utime > lastTime || !storage.hasProcessedTx(a.trace_id))
      .sort((a, b) => a.start_utime - b.start_utime);

    if (!fresh.length) return;
    console.log(`Poll: ${fresh.length} new action(s)`);

    const fullResponse = {
      metadata:     data.metadata     || {},
      address_book: data.address_book || {},
    };

    for (const action of fresh) {
      await processAction(action, fullResponse);
    }

    const maxTime = Math.max(...fresh.map(a => a.start_utime));
    if (maxTime > storage.getLastProcessedTime()) {
      storage.setLastProcessedTime(maxTime);
    }
  } catch (error) {
    console.error(`Poll error: ${error.message}`);
  }
}

function startPolling(interval) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try { await pollTransactions(); }
    catch (e) { console.error(`Poll tick error: ${e.message}`); }
  }, interval);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── WebSocket Streaming ───────────────────────────────────
let wsLoggedOnce = false;

function connectStreaming() {
  if (ws) { try { ws.terminate(); } catch {} }

  ws = new WebSocket(`${WS_URL}?api_key=${API_KEY}`);

  ws.on('open', () => {
    reconnectAttempts = 0;
    streaming = true;

    stopPolling();
    startPolling(POLL_INTERVAL);

    if (!wsLoggedOnce) {
      console.log(`[${ts()}] Stream connected, polling ${POLL_INTERVAL / 1000}s (backup)`);
      wsLoggedOnce = true;
    }

    ws.send(JSON.stringify({
      id:            'durov-actions',
      method:        'subscribe',
      addresses:     [DUROV_WALLET],
      types:         ['actions'],
      min_finality:  'confirmed',
    }));

    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: `p-${Date.now()}`, method: 'ping' }));
      }
    }, 15_000);
  });

  ws.on('message', async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.status) return;

      if (event.type === 'actions' && Array.isArray(event.actions)) {
        console.log(`[${ts()}] Stream: ${event.actions.length} action(s) [${event.finality}]`);

        const fullResponse = {
          metadata:     event.metadata     || {},
          address_book: event.address_book || {},
        };

        for (const action of event.actions) {
          await processAction(action, fullResponse);
        }

        const maxTime = Math.max(
          ...event.actions.map(a => a.start_utime || 0),
          storage.getLastProcessedTime(),
        );
        if (maxTime > storage.getLastProcessedTime()) {
          storage.setLastProcessedTime(maxTime);
        }
      }
    } catch (error) {
      console.error(`WS message error: ${error.message}`);
    }
  });

  ws.on('close', () => {
    clearInterval(pingTimer);
    streaming = false;
    scheduleReconnect();
  });

  ws.on('error', () => {});
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  if (!streaming && !pollTimer) {
    startPolling(POLL_INTERVAL_FB);
    console.log(`[${ts()}] Streaming unavailable, polling every ${POLL_INTERVAL_FB / 1000}s`);
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60_000);
  reconnectAttempts++;

  reconnectTimer = setTimeout(async () => {
    try { await pollTransactions(); } catch {}
    connectStreaming();
  }, delay);
}

// ── Boot ──────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }

async function startBot() {
  console.log(`[${ts()}] DurovAlert starting...`);

  try {
    tonscanAddressbook = await getTonscanAddressbook();
  } catch (e) {
    console.error(`Addressbook load failed: ${e.message}`);
  }

  await pollTransactions();

  startPolling(POLL_INTERVAL_FB);
  console.log(`[${ts()}] Polling started (${POLL_INTERVAL_FB / 1000}s)`);

  connectStreaming();

  setInterval(async () => {
    try { tonscanAddressbook = await getTonscanAddressbook(); }
    catch (e) { console.error(`Addressbook refresh: ${e.message}`); }
  }, 5 * 60_000);

  console.log(`[${ts()}] DurovAlert running`);
}

startBot();
