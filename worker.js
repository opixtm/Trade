 // Listener untuk menerima pesan dari thread utama (genesis_engine.html)
    self.onmessage = async (event) => {
        // Di sini kita akan menerima data dari thread utama
        const { type, payload } = event.data;

        if (type === 'START_EVALUATION') {
            // Ambil isRunning dan data lainnya dari payload
            const { population, historicalData, settings, fitnessMetric, isRunning } = payload; 
            
            // Kirim isRunning ke evaluateFitness
            const evaluatedPopulation = await evaluateFitness(population, historicalData, settings, fitnessMetric, isRunning);

            // Setelah evaluasi selesai, kirim kembali hasilnya ke thread utama
            self.postMessage({ type: 'EVALUATION_COMPLETE', payload: evaluatedPopulation });
        }
    };

    const TIMEFRAME_MAP_MS = {
        '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
        '1h': 3600000, '4h': 14400000, '1d': 86400000
    };
    const timeframeParameterMap = {
        '1m': { rsi_period: 7, macd_fast: 5, macd_slow: 13, macd_signal: 5, stoch_rsi_period: 9, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 },
        '3m': { rsi_period: 9, macd_fast: 5, macd_slow: 13, macd_signal: 5, stoch_rsi_period: 9, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 },
        '5m': { rsi_period: 9, macd_fast: 8, macd_slow: 21, macd_signal: 9, stoch_rsi_period: 14, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 },
        '15m': { rsi_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9, stoch_rsi_period: 14, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_spliter_d_smooth: 3 },
        '1h': { rsi_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9, stoch_rsi_period: 14, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 },
        '4h': { rsi_period: 21, macd_fast: 12, macd_slow: 26, macd_signal: 9, stoch_rsi_period: 21, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 },
        '1d': { rsi_period: 21, macd_fast: 21, macd_slow: 55, macd_signal: 9, stoch_rsi_period: 21, stoch_stoch_period: 14, stoch_k_smooth: 3, stoch_d_smooth: 3 }
    };
    const MAINTENANCE_MARGIN_RATE = 0.005;

// ===================================================================
// BAGIAN 2: PUSTAKA FUNGSI KALKULASI MURNI (VERSI LENGKAP & SINKRON)
// ===================================================================    
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

        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        sma.push(sum / period);

        for (let i = period; i < data.length; i++) {
            sum = sum - data[i - period] + data[i];
            sma.push(sum / period);
        }

        const alignedSma = [...Array(period - 1).fill(undefined), ...sma];
        
        return alignedSma;
    };

    const calculateRSI = (closes, timeframe) => {
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
    
    const calculateMACD = (closes, timeframe) => {
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

    const calculateStochasticRSI = (closes, timeframe) => {
        const rsiValues = calculateRSI(closes, timeframe);
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

        const middle = calculateSMA(closes, period);
        const upper = [];
        const lower = [];
        const width = [];

        let sum = 0;
        let sumOfSquares = 0;

        const initialSlice = closes.slice(0, period);
        for (const val of initialSlice) {
            sum += val;
            sumOfSquares += val * val;
        }

        const calculateAndPushBands = (currentSum, currentSumOfSquares) => {
            const mean = currentSum / period;
            const variance = (currentSumOfSquares / period) - (mean * mean);
            const stdev = Math.sqrt(Math.max(0, variance)); 

            upper.push(mean + (stdev * stdDev));
            lower.push(mean - (stdev * stdDev));
            width.push((stdev * stdDev * 2));
        };

        calculateAndPushBands(sum, sumOfSquares);

        for (let i = period; i < closes.length; i++) {
            const oldVal = closes[i - period];
            const newVal = closes[i];

            sum = sum - oldVal + newVal;
            sumOfSquares = sumOfSquares - (oldVal * oldVal) + (newVal * newVal);
            
            calculateAndPushBands(sum, sumOfSquares);
        }
        
        const lastWidth = width.filter(v => v !== undefined).pop();
        let squeezeStatus = 'Normal';
        if (width.length > 50) {
        }

        const align = (arr) => [...Array(period - 1).fill(undefined), ...arr];

        return { 
            upper: align(upper), 
            middle: middle, 
            lower: align(lower), 
            squeezeStatus 
        };
    };

    const calculateADX = (klines, period = 14) => {
        if (!klines || klines.length < period * 2) {
            return { value: 0, plusDI: 0, minusDI: 0 };
        }

        const trs = [];
        const plusDMs = [];
        const minusDMs = [];
        
        
        for (let i = 1; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const prevHigh = parseFloat(klines[i - 1][2]);
            const prevLow = parseFloat(klines[i - 1][3]);
            const prevClose = parseFloat(klines[i-1][4]);
            
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);

            const upMove = high - prevHigh;
            const downMove = prevLow - low;
            
            plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
        }

        const rma = (data, p) => {
            let result = [];
            if (data.length < p) return data.map(() => undefined);

            let sum = data.slice(0, p).reduce((acc, val) => acc + val, 0);
            result.push(sum / p);

            for (let i = p; i < data.length; i++) {
                const prevRma = result[result.length - 1]; 
                const nextRma = (prevRma * (p - 1) + data[i]) / p;
                result.push(nextRma);
            }
            
            return [...Array(p - 1).fill(undefined), ...result];
        };
        
        const smoothedTRs = rma(trs, period);
        const smoothedPlusDMs = rma(plusDMs, period);
        const smoothedMinusDMs = rma(minusDMs, period);

        const dxs = [];
        const plusDIs = [];
        const minusDIs = [];

        
        for (let i = period -1; i < klines.length -1; i++) {
            const smoothedTR = smoothedTRs[i];
            if (smoothedTR === undefined || smoothedTR === 0) {
                dxs.push(dxs.length > 0 ? dxs[dxs.length-1] : 0); 
                plusDIs.push(0);
                minusDIs.push(0);
                continue;
            }
            const plusDI = Math.max(0, (smoothedPlusDMs[i] / smoothedTR) * 100);
            const minusDI = Math.max(0, (smoothedMinusDMs[i] / smoothedTR) * 100);
            plusDIs.push(plusDI);
            minusDIs.push(minusDI);

            const diSum = plusDI + minusDI;
            dxs.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
        }
        
        const adxValues = rma(dxs.filter(v => !isNaN(v)), period);
        const lastADX = adxValues[adxValues.length - 1] || 0;
        const lastPlusDI = plusDIs[plusDIs.length-1] || 0;
        const lastMinusDI = minusDIs[minusDIs.length-1] || 0;
        
        return {
            value: lastADX,
            plusDI: lastPlusDI,
            minusDI: lastMinusDI
        };
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

    function detectMarketRegime_Unified(klinesSnapshot) {
        if (!klinesSnapshot || klinesSnapshot.length < 200) {
            return 'ranging';
        }

        const closes = klinesSnapshot.map(k => parseFloat(k[4]));

        const bbData = calculateBollingerBands(closes); 
        if (bbData.squeezeStatus === 'Squeeze!') {
            return 'lowVolatility';
        }

        const adxData = calculateADX(klinesSnapshot, 14);
        const adxValue = adxData.value;
        
        if (adxValue > 25) { 
            if (adxData.plusDI > adxData.minusDI) {
                return 'bullTrend';
            }
            if (adxData.minusDI > adxData.plusDI) {
                return 'bearTrend';
            }
            return 'trending';
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

    function createTFAlignmentSummary(klines, timeframes, marketType) {
        const summary = {};
        
        let score = 0;
        timeframes.forEach(tf => {
            if (klines[tf] && klines[tf].length >= 50) {
                const closes = klines[tf].map(k => parseFloat(k[4]));
                const ema21 = calculateEMA(closes, 21);
                const ema50 = calculateEMA(closes, 50);
                const lastEma21 = ema21[ema21.length - 1];
                const lastEma50 = ema50[ema50.length - 1];
                summary[tf] = lastEma21 > lastEma50 ? 'UPTREND' : 'DOWNTREND';
            } else {
                summary[tf] = 'N/A';
            }
            if (summary[tf] === 'UPTREND') score++;
            else if (summary[tf] === 'DOWNTREND') score--;
        });
        return { summary, score };
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
    
    function calculateShortConfluenceScore(klinesSnapshot) {
            if (!klinesSnapshot || klinesSnapshot.length < 50) return { score: 0, breakdown: {} };

            const closes = klinesSnapshot.map(k => parseFloat(k[4]));
            let score = 0;
            let triggers = [];
            const rsiValues = calculateRSI(closes, 14);
            const lastRsi = rsiValues[rsiValues.length - 1];
            if (lastRsi > 72) {
                score += 3.5;
                triggers.push('RSI Overbought');
            }
            const macd = calculateMACD(closes);
            if (macd.status === 'Bearish Cross') {
                score += 2.5;
                triggers.push('MACD Cross');
            }
            const candlePattern = findCandlestickPatterns(klinesSnapshot);
            if (candlePattern.bias === 'BEARISH') {
                score += 2.0;
                triggers.push('Candle Pattern');
            }
            const lookbackPeriod = 15;
            const recentKlines = klinesSnapshot.slice(-lookbackPeriod);
            if (recentKlines.length >= 3) {
                let peakIndex = 0;
                for (let i = 1; i < recentKlines.length; i++) {
                    if (parseFloat(recentKlines[i][2]) > parseFloat(recentKlines[peakIndex][2])) peakIndex = i;
                }
                if (peakIndex > 0 && peakIndex < lookbackPeriod - 2) {
                    const triggerCandleArr = recentKlines[peakIndex + 1];
                    if (triggerCandleArr) {
                        const triggerCandle = { Open: parseFloat(triggerCandleArr[1]), Close: parseFloat(triggerCandleArr[4]) };
                        if (triggerCandle.Close < triggerCandle.Open) {
                            score += 3.5;
                            triggers.push('Red Candle After High');
                        }
                    }
                }
            }
            const rsiDivergence = detectRSIDivergence(closes, rsiValues);
            if (rsiDivergence.status === 'BEARISH') {
                score += 4.0;
                triggers.push('RSI Divergence');
            }
            return { score: Math.min(score, 10), triggers: triggers };
        }

    function getConfluenceAnalysis(klines) {
        if (!klines || klines.length < 50) {
            return { skorBullish: 0, skorBearish: 0, detail: 'Not Enough Data' };
        }

        let skorBullish = 0;
        let skorBearish = 0;
        const closes = klines.map(k => parseFloat(k[4]));

        const rsiValues = calculateRSI(closes, settings.timeframe);
        const lastRsi = rsiValues.filter(v => v !== undefined).pop() || 50;
        const macd = calculateMACD(closes);
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

        return { 
            skorBullish: (skorBullish / totalPossibleScore) * 10,
            skorBearish: (skorBearish / totalPossibleScore) * 10,
            detail: `Bull (${skorBullish.toFixed(1)}) vs Bear (${skorBearish.toFixed(1)})`
        };
    }

    async function runBacktestWithGenome(genome, historicalData, initialBalance = 1000) {
        const settings = {
            ...backtester.state.settings,
            ...genome,
            initialBalance: initialBalance,
            riskPerTrade: 0.01 
        };

        const { trades } = await backtester.runSimulation_unifiedContextual(historicalData, settings);

        const metrics = backtester.calculateMetrics(trades, initialBalance);
        const sharpeRatio = calculateSharpeRatio(metrics.equityCurve); 
        return { ...metrics, sharpeRatio }; 
    }

    async function evaluateFitness(population, historicalData, settings, fitnessMetric, isRunning) {
        const evaluatedPopulation = [];
        for (const genome of population) {
            if (!isRunning) break; 


            const metrics = await runBacktestWithGenome(genome, historicalData); 

            let fitnessScore = 0;
            if (metrics.totalTrades === 0) {
                fitnessScore = 0;
            } else if (fitnessMetric === 'Win Rate') {
                fitnessScore = metrics.winRate || 0;
            } else if (fitnessMetric === 'Sharpe Ratio') { 
                fitnessScore = metrics.sharpeRatio > -100 ? metrics.sharpeRatio : -100; 
            } else { 
                fitnessScore = metrics.profitFactor > 0 ? metrics.profitFactor : 0;
                if (fitnessScore === Infinity) fitnessScore = 100;
            }

            evaluatedPopulation.push({ ...genome, fitness: fitnessScore, metrics: metrics });
        }

        return evaluatedPopulation;
    }

//======================================================================================================================================
