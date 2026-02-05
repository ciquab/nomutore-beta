import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { Store, ExternalApp, db } from './store.js'; 
import { Calc } from './logic.js';
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal } from './ui/index.js';
import { Service } from './service.js';
import { Timer } from './ui/timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import { handleSaveSettings } from './ui/modal.js'; 
import { CloudManager } from './cloudManager.js';
import { Onboarding } from './ui/onboarding.js';
import { initActionRouter } from './ui/actionRouter.js'; 

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// HTMLからonclickで呼ぶためにwindowオブジェクトに登録
window.UI = UI;
window.DataManager = DataManager;
window.Onboarding = Onboarding;

// ★追加: Timerも登録（timer.js内でも登録していますが、念の為main.js側でも明示）
window.Timer = Timer;

/* ==========================================================================
   Initialization & Global State
   ========================================================================== */

initErrorHandler();

// ▼▼▼ Service Worker 登録 & 更新監視ロジック ▼▼▼
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {

        // ----------------------------------------------------
        // 1. 新規追加: 更新直後のリロードかどうかをチェック
        // ----------------------------------------------------
        if (localStorage.getItem('nomutore_just_updated')) {
            localStorage.removeItem('nomutore_just_updated'); // フラグ消去
            
            // UI描画の準備を待ってから表示 (1秒後)
            setTimeout(() => {
                // UIオブジェクトが利用可能か確認（念のため）
                if (window.UI && window.UI.showMessage) {
                    window.UI.showMessage('新しいバージョンに更新しました', 'success');
                }
            }, 1000);
        }

        // ----------------------------------------------------
        // 2. 既存: Service Workerの登録と更新監視
        // ----------------------------------------------------
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            console.log('[SW] Registered:', reg.scope);

            // A. 既に待機中のSWがいる場合
            if (reg.waiting) {
                UI.showUpdateNotification(reg.waiting);
                return;
            }

            // B. 更新が見つかった場合
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            console.log('[SW] New content is available; please refresh.');
                            UI.showUpdateNotification(installingWorker);
                        } else {
                            console.log('[SW] Content is cached for the first time!');
                        }
                    }
                };
            };
        }).catch(err => console.error('[SW] Registration failed:', err));

        // 制御が切り替わった瞬間にリロード
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    });
}

let editingLogId = null;
let editingCheckId = null;

const LAST_ACTIVE_KEY = 'nomutore_last_active_date';
let lastActiveDate = localStorage.getItem(LAST_ACTIVE_KEY) || dayjs().format('YYYY-MM-DD');

/* ==========================================================================
   Lifecycle Management
   ========================================================================== */

let isResuming = false;

const setupLifecycleListeners = () => {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const today = dayjs().format('YYYY-MM-DD');
            if (lastActiveDate !== today) {
                console.log('New day detected on resume. Refreshing...');
                lastActiveDate = today;
                localStorage.setItem(LAST_ACTIVE_KEY, today);
                isResuming = true;
                await initApp(); 
                isResuming = false;
            } else {
                if (Timer.checkResume) { 
                     Timer.checkResume(); 
                }
            }
        }
    });
};

/* ==========================================================================
   App Initialization
   ========================================================================== */

// ★修正: 初期化ロジックを分離し、エラーハンドリングを強化
const initApp = async () => {
    try {
        console.log('App Initializing...');

        initActionRouter();

        // 1. スマート・スプラッシュ判定 (Smart Splash Logic)
        const isOnboarded = localStorage.getItem('nomutore_onboarding_complete');
        const lastLaunchKey = 'nomutore_last_launch_ts';
        const lastLaunch = parseInt(localStorage.getItem(lastLaunchKey) || '0');
        const now = Date.now();
        const THRESHOLD = 6 * 60 * 60 * 1000; // 6時間 (テスト時は 10000=10秒 などに短縮して確認可)

        if (!isOnboarded) {
            // A. 初回ユーザー -> 既存の判定ロジックにお任せ (Wizardへ)
            if (window.Onboarding && window.Onboarding.checkLandingPage) {
                window.Onboarding.checkLandingPage();
            }
        } else {
            // B. 既存ユーザー -> 時間経過判定
            if (now - lastLaunch > THRESHOLD) {
                // 久しぶり -> スプラッシュ再生 (playSplashがあれば実行)
                console.log('✨ Showing Smart Splash (Time elapsed)');
                if (window.Onboarding && window.Onboarding.playSplash) {
                    window.Onboarding.playSplash();
                } else {
                    // フォールバック（メソッド未実装時）
                    if (window.Onboarding && window.Onboarding.checkLandingPage) {
                        window.Onboarding.checkLandingPage();
                    }
                }
            } else {
                // 直近の利用 -> 即ホーム画面へ (LPを即座に消す)
                console.log('🚀 Skipping Splash (Quick Resume)');
                if (window.Onboarding && window.Onboarding.checkLandingPage) {
                    window.Onboarding.checkLandingPage();
                }
            }
            // 最終起動時刻を更新
            localStorage.setItem(lastLaunchKey, now.toString());
        }

        // 2. 重い初期化（Google Drive 等）は、UI 表示と並行または後で行う
        CloudManager.init().then(() => {
            console.log('CloudManager ready');
        }).catch(err => {
            console.warn('CloudManager init failed:', err);
        });

        UI.init();
        

        // 3. Migration & Initial Data Logic
        let isFirstRun = false;
        // データ移行処理（あれば実行）
        if (Store.migrateV3ToV4) {
            isFirstRun = await Store.migrateV3ToV4();
        }

        // 4. Load & Verify Data
        updateBeerSelectOptions(); 
        generateSettingsOptions();
        UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system');

        // 当日のチェックレコードを確保（なければ作成）
        await Service.ensureTodayCheckRecord();

        // 期間リセットの確認
        const rolledOver = await Service.checkPeriodRollover();
        if (rolledOver) {
        // ★修正: 単にtoggleModalするのではなく、UIの関数を呼ぶ
        UI.showRolloverModal();
        }

        // 5. Initial Render
        await refreshUI();


        // 7. Restore Timer State
        // ★修正: Timer.init() を呼ぶだけでOKです。
        // （timer.js内の checkResume() が、自動的に計算復帰とモーダル表示を行います）
        if (window.Timer && window.Timer.init) {
            window.Timer.init();
        }

        // 画面のロックを強制解除して表示する
        document.querySelector('header')?.classList.remove('hidden');
        document.querySelector('main')?.classList.remove('hidden');
        // ホームタブを確実にアクティブにする
        UI.switchTab('home');

        document.body.style.pointerEvents = 'auto';
        console.log('🚀 UI initialized and interactions enabled');

        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 100);
       
    } catch (e) {
        // 致命的なエラーが発生した場合、エラー画面を表示する
        console.error('Critical Initialization Error:', e);
        import('./errorHandler.js').then(m => m.showErrorOverlay(
            `初期化に失敗しました。\n${e.message}`, 
            'main.js (initApp)', 
            0
        ));
    }
};

/* ==========================================================================
   Global Event Listeners (Swipe, etc)
   ========================================================================== */

let touchStartX = null;
let touchStartY = null;
let touchEndX = 0;
let touchEndY = 0;

const setupGlobalListeners = () => {
    // タッチ開始
    document.addEventListener('touchstart', (e) => {
        // 横スクロールエリア（.overflow-x-auto）内の操作ならスワイプ判定しない
        if (e.target.closest('.overflow-x-auto')) {
            touchStartX = null;
            touchStartY = null;
            return;
        }
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });

    // タッチ終了
    document.addEventListener('touchend', (e) => {
        if (touchStartX === null || touchStartY === null) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: false });
};

// スワイプ判定ロジック
const handleSwipe = () => {
    if (touchStartX === null) return;

    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    const swipeThreshold = 80; 
    
    const tabs = ['home', 'record', 'cellar', 'settings'];
    
    const activeTab = document.querySelector('.nav-pill-active');
    if (!activeTab) return;
    
    const currentTab = activeTab.id.replace('nav-tab-', '');
    const currentIndex = tabs.indexOf(currentTab);

    // 縦スクロールの意図が強い場合は無視
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    // 横移動量がしきい値を超えた場合
    if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && currentIndex < tabs.length - 1) {
            UI.switchTab(tabs[currentIndex + 1]); // 次のタブ
        } else if (diffX < 0 && currentIndex > 0) {
            UI.switchTab(tabs[currentIndex - 1]); // 前のタブ
        }
    }
};

/* ==========================================================================
   Event Bindings (Global)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = handleSaveSettings;
    }

    // ★追加: クラウドバックアップボタン
    const btnCloudBackup = document.getElementById('btn-cloud-backup');
    if (btnCloudBackup) {
        btnCloudBackup.addEventListener('click', () => {
            // ダブルクリック防止等のUI制御を入れても良い
            DataManager.backupToCloud();
        });
    }

    const btnCloudRestore = document.getElementById('btn-cloud-restore');
    if (btnCloudRestore) {
        btnCloudRestore.addEventListener('click', () => {
            DataManager.restoreFromCloud();
        });
    }

    // 1. 再生/一時停止ボタン (btn-timer-toggle)
    const btnTimerToggle = document.getElementById('btn-timer-toggle');
    if (btnTimerToggle) {
        console.log("✅ ボタンは見つかりました: btn-timer-toggle"); // 起動時に出るはず
        
        btnTimerToggle.addEventListener('click', () => {
            console.log("👆 ボタンが押されました"); // クリック時に出るはず
            
            if (typeof Timer !== 'undefined') {
                console.log("⏱ Timer.toggle() を実行します");
                Timer.toggle();
            } else {
                console.error("❌ Timerオブジェクトが見つかりません！ importを確認してください");
            }
        });
    } else {
        console.error("❌ ボタンが見つかりません: btn-timer-toggle");
    }

    // 2. 完了ボタン (btn-timer-finish)
    const btnTimerFinish = document.getElementById('btn-timer-finish');
    if (btnTimerFinish) {
        btnTimerFinish.addEventListener('click', () => {
            Timer.finish(); // 記録して終了
        });
    }

    // 3. リセットボタン (btn-timer-reset)
    const btnTimerReset = document.getElementById('btn-timer-reset');
    if (btnTimerReset) {
        btnTimerReset.addEventListener('click', () => {
            Timer.reset(); // 0に戻す
        });
    }

    setupLifecycleListeners();
    setupGlobalListeners();

    initApp();
});

/* ==========================================================================
   Helper Functions
   ========================================================================== */

const generateSettingsOptions = () => {
    const createOpts = (obj, id, isKey = false) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.innerHTML = '';
        Object.keys(obj).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = isKey 
                ? k 
                : (obj[k].label 
                    ? (obj[k].icon ? `${obj[k].icon} ${obj[k].label}` : obj[k].label)
                    : obj[k].label);
            el.appendChild(o);
        });
    };

    createOpts(EXERCISE, 'exercise-select');
    createOpts(EXERCISE, 'setting-base-exercise');
    createOpts(EXERCISE, 'setting-default-record-exercise');
    createOpts(CALORIES.STYLES, 'setting-mode-1', true);
    createOpts(CALORIES.STYLES, 'setting-mode-2', true);
    createOpts(SIZE_DATA, 'beer-size');
    
    const defRec = Store.getDefaultRecordExercise();
    const exSel = document.getElementById('exercise-select');
    if(exSel && defRec) exSel.value = defRec;
    
    const bSize = document.getElementById('beer-size');
    if(bSize) bSize.value = '350';
    
    const profile = Store.getProfile();
    const wIn = document.getElementById('weight-input');
    if(wIn) wIn.value = profile.weight;
    const hIn = document.getElementById('height-input');
    if(hIn) hIn.value = profile.height;
    const aIn = document.getElementById('age-input');
    if(aIn) aIn.value = profile.age;
    const gIn = document.getElementById('gender-input');
    if(gIn) gIn.value = profile.gender;
    
    const modes = Store.getModes();
    const m1 = document.getElementById('setting-mode-1');
    if(m1) m1.value = modes.mode1;
    const m2 = document.getElementById('setting-mode-2');
    if(m2) m2.value = modes.mode2;
    
    const baseEx = document.getElementById('setting-base-exercise');
    if(baseEx) baseEx.value = Store.getBaseExercise();
    
    const defRecSet = document.getElementById('setting-default-record-exercise');
    if(defRecSet) defRecSet.value = Store.getDefaultRecordExercise();
}


