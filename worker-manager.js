// ============================================
// WORKER MANAGER
// Main coordinator for real-time data and API calls
// ============================================

importScripts('shared-calculations.js');

// State management
let state = {
    symbol: 'BTCUSDT',
    timeframe: '5m',
    marketType: 'futures',
    settings: {},
    isRunning: false,
    websocket: null,
    klines: [],
    lastPrice: 0,
    heartbeatInterval: null
};

// ============================================
// WEBSOCKET MANAGEMENT
// ============================================

function connectWebSocket() {
    if (state.websocket) {
        state.websocket.close();
    }

    const symbol = state.symbol.toLowerCase();
    const interval = state.timeframe;
    const wsUrl = state.marketType === 'futures'
        ? `wss://fstream.binance.com/ws/${symbol}@kline_${interval}`
        : `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;

    state.websocket = new WebSocket(wsUrl);

    state.websocket.onopen = () => {
        postMessage({
            type: 'WEBSOCKET_CONNECTED',
            payload: { symbol: state.symbol, timeframe: state.timeframe }
        });
    };

    state.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.e === 'kline') {
                const kline = data.k;
                state.lastPrice = parseFloat(kline.c);

                // Send price update
                postMessage({
                    type: 'PRICE_UPDATE',
                    payload: {
                        price: state.lastPrice,
                        time: kline.t,
                        volume: parseFloat(kline.v)
                    }
                });

                // If candle is closed, update klines
                if (kline.x) {
                    const newKline = [
                        kline.t,
                        kline.o,
                        kline.h,
                        kline.l,
                        kline.c,
                        kline.v,
                        kline.T,
                        kline.q,
                        kline.n,
                        kline.V,
                        kline.Q,
                        '0'
                    ];
                    state.klines.push(newKline);

                    // Keep only last 500 candles
                    if (state.klines.length > 500) {
                        state.klines = state.klines.slice(-500);
                    }

                    // Calculate indicators
                    const calculatedData = calculateIndicators(state.klines);

                    postMessage({
                        type: 'KLINE_UPDATE',
                        payload: {
                            kline: newKline,
                            calculatedData
                        }
                    });
                }
            }
        } catch (error) {
            postMessage({
                type: 'ERROR',
                payload: { error: error.message, context: 'WebSocket message' }
            });
        }
    };

    state.websocket.onerror = (error) => {
        postMessage({
            type: 'ERROR',
            payload: { error: 'WebSocket error', context: 'WebSocket connection' }
        });
    };

    state.websocket.onclose = () => {
        postMessage({
            type: 'WEBSOCKET_DISCONNECTED',
            payload: {}
        });

        // Auto-reconnect after 5 seconds if still running
        if (state.isRunning) {
            setTimeout(() => {
                if (state.isRunning) {
                    connectWebSocket();
                }
            }, 5000);
        }
    };
}

function disconnectWebSocket() {
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
}

// ============================================
// INDICATOR CALCULATIONS
// ============================================

function calculateIndicators(klines) {
    if (!klines || klines.length < 50) {
        return null;
    }

    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));

    const settings = state.settings || SharedCalculations.DEFAULT_SETTINGS;

    // Calculate all indicators
    const rsi = SharedCalculations.calculateRSI(closes, settings.rsi_period || 14);
    const macd = SharedCalculations.calculateMACD(
        closes,
        settings.macd_fast || 12,
        settings.macd_slow || 26,
        settings.macd_signal || 9
    );
    const stochastic = SharedCalculations.calculateStochasticRSI(
        closes,
        settings.stoch_rsi_period || 14,
        settings.stoch_stoch_period || 14,
        settings.stoch_k_smooth || 3,
        settings.stoch_d_smooth || 3
    );
    const bollinger = SharedCalculations.calculateBollingerBands(closes, 20, 2);
    const atr = SharedCalculations.calculateATR(klines, 14);
    const vpvr = SharedCalculations.calculateVPVR(klines);

    // EMAs
    const ema9 = SharedCalculations.calculateEMA(closes, 9);
    const ema21 = SharedCalculations.calculateEMA(closes, 21);
    const ema50 = SharedCalculations.calculateEMA(closes, 50);
    const ema200 = SharedCalculations.calculateEMA(closes, 200);

    return {
        rsi: rsi[rsi.length - 1],
        macd,
        stochastic,
        bollinger,
        atr: atr[atr.length - 1],
        vpvr,
        ema9: ema9[ema9.length - 1],
        ema21: ema21[ema21.length - 1],
        ema50: ema50[ema50.length - 1],
        ema200: ema200[ema200.length - 1],
        lastPrice: closes[closes.length - 1],
        lastHigh: highs[highs.length - 1],
        lastLow: lows[lows.length - 1]
    };
}

// ============================================
// API FETCHING
// ============================================

async function fetchHistoricalKlines() {
    try {
        const baseUrl = state.marketType === 'futures'
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';

        const endpoint = state.marketType === 'futures'
            ? '/fapi/v1/klines'
            : '/api/v3/klines';

        const url = `${baseUrl}${endpoint}?symbol=${state.symbol}&interval=${state.timeframe}&limit=500`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        state.klines = data;

        postMessage({
            type: 'HISTORICAL_DATA_LOADED',
            payload: {
                klines: data,
                count: data.length
            }
        });

        // Calculate initial indicators
        const calculatedData = calculateIndicators(data);
        if (calculatedData) {
            postMessage({
                type: 'INDICATORS_CALCULATED',
                payload: calculatedData
            });
        }

        return data;
    } catch (error) {
        postMessage({
            type: 'ERROR',
            payload: { error: error.message, context: 'Fetch historical klines' }
        });
        return null;
    }
}

async function fetch24hrStats() {
    try {
        const baseUrl = state.marketType === 'futures'
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';

        const endpoint = state.marketType === 'futures'
            ? '/fapi/v1/ticker/24hr'
            : '/api/v3/ticker/24hr';

        const url = `${baseUrl}${endpoint}?symbol=${state.symbol}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        postMessage({
            type: '24HR_STATS',
            payload: {
                priceChange: parseFloat(data.priceChange),
                priceChangePercent: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.volume),
                quoteVolume: parseFloat(data.quoteVolume),
                highPrice: parseFloat(data.highPrice),
                lowPrice: parseFloat(data.lowPrice)
            }
        });

        return data;
    } catch (error) {
        postMessage({
            type: 'ERROR',
            payload: { error: error.message, context: 'Fetch 24hr stats' }
        });
        return null;
    }
}

// ============================================
// HEARTBEAT SYSTEM
// ============================================

function startHeartbeat() {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
    }

    state.heartbeatInterval = setInterval(() => {
        postMessage({
            type: 'HEARTBEAT',
            payload: {
                timestamp: Date.now(),
                isRunning: state.isRunning,
                symbol: state.symbol,
                lastPrice: state.lastPrice
            }
        });
    }, 5000); // Every 5 seconds
}

function stopHeartbeat() {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
    }
}

// ============================================
// MESSAGE HANDLERS
// ============================================

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            state.symbol = payload.symbol || 'BTCUSDT';
            state.timeframe = payload.timeframe || '5m';
            state.marketType = payload.marketType || 'futures';
            state.settings = payload.settings || {};

            postMessage({
                type: 'INITIALIZED',
                payload: { symbol: state.symbol, timeframe: state.timeframe }
            });
            break;

        case 'START_REALTIME':
            state.isRunning = true;

            // Fetch historical data first
            await fetchHistoricalKlines();

            // Then connect WebSocket
            connectWebSocket();

            // Start heartbeat
            startHeartbeat();

            // Fetch 24hr stats
            await fetch24hrStats();

            postMessage({
                type: 'REALTIME_STARTED',
                payload: {}
            });
            break;

        case 'STOP_REALTIME':
            state.isRunning = false;
            disconnectWebSocket();
            stopHeartbeat();

            postMessage({
                type: 'REALTIME_STOPPED',
                payload: {}
            });
            break;

        case 'UPDATE_SETTINGS':
            state.settings = payload.settings || {};

            // Recalculate indicators with new settings
            if (state.klines.length > 0) {
                const calculatedData = calculateIndicators(state.klines);
                if (calculatedData) {
                    postMessage({
                        type: 'INDICATORS_CALCULATED',
                        payload: calculatedData
                    });
                }
            }
            break;

        case 'CHANGE_SYMBOL':
            state.symbol = payload.symbol;
            state.timeframe = payload.timeframe || state.timeframe;

            if (state.isRunning) {
                // Reconnect with new symbol
                disconnectWebSocket();
                await fetchHistoricalKlines();
                connectWebSocket();
                await fetch24hrStats();
            }
            break;

        case 'CALCULATE_INDICATORS':
            const calculatedData = calculateIndicators(payload.klines);
            if (calculatedData) {
                postMessage({
                    type: 'INDICATORS_CALCULATED',
                    payload: calculatedData
                });
            }
            break;

        case 'FETCH_24HR_STATS':
            await fetch24hrStats();
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
    payload: { worker: 'worker-manager' }
});
