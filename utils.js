const axios = require('axios');
const net = require('net');

function escapeMarkdown(text) {
    return text ? String(text) : '';
}

function formatTemplate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
    });
}

function shortenAddress(a) {
    if (a.length > 14) {
        return `${a.substring(0, 5)}...${a.substring(a.length - 5)}`;
    }
    return a;
}

function formatNumber(num) {
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
}

const formatTonAmount = (nanotons) => {
    const tonAmount = Number(nanotons) / 1_000_000_000;
    if (tonAmount < 0.01) {
        return tonAmount.toFixed(9).replace(/\.?0+$/, '');
    }
    return formatNumber(tonAmount);
};

const formatTokenSymbol = (symbol) => {
    if (!symbol) return '';
    return symbol === 'pTON' ? 'TON' : symbol;
};

const formatDexName = (dex) => {
    if (!dex) return 'DEX';
    switch (dex.toLowerCase()) {
        case 'stonfi': return 'StonFi';
        case 'dedust': return 'DeDust';
        default: return dex;
    }
};

async function getTonscanAddressbook() {
    const { data } = await axios.get('https://address-book.tonscan.org/addresses.json');
    return data;
}

// Reads the NFT name from its off-chain content JSON (TEP-64).
// The indexer fills metadata with a delay, the content URI is there at once.
// The URI comes from the chain, so only public https hosts are allowed.
async function fetchNftNameFromUri(uri, http = axios) {
    if (typeof uri !== 'string' || !uri) return null;
    const href = uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
    let url;
    try { url = new URL(href); } catch { return null; }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || net.isIP(host) || host === 'localhost') return null;

    const { data } = await http.get(url.href, {
        timeout: 4000,
        maxRedirects: 0,
        maxContentLength: 512 * 1024,
        responseType: 'json',
    });
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    return name ? name.slice(0, 100) : null;
}

module.exports = {
    fetchNftNameFromUri,
    escapeMarkdown,
    formatTemplate,
    shortenAddress,
    formatNumber,
    formatTonAmount,
    formatTokenSymbol,
    formatDexName,
    getTonscanAddressbook,
};
