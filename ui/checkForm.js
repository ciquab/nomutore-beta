import { CHECK_SCHEMA, APP, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, getCheckItemSpec } from '../constants.js';
import { getVirtualDate } from '../logic.js';
import { db } from '../store.js';
import { StateManager } from './state.js';
import { DOM, toggleModal, showMessage, Feedback, toggleDryDay } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

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
        const schema = getStoredSchema();

        schema.forEach(item => {
            const div = document.createElement('div');
            const visibilityClass = item.drinking_only ? 'drinking-only' : '';
            if (visibilityClass) div.className = visibilityClass;
            
            // ★修正: マスタデータ(constants.js)から最新定義を取得してアイコンを上書き表示
            const spec = getCheckItemSpec(item.id);
            const iconDef = (spec && spec.icon) ? spec.icon : item.icon;
            const iconHtml = DOM.renderIcon(iconDef, 'text-xl text-indigo-500 dark:text-indigo-400');

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
                    const iconHtml = DOM.renderIcon(spec?.icon || 'ph-bold ph-clock-counter-clockwise', 'text-lg text-amber-500');

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

export const renderCheckEditor = () => {
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

// --- 内部ヘルパー関数群 ---

const getStoredSchema = () => {
    try {
        const stored = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
        return stored ? JSON.parse(stored) : getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
    } catch(e) {
        return getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
    }
};

const getActiveSchemaFromIds = (ids) => {
    const activeSchema = [];
    const flatLibrary = Object.values(CHECK_LIBRARY).flat();
    
    ids.forEach(id => {
        const item = flatLibrary.find(i => i.id === id);
        if (item) activeSchema.push(item);
    });
    return activeSchema;
};

export const syncDryDayUI = (isDry) => {
    const items = document.querySelectorAll('.drinking-only');
    items.forEach(el => el.classList.toggle('hidden', isDry));
    toggleDryDay(isDry);
};

/**
 * デイリーチェックの入力内容を収集してオブジェクトで返す
 * @returns {Object} 収集されたチェックデータ
 */
export const getCheckFormData = () => {
    const date = document.getElementById('check-date')?.value;
    const isDryDay = document.getElementById('check-is-dry')?.checked || false;
    const weight = document.getElementById('check-weight')?.value || '';

    // 現在のスキーマを取得して、動的チェックボックスの値を集める
    const schema = getStoredSchema();

    // 基本データ構造
    const data = {
        date,
        isDryDay,
        weight,
        isSaved: true
    };

    // 各項目のチェック状態をIDをキーにして格納
    schema.forEach(item => {
        const el = document.getElementById(`check-${item.id}`);
        // 要素があればその checked 状態、なければ false
        data[item.id] = el ? el.checked : false;
    });

    return data;
};
