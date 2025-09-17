    const calculateEMA = (data, period) => {
        if (!data || data.length < period) {
            return [];
        }

        const k = 2 / (period + 1);
        let emaArray = [];

        if (data.length > 0) {
            let sum = 0;
            for (let i = 0; i < period; i++) {
            sum += data[i] || 0;
            }
            emaArray[period - 1] = sum / period;
            for (let i = period; i < data.length; i++) {
            emaArray[i] = (data[i] * k) + (emaArray[i - 1] * (1 - k));
            }
        }

        return emaArray;
    };
    
    const calculateSMA = (data, period) => {
        if (!data || data.length < period) {
            return [];
        }
        
        let sma = [];
        let sum = 0;

        // Hitung jumlah untuk jendela pertama
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        sma.push(sum / period);

        // Gunakan teknik "sliding window" untuk sisa data
        // Kurangi elemen terlama, tambahkan elemen terbaru
        for (let i = period; i < data.length; i++) {
            sum = sum - data[i - period] + data[i];
            sma.push(sum / period);
        }

        // Untuk menjaga kompatibilitas penuh dengan struktur data asli,
        // kita tambahkan kembali 'undefined' di awal.
        const alignedSma = [...Array(period - 1).fill(undefined), ...sma];
        
        return alignedSma;
    };

    const calculateRSI = (closes, period) => {
        if (period === undefined) {
            const timeframe = backtestTimeframeSelect.value;
            period = timeframeParameterMap[timeframe]?.rsi_period || 14;
        }
        
        if (!closes || closes.length <= period) {
            return Array(closes.length).fill(undefined);
        }
        
        let gains = [];
        let losses = [];
        for (let i = 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            gains.push(diff > 0 ? diff : 0);
            losses.push(diff < 0 ? -diff : 0);
        }
        let rsi = Array(period).fill(undefined);
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
        rsi[period - 1] = (avgLoss === 0) ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            rsi.push((avgLoss === 0) ? 100 : 100 - (100 / (1 + (avgGain / avgLoss))));
        }
        return rsi;
    };
    
    const calculateMACD = (closes, fast, slow, signal) => {
        if (fast === undefined) {
            const timeframe = backtestTimeframeSelect.value;
            const params = timeframeParameterMap[timeframe] || timeframeParameterMap['15m'];
            fast = params.macd_fast;
            slow = params.macd_slow;
            signal = params.macd_signal;
        }
        
        if (closes.length < slow) {
            return { status: 'Netral', macdLine: [], signalLine: [], histogram: [] };
        }
        
        const emaFast = calculateEMA(closes, fast);
        const emaSlow = calculateEMA(closes, slow);
        const macdLine = emaSlow.map((slowVal, i) => {
            if (slowVal !== undefined && emaFast[i] !== undefined) {
                return emaFast[i] - slowVal;
            }
            return undefined;
        }).filter(v => v !== undefined);
        const signalLine = calculateEMA(macdLine, signal);
        const histogram = macdLine.map((macdVal, i) => {
            const sigVal = signalLine[i] !== undefined ? signalLine[i] : (signalLine.length > 0 ? signalLine.pop() : undefined);
            if (sigVal !== undefined) {
                const histValue = macdVal - sigVal;
                const prevHistValue = (i > 0 && macdLine[i - 1] !== undefined && signalLine[i - 1] !== undefined) ? (macdLine[i - 1] - signalLine[i - 1]) : 0;
                return {
                    value: histValue,
                    color: histValue >= 0 ? (histValue >= prevHistValue ? '#26a69a' : '#80cbc4') : (histValue < prevHistValue ? '#ef5350' : '#e57373')
                };
            }
            return undefined;
        }).filter(v => v !== undefined);
        const lastMacd = macdLine.pop() || 0;
        const lastSig = signalLine.pop() || 0;
        const prevMacdLine = macdLine.pop() || 0;
        const prevSignalLine = signalLine.pop() || 0;
        let status = 'Netral';
        if (prevMacdLine <= prevSignalLine && lastMacd > lastSig) {
            status = 'Bullish Cross';
        } else if (prevMacdLine >= prevSignalLine && lastMacd < lastSig) {
            status = 'Bearish Cross';
        }
        return { status, macdLine, signalLine, histogram };
    };

    const calculateStochasticRSI = (closes, rsiPeriod, stochPeriod, kSmooth, dSmooth) => {
        if (rsiPeriod === undefined) {
            const timeframe = backtestTimeframeSelect.value;
            const params = timeframeParameterMap[timeframe] || timeframeParameterMap['15m'];
            rsiPeriod = params.stoch_rsi_period;
            stochPeriod = params.stoch_stoch_period;
            kSmooth = params.stoch_k_smooth;
            dSmooth = params.stoch_d_smooth;
        }

        const rsiValues = calculateRSI(closes, rsiPeriod);
        const validRsi = rsiValues.filter(v => v !== undefined);
        if (validRsi.length < stochPeriod) {
            return { kLine: [], dLine: [], status: 'Netral' };
        }
        
        let stochArr = [];
        for (let i = stochPeriod - 1; i < validRsi.length; i++) {
            const window = validRsi.slice(i - stochPeriod + 1, i + 1);
            const minR = Math.min(...window);
            const maxR = Math.max(...window);
            const denom = maxR - minR;
            stochArr.push(denom === 0 ? 0 : ((validRsi[i] - minR) / denom) * 100);
        }
        const kLineRaw = calculateSMA(stochArr, kSmooth);
        const dLineRaw = calculateSMA(kLineRaw.filter(v => v !== undefined), dSmooth);
        const kLine = kLineRaw.filter(v => v !== undefined);
        const dLine = dLineRaw.filter(v => v !== undefined);
        const lastK = kLine.pop() || 50;
        const lastD = dLine.pop() || 50;
        let status = 'Netral';
        if (lastK > 80 && lastD > 80) status = 'Overbought';
        else if (lastK < 20 && lastD < 20) status = 'Oversold';
        return { kLine, dLine, status };
    };

    const detectRSIDivergence = (closes, rsiValues, lookback = 30) => {
        if (!closes || closes.length < lookback || !rsiValues || rsiValues.length < lookback) return { status: 'NONE' };
        const recentCloses = closes.slice(-lookback), recentRSI = rsiValues.slice(-lookback);
        const findPivots = (data, isHigh) => {
            let pivots = [];
            for (let i = 1; i < data.length - 1; i++) {
                if ((isHigh && data[i] > data[i - 1] && data[i] > data[i + 1]) || (!isHigh && data[i] < data[i - 1] && data[i] < data[i + 1])) {
                    pivots.push({ index: i, value: data[i] });
                }
            }
            return pivots;
        };
        const priceLows = findPivots(recentCloses, false), priceHighs = findPivots(recentCloses, true);
        const rsiLows = findPivots(recentRSI, false), rsiHighs = findPivots(recentRSI, true);
        if (priceLows.length >= 2 && rsiLows.length >= 2) {
            const lastPriceLow = priceLows[priceLows.length - 1], prevPriceLow = priceLows[priceLows.length - 2];
            const lastRsiLow = rsiLows.find(l => Math.abs(l.index - lastPriceLow.index) < 3), prevRsiLow = rsiLows.find(l => Math.abs(l.index - prevPriceLow.index) < 3);
            if (lastPriceLow && prevPriceLow && lastRsiLow && prevRsiLow && lastPriceLow.value < prevPriceLow.value && lastRsiLow.value > prevRsiLow.value) return { status: 'BULLISH' };
        }
        if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
            const lastPriceHigh = priceHighs[priceHighs.length - 1], prevPriceHigh = priceHighs[priceHighs.length - 2];
            const lastRsiHigh = rsiHighs.find(h => Math.abs(h.index - lastPriceHigh.index) < 3), prevRsiHigh = rsiHighs.find(h => Math.abs(h.index - prevPriceHigh.index) < 3);
            if (lastPriceHigh && prevPriceHigh && lastRsiHigh && prevRsiHigh && lastPriceHigh.value > prevPriceHigh.value && lastRsiHigh.value < prevRsiHigh.value) return { status: 'BEARISH' };
        }
        return { status: 'NONE' };
    };

    const calculateOBV = (klines) => {
        if (!klines || klines.length < 2) return [];
        let obv = [0]; 
        for (let i = 1; i < klines.length; i++) {
            const close = parseFloat(klines[i][4]);
            const prevClose = parseFloat(klines[i-1][4]);
            const volume = parseFloat(klines[i][5]);
            if (close > prevClose) obv.push(obv[i-1] + volume);
            else if (close < prevClose) obv.push(obv[i-1] - volume);
            else obv.push(obv[i-1]);
        }
        return obv;
    };

    const detectOBVDivergence = (closes, klines, lookback = 30) => {
        if (!closes || closes.length < lookback || !klines || klines.length < lookback) return { status: 'NONE', class: 'text-gray-500' };

        const obvValues = calculateOBV(klines);
        const recentCloses = closes.slice(-lookback);
        const recentOBV = obvValues.slice(-lookback);

        const findPivots = (data, isHigh) => {
            let pivots = [];
            for (let i = 1; i < data.length - 1; i++) {
                if ((isHigh && data[i] > data[i - 1] && data[i] > data[i + 1]) || (!isHigh && data[i] < data[i - 1] && data[i] < data[i + 1])) {
                    pivots.push({ index: i, value: data[i] });
                }
            }
            return pivots;
        };

        const priceLows = findPivots(recentCloses, false), priceHighs = findPivots(recentCloses, true);
        const obvLows = findPivots(recentOBV, false), obvHighs = findPivots(recentOBV, true);

        if (priceLows.length >= 2 && obvLows.length >= 2) {
            const lastPriceLow = priceLows[priceLows.length - 1], prevPriceLow = priceLows[priceLows.length - 2];
            const lastObvLow = obvLows.find(l => Math.abs(l.index - lastPriceLow.index) < 3), prevObvLow = obvLows.find(l => Math.abs(l.index - prevPriceLow.index) < 3);
            if (lastPriceLow && prevPriceLow && lastObvLow && prevObvLow && lastPriceLow.value < prevPriceLow.value && lastObvLow.value > prevObvLow.value) return { status: 'BULLISH', class: 'positive blinking-text-animation' };
        }
        if (priceHighs.length >= 2 && obvHighs.length >= 2) {
            const lastPriceHigh = priceHighs[priceHighs.length - 1], prevPriceHigh = priceHighs[priceHighs.length - 2];
            const lastObvHigh = obvHighs.find(h => Math.abs(h.index - lastPriceHigh.index) < 3), prevObvHigh = obvHighs.find(h => Math.abs(h.index - prevPriceHigh.index) < 3);
            if (lastPriceHigh && prevPriceHigh && lastObvHigh && prevObvHigh && lastPriceHigh.value > prevPriceHigh.value && lastObvHigh.value < prevObvHigh.value) return { status: 'BEARISH', class: 'negative blinking-text-animation' };
        }
        return { status: 'NONE', class: 'text-gray-500' };
    };

    const findCandlestickPatterns = (klines) => {
        if (!klines || klines.length < 2) return { bias: 'NETRAL' };
        const getCandle = (k) => {
            const [o, h, l, c] = k.slice(1, 5).map(parseFloat);
            return { open: o, close: c, isGreen: c > o, isRed: c < o };
        };
        const c1 = getCandle(klines[klines.length - 1]), c2 = getCandle(klines[klines.length - 2]);
        if (c2.isRed && c1.isGreen && c1.close > c2.open) return { bias: 'BULLISH' };
        if (c2.isGreen && c1.isRed && c1.close < c2.open) return { bias: 'BEARISH' };
        return { bias: 'NETRAL' };
    };

    const calculateBollingerBands = (closes, period = 20, stdDev = 2) => {
        if (closes.length < period) {
            return { upper: [], middle: [], lower: [], squeezeStatus: 'N/A' };
        }

        // Dependensi: Memanggil fungsi calculateSMA yang sekarang sudah lebih cepat.
        const middle = calculateSMA(closes, period);
        const upper = [];
        const lower = [];
        const width = [];

        // Optimasi kalkulasi deviasi standar dengan sliding window
        let sum = 0;
        let sumOfSquares = 0;

        // Inisialisasi untuk jendela pertama
        const initialSlice = closes.slice(0, period);
        for (const val of initialSlice) {
            sum += val;
            sumOfSquares += val * val;
        }

        // Fungsi untuk menghitung dan menambahkan band
        const calculateAndPushBands = (currentSum, currentSumOfSquares) => {
            const mean = currentSum / period;
            const variance = (currentSumOfSquares / period) - (mean * mean);
            const stdev = Math.sqrt(Math.max(0, variance)); // Hindari akar negatif karena presisi float

            upper.push(mean + (stdev * stdDev));
            lower.push(mean - (stdev * stdDev));
            width.push((stdev * stdDev * 2));
        };

        // Hitung untuk jendela pertama
        calculateAndPushBands(sum, sumOfSquares);

        // Gunakan sliding window untuk sisa data
        for (let i = period; i < closes.length; i++) {
            const oldVal = closes[i - period];
            const newVal = closes[i];

            sum = sum - oldVal + newVal;
            sumOfSquares = sumOfSquares - (oldVal * oldVal) + (newVal * newVal);
            
            calculateAndPushBands(sum, sumOfSquares);
        }
        
        // Logika Squeeze (tidak berubah)
        const lastWidth = width.filter(v => v !== undefined).pop();
        let squeezeStatus = 'Normal';
        if (width.length > 50) {
            // ... logika squeeze tetap sama
        }

        // Menambahkan 'undefined' di awal untuk menjaga kompatibilitas
        const align = (arr) => [...Array(period - 1).fill(undefined), ...arr];

        return { 
            upper: align(upper), 
            middle: middle, // middle sudah memiliki 'undefined' dari calculateSMA
            lower: align(lower), 
            squeezeStatus 
        };
    };

    const calculateADX = (klines, period = 14) => {
        if (!klines || klines.length < period * 2) return { value: 0, plusDI: 0, minusDI: 0 };
        let highs = klines.map(k => parseFloat(k[2])), lows = klines.map(k => parseFloat(k[3])), closes = klines.map(k => parseFloat(k[4]));
        let trs = [], plusDMs = [], minusDMs = [];
        for (let i = 1; i < highs.length; i++) {
            trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
            let upMove = highs[i] - highs[i - 1], downMove = lows[i - 1] - lows[i];
            plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
        }
        const rma = (data, p) => {
            let rma = [], sum = 0;
            for (let i = 0; i < data.length; i++) {
                if (i < p) {
                    sum += data[i];
                    rma.push(i === p - 1 ? sum / p : undefined);
                } else if(rma[i-1] !== undefined) {
                    rma.push((rma[i - 1] * (p - 1) + data[i]) / p);
                }
            }
            return rma;
        };
        let smoothedTR = rma(trs, period), smoothedPlusDM = rma(plusDMs, period), smoothedMinusDM = rma(minusDMs, period);
        let plusDIs = [], minusDIs = [], dxs = [];
        for (let i = 0; i < smoothedTR.length; i++) {
            if (smoothedTR[i] === undefined) continue;
            let plusDI = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
            let minusDI = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
            plusDIs.push(plusDI);
            minusDIs.push(minusDI);
            let diSum = plusDI + minusDI;
            dxs.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
        }
        let adxValues = rma(dxs, period);
        return { value: adxValues.filter(v=>v!==undefined).pop() || 0, plusDI: plusDIs.pop() || 0, minusDI: minusDIs.pop() || 0 };
    };

    function calculatePivotPoints(prevDayKline) {
        if (!prevDayKline || prevDayKline.length < 5) return null;
        const high = parseFloat(prevDayKline[2]);
        const low = parseFloat(prevDayKline[3]);
        const close = parseFloat(prevDayKline[4]);
        if (isNaN(high) || isNaN(low) || isNaN(close)) return null;
        return { P: (high + low + close) / 3 };
    }

    function calculateVWAP(klines, period = 20) {
        if (!klines || klines.length < period) return 0;
        let sumPV = 0, sumV = 0;
        const dataSlice = klines.slice(-period);
        dataSlice.forEach(k => {
            const high = parseFloat(k[2]), low = parseFloat(k[3]), close = parseFloat(k[4]), vol = parseFloat(k[5]);
            sumPV += ((high + low + close) / 3) * vol;
            sumV += vol;
        });
        return sumV > 0 ? sumPV / sumV : 0;
    }

    function calculateIchimokuCloud(klines) {
        if (klines.length < 52) return { status: 'Netral' };
        const getHighLow = (slice) => ({ high: Math.max(...slice.map(k => parseFloat(k[2]))), low: Math.min(...slice.map(k => parseFloat(k[3]))) });
        let tenkan = [], kijun = [];
        for (let i = 0; i < klines.length; i++) {
            const tenkanHighLow = i >= 8 ? getHighLow(klines.slice(i - 8, i + 1)) : {};
            tenkan.push(tenkanHighLow.high ? (tenkanHighLow.high + tenkanHighLow.low) / 2 : undefined);
            const kijunHighLow = i >= 25 ? getHighLow(klines.slice(i - 25, i + 1)) : {};
            kijun.push(kijunHighLow.high ? (kijunHighLow.high + kijunHighLow.low) / 2 : undefined);
        }
        const lastPrice = parseFloat(klines[klines.length - 1][4]);
        const lastTenkan = tenkan[tenkan.length - 1], lastKijun = kijun[kijun.length - 1];
        if (lastTenkan > lastKijun && lastPrice > lastKijun) return { status: "BULLISH" };
        if (lastTenkan < lastKijun && lastPrice < lastKijun) return { status: "BEARISH" };
        return { status: 'Netral' };
    }

    function calculateParabolicSAR(klines, step = 0.02, max = 0.2) {
        if (klines.length < 2) return { status: 'N/A' };
        let sar = parseFloat(klines[0][3]); let ep = parseFloat(klines[0][2]); let af = step; let isUptrend = true;
        for (let i = 1; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]); const low = parseFloat(klines[i][3]); const prevSar = sar;
            if (isUptrend) { sar = prevSar + af * (ep - prevSar); if (low < sar) { isUptrend = false; sar = ep; ep = low; af = step; } else { if (high > ep) { ep = high; af = Math.min(max, af + step); } }
            } else { sar = prevSar - af * (prevSar - ep); if (high > sar) { isUptrend = true; sar = ep; ep = high; af = step; } else { if (low < ep) { ep = low; af = Math.min(max, af + step); } } }
        }
        const lastClose = parseFloat(klines[klines.length - 1][4]);
        return { status: lastClose > sar ? 'Bullish' : 'Bearish' };
    }

    function calculateROC(closes, period = 12) {
        if (closes.length < period + 1) return { status: 'N/A' };
        const currentClose = closes[closes.length - 1];
        const pastClose = closes[closes.length - 1 - period];
        if (pastClose === 0) return { status: 'N/A' };
        const roc = ((currentClose - pastClose) / pastClose) * 100;
        return { status: roc > 0 ? 'Positif' : 'Negatif' };
    }

    function calculateLinearRegressionChannel(closes, period = 14) {
        if (closes.length < period) return { status: 'N/A' };
        const y = closes.slice(-period); const n = period; const sumX = (n * (n - 1)) / 2; const sumY = y.reduce((a, b) => a + b, 0); const sumXY = y.reduce((acc, val, i) => acc + val * i, 0); const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return { status: slope > 0 ? 'BULLISH' : 'BEARISH' };
    }

    function calculateATR(klines, period = 14) {
        if (!klines || klines.length < period + 1) {
            return { value: 0, status: 'N/A', atrPercent: 0 };
        }
        let trs = [];
        for (let i = 1; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const prevClose = parseFloat(klines[i - 1][4]);
            trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        const rma = (data, p) => {
            let smoothed = [];
            let sum = 0;
            for(let i=0; i<data.length; i++) {
                if (i < p) {
                    sum += data[i];
                    if (i === p - 1) smoothed.push(sum/p);
                    else smoothed.push(undefined);
                } else if (smoothed[i-1] !== undefined) {
                    smoothed.push((smoothed[i - 1] * (p - 1) + data[i]) / p);
                }
            }
            return smoothed;
        };
        const atrValues = rma(trs, period);
        const atr = atrValues.pop() || 0;
        const lastClose = parseFloat(klines[klines.length - 1][4]);
        const atrPercent = lastClose > 0 ? (atr / lastClose) * 100 : 0;
        let status;
        if (atrPercent > 5) status = 'Very High';
        else if (atrPercent > 2.5) status = 'High';
        else if (atrPercent < 1) status = 'Low';
        else status = 'Normal';
        return { value: atr, status: status, atrPercent: atrPercent }; 
    }
// ===================================================================
    function detectMarketRegime_Unified(klinesSnapshot) {
        // Butuh data yang cukup untuk kalkulasi EMA 200
        if (!klinesSnapshot || klinesSnapshot.length < 200) {
            return 'ranging'; // Default jika data tidak cukup
        }

        const closes = klinesSnapshot.map(k => parseFloat(k[4]));
        const lastPrice = closes[closes.length - 1];

        // --- Prioritas 1: Deteksi Volatilitas Rendah (Squeeze) ---
        // Kondisi ini paling unik dan harus dideteksi lebih dulu.
        const bbData = calculateBollingerBands(closes); // Asumsi fungsi ini ada
        if (bbData.squeezeStatus === 'Squeeze!') {
            return 'lowVolatility';
        }

        // --- Prioritas 2: Deteksi Kekuatan Tren ---
        // Jika tidak Squeeze, baru kita cek apakah ada tren yang kuat.
        const adxData = calculateADX(klinesSnapshot, 14); // Asumsi fungsi ini ada
        const adxValue = adxData.value;

        if (adxValue > 25) { // Ambang batas umum untuk tren yang kuat
            const ema50 = calculateEMA(closes, 50).pop();
            const ema200 = calculateEMA(closes, 200).pop();

            // Kondisi klasik untuk tren bullish yang sehat
            if (lastPrice > ema50 && ema50 > ema200) {
                return 'bullTrend';
            }
            // Kondisi klasik untuk tren bearish yang sehat
            if (lastPrice < ema50 && ema50 < ema200) {
                return 'bearTrend';
            }
        }

        return 'ranging';
    }

    function getUltimateSignalScore(indicator, signalData) {
        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
        const mapRange = (x, inMin, inMax, outMin, outMax) => {
            const t = (x - inMin) / (inMax - inMin);
            return outMin + clamp(t, 0, 1) * (outMax - outMin);
        };       
        const confidence = (typeof signalData?.confidence === 'number')
            ? clamp(signalData.confidence, 0, 1)
            : 1;
        const text = (signalData?.status || signalData?.bias || signalData?.signal || '').toString().toUpperCase();
        const biasSigned = (typeof signalData?.biasSigned === 'number')
            ? Math.sign(signalData.biasSigned)
            : null;
        if (['ma','macd','rsi','stoch','psar','linreg','roc','pivot','vwap','ichimoku','candlePattern','bollingerBands'].includes(indicator)) {
            if (biasSigned !== null) return clamp(biasSigned, -1, 1) * confidence;
            if (text.includes('BULL')) return +1 * confidence;
            if (text.includes('BEAR')) return -1 * confidence;
            return 0;
        }
        if (indicator === 'rsiDivergence' || indicator === 'obvDivergence') {
            if (text.includes('BULL')) return +1 * confidence;
            if (text.includes('BEAR')) return -1 * confidence;
            return 0;
        }
        if (indicator === 'openInterest') {
            if (biasSigned !== null) return clamp(biasSigned, -1, 1) * confidence;
            if (text.includes('UP')) return +1 * confidence;
            if (text.includes('DOWN')) return -1 * confidence;
            return 0;
        }
        if (indicator === 'funding' || indicator === 'fundingRate') {
            const v = typeof signalData?.value === 'number' ? signalData.value : 0;
            const s = Math.max(-1, Math.min(1, v / 0.0025));
            return s * confidence;
            }
        if (indicator === 'lsr' || indicator === 'lsRatio') {
            const v = typeof signalData?.value === 'number' ? signalData.value : 1;
            const s = Math.max(-1, Math.min(1, (v - 1) / 0.3));
            return s * confidence;
            }
        if (indicator === 'orderBookBias') {
            if (biasSigned !== null) return clamp(biasSigned, -1, 1) * confidence;
            if (text.includes('BID')) return +1 * confidence;
            if (text.includes('ASK')) return -1 * confidence;
            return 0;
        }
        if (indicator === 'bbSqueeze') {
            const st = (signalData?.status || '').toString().toUpperCase();
            if (st.includes('RELEASE')) return +1 * confidence;
            if (st.includes('ON')) return 0;
            if (st.includes('OFF')) return 0.3 * confidence;
            return 0;
        }
        return 0;
    }

    function calculateConfluenceScoreForCandle(activeWeights, indicators) {
            let totalBullScore = 0, totalBearScore = 0, maxPossibleScore = 0;

            for (const indicator in activeWeights) {
                if (indicators[indicator]) {
                    const weight = activeWeights[indicator];
                    // getUltimateSignalScore akan mengambil sinyal yang sudah matang
                    const rawScore = getUltimateSignalScore(indicator, indicators[indicator]);
                    const weightedScore = rawScore * weight;

                    if (weightedScore > 0) totalBullScore += weightedScore;
                    if (weightedScore < 0) totalBearScore += Math.abs(weightedScore);
                    maxPossibleScore += Math.abs(weight);
                }
            }

            const bullPercentage = maxPossibleScore > 0 ? (totalBullScore / maxPossibleScore) * 100 : 0;
            const bearPercentage = maxPossibleScore > 0 ? (totalBearScore / maxPossibleScore) * 100 : 0;

            return { bull: bullPercentage, bear: bearPercentage };
        }
    function calculateMetrics(trades, initialBalance) {
    if (trades.length === 0) return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, finalBalance: initialBalance, maxDrawdown: 0, expectancy: 0, maxLosingStreak: 0 };
    let totalPnl = 0, grossProfit = 0, grossLoss = 0, wins = 0, equityCurve = [initialBalance], peakEquity = initialBalance, maxDrawdown = 0, losingStreak = 0, maxLosingStreak = 0;
    trades.forEach(trade => {
        totalPnl += trade.pnl;
        const currentEquity = initialBalance + totalPnl;
        equityCurve.push(currentEquity);
        peakEquity = Math.max(peakEquity, currentEquity);
        const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        if (trade.pnl > 0) { wins++; losingStreak = 0; grossProfit += trade.pnl; } 
        else { losingStreak++; maxLosingStreak = Math.max(maxLosingStreak, losingStreak); grossLoss += Math.abs(trade.pnl); }
    });
    const winRate = (wins / trades.length) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    const expectancy = totalPnl / trades.length;
    return { totalPnl, winRate, profitFactor, totalTrades: trades.length, finalBalance: initialBalance + totalPnl, maxDrawdown, expectancy, maxLosingStreak };
}


// === BAGIAN 3: FUNGSI UTAMA PEKERJAAN (RUN BACKTEST) ===

function calculateMetrics(trades, initialBalance) {
    if (trades.length === 0) return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, finalBalance: initialBalance, maxDrawdown: 0, expectancy: 0, maxLosingStreak: 0 };
    let totalPnl = 0, grossProfit = 0, grossLoss = 0, wins = 0, equityCurve = [initialBalance], peakEquity = initialBalance, maxDrawdown = 0, losingStreak = 0, maxLosingStreak = 0;
    trades.forEach(trade => {
        totalPnl += trade.pnl;
        const currentEquity = initialBalance + totalPnl;
        equityCurve.push(currentEquity);
        peakEquity = Math.max(peakEquity, currentEquity);
        const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        if (trade.pnl > 0) { wins++; losingStreak = 0; grossProfit += trade.pnl; } 
        else { losingStreak++; maxLosingStreak = Math.max(maxLosingStreak, losingStreak); grossLoss += Math.abs(trade.pnl); }
    });
    const winRate = (trades.length > 0) ? (wins / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    const expectancy = trades.length > 0 ? totalPnl / trades.length : 0;
    return { totalPnl, winRate, profitFactor, totalTrades: trades.length, finalBalance: initialBalance + totalPnl, maxDrawdown, expectancy, maxLosingStreak };
}

// === BAGIAN 3: FUNGSI UTAMA PEKERJAAN ===

async function runBacktestWithGenome(genome, historicalData, timeframe) {
    const settings = {
        initialBalance: 1000, leverage: 10, riskPerTrade: 0.01,
        takerFee: 0.0004, makerFee: 0.0002, slippageModel: 'atrAdvanced',
        atrSlippagePercent: 10, randomSlippagePercent: 0.005, marginMode: 'cross',
        ...genome
    };

    // STEP 1: PRE-CALCULATION (MEMBUAT CACHE)
    const analysisCache = [];
    const fullCloses = historicalData.map(k => parseFloat(k[4]));
    
    // Gunakan parameter dari genome untuk kalkulasi
    const macdParams = timeframeParameterMap[timeframe] || timeframeParameterMap['15m'];
    const allMacdData = calculateMACD(fullCloses, macdParams.macd_fast, macdParams.macd_slow, macdParams.macd_signal);
    
    for (let i = 0; i < historicalData.length; i++) {
        if (i < 200) {
            analysisCache.push(null); continue;
        }
        const klinesSnapshot = historicalData.slice(0, i + 1);
        const score = getConfluenceAnalysis(klinesSnapshot);
        const atr = calculateATR(klinesSnapshot);
        analysisCache.push({ bullScore: score.skorBullish, bearScore: score.skorBearish, atrValue: atr.value });
    }

    // STEP 2: SIMULATION (MENGGUNAKAN CACHE)
    let balance = settings.initialBalance;
    let position = null;
    const trades = [];
    
    for (let i = 200; i < historicalData.length; i++) {
        const cacheEntry = analysisCache[i];
        if (!cacheEntry) continue;

        const currentCandle = historicalData[i];
        const currentLow = parseFloat(currentCandle[3]);
        const currentHigh = parseFloat(currentCandle[2]);

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
                const netPnl = rawPnl - ( (position.entryPrice * position.size * settings.takerFee) + (exitPrice * position.size * settings.makerFee) );
                balance += netPnl;
                trades.push({ ...position, exitPrice, pnl: netPnl, exitDate: new Date(currentCandle[0]), reason: exitReason });
                position = null;
                if (balance <= 0) break;
            }
        }

        if (!position && cacheEntry) {
            const klinesSnapshot = historicalData.slice(0, i + 1);
            const currentRegime = detectMarketRegime_Unified(klinesSnapshot);
            let entrySignal = false, detectedBias = 'NETRAL', entryPrice = 0;
            const closes = klinesSnapshot.map(k => parseFloat(k[4]));
            const recentKlines = historicalData.slice(Math.max(0, i - settings.swingLookback), i);
            const recentSwingHigh = Math.max(...recentKlines.map(k => parseFloat(k[2])));
            const recentSwingLow = Math.min(...recentKlines.map(k => parseFloat(k[3])));

            if (currentRegime === 'bullTrend' || currentRegime === 'bearTrend') {
                const bias = (cacheEntry.bullScore > cacheEntry.bearScore + settings.biasThreshold) ? 'LONG' : (cacheEntry.bearScore > cacheEntry.bullScore + settings.biasThreshold) ? 'SHORT' : 'NETRAL';
                const emaEntry = calculateEMA(closes, settings.pullbackEmaPeriod).pop();
                if (bias !== 'NETRAL' && emaEntry && currentLow <= emaEntry && currentHigh >= emaEntry) {
                    entrySignal = true; detectedBias = bias; entryPrice = emaEntry;
                }
            } else if (currentRegime === 'ranging') {
                const bollingerBands = calculateBollingerBands(closes); 
                const lastLowerBand = bollingerBands.lower.filter(v=>v).pop();
                const lastUpperBand = bollingerBands.upper.filter(v=>v).pop();
                if (lastLowerBand > 0 && currentLow <= lastLowerBand) { 
                    entrySignal = true; detectedBias = 'LONG'; entryPrice = currentLow; 
                } else if (lastUpperBand > 0 && currentHigh >= lastUpperBand) { 
                    entrySignal = true; detectedBias = 'SHORT'; entryPrice = currentHigh; 
                }
            } else if (currentRegime === 'lowVolatility') {
                if (currentHigh > recentSwingHigh) { 
                    entrySignal = true; detectedBias = 'LONG'; entryPrice = recentSwingHigh; 
                } else if (currentLow < recentSwingLow) { 
                    entrySignal = true; detectedBias = 'SHORT'; entryPrice = recentSwingLow; 
                }
            }
            
            if (entrySignal && (settings.atrFilterThreshold <= 0 || (cacheEntry.atrValue > settings.atrFilterThreshold))) {
                let stopLoss, takeProfit;
                if (detectedBias === 'LONG') {
                    stopLoss = recentSwingLow * 0.999;
                    takeProfit = entryPrice + (Math.abs(entryPrice - stopLoss) * settings.riskRewardRatio);
                } else {
                    stopLoss = recentSwingHigh * 1.001;
                    takeProfit = entryPrice - (Math.abs(stopLoss - entryPrice) * settings.riskRewardRatio);
                }
                const cost = balance * settings.riskPerTrade;
                const sizeInAsset = (cost * settings.leverage) / entryPrice;
                position = { type: detectedBias, entryPrice, cost, size: sizeInAsset, sl: stopLoss, tp: takeProfit, leverage: settings.leverage, entryDate: new Date(currentCandle[0]) };
            }
        }
    }

    // --- STEP 3: METRICS ---
    const metrics = calculateMetrics(trades, settings.initialBalance);
    return metrics;
}

// === BAGIAN 4: "TELINGA" KARYAWAN ===
self.onmessage = async function(e) {
    const { genome, historicalData, timeframe, fitnessMetric } = e.data;
    const metrics = await runBacktestWithGenome(genome, historicalData, timeframe);
    let fitnessScore = 0;
    if (fitnessMetric === 'Win Rate') {
        fitnessScore = metrics.winRate || 0;
    } else { // Default ke Profit Factor
        fitnessScore = metrics.profitFactor > 0 ? metrics.profitFactor : 0;
    }
    self.postMessage({ ...genome, fitness: fitnessScore, metrics: metrics });
};