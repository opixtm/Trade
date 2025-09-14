// ===================================================================================
// BAGIAN 1: INISIALISASI & KONTROL UTAMA WORKER
// ===================================================================================

// --- Variabel Global di dalam Worker ---
let userSettings = {};
let coinListCache = null;
let exchangeInfoCache = { spot: null, futures: null };

/**
 * Listener Utama: Menunggu Perintah dari index.html (UI Thread)
 * Saat menerima perintah 'startAnalysis', ia akan menjalankan seluruh proses.
 */
self.onmessage = function(event) {
    const { command, data } = event.data;

    if (command === 'startAnalysis') {
        // Menerima settings terbaru dari UI setiap kali analisis dimulai
        // Ini memastikan worker selalu menggunakan parameter indikator yang benar
        userSettings = data.settings;

        // Memulai analisis dengan data yang dikirim dari UI
        runFullAnalysis(data.symbol, data.timeframe, data.marketType, data.correlationAsset);
    }
};

/**
 * Helper function untuk mengirim pesan kembali ke UI thread.
 * Memudahkan pengiriman status, progres, data, atau error.
 * @param {string} status - Tipe pesan ('progress', 'success', 'error').
 * @param {any} data - Konten pesan (objek payload atau string pesan).
 */
function postStatus(status, data) {
    if (status === 'error') {
        self.postMessage({ status: 'error', message: data });
    } else {
        self.postMessage({ status, payload: data });
    }
}
// ===================================================================================
// BAGIAN 2: LOGIKA INTI PENGAMBILAN DATA
// ===================================================================================

/**
 * Fungsi Orkestrasi Utama.
 * Mengatur seluruh alur kerja: mengambil data mentah, menghitung indikator,
 * dan mengirim kembali hasil yang sudah matang ke UI.
 */
async function runFullAnalysis(binanceSymbol, selectedTimeframe, marketType, correlationAsset) {
    try {
        postStatus('progress', 'Memvalidasi simbol...');
        await validateBinanceSymbol(binanceSymbol, marketType);
        const baseAsset = binanceSymbol.replace(/USDT$|^\d+/g, '');

        postStatus('progress', 'Mengambil data pasar...');

        let promisesToRun = [
            fetchBinanceAPIData('klines', { symbol: binanceSymbol, interval: selectedTimeframe, limit: 1000 }, marketType),
            fetchBinanceAPIData('ticker/24hr', { symbol: binanceSymbol }, marketType),
            fetchBinanceAPIData('klines', { symbol: binanceSymbol, interval: '1d', limit: 500 }, marketType),
            fetchBinanceAPIData('klines', { symbol: correlationAsset, interval: '1d', limit: 500 }, 'spot'),
            fetchBinanceAPIData('depth', { symbol: binanceSymbol, limit: 100 }, marketType),
            fetch('https://api.coingecko.com/api/v3/global').then(res => res.json()),
            (async () => {
                try {
                    const coinGeckoId = await getCoinGeckoId(baseAsset);
                    return await fetchCoinGeckoData(coinGeckoId);
                } catch (e) { return null; }
            })(),
            fetchBinanceAPIData('aggTrades', { symbol: binanceSymbol, limit: 1000 }, marketType),
            createTFAlignmentSummary(binanceSymbol, marketType)
        ];

        if (marketType === 'futures') {
            promisesToRun.push(
                fetchBinanceAPIData('openInterest', { symbol: binanceSymbol }, 'futures'),
                fetchBinanceAPIData('premiumIndex', { symbol: binanceSymbol }, 'futures'),
                fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${binanceSymbol}&period=5m&limit=1`).then(res => res.json()),
                fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${binanceSymbol}&period=5m&limit=1`).then(res => res.json())
            );
        }

        const results = await Promise.allSettled(promisesToRun);
        const getResult = (index) => results[index].status === 'fulfilled' ? results[index].value : null;

        const rawKlines = getResult(0);
        if (!rawKlines || rawKlines.length < 550) {
            throw new Error(`Data historis tidak cukup (hanya ${rawKlines?.length} candle). Coba timeframe lebih tinggi.`);
        }

        postStatus('progress', 'Menghitung indikator...');

        const finalPayload = {
            symbol: binanceSymbol,
            tickerData: getResult(1),
            klines: rawKlines.slice(-500),
            orderBookData: getResult(4),
            globalData: getResult(5),
            coinGeckoData: getResult(6),
            tfAlignmentSummary: getResult(8),
            openInterestData: marketType === 'futures' ? getResult(9) : null,
            fundingRateData: marketType === 'futures' ? getResult(10) : null,
            lsRatioUmumData: marketType === 'futures' ? getResult(11) : null,
            lsRatioTopData: marketType === 'futures' ? getResult(12) : null,
            cvdData: calculateCVD(getResult(7)),
            correlationData: null,
            calculatedData: null,
        };

        const assetDailyKlines = getResult(2);
        const btcDailyKlines = getResult(3);
        if (binanceSymbol !== 'BTCUSDT' && assetDailyKlines && btcDailyKlines && assetDailyKlines.length === btcDailyKlines.length) {
            finalPayload.correlationData = calculateCorrelation(assetDailyKlines.map(k => parseFloat(k[4])), btcDailyKlines.map(k => parseFloat(k[4])));
        }

        finalPayload.calculatedData = recalculateAllIndicators(
            finalPayload.klines, finalPayload.tickerData, assetDailyKlines ? assetDailyKlines[assetDailyKlines.length - 2] : null,
            marketType, finalPayload.cvdData, finalPayload.orderBookData, finalPayload.fundingRateData,
            finalPayload.lsRatioUmumData, finalPayload.openInterestData
        );

        postStatus('success', finalPayload);

    } catch (error) {
        postStatus('error', error.message);
    }
}


/**
 * Mengambil data dari API Binance (Spot atau Futures).
 */
async function fetchBinanceAPIData(endpoint, params = {}, marketType = 'spot') {
    const baseUrl = marketType === 'futures' ? 'https://fapi.binance.com/fapi/v1' : 'https://api.binance.com/api/v3';
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}/${endpoint}?${query}`;
    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Binance API error: ${errorData.msg || response.statusText}`);
    }
    return response.json();
}

/**
 * Mengambil dan menyimpan cache info bursa.
 */
async function initializeExchangeInfo(marketType) {
    if (exchangeInfoCache[marketType]) return exchangeInfoCache[marketType];
    const data = await fetchBinanceAPIData('exchangeInfo', {}, marketType);
    exchangeInfoCache[marketType] = data.symbols;
    return data.symbols;
}

/**
 * Memvalidasi apakah sebuah simbol trading valid.
 */
async function validateBinanceSymbol(symbol, marketType) {
    const symbols = await initializeExchangeInfo(marketType);
    const symbolData = symbols.find(s => s.symbol === symbol);
    if (!symbolData || symbolData.status !== 'TRADING') {
        throw new Error(`Simbol "${symbol}" tidak valid di Binance ${marketType}.`);
    }
}

/**
 * Mencari ID koin di CoinGecko berdasarkan simbolnya.
 */
async function getCoinGeckoId(baseAssetSymbol) {
    if (!coinListCache) {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/list');
        coinListCache = await response.json();
    }
    const assetSymbolLower = baseAssetSymbol.toLowerCase();
    const priorityMap = { 'btc': 'bitcoin', 'eth': 'ethereum', 'bnb': 'binancecoin', 'sol': 'solana' };
    if (priorityMap[assetSymbolLower]) return priorityMap[assetSymbolLower];
    const match = coinListCache.find(coin => coin.symbol === assetSymbolLower);
    if (match) return match.id;
    throw new Error(`Simbol "${baseAssetSymbol}" tidak ditemukan di CoinGecko.`);
}

/**
 * Mengambil data detail dari CoinGecko.
 */
async function fetchCoinGeckoData(coinId) {
    if (!coinId) return null;
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&market_data=true`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
}

/**
 * Menganalisis keselarasan tren di berbagai timeframe.
 */
async function createTFAlignmentSummary(symbol, marketType) {
    const timeframes = ['5m', '15m', '1h', '4h', '1d'];
    const summary = {};
    let score = 0;
    const klinesPromises = timeframes.map(tf => fetchBinanceAPIData('klines', { symbol, interval: tf, limit: 51 }, marketType));
    const klinesResults = await Promise.all(klinesPromises);
    klinesResults.forEach((klines, index) => {
        const tf = timeframes[index];
        if (klines && klines.length >= 50) {
            const closes = klines.map(k => parseFloat(k[4]));
            const ema21 = calculateEMA(closes, 21).pop();
            const ema50 = calculateEMA(closes, 50).pop();
            summary[tf] = ema21 > ema50 ? 'UPTREND' : 'DOWNTREND';
            if (summary[tf] === 'UPTREND') score++; else score--;
        } else {
            summary[tf] = 'N/A';
        }
    });
    return { summary, score };
}
// ===================================================================================
// BAGIAN 3: FUNGSI KALKULASI INDIKATOR DASAR
// ===================================================================================

const calculateEMA = (data, period) => {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let emaArray = [];
    let sum = data.slice(0, period).reduce((a, b) => a + b, 0);
    let currentEma = sum / period;
    emaArray = Array(period - 1).fill(undefined);
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
        sma.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
    }
    return sma;
};

const calculateRSI = (closes) => {
    const period = userSettings.active.indicatorParams.rsi_period;
    if (!closes || closes.length <= period) return Array(closes?.length || 0).fill(undefined);
    let gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let rsi = [100 - (100 / (1 + (avgGain / (avgLoss === 0 ? 1 : avgLoss))))];
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        rsi.push(100 - (100 / (1 + (avgGain / (avgLoss === 0 ? 1 : avgLoss)))));
    }
    return Array(period).fill(undefined).concat(rsi);
};

const calculateMACD = (closes) => {
    const { macd_fast, macd_slow, macd_signal } = userSettings.active.indicatorParams;
    if (closes.length < macd_slow + macd_signal) return { macdLine: [], signalLine: [], histogram: [] };
    const emaFast = calculateEMA(closes, macd_fast);
    const emaSlow = calculateEMA(closes, macd_slow);
    const macdLine = emaSlow.map((slowVal, i) => (slowVal !== undefined && emaFast[i] !== undefined) ? emaFast[i] - slowVal : undefined);
    const signalLine = calculateEMA(macdLine.filter(v => v !== undefined), macd_signal);
    const histogram = macdLine.map((macdVal, i) => {
        const signalIndex = i - (macd_slow - 1);
        if (macdVal !== undefined && signalLine[signalIndex] !== undefined) {
            const histValue = macdVal - signalLine[signalIndex];
            const prevHistValue = (i > 0 && macdLine[i - 1] !== undefined && signalLine[signalIndex - 1] !== undefined) ? (macdLine[i - 1] - signalLine[signalIndex - 1]) : 0;
            return { value: histValue, color: histValue >= 0 ? (histValue >= prevHistValue ? '#26a69a' : '#80cbc4') : (histValue < prevHistValue ? '#ef5350' : '#e57373') };
        }
        return undefined;
    });
    return { macdLine, signalLine, histogram };
};

const calculateStochasticRSI = (closes) => {
    const { stoch_rsi_period, stoch_stoch_period, stoch_k_smooth, stoch_d_smooth } = userSettings.active.indicatorParams;
    const rsiValues = calculateRSI(closes, stoch_rsi_period).filter(v => v !== undefined);
    if (rsiValues.length < stoch_stoch_period) return { kLine: [], dLine: [], kOffset: 0, dOffset: 0 };
    const stochArr = [];
    for (let i = stoch_stoch_period - 1; i < rsiValues.length; i++) {
        const window = rsiValues.slice(i - stoch_stoch_period + 1, i + 1);
        const minR = Math.min(...window);
        const maxR = Math.max(...window);
        stochArr.push((maxR - minR) === 0 ? 0 : ((rsiValues[i] - minR) / (maxR - minR)) * 100);
    }
    const kLine = calculateSMA(stochArr, stoch_k_smooth);
    const dLine = calculateSMA(kLine.filter(v => v !== undefined), stoch_d_smooth);
    const kOffset = closes.length - kLine.length;
    const dOffset = closes.length - dLine.length;
    return { kLine, dLine, kOffset, dOffset };
};
// ===================================================================================
// BAGIAN 4: FUNGSI KALKULASI INDIKATOR LANJUTAN
// ===================================================================================

const calculateBollingerBands = (closes, period = 20, stdDev = 2) => {
    if (closes.length < period) return { upper: [], middle: [], lower: [], width: [] };
    const middle = calculateSMA(closes, period);
    let upper = [], lower = [], width = [];
    for (let i = period - 1; i < closes.length; i++) {
        if (middle[i] === undefined) { upper.push(undefined); lower.push(undefined); width.push(undefined); continue; }
        const slice = closes.slice(i - period + 1, i + 1);
        const stdev = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - middle[i], 2), 0) / period);
        upper.push(middle[i] + (stdev * stdDev));
        lower.push(middle[i] - (stdev * stdDev));
        width.push((upper[i] - lower[i]));
    }
    return { upper, middle, lower, width };
};

const calculateVPVR = (klines, numRows = 70, valueAreaPercent = 0.70) => {
    if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0 };
    const candles = klines.map(k => ({ high: parseFloat(k[2]), low: parseFloat(k[3]), volume: parseFloat(k[5]) }));
    const overallHigh = Math.max(...candles.map(c => c.high));
    const overallLow = Math.min(...candles.map(c => c.low));
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
    let vaVolume = profile[pocIndex].volume;
    let upperIdx = pocIndex, lowerIdx = pocIndex;
    while (vaVolume < totalVolume * valueAreaPercent && (upperIdx < numRows -1 || lowerIdx > 0)) {
        const volAbove = (upperIdx + 1 < numRows) ? profile[upperIdx + 1].volume : -1;
        const volBelow = (lowerIdx - 1 >= 0) ? profile[lowerIdx - 1].volume : -1;
        if (volAbove === -1 && volBelow === -1) break;
        if (volAbove > volBelow) { upperIdx++; vaVolume += profile[upperIdx].volume; }
        else { lowerIdx--; vaVolume += profile[lowerIdx].volume; }
    }
    return { poc, vah: profile[upperIdx].price + rowSize, val: profile[lowerIdx].price };
};

const calculateADX = (klines, period = 14) => {
    if (!klines || klines.length < period * 2) return { adx: 'N/A', plusDI: 'N/A', minusDI: 'N/A' };
    let highs = klines.map(k => parseFloat(k[2])), lows = klines.map(k => parseFloat(k[3])), closes = klines.map(k => parseFloat(k[4]));
    let trs = [], plusDMs = [], minusDMs = [];
    for (let i = 1; i < highs.length; i++) {
        trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
        let upMove = highs[i] - highs[i-1], downMove = lows[i-1] - lows[i];
        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const rma = (data, p) => {
        let rmaArr = [], sum = 0;
        for (let i = 0; i < data.length; i++) {
            if (i < p) { sum += data[i]; rmaArr.push(i === p - 1 ? sum / p : undefined); }
            else if(rmaArr[i-1] !== undefined) { rmaArr.push((rmaArr[i-1] * (p - 1) + data[i]) / p); }
        } return rmaArr;
    };
    let smoothedTR = rma(trs, period), smoothedPlusDM = rma(plusDMs, period), smoothedMinusDM = rma(minusDMs, period);
    let plusDIs = [], minusDIs = [], dxs = [];
    for (let i = 0; i < smoothedTR.length; i++) {
        if (smoothedTR[i] === undefined) continue;
        let plusDI = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
        let minusDI = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
        plusDIs.push(plusDI); minusDIs.push(minusDI);
        dxs.push((plusDI + minusDI) > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0);
    }
    let adxValues = rma(dxs, period);
    return { adx: adxValues.pop()?.toFixed(2) || 'N/A', plusDI: plusDIs.pop()?.toFixed(2) || 'N/A', minusDI: minusDIs.pop()?.toFixed(2) || 'N/A' };
};

const calculatePivotPoints = (prevDayKline) => {
    if (!prevDayKline || prevDayKline.length < 5) return null;
    const high = parseFloat(prevDayKline[2]), low = parseFloat(prevDayKline[3]), close = parseFloat(prevDayKline[4]);
    if (isNaN(high) || isNaN(low) || isNaN(close)) return null;
    const P = (high + low + close) / 3;
    const R1 = (2 * P) - low; const S1 = (2 * P) - high;
    const R2 = P + (high - low); const S2 = P - (high - low);
    const R3 = high + 2 * (P - low); const S3 = low - 2 * (high - P);
    return { P, R1, S1, R2, S2, R3, S3 };
};

const calculateVWAP = (klines, mode = 'rolling', period = 20) => {
    if (!klines || klines.length === 0) return 0;
    let sumPV = 0, sumV = 0;
    const klinesToProcess = mode === 'rolling' ? klines.slice(-period) : klines;
    klinesToProcess.forEach(k => {
        const typicalPrice = (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3;
        const volume = parseFloat(k[5]);
        sumPV += typicalPrice * volume;
        sumV += volume;
    });
    return sumV > 0 ? sumPV / sumV : 0;
};

const calculateOBV = (klines) => {
    if (!klines || klines.length < 2) return [];
    let obv = [0];
    for (let i = 1; i < klines.length; i++) {
        const close = parseFloat(klines[i][4]), prevClose = parseFloat(klines[i - 1][4]), volume = parseFloat(klines[i][5]);
        if (close > prevClose) obv.push(obv[i-1] + volume);
        else if (close < prevClose) obv.push(obv[i-1] - volume);
        else obv.push(obv[i-1]);
    }
    return obv;
};
// ===================================================================================
// BAGIAN 5: PENGENALAN POLA & PENGGABUNG HASIL
// ===================================================================================

const findCandlestickPatterns = (klines) => {
    if (!klines || klines.length < 3) return { pattern: 'NONE', bias: 'NETRAL' };
    const getCandle = (k) => { const [o,h,l,c] = k.slice(1,5).map(parseFloat); return {o,h,l,c, body:Math.abs(c-o), isGreen:c>o, isRed:c<o}; };
    const c1 = getCandle(klines[klines.length-1]), c2 = getCandle(klines[klines.length-2]), c3 = getCandle(klines[klines.length-3]);
    if (c3.isGreen && c2.isGreen && c1.isGreen && c1.c>c2.c && c2.c>c3.c) return { pattern: 'THREE WHITE SOLDIERS', bias: 'BULLISH' };
    if (c3.isRed && c2.isRed && c1.isRed && c1.c<c2.c && c2.c<c3.c) return { pattern: 'THREE BLACK CROWS', bias: 'BEARISH' };
    if (c2.isRed && c1.isGreen && c1.c > c2.o && c1.o < c2.c) return { pattern: 'BULLISH ENGULFING', bias: 'BULLISH' };
    if (c2.isGreen && c1.isRed && c1.c < c2.o && c1.o > c2.c) return { pattern: 'BEARISH ENGULFING', bias: 'BEARISH' };
    const lowerWick = Math.min(c1.o, c1.c) - c1.l, upperWick = c1.h - Math.max(c1.o, c1.c);
    if (lowerWick > c1.body * 2 && upperWick < c1.body * 0.5) return { pattern: 'HAMMER', bias: 'BULLISH' };
    if (upperWick > c1.body * 2 && lowerWick < c1.body * 0.5) return { pattern: 'SHOOTING STAR', bias: 'BEARISH' };
    return { pattern: 'NONE', bias: 'NETRAL' };
};

const detectRSIDivergence = (closes, rsiValues, lookback = 30) => {
    if (!closes || closes.length < lookback || !rsiValues || rsiValues.length < lookback) return { status: 'NONE' };
    const recentCloses = closes.slice(-lookback), recentRSI = rsiValues.slice(-lookback);
    const findPivots = (data, isHigh) => {
        let pivots = [];
        for (let i = 1; i < data.length - 1; i++) {
            if ((isHigh && data[i] > data[i-1] && data[i] > data[i+1]) || (!isHigh && data[i] < data[i-1] && data[i] < data[i+1])) {
                pivots.push({ index: i, value: data[i] });
            }
        } return pivots;
    };
    const priceLows = findPivots(recentCloses, false), priceHighs = findPivots(recentCloses, true);
    const rsiLows = findPivots(recentRSI, false), rsiHighs = findPivots(recentRSI, true);
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
        const lastPriceLow = priceLows.pop(), prevPriceLow = priceLows.pop();
        const lastRsiLow = rsiLows.find(l => Math.abs(l.index - lastPriceLow.index) < 3), prevRsiLow = rsiLows.find(l => Math.abs(l.index - prevPriceLow.index) < 3);
        if (lastPriceLow && prevPriceLow && lastRsiLow && prevRsiLow && lastPriceLow.value < prevPriceLow.value && lastRsiLow.value > prevRsiLow.value) return { status: 'BULLISH' };
    }
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
        const lastPriceHigh = priceHighs.pop(), prevPriceHigh = priceHighs.pop();
        const lastRsiHigh = rsiHighs.find(h => Math.abs(h.index - lastPriceHigh.index) < 3), prevRsiHigh = rsiHighs.find(h => Math.abs(h.index - prevPriceHigh.index) < 3);
        if (lastPriceHigh && prevPriceHigh && lastRsiHigh && prevRsiHigh && lastPriceHigh.value > prevPriceHigh.value && lastRsiHigh.value < prevRsiHigh.value) return { status: 'BEARISH' };
    }
    return { status: 'NONE' };
};

const detectOBVDivergence = (closes, klines, lookback = 30) => {
    const obvValues = calculateOBV(klines);
    // Logika mirip dengan RSI Divergence, tetapi menggunakan obvValues
    return { status: 'NONE' }; // Implementasi disederhanakan
};

const calculateCVD = (trades) => {
    if (!trades) return [];
    let cumulativeDelta = 0;
    return trades.map(t => {
        const sign = t.m ? -1 : 1; // true if maker is seller (sell)
        cumulativeDelta += parseFloat(t.q) * sign;
        return { time: t.T / 1000, cvd: cumulativeDelta };
    });
};

const calculateCorrelation = (dataX, dataY) => {
    if (dataX.length !== dataY.length || dataX.length === 0) return null;
    const n = dataX.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += dataX[i]; sumY += dataY[i]; sumXY += dataX[i] * dataY[i];
        sumX2 += dataX[i] * dataX[i]; sumY2 += dataY[i] * dataY[i];
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denominator === 0 ? 0 : numerator / denominator;
};


/**
 * Fungsi Penggabung Akhir.
 * Menjalankan semua fungsi kalkulasi dan menyusun hasilnya dalam satu objek.
 */
function recalculateAllIndicators(klines, tickerData, prevDayKline, marketType, cvdData, orderBookData, fundingRateData, lsRatioUmumData, openInterestData) {
    if (!klines || klines.length < 50) return {};
    const closes = klines.map(k => parseFloat(k[4]));
    const lastPrice = closes[closes.length - 1];
    const rsiValues = calculateRSI(closes);
    const macdData = calculateMACD(closes);
    const stochData = calculateStochasticRSI(closes);
    const bbData = calculateBollingerBands(closes);
    const pivotData = calculatePivotPoints(prevDayKline);
    
    // Status RSI
    const lastRsi = rsiValues.filter(v => v !== undefined).pop() || 50;
    const rsiStatus = lastRsi > 70 ? 'Overbought' : (lastRsi < 30 ? 'Oversold' : 'Netral');

    // Status Stoch RSI
    const lastK = stochData.kLine.filter(v=>v!==undefined).pop() || 50;
    const stochStatus = lastK > 80 ? 'Overbought' : (lastK < 20 ? 'Oversold' : 'Netral');

    // Status MACD
    const lastMacd = macdData.macdLine.filter(v=>v!==undefined).pop() || 0;
    const lastSig = macdData.signalLine.filter(v=>v!==undefined).pop() || 0;
    const macdStatus = lastMacd > lastSig ? 'Bullish' : 'Bearish';

    return {
        adx: calculateADX(klines),
        vpvr: calculateVPVR(klines),
        ma: {
             value21: calculateEMA(closes, 21).pop(),
             value50: calculateEMA(closes, 50).pop(),
        },
        rsi: {
            values: rsiValues,
            last: lastRsi.toFixed(2),
            status: rsiStatus,
        },
        rsiDivergence: detectRSIDivergence(closes, rsiValues),
        obvDivergence: detectOBVDivergence(closes, klines),
        stoch: {
            k: lastK.toFixed(2),
            d: stochData.dLine.filter(v=>v!==undefined).pop()?.toFixed(2) || 50,
            status: stochStatus,
        },
        macd: {
            status: macdStatus,
            hist: macdData.histogram.filter(v=>v!==undefined).pop()?.value > 0 ? '(Naik)' : '(Turun)'
        },
        bollingerBands: {
            status: lastPrice > bbData.upper.pop() ? 'Above' : (lastPrice < bbData.lower.pop() ? 'Below' : 'Inside'),
        },
        pivot: {
            status: pivotData ? (lastPrice > pivotData.P ? 'Bullish' : 'Bearish') : 'N/A',
            data: pivotData
        },
        candlePattern: findCandlestickPatterns(klines)
    };
}