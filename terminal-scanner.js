#!/usr/bin/env node

// ============================================
// TERMINAL SCANNER - PUMP & DIP HUNTER
// Scan markets directly in terminal
// ============================================

const https = require('https');

// Configuration
const CONFIG = {
    scanType: process.argv[2] || 'pump',  // 'pump' or 'dip'
    timeframe: process.argv[3] || '4h',
    marketType: process.argv[4] || 'futures',
    limit: parseInt(process.argv[5]) || 20,  // Top results to show
    scanInterval: 120000  // 2 minutes
};

// Colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
};

// State
let symbols = [];
let scanResults = [];
let scanCount = 0;
let isScanning = false;

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function clearScreen() {
    console.clear();
}

function printHeader() {
    const scanTypeUpper = CONFIG.scanType.toUpperCase();
    const emoji = CONFIG.scanType === 'pump' ? '🚀' : '💎';

    console.log(colors.bright + colors.cyan + '╔════════════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║' + colors.reset + `         ${emoji} ${scanTypeUpper} HUNTER - TERMINAL SCANNER ${emoji}              ` + colors.bright + colors.cyan + '║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚════════════════════════════════════════════════════════════════╝' + colors.reset);
    console.log('');
}

function printConfig() {
    console.log(colors.bright + '🎯 SCAN TYPE:' + colors.reset + '   ' + colors.yellow + CONFIG.scanType.toUpperCase() + colors.reset);
    console.log(colors.bright + '⏱️  TIMEFRAME:' + colors.reset + '  ' + colors.yellow + CONFIG.timeframe + colors.reset);
    console.log(colors.bright + '🔄 MARKET:' + colors.reset + '     ' + colors.yellow + CONFIG.marketType.toUpperCase() + colors.reset);
    console.log(colors.bright + '📊 TOP RESULTS:' + colors.reset + ' ' + colors.yellow + CONFIG.limit + colors.reset);
    console.log('');
}

function printResults() {
    clearScreen();
    printHeader();
    printConfig();

    console.log(colors.gray + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    console.log('');

    if (scanResults.length === 0) {
        console.log(colors.yellow + '⏳ Scanning... Please wait...' + colors.reset);
        console.log('');
        return;
    }

    console.log(colors.bright + `📋 TOP ${CONFIG.limit} RESULTS:` + colors.reset);
    console.log('');

    // Table header
    console.log(
        colors.gray +
        '  #  ' +
        'SYMBOL'.padEnd(12) +
        'PRICE CHG'.padEnd(12) +
        'SCORE'.padEnd(8) +
        'RSI'.padEnd(8) +
        'VOL RATIO' +
        colors.reset
    );
    console.log(colors.gray + '─────────────────────────────────────────────────────────────────' + colors.reset);

    // Results
    scanResults.slice(0, CONFIG.limit).forEach((result, index) => {
        const rank = (index + 1).toString().padStart(3);
        const symbol = result.symbol.padEnd(12);
        const priceChange = parseFloat(result.priceChange);
        const priceChangeStr = (priceChange >= 0 ? '+' : '') + priceChange.toFixed(2) + '%';
        const priceColor = priceChange >= 0 ? colors.green : colors.red;
        const score = result.score.toString().padEnd(8);
        const rsi = result.rsi.toFixed(1).padEnd(8);
        const volRatio = result.volumeRatio.toFixed(2) + 'x';

        console.log(
            colors.gray + rank + colors.reset + ' ' +
            colors.bright + colors.yellow + symbol + colors.reset +
            priceColor + priceChangeStr.padEnd(12) + colors.reset +
            colors.cyan + score + colors.reset +
            colors.magenta + rsi + colors.reset +
            colors.blue + volRatio + colors.reset
        );
    });

    console.log('');
    console.log(colors.gray + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    console.log('');
    console.log(colors.gray + `Scan #${scanCount} completed at ${new Date().toLocaleTimeString()}` + colors.reset);
    console.log(colors.gray + `Found ${scanResults.length} results from ${symbols.length} symbols` + colors.reset);
    console.log(colors.gray + `Next scan in ${CONFIG.scanInterval / 1000}s` + colors.reset);
    console.log('');
    console.log(colors.gray + 'Press Ctrl+C to stop scanning' + colors.reset);
}

// ============================================
// API FUNCTIONS
// ============================================

function fetchData(path) {
    return new Promise((resolve, reject) => {
        const baseUrl = CONFIG.marketType === 'futures'
            ? 'fapi.binance.com'
            : 'api.binance.com';

        const options = {
            hostname: baseUrl,
            path: path,
            method: 'GET'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function loadSymbols() {
    try {
        const endpoint = CONFIG.marketType === 'futures'
            ? '/fapi/v1/exchangeInfo'
            : '/api/v3/exchangeInfo';

        const data = await fetchData(endpoint);

        symbols = data.symbols
            .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
            .map(s => s.symbol)
            .slice(0, 100);  // Limit to 100 symbols

        console.log(colors.green + `✅ Loaded ${symbols.length} symbols` + colors.reset);
    } catch (e) {
        console.error(colors.red + '❌ Failed to load symbols:' + colors.reset, e.message);
    }
}

async function scanSymbol(symbol) {
    try {
        // Fetch klines
        const klinesEndpoint = CONFIG.marketType === 'futures'
            ? `/fapi/v1/klines?symbol=${symbol}&interval=${CONFIG.timeframe}&limit=100`
            : `/api/v3/klines?symbol=${symbol}&interval=${CONFIG.timeframe}&limit=100`;

        const klines = await fetchData(klinesEndpoint);

        if (!klines || klines.length < 50) return null;

        // Calculate indicators
        const closes = klines.map(k => parseFloat(k[4]));
        const volumes = klines.map(k => parseFloat(k[5]));

        const currentPrice = closes[closes.length - 1];
        const ema8 = calculateEMA(closes, 8);
        const ema21 = calculateEMA(closes, 21);
        const rsi = calculateRSI(closes, 14);

        // Calculate volume ratio
        const recentVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const avgVolume = volumes.slice(0, -10).reduce((a, b) => a + b, 0) / (volumes.length - 10);
        const volumeRatio = recentVolume / avgVolume;

        // Calculate price change
        const priceChange = ((currentPrice - closes[closes.length - 24]) / closes[closes.length - 24]) * 100;

        // Scoring logic
        let score = 0;

        if (CONFIG.scanType === 'pump') {
            // Pump Hunter scoring
            if (currentPrice > ema8) score += 2;
            if (currentPrice > ema21) score += 2;
            if (ema8 > ema21) score += 2;
            if (rsi > 50 && rsi < 70) score += 2;
            if (volumeRatio > 1.5) score += 2;
            if (priceChange > 0) score += Math.min(priceChange / 2, 5);
        } else {
            // Dip Hunter scoring
            if (currentPrice < ema8) score += 2;
            if (currentPrice < ema21) score += 2;
            if (ema8 < ema21) score += 2;
            if (rsi < 40) score += 2;
            if (volumeRatio > 1.5) score += 2;
            if (priceChange < 0) score += Math.min(Math.abs(priceChange) / 2, 5);
        }

        // Minimum score threshold
        if (score < 5) return null;

        return {
            symbol,
            score: Math.round(score),
            priceChange: priceChange.toFixed(2),
            rsi,
            volumeRatio,
            ema8,
            ema21
        };
    } catch (e) {
        return null;
    }
}

async function performScan() {
    if (isScanning) return;

    isScanning = true;
    scanCount++;
    scanResults = [];

    console.log(colors.yellow + `\n🔍 Starting scan #${scanCount}...\n` + colors.reset);

    for (let i = 0; i < symbols.length; i++) {
        const result = await scanSymbol(symbols[i]);

        if (result) {
            scanResults.push(result);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // Progress update every 20 symbols
        if ((i + 1) % 20 === 0) {
            console.log(colors.gray + `Progress: ${i + 1}/${symbols.length} (${scanResults.length} found)` + colors.reset);
        }
    }

    // Sort results by score
    scanResults.sort((a, b) => b.score - a.score);

    printResults();
    isScanning = false;
}

// ============================================
// INDICATOR CALCULATIONS
// ============================================

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }

    return ema;
}

function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = data.length - period; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log(colors.cyan + '🚀 Starting Terminal Scanner...' + colors.reset);
    console.log('');

    // Load symbols
    await loadSymbols();

    if (symbols.length === 0) {
        console.error(colors.red + '❌ No symbols loaded. Exiting.' + colors.reset);
        process.exit(1);
    }

    // Initial scan
    await performScan();

    // Periodic scanning
    setInterval(async () => {
        await performScan();
    }, CONFIG.scanInterval);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('');
    console.log('');
    console.log(colors.yellow + '👋 Stopping scanner...' + colors.reset);
    console.log(colors.green + '✅ Goodbye!' + colors.reset);
    process.exit(0);
});

// Start
main();
