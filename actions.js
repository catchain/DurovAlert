const {
  escapeMarkdown,
  formatTemplate,
  shortenAddress,
  formatNumber,
  formatTonAmount,
  formatDexName,
  formatTokenSymbol,
} = require('./utils');

// ════════════════════════════════════════════════════════════════
//  MESSAGE TEMPLATES  (HTML for Telegram)
//  Edit text/emoji here — {placeholders} are filled at runtime
// ════════════════════════════════════════════════════════════════

const T = {

  ton_transfer: {
    sent:              '💸 <a href="{txLink}">Sent</a> <b>{amount} TON</b> to <a href="{address}">{recipient}</a>',
    encrypted_comment: '📝 <b>Encrypted</b>',
    comment:           '📝 {comment}',
  },

  jetton_transfer: {
    sent:              '💎 <a href="{txLink}">Sent</a> <b>{amount} {symbol}</b> to <a href="{address}">{recipient}</a>',
    encrypted_comment: '📝 <b>Encrypted</b>',
    comment:           '📝 {comment}',
  },

  jetton_mint: {
    mint: '💎 <a href="{txLink}">Mint</a> jetton <b>{amount} {symbol}</b>',
  },

  jetton_burn: {
    burn: '🔥 <a href="{txLink}">Burn</a> <b>{amount} {symbol}</b>',
  },

  jetton_swap: {
    swap: '🔄 <a href="{txLink}">Exchange</a> <b>{inAmount} {inSymbol}</b> → <b>{outAmount} {outSymbol}</b> via <b>{dex}</b>',
  },

  nft_transfer: {
    sent:     '🖼 <a href="{txLink}">Sent</a> NFT <a href="{nftLink}"><b>{nftName}</b></a> to <a href="{address}">{recipient}</a>',
    purchase: '🖼 <a href="{txLink}">Buy</a> NFT <a href="{nftLink}"><b>{nftName}</b></a> for <b>{price} TON</b>',
    sell:     '🖼 <a href="{txLink}">Sell</a> NFT <a href="{nftLink}"><b>{nftName}</b></a> for <b>{price} TON</b>',
  },

  nft_mint: {
    mint: '🖼 <a href="{txLink}">Mint</a> NFT <a href="{nftLink}"><b>{nftName}</b></a>',
  },

  auction_bid: {
    bid: '💎 <a href="{txLink}">Bid</a> <b>{amount} TON</b> for <a href="{nftLink}"><b>{nftName}</b></a>',
  },

  change_dns: {
    change: '🌐 <a href="{txLink}">Update</a> domain <a href="{nftLink}"><b>{domain}</b></a>',
  },

  renew_dns: {
    renew: '🌐 <a href="{txLink}">Renew</a> domain <a href="{nftLink}"><b>{domain}</b></a>',
  },

  delete_dns: {
    delete: '🌐 <a href="{txLink}">Delete</a> domain <a href="{nftLink}"><b>{domain}</b></a>',
  },

  stake_deposit: {
    deposit: '📥 <a href="{txLink}">Stake</a> <b>{amount} TON</b> {provider}',
  },

  stake_withdrawal: {
    withdrawal: '📤 <a href="{txLink}">Unstake</a> <b>{amount} TON</b> {provider}',
  },

  dex_deposit_liquidity: {
    deposit: '💧 <a href="{txLink}">Add liquidity</a> <b>{amount0} {symbol0}</b> + <b>{amount1} {symbol1}</b> via <b>{dex}</b>',
  },

  dex_withdraw_liquidity: {
    withdraw: '💧 <a href="{txLink}">Remove liquidity</a> <b>{amount0} {symbol0}</b> + <b>{amount1} {symbol1}</b> via <b>{dex}</b>',
  },

  default: {
    transaction: '⚙️ <a href="{txLink}">Transaction</a> <code>{type}</code>',
  },
};

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

function getTokenInfo(asset, metadata) {
  let name = 'Jetton', symbol = '', decimals = 9;
  if (asset && metadata[asset] && metadata[asset].is_indexed) {
    const info = metadata[asset].token_info;
    if (info && info[0]) {
      name   = info[0].name || name;
      symbol = formatTokenSymbol(info[0].symbol) || name;
    }
  }
  decimals = parseInt(metadata[asset]?.token_info?.[0]?.extra?.decimals || '9');
  return { name, symbol, decimals };
}

function tokenAmount(asset, amount, metadata) {
  const { decimals } = getTokenInfo(asset, metadata);
  return formatNumber(Number(amount) / Math.pow(10, decimals));
}

function extractDomain(metadata, asset) {
  const info = metadata[asset];
  if (info?.token_info && Array.isArray(info.token_info)) {
    for (const ti of info.token_info) {
      if (ti?.extra?.domain) return ti.extra.domain;
    }
  }
  return 'Item';
}

function appendComment(message, comment, isEncrypted, tpl) {
  if (comment === null || comment === undefined) return message;
  if (isEncrypted) return message + '\n\n' + tpl.encrypted_comment;
  return message + '\n\n' + formatTemplate(tpl.comment, { comment: escapeMarkdown(comment) });
}

function createContext(tx, fullResponse, config) {
  const metadata    = fullResponse.metadata || {};
  const addressBook = fullResponse.address_book || {};
  const { tonscanAddressbook, getNftInfo, durovWallet } = config;

  const friendly = (addr) => addressBook[addr]?.user_friendly || addr;

  const formatAddr = (addr) => {
    const uf = friendly(addr);
    if (tonscanAddressbook[uf]) return tonscanAddressbook[uf].name;
    if (addressBook[addr]?.domain)  return addressBook[addr].domain;
    if (metadata[addr]?.is_indexed) {
      const ti = metadata[addr].token_info;
      if (ti?.[0]?.name) return shortenAddress(ti[0].name);
    }
    return shortenAddress(uf);
  };

  return {
    txLink:  `https://tonscan.org/tx/${encodeURIComponent(tx.trace_id)}`,
    wallet:  durovWallet,
    metadata,
    addressBook,
    getNftInfo,
    friendly,
    formatAddr,
    addrLink: (addr) => `https://tonscan.org/address/${encodeURIComponent(friendly(addr))}`,
    nftLink:  (addr) => `https://tonscan.org/nft/${encodeURIComponent(friendly(addr))}`,
    tokenInfo:   (asset) => getTokenInfo(asset, metadata),
    tokenAmount: (asset, amount) => tokenAmount(asset, amount, metadata),
  };
}

// ════════════════════════════════════════════════════════════════
//  ACTION HANDLERS
//  Each returns an HTML string or null (skip)
// ════════════════════════════════════════════════════════════════

const handlers = {

  // ── TON ──────────────────────────────────────────────
  async ton_transfer(d, ctx) {
    if (d.source !== ctx.wallet) return null;
    if (!d.value && d.value !== '0') return null;

    let msg = formatTemplate(T.ton_transfer.sent, {
      txLink:    ctx.txLink,
      amount:    escapeMarkdown(formatTonAmount(d.value)),
      recipient: escapeMarkdown(ctx.formatAddr(d.destination)),
      address:   ctx.addrLink(d.destination),
    });
    return appendComment(msg, d.comment, d.encrypted, T.ton_transfer);
  },

  // ── Jetton Transfer ─────────────────────────────────
  async jetton_transfer(d, ctx) {
    if (d.sender !== ctx.wallet) return null;
    const { symbol } = ctx.tokenInfo(d.asset);

    let msg = formatTemplate(T.jetton_transfer.sent, {
      txLink:    ctx.txLink,
      amount:    escapeMarkdown(ctx.tokenAmount(d.asset, d.amount)),
      symbol:    escapeMarkdown(symbol),
      recipient: escapeMarkdown(ctx.formatAddr(d.receiver)),
      address:   ctx.addrLink(d.receiver),
    });
    return appendComment(msg, d.comment, d.is_encrypted_comment, T.jetton_transfer);
  },

  // ── Jetton Mint ─────────────────────────────────────
  async jetton_mint(d, ctx) {
    const { symbol } = ctx.tokenInfo(d.asset);
    return formatTemplate(T.jetton_mint.mint, {
      txLink: ctx.txLink,
      amount: escapeMarkdown(ctx.tokenAmount(d.asset, d.amount)),
      symbol: escapeMarkdown(symbol),
    });
  },

  // ── Jetton Burn ─────────────────────────────────────
  async jetton_burn(d, ctx) {
    const owner = d.owner || d.sender;
    if (owner && owner !== ctx.wallet) return null;
    const { symbol } = ctx.tokenInfo(d.asset);

    return formatTemplate(T.jetton_burn.burn, {
      txLink: ctx.txLink,
      amount: escapeMarkdown(ctx.tokenAmount(d.asset, d.amount)),
      symbol: escapeMarkdown(symbol),
    });
  },

  // ── Jetton Swap ─────────────────────────────────────
  async jetton_swap(d, ctx) {
    if (d.sender !== ctx.wallet) return null;

    let inAmount = 0, inSymbol = '', outAmount = 0, outSymbol = '';

    if (d.asset_in === null) {
      inAmount  = formatTonAmount(d.dex_incoming_transfer?.amount || '0');
      inSymbol  = 'TON';
    } else {
      const t = ctx.tokenInfo(d.asset_in);
      inAmount  = ctx.tokenAmount(d.asset_in, d.dex_incoming_transfer?.amount || '0');
      inSymbol  = t.symbol || t.name;
    }

    if (d.asset_out === null) {
      outAmount = formatTonAmount(d.dex_outgoing_transfer?.amount || '0');
      outSymbol = 'TON';
    } else {
      const t = ctx.tokenInfo(d.asset_out);
      outAmount = ctx.tokenAmount(d.asset_out, d.dex_outgoing_transfer?.amount || '0');
      outSymbol = t.symbol || t.name;
    }

    return formatTemplate(T.jetton_swap.swap, {
      txLink:    ctx.txLink,
      inAmount:  escapeMarkdown(inAmount.toString()),
      inSymbol:  escapeMarkdown(inSymbol),
      outAmount: escapeMarkdown(outAmount.toString()),
      outSymbol: escapeMarkdown(outSymbol),
      dex:       escapeMarkdown(formatDexName(d.dex)),
    });
  },

  // ── NFT Transfer ────────────────────────────────────
  async nft_transfer(d, ctx) {
    if (d.old_owner !== ctx.wallet && !d.is_purchase) return null;

    let nftName = 'Item';
    try {
      const info = await ctx.getNftInfo(d.nft_item);
      nftName = info.name || 'Item';
    } catch {}

    const data = {
      txLink:    ctx.txLink,
      nftName:   escapeMarkdown(nftName),
      nftLink:   ctx.nftLink(d.nft_item),
      address:   ctx.addrLink(d.new_owner),
      recipient: escapeMarkdown(ctx.formatAddr(d.new_owner)),
    };

    let template = T.nft_transfer.sent;
    if (d.is_purchase) {
      template = d.new_owner === ctx.wallet
        ? T.nft_transfer.purchase
        : T.nft_transfer.sell;
      data.price = formatTonAmount(d.price);
    }

    let msg = formatTemplate(template, data);
    return appendComment(msg, d.comment, d.is_encrypted_comment, T.jetton_transfer);
  },

  // ── NFT Mint ────────────────────────────────────────
  async nft_mint(d, ctx) {
    const info = ctx.metadata[d.nft_item] || {};
    const nftName = info?.token_info?.[0]?.name || 'Item';

    return formatTemplate(T.nft_mint.mint, {
      txLink:  ctx.txLink,
      nftName: escapeMarkdown(nftName),
      nftLink: ctx.nftLink(d.nft_item),
    });
  },

  // ── Auction Bid ─────────────────────────────────────
  async auction_bid(d, ctx) {
    if (d.bidder !== ctx.wallet) return null;

    let nftName = 'Item';
    if (ctx.metadata[d.nft_item]?.is_indexed) {
      const ti = ctx.metadata[d.nft_item].token_info;
      if (ti?.[0]?.name) nftName = ti[0].name;
    } else {
      try {
        const uf = ctx.friendly(d.nft_item);
        const info = await ctx.getNftInfo(uf);
        if (info.name) nftName = info.name;
      } catch {}
    }

    return formatTemplate(T.auction_bid.bid, {
      txLink:  ctx.txLink,
      amount:  escapeMarkdown(formatTonAmount(d.amount)),
      nftName: escapeMarkdown(nftName),
      nftLink: ctx.nftLink(d.nft_item),
    });
  },

  // ── DNS ─────────────────────────────────────────────
  async change_dns(d, ctx) {
    if (d.source !== ctx.wallet) return null;
    return formatTemplate(T.change_dns.change, {
      txLink:  ctx.txLink,
      domain:  escapeMarkdown(extractDomain(ctx.metadata, d.asset)),
      nftLink: ctx.nftLink(d.asset),
    });
  },

  async renew_dns(d, ctx) {
    if (d.source !== ctx.wallet) return null;
    return formatTemplate(T.renew_dns.renew, {
      txLink:  ctx.txLink,
      domain:  escapeMarkdown(extractDomain(ctx.metadata, d.asset)),
      nftLink: ctx.nftLink(d.asset),
    });
  },

  async delete_dns(d, ctx) {
    if (d.source !== ctx.wallet) return null;
    return formatTemplate(T.delete_dns.delete, {
      txLink:  ctx.txLink,
      domain:  escapeMarkdown(extractDomain(ctx.metadata, d.asset)),
      nftLink: ctx.nftLink(d.asset),
    });
  },

  // ── Staking ─────────────────────────────────────────
  async stake_deposit(d, ctx) {
    if (d.stake_holder !== ctx.wallet) return null;
    const poolLink = `https://tonscan.org/address/${encodeURIComponent(ctx.friendly(d.pool))}`;
    const provider = (d.provider && d.pool)
      ? `via <a href="${poolLink}">${escapeMarkdown(d.provider)}</a>`
      : '';

    return formatTemplate(T.stake_deposit.deposit, {
      txLink:   ctx.txLink,
      amount:   escapeMarkdown(formatTonAmount(d.amount)),
      provider,
    });
  },

  async stake_withdrawal(d, ctx) {
    if (d.stake_holder !== ctx.wallet) return null;
    const poolLink = `https://tonscan.org/address/${encodeURIComponent(ctx.friendly(d.pool))}`;
    const provider = (d.provider && d.pool)
      ? `via <a href="${poolLink}">${escapeMarkdown(d.provider)}</a>`
      : '';

    return formatTemplate(T.stake_withdrawal.withdrawal, {
      txLink:   ctx.txLink,
      amount:   escapeMarkdown(formatTonAmount(d.amount)),
      provider,
    });
  },

  // ── DEX Liquidity ───────────────────────────────────
  async dex_deposit_liquidity(d, ctx) {
    const sender = d.sender || d.owner;
    if (sender && sender !== ctx.wallet) return null;

    const pair = parseDexPair(d, ctx);
    return formatTemplate(T.dex_deposit_liquidity.deposit, {
      txLink:  ctx.txLink,
      amount0: escapeMarkdown(pair.amount0),
      symbol0: escapeMarkdown(pair.symbol0),
      amount1: escapeMarkdown(pair.amount1),
      symbol1: escapeMarkdown(pair.symbol1),
      dex:     escapeMarkdown(formatDexName(d.dex)),
    });
  },

  async dex_withdraw_liquidity(d, ctx) {
    const sender = d.sender || d.owner;
    if (sender && sender !== ctx.wallet) return null;

    const pair = parseDexPair(d, ctx);
    return formatTemplate(T.dex_withdraw_liquidity.withdraw, {
      txLink:  ctx.txLink,
      amount0: escapeMarkdown(pair.amount0),
      symbol0: escapeMarkdown(pair.symbol0),
      amount1: escapeMarkdown(pair.amount1),
      symbol1: escapeMarkdown(pair.symbol1),
      dex:     escapeMarkdown(formatDexName(d.dex)),
    });
  },
};

// Parse the two asset sides of a DEX liquidity action
function parseDexPair(d, ctx) {
  let amount0 = '?', symbol0 = '?', amount1 = '?', symbol1 = '?';

  // asset_1/amount_1 or asset_in + dex_incoming_transfer
  const a0 = d.asset_1 ?? d.asset_in  ?? null;
  const a1 = d.asset_2 ?? d.asset_out ?? null;
  const raw0 = d.amount_1 || d.dex_incoming_transfer?.amount || '0';
  const raw1 = d.amount_2 || d.dex_outgoing_transfer?.amount || '0';

  if (a0 === null) {
    amount0 = formatTonAmount(raw0); symbol0 = 'TON';
  } else {
    const t = ctx.tokenInfo(a0);
    amount0 = ctx.tokenAmount(a0, raw0);
    symbol0 = t.symbol || t.name;
  }

  if (a1 === null) {
    amount1 = formatTonAmount(raw1); symbol1 = 'TON';
  } else {
    const t = ctx.tokenInfo(a1);
    amount1 = ctx.tokenAmount(a1, raw1);
    symbol1 = t.symbol || t.name;
  }

  return { amount0, symbol0, amount1, symbol1 };
}

// Explicitly ignored action types (no output)
const IGNORED = new Set(['call_contract', 'tick_tock']);

// ════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

const UNKNOWN = Symbol('unknown_action');

async function formatAction(tx, fullResponse, config) {
  try {
    const { type, details } = tx;
    if (IGNORED.has(type)) return null;

    const ctx = createContext(tx, fullResponse, config);
    const handler = handlers[type];

    if (handler) {
      return await handler(details, ctx);
    }

    return { __unknown: true, type, traceId: tx.trace_id, txLink: ctx.txLink };
  } catch (error) {
    console.error(`Error formatting action ${tx.type}:`, error.message);
    return null;
  }
}

module.exports = { formatAction, TEMPLATES: T, UNKNOWN };
