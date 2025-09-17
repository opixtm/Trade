// ===================================================================
// FILE: worker.js (VERSI FINAL - 100% LENGKAP DAN MANDIRI)
// ===================================================================

// === BAGIAN 0: VARIABEL KONFIGURASI YANG DIBUTUHKAN ===
const timeframeParameterMap={_1m:{rsi_period:7,macd_fast:5,macd_slow:13,macd_signal:5,stoch_rsi_period:9,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_3m:{rsi_period:9,macd_fast:5,macd_slow:13,macd_signal:5,stoch_rsi_period:9,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_5m:{rsi_period:9,macd_fast:8,macd_slow:21,macd_signal:9,stoch_rsi_period:14,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_15m:{rsi_period:14,macd_fast:12,macd_slow:26,macd_signal:9,stoch_rsi_period:14,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_1h:{rsi_period:14,macd_fast:12,macd_slow:26,macd_signal:9,stoch_rsi_period:14,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_4h:{rsi_period:21,macd_fast:12,macd_slow:26,macd_signal:9,stoch_rsi_period:21,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3},_1d:{rsi_period:21,macd_fast:21,macd_slow:55,macd_signal:9,stoch_rsi_period:21,stoch_stoch_period:14,stoch_k_smooth:3,stoch_d_smooth:3}};

// === BAGIAN 1: SEMUA FUNGSI PEMBANTU KALKULASI (PERALATAN) ===
const calculateEMA=(data,period)=>{if(!data||data.length<period)return[];const k=2/(period+1);let a=[];if(data.length>0){let e=0;for(let t=0;t<period;t++)e+=data[t]||0;a[period-1]=e/period;for(let t=period;t<data.length;t++)a[t]=data[t]*k+a[t-1]*(1-k)}return a};const calculateSMA=(data,period)=>{if(!data||data.length<period)return[];let a=[],e=0;for(let t=0;t<period;t++)e+=data[t];a.push(e/period);for(let t=period;t<data.length;t++)e=e-data[t-period]+data[t],a.push(e/period);return[...Array(period-1).fill(void 0),...a]};
const calculateRSI=(closes,period)=>{if(!closes||closes.length<=period)return Array(closes.length).fill(void 0);let a=[],e=[];for(let t=1;t<closes.length;t++){const r=closes[t]-closes[t-1];a.push(r>0?r:0),e.push(r<0?-r:0)}let t=Array(period).fill(void 0),r=a.slice(0,period).reduce(((a,e)=>a+e),0)/period,l=e.slice(0,period).reduce(((a,e)=>a+e),0)/period;t[period-1]=0===l?100:100-100/(1+r/l);for(let o=period;o<a.length;o++)r=(r*(period-1)+a[o])/period,l=(l*(period-1)+e[o])/period,t.push(0===l?100:100-100/(1+r/l));return t};
const calculateMACD=(closes,fast,slow,signal)=>{if(closes.length<slow)return{status:"Netral",macdLine:[],signalLine:[],histogram:[]};const a=calculateEMA(closes,fast),e=calculateEMA(closes,slow),t=e.map(((e,t)=>void 0!==e&&void 0!==a[t]?a[t]-e:void 0)).filter((a=>void 0!==a)),r=calculateEMA(t,signal),l=t.map(((a,e)=>{const l=void 0!==r[e]?r[e]:r.length>0?r.pop():void 0;if(void 0!==l){const o=a-l,s=e>0&&void 0!==t[e-1]&&void 0!==r[e-1]?t[e-1]-r[e-1]:0;return{value:o,color:o>=0?o>=s?"#26a69a":"#80cbc4":o<s?"#ef5350":"#e57373"}}return void 0})).filter((a=>void 0!==a));let o="Netral";const s=t.slice(-1)[0]||0,n=r.slice(-1)[0]||0,i=t.slice(-2,-1)[0]||0,c=r.slice(-2,-1)[0]||0;i<=c&&s>n?o="Bullish Cross":i>=c&&s<n&&(o="Bearish Cross");return{status:o,macdLine:t,signalLine:r,histogram:l}};
const findCandlestickPatterns=a=>{if(!a||a.length<2)return{bias:"NETRAL"};const e=a=>{const[e,t,r,l]=a.slice(1,5).map(parseFloat);return{open:e,close:l,isGreen:l>e,isRed:l<e}},t=e(a[a.length-1]),r=e(a[a.length-2]);return r.isRed&&t.isGreen&&t.close>r.open?{bias:"BULLISH"}:r.isGreen&&t.isRed&&t.close<r.open?{bias:"BEARISH"}:{bias:"NETRAL"}};
const detectRSIDivergence=(a,e,t=30)=>{if(!a||a.length<t||!e||e.length<t)return{status:"NONE"};const r=a.slice(-t),l=e.slice(-t),o=(a,e)=>{let t=[];for(let r=1;r<a.length-1;r++)(e&&a[r]>a[r-1]&&a[r]>a[r+1]||!e&&a[r]<a[r-1]&&a[r]<a[r+1])&&t.push({index:r,value:a[r]});return t},s=o(r,!1),n=o(r,!0),i=o(l,!1),c=o(l,!0);if(s.length>=2&&i.length>=2){const a=s[s.length-1],e=s[s.length-2],t=i.find((e=>Math.abs(e.index-a.index)<3)),r=i.find((a=>Math.abs(a.index-e.index)<3));if(a&&e&&t&&r&&a.value<e.value&&t.value>r.value)return{status:"BULLISH"}}if(n.length>=2&&c.length>=2){const a=n[n.length-1],e=n[n.length-2],t=c.find((e=>Math.abs(e.index-a.index)<3)),r=c.find((a=>Math.abs(a.index-e.index)<3));if(a&&e&&t&&r&&a.value>e.value&&t.value<r.value)return{status:"BEARISH"}}return{status:"NONE"}};
const calculateATR=(a,e=14)=>{if(!a||a.length<e+1)return{value:0,status:"N/A",atrPercent:0};let t=[];for(let r=1;r<a.length;r++){const l=parseFloat(a[r][2]),o=parseFloat(a[r][3]),s=parseFloat(a[r-1][4]);t.push(Math.max(l-o,Math.abs(l-s),Math.abs(o-s)))}const r=a=>{let t=[],r=0;for(let l=0;l<a.length;l++)l<e?(r+=a[l],l===e-1?t.push(r/e):t.push(void 0)):void 0!==t[l-1]&&t.push((t[l-1]*(e-1)+a[l])/e);return t},l=r(t),o=l.pop()||0,s=parseFloat(a[a.length-1][4]),n=s>0?o/s*100:0;let i;return i=n>5?"Very High":n>2.5?"High":n<1?"Low":"Normal",{value:o,status:i,atrPercent:n}};
const detectMarketRegime_Unified=a=>{if(!a||a.length<200)return"ranging";const e=a.map((a=>parseFloat(a[4]))),t=e[e.length-1],r=calculateBollingerBands(e);if("Squeeze!"===r.squeezeStatus)return"lowVolatility";const l=calculateADX(a,14),o=l.value;if(o>25){const a=calculateEMA(e,50).pop(),r=calculateEMA(e,200).pop();if(t>a&&a>r)return"bullTrend";if(t<a&&a<r)return"bearTrend"}return"ranging"};
const calculateADX=(a,e=14)=>{if(!a||a.length<2*e)return{value:0,plusDI:0,minusDI:0};let t=a.map((a=>parseFloat(a[2]))),r=a.map((a=>parseFloat(a[3]))),l=a.map((a=>parseFloat(a[4])));let o=[],s=[],n=[];for(let i=1;i<t.length;i++){o.push(Math.max(t[i]-r[i],Math.abs(t[i]-l[i-1]),Math.abs(r[i]-l[i-1])));let a=t[i]-t[i-1],c=r[i-1]-r[i];s.push(a>c&&a>0?a:0),n.push(c>a&&c>0?c:0)}const i=a=>{let t=[],r=0;for(let l=0;l<a.length;l++)l<e?(r+=a[l],t.push(l===e-1?r/e:void 0)):void 0!==t[l-1]&&t.push((t[l-1]*(e-1)+a[l])/e);return t};let c=i(o,e),d=i(s,e),u=i(n,e);let g=[],h=[],p=[];for(let m=0;m<c.length;m++){if(void 0===c[m])continue;let a=c[m]>0?d[m]/c[m]*100:0,t=c[m]>0?u[m]/c[m]*100:0;g.push(a),h.push(t);let r=a+t;p.push(r>0?Math.abs(a-t)/r*100:0)}let f=i(p,e);return{value:f.filter((a=>void 0!==a)).pop()||0,plusDI:g.pop()||0,minusDI:h.pop()||0}};
const calculateBollingerBands=(a,e=20,t=2)=>{if(a.length<e)return{upper:[],middle:[],lower:[],squeezeStatus:"N/A"};const r=calculateSMA(a,e),l=[],o=[],s=[];let n=0,i=0;const c=a.slice(0,e);for(const u of c)n+=u,i+=u*u;const d=a=>{const n=a/e,i=e-n*n,c=Math.sqrt(Math.max(0,i));l.push(n+c*t),o.push(n-c*t),s.push(2*c*t)};d(n,i);for(let u=e;u<a.length;u++){const e=a[u-e],t=a[u];n=n-e+t,i=i-e*e+t*t,d(n,i)}let g="Normal";const h=a=>[...Array(e-1).fill(void 0),...a];return{upper:h(l),middle:r,lower:h(o),squeezeStatus:g}};
function getConfluenceAnalysis(klines, timeframe) { // Ditambahkan parameter timeframe
    if (!klines || klines.length < 50) return { skorBullish: 0, skorBearish: 0 };
    let skorBullish = 0, skorBearish = 0;
    const closes = klines.map(k => parseFloat(k[4]));
    const rsiValues = calculateRSI(closes, timeframeParameterMap[timeframe].rsi_period);
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

// === BAGIAN 2: LOGIKA INTI BACKTESTING ===
function calculateMetrics(trades, initialBalance) {
    if (trades.length === 0) return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, finalBalance: initialBalance, maxDrawdown: 0, expectancy: 0, maxLosingStreak: 0 };
    let totalPnl = 0, grossProfit = 0, grossLoss = 0, wins = 0;
    trades.forEach(trade => {
        totalPnl += trade.pnl;
        if (trade.pnl > 0) { wins++; grossProfit += trade.pnl; } else { grossLoss += Math.abs(trade.pnl); }
    });
    const winRate = (trades.length > 0) ? (wins / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    return { totalPnl, winRate, profitFactor, totalTrades: trades.length };
}

// === BAGIAN 3: FUNGSI UTAMA PEKERJAAN ===
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
        const score = getConfluenceAnalysis(klinesSnapshot, timeframe); // Pass timeframe
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
                const netPnl = rawPnl - ((position.entryPrice * position.size * settings.takerFee) + (exitPrice * position.size * settings.makerFee));
                balance += netPnl;
                trades.push({ ...position, exitPrice, pnl: netPnl, reason: exitReason });
                position = null;
                if (balance <= 0) break;
            }
        }

        if (!position) {
            const klinesSnapshot = historicalData.slice(0, i + 1);
            const currentRegime = detectMarketRegime_Unified(klinesSnapshot);
            let entrySignal = false, detectedBias = 'NETRAL', entryPrice = 0;
            
            if (currentRegime === 'bullTrend' || currentRegime === 'bearTrend') {
                const bias = (cacheEntry.bullScore > cacheEntry.bearScore + settings.biasThreshold) ? 'LONG' : (cacheEntry.bearScore > cacheEntry.bullScore + settings.biasThreshold) ? 'SHORT' : 'NETRAL';
                if(bias !== 'NETRAL') {
                    const closes = klinesSnapshot.map(k => parseFloat(k[4]));
                    const emaEntry = calculateEMA(closes, settings.pullbackEmaPeriod).pop();
                    if (emaEntry && currentLow <= emaEntry && currentHigh >= emaEntry) {
                        entrySignal = true; detectedBias = bias; entryPrice = emaEntry;
                    }
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
                    takeProfit = entryPrice - (Math.abs(stopLoss - entryPrice) * settings.riskRewardRatio);
                }
                const cost = balance * settings.riskPerTrade;
                const sizeInAsset = (cost * settings.leverage) / entryPrice;
                position = { type: detectedBias, entryPrice, cost, size: sizeInAsset, sl: stopLoss, tp: takeProfit };
            }
        }
    }

    const metrics = calculateMetrics(trades, settings.initialBalance);
    return metrics;
}

// === BAGIAN 4: "TELINGA" KARYAWAN ===
self.onmessage = async function(e) {
    const { genome, historicalData, timeframe, fitnessMetric } = e.data;
    try {
        const metrics = await runBacktestWithGenome(genome, historicalData, timeframe);
        let fitnessScore = 0;
        if (fitnessMetric === 'Win Rate') {
            fitnessScore = metrics.winRate || 0;
        } else { // Default to Profit Factor
            fitnessScore = metrics.profitFactor > 0 ? metrics.profitFactor : 0;
            if (fitnessScore === Infinity) fitnessScore = 100; // Cap Infinity for sorting
        }
        self.postMessage({ ...genome, fitness: fitnessScore, metrics: metrics });
    } catch (error) {
        console.error('Error inside worker:', error);
        // Mengirim kembali pesan error agar bisa ditangani di main thread
        self.postMessage({ error: error.message, genome });
    }
};