const axios = require('axios');

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

module.exports = {
    escapeMarkdown,
    formatTemplate,
    shortenAddress,
    formatNumber,
    formatTonAmount,
    formatTokenSymbol,
    formatDexName,
    getTonscanAddressbook,
};
