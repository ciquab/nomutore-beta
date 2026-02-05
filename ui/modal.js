import { EXERCISE, CALORIES, SIZE_DATA, STYLE_SPECS, STYLE_METADATA, APP } from '../constants.js';
import { Calc, getVirtualDate } from '../logic.js';
import { Store, db } from '../store.js';
import { StateManager } from './state.js';
import { DOM, toggleModal, escapeHtml, toggleDryDay, showMessage, Feedback, showToastAnimation, showConfetti } from './dom.js';
import { Service } from '../service.js';
import { Timer } from './timer.js'; 
import { Share } from './share.js';
import { 
    openBeerModal, getBeerFormData, updateBeerKcalPreview, resetBeerForm, searchUntappd, 
    updateBeerSelectOptions, updateInputSuggestions, switchBeerInputTab
} from './beerForm.js';
import { openManualInput } from './exerciseForm.js';
import { renderCheckEditor, openCheckModal, openCheckLibrary } from './checkForm.js';
import { openLogDetail, openDayDetail } from './logDetail.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

const getTodayString = () => getVirtualDate();

/**
 * Action Menuを開く
 */
export const openActionMenu = async (dateStr = null) => {
    const targetDate = dateStr || getVirtualDate();
    StateManager.setSelectedDate(targetDate);
    
    const label = document.getElementById('action-menu-date-label');
    if(label) label.textContent = dayjs(targetDate).format('MM/DD (ddd)');

    // 1. ショートカットの描画 (非同期でデータを取得して表示)
    await renderActionMenuBeerPresets();
    await renderActionMenuExerciseShortcuts();

    // 2. モーダル表示
    toggleModal('action-menu-modal', true);

    // 3. アニメーション強制発火ロジック (CSSアニメーションの不具合回避)
    const modal = document.getElementById('action-menu-modal');
    if (modal) {
        const content = modal.querySelector('.modal-enter');
        if (content) {
            requestAnimationFrame(() => {
                content.classList.remove('modal-enter');
            });
        } else {
            const drawer = modal.querySelector('.absolute.bottom-0');
            if (drawer) drawer.classList.remove('modal-enter');
        }
    }
};

/**
 * Action Menu用: ビールボタン描画 (縦リスト形式に統一)
 */
const renderActionMenuBeerPresets = async () => {
    const container = document.getElementById('action-menu-beer-presets');
    if (!container) return;

    // HTML側のグリッドクラスを上書き（もしあれば）
    container.className = "space-y-2"; 

    const recentBeers = await Service.getRecentBeers(2);
    let html = '';

    if (recentBeers.length > 0) {
        html += `<p class="text-[10px] font-bold text-gray-400 uppercase mb-2">前回のビール</p>`;
        
        recentBeers.forEach((beer, index) => {
            const isIPA = beer.style && beer.style.includes('IPA');
            const isStout = beer.style && (beer.style.includes('Stout') || beer.style.includes('Porter'));
            
            let bgClass = 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/50';
            let iconColor = 'text-amber-500';

            if (isIPA) {
                bgClass = 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800/50';
                iconColor = 'text-orange-500';
            } else if (isStout) {
                bgClass = 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700';
                iconColor = 'text-gray-400';
            }

            const repeatPayload = {
                type: 'beer',
                name: beer.name,
                brand: beer.brand || beer.name,
                brewery: beer.brewery,
                style: beer.style,
                size: beer.size || '350',
                count: 1
            };
            
            const jsonParam = JSON.stringify(repeatPayload).replace(/"/g, "&quot;");
            
            const mainLabel = escapeHtml(beer.brand || beer.name);
            const subLabel = escapeHtml(beer.brewery || beer.style || 'Beer');
            const kcal = Math.abs(Math.round(beer.kcal / (beer.count || 1))); // 1本当たりのカロリー

            html += `
                <button onclick="handleRepeat(${jsonParam}); UI.closeModal('action-menu-modal');" 
                        class="w-full flex items-center gap-3 p-4 rounded-2xl border active:scale-95 transition shadow-sm hover:brightness-95 ${bgClass} group">
                    <div class="w-10 h-10 rounded-full bg-white dark:bg-base-900 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition">
                        <i class="ph-duotone ph-beer-bottle ${iconColor} text-xl"></i>
                    </div>
                    <div class="text-left overflow-hidden flex-1">
                        <div class="flex items-center gap-1 mb-0.5">
                            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider">No.${index + 1}</span>
                        </div>
                        <div class="text-xs font-bold text-gray-900 dark:text-white truncate">${mainLabel}</div>
                        <div class="text-[9px] text-gray-500 truncate">
                            ${subLabel} <span class="opacity-50 mx-1">/</span> ${beer.size || '350'}ml <span class="opacity-50 mx-1">/</span> ${kcal}kcal
                        </div>
                    </div>
                    <div class="text-gray-300 dark:text-gray-600">
                        <i class="ph-bold ph-caret-right"></i>
                    </div>
                </button>
            `;
        });
    } else {
        html += `
            <button onclick="UI.openBeerModal(); UI.closeModal('action-menu-modal');" class="w-full p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-xs font-bold flex items-center justify-center gap-2">
                <i class="ph-bold ph-plus"></i> Log First Beer
            </button>
        `;
    }

    container.innerHTML = html;
};

/**
 * Action Menu用: 運動ボタン描画
 * ★修正: 直近順(Recency)で2件表示
 */
const renderActionMenuExerciseShortcuts = async () => {
    const container = document.getElementById('action-menu-repeat-area');
    if (!container) return;

    // ★変更: 直近2件を取得
    const recents = await Service.getRecentExercises(2);
    
    container.innerHTML = ''; 

    if (recents.length > 0) {
        container.innerHTML += `
            <div class="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 mb-2">
                <p class="text-[10px] font-bold text-gray-400 uppercase">前回の運動</p>
            </div>
        `;

        recents.forEach((log, index) => {
            const repeatPayload = {
                type: 'exercise',
                name: log.name,
                minutes: log.minutes,
                kcal: log.kcal,
                exerciseKey: log.exerciseKey
            };

            const jsonParam = JSON.stringify(repeatPayload).replace(/"/g, "&quot;");
            const safeName = escapeHtml(log.name);

            // ★修正: HTML属性 onclick="handleRepeat(...)" を使用
            // これにより、window.handleRepeat が呼ばれ、スコープエラーを回避できます
            const btn = document.createElement('div'); // innerHTMLでボタンを作るためラッパーdiv
            btn.innerHTML = `
            <button onclick="handleRepeat(${jsonParam}); UI.closeModal('action-menu-modal');"
                    class="w-full flex items-center gap-3 p-4 mb-2 rounded-2xl border border-gray-100 dark:border-gray-800 bg-indigo-50 dark:bg-indigo-900/20 active:scale-95 transition shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 group">
                <div class="w-10 h-10 rounded-full bg-white dark:bg-indigo-800 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition">
                    <i class="ph-duotone ph-sneaker-move text-xl text-indigo-500 dark:text-indigo-300"></i>
                </div>
                <div class="text-left overflow-hidden flex-1">
                    <div class="flex items-center gap-1 mb-0.5">
                        <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider">No.${index + 1}</span>
                    </div>
                    <div class="text-xs font-bold text-gray-900 dark:text-white truncate">${safeName}</div>
                    <div class="text-[9px] text-gray-500 font-mono">
                        ${log.minutes} min <span class="opacity-50 mx-1">/</span> ${Math.round(log.kcal)} kcal
                    </div>
                </div>
                <div class="text-indigo-400 dark:text-indigo-500">
                    <i class="ph-bold ph-caret-right"></i>
                </div>
            </button>
            `;
            
            container.appendChild(btn.firstElementChild);
        });
    }
};


/* --- Timer Logic --- */

export const openTimer = (autoStart = false) => {
    Timer.init();
    toggleModal('timer-modal', true);
    
    const isRunning = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    
    if (autoStart && !isRunning) {
        // ★修正: setTimeout を削除し、即時実行に変更
        // 遅延（300ms）があると、iOS等で「ユーザー操作外」とみなされ音が鳴りません
        Timer.start();
    }
};

export const closeTimer = () => {
    const acc = localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
    const start = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    if (start || (acc && parseInt(acc) > 0)) {
        if (!confirm('タイマーをバックグラウンドで実行したまま閉じますか？\n(計測は止まりません)')) return;
    }
    toggleModal('timer-modal', false);
};


/* --- Settings Logic --- */

export const renderSettings = () => {
    // 1. Period Mode 設定
    const currentMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
    const periodSel = document.getElementById('setting-period-mode');
    
    // 新しいカスタム設定パネルの要素取得
    const customSettings = document.getElementById('custom-period-settings');
    const customStart = document.getElementById('custom-start-date');
    const customEnd = document.getElementById('custom-end-date');
    const customLabel = document.getElementById('custom-period-label');

    if (periodSel) {
        periodSel.value = currentMode;

        // モード変更時の表示切り替えロジック
        const toggleCustom = () => {
            if (periodSel.value === 'custom') {
                // Customモードならパネルを表示
                if (customSettings) customSettings.classList.remove('hidden');
                
                // 保存済みの値をフォームに充填
                const startTs = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
                const endTs = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE);
                const label = localStorage.getItem(APP.STORAGE_KEYS.CUSTOM_LABEL);
                
                if (startTs && customStart) customStart.value = dayjs(parseInt(startTs)).format('YYYY-MM-DD');
                if (endTs && customEnd) customEnd.value = dayjs(parseInt(endTs)).format('YYYY-MM-DD');
                if (label && customLabel) customLabel.value = label;
            } else {
                // それ以外なら隠す
                if (customSettings) customSettings.classList.add('hidden');
            }
        };

        periodSel.onchange = toggleCustom;
        toggleCustom(); // 初期実行して現在の状態を反映
    }

    // ★追加: プロフィール値の反映
    const profile = Store.getProfile();
    const wInput = document.getElementById('weight-input');
    const hInput = document.getElementById('height-input');
    const aInput = document.getElementById('age-input');
    const gInput = document.getElementById('gender-input');

    if (wInput) wInput.value = profile.weight;
    if (hInput) hInput.value = profile.height;
    if (aInput) aInput.value = profile.age;
    if (gInput) gInput.value = profile.gender;

    // ★修正: 設定画面のプルダウン選択肢生成ロジックを追加
    const mode1Sel = document.getElementById('setting-mode-1');
    const mode2Sel = document.getElementById('setting-mode-2');
    // STYLE_METADATAがなければCALORIES.STYLESをフォールバックとして使う
    const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
    const styles = Object.keys(source || {});
    
    [mode1Sel, mode2Sel].forEach(sel => {
        if (sel && sel.children.length === 0) {
            styles.forEach(style => {
                const opt = document.createElement('option');
                opt.value = style;
                opt.textContent = style;
                sel.appendChild(opt);
            });
        }
    });
    
    if(mode1Sel) mode1Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
    if(mode2Sel) mode2Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2;

    const baseExSel = document.getElementById('setting-base-exercise');
    const defRecExSel = document.getElementById('setting-default-record-exercise');
    
    [baseExSel, defRecExSel].forEach(sel => {
        if (sel && sel.children.length === 0) {
            Object.entries(EXERCISE).forEach(([key, val]) => {
                const opt = document.createElement('option');
                opt.value = key;
                // ★修正: プルダウンではテキストのみ表示
                opt.textContent = val.label;
                sel.appendChild(opt);
            });
        }
    });

    if(baseExSel) baseExSel.value = localStorage.getItem(APP.STORAGE_KEYS.BASE_EXERCISE) || APP.DEFAULTS.BASE_EXERCISE;
    if(defRecExSel) defRecExSel.value = localStorage.getItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE) || APP.DEFAULTS.DEFAULT_RECORD_EXERCISE;

    renderCheckEditor();
};


/**
 * 設定保存ボタンのハンドラー
 */
export const handleSaveSettings = async () => {
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.textContent;

    // 1. UIの状態制御 (楽観的UIアップデート準備)
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // 2. 入力データの収集 (DOMアクセスはここで行う)
        const periodMode = document.getElementById('setting-period-mode')?.value || 'weekly';
        
        // プロフィールデータ
        const profileData = {
            weight: document.getElementById('weight-input').value,
            height: document.getElementById('height-input').value,
            age: document.getElementById('age-input').value,
            gender: document.getElementById('gender-input').value,
        };

        // アプリ設定データ
        const appSettings = {
            mode1: document.getElementById('setting-mode-1').value,
            mode2: document.getElementById('setting-mode-2').value,
            baseExercise: document.getElementById('setting-base-exercise').value,
            defaultRecordExercise: document.getElementById('setting-default-record-exercise').value,
            theme: document.getElementById('theme-input').value,
        };

        // カスタム期間用データ (存在する場合のみ)
        const customPeriod = {
            startDate: document.getElementById('custom-start-date')?.value,
            endDate: document.getElementById('custom-end-date')?.value,
            label: document.getElementById('custom-period-label')?.value,
        };

        // 3. バリデーション (UI層で防げるものは先に弾く)
        if (periodMode === 'custom') {
            if (!customPeriod.startDate || !customPeriod.endDate) {
                throw new Error('期間（開始日・終了日）を入力してください');
            }
            if (dayjs(customPeriod.endDate).isBefore(dayjs(customPeriod.startDate))) {
                throw new Error('終了日は開始日より後に設定してください');
            }
        }

        // 4. Service層への依頼 (ロジックと保存の実行)
        // ※ カスタム期間の保存ロジックも Service.updatePeriodSettings 内に隠蔽するのが理想
        const periodResult = await Service.updatePeriodSettings(periodMode, customPeriod);
        await Service.updateProfile(profileData);
        await Service.updateAppSettings(appSettings);

        // 5. 成功時のUIフィードバック
        if (typeof Feedback !== 'undefined' && Feedback.save) Feedback.save();

        // 復元が行われた場合の特殊メッセージ
        if (periodResult && periodResult.restoredCount > 0) {
            showMessage(`${periodResult.restoredCount}件の過去ログを復元しました`, 'success');
        } else {
            showMessage('設定を保存しました', 'success');
        }

        // 6. 画面全体の同期
        updateModeSelector();
        document.dispatchEvent(new CustomEvent('refresh-ui'));
        
        // モーダルを閉じる
        if (typeof closeModal === 'function') closeModal('modal-settings');

    } catch (e) {
        // エラーハンドリングの一元化
        console.error('[Settings Save Error]', e);
        showMessage(e.message || '設定保存中にエラーが発生しました', 'error');
    } finally {
        // UI状態の復帰
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

/* --- Help Modal Logic --- */

// 最新版 openHelp (シンプル版)
export const openHelp = (targetId = null) => {
    toggleModal('help-modal', true);

    // 1. スクロールする領域（コンテナ）を特定する
    // Tailwindを使っている場合、通常は .overflow-y-auto がついている要素がスクロールします
    const scrollContainer = document.querySelector('#help-modal .overflow-y-auto');

    if (targetId) {
        // A. ターゲット指定あり（LIVER RANK等から）→ そこへスクロール
        setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300); 
    } else {
        // B. ターゲット指定なし（通常のヘルプボタン）→ トップへ戻す
        if (scrollContainer) {
            // アニメーションなしで即座にトップへ戻す（開いた瞬間には上にあるように見せる）
            scrollContainer.scrollTop = 0;
        }
    }
};


export const updateModeSelector = () => {
    // 1. 最新の設定値をローカルストレージ（またはStore）から取得
    const m1 = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || 'Lager'; // APP.DEFAULTS.MODE1 でも可
    const m2 = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || 'Ale';
    
    const headerSel = document.getElementById('header-mode-select');
    const display = document.getElementById('beer-select-display'); // 表示用ラベル

    if (headerSel) {
        // 2. プルダウンの選択肢テキストを更新
        headerSel.options[0].text = m1;
        headerSel.options[1].text = m2;

        // 3. 現在選択されている項目のテキストを表示用ラベルに反映
        const selectedOption = headerSel.options[headerSel.selectedIndex];
        if (display && selectedOption) {
            display.textContent = selectedOption.text;
        }
    }
};

export const renderQuickButtons = () => { };
export const closeModal = (id) => toggleModal(id, false);

export const validateInput = (dateStr, minutes = null) => {
    // 日付チェック
    if (dateStr && dayjs(dateStr).isAfter(dayjs(), 'day')) {
        Feedback.error(); // ★追加
        showMessage('未来の日付は記録できません', 'error');
        return false;
    }
    
    // 運動時間チェック
    if (minutes !== null) {
        if (minutes <= 0) {
            Feedback.error(); // ★追加
            showMessage('時間は1分以上で入力してください', 'error');
            return false;
        }
        if (minutes > 1440) {
            Feedback.error(); // ★追加
            showMessage('24時間を超える記録はできません', 'error');
            return false;
        }
    }
    return true;
};


/**
 * ★追加: Recordタブのショートカット描画関数
 * (Action Menuと同じロジックで、Recordタブにもボタンを並べる)
 */
export const renderRecordTabShortcuts = async () => {
    // 1. お酒エリア (変更なし)
    const beerContainer = document.getElementById('record-shortcuts-beer');
    if (beerContainer) {
        const frequentBeers = await Service.getFrequentBeers(5); // 頻度順
        let html = '';
        
        if (frequentBeers.length > 0) {
            frequentBeers.forEach((beer, index) => {
                // スタイル装飾
                const isIPA = beer.style && beer.style.includes('IPA');
                const isStout = beer.style && (beer.style.includes('Stout') || beer.style.includes('Porter'));
                
                let bgClass = 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800';
                let iconColor = 'text-amber-500';

                if (isIPA) {
                    bgClass = 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800';
                    iconColor = 'text-orange-500';
                } else if (isStout) {
                    bgClass = 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
                    iconColor = 'text-gray-600 dark:text-gray-400';
                }

                const safeName = escapeHtml(beer.name);
                const repeatPayload = {
                    type: 'beer',
                    name: beer.name,
                    brand: beer.brand || beer.name,
                    brewery: beer.brewery,
                    style: beer.style,
                    size: '350',
                    count: 1
                };
                const jsonParam = JSON.stringify(repeatPayload).replace(/"/g, "&quot;");

                html += `
                    <button onclick="handleRepeat(${jsonParam})" 
                            class="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border active:scale-95 transition shadow-sm ${bgClass} min-w-[130px]">
                        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-white/50 dark:bg-black/20 flex items-center justify-center">
                             <i class="ph-duotone ph-beer-bottle ${iconColor} text-lg"></i>
                        </div>
                        <div class="text-left min-w-0 flex-1">
                            <div class="text-[9px] font-bold text-gray-400 leading-none mb-0.5">No.${index + 1}</div>
                            <div class="text-xs font-bold text-base-900 dark:text-white leading-tight truncate">${safeName}</div>
                        </div>
                    </button>
                `;
            });
        } else {
            html = `<div class="text-xs text-gray-400 py-2 px-2">まだ履歴がありません</div>`;
        }
        beerContainer.innerHTML = html;
    }

    // 2. 運動エリア (★ここを修正！)
    const exContainer = document.getElementById('record-shortcuts-exercise');
    if (exContainer) {
        // ★修正: getRecentExercises(直近順) -> getFrequentExercises(頻度順) に変更
        const frequentExercises = await Service.getFrequentExercises(5);
        let html = '';

        if (frequentExercises.length > 0) {
            frequentExercises.forEach((log, index) => {
                const repeatPayload = {
                    type: 'exercise',
                    name: log.name,
                    minutes: log.minutes,
                    kcal: log.kcal, 
                    exerciseKey: log.exerciseKey
                };
                const jsonParam = JSON.stringify(repeatPayload).replace(/"/g, "&quot;");
                const safeName = escapeHtml(log.name);

                html += `
                    <button onclick="handleRepeat(${jsonParam})" 
                            class="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm active:scale-95 transition hover:border-indigo-300 dark:hover:border-indigo-500 min-w-[130px]">
                        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
                            <i class="ph-duotone ph-sneaker-move"></i>
                        </div>
                        <div class="text-left min-w-0 flex-1">
                            <div class="text-[9px] font-bold text-gray-400 leading-none mb-0.5">No.${index + 1}</div>
                            <div class="text-xs font-bold text-base-900 dark:text-white leading-none truncate">${safeName}</div>
                            <div class="text-[9px] text-gray-400 font-mono mt-0.5">${log.minutes} min</div>
                        </div>
                    </button>
                `;
            });
        } else {
             html = `<div class="text-xs text-gray-400 py-2 px-2">まだ履歴がありません</div>`;
        }
        exContainer.innerHTML = html;
    }
};

export const handleRolloverAction = async (action) => {
    // modal.js内で import されている toggleModal を使用
    toggleModal('rollover-modal', false);

    if (action === 'weekly') {
        // Weeklyに戻す
        await Service.updatePeriodSettings('weekly');
        showConfetti();
        showMessage('Weeklyモードに戻りました', 'success');
        // UI更新イベントを発火（refreshUIを直接インポートせずに済むテクニック）
        document.dispatchEvent(new CustomEvent('refresh-ui'));
        
    } else if (action === 'new_custom') {
        // 設定画面へ移動
        // ★注意: UIオブジェクトはまだ作られていない可能性があるため、window.UI経由かDOM操作で移動
        if (window.UI && window.UI.switchTab) {
            window.UI.switchTab('settings');
        } else {
            // フォールバック: タブボタンを直接クリック
            const settingsTab = document.getElementById('nav-tab-settings');
            if(settingsTab) settingsTab.click();
        }
        
        // 少し遅れてメッセージ
        setTimeout(() => {
            showMessage('新しい期間を設定してください', 'info');
            // 設定パネルを開く演出（必要なら）
            const pMode = document.getElementById('setting-period-mode');
            if(pMode) {
                pMode.value = 'custom';
                pMode.dispatchEvent(new Event('change'));
            }
        }, 300);
        
    } else if (action === 'extend') {
        // 延長処理
        const currentEnd = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE)) || Date.now();
        const newEnd = dayjs(currentEnd).add(7, 'day').endOf('day').valueOf();
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_END_DATE, newEnd);
        
        showMessage('期間を1週間延長しました', 'success');
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    }
};

export const openShareModal = (mode = 'status') => {
    // Shareモジュールが持つ generateAndShare を呼ぶ
    // ※ import { Share } from './share.js'; が必要
    Share.generateAndShare(mode);
};

/**
 * 期間終了（ロールオーバー）時のモーダルを表示
 * モード（Weekly/Monthly/Custom）に応じて内容を出し分ける
 */
export const showRolloverModal = () => {
    const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
    
    const titleEl = document.getElementById('rollover-title');
    const descEl = document.getElementById('rollover-desc');
    // アイコンの親要素を取得して、その中のiタグを探す
    const iconContainer = document.querySelector('#rollover-modal .rounded-full');
    const iconEl = iconContainer ? iconContainer.querySelector('i') : null;
    
    // ボタンエリアを取得
    const actionsContainer = document.getElementById('rollover-actions');
    
    if (!actionsContainer) {
        console.warn('#rollover-actions not found in HTML. Opening default modal.');
        toggleModal('rollover-modal', true);
        return;
    }

    // ボタンエリアをクリア
    actionsContainer.innerHTML = '';

    // --- A. Weekly / Monthly モード (事後報告) ---
    if (mode === 'weekly' || mode === 'monthly') {
        const label = mode === 'weekly' ? 'Weekly' : 'Monthly';
        
        if (titleEl) titleEl.textContent = `${label} Report Ready!`;
        if (descEl) descEl.innerHTML = `期間が終了し、新しい${mode === 'weekly' ? '週' : '月'}が始まりました。<br>心機一転、頑張りましょう！`;
        if (iconEl) iconEl.className = "ph-fill ph-calendar-check";

        // 「次へ進む」ボタン
        const btn = document.createElement('button');
        btn.className = "w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all flex items-center justify-center gap-2";
        btn.innerHTML = `<span>Start New ${label}</span>`;
        // 閉じるだけ
        btn.onclick = () => toggleModal('rollover-modal', false);
        
        actionsContainer.appendChild(btn);
    } 
    // --- B. Custom モード (アクション選択) ---
    else {
        const label = localStorage.getItem(APP.STORAGE_KEYS.CUSTOM_LABEL) || 'Project';
        
        if (titleEl) titleEl.textContent = `${label} Finished!`;
        if (descEl) descEl.innerHTML = "プロジェクト期間が終了しました。<br>アーカイブして通常モードに戻りますか？";
        if (iconEl) iconEl.className = "ph-fill ph-flag-checkered";

        // 1. Weeklyに戻る
        const btnWeekly = document.createElement('button');
        btnWeekly.className = "w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 mb-3";
        btnWeekly.innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i><span>Switch to Weekly</span>`;
        // UIがグローバルにある前提、またはimportが必要ですが、安全策としてonclick属性を使うか、window.UI経由で呼びます
        btnWeekly.onclick = () => window.UI.handleRolloverAction('weekly');

        // 2. 新規プロジェクト
        const btnNew = document.createElement('button');
        btnNew.className = "w-full py-3.5 px-4 bg-white dark:bg-base-800 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-100 dark:border-indigo-900 rounded-xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2 mb-3";
        btnNew.innerHTML = `<i class="ph-bold ph-plus"></i><span>New Project</span>`;
        btnNew.onclick = () => window.UI.handleRolloverAction('new_custom');

        // 3. 延長
        const btnExtend = document.createElement('button');
        btnExtend.className = "w-full py-2 px-4 text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 active:scale-95 transition-all";
        btnExtend.textContent = "Extend this period";
        btnExtend.onclick = () => window.UI.handleRolloverAction('extend');

        actionsContainer.appendChild(btnWeekly);
        actionsContainer.appendChild(btnNew);
        actionsContainer.appendChild(btnExtend);
    }

    // モーダルを表示
    toggleModal('rollover-modal', true);

};


