// ===================================================================
// FILE: worker.js (VERSI FINAL V3 - STRUKTUR DIPERBAIKI)
// ===================================================================

// === BAGIAN 0: KONSTANTA GLOBAL ===
const timeframeParameterMap = {
    '1m': { rsi_period: 7, macd_fast: 5, macd_slow: 13, macd_signal: 5 },
    '3m': { rsi_period: 9, macd_fast: 5, macd_slow: 13, macd_signal: 5 },
    '5m': { rsi_period: 9, macd_fast: 8, macd_slow: 21, macd_signal: 9 },
    '15m': { rsi_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9 },
    '1h': { rsi_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9 },
    '4h': { rsi_period: 21, macd_fast: 12, macd_slow: 26, macd_signal: 9 },
    '1d': { rsi_period: 21, macd_fast: 21, macd_slow: 55, macd_signal: 9 }
};

// === BAGIAN 1: FUNGSI KALKULASI DASAR (DEPENDENSI TERENDAH) ===
// Dideklarasikan sebagai 'function' agar di-hoist dan selalu tersedia.

function calculateEMA(data, period) {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let emaArray = [];
    if (data.length > 0) {
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i] || 0;
        emaArray[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            emaArray[i] = (data[i] * k) + (emaArray[i - 1] * (1 - k));
        }
    }
    return emaArray;
}

function calculateSMA(data, period) {
    if (!data || data.length < period) return [];
    let sma = [], sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    sma.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        sma.push(sum / period);
    }
    return [...Array(period - 1).fill(undefined), ...sma];
}

function calculateRSI(closes, period) {
    if (!closes || closes.length <= period) return Array(closes.length).fill(undefined);
    let gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    let rsi = Array(period).fill(undefined);
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    rsi[period - 1] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss))));
    }
    return rsi;
}

function findCandlestickPatterns(klines) {
    if (!klines || klines.length < 2) return { bias: 'NETRAL' };
    const getCandle = (k) => {
        const [o, h, l, c] = k.slice(1, 5).map(parseFloat);
        return { open: o, close: c, isGreen: c > o, isRed: c < o };
    };
    const c1 = getCandle(klines[klines.length - 1]), c2 = getCandle(klines[klines.length - 2]);
    if (c2.isRed && c1.isGreen && c1.close > c2.open) return { bias: 'BULLISH' };
    if (c2.isGreen && c1.isRed && c1.close < c2.open) return { bias: 'BEARISH' };
    return { bias: 'NETRAL' };
}

// === BAGIAN 2: FUNGSI KALKULASI LANJUTAN (TERGANTUNG PADA BAGIAN 1) ===

function calculateMACD(closes, fast, slow, signal) {
    if (closes.length < slow) return { status: "Netral", macdLine: [], signalLine: [], histogram: [] };
    const emaFast = calculateEMA(closes, fast);
    const emaSlow = calculateEMA(closes, slow);
    const macdLine = emaSlow.map((slowVal, i) => (slowVal !== undefined && emaFast[i] !== undefined) ? emaFast[i] - slowVal : undefined).filter(v => v !== undefined);
    const signalLine = calculateEMA(macdLine, signal);
    let status = "Netral";
    const lastMacd = macdLine.slice(-1)[0] || 0;
    const lastSig = signalLine.slice(-1)[0] || 0;
    const prevMacdLine = macdLine.slice(-2, -1)[0] || 0;
    const prevSignalLine = signalLine.slice(-2, -1)[0] || 0;
    if (prevMacdLine <= prevSignalLine && lastMacd > lastSig) status = "Bullish Cross";
    else if (prevMacdLine >= prevSignalLine && lastMacd < lastSig) status = "Bearish Cross";
    return { status };
}

function detectRSIDivergence(closes, rsiValues, lookback = 30) {
    if (!closes || closes.length < lookback || !rsiValues || rsiValues.length < lookback) return { status: "NONE" };
    const recentCloses = closes.slice(-lookback), recentRSI = rsiValues.slice(-lookback);
    const findPivots = (data, isHigh) => {
        let pivots = [];
        for (let i = 1; i < data.length - 1; i++)
            if ((isHigh && data[i] > data[i - 1] && data[i] > data[i + 1]) || (!isHigh && data[i] < data[i - 1] && data[i] < data[i + 1]))
                pivots.push({ index: i, value: data[i] });
        return pivots;
    };
    const priceLows = findPivots(recentCloses, false), priceHighs = findPivots(recentCloses, true);
    const rsiLows = findPivots(recentRSI, false), rsiHighs = findPivots(recentRSI, true);
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
        const lastPriceLow = priceLows[priceLows.length - 1], prevPriceLow = priceLows[priceLows.length - 2];
        const lastRsiLow = rsiLows.find(l => Math.abs(l.index - lastPriceLow.index) < 3), prevRsiLow = rsiLows.find(l => Math.abs(l.index - prevPriceLow.index) < 3);
        if (lastPriceLow && prevPriceLow && lastRsiLow && prevRsiLow && lastPriceLow.value < prevPriceLow.value && lastRsiLow.value > prevRsiLow.value) return { status: "BULLISH" };
    }
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
        const lastPriceHigh = priceHighs[priceHighs.length - 1], prevPriceHigh = priceHighs[priceHighs.length - 2];
        const lastRsiHigh = rsiHighs.find(h => Math.abs(h.index - lastPriceHigh.index) < 3), prevRsiHigh = rsiHighs.find(h => Math.abs(h.index - prevPriceHigh.index) < 3);
        if (lastPriceHigh && prevPriceHigh && lastRsiHigh && prevRsiHigh && lastPriceHigh.value > prevPriceHigh.value && lastRsiHigh.value < prevRsiHigh.value) return { status: "BEARISH" };
    }
    return { status: "NONE" };
}

function getConfluenceAnalysis(klines, timeframe) {
    if (!klines || klines.length < 50) return { skorBullish: 0, skorBearish: 0 };
    let skorBullish = 0, skorBearish = 0;
    const closes = klines.map(k => parseFloat(k[4]));
    const rsiPeriod = timeframeParameterMap[timeframe].rsi_period;
    const rsiValues = calculateRSI(closes, rsiPeriod);
    const lastRsi = rsiValues.filter(v => v !== undefined).pop() || 50;
    const macdParams = timeframeParameterMap[timeframe];
    const macd = calculateMACD(closes, macdParams.macd_fast, macdParams.macd_slow, macdParams.macd_signal);
    const candlePattern = findCandlestickPatterns(klines);
    const rsiDivergence = detectRSIDivergence(closes, rsiValues);
    if (candlePattern.bias === 'BEARISH') skorBearish += 2.0;
    if (macd.status === 'Bearish Cross') skorBearish += 2.0;
    if (lastRsi > 70) skorBearish += 1.5;
    if (rsiDivergence.status === 'BEARISH') skorBearish += 2.5;
    if (candlePattern.bias === 'BULLISH') skorBullish += 2.0;
    if (macd.status === 'Bullish Cross') skorBullish += 2.0;
    if (lastRsi < 30) skorBullish += 1.5;
    if (rsiDivergence.status === 'BULLISH') skorBullish += 2.5;
    const totalPossibleScore = 8.0;
    return { skorBullish: (skorBullish / totalPossibleScore) * 10, skorBearish: (skorBearish / totalPossibleScore) * 10 };
}

function calculateATR(klines, period = 14) {
    if (!klines || klines.length < period + 1) return { value: 0 };
    let trs = [];
    for (let i = 1; i < klines.length; i++) {
        const high = parseFloat(klines[i][2]), low = parseFloat(klines[i][3]), prevClose = parseFloat(klines[i - 1][4]);
        trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    const rma = (data, p) => {
        let smoothed = [], sum = 0;
        for (let i = 0; i < data.length; i++) {
            if (i < p) {
                sum += data[i];
                if (i === p - 1) smoothed.push(sum / p);
                else smoothed.push(undefined);
            } else if (smoothed[i - 1] !== undefined) {
                smoothed.push((smoothed[i - 1] * (p - 1) + data[i]) / p);
            }
        }
        return smoothed;
    };
    return { value: rma(trs, period).pop() || 0 };
}

// === BAGIAN 3: LOGIKA INTI BACKTESTING ===
function calculateMetrics(trades, initialBalance) {
    if (trades.length === 0) return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0 };
    let totalPnl = 0, grossProfit = 0, grossLoss = 0, wins = 0;
    trades.forEach(trade => {
        totalPnl += trade.pnl;
        if (trade.pnl > 0) { wins++; grossProfit += trade.pnl; } else { grossLoss += Math.abs(trade.pnl); }
    });
    const winRate = (trades.length > 0) ? (wins / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    return { totalPnl, winRate, profitFactor, totalTrades: trades.length };
}

async function runBacktestWithGenome(genome, historicalData, timeframe) {
    const settings = {
        initialBalance: 1000, leverage: 10, riskPerTrade: 0.01,
        takerFee: 0.0004, makerFee: 0.0002,
        ...genome
    };
    
    const analysisCache = [];
    for (let i = 0; i < historicalData.length; i++) {
        if (i < 200) { analysisCache.push(null); continue; }
        const klinesSnapshot = historicalData.slice(0, i + 1);
        const score = getConfluenceAnalysis(klinesSnapshot, timeframe);
        const atr = calculateATR(klinesSnapshot);
        analysisCache.push({ bullScore: score.skorBullish, bearScore: score.skorBearish, atrValue: atr.value });
    }

    let balance = settings.initialBalance;
    let position = null;
    const trades = [];
    
    for (let i = 200; i < historicalData.length; i++) {
        const cacheEntry = analysisCache[i];
        if (!cacheEntry) continue;

        const currentCandle = historicalData[i];
        const currentLow = parseFloat(currentCandle[3]);
        const currentHigh = parseFloat(currentCandle[4]);

        if (position) {
            let exitReason = null, exitPrice = 0;
            if (position.type === 'LONG') {
                if (currentLow <= position.sl) { exitReason = 'Stop Loss'; exitPrice = position.sl; }
                else if (currentHigh >= position.tp) { exitReason = 'Take Profit'; exitPrice = position.tp; }
            } else {
                if (currentHigh >= position.sl) { exitReason = 'Stop Loss'; exitPrice = position.sl; }
                else if (currentLow <= position.tp) { exitReason = 'Take Profit'; exitPrice = position.tp; }
            }
            if(exitReason){
                const rawPnl = position.type === 'LONG' ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
                const netPnl = rawPnl - ((position.entryPrice * position.size * settings.takerFee) + (exitPrice * position.size * settings.makerFee));
                balance += netPnl;
                trades.push({ ...position, pnl: netPnl });
                position = null;
                if (balance <= 0) break;
            }
        }

        if (!position) {
            let entrySignal = false, detectedBias = 'NETRAL', entryPrice = 0;
            const bias = (cacheEntry.bullScore > cacheEntry.bearScore + settings.biasThreshold) ? 'LONG' : (cacheEntry.bearScore > cacheEntry.bullScore + settings.biasThreshold) ? 'SHORT' : 'NETRAL';
            if (bias !== 'NETRAL') {
                const closes = historicalData.slice(0, i + 1).map(k => parseFloat(k[4]));
                const emaEntry = calculateEMA(closes, settings.pullbackEmaPeriod).pop();
                if (emaEntry && currentLow <= emaEntry && currentHigh >= emaEntry) {
                    entrySignal = true; detectedBias = bias; entryPrice = emaEntry;
                }
            }
            if (entrySignal) {
                const recentKlines = historicalData.slice(Math.max(0, i - settings.swingLookback), i);
                let stopLoss, takeProfit;
                if (detectedBias === 'LONG') {
                    stopLoss = Math.min(...recentKlines.map(k => parseFloat(k[3])));
                    takeProfit = entryPrice + (Math.abs(entryPrice - stopLoss) * settings.riskRewardRatio);
                } else {
                    stopLoss = Math.max(...recentKlines.map(k => parseFloat(k[2])));
                    takeProfit = entryPrice - Math.abs(stopLoss - entryPrice) * settings.riskRewardRatio;
                }
                const cost = balance * settings.riskPerTrade;
                if (entryPrice > 0) {
                    const sizeInAsset = (cost * settings.leverage) / entryPrice;
                    position = { type: detectedBias, entryPrice, cost, size: sizeInAsset, sl: stopLoss, tp: takeProfit };
                }
            }
        }
    }
    return calculateMetrics(trades, settings.initialBalance);
}

// === BAGIAN 4: "TELINGA" KARYAWAN ===
self.onmessage = async function(e) {
    const { genome, historicalData, timeframe, fitnessMetric } = e.data;
    try {
        const metrics = await runBacktestWithGenome(genome, historicalData, timeframe);
        let fitnessScore = 0;
        if (fitnessMetric === 'Win Rate') {
            fitnessScore = metrics.winRate || 0;
        } else {
            fitnessScore = metrics.profitFactor > 0 ? metrics.profitFactor : 0;
            if (fitnessScore === Infinity) fitnessScore = 100;
        }
        self.postMessage({ ...genome, fitness: fitnessScore, metrics: metrics });
    } catch (error) {
        console.error('Error inside worker:', error);
        self.postMessage({ error: error.message, genome });
    }
};