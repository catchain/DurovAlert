/**
 * Emulation script: sends one message per action type to the test channel.
 * Uses REAL transactions from Durov's wallet where possible,
 * realistic mocks for types he hasn't done (burn, liquidity, staking).
 *
 * Run: node emulate.js
 */
require('dotenv').config();
const { Telegraf }     = require('telegraf');
const axios            = require('axios');
const { formatAction } = require('./actions');
const { getTonscanAddressbook } = require('./utils');

const bot        = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const WALLET     = process.env.DUROV_WALLET;
const API_KEY    = process.env.TONCENTER_API_KEY;

async function send(label, msg) {
  try {
    await bot.telegram.sendMessage(CHANNEL_ID, msg, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

async function fetchReal(actionType, limit = 50) {
  try {
    const { data } = await axios.get('https://toncenter.com/api/v3/actions', {
      params: { account: WALLET, limit, sort: 'desc', action_type: actionType },
      headers: { 'X-API-Key': API_KEY },
    });
    return data;
  } catch (e) {
    console.error(`  API error for ${actionType}: ${e.response?.status || e.message}`);
    return { actions: [], metadata: {}, address_book: {} };
  }
}

async function main() {
  console.log('Loading tonscan addressbook...');
  const tonscanAddressbook = await getTonscanAddressbook();

  const nftCache = {};
  async function getNftInfo(addr) {
    if (nftCache[addr]) return nftCache[addr];
    try {
      const { data } = await axios.get('https://toncenter.com/api/v3/nft/items', {
        params: { address: addr },
        headers: { 'X-API-Key': API_KEY },
      });
      if (data?.metadata?.[addr]?.is_indexed) {
        const ti = data.metadata[addr].token_info;
        if (ti?.[0]) {
          const r = { name: ti[0].name || 'Item', image: null };
          nftCache[addr] = r;
          return r;
        }
      }
    } catch {}
    return { name: 'Item', image: null };
  }

  const config = { durovWallet: WALLET, tonscanAddressbook, getNftInfo };

  const format = async (action, resp) => {
    const result = await formatAction(action, resp, config);
    if (result && result.__unknown) return null;
    return result;
  };

  console.log('Fetching real transactions...\n');

  // ── 1. TON Transfer ────────────────────────────────────
  {
    const data = await fetchReal('ton_transfer');
    const outgoing = data.actions.find(a => a.details.source === WALLET);
    if (outgoing) {
      const msg = await format(outgoing, data);
      if (msg) await send('ton_transfer', msg);
    }
  }
  await sleep(300);

  // ── 2. TON Transfer with comment ───────────────────────
  {
    const data = await fetchReal('ton_transfer', 100);
    const withComment = data.actions.find(a => a.details.source === WALLET && a.details.comment);
    if (withComment) {
      const msg = await format(withComment, data);
      if (msg) await send('ton_transfer + comment', msg);
    }
  }
  await sleep(300);

  // ── 3. Jetton Transfer ─────────────────────────────────
  {
    const data = await fetchReal('jetton_transfer');
    const outgoing = data.actions.find(a => a.details.sender === WALLET);
    if (outgoing) {
      const msg = await format(outgoing, data);
      if (msg) await send('jetton_transfer', msg);
    }
  }
  await sleep(300);

  // ── 4. Jetton Swap ─────────────────────────────────────
  {
    const data = await fetchReal('jetton_swap');
    let outgoing = data.actions?.find(a => a.details?.sender === WALLET);
    if (outgoing) {
      const msg = await format(outgoing, data);
      if (msg) await send('jetton_swap', msg);
    } else {
      // API often 500s on this type — use known real tx as fallback
      const USDT = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE';
      const fallback = {
        trace_id: '0bI11xodAq1dYLulvJnZ',
        type: 'jetton_swap',
        start_utime: 1724946743,
        details: {
          dex: 'dedust', sender: WALLET,
          asset_in: null, asset_out: USDT,
          dex_incoming_transfer: { amount: '1000000000' },
          dex_outgoing_transfer: { amount: '1447360' },
        },
      };
      const meta = { [USDT]: { is_indexed: true, token_info: [{ name: 'Tether USD', symbol: 'USDT', extra: { decimals: '6' } }] } };
      const msg = await format(fallback, { metadata: meta, address_book: {} });
      if (msg) await send('jetton_swap (cached)', msg);
    }
  }
  await sleep(300);

  // ── 5. Jetton Mint ─────────────────────────────────────
  {
    const data = await fetchReal('jetton_mint');
    if (data.actions?.[0]) {
      const msg = await format(data.actions[0], data);
      if (msg) await send('jetton_mint', msg);
    } else {
      const TERS = '0:73F1DC2567E1333B08402D30E9456AA5B15052561FC5CB2A27A45CC31BBDDEC0';
      const fallback = {
        trace_id: 'XSEBAEDakGRlIRVKRAui', type: 'jetton_mint', start_utime: 1724946000,
        details: { asset: TERS, amount: '1000000000000000', receiver: WALLET },
      };
      const meta = { [TERS]: { is_indexed: true, token_info: [{ name: 'TERS', symbol: 'TERS', extra: { decimals: '9' } }] } };
      const msg = await format(fallback, { metadata: meta, address_book: {} });
      if (msg) await send('jetton_mint (cached)', msg);
    }
  }
  await sleep(300);

  // ── 6. NFT Transfer (sent) ─────────────────────────────
  {
    const data = await fetchReal('nft_transfer', 100);
    const sent = data.actions.find(a => a.details.old_owner === WALLET && !a.details.is_purchase);
    if (sent) {
      const msg = await format(sent, data);
      if (msg) await send('nft_transfer (sent)', msg);
    }
  }
  await sleep(300);

  // ── 7. NFT Transfer (purchase) ─────────────────────────
  {
    const data = await fetchReal('nft_transfer', 100);
    const purchase = data.actions.find(a => a.details.is_purchase === true);
    if (purchase) {
      const msg = await format(purchase, data);
      if (msg) await send('nft_transfer (purchase)', msg);
    }
  }
  await sleep(300);

  // ── 8. Auction Bid ─────────────────────────────────────
  {
    const data = await fetchReal('auction_bid');
    const bid = data.actions.find(a => a.details.bidder === WALLET);
    if (bid) {
      const msg = await format(bid, data);
      if (msg) await send('auction_bid', msg);
    }
  }
  await sleep(300);

  // ── 9. Change DNS ──────────────────────────────────────
  {
    const data = await fetchReal('change_dns');
    const out = data.actions.find(a => a.details.source === WALLET);
    if (out) {
      const msg = await format(out, data);
      if (msg) await send('change_dns', msg);
    }
  }
  await sleep(300);

  // ── 10. Renew DNS ──────────────────────────────────────
  {
    const DNS_NFT = '0:0ACE81F76CC6B312965B5F1510FF113EEE3BDC4EDFAB504E9E57C5B33C5ECE23';
    const data = await fetchReal('renew_dns');
    const out = data.actions?.find(a => a.details?.source === WALLET);
    if (out) {
      const msg = await format(out, data);
      if (msg) await send('renew_dns', msg);
    } else {
      const fallback = {
        trace_id: '+dVQiuYCG/9Av7uxO5Tf', type: 'renew_dns', start_utime: 1724946000,
        details: { source: WALLET, asset: DNS_NFT },
      };
      const meta = { [DNS_NFT]: { is_indexed: true, token_info: [{ extra: { domain: 'durov.ton' } }] } };
      const msg = await format(fallback, { metadata: meta, address_book: {} });
      if (msg) await send('renew_dns (cached)', msg);
    }
  }
  await sleep(300);

  // ── 11. Delete DNS ─────────────────────────────────────
  {
    const DNS_NFT2 = '0:0ACE81F76CC6B312965B5F1510FF113EEE3BDC4EDFAB504E9E57C5B33C5ECE23';
    const data = await fetchReal('delete_dns');
    const out = data.actions?.find(a => a.details?.source === WALLET);
    if (out) {
      const msg = await format(out, data);
      if (msg) await send('delete_dns', msg);
    } else {
      const fallback = {
        trace_id: '4btCh7+ITGzAL5g3yGAl', type: 'delete_dns', start_utime: 1724946000,
        details: { source: WALLET, asset: DNS_NFT2 },
      };
      const meta = { [DNS_NFT2]: { is_indexed: true, token_info: [{ extra: { domain: 'sain.ton' } }] } };
      const msg = await format(fallback, { metadata: meta, address_book: {} });
      if (msg) await send('delete_dns (cached)', msg);
    }
  }
  await sleep(300);

  // ════════════════════════════════════════════════════════
  //  MOCK DATA — types Durov hasn't done (yet)
  //  Based on real API response structures
  // ════════════════════════════════════════════════════════

  const USDT_ADDR  = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE';
  const STON_ADDR  = '0:C1DDC8AAAD4B1F16B84B35E37E78E528C0E42B4FE6A97899B1C7AC850E0C0D11';
  const POOL_ADDR  = '0:1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF';

  const mockMeta = {
    [USDT_ADDR]: {
      is_indexed: true,
      token_info: [{ name: 'Tether USD', symbol: 'USDT', extra: { decimals: '6' } }],
    },
    [STON_ADDR]: {
      is_indexed: true,
      token_info: [{ name: 'STON', symbol: 'STON', extra: { decimals: '9' } }],
    },
  };

  const mockBook = {
    [WALLET]: { user_friendly: 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxv_HindnQ' },
    [POOL_ADDR]: { user_friendly: 'EQASNFaXkKvN7xI0R4aXkK_N7xI0R4aXkK_N7xI0R4aXkFoo' },
  };

  // ── 12. Jetton Burn (mock) ─────────────────────────────
  {
    const action = {
      trace_id: 'mock-jetton-burn-001',
      type: 'jetton_burn',
      start_utime: Math.floor(Date.now() / 1000),
      details: {
        owner: WALLET,
        asset: USDT_ADDR,
        amount: '500000000',
      },
    };
    const resp = { metadata: mockMeta, address_book: mockBook };
    const msg = await format(action, resp);
    if (msg) await send('jetton_burn (mock)', msg);
  }

  // ── 13. Stake Deposit (mock) ───────────────────────────
  {
    const action = {
      trace_id: 'mock-stake-deposit-001',
      type: 'stake_deposit',
      start_utime: Math.floor(Date.now() / 1000),
      details: {
        stake_holder: WALLET,
        pool: POOL_ADDR,
        provider: 'Tonstakers',
        amount: '50000000000000',
      },
    };
    const resp = { metadata: mockMeta, address_book: mockBook };
    const msg = await format(action, resp);
    if (msg) await send('stake_deposit (mock)', msg);
  }

  // ── 14. Stake Withdrawal (mock) ────────────────────────
  {
    const action = {
      trace_id: 'mock-stake-withdrawal-001',
      type: 'stake_withdrawal',
      start_utime: Math.floor(Date.now() / 1000),
      details: {
        stake_holder: WALLET,
        pool: POOL_ADDR,
        provider: 'Tonstakers',
        amount: '25000000000000',
      },
    };
    const resp = { metadata: mockMeta, address_book: mockBook };
    const msg = await format(action, resp);
    if (msg) await send('stake_withdrawal (mock)', msg);
  }

  // ── 15. DEX Deposit Liquidity (mock) ───────────────────
  {
    const action = {
      trace_id: 'mock-dex-deposit-001',
      type: 'dex_deposit_liquidity',
      start_utime: Math.floor(Date.now() / 1000),
      details: {
        sender: WALLET,
        dex: 'stonfi',
        asset_1: null,
        amount_1: '10000000000',
        asset_2: USDT_ADDR,
        amount_2: '35000000',
      },
    };
    const resp = { metadata: mockMeta, address_book: mockBook };
    const msg = await format(action, resp);
    if (msg) await send('dex_deposit_liquidity (mock)', msg);
  }

  // ── 16. DEX Withdraw Liquidity (mock) ──────────────────
  {
    const action = {
      trace_id: 'mock-dex-withdraw-001',
      type: 'dex_withdraw_liquidity',
      start_utime: Math.floor(Date.now() / 1000),
      details: {
        sender: WALLET,
        dex: 'dedust',
        asset_1: null,
        amount_1: '5000000000',
        asset_2: STON_ADDR,
        amount_2: '12000000000',
      },
    };
    const resp = { metadata: mockMeta, address_book: mockBook };
    const msg = await format(action, resp);
    if (msg) await send('dex_withdraw_liquidity (mock)', msg);
  }

  console.log('\nDone! Check the test channel.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error(e); process.exit(1); });
