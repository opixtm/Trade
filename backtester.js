// ===================================================================================
// BAGIAN 1: DEKLARASI ELEMEN DOM
// ===================================================================================
const backtestSymbolInput = document.getElementById('backtest-symbol-input');
const backtestStartDate = document.getElementById('backtest-start-date');
const backtestEndDate = document.getElementById('backtest-end-date');
const backtestTimeframeSelect = document.getElementById('backtest-timeframe-select');
const backtestInitialBalance = document.getElementById('backtest-initial-balance');
const startBacktestBtn = document.getElementById('start-backtest-btn');
const backtestProgressContainer = document.getElementById('backtest-progress-container');
const backtestStatusText = document.getElementById('backtest-status-text');
const backtestProgressBar = document.getElementById('backtest-progress-bar');
const backtestResultsContainer = document.getElementById('backtest-results-container');
const backtestPnl = document.getElementById('backtest-result-pnl');
const backtestWinrate = document.getElementById('backtest-result-winrate');
const backtestProfitFactor = document.getElementById('backtest-result-profit-factor');
const backtestTotalTrades = document.getElementById('backtest-result-total-trades');
const backtestTradeLogContainer = document.getElementById('backtest-trade-log-container');
const backtestTradeLog = document.getElementById('backtest-trade-log');
const themeToggleBtn = document.getElementById('theme-toggle');
const darkIcon = document.getElementById('theme-toggle-dark-icon');
const lightIcon = document.getElementById('theme-toggle-light-icon');
const backtestLeverageInput = document.getElementById('backtest-leverage-input');
const labRrRatioInput = document.getElementById('lab-rr-ratio');
const labEmaPeriodInput = document.getElementById('lab-ema-period');
const labSwingLookbackInput = document.getElementById('lab-swing-lookback');
const labBiasThresholdInput = document.getElementById('lab-bias-threshold');
const labWeightsContainer = document.getElementById('lab-weights-tuning');

// ===================================================================================
// BAGIAN 2: FUNGSI-FUNGSI PEMBANTU (HELPERS)
// ===================================================================================

function populateWeightsTuningPanel() {
    const weights = userSettings.presets.default.weights;
    labWeightsContainer.innerHTML = '';
    for (const key in weights) {
        const defaultValue = weights[key];
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="block text-xs text-gray-400 capitalize">${key.replace(/([A-Z])/g, ' $1')}</label>
            <input type="number" step="0.1" data-weight-key="${key}" value="${defaultValue}" class="input-primary small-input mt-1">
        `;
        labWeightsContainer.appendChild(div);
    }
}

function saveResultToLogbook(settings, metrics) {
    // 1. Ambil data logbook yang sudah ada dari localStorage
    let logbookData = JSON.parse(localStorage.getItem('backtestLogbook')) || [];

    // 2. Buat entri baru untuk hasil tes saat ini
    const newEntry = {
        id: Date.now(), // ID unik untuk setiap tes
        symbol: settings.symbol,
        timeframe: settings.timeframe,
        pnlPercent: (metrics.totalPnl / settings.initialBalance) * 100,
        winRate: metrics.winRate,
        profitFactor: metrics.profitFactor,
        startDate: new Date(settings.startDate).toLocaleDateString('id-ID'),
        endDate: new Date(settings.endDate).toLocaleDateString('id-ID'),
    };

    // 3. Tambahkan entri baru ke awal array
    logbookData.unshift(newEntry);
    
    // Batasi riwayat hingga 20 entri terakhir agar tidak terlalu berat
    if (logbookData.length > 20) {
        logbookData.pop();
    }

    // 4. Simpan kembali ke localStorage
    localStorage.setItem('backtestLogbook', JSON.stringify(logbookData));
}

function loadAndRenderLogbook() {
    const logbookData = JSON.parse(localStorage.getItem('backtestLogbook')) || [];
    const logbookBody = document.getElementById('logbook-body');
    const logbookContainer = document.getElementById('backtest-logbook-container');

    if (logbookData.length > 0) {
        logbookBody.innerHTML = logbookData.map(entry => `
            <tr class="border-b border-gray-700 hover:bg-gray-800/50">
                <td class="px-4 py-2 font-bold text-white">${entry.symbol}</td>
                <td class="px-4 py-2">${entry.timeframe}</td>
                <td class="px-4 py-2 font-mono ${entry.pnlPercent >= 0 ? 'positive' : 'negative'}">${entry.pnlPercent.toFixed(2)}%</td>
                <td class="px-4 py-2 font-mono">${entry.winRate.toFixed(2)}%</td>
                <td class="px-4 py-2 font-mono">${entry.profitFactor.toFixed(2)}</td>
                <td class="px-4 py-2 text-gray-500">${entry.startDate} - ${entry.endDate}</td>
            </tr>
        `).join('');
        logbookContainer.classList.remove('hidden');
    } else {
        logbookContainer.classList.add('hidden');
    }
}

function clearLogbook() {
    if (confirm("Apakah Anda yakin ingin menghapus seluruh riwayat pengujian?")) {
        localStorage.removeItem('backtestLogbook');
        loadAndRenderLogbook(); // Muat ulang untuk menampilkan keadaan kosong
    }
}

function setButtonState(button, isLoading, text = null) {
    const btnText = button.querySelector('span');
    const btnLoader = button.querySelector('.loader');
    button.disabled = isLoading;
    if (btnText) btnText.classList.toggle('hidden', isLoading);
    if (btnLoader) btnLoader.classList.toggle('hidden', !isLoading);
    if (text && btnText && !isLoading) btnText.textContent = text;
}

function setupToggle(buttonId, contentWrapperId, iconId, startVisible = false) {
    const button = document.getElementById(buttonId);
    const contentWrapper = document.getElementById(contentWrapperId);
    const icon = document.getElementById(iconId);
    if (!button || !contentWrapper || !icon) return;
    contentWrapper.classList.add('collapsible-content');
    const applyState = (isVisible) => {
        if (isVisible) {
            contentWrapper.classList.add('expanded');
            icon.style.transform = 'rotate(0deg)';
        } else {
            contentWrapper.classList.remove('expanded');
            icon.style.transform = 'rotate(-90deg)';
        }
    };
    let isVisible = startVisible;
    applyState(isVisible);
    button.addEventListener('click', () => {
        isVisible = !isVisible;
        applyState(isVisible);
    });
}

async function fetchBinanceKlines(symbol, interval, limit, endTime) {
    const baseUrl = 'https://fapi.binance.com/fapi/v1';
    const params = new URLSearchParams({ symbol, interval, limit, endTime });
    const url = `${baseUrl}/klines?${params.toString()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Binance API returned status ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Gagal mengambil klines dari ${url}:`, error);
        throw error;
    }
}

// ===================================================================================
// BAGIAN 3: PUSTAKA FUNGSI KALKULASI MURNI (VERSI LENGKAP FINAL)
// ===================================================================================

// --- Variabel Pengaturan Global untuk Kalkulator ---
let userSettings = { presets: { 'default': { weights: { ma: 2, rsiDivergence: 2.5, macd: 2, pivot: 2, vwap: 2, ichimoku: 3, candlePattern: 1.5 } }, 'bullTrend': { weights: { ma: 3.0, ichimoku: 3.0, vwap: 2.5, rsiDivergence: 1.0 } }, 'bearTrend': { weights: { ma: 3.0, ichimoku: 3.0, vwap: 2.5, rsiDivergence: 1.0 } }, 'lowVolatility': { weights: { macd: 2.0 } }, 'ranging': { weights: { rsiDivergence: 3.0 } } } };

// --- Indikator Dasar & Helper ---
const calculateEMA = (data, period) => { if (!data || data.length < period) return []; const k = 2 / (period + 1); let emaArray = Array(period - 1).fill(undefined); let sum = 0; for (let i = 0; i < period; i++) sum += data[i]; let currentEma = sum / period; emaArray.push(currentEma); for (let i = period; i < data.length; i++) { currentEma = (data[i] * k) + (currentEma * (1 - k)); emaArray.push(currentEma); } return emaArray; };
const calculateSMA = (data, period) => { if (!data || data.length < period) return []; let sma = Array(period - 1).fill(undefined); for (let i = period - 1; i < data.length; i++) { const slice = data.slice(i - period + 1, i + 1); sma.push(slice.reduce((a, b) => a + b, 0) / period); } return sma; };
const calculateRSI = (closes, period = 14) => { if (!closes || closes.length <= period) return Array(closes?.length || 0).fill(undefined); let gains = [], losses = []; for (let i = 1; i < closes.length; i++) { const diff = closes[i] - closes[i - 1]; gains.push(diff > 0 ? diff : 0); losses.push(diff < 0 ? -diff : 0); } let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period; let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period; if (avgLoss === 0) return Array(closes.length).fill(100); let rsi = [100 - (100 / (1 + (avgGain / avgLoss)))]; for (let i = period; i < gains.length; i++) { avgGain = (avgGain * (period - 1) + gains[i]) / period; avgLoss = (avgLoss * (period - 1) + losses[i]) / period; if (avgLoss === 0) { rsi.push(100); } else { rsi.push(100 - (100 / (1 + (avgGain / avgLoss)))); } } return Array(period).fill(undefined).concat(rsi); };
const calculateADX = (klines, period = 14) => { if (!klines || klines.length < period * 2) return { adx: 'N/A' }; let highs = klines.map(k => parseFloat(k[2])), lows = klines.map(k => parseFloat(k[3])); let trs = [], plusDMs = [], minusDMs = []; for (let i = 1; i < highs.length; i++) { trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - parseFloat(klines[i-1][4])), Math.abs(lows[i] - parseFloat(klines[i-1][4])))); let upMove = highs[i] - highs[i-1], downMove = lows[i-1] - lows[i]; plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0); minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0); } const rma = (data, p) => { let rmaVals = []; if(data.length < p) return []; let sum = 0; for(let i=0; i<p; i++) sum += data[i]; rmaVals.push(sum/p); for(let i=p; i<data.length; i++) rmaVals.push((rmaVals[rmaVals.length-1]*(p-1) + data[i])/p); return rmaVals; }; let smoothedTR = rma(trs, period), smoothedPlusDM = rma(plusDMs, period), smoothedMinusDM = rma(minusDMs, period); let plusDIs = [], minusDIs = [], dxs = []; for (let i = 0; i < smoothedTR.length; i++) { let plusDI = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0; let minusDI = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0; plusDIs.push(plusDI); minusDIs.push(minusDI); dxs.push(plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0); } return { adx: rma(dxs.slice(period-1), period).pop()?.toFixed(2) || 'N/A' }; };
const calculateBollingerBands = (closes, period = 20, stdDev = 2) => { if (closes.length < period) return { upper: [], middle: [], lower: [], width: [] }; const middleSMA = calculateSMA(closes, period); let upper = [], lower = [], width = []; for (let i = period - 1; i < closes.length; i++) { if (middleSMA[i] === undefined) continue; const slice = closes.slice(i - period + 1, i + 1); const sumSquaredDiff = slice.reduce((a, b) => a + Math.pow(b - middleSMA[i], 2), 0); const stdev = Math.sqrt(sumSquaredDiff / period); upper.push(middleSMA[i] + (stdev * stdDev)); lower.push(middleSMA[i] - (stdev * stdDev)); width.push((stdev * stdDev * 2)); } return { upper, middle: middleSMA, lower, width }; };
function calculatePivotPoints(prevDayKline) { if (!prevDayKline || prevDayKline.length < 5) return null; const high = parseFloat(prevDayKline[2]), low = parseFloat(prevDayKline[3]), close = parseFloat(prevDayKline[4]); if (isNaN(high) || isNaN(low) || isNaN(close)) return null; return { P: (high + low + close) / 3 }; };
function calculateVWAP(klines, mode = 'rolling', period = 20) { if (!klines || klines.length === 0) return 0; let sumPV = 0, sumV = 0; const dataSlice = klines.slice(-period); dataSlice.forEach(k => { const high = parseFloat(k[2]), low = parseFloat(k[3]), close = parseFloat(k[4]), vol = parseFloat(k[5]); sumPV += ((high + low + close) / 3) * vol; sumV += vol; }); return sumV > 0 ? sumPV / sumV : 0; };
function calculateIchimokuCloud(klines, tenkanP = 9, kijunP = 26, senkouP = 52) { if (klines.length < senkouP) return { status: 'Netral' }; const getHighLow = (slice) => ({ high: Math.max(...slice.map(k => parseFloat(k[2]))), low: Math.min(...slice.map(k => parseFloat(k[3]))) }); let tenkan = [], kijun = [], senkouA = []; for (let i = 0; i < klines.length; i++) { const tenkanHighLow = i >= tenkanP - 1 ? getHighLow(klines.slice(i - tenkanP + 1, i + 1)) : {}; tenkan.push(tenkanHighLow.high ? (tenkanHighLow.high + tenkanHighLow.low) / 2 : undefined); const kijunHighLow = i >= kijunP - 1 ? getHighLow(klines.slice(i - kijunP + 1, i + 1)) : {}; kijun.push(kijunHighLow.high ? (kijunHighLow.high + kijunHighLow.low) / 2 : undefined); } const lastPrice = parseFloat(klines[klines.length - 1][4]); const lastTenkan = tenkan[tenkan.length - 1], lastKijun = kijun[kijun.length - 1]; if (lastTenkan > lastKijun && lastPrice > lastKijun) return { status: "Bullish" }; if (lastTenkan < lastKijun && lastPrice < lastKijun) return { status: "Bearish" }; return { status: 'Netral' }; };
const findCandlestickPatterns = (klines) => { if (!klines || klines.length < 2) return { bias: 'NETRAL' }; const getCandle = (k) => { const [o,h,l,c] = k.slice(1,5).map(parseFloat); return { open:o, close:c, isGreen: c>o, isRed: c<o }; }; const c1 = getCandle(klines[klines.length - 1]), c2 = getCandle(klines[klines.length - 2]); if (c2.isRed && c1.isGreen && c1.close > c2.open) return { bias: 'BULLISH' }; if (c2.isGreen && c1.isRed && c1.close < c2.open) return { bias: 'BEARISH' }; return { bias: 'NETRAL' }; };

// --- Fungsi-fungsi utama yang sudah Anda miliki ---
function getUltimateSignalScore(indicator, signalData) { const text = (signalData?.status || signalData?.bias || "").toString().toUpperCase(); if (['ma', 'macd', 'pivot', 'vwap', 'ichimoku', 'candlePattern'].includes(indicator)) { if (text.includes('BULL')) return 1; if (text.includes('BEAR')) return -1; } if (indicator === 'rsiDivergence') { if (text.includes('BULL')) return 1; if (text.includes('BEAR')) return -1; } return 0; }
const calculateMACD = (closes, fast = 12, slow = 26, signal = 9) => { if (closes.length < slow + signal) { return { status: 'Netral' }; } const emaFast = calculateEMA(closes, fast); const emaSlow = calculateEMA(closes, slow); const macdLine = emaSlow.map((slowVal, i) => (slowVal !== undefined && emaFast[i] !== undefined) ? emaFast[i] - slowVal : undefined); const signalLine = calculateEMA(macdLine.filter(v => v !== undefined), signal); const lastMacd = macdLine.filter(v => v !== undefined).pop() || 0; const lastSig = signalLine.filter(v => v !== undefined).pop() || 0; const prevMacdLine = macdLine.filter(v => v !== undefined).slice(-2, -1)[0] || 0; const prevSignalLine = signalLine.filter(v => v !== undefined).slice(-2, -1)[0] || 0; let status = 'Netral'; if (prevMacdLine <= prevSignalLine && lastMacd > lastSig) status = 'Bullish Cross'; else if (prevMacdLine >= prevSignalLine && lastMacd < lastSig) status = 'Bearish Cross'; return { status }; };
const detectRSIDivergence = (closes, rsiValues, lookback = 30) => { if (!closes || closes.length < lookback || !rsiValues || rsiValues.length < lookback) return { status: 'NONE' }; const recentCloses = closes.slice(-lookback), recentRSI = rsiValues.slice(-lookback); if (recentCloses.slice(-1)[0] < recentCloses[0] && recentRSI.slice(-1)[0] > recentRSI[0]) return { status: 'BULLISH' }; if (recentCloses.slice(-1)[0] > recentCloses[0] && recentRSI.slice(-1)[0] < recentRSI[0]) return { status: 'BEARISH' }; return { status: 'NONE' }; };
function detectMarketRegime(klines, bbData, adxData) { const closes = klines.map(k => parseFloat(k[4])); const lastPrice = closes[closes.length - 1]; const ema50 = calculateEMA(closes, 50).pop(), ema200 = calculateEMA(closes, 200).pop(); if (bbData && bbData.width && bbData.width.length > 100) { const recentWidths = bbData.width.slice(-100); const currentWidth = recentWidths[recentWidths.length - 1]; const threshold = [...recentWidths].sort((a, b) => a - b)[Math.floor(recentWidths.length * 0.20)]; if (currentWidth < threshold) return 'lowVolatility'; } if (parseFloat(adxData.adx) > 25) { if (lastPrice > ema50 && ema50 > ema200) return 'bullTrend'; if (lastPrice < ema50 && ema50 < ema200) return 'bearTrend'; } return 'ranging'; }
function calculateConfluenceScoreForCandle(klinesSnapshot) { if (klinesSnapshot.length < 200) return { bull: 0, bear: 0 }; const closes = klinesSnapshot.map(k => parseFloat(k[4])); const lastPrice = closes[closes.length - 1]; const rsiValues = calculateRSI(closes); const indicators = { ma: { status: (calculateEMA(closes, 21).pop() > calculateEMA(closes, 50).pop()) ? 'BULLISH' : 'BEARISH' }, rsiDivergence: detectRSIDivergence(closes, rsiValues), macd: calculateMACD(closes), pivot: { status: (lastPrice > calculatePivotPoints(klinesSnapshot[klinesSnapshot.length - 2])?.P) ? 'BULLISH' : 'BEARISH' }, vwap: { status: (lastPrice > calculateVWAP(klinesSnapshot)) ? 'BULLISH' : 'BEARISH' }, ichimoku: calculateIchimokuCloud(klinesSnapshot), candlePattern: findCandlestickPatterns(klinesSnapshot) }; const bbData = calculateBollingerBands(closes); const adxData = calculateADX(klinesSnapshot); const regime = detectMarketRegime(klinesSnapshot, bbData, adxData); const regimeWeights = userSettings.presets[regime]?.weights || {}; const activeWeights = { ...userSettings.presets['default'].weights, ...regimeWeights }; let totalBullScore = 0, totalBearScore = 0, maxPossibleScore = 0; for (const indicator in activeWeights) { if (indicators[indicator]) { const weight = activeWeights[indicator]; const rawScore = getUltimateSignalScore(indicator, indicators[indicator]); const weightedScore = rawScore * weight; if (weightedScore > 0) totalBullScore += weightedScore; if (weightedScore < 0) totalBearScore += Math.abs(weightedScore); maxPossibleScore += Math.abs(weight); } } return { bull: maxPossibleScore > 0 ? (totalBullScore / maxPossibleScore) * 100 : 0, bear: maxPossibleScore > 0 ? (totalBearScore / maxPossibleScore) * 100 : 0 }; }
// ===================================================================================
// BAGIAN 4: OBJEK UTAMA MESIN BACKTESTING
// ===================================================================================
// ===================================================================================
// BAGIAN 4: OBJEK UTAMA MESIN BACKTESTING (GANTI SELURUH BLOK INI)
// ===================================================================================
const backtester = {
    state: { isRunning: false, settings: {}, results: {} },

    async run() {
        if (this.state.isRunning) return;
        this.state.isRunning = true;
        setButtonState(startBacktestBtn, true, "Running...");
        this.resetUI();
        try {
            this.gatherSettings();
            const historicalData = await this.fetchHistoricalData();
            if (historicalData.length < 200) throw new Error("Data historis tidak cukup untuk backtest (min. 200 candle).");
            
            // Memanggil fungsi simulasi, metrik, dan tampilan
            const trades = this.runSimulation(historicalData);
            const metrics = this.calculateMetrics(trades, this.state.settings.initialBalance);
            this.displayResults(metrics);

        } catch (error) {
            console.error("Backtest Gagal:", error);
            backtestStatusText.textContent = `Error: ${error.message}`;
            backtestProgressBar.style.backgroundColor = '#ef4444';
        } finally {
            this.state.isRunning = false;
            setButtonState(startBacktestBtn, false, "▶️ Mulai Simulasi");
        }
    },
    
    resetUI() {
        backtestResultsContainer.classList.add('hidden');
        backtestTradeLogContainer.classList.add('hidden');
        backtestProgressContainer.classList.remove('hidden');
        backtestProgressBar.style.backgroundColor = '#3b82f6';
        backtestStatusText.textContent = "Mempersiapkan simulasi...";
        backtestProgressBar.style.width = "0%";
    },
    
gatherSettings() {
    // Ambil bobot yang sudah di-tuning dari UI
    const tunedWeights = {};
    labWeightsContainer.querySelectorAll('input').forEach(input => {
        tunedWeights[input.dataset.weightKey] = parseFloat(input.value) || 0;
    });

    this.state.settings = {
        // Pengaturan dasar
        symbol: backtestSymbolInput.value.toUpperCase().trim(),
        timeframe: backtestTimeframeSelect.value,
        startDate: new Date(backtestStartDate.value).getTime(),
        endDate: new Date(backtestEndDate.value).getTime(),
        initialBalance: parseFloat(backtestInitialBalance.value),
        leverage: parseInt(backtestLeverageInput.value) || 1,

        // Pengaturan strategi dari Strategy Lab
        riskRewardRatio: parseFloat(labRrRatioInput.value) || 1.5,
        pullbackEmaPeriod: parseInt(labEmaPeriodInput.value) || 9,
        swingLookback: parseInt(labSwingLookbackInput.value) || 15,
        biasThreshold: parseInt(labBiasThresholdInput.value) || 15,
        weights: { ...userSettings.presets.default.weights, ...tunedWeights }
    };

    if (!this.state.settings.symbol || !this.state.settings.startDate || !this.state.settings.endDate) {
        throw new Error("Simbol, Tanggal Mulai, dan Tanggal Selesai harus diisi.");
    }
},

    async fetchHistoricalData() {
        const { symbol, timeframe, startDate, endDate } = this.state.settings;
        const BINANCE_LIMIT = 1000;
        const API_DELAY = 500;
        let allKlines = [];
        let currentEndTime = endDate;
        while (currentEndTime > startDate) {
            backtestStatusText.textContent = `Mengambil data sebelum ${new Date(currentEndTime).toLocaleDateString('id-ID')}...`;
            const fetchedKlines = await fetchBinanceKlines(symbol, timeframe, BINANCE_LIMIT, currentEndTime);
            if (fetchedKlines.length === 0) break;
            allKlines = fetchedKlines.concat(allKlines);
            currentEndTime = fetchedKlines[0][0] - 1;
            const progress = Math.min(100, ((endDate - currentEndTime) / (endDate - startDate)) * 100);
            backtestProgressBar.style.width = `${progress}%`;
            await new Promise(resolve => setTimeout(resolve, API_DELAY));
        }
        return allKlines.filter(k => k[0] >= startDate && k[0] <= endDate);
    },

    // --- INI ADALAH FUNGSI BARU YANG SUDAH DIPERBAIKI ---
runSimulation(historicalData) {
    const { 
        initialBalance, leverage, riskRewardRatio, 
        pullbackEmaPeriod, swingLookback, biasThreshold
    } = this.state.settings; // <-- Ambil semua parameter dari state

    let balance = initialBalance;
    let position = null;
    const trades = [];
    const riskPerTrade = 0.05; // Ini bisa juga dijadikan input di UI nanti

    const entryThreshold = 70, exitThreshold = 65, stopLossPercent = 0.02;

    for (let i = 200; i < historicalData.length; i++) {
        const klinesSnapshot = historicalData.slice(0, i + 1);
        const currentCandle = historicalData[i];
        const currentPrice = parseFloat(currentCandle[4]);
        const score = calculateConfluenceScoreForCandle(klinesSnapshot);

        if (position) {
            let exit = false;
            if (position.type === 'LONG' && (score.bear > exitThreshold || currentPrice < position.entryPrice * (1 - stopLossPercent))) exit = true;
            else if (position.type === 'SHORT' && (score.bull > exitThreshold || currentPrice > position.entryPrice * (1 + stopLossPercent))) exit = true;

            if (exit) {
                // PNL dihitung berdasarkan ukuran posisi yang sudah di-leverage
                const pnl = position.type === 'LONG' ? (currentPrice - position.entryPrice) * position.size : (position.entryPrice - currentPrice) * position.size;
                balance += pnl;
                trades.push({ ...position, exitPrice: currentPrice, pnl, exitDate: new Date(currentCandle[0]) });
                position = null;
                if (balance <= 0) break; // Hentikan jika modal habis
            }
        }

        if (!position) {
            let entryType = null;
            if (score.bull > entryThreshold) entryType = 'LONG';
            else if (score.bear > entryThreshold) entryType = 'SHORT';

            if (entryType) {
                const cost = balance * riskPerTrade; // Modal yang digunakan (margin)
                const positionValue = cost * leverage; // Nilai posisi setelah leverage
                const positionSize = positionValue / currentPrice; // Ukuran posisi dalam unit aset (misal: 0.1 BTC)

                position = { 
                    type: entryType, 
                    entryPrice: currentPrice, 
                    size: positionSize, // size sekarang sudah merefleksikan leverage
                    cost: cost,
                    leverage: leverage,
                    entryDate: new Date(currentCandle[0]) 
                };
            }
        }

        const progress = (i / historicalData.length) * 100;
        backtestProgressBar.style.width = `${progress}%`;
        backtestStatusText.textContent = `Menjalankan simulasi... ${i} / ${historicalData.length} candle`;
    }
    return trades;
},

    calculateMetrics(trades, initialBalance) {
        let totalPnl = 0, grossProfit = 0, grossLoss = 0, wins = 0;
        trades.forEach(trade => {
            totalPnl += trade.pnl;
            if (trade.pnl > 0) { grossProfit += trade.pnl; wins++; } 
            else { grossLoss += Math.abs(trade.pnl); }
        });
        const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
        return { totalPnl, winRate, profitFactor, totalTrades: trades.length, finalBalance: initialBalance + totalPnl, trades };
    },

    displayResults(metrics) {
        backtestPnl.textContent = `${metrics.totalPnl.toFixed(2)} USD (${((metrics.totalPnl / this.state.settings.initialBalance) * 100).toFixed(2)}%)`;
        backtestPnl.className = `font-mono font-bold text-lg ${metrics.totalPnl >= 0 ? 'positive' : 'negative'}`;
        backtestWinrate.textContent = `${metrics.winRate.toFixed(2)}%`;
        backtestProfitFactor.textContent = metrics.profitFactor.toFixed(2);
        backtestTotalTrades.textContent = metrics.totalTrades;
        backtestTradeLog.innerHTML = metrics.trades.map(trade => `
            <div class="p-1.5 rounded-md ${trade.pnl >= 0 ? 'bg-green-900/40' : 'bg-red-900/40'}">
                <div class="flex justify-between items-center font-mono">
                    <span>${trade.type} @ ${trade.entryPrice.toFixed(2)} -> ${trade.exitPrice.toFixed(2)}</span>
                    <span class="${trade.pnl >= 0 ? 'positive' : 'negative'}">${trade.pnl.toFixed(2)}</span>
                </div>
                <div class="text-gray-500 text-[10px]">${trade.entryDate.toLocaleString('id-ID')} -> ${trade.exitDate.toLocaleString('id-ID')}</div>
            </div>`).join('');
        backtestResultsContainer.classList.remove('hidden');
        backtestTradeLogContainer.classList.remove('hidden');
        backtestProgressContainer.classList.add('hidden');
        
        saveResultToLogbook(this.state.settings, metrics);
        loadAndRenderLogbook();
    }
};

// ===================================================================================
// BAGIAN 5: EVENT LISTENER (ENTRY POINT)
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    setupToggle('toggle-backtesting-btn', 'backtesting-content-wrapper', 'toggle-backtesting-icon', true);
    startBacktestBtn.addEventListener('click', () => backtester.run());
    const backtestSymbolInput = document.getElementById('backtest-symbol-input');
    loadAndRenderLogbook(); // Muat logbook saat halaman pertama kali dibuka

    const clearBtn = document.getElementById('clear-logbook-btn');
    if(clearBtn) {
        clearBtn.addEventListener('click', clearLogbook);
    }
    populateWeightsTuningPanel();
    setupToggle('toggle-lab-btn', 'lab-content-wrapper', 'toggle-lab-icon', true);
});