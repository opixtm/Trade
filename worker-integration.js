// ============================================
// WEB WORKER INTEGRATION
// Add this code to index.html after the existing script tag
// ============================================

// Worker instances
let workerManager = null;
let scannerWorker = null;

// Worker state
let workerState = {
    managerReady: false,
    scannerReady: false,
    lastHeartbeat: 0,
    watchdogInterval: null,
    isMonitoring: false  // Track if monitoring is active
};

// ============================================
// WORKER INITIALIZATION
// ============================================

function initializeWorkers() {
    // Initialize Worker Manager
    try {
        workerManager = new Worker('worker-manager.js');

        workerManager.onmessage = handleWorkerManagerMessage;

        workerManager.onerror = (error) => {
            console.error('Worker Manager Error:', error);
            // Auto-restart after 5 seconds
            setTimeout(() => {
                if (!workerState.managerReady) {
                    initializeWorkers();
                }
            }, 5000);
        };

        console.log('✅ Worker Manager initialized');
    } catch (error) {
        console.error('Failed to initialize Worker Manager:', error);
    }

    // Initialize Scanner Worker
    try {
        scannerWorker = new Worker('scanner-worker.js');

        scannerWorker.onmessage = handleScannerWorkerMessage;

        scannerWorker.onerror = (error) => {
            console.error('Scanner Worker Error:', error);
        };

        console.log('✅ Scanner Worker initialized');
    } catch (error) {
        console.error('Failed to initialize Scanner Worker:', error);
    }

    // Start watchdog timer
    startWatchdog();
}

// ============================================
// WORKER MANAGER MESSAGE HANDLER
// ============================================

function handleWorkerManagerMessage(e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'WORKER_READY':
            workerState.managerReady = true;
            console.log('🚀 Worker Manager ready');
            break;

        case 'INITIALIZED':
            console.log('Worker initialized:', payload);
            break;

        case 'PRICE_UPDATE':
            updatePriceDisplay(payload);
            break;

        case 'KLINE_UPDATE':
            handleKlineUpdate(payload);
            break;

        case 'INDICATORS_CALCULATED':
            updateIndicatorsDisplay(payload);
            break;

        case 'HISTORICAL_DATA_LOADED':
            console.log(`Historical data loaded: ${payload.count} candles`);
            break;

        case '24HR_STATS':
            update24hrStats(payload);
            break;

        case 'WEBSOCKET_CONNECTED':
            console.log('✅ WebSocket connected:', payload);
            updateConnectionStatus(true);
            break;

        case 'WEBSOCKET_DISCONNECTED':
            console.log('⚠️ WebSocket disconnected');
            updateConnectionStatus(false);
            break;

        case 'HEARTBEAT':
            workerState.lastHeartbeat = Date.now();
            break;

        case 'REALTIME_STARTED':
            workerState.isMonitoring = true;
            console.log('✅ Real-time monitoring started');
            break;

        case 'REALTIME_STOPPED':
            workerState.isMonitoring = false;
            console.log('⏹️ Real-time monitoring stopped');
            break;

        case 'ERROR':
            console.error('Worker error:', payload.error, payload.context);
            break;

        default:
            console.log('Unknown message type from worker:', type);
    }
}

// ============================================
// SCANNER WORKER MESSAGE HANDLER
// ============================================

function handleScannerWorkerMessage(e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'WORKER_READY':
            workerState.scannerReady = true;
            console.log('🚀 Scanner Worker ready');
            break;

        case 'SYMBOLS_LOADED':
            console.log(`Symbols loaded: ${payload.count}`);
            break;

        case 'SCAN_STARTED':
            console.log(`Scan started: ${payload.scanType} on ${payload.timeframe}`);
            updateScannerStatus('scanning');
            break;

        case 'SCAN_PROGRESS':
            updateScanProgress(payload);
            break;

        case 'SCAN_COMPLETE':
            console.log(`Scan complete: ${payload.totalFound} results from ${payload.totalScanned} symbols`);
            displayScanResults(payload);
            updateScannerStatus('idle');
            break;

        case 'SCANNER_STARTED':
            console.log(`Scanner started: ${payload.scanType}`);
            break;

        case 'SCANNER_STOPPED':
            console.log('Scanner stopped');
            updateScannerStatus('stopped');
            break;

        case 'ERROR':
            console.error('Scanner error:', payload.error, payload.context);
            break;

        default:
            console.log('Unknown message type from scanner:', type);
    }
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

function updatePriceDisplay(data) {
    const navPrice = document.getElementById('nav-price');
    if (navPrice) {
        navPrice.textContent = `$${data.price.toFixed(2)}`;
    }
}

function handleKlineUpdate(data) {
    // Update charts if visible
    if (typeof updateChartWithNewKline === 'function') {
        updateChartWithNewKline(data.kline);
    }

    // Update indicators
    if (data.calculatedData) {
        updateIndicatorsDisplay(data.calculatedData);
    }
}

function updateIndicatorsDisplay(data) {
    // Update RSI
    const rsiValue = document.getElementById('rsi-value');
    if (rsiValue && data.rsi) {
        rsiValue.textContent = data.rsi.toFixed(2);
    }

    // Update MACD
    const macdStatus = document.getElementById('macd-status');
    if (macdStatus && data.macd) {
        macdStatus.textContent = data.macd.status;
        macdStatus.className = `font-mono font-semibold ${data.macd.class}`;
    }

    // Update EMAs in nav
    // You can add more UI updates here based on your needs
}

function update24hrStats(data) {
    const navChange24h = document.getElementById('nav-change-24h');
    const navVolume24h = document.getElementById('nav-volume-24h');

    if (navChange24h) {
        const changeClass = data.priceChangePercent >= 0 ? 'positive' : 'negative';
        navChange24h.textContent = `24h: ${data.priceChangePercent >= 0 ? '+' : ''}${data.priceChangePercent.toFixed(2)}%`;
        navChange24h.className = `font-semibold ${changeClass}`;
    }

    if (navVolume24h) {
        navVolume24h.textContent = `${(data.volume / 1000000).toFixed(2)}M`;
    }
}

function updateConnectionStatus(isConnected) {
    // Update UI to show connection status
    const statusIndicator = document.getElementById('trading-mode-status');
    if (statusIndicator) {
        if (isConnected) {
            statusIndicator.textContent = '🟢 LIVE';
            statusIndicator.className = 'absolute left-1/2 -translate-x-1/2 px-3 py-1 text-base rounded-full font-bold transition-all duration-300 bg-green-500 text-white';
        } else {
            statusIndicator.textContent = '🔴 DISCONNECTED';
            statusIndicator.className = 'absolute left-1/2 -translate-x-1/2 px-3 py-1 text-base rounded-full font-bold transition-all duration-300 bg-red-500 text-white';
        }
    }
}

function updateScannerStatus(status) {
    // Update scanner UI based on status
    const scannerIndicator = document.getElementById('scanner-status');
    if (scannerIndicator) {
        scannerIndicator.textContent = status.toUpperCase();
    }
}

function updateScanProgress(data) {
    const progress = (data.scanned / data.total) * 100;
    console.log(`Scan progress: ${progress.toFixed(0)}% (${data.found} found)`);

    // Update progress bar if exists
    const progressBar = document.getElementById('scan-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
}

function displayScanResults(data) {
    const listId = data.scanType === 'pump' ? 'pump-hunter-list' : 'dip-hunter-list';
    const list = document.getElementById(listId);

    if (!list) return;

    if (data.results.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">No results found</div>';
        return;
    }

    list.innerHTML = data.results.map(result => `
        <div class="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition cursor-pointer" 
             onclick="selectSymbol('${result.symbol}')">
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-white">${result.symbol}</span>
                <span class="text-sm ${parseFloat(result.priceChange) >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${result.priceChange}%
                </span>
            </div>
            <div class="flex justify-between text-xs text-gray-400">
                <span>Score: ${result.score}</span>
                <span>Vol: ${result.volumeRatio}x</span>
                <span>RSI: ${result.rsi}</span>
            </div>
            <div class="mt-2 text-xs text-gray-500">
                <div class="flex gap-2 flex-wrap">
                    <span>8: ${result.ema8?.toFixed(2)}</span>
                    <span>21: ${result.ema21?.toFixed(2)}</span>
                    <span>55: ${result.ema55?.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================
// WORKER CONTROL FUNCTIONS
// ============================================

function startRealtimeMonitoring(symbol, timeframe, marketType = 'futures') {
    if (!workerManager) {
        console.error('Worker Manager not initialized');
        return;
    }

    // Initialize worker with settings
    workerManager.postMessage({
        type: 'INIT',
        payload: {
            symbol,
            timeframe,
            marketType,
            settings: userSettings?.active?.indicatorParams || {}
        }
    });

    // Start real-time monitoring
    workerManager.postMessage({
        type: 'START_REALTIME',
        payload: {}
    });
}

function stopRealtimeMonitoring() {
    if (!workerManager) return;

    workerManager.postMessage({
        type: 'STOP_REALTIME',
        payload: {}
    });
}

function changeSymbol(symbol, timeframe) {
    if (!workerManager) return;

    workerManager.postMessage({
        type: 'CHANGE_SYMBOL',
        payload: { symbol, timeframe }
    });
}

function updateWorkerSettings(settings) {
    if (!workerManager) return;

    workerManager.postMessage({
        type: 'UPDATE_SETTINGS',
        payload: { settings }
    });
}

function startScanner(scanType, timeframe = '4h', marketType = 'futures') {
    if (!scannerWorker) {
        console.error('Scanner Worker not initialized');
        return;
    }

    scannerWorker.postMessage({
        type: 'START_SCANNER',
        payload: { scanType, timeframe, marketType }
    });
}

function stopScanner() {
    if (!scannerWorker) return;

    scannerWorker.postMessage({
        type: 'STOP_SCANNER',
        payload: {}
    });
}

function scanNow() {
    if (!scannerWorker) return;

    scannerWorker.postMessage({
        type: 'SCAN_NOW',
        payload: {}
    });
}

// ============================================
// WATCHDOG TIMER
// ============================================

function startWatchdog() {
    if (workerState.watchdogInterval) {
        clearInterval(workerState.watchdogInterval);
    }

    workerState.watchdogInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastHeartbeat = now - workerState.lastHeartbeat;

        // Only check heartbeat if monitoring is active
        if (workerState.isMonitoring && workerState.managerReady && timeSinceLastHeartbeat > 30000) {
            console.warn('⚠️ Worker heartbeat timeout, restarting...');
            restartWorkerManager();
        }
    }, 10000); // Check every 10 seconds
}

function restartWorkerManager() {
    if (workerManager) {
        workerManager.terminate();
    }
    workerState.managerReady = false;
    initializeWorkers();
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    if (workerManager) {
        workerManager.terminate();
    }
    if (scannerWorker) {
        scannerWorker.terminate();
    }
    if (workerState.watchdogInterval) {
        clearInterval(workerState.watchdogInterval);
    }
});

// ============================================
// AUTO-INITIALIZE ON LOAD
// ============================================

// Initialize workers when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWorkers);
} else {
    initializeWorkers();
}

console.log('🚀 Web Worker integration loaded');
