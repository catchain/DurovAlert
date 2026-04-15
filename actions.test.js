const { formatAction, TEMPLATES } = require('./actions');

// ── Test Config ───────────────────────────────────────────
const WALLET = '0:D8CD999FB2B1B384E6CA254C3883375E23111A8B78C015B886286C31BF11E29D';
const OTHER  = '0:1111111111111111111111111111111111111111111111111111111111111111';
const ASSET  = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE';
const NFT    = '0:E3A797299DC6163CF2000000000000000000000000000000000000000000ABCD';
const POOL   = '0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const mockMeta = {
  [ASSET]: {
    is_indexed: true,
    token_info: [{ name: 'Tether USD', symbol: 'USDT', extra: { decimals: '6' } }],
  },
  [NFT]: {
    is_indexed: true,
    token_info: [{ name: 'Durov #42', extra: { domain: 'durov.ton' } }],
  },
};

const mockBook = {
  [WALLET]: { user_friendly: 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxv_HindnQ' },
  [OTHER]:  { user_friendly: 'EQAREREREREREREREREREREREREREREREREREREREREREdkj' },
  [ASSET]:  { user_friendly: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_jON' },
  [NFT]:    { user_friendly: 'EQCD4nlym5xYWPPIAAAAAAAAAAAAAAAAAAAAAAAAAAAAq80' },
  [POOL]:   { user_friendly: 'EQCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqIvz' },
};

const baseConfig = {
  durovWallet: WALLET,
  tonscanAddressbook: {},
  getNftInfo: async () => ({ name: 'Test NFT #1', image: null }),
};

function makeAction(type, details, traceId) {
  return {
    trace_id: traceId || `test-${type}-${Date.now()}`,
    type,
    start_utime: Math.floor(Date.now() / 1000),
    details,
  };
}

function resp(meta, book) {
  return { metadata: meta || mockMeta, address_book: book || mockBook };
}

// ── Templates Existence ───────────────────────────────────
describe('TEMPLATES', () => {
  const expected = [
    'ton_transfer', 'jetton_transfer', 'jetton_mint', 'jetton_burn',
    'jetton_swap', 'nft_transfer', 'nft_mint', 'auction_bid',
    'change_dns', 'renew_dns', 'delete_dns',
    'stake_deposit', 'stake_withdrawal',
    'dex_deposit_liquidity', 'dex_withdraw_liquidity', 'default',
  ];

  test.each(expected)('has template for %s', (type) => {
    expect(TEMPLATES[type]).toBeDefined();
  });
});

// ── Outgoing Filter ──────────────────────────────────────
describe('Outgoing filter — only Durov-initiated actions pass', () => {

  test('ton_transfer: outgoing passes', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '1000000000', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('1 TON');
  });

  test('ton_transfer: incoming is skipped', async () => {
    const action = makeAction('ton_transfer', {
      source: OTHER, destination: WALLET,
      value: '1000000000', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('jetton_transfer: outgoing passes', async () => {
    const action = makeAction('jetton_transfer', {
      sender: WALLET, receiver: OTHER, asset: ASSET,
      amount: '1000000', comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('USDT');
  });

  test('jetton_transfer: incoming is skipped', async () => {
    const action = makeAction('jetton_transfer', {
      sender: OTHER, receiver: WALLET, asset: ASSET,
      amount: '1000000', comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('jetton_swap: outgoing passes', async () => {
    const action = makeAction('jetton_swap', {
      sender: WALLET, dex: 'stonfi',
      asset_in: null, asset_out: ASSET,
      dex_incoming_transfer: { amount: '5000000000' },
      dex_outgoing_transfer: { amount: '17500000' },
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('StonFi');
    expect(msg).toContain('TON');
    expect(msg).toContain('USDT');
  });

  test('jetton_swap: other sender is skipped', async () => {
    const action = makeAction('jetton_swap', {
      sender: OTHER, dex: 'dedust',
      asset_in: null, asset_out: ASSET,
      dex_incoming_transfer: { amount: '1000000000' },
      dex_outgoing_transfer: { amount: '3500000' },
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('nft_transfer: Durov sends passes', async () => {
    const action = makeAction('nft_transfer', {
      old_owner: WALLET, new_owner: OTHER, nft_item: NFT,
      is_purchase: false, comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Sent');
  });

  test('nft_transfer: random incoming is skipped', async () => {
    const action = makeAction('nft_transfer', {
      old_owner: OTHER, new_owner: WALLET, nft_item: NFT,
      is_purchase: false, comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('nft_transfer: purchase by Durov passes', async () => {
    const action = makeAction('nft_transfer', {
      old_owner: OTHER, new_owner: WALLET, nft_item: NFT,
      is_purchase: true, price: '5000000000',
      comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Buy');
    expect(msg).toContain('5 TON');
  });

  test('nft_transfer: sale by Durov passes', async () => {
    const action = makeAction('nft_transfer', {
      old_owner: WALLET, new_owner: OTHER, nft_item: NFT,
      is_purchase: true, price: '10000000000',
      comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Sell');
    expect(msg).toContain('10 TON');
  });

  test('auction_bid: Durov bids passes', async () => {
    const action = makeAction('auction_bid', {
      bidder: WALLET, nft_item: NFT, amount: '7000000000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Bid');
    expect(msg).toContain('7 000 TON');
  });

  test('auction_bid: other bidder is skipped', async () => {
    const action = makeAction('auction_bid', {
      bidder: OTHER, nft_item: NFT, amount: '1000000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('change_dns: Durov passes', async () => {
    const action = makeAction('change_dns', {
      source: WALLET, asset: NFT,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Update');
    expect(msg).toContain('durov.ton');
  });

  test('change_dns: other source skipped', async () => {
    const action = makeAction('change_dns', { source: OTHER, asset: NFT });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('renew_dns: Durov passes', async () => {
    const action = makeAction('renew_dns', { source: WALLET, asset: NFT });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Renew');
  });

  test('delete_dns: Durov passes', async () => {
    const action = makeAction('delete_dns', { source: WALLET, asset: NFT });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Delete');
  });

  test('stake_deposit: Durov passes', async () => {
    const action = makeAction('stake_deposit', {
      stake_holder: WALLET, pool: POOL, provider: 'Tonstakers',
      amount: '50000000000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Stake');
    expect(msg).toContain('50 000 TON');
    expect(msg).toContain('Tonstakers');
  });

  test('stake_deposit: other holder skipped', async () => {
    const action = makeAction('stake_deposit', {
      stake_holder: OTHER, pool: POOL, provider: 'X', amount: '1000000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('stake_withdrawal: Durov passes', async () => {
    const action = makeAction('stake_withdrawal', {
      stake_holder: WALLET, pool: POOL, provider: 'Tonstakers',
      amount: '25000000000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Unstake');
  });

  test('jetton_burn: Durov passes', async () => {
    const action = makeAction('jetton_burn', {
      owner: WALLET, asset: ASSET, amount: '500000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Burn');
    expect(msg).toContain('500 USDT');
  });

  test('jetton_burn: other owner skipped', async () => {
    const action = makeAction('jetton_burn', {
      owner: OTHER, asset: ASSET, amount: '100000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });

  test('dex_deposit_liquidity: Durov passes', async () => {
    const action = makeAction('dex_deposit_liquidity', {
      sender: WALLET, dex: 'stonfi',
      asset_1: null, amount_1: '10000000000',
      asset_2: ASSET, amount_2: '35000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Add liquidity');
    expect(msg).toContain('10 TON');
    expect(msg).toContain('35 USDT');
    expect(msg).toContain('StonFi');
  });

  test('dex_withdraw_liquidity: Durov passes', async () => {
    const action = makeAction('dex_withdraw_liquidity', {
      sender: WALLET, dex: 'dedust',
      asset_1: null, amount_1: '5000000000',
      asset_2: ASSET, amount_2: '18000000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Remove liquidity');
    expect(msg).toContain('DeDust');
  });

  test('dex_deposit_liquidity: other sender skipped', async () => {
    const action = makeAction('dex_deposit_liquidity', {
      sender: OTHER, dex: 'stonfi',
      asset_1: null, amount_1: '1000000000',
      asset_2: ASSET, amount_2: '3500000',
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeFalsy();
  });
});

// ── Ignored Types ─────────────────────────────────────────
describe('Ignored action types return null', () => {
  test('call_contract is ignored', async () => {
    const action = makeAction('call_contract', { source: WALLET });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeNull();
  });

  test('tick_tock is ignored', async () => {
    const action = makeAction('tick_tock', {});
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeNull();
  });
});

// ── Unknown Types → admin notification marker ────────────
describe('Unknown types return marker for admin notification', () => {
  test('unknown type returns __unknown marker', async () => {
    const action = makeAction('some_new_type', {});
    const result = await formatAction(action, resp(), baseConfig);
    expect(result).toBeTruthy();
    expect(result.__unknown).toBe(true);
    expect(result.type).toBe('some_new_type');
    expect(result.txLink).toContain('tonscan.org/tx/');
  });
});

// ── Comments ──────────────────────────────────────────────
describe('Comments and encrypted comments', () => {
  test('ton_transfer with plain comment', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '2000000000', comment: 'Hello Durov', encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('Hello Durov');
  });

  test('ton_transfer with encrypted comment', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '2000000000', comment: 'secret', encrypted: true,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('Encrypted');
  });

  test('jetton_transfer with comment', async () => {
    const action = makeAction('jetton_transfer', {
      sender: WALLET, receiver: OTHER, asset: ASSET,
      amount: '5000000', comment: 'Payment', is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('Payment');
  });
});

// ── Token Formatting ──────────────────────────────────────
describe('Token amount formatting', () => {
  test('USDT 6 decimals', async () => {
    const action = makeAction('jetton_transfer', {
      sender: WALLET, receiver: OTHER, asset: ASSET,
      amount: '1500000', comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('1.5 USDT');
  });

  test('TON nano conversion in ton_transfer', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '500000000', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('0.5 TON');
  });
});

// ── HTML Structure ────────────────────────────────────────
describe('Output is valid HTML for Telegram', () => {
  test('contains tonscan tx link', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '1000000000', comment: null, encrypted: false,
    });
    action.trace_id = 'abc123def';
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('https://tonscan.org/tx/abc123def');
    expect(msg).toContain('<a href=');
    expect(msg).toContain('</a>');
  });

  test('contains address link for destination', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '1000000000', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toContain('https://tonscan.org/address/');
  });
});

// ── Edge Cases ────────────────────────────────────────────
describe('Edge cases', () => {
  test('ton_transfer with value=0 still works', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '0', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('0 TON');
  });

  test('missing metadata gracefully handled', async () => {
    const action = makeAction('jetton_transfer', {
      sender: WALLET, receiver: OTHER,
      asset: '0:UNKNOWN_ASSET', amount: '1000000000',
      comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp({}, mockBook), baseConfig);
    expect(msg).toBeTruthy();
  });

  test('missing address_book gracefully handled', async () => {
    const action = makeAction('ton_transfer', {
      source: WALLET, destination: OTHER,
      value: '1000000000', comment: null, encrypted: false,
    });
    const msg = await formatAction(action, resp(mockMeta, {}), baseConfig);
    expect(msg).toBeTruthy();
  });

  test('jetton_mint has no wallet filter', async () => {
    const action = makeAction('jetton_mint', {
      asset: ASSET, amount: '1000000', receiver: OTHER,
    });
    const msg = await formatAction(action, resp(), baseConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Mint');
  });

  test('getNftInfo failure does not crash nft_transfer', async () => {
    const failConfig = {
      ...baseConfig,
      getNftInfo: async () => { throw new Error('API down'); },
    };
    const action = makeAction('nft_transfer', {
      old_owner: WALLET, new_owner: OTHER, nft_item: NFT,
      is_purchase: false, comment: null, is_encrypted_comment: false,
    });
    const msg = await formatAction(action, resp(), failConfig);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Item');
  });
});
