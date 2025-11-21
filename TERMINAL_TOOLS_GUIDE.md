# 🖥️ TERMINAL TOOLS - COMPLETE GUIDE

**No browser needed! Pure terminal trading tools.** 🚀

---

## 📦 Tools Available

### 1. **terminal-monitor.js** - Price Monitor
Monitor single symbol with real-time updates

### 2. **terminal-scanner.js** - Pump/Dip Hunter
Scan 100 symbols for opportunities

---

## 🎯 TERMINAL MONITOR

### Quick Start
```bash
# Default: BTCUSDT 5m futures
node terminal-monitor.js

# Custom symbol
node terminal-monitor.js ETHUSDT 15m futures

# Spot market
node terminal-monitor.js BTCUSDT 1h spot
```

### Display
```
╔════════════════════════════════════════════════════════════════╗
║              🚀 TRADING TERMINAL MONITOR 🚀                   ║
╚════════════════════════════════════════════════════════════════╝

📊 SYMBOL: BTCUSDT
⏱️  TIMEFRAME: 5m
🔄 MARKET: FUTURES

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICE:      $43,250.50
📈 24H CHANGE: ▲ 2.35%
📊 24H HIGH:   $43,500.00
📉 24H LOW:    $42,100.00
💎 24H VOLUME: 15,234.50M
🕐 CANDLES:    42

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Features
- ✅ Real-time WebSocket updates
- ✅ 24hr stats (auto-refresh every 60s)
- ✅ Color-coded (green/red)
- ✅ Auto-reconnect on disconnect
- ✅ Low CPU usage
- ✅ Clean display

---

## 🔍 TERMINAL SCANNER

### Quick Start

**Pump Hunter (find pumping coins):**
```bash
# Default: 4h futures, top 20
node terminal-scanner.js pump

# Custom: 1h futures, top 30
node terminal-scanner.js pump 1h futures 30
```

**Dip Hunter (find LONG opportunities):**
```bash
# Default: 4h futures, top 20
node terminal-scanner.js dip

# Custom: 1d futures, top 50
node terminal-scanner.js dip 1d futures 50
```

### Display
```
╔════════════════════════════════════════════════════════════════╗
║         💎 DIP HUNTER - TERMINAL SCANNER 💎              ║
╚════════════════════════════════════════════════════════════════╝

🎯 SCAN TYPE:   DIP
⏱️  TIMEFRAME:  4h
🔄 MARKET:     FUTURES
📊 TOP RESULTS: 20

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 TOP 20 RESULTS:

  #  SYMBOL      PRICE CHG   SCORE   RSI     VOL RATIO
─────────────────────────────────────────────────────────────────
  1  ETHUSDT     -8.45%      18      28.3    3.21x  ← BEST!
  2  SOLUSDT     -6.23%      16      32.1    2.87x
  3  ADAUSDT     -5.87%      15      35.4    2.45x
  4  BNBUSDT     -4.56%      14      37.2    2.12x
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scan #1 completed at 5:20:39 PM
Found 97 results from 100 symbols
Next scan in 120s
```

### Features
- ✅ Scan 100 symbols automatically
- ✅ Auto-scan every 2 minutes
- ✅ Scoring system (rank by opportunity)
- ✅ Color-coded results
- ✅ Rate-limited (100ms delay)
- ✅ Progress updates
- ✅ Multi-timeframe support
- ✅ Futures & Spot markets

---

## 📊 SCORING LOGIC

### Pump Hunter (find SHORT opportunities)
```
Score calculation (max ~15 points):
- Price > EMA8: +2
- Price > EMA21: +2
- EMA8 > EMA21: +2
- RSI 50-70: +2
- Volume ratio > 1.5x: +2
- Price change bonus: +0 to 5

Minimum score: 5 (filters weak signals)
```

### Dip Hunter (find LONG opportunities)
```
Score calculation (max ~15 points):
- Price < EMA8: +2
- Price < EMA21: +2
- EMA8 < EMA21: +2
- RSI < 40: +2
- Volume ratio > 1.5x: +2
- Price change bonus: +0 to 5

Minimum score: 5 (filters weak signals)
```

**Higher score = Better opportunity!**

---

## 🎮 USAGE EXAMPLES

### Monitor Single Symbol
```bash
# Monitor BTCUSDT
node terminal-monitor.js BTCUSDT 5m futures

# Monitor ETHUSDT on spot
node terminal-monitor.js ETHUSDT 1h spot
```

### Scan for Opportunities
```bash
# Find pumping coins (SHORT candidates)
node terminal-scanner.js pump 4h futures

# Find dips (LONG candidates)
node terminal-scanner.js dip 4h futures

# Show top 50 results
node terminal-scanner.js dip 1h futures 50
```

### Pro Setup: 2 Terminals
**Terminal 1 - Scanner:**
```bash
node terminal-scanner.js dip 4h futures
```

**Terminal 2 - Monitor:**
```bash
# Copy top result from scanner
node terminal-monitor.js ETHUSDT 4h futures
```

**Workflow:**
1. Scanner finds opportunities
2. Copy top result symbol
3. Monitor detail in terminal 2
4. Make trading decision!

---

## ⚙️ CUSTOMIZATION

### Change Scan Interval
Edit `terminal-scanner.js` line 18:
```javascript
// Default: 2 minutes (120000ms)
scanInterval: 120000

// Change to 5 minutes:
scanInterval: 300000
```

### Change Number of Symbols
Edit `terminal-scanner.js` line 123:
```javascript
// Default: 100 symbols
.slice(0, 100);

// Change to 200:
.slice(0, 200);
```

### Change Rate Limit
Edit `terminal-scanner.js` line 252:
```javascript
// Default: 100ms
await new Promise(resolve => setTimeout(resolve, 100));

// Change to 200ms (safer):
await new Promise(resolve => setTimeout(resolve, 200));
```

---

## 🔒 RATE LIMIT SAFETY

### Terminal Scanner
- **Delay:** 100ms between requests
- **Symbols:** 100
- **Scan duration:** ~10 seconds
- **Interval:** 120 seconds (2 minutes)
- **Usage:** 10 req/sec

### Binance Limits
- **Futures:** 2400 req/min = 40 req/sec
- **Spot:** 1200 req/min = 20 req/sec

**Terminal scanner uses only 10 req/sec = 25% of limit**

**✅ SUPER SAFE!**

---

## 💡 PRO TIPS

### 1. Run in Background
```bash
# Run scanner in background
node terminal-scanner.js dip 4h futures > scan.log 2>&1 &

# Check process
ps aux | grep terminal-scanner

# Stop
pkill -f terminal-scanner
```

### 2. Multiple Timeframes
```bash
# Terminal 1: 1h scan
node terminal-scanner.js dip 1h futures

# Terminal 2: 4h scan
node terminal-scanner.js dip 4h futures

# Terminal 3: 1d scan
node terminal-scanner.js dip 1d futures
```

### 3. Combine with Browser
- Use terminal scanner for quick scans
- Use index.html for detailed analysis
- Best of both worlds!

---

## 🐛 TROUBLESHOOTING

### Problem: "Cannot find module 'ws'"
**Solution:**
```bash
npm install ws
```

### Problem: "No symbols loaded"
**Solution:** Check internet connection, try again

### Problem: "WebSocket error"
**Solution:** 
- Check internet
- Try spot market: `node terminal-scanner.js dip 4h spot`

### Problem: "High CPU usage"
**Solution:**
- Increase scan interval (edit line 18)
- Reduce number of symbols (edit line 123)
- Increase rate limit delay (edit line 252)

---

## 📈 COMPARISON: Terminal vs Browser

| Feature | Terminal Tools | Browser (index.html) |
|---------|---------------|---------------------|
| **CPU Usage** | Low (~5%) | High (~20-40%) |
| **Memory** | ~50 MB | ~200-500 MB |
| **Browser needed** | ❌ No | ✅ Yes |
| **Server needed** | ❌ No | ✅ Yes |
| **Complexity** | Simple | Complex |
| **Funding rate** | ❌ No | ✅ Yes |
| **BB Squeeze** | ❌ No | ✅ Yes |
| **Rate limiting** | ✅ Better | ⚠️ Less safe |
| **Speed** | ✅ Faster | Slower |

**Use terminal for:** Quick scans, low CPU, 24/7 monitoring
**Use browser for:** Detailed analysis, funding rate, BB squeeze

---

## ✅ VERIFICATION

### Test Monitor
```bash
node terminal-monitor.js BTCUSDT 5m futures
```
**Expected:** Real-time price updates, 24hr stats

### Test Scanner
```bash
node terminal-scanner.js dip 4h futures
```
**Expected:** Scan 100 symbols, show top 20 results

### Test Auto-scan
```bash
node terminal-scanner.js pump 4h futures
```
**Expected:** Scan completes, waits 2 minutes, scans again

---

## 🎉 SUCCESS CRITERIA

**Tools working if:**
1. ✅ Monitor shows real-time price updates
2. ✅ Scanner completes scan in ~10 seconds
3. ✅ Results ranked by score (highest first)
4. ✅ Auto-scan works every 2 minutes
5. ✅ No errors in console
6. ✅ CPU usage stays low

---

**Created:** 2025-11-21 17:24 WIB  
**Version:** 1.1  
**Status:** ✅ READY TO USE

**Happy hunting, brur! 🚀**
