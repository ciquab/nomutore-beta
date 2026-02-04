import { APP } from '../constants.js';

// ■ 1. イベントバス (Pub/Sub) の定義
// ---------------------------------------------------------
export const EventBus = {
    listeners: {},
    /**
     * イベントを購読する
     * @param {string} event - イベント名 ('stateChange' など)
     * @param {function} callback - コールバック関数
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },
    /**
     * イベントを発火する
     * @param {string} event 
     * @param {any} data 
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
};

// ■ 2. 内部状態 (直接アクセス禁止)
// ---------------------------------------------------------
const _state = { 
    beerMode: localStorage.getItem('nomutore_home_beer_mode') || 'mode1', 
    chart: null, 
    timerId: null,
    chartRange: '1w',
    orbViewMode: 'cans', // 'cans' | 'kcal'
    isEditMode: false,
    heatmapOffset: 0,
    logLimit: 50,
    isLoadingLogs: false,
    cellarViewMode: 'logs',
    selectedDate: null
};

// ■ 3. StateManager (Getter/Setter with Notification)
// ---------------------------------------------------------
export const StateManager = {
    // --- Getters (変更なし) ---
    get beerMode() { return _state.beerMode; },
    get chart() { return _state.chart; },
    get timerId() { return _state.timerId; },
    get chartRange() { return _state.chartRange; },
    get orbViewMode() { return _state.orbViewMode; },
    get isEditMode() { return _state.isEditMode; },
    get heatmapOffset() { return _state.heatmapOffset; },
    get logLimit() { return _state.logLimit; },
    get isLoadingLogs() { return _state.isLoadingLogs; },
    get cellarViewMode() { return _state.cellarViewMode; },
    get selectedDate() { return _state.selectedDate; },

    // --- Internal Helper: 変更通知と自動UI更新 ---
    _notify(key) {
        const value = _state[key];
        
        // 1. イベントバスに通知 (購読者がいれば反応する)
        EventBus.emit('stateChange', { key, value });
        
        // 2. 重要な変更に対して自動でUI更新をトリガーする
        //    (これにより、各所での `document.dispatchEvent` や `refreshUI` 呼び出しを削減できます)
        const AUTO_REFRESH_KEYS = ['beerMode', 'chartRange', 'selectedDate', 'heatmapOffset'];
        
        if (window.UI && window.UI.refreshUI && AUTO_REFRESH_KEYS.includes(key)) {
            console.log(`[State] Auto-refreshing UI due to change in: ${key}`);
            window.UI.refreshUI();
        }
    },

    // --- Setters (すべてラップ済み) ---

    setBeerMode: (v) => { 
        if (_state.beerMode === v) return; // 値が変わらなければ何もしない
        _state.beerMode = v; 
        localStorage.setItem('nomutore_home_beer_mode', v);
        StateManager._notify('beerMode');
    },

    setChart: (v) => { 
        // チャートだけは古いインスタンスの破棄が必要
        if (_state.chart && _state.chart !== v) {
            _state.chart.destroy();
        }
        _state.chart = v; 
        // チャート更新はUIリフレッシュを伴わないことが多いので、あえてnotifyしないか、
        // 必要なら 'chart' を監視対象に加える
    },

    setTimerId: (v) => { 
        _state.timerId = v;
        StateManager._notify('timerId');
    },

    setChartRange: (v) => { 
        if (_state.chartRange === v) return;
        _state.chartRange = v; 
        StateManager._notify('chartRange');
    },

    setOrbViewMode: (v) => { 
        if (_state.orbViewMode === v) return;
        _state.orbViewMode = v; 
        StateManager._notify('orbViewMode'); 
        // Orbモード変更は部分的な更新で済む場合が多いが、
        // 迷ったら EventBus.on('stateChange', ...) 側で dom.js がハンドリングすると綺麗
    },

    setIsEditMode: (v) => { 
        if (_state.isEditMode === v) return;
        _state.isEditMode = v; 
        StateManager._notify('isEditMode');
    },

    setHeatmapOffset: (v) => { 
        if (_state.heatmapOffset === v) return;
        _state.heatmapOffset = v; 
        StateManager._notify('heatmapOffset');
    },

    setLogLimit: (v) => { 
        if (_state.logLimit === v) return;
        _state.logLimit = v; 
        StateManager._notify('logLimit');
    },

    setIsLoadingLogs: (v) => { 
        if (_state.isLoadingLogs === v) return;
        _state.isLoadingLogs = v; 
        StateManager._notify('isLoadingLogs');
    },

    setCellarViewMode: (v) => { 
        if (_state.cellarViewMode === v) return;
        _state.cellarViewMode = v; 
        StateManager._notify('cellarViewMode');
    },

    setSelectedDate: (v) => {
        if (_state.selectedDate === v) return;
        _state.selectedDate = v;
        StateManager._notify('selectedDate');
    }
};

