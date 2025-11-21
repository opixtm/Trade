// ============================================
// SHARED CALCULATIONS MODULE
// For use in both main thread and Web Workers
// ============================================

// Default settings (can be overridden)
const DEFAULT_SETTINGS = {
    rsi_period: 14,
    macd_fast: 12,
    macd_slow: 26,
    macd_signal: 9,
    stoch_rsi_period: 14,
    stoch_stoch_period: 14,
    stoch_k_smooth: 3,
    stoch_d_smooth: 3
};

// ============================================
// BASIC CALCULATIONS
// ============================================

const calculateEMA = (data, period) => {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let emaArray = Array(period - 1).fill(undefined);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    let currentEma = sum / period;
    emaArray.push(currentEma);
    for (let i = period; i < data.length; i++) {
        currentEma = (data[i] * k) + (currentEma * (1 - k));
        emaArray.push(currentEma);
    }
    return emaArray;
};

const calculateSMA = (data, period) => {
    if (!data || data.length < period) return [];
    let sma = Array(period - 1).fill(undefined);
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        sma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return sma;
};

// ============================================
// RSI CALCULATION
// ============================================

const calculateRSI = (closes, period = DEFAULT_SETTINGS.rsi_period) => {
    if (!closes || closes.length <= period) return Array(closes?.length || 0).fill(undefined);
    let gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    if (avgLoss === 0) return Array(closes.length).fill(100);
    let rsi = [100 - (100 / (1 + (avgGain / avgLoss)))];
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        if (avgLoss === 0) { rsi.push(100); }
        else { rsi.push(100 - (100 / (1 + (avgGain / avgLoss)))); }
    }
    return Array(period).fill(undefined).concat(rsi);
};

// ============================================
// MACD CALCULATION
// ============================================

const calculateMACD = (closes, fast = DEFAULT_SETTINGS.macd_fast, slow = DEFAULT_SETTINGS.macd_slow, signal = DEFAULT_SETTINGS.macd_signal) => {
    if (closes.length < slow + signal) {
        return { status: 'Netral', hist: 'Netral', class: 'text-gray-500', macdLine: [], signalLine: [], histogram: [] };
    }
    const emaFast = calculateEMA(closes, fast);
    const emaSlow = calculateEMA(closes, slow);

    const macdLine = emaSlow.map((slowVal, i) => {
        if (slowVal !== undefined && emaFast[i] !== undefined) {
            return emaFast[i] - slowVal;
        }
        return undefined;
    });

    const signalLine = calculateEMA(macdLine.filter(v => v !== undefined), signal);
    const histogram = macdLine.map((macdVal, i) => {
        const signalIndex = i - (slow - 1);
        if (macdVal !== undefined && signalLine[signalIndex] !== undefined) {
            const histValue = macdVal - signalLine[signalIndex];
            const prevHistValue = (i > 0 && macdLine[i - 1] !== undefined && signalLine[signalIndex - 1] !== undefined)
                ? (macdLine[i - 1] - signalLine[signalIndex - 1]) : 0;
            return {
                value: histValue,
                color: histValue >= 0 ? (histValue >= prevHistValue ? '#26a69a' : '#80cbc4') : (histValue < prevHistValue ? '#ef5350' : '#e57373')
            };
        }
        return undefined;
    });

    const lastMacd = macdLine.filter(v => v !== undefined).pop() || 0;
    const lastSig = signalLine.filter(v => v !== undefined).pop() || 0;
    const lastHist = histogram.filter(v => v !== undefined).pop()?.value || 0;
    const prevMacdLine = macdLine.filter(v => v !== undefined).slice(-2, -1)[0] || 0;
    const prevSignalLine = signalLine.filter(v => v !== undefined).slice(-2, -1)[0] || 0;

    let status = 'Netral', macdClass = 'text-gray-500';
    if (prevMacdLine <= prevSignalLine && lastMacd > lastSig) {
        status = 'Bullish Cross';
        macdClass = 'positive';
    } else if (prevMacdLine >= prevSignalLine && lastMacd < lastSig) {
        status = 'Bearish Cross';
        macdClass = 'negative';
    }

    return {
        status,
        hist: lastHist > 0 ? '(Naik)' : '(Turun)',
        class: macdClass,
        macdLine,
        signalLine,
        histogram
    };
};

// ============================================
// STOCHASTIC RSI CALCULATION
// ============================================

const calculateStochasticRSI = (closes,
    rsiPeriod = DEFAULT_SETTINGS.stoch_rsi_period,
    stochPeriod = DEFAULT_SETTINGS.stoch_stoch_period,
    kSmooth = DEFAULT_SETTINGS.stoch_k_smooth,
    dSmooth = DEFAULT_SETTINGS.stoch_d_smooth
) => {
    const rsiValues = calculateRSI(closes, rsiPeriod).filter(v => v !== undefined);
    if (rsiValues.length < stochPeriod) {
        return { k: 50, d: 50, status: 'Netral', class: 'tag-gray', kLine: [], dLine: [], kOffset: 0, dOffset: 0 };
    }
    const stochArr = [];
    for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
        const window = rsiValues.slice(i - stochPeriod + 1, i + 1);
        const minR = Math.min(...window);
        const maxR = Math.max(...window);
        const denom = maxR - minR;
        stochArr.push(denom === 0 ? 0 : ((rsiValues[i] - minR) / denom) * 100);
    }
    const kLine = calculateSMA(stochArr, kSmooth);
    const dLine = calculateSMA(kLine.filter(v => v !== undefined), dSmooth);
    const lastK = kLine.filter(v => v !== undefined).pop() || 50;
    const lastD = dLine.filter(v => v !== undefined).pop() || 50;
    let status = 'Netral', stochClass = 'tag-yellow';
    if (lastK > 80 && lastD > 80) { status = 'Overbought'; stochClass = 'tag-red'; }
    else if (lastK < 20 && lastD < 20) { status = 'Oversold'; stochClass = 'tag-green'; }
    const kOffset = closes.length - kLine.length;
    const dOffset = closes.length - dLine.length;
    return {
        k: lastK.toFixed(2), d: lastD.toFixed(2), status, class: stochClass,
        kLine, dLine, kOffset, dOffset
    };
};

// ============================================
// BOLLINGER BANDS CALCULATION
// ============================================

const calculateBollingerBands = (closes, period = 20, stdDev = 2) => {
    if (closes.length < period) return { upper: [], middle: [], lower: [], width: [], status: 'N/A' };
    const middle = calculateSMA(closes, period);
    let upper = Array(period - 1).fill(undefined);
    let lower = Array(period - 1).fill(undefined);
    let width = Array(period - 1).fill(undefined);

    for (let i = period - 1; i < closes.length; i++) {
        if (middle[i] === undefined) {
            upper.push(undefined);
            lower.push(undefined);
            width.push(undefined);
            continue;
        };
        const slice = closes.slice(i - period + 1, i + 1);
        const sumSquaredDiff = slice.reduce((a, b) => a + Math.pow(b - middle[i], 2), 0);
        const stdev = Math.sqrt(sumSquaredDiff / period);
        upper.push(middle[i] + (stdev * stdDev));
        lower.push(middle[i] - (stdev * stdDev));
        width.push((middle[i] + (stdev * stdDev)) - (middle[i] - (stdev * stdDev)));
    }

    const lastClose = closes[closes.length - 1];
    const lastUpper = upper.filter(v => v !== undefined).pop();
    const lastLower = lower.filter(v => v !== undefined).pop();
    const lastWidth = width.filter(v => v !== undefined).pop();

    let status = 'INSIDE';
    if (lastClose > lastUpper) status = 'Above';
    if (lastClose < lastLower) status = 'Below';

    let squeezeStatus = 'Normal';
    if (width.length > 50) {
        const recentWidths = width.slice(-50);
        const minWidth = Math.min(...recentWidths);
        const avgWidth = recentWidths.reduce((a, b) => a + b, 0) / recentWidths.length;
        if (lastWidth < avgWidth * 0.7) {
            squeezeStatus = 'Squeeze!';
        }
    }

    return { upper, middle, lower, width, status, squeezeStatus };
};

// ============================================
// ATR CALCULATION
// ============================================

const calculateATR = (klines, period = 14) => {
    if (!klines || klines.length < period) return [];
    const trueRanges = [];
    for (let i = 1; i < klines.length; i++) {
        const high = parseFloat(klines[i][2]);
        const low = parseFloat(klines[i][3]);
        const prevClose = parseFloat(klines[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRanges.push(tr);
    }
    const atr = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += trueRanges[i];
    let currentATR = sum / period;
    atr.push(currentATR);
    for (let i = period; i < trueRanges.length; i++) {
        currentATR = ((currentATR * (period - 1)) + trueRanges[i]) / period;
        atr.push(currentATR);
    }
    return [undefined, ...Array(period - 1).fill(undefined), ...atr];
};

// ============================================
// VPVR CALCULATION
// ============================================

const calculateVPVR = (klines, numRows = 70, valueAreaPercent = 0.70) => {
    if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0 };
    let overallLow = Infinity, overallHigh = -Infinity;
    const candles = klines.map(k => {
        const high = parseFloat(k[2]), low = parseFloat(k[3]);
        if (high > overallHigh) overallHigh = high;
        if (low < overallLow) overallLow = low;
        return { high, low, volume: parseFloat(k[5]) };
    });
    const rowSize = (overallHigh - overallLow) / numRows;
    let profile = Array.from({ length: numRows }, (_, i) => ({ price: overallLow + (i * rowSize), volume: 0 }));
    let totalVolume = 0;
    candles.forEach(c => {
        totalVolume += c.volume;
        const startIdx = Math.max(0, Math.floor((c.low - overallLow) / rowSize));
        const endIdx = Math.min(numRows - 1, Math.floor((c.high - overallLow) / rowSize));
        const volPerRow = c.volume / (endIdx - startIdx + 1);
        for (let i = startIdx; i <= endIdx; i++) profile[i].volume += volPerRow;
    });
    if (totalVolume === 0) return { poc: 0, vah: 0, val: 0 };
    let pocIndex = profile.reduce((maxIdx, row, idx, arr) => row.volume > arr[maxIdx].volume ? idx : maxIdx, 0);
    const poc = profile[pocIndex].price + (rowSize / 2);
    const targetVolume = totalVolume * valueAreaPercent;
    let vaVolume = profile[pocIndex].volume;
    let upperIdx = pocIndex, lowerIdx = pocIndex;
    while (vaVolume < targetVolume) {
        const volAbove = (upperIdx + 1 < numRows) ? profile[upperIdx + 1].volume : -1;
        const volBelow = (lowerIdx - 1 >= 0) ? profile[lowerIdx - 1].volume : -1;
        if (volAbove === -1 && volBelow === -1) break;
        if (volAbove > volBelow) {
            upperIdx++;
            vaVolume += profile[upperIdx].volume;
        } else {
            lowerIdx--;
            vaVolume += profile[lowerIdx].volume;
        }
    }
    return { poc, vah: profile[upperIdx].price + rowSize, val: profile[lowerIdx].price };
};

// ============================================
// EXPORT FOR BOTH ENVIRONMENTS
// ============================================

// For Web Workers
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.SharedCalculations = {
        calculateEMA,
        calculateSMA,
        calculateRSI,
        calculateMACD,
        calculateStochasticRSI,
        calculateBollingerBands,
        calculateATR,
        calculateVPVR,
        DEFAULT_SETTINGS
    };
}

// For ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateEMA,
        calculateSMA,
        calculateRSI,
        calculateMACD,
        calculateStochasticRSI,
        calculateBollingerBands,
        calculateATR,
        calculateVPVR,
        DEFAULT_SETTINGS
    };
}
