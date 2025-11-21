#!/usr/bin/env node

// ============================================
// TERMINAL MONITOR
// Monitor trading data directly in terminal
// ============================================

const WebSocket = require('ws');
const https = require('https');

// Configuration
const CONFIG = {
    symbol: process.argv[2] || 'BTCUSDT',
    timeframe: process.argv[3] || '5m',
    marketType: process.argv[4] || 'futures'
};

// Colors for terminal
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// State
let lastPrice = 0;
let priceChange24h = 0;
let volume24h = 0;
let high24h = 0;
let low24h = 0;
let klineCount = 0;

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function clearScreen() {
    console.clear();
}

function printHeader() {
    console.log(colors.bright + colors.cyan + '╔════════════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║' + colors.reset + '              🚀 TRADING TERMINAL MONITOR 🚀                   ' + colors.bright + colors.cyan + '║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚════════════════════════════════════════════════════════════════╝' + colors.reset);
    console.log('');
}

function printStats() {
    clearScreen();
    printHeader();

    const priceColor = priceChange24h >= 0 ? colors.green : colors.red;
    const priceArrow = priceChange24h >= 0 ? '▲' : '▼';

    console.log(colors.bright + '📊 SYMBOL:' + colors.reset + ' ' + colors.yellow + CONFIG.symbol + colors.reset);
    console.log(colors.bright + '⏱️  TIMEFRAME:' + colors.reset + ' ' + colors.yellow + CONFIG.timeframe + colors.reset);
    console.log(colors.bright + '🔄 MARKET:' + colors.reset + ' ' + colors.yellow + CONFIG.marketType.toUpperCase() + colors.reset);
    console.log('');
    console.log(colors.gray + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    console.log('');

    console.log(colors.bright + '💰 PRICE:' + colors.reset + '      ' + colors.bright + priceColor + '$' + lastPrice.toFixed(2) + colors.reset);
    console.log(colors.bright + '📈 24H CHANGE:' + colors.reset + ' ' + priceColor + priceArrow + ' ' + priceChange24h.toFixed(2) + '%' + colors.reset);
    console.log(colors.bright + '📊 24H HIGH:' + colors.reset + '   ' + colors.green + '$' + high24h.toFixed(2) + colors.reset);
    console.log(colors.bright + '📉 24H LOW:' + colors.reset + '    ' + colors.red + '$' + low24h.toFixed(2) + colors.reset);
    console.log(colors.bright + '💎 24H VOLUME:' + colors.reset + ' ' + colors.cyan + (volume24h / 1000000).toFixed(2) + 'M' + colors.reset);
    console.log(colors.bright + '🕐 CANDLES:' + colors.reset + '    ' + colors.yellow + klineCount + colors.reset);
    console.log('');
    console.log(colors.gray + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    console.log('');
    console.log(colors.gray + 'Last update: ' + new Date().toLocaleTimeString() + colors.reset);
    console.log('');
    console.log(colors.gray + 'Press Ctrl+C to stop monitoring' + colors.reset);
}

// ============================================
// API FUNCTIONS
// ============================================

function fetch24hrStats() {
    return new Promise((resolve, reject) => {
        const baseUrl = CONFIG.marketType === 'futures'
            ? 'fapi.binance.com'
            : 'api.binance.com';

        const endpoint = CONFIG.marketType === 'futures'
            ? '/fapi/v1/ticker/24hr'
            : '/api/v3/ticker/24hr';

        const options = {
            hostname: baseUrl,
            path: `${endpoint}?symbol=${CONFIG.symbol}`,
            method: 'GET'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    priceChange24h = parseFloat(json.priceChangePercent);
                    volume24h = parseFloat(json.volume);
                    high24h = parseFloat(json.highPrice);
                    low24h = parseFloat(json.lowPrice);
                    lastPrice = parseFloat(json.lastPrice);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    const symbol = CONFIG.symbol.toLowerCase();
    const interval = CONFIG.timeframe;
    const wsUrl = CONFIG.marketType === 'futures'
        ? `wss://fstream.binance.com/ws/${symbol}@kline_${interval}`
        : `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;

    console.log(colors.yellow + '🔌 Connecting to Binance WebSocket...' + colors.reset);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log(colors.green + '✅ WebSocket connected!' + colors.reset);
        console.log('');
        printStats();
    });

    ws.on('message', (data) => {
        try {
            const json = JSON.parse(data);
            if (json.e === 'kline') {
                const kline = json.k;
                lastPrice = parseFloat(kline.c);

                if (kline.x) {
                    klineCount++;
                }

                printStats();
            }
        } catch (e) {
            console.error(colors.red + '❌ Error parsing message:' + colors.reset, e.message);
        }
    });

    ws.on('error', (error) => {
        console.error(colors.red + '❌ WebSocket error:' + colors.reset, error.message);
    });

    ws.on('close', () => {
        console.log(colors.yellow + '⚠️  WebSocket disconnected. Reconnecting in 5 seconds...' + colors.reset);
        setTimeout(() => connectWebSocket(), 5000);
    });
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log(colors.cyan + '🚀 Starting Terminal Monitor...' + colors.reset);
    console.log('');

    // Fetch initial 24hr stats
    try {
        await fetch24hrStats();
        console.log(colors.green + '✅ 24hr stats loaded' + colors.reset);
    } catch (e) {
        console.error(colors.red + '❌ Failed to fetch 24hr stats:' + colors.reset, e.message);
    }

    // Connect WebSocket
    connectWebSocket();

    // Update 24hr stats every 60 seconds
    setInterval(async () => {
        try {
            await fetch24hrStats();
        } catch (e) {
            // Silent fail
        }
    }, 60000);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('');
    console.log('');
    console.log(colors.yellow + '👋 Stopping monitor...' + colors.reset);
    console.log(colors.green + '✅ Goodbye!' + colors.reset);
    process.exit(0);
});

// Start
main();
