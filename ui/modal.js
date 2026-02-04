import { EXERCISE, CALORIES, SIZE_DATA, STYLE_SPECS, STYLE_METADATA, APP, CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, getCheckItemSpec } from '../constants.js';
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
 * Action Menu用: ビールボタン描画
 * ★修正: 直近2件のビールを表示 (ID降順で取得済み)
 */
const renderActionMenuBeerPresets = async () => {
    const container = document.getElementById('action-menu-beer-presets');
    if (!container) return;

    // ★変更: 直近2件を取得 (service.jsでID降順に修正済み)
    const recentBeers = await Service.getRecentBeers(2);

    let html = '';

    if (recentBeers.length > 0) {
        html += `<p class="col-span-2 text-[10px] font-bold text-gray-400 uppercase mb-1">前回のビール</p>`;
    }

    if (recentBeers.length > 0) {
        recentBeers.forEach((beer, index) => {
            // スタイル判定
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

            // リピート用データ
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
            
            // エスケープ処理
            const safeName = escapeHtml(beer.name);       
            const safeBrand = escapeHtml(beer.brand || ''); 
            const safeBrewery = escapeHtml(beer.brewery || ''); 
            const safeStyle = escapeHtml(beer.style || ''); 

            // ★修正: 表示ロジック
            // Main: 銘柄 (なければ名前)
            // Sub: ブルワリー (なければスタイル)
            let mainLabel = safeBrand || safeName;
            let subLabel = safeBrewery || safeStyle || 'Beer';

            // 例外処理: 名前と銘柄が同じ(スタイル名だけの場合)で、かつブルワリーもない時
            if (!safeBrand && !safeBrewery) {
                 mainLabel = safeName;
                 subLabel = safeStyle || 'Beer';
            }

            // ★修正: HTML生成時に mainLabel, subLabel を使用
            html += `
                <button onclick="handleRepeat(${jsonParam}); UI.closeModal('action-menu-modal');" 
                        class="flex items-center gap-3 p-4 rounded-2xl border active:scale-95 transition shadow-sm ${bgClass}">
                    <div class="w-10 h-10 rounded-full bg-white/60 dark:bg-black/20 flex items-center justify-center shrink-0">
                        <i class="ph-duotone ph-beer-bottle ${iconColor} text-xl"></i>
                    </div>
                    <div class="text-left overflow-hidden">
                        <div class="flex items-center gap-1 mb-0.5">
                            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider">No.${index + 1}</span>
                        </div>
                        <div class="text-xs font-bold text-gray-900 dark:text-white truncate">${mainLabel}</div>
                        <div class="text-[9px] text-gray-500 truncate">${subLabel}</div>
                    </div>
                </button>
            `;
        });
    } else {
        html += `
            <button onclick="UI.openBeerModal(); UI.closeModal('action-menu-modal');" class="col-span-2 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-xs font-bold flex items-center justify-center gap-2">
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

/* --- Check Modal Logic --- */

export const openCheckModal = async (dateStr) => {
    const targetDate = dateStr || getVirtualDate();
    const d = dayjs(targetDate);
    const dateVal = d.format('YYYY-MM-DD');
    const dateInput = document.getElementById('check-date');
    if(dateInput) dateInput.value = dateVal;

    // 日付表示バッジの更新
    const displayEl = document.getElementById('daily-check-date-display');
    const valueEl = document.getElementById('daily-check-date-value');
    if (displayEl) displayEl.textContent = d.format('MM/DD (ddd)');
    if (valueEl) valueEl.value = dateVal;
    
    const container = document.getElementById('check-items-container');
    if (container) {
        container.innerHTML = '';
        let schema = CHECK_SCHEMA;
        try {
            const stored = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
            if (stored) schema = JSON.parse(stored);
            else {
                schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
                localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
            }
        } catch(e) {}

        schema.forEach(item => {
            const div = document.createElement('div');
            const visibilityClass = item.drinking_only ? 'drinking-only' : '';
            if (visibilityClass) div.className = visibilityClass;
            
            // ★修正: マスタデータ(constants.js)から最新定義を取得してアイコンを上書き表示
            const spec = getCheckItemSpec(item.id);
            const iconDef = (spec && spec.icon) ? spec.icon : item.icon;
            const iconHtml = DOM.renderIcon(item.icon, 'text-xl text-indigo-500 dark:text-indigo-400');

            div.innerHTML = `
                <label class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700 transition h-full">
                    <input type="checkbox" id="check-${item.id}" class="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                            ${iconHtml} ${item.label}
                        </span>
                        ${item.desc ? `<span class="text-[9px] text-gray-400">${item.desc}</span>` : ''}
                    </div>
                </label>
            `;
            container.appendChild(div);
        });
    }

    const syncDryDayUI = (isDry) => {
        const items = document.querySelectorAll('.drinking-only');
        items.forEach(el => {
            if (isDry) el.classList.add('hidden');
            else el.classList.remove('hidden');
        });
        toggleDryDay(isDry);
    };

    const isDryCheck = document.getElementById('check-is-dry');
    if (isDryCheck) {
        isDryCheck.onclick = (e) => syncDryDayUI(e.target.checked);
    }

    const setCheck = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.checked = !!val;
    };
    
    // Reset to initial state
    setCheck('check-is-dry', false);
    syncDryDayUI(false);
    
    const wEl = document.getElementById('check-weight');
    if(wEl) wEl.value = '';

    const saveBtn = document.getElementById('btn-save-check');
    if (saveBtn) saveBtn.textContent = 'Log Check';

    const isDryInput = document.getElementById('check-is-dry');
    const dryLabelContainer = isDryInput ? isDryInput.closest('#drinking-section') : null;
    const dryLabelText = dryLabelContainer ? dryLabelContainer.querySelector('span.font-bold') : null;
    const hint = document.querySelector('#drinking-section p'); // ヒント要素の取得

    // ★修正: ラベルを日本語化
    if (dryLabelText) dryLabelText.innerHTML = "休肝日 <span class='text-xs opacity-70 font-normal ml-1'>(No Alcohol)</span>";
    if (isDryInput) isDryInput.disabled = false;
    // 以前の状態をリセット
    if (dryLabelContainer) dryLabelContainer.classList.remove('opacity-50', 'pointer-events-none');
    if (hint) {
        hint.classList.remove('text-red-500', 'font-bold');
        // syncDryDayUI(false) でデフォルトテキストが入っています
    }

    try {
        const start = d.startOf('day').valueOf();
        const end = d.endOf('day').valueOf();
        
        const [existingLogs, beerLogs] = await Promise.all([
            db.checks.where('timestamp').between(start, end, true, true).toArray(),
            db.logs.where('timestamp').between(start, end, true, true).filter(l => l.type === 'beer').toArray()
        ]);

        const existingSaved = existingLogs.find(c => c.isSaved === true);
        const anyRecord = existingLogs.length > 0 ? existingLogs[0] : null;
        const hasBeer = beerLogs.length > 0;

        if (anyRecord) {
            setCheck('check-is-dry', anyRecord.isDryDay);
            syncDryDayUI(anyRecord.isDryDay);
            
            let schema = CHECK_SCHEMA;
            try {
                const s = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
                if (s) schema = JSON.parse(s);
            } catch(e) {}

            const renderedIds = new Set(['id', 'timestamp', 'isDryDay', 'weight', 'isSaved', 'date']); // 除外対象
            schema.forEach(item => {
                // anyRecord を参照するように修正
                if (anyRecord[item.id] !== undefined) {
                    setCheck(`check-${item.id}`, anyRecord[item.id]);
                }
                renderedIds.add(item.id);
            });

            // ▼▼▼ 追加: スキーマにない「遺産項目」を探して表示する (Legacy Item Recovery) ▼▼▼
            const container = document.getElementById('check-items-container');
            const legacyKeys = Object.keys(anyRecord).filter(key => !renderedIds.has(key));

            legacyKeys.forEach(key => {
                // 値が true (チェックあり) の場合のみ復元表示する
                if (anyRecord[key] === true) {
                    // 辞書から定義を取得（廃止項目でもここなら取れる！）
                    const spec = getCheckItemSpec(key);
                    
                    // ★修正: アイコンのレンダリング
                    const iconHtml = DOM.renderIcon(spec.icon, 'text-lg text-amber-500');

                    // DOM生成（通常の項目とは少し見た目を変えて「過去の遺産」感を出す）
                    const div = document.createElement('div');
                    div.className = "legacy-item-wrapper"; // 識別用クラス
                    div.innerHTML = `
                        <label class="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700 opacity-80 cursor-not-allowed">
                            <input type="checkbox" checked disabled class="rounded text-amber-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300">
                            <div class="flex flex-col">
                                <span class="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                                    ${iconHtml} ${spec.label}
                                    <span class="text-[9px] bg-amber-200 dark:bg-amber-800 px-1 rounded text-amber-900 dark:text-amber-100 ml-1">Legacy</span>
                                </span>
                                <span class="text-[9px] text-amber-600/70 dark:text-amber-400/70">現在はリストにありません</span>
                            </div>
                        </label>
                    `;
                    container.appendChild(div);
                }
            });
            // ▲▲▲ 追加終了 ▲▲▲

            // anyRecord を参照するように修正
            if(wEl) wEl.value = anyRecord.weight || '';

            if (saveBtn) {
                saveBtn.textContent = existingSaved ? 'Update Check' : 'Log Check';
            }
        } // if (anyRecord) の閉じカッコ

        if (hasBeer) {
            setCheck('check-is-dry', false); 
            syncDryDayUI(false);              
            if (isDryInput) isDryInput.disabled = true;
            // ★修正: ビールがある場合、休肝日ラベル自体はいじらず、下のヒントテキストを赤字で書き換える
            if (hint) {
                hint.innerHTML = "<i class='ph-bold ph-beer-bottle'></i> 飲酒記録があるため、休肝日は選択できません";
                hint.classList.remove('text-orange-600/70', 'text-emerald-600'); // 他の状態の色を消す
                hint.classList.add('text-red-500', 'font-bold'); // 赤字強調
            }
        }
    } catch (e) { 
        console.error("Failed to fetch check data:", e); 
    }

    toggleModal('check-modal', true);
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

/* --- Check Library Logic (Phase 1.5 New) --- */

const getActiveSchemaFromIds = (ids) => {
    const activeSchema = [];
    ids.forEach(id => {
        let item = null;
        Object.values(CHECK_LIBRARY).forEach(category => {
            const found = category.find(i => i.id === id);
            if (found) item = found;
        });
        
        if (!item) {
            try {
                const current = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
                item = current.find(i => i.id === id);
            } catch(e){}
        }

        if (item) {
            activeSchema.push(item);
        }
    });
    return activeSchema;
};

const getCurrentActiveIds = () => {
    try {
        const schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        return schema.map(i => i.id);
    } catch(e) {
        return CHECK_DEFAULT_IDS;
    }
};

window.renderCheckLibrary = () => {
    const container = document.getElementById('library-content');
    if (!container) return;
    container.innerHTML = '';

    const activeIds = new Set(getCurrentActiveIds());

    const categories = {
        'general': '基本・メンタル',
        'diet': 'ダイエット・食事',
        'alcohol': 'お酒・飲み会',
        'muscle': '筋トレ・運動'
    };

    Object.entries(categories).forEach(([key, label]) => {
        const items = CHECK_LIBRARY[key];
        if (!items) return;

        const section = document.createElement('div');
        section.className = "mb-4";
        section.innerHTML = `<h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 sticky top-0 bg-white dark:bg-base-900 py-2 z-10">${label}</h4>`;
        
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-2";

        items.forEach(item => {
            const isActive = activeIds.has(item.id);
            const btn = document.createElement('div');
            btn.className = `p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                isActive 
                ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500' 
                : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300'
            }`;
            
            btn.onclick = () => {
                const checkbox = document.getElementById(`lib-chk-${item.id}`);
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    btn.className = checkbox.checked
                        ? 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500'
                        : 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300';
                    
                    const iconArea = btn.querySelector('.check-icon');
                    if (iconArea) {
                        iconArea.innerHTML = checkbox.checked 
                            ? '<i class="ph-fill ph-check-circle text-indigo-500"></i>' 
                            : '<i class="ph-bold ph-circle text-gray-300"></i>';
                    }
                }
            };

            // ★修正: アイコンのレンダリング
            const iconHtml = DOM.renderIcon(item.icon, 'text-2xl text-gray-600 dark:text-gray-300');

            btn.innerHTML = `
                <input type="checkbox" id="lib-chk-${item.id}" class="hidden" ${isActive ? 'checked' : ''} value="${item.id}">
                ${iconHtml}
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-base-900 dark:text-white truncate">${item.label}</p>
                    <p class="text-[9px] text-gray-400 truncate">${item.desc}</p>
                </div>
                <div class="check-icon">
                    ${isActive ? '<i class="ph-fill ph-check-circle text-indigo-500"></i>' : '<i class="ph-bold ph-circle text-gray-300"></i>'}
                </div>
            `;
            grid.appendChild(btn);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
};

window.applyLibraryChanges = () => {
    const checkedInputs = document.querySelectorAll('#library-content input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkedInputs).map(input => input.value);
    
    let currentSchema = [];
    try {
        currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
    } catch(e){}

    const libraryIds = new Set();
    Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));

    const customItems = currentSchema.filter(item => !libraryIds.has(item.id));

    const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
    const finalSchema = [...newSchemaFromLibrary, ...customItems];

    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
    
    toggleModal('check-library-modal', false);
    renderCheckEditor(); 
    showMessage('チェック項目を更新しました', 'success');
};

window.applyPreset = (presetKey) => {
    const preset = CHECK_PRESETS[presetKey];
    if (!preset) return;

    if (!confirm(`「${preset.label}」プリセットを適用しますか？\n（現在のカスタム項目は維持されますが、ライブラリ選択項目は上書きされます）`)) return;

    const selectedIds = preset.ids;
    
    let currentSchema = [];
    try {
        currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
    } catch(e){}
    const libraryIds = new Set();
    Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));
    const customItems = currentSchema.filter(item => !libraryIds.has(item.id));

    const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
    const finalSchema = [...newSchemaFromLibrary, ...customItems];

    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
    
    if(document.getElementById('check-library-modal') && !document.getElementById('check-library-modal').classList.contains('hidden')) {
        window.renderCheckLibrary();
    }
    
    renderCheckEditor();
    showMessage(`プリセット「${preset.label}」を適用しました`, 'success');
};

export const openCheckLibrary = () => {
    window.renderCheckLibrary();
    toggleModal('check-library-modal', true);
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

const renderCheckEditor = () => {
    const container = document.getElementById('check-editor-list');
    if (!container) return; 
    container.innerHTML = '';
    
    let schema = [];
    try {
        schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        if (schema.length === 0) {
            schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
            localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
        }
    } catch(e) {}

    schema.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl mb-2";
        
        const deleteBtn = `<button onclick="deleteCheckItem(${index})" class="text-red-500 hover:bg-red-100 p-1 rounded"><i class="ph-bold ph-trash"></i></button>`;

        // ★修正: アイコンのレンダリング
        const iconHtml = DOM.renderIcon(item.icon, 'text-xl text-gray-500');

        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${iconHtml}
                <div>
                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${item.label}</p>
                    <p class="text-[10px] text-gray-400">${item.desc || ''} ${item.drinking_only ? '<span class="text-orange-500">(Drink Only)</span>' : ''}</p>
                </div>
            </div>
            ${deleteBtn}
        `;
        container.appendChild(div);
    });
};

window.deleteCheckItem = (index) => {
    if(!confirm('この項目を削除しますか？')) return;
    let schema = [];
    try { schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA)); } catch(e) {}
    schema.splice(index, 1);
    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
    renderCheckEditor();
};

const ICON_KEYWORDS = {
    'gym': 'ph-duotone ph-barbell',
    'run': 'ph-duotone ph-sneaker-move',
    'walk': 'ph-duotone ph-footprints',
    'sleep': 'ph-duotone ph-moon-stars',
    'food': 'ph-duotone ph-bowl-food',
    'drink': 'ph-duotone ph-beer-bottle',
    'water': 'ph-duotone ph-drop',
    'heart': 'ph-duotone ph-heart',
    'star': 'ph-duotone ph-star',
    'fire': 'ph-duotone ph-fire',
    'bath': 'ph-duotone ph-drop-half-bottom', // サウナ/風呂代用
    'book': 'ph-duotone ph-book-open',
    'work': 'ph-duotone ph-briefcase'
};

window.addNewCheckItem = () => {
    // 1. ラベル入力（必須）
    // ※ここでキャンセルを押した場合は、処理を中断（終了）します
    const label = prompt('項目名を入力してください (例: 筋トレ)');
    if (!label) return;

    // 2. アイコン入力（任意）
    // ※キャンセルを押した場合は、nullになるため if文をスキップし、デフォルト(iconClassの初期値)が採用されます
    const iconInput = prompt(
        'アイコン用の「絵文字」または「キーワード」を入力してください\n\n' + 
        '📝 絵文字: 🧖, 💪, 💊 ...\n' +
        '🔑 キーワード: gym, run, sleep, water, fire ...', 
        ''
    );

    // デフォルト値を設定
    let iconClass = 'ph-duotone ph-check-circle';
    
    if (iconInput) {
        const lowerKey = iconInput.toLowerCase().trim();
        if (ICON_KEYWORDS[lowerKey]) {
            iconClass = ICON_KEYWORDS[lowerKey];
        } else {
            iconClass = iconInput; // 入力された絵文字などをそのまま使う
        }
    }

    // 3. 説明入力（任意）
    // ※キャンセル(null)の場合は、空文字 '' に変換して保存します
    const descInput = prompt('説明を入力してください (例: 30分以上やった)', '');
    const desc = descInput || ''; 

    // 4. 表示設定
    const drinkingOnly = confirm('「お酒を飲んだ日」だけ表示しますか？\n(OK=はい / キャンセル=いいえ[毎日表示])');

    const id = `custom_${Date.now()}`;
    
    // ★修正箇所: iconプロパティに、上で決定した iconClass 変数をセットします
    const newItem = {
        id, 
        label, 
        icon: iconClass, // 以前はここが `icon` になっておりエラーでした
        type: 'boolean', 
        desc, 
        drinking_only: drinkingOnly
    };

    let schema = [];
    try { schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]'); } catch(e) {}
    schema.push(newItem);
    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
    
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

export const openLogDetail = (log) => {
    // 既存のモーダルがあれば消す
    const modalId = 'log-detail-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    // ▼▼▼ 表示データの準備 ▼▼▼
    const logDate = dayjs(log.timestamp);
    const isNoon = logDate.format('HH:mm') === '12:00';
    
    // 12:00以外なら時間も表示、12:00なら日付のみ
    const dateDisplay = isNoon 
        ? logDate.format('YYYY.MM.DD') 
        : logDate.format('YYYY.MM.DD HH:mm');

    const isBeer = log.type === 'beer';
    
    // デザインの分岐
    let iconClass = 'ph-beer-bottle';
    let iconColor = 'text-amber-500';
    let bgGradient = 'from-amber-500/20 to-orange-500/20';

    if (!isBeer) {
        iconClass = 'ph-sneaker-move';
        iconColor = 'text-blue-500';
        bgGradient = 'from-blue-500/20 to-cyan-500/20';
    }

    // コンテンツHTML生成
    let detailsHtml = '';
    if (isBeer) {
        const amount = (log.size || 350) * (log.count || 1);
        detailsHtml = `
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-base-50 dark:bg-base-800 p-3 rounded-xl">
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Style</span>
                    <p class="font-bold text-base-900 dark:text-base-100 truncate">${escapeHtml(log.style || '-')}</p>
                </div>
                <div class="bg-base-50 dark:bg-base-800 p-3 rounded-xl">
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Brewery</span>
                    <p class="font-bold text-base-900 dark:text-base-100 truncate">${escapeHtml(log.brewery || '-')}</p>
                </div>
                <div class="bg-base-50 dark:bg-base-800 p-3 rounded-xl">
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Amount</span>
                    <p class="font-bold text-base-900 dark:text-base-100">${amount}ml <span class="text-xs opacity-50">(${log.count} cans)</span></p>
                </div>
                <div class="bg-base-50 dark:bg-base-800 p-3 rounded-xl">
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Rating</span>
                    <div class="flex text-amber-400 text-sm">
                        ${'★'.repeat(log.rating || 0)}${'<span class="opacity-30">★</span>'.repeat(5 - (log.rating || 0))}
                    </div>
                </div>
            </div>
            
            ${log.memo ? `
            <div class="bg-base-50 dark:bg-base-800 p-4 rounded-xl mb-6">
                <span class="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Note</span>
                <p class="text-sm text-base-700 dark:text-base-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(log.memo)}</p>
            </div>` : ''}
        `;
    } else {
        // 運動の場合
        detailsHtml = `
            <div class="bg-base-50 dark:bg-base-800 p-4 rounded-xl mb-6 flex items-center justify-between">
                <div>
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Duration</span>
                    <p class="text-2xl font-black text-base-900 dark:text-base-100">${log.minutes} <span class="text-sm font-bold text-gray-500">min</span></p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] font-bold text-gray-500 uppercase">Earned</span>
                    <p class="text-2xl font-black text-emerald-500">+${Math.round(Math.abs(log.kcal))} <span class="text-sm font-bold text-emerald-500/50">kcal</span></p>
                </div>
            </div>
        `;
    }

    // ▼▼▼ モーダル生成 (ボトムシート構造) ▼▼▼
    const modal = document.createElement('div');
    modal.id = modalId;
    // 下寄せ(items-end) + ポインターイベント制御
    modal.className = "fixed inset-0 z-[1100] flex items-end sm:items-center justify-center pointer-events-none"; 
    
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity duration-300 opacity-0" id="${modalId}-bg"></div>
        
        <div class="relative w-full sm:max-w-lg bg-white dark:bg-base-900 rounded-t-[2rem] sm:rounded-3xl shadow-2xl transform transition-transform duration-300 translate-y-full sm:translate-y-10 opacity-0 pointer-events-auto max-h-[90vh] flex flex-col overflow-hidden" id="${modalId}-content">
            
            <div class="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full sm:hidden z-10"></div>

            <div class="relative h-36 bg-gradient-to-br ${bgGradient} shrink-0 overflow-hidden flex items-center justify-center">
                <i class="ph-fill ${iconClass} text-7xl ${iconColor} drop-shadow-md opacity-80 scale-110"></i>
                
                <button id="btn-close-detail" class="absolute top-4 right-4 w-9 h-9 bg-black/10 hover:bg-black/20 backdrop-blur-md rounded-full text-white/80 flex items-center justify-center transition active:scale-90">
                    <i class="ph-bold ph-x text-lg"></i>
                </button>
            </div>

            <div class="p-6 overflow-y-auto flex-1">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-bold text-gray-400">${dateDisplay}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isBeer ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}">
                        ${isBeer ? 'Beer Log' : 'Exercise'}
                    </span>
                </div>

                <h2 class="text-2xl font-black text-base-900 dark:text-white leading-tight mb-2 line-clamp-2">
                    ${escapeHtml(log.name || (isBeer ? 'Unknown Beer' : 'Exercise'))}
                </h2>
                
                ${isBeer ? `<div class="text-3xl font-black text-red-500 mb-6 flex items-baseline gap-1">-${Math.round(Math.abs(log.kcal))}<span class="text-sm font-bold text-gray-400">kcal</span></div>` : ''}

                ${detailsHtml}
            </div>

            <div class="p-4 border-t border-base-100 dark:border-base-800 bg-base-50/80 dark:bg-base-900/50 backdrop-blur-sm flex gap-3 shrink-0 pb-8 sm:pb-4">
                
                ${isBeer ? `
                <button id="btn-detail-share" class="flex-1 py-3.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition active:scale-95 border border-indigo-100 dark:border-indigo-800/50">
                    <i class="ph-bold ph-share-network text-lg"></i> Share
                </button>
                ` : ''}

                <button id="btn-detail-edit" class="flex-1 py-3.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition active:scale-95">
                    <i class="ph-bold ph-pencil-simple text-lg"></i> Edit
                </button>
                
                <button id="btn-detail-delete" class="w-14 py-3.5 bg-red-50 dark:bg-red-900/20 text-red-500 font-bold rounded-xl flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition active:scale-95 border border-red-100 dark:border-red-900/50">
                    <i class="ph-bold ph-trash text-lg"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // ▼▼▼ アニメーション実行 ▼▼▼
    requestAnimationFrame(() => {
        const bg = document.getElementById(`${modalId}-bg`);
        const content = document.getElementById(`${modalId}-content`);
        if(bg) bg.classList.remove('opacity-0');
        
        // 画面下からスライドアップ
        if(content) {
            content.classList.remove('translate-y-full', 'sm:translate-y-10', 'opacity-0', 'scale-95');
            // opacity-100 scale-100 はデフォルトなのでクラス削除だけでOKだが、明示的に追加も可
        }
    });

    // 閉じる関数
    const closeModalFunc = () => {
        // 閉じる音
        if(typeof Feedback !== 'undefined') Feedback.uiSwitch();

        const bg = document.getElementById(`${modalId}-bg`);
        const content = document.getElementById(`${modalId}-content`);
        
        if(bg) bg.classList.add('opacity-0');
        
        // 画面下へスライドダウン
        if(content) {
            content.classList.add('translate-y-full', 'sm:translate-y-10', 'opacity-0');
        }
        
        setTimeout(() => modal.remove(), 300);
    };

    // イベントリスナー設定
    document.getElementById('btn-close-detail').onclick = closeModalFunc;
    document.getElementById(`${modalId}-bg`).onclick = closeModalFunc;

    const btnShare = document.getElementById('btn-detail-share');
    if (btnShare) {
        btnShare.onclick = () => {
            if(typeof Feedback !== 'undefined') Feedback.uiSwitch();
            closeModalFunc();
            setTimeout(() => {
                Share.generateAndShare('beer', log);
            }, 300);
        };
    }

    // 編集ボタン
    document.getElementById('btn-detail-edit').onclick = () => {
        if(typeof Feedback !== 'undefined') Feedback.uiSwitch();
        closeModalFunc();
        // CustomEventで編集リクエストを発火
        const event = new CustomEvent('request-edit-log', { detail: { id: log.id } });
        document.dispatchEvent(event);
    };

    // 削除ボタン
    document.getElementById('btn-detail-delete').onclick = () => {
        if(typeof Feedback !== 'undefined') Feedback.uiSwitch();
        if(confirm('このログを削除しますか？')) {
            // CustomEventで削除リクエストを発火
            const event = new CustomEvent('request-delete-log', { detail: { id: log.id } });
            document.dispatchEvent(event);
            closeModalFunc();
        }
    };
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
 * 指定した日付の詳細モーダルを開く
 * @param {string} dateStr 'YYYY-MM-DD' 形式
 */
export const openDayDetail = async (dateStr) => {
    const d = dayjs(dateStr);
    
    // 1. 日付表示更新
    document.getElementById('day-detail-date').textContent = d.format('MM/DD (ddd)');
    
    // 2. その日のデータを取得
    const start = d.startOf('day').valueOf();
    const end = d.endOf('day').valueOf();
    
    // StoreやDBから取得（ここではdbを直接叩く例ですが、StoreにあるならそれでもOK）
    const logs = await db.logs.where('timestamp').between(start, end, true, true).reverse().toArray();
    
    // 3. 計算（Earned, Consumed, Balance）
    let earned = 0;
    let consumed = 0;
    
    logs.forEach(log => {
        // ビールは負の値で保存されている前提（例: -150）
        // 運動は正の値（例: +200）
        const kcal = log.kcal || 0;
        if (kcal > 0) earned += kcal;
        else consumed += kcal; // 負の値を足していく（絶対値は増える）
    });
    
    const balance = earned + consumed; // プラスとマイナスの相殺結果
    
    // 数値の整形表示
    document.getElementById('day-detail-earned').textContent = `+${Math.round(earned)}`;
    document.getElementById('day-detail-consumed').textContent = Math.round(consumed); // 既にマイナスがついている想定
    
    const balEl = document.getElementById('day-detail-balance');
    const balVal = Math.round(balance);
    balEl.textContent = (balVal > 0 ? '+' : '') + balVal;
    // バランスの色分け（プラスなら勝ち＝青、マイナスなら負け＝赤 など、お好みで調整）
    
    // 4. リストの描画（簡易版LogListレンダラー）
    const listContainer = document.getElementById('day-detail-list');
    listContainer.innerHTML = '';
    
    if (logs.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-40 text-gray-400 opacity-60">
                <i class="ph-duotone ph-notebook text-4xl mb-2"></i>
                <span class="text-xs font-bold">No logs for this day</span>
            </div>
        `;
    } else {
        logs.forEach(log => {
            const el = document.createElement('div');
            // logListと同じようなデザインクラスを適用
            el.className = "flex items-center justify-between p-3 bg-white dark:bg-base-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm";
            
            const isBeer = log.type === 'beer';
            const iconBg = isBeer 
    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500' 
    : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
            const iconClass = isBeer ? 'ph-beer-bottle' : 'ph-person-simple-run';

            // ▼▼▼ ここを修正：表示テキストの作成ロジック ▼▼▼
            let mainText = log.name; // デフォルト
            let subText = '';

            if (isBeer) {
                // 【上の行】銘柄があれば銘柄、なければスタイル
                if (log.brand && log.brand.trim()) {
                    mainText = log.brand;
                } else {
                    mainText = log.style || log.name;
                }
                
                // 本数が2本以上なら x2 のように個数を付ける
                if (log.count && log.count > 1) {
                    mainText += ` <span class="text-xs opacity-60">x${log.count}</span>`;
                }

                // 【下の行】スタイル + 分量(サイズ)
                const sizeStr = log.size ? `${log.size}ml` : '';
                // スタイル名とサイズを連結
                subText = `${log.style || ''} ${sizeStr}`;
            } else {
                // 運動の場合
                mainText = log.name;
                subText = `${log.minutes} min`;
            }
            // ▲▲▲ 修正ここまで ▲▲▲
            
            // アイテムのHTML生成
            el.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden">
            <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0">
                <i class="ph-fill ${iconClass} text-xl"></i>
            </div>
            <div class="flex flex-col overflow-hidden">
                <span class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                    ${mainText}
                </span>
                <span class="text-[10px] text-gray-400 font-bold truncate">
                    ${subText}
                </span>
            </div>
        </div>
        <div class="text-right shrink-0 ml-2">
            <span class="block text-sm font-black ${isBeer ? 'text-red-500' : 'text-emerald-500'}">
                ${log.kcal > 0 ? '+' : ''}${Math.round(log.kcal)} <span class="text-[10px]">kcal</span>
            </span>
        </div>
    `;

            
            // クリックでそのログの編集を開く（既存の編集機能へ連携）
            el.onclick = () => {
                toggleModal('day-detail-modal', false);
                // 少し待ってから編集モーダルを開く
                setTimeout(() => {
                    if(isBeer) openBeerModal(null, null, log);
                    else openManualInput(null, log);
                }, 200);
            };
            
            listContainer.appendChild(el);
        });
    }

    // 5. ボタンのアクション設定
    // 「ログ追加」ボタン
    document.getElementById('btn-day-add-log').onclick = () => {
        // --- ここから下が「ボタンを押した時」にだけ実行される ---
        
        // 1. 日別詳細モーダルを閉じる
        toggleModal('day-detail-modal', false);

        // 2. 選択された日付を記録
        StateManager.setSelectedDate(dateStr);

        // 3. 次に表示される選択メニュー内のボタンの動きを「この日付用」に上書き
        const beerBtn = document.getElementById('btn-day-selector-beer');
        if (beerBtn) {
            beerBtn.onclick = () => {
                toggleModal('day-add-selector', false);
                openBeerModal(null, dateStr); // 日付を渡す
            };
        }

        const exerciseBtn = document.getElementById('btn-day-selector-exercise');
        if (exerciseBtn) {
            exerciseBtn.onclick = () => {
                toggleModal('day-add-selector', false);
                openManualInput(dateStr); // 日付を渡す
            };
        }

        // 4. ラベル更新
        const label = document.getElementById('day-add-selector-label');
        if(label) label.textContent = dayjs(dateStr).format('MM/DD (ddd) に追加');

        // 5. 選択メニューを開く
        setTimeout(() => toggleModal('day-add-selector', true), 200);
    };

    // 「Daily Check」ボタンも同様に包まれているか確認
    document.getElementById('btn-day-check').onclick = () => {
        toggleModal('day-detail-modal', false);
        setTimeout(() => openCheckModal(dateStr), 200);
    };

    // モーダル表示
    toggleModal('day-detail-modal', true);
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


