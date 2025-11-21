// ============================================
// SCANNER WORKER
// Background scanner for Pump Hunter and Dip Hunter
// ============================================

importScripts('shared-calculations.js');

// State management
let state = {
    isScanning: false,
    scanType: null, // 'pump' or 'dip'
    timeframe: '4h',
    marketType: 'futures',
    scanInterval: null,
    lastScanTime: 0,
    symbols: []
};

// ============================================
// SYMBOL FETCHING
// ============================================

async function fetchAllSymbols() {
    try {
        const baseUrl = state.marketType === 'futures'
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';

        const endpoint = state.marketType === 'futures'
            ? '/fapi/v1/exchangeInfo'
            : '/api/v3/exchangeInfo';

        const response = await fetch(`${baseUrl}${endpoint}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const symbols = data.symbols
            .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map(s => s.symbol);

        state.symbols = symbols;

        postMessage({
            type: 'SYMBOLS_LOADED',
            payload: { count: symbols.length, symbols: symbols.slice(0, 10) }
        });

        return symbols;
    } catch (error) {
        postMessage({
            type: 'ERROR',
            payload: { error: error.message, context: 'Fetch symbols' }
        });
        return [];
    }
}

// ============================================
// KLINE FETCHING
// ============================================

async function fetchKlines(symbol, timeframe, limit = 100) {
    try {
        const baseUrl = state.marketType === 'futures'
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';

        const endpoint = state.marketType === 'futures'
            ? '/fapi/v1/klines'
            : '/api/v3/klines';

        const url = `${baseUrl}${endpoint}?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;

        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

// ============================================
// PUMP HUNTER ANALYSIS
// ============================================

function analyzePumpSignal(klines, symbol) {
    if (!klines || klines.length < 100) return null;

    const closes = klines.map(k => parseFloat(k[4]));
    const volumes = klines.map(k => parseFloat(k[5]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));

    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastVolume = volumes[volumes.length - 1];

    // Calculate indicators
    const rsi = SharedCalculations.calculateRSI(closes, 14);
    const lastRSI = rsi[rsi.length - 1];

    const ema8 = SharedCalculations.calculateEMA(closes, 8);
    const ema21 = SharedCalculations.calculateEMA(closes, 21);
    const ema55 = SharedCalculations.calculateEMA(closes, 55);
    const ema89 = SharedCalculations.calculateEMA(closes, 89);
    const ema144 = SharedCalculations.calculateEMA(closes, 144);
    const ema233 = SharedCalculations.calculateEMA(closes, 233);
    const ema377 = SharedCalculations.calculateEMA(closes, 377);

    const lastEma8 = ema8[ema8.length - 1];
    const lastEma21 = ema21[ema21.length - 1];
    const lastEma55 = ema55[ema55.length - 1];
    const lastEma89 = ema89[ema89.length - 1];
    const lastEma144 = ema144[ema144.length - 1];
    const lastEma233 = ema233[ema233.length - 1];
    const lastEma377 = ema377[ema377.length - 1];

    // Calculate volume average
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = lastVolume / avgVolume;

    // Calculate price change
    const priceChange = ((lastClose - prevClose) / prevClose) * 100;

    // Pump criteria
    const isPumping = priceChange > 2 && volumeRatio > 1.5;
    const isAboveEMAs = lastClose > lastEma21 && lastClose > lastEma55;
    const emaAlignment = lastEma8 > lastEma21 && lastEma21 > lastEma55;

    if (isPumping || (isAboveEMAs && emaAlignment && volumeRatio > 1.2)) {
        return {
            symbol,
            price: lastClose,
            priceChange: priceChange.toFixed(2),
            volume: lastVolume,
            volumeRatio: volumeRatio.toFixed(2),
            rsi: lastRSI ? lastRSI.toFixed(2) : 'N/A',
            ema8: lastEma8,
            ema21: lastEma21,
            ema55: lastEma55,
            ema89: lastEma89,
            ema144: lastEma144,
            ema233: lastEma233,
            ema377: lastEma377,
            score: calculatePumpScore(priceChange, volumeRatio, lastRSI, emaAlignment)
        };
    }

    return null;
}

function calculatePumpScore(priceChange, volumeRatio, rsi, emaAlignment) {
    let score = 0;

    // Price change score (max 40 points)
    score += Math.min(priceChange * 5, 40);

    // Volume score (max 30 points)
    score += Math.min((volumeRatio - 1) * 15, 30);

    // RSI score (max 20 points)
    if (rsi && rsi > 50) {
        score += Math.min((rsi - 50) / 2, 20);
    }

    // EMA alignment score (max 10 points)
    if (emaAlignment) {
        score += 10;
    }

    return Math.min(score, 100).toFixed(0);
}

// ============================================
// DIP HUNTER ANALYSIS
// ============================================

function analyzeDipSignal(klines, symbol) {
    if (!klines || klines.length < 100) return null;

    const closes = klines.map(k => parseFloat(k[4]));
    const volumes = klines.map(k => parseFloat(k[5]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));

    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastVolume = volumes[volumes.length - 1];

    // Calculate indicators
    const rsi = SharedCalculations.calculateRSI(closes, 14);
    const lastRSI = rsi[rsi.length - 1];

    const ema8 = SharedCalculations.calculateEMA(closes, 8);
    const ema21 = SharedCalculations.calculateEMA(closes, 21);
    const ema55 = SharedCalculations.calculateEMA(closes, 55);
    const ema89 = SharedCalculations.calculateEMA(closes, 89);
    const ema144 = SharedCalculations.calculateEMA(closes, 144);
    const ema233 = SharedCalculations.calculateEMA(closes, 233);
    const ema377 = SharedCalculations.calculateEMA(closes, 377);

    const lastEma8 = ema8[ema8.length - 1];
    const lastEma21 = ema21[ema21.length - 1];
    const lastEma55 = ema55[ema55.length - 1];
    const lastEma89 = ema89[ema89.length - 1];
    const lastEma144 = ema144[ema144.length - 1];
    const lastEma233 = ema233[ema233.length - 1];
    const lastEma377 = ema377[ema377.length - 1];

    // Calculate volume average
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = lastVolume / avgVolume;

    // Calculate price change
    const priceChange = ((lastClose - prevClose) / prevClose) * 100;

    // Dip criteria
    const isDipping = priceChange < -2 && volumeRatio > 1.3;
    const isNearEMAs = Math.abs(lastClose - lastEma55) / lastEma55 < 0.02;
    const isOversold = lastRSI && lastRSI < 35;

    if (isDipping || (isNearEMAs && isOversold)) {
        return {
            symbol,
            price: lastClose,
            priceChange: priceChange.toFixed(2),
            volume: lastVolume,
            volumeRatio: volumeRatio.toFixed(2),
            rsi: lastRSI ? lastRSI.toFixed(2) : 'N/A',
            ema8: lastEma8,
            ema21: lastEma21,
            ema55: lastEma55,
            ema89: lastEma89,
            ema144: lastEma144,
            ema233: lastEma233,
            ema377: lastEma377,
            score: calculateDipScore(priceChange, volumeRatio, lastRSI, isNearEMAs)
        };
    }

    return null;
}

function calculateDipScore(priceChange, volumeRatio, rsi, isNearEMAs) {
    let score = 0;

    // Price drop score (max 40 points)
    score += Math.min(Math.abs(priceChange) * 5, 40);

    // Volume score (max 30 points)
    score += Math.min((volumeRatio - 1) * 15, 30);

    // RSI oversold score (max 20 points)
    if (rsi && rsi < 50) {
        score += Math.min((50 - rsi) / 2, 20);
    }

    // Near EMA support score (max 10 points)
    if (isNearEMAs) {
        score += 10;
    }

    return Math.min(score, 100).toFixed(0);
}

// ============================================
// SCANNING LOGIC
// ============================================

async function performScan() {
    if (!state.isScanning) return;

    const now = Date.now();
    if (now - state.lastScanTime < 60000) {
        // Don't scan more than once per minute
        return;
    }

    state.lastScanTime = now;

    postMessage({
        type: 'SCAN_STARTED',
        payload: { scanType: state.scanType, timeframe: state.timeframe }
    });

    // Get symbols if not loaded
    if (state.symbols.length === 0) {
        await fetchAllSymbols();
    }

    // Limit to top 100 symbols by volume to avoid rate limits
    const symbolsToScan = state.symbols.slice(0, 100);
    const results = [];
    let scanned = 0;

    for (const symbol of symbolsToScan) {
        if (!state.isScanning) break;

        const klines = await fetchKlines(symbol, state.timeframe, 100);
        if (!klines) continue;

        const analysis = state.scanType === 'pump'
            ? analyzePumpSignal(klines, symbol)
            : analyzeDipSignal(klines, symbol);

        if (analysis) {
            results.push(analysis);
        }

        scanned++;

        // Send progress update every 10 symbols
        if (scanned % 10 === 0) {
            postMessage({
                type: 'SCAN_PROGRESS',
                payload: {
                    scanned,
                    total: symbolsToScan.length,
                    found: results.length
                }
            });
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Sort by score
    results.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

    postMessage({
        type: 'SCAN_COMPLETE',
        payload: {
            scanType: state.scanType,
            results: results.slice(0, 20), // Top 20 results
            totalScanned: scanned,
            totalFound: results.length
        }
    });
}

// ============================================
// MESSAGE HANDLERS
// ============================================

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'START_SCANNER':
            state.isScanning = true;
            state.scanType = payload.scanType; // 'pump' or 'dip'
            state.timeframe = payload.timeframe || '4h';
            state.marketType = payload.marketType || 'futures';

            // Perform initial scan
            await performScan();

            // Set up periodic scanning (every 2 minutes)
            if (state.scanInterval) {
                clearInterval(state.scanInterval);
            }
            state.scanInterval = setInterval(performScan, 120000);

            postMessage({
                type: 'SCANNER_STARTED',
                payload: { scanType: state.scanType }
            });
            break;

        case 'STOP_SCANNER':
            state.isScanning = false;
            if (state.scanInterval) {
                clearInterval(state.scanInterval);
                state.scanInterval = null;
            }

            postMessage({
                type: 'SCANNER_STOPPED',
                payload: {}
            });
            break;

        case 'SCAN_NOW':
            await performScan();
            break;

        case 'UPDATE_TIMEFRAME':
            state.timeframe = payload.timeframe;
            if (state.isScanning) {
                await performScan();
            }
            break;

        default:
            postMessage({
                type: 'ERROR',
                payload: { error: `Unknown message type: ${type}` }
            });
    }
};

// ============================================
// INITIALIZATION
// ============================================

postMessage({
    type: 'WORKER_READY',
    payload: { worker: 'scanner-worker' }
});
