import { STYLE_SPECS, CALORIES, SIZE_DATA, STYLE_METADATA, APP } from '../constants.js';
import { Calc, getVirtualDate } from '../logic.js';
import { db } from '../store.js';
import { showMessage, Feedback, toggleModal } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* --- Beer Modal Logic --- */

export const openBeerModal = (e, dateStr = null, log = null) => {
    resetBeerForm();

    // --- 日付セットロジックを整理 ---
    let targetDate;
    if (log) {
        // 編集時：ログのタイムスタンプを使用
        targetDate = dayjs(log.timestamp).format('YYYY-MM-DD');
    } else if (dateStr) {
        // カレンダーからの追加時：渡された日付を使用
        targetDate = dateStr;
    } else {
        // 通常の追加時：今日
        targetDate = getVirtualDate();
    }

    const dateInput = document.getElementById('beer-date');
    if(dateInput) dateInput.value = targetDate;
    // ----------------------------

    updateBeerSelectOptions();

    const abvInput = document.getElementById('preset-abv');
    updateInputSuggestions(); // 予測変換リスト更新

    if (log) {
        const idField = document.getElementById('editing-log-id');
        if(idField) idField.value = log.id;
        document.getElementById('beer-count').value = log.count || 1;
        document.getElementById('beer-brewery').value = log.brewery || '';
        document.getElementById('beer-brand').value = log.brand || log.name || ''; 
        document.getElementById('beer-rating').value = log.rating || 0;
        document.getElementById('beer-memo').value = log.memo || '';
        
        if (log.isCustom || log.type === 'brew') {
            switchBeerInputTab('custom');
            document.getElementById('custom-abv').value = log.abv || 5.0;
            document.getElementById('custom-amount').value = log.rawAmount || log.ml || 350;
            // カスタムタイプの復元
            if (log.customType) {
                const radio = document.querySelector(`input[name="customType"][value="${log.customType}"]`);
                if (radio) radio.checked = true;
            }
        } else {
            switchBeerInputTab('preset');
            const styleSel = document.getElementById('beer-select');
            const sizeSel = document.getElementById('beer-size');
            if (log.style) styleSel.value = log.style;
            if (log.size) sizeSel.value = log.size;
            
            // ★編集時：保存されていた度数がデフォと違うなら入力欄にセット
            const spec = STYLE_SPECS[log.style];
            if (spec && log.abv !== undefined && log.abv !== spec.abv) {
                if (abvInput) abvInput.value = log.abv;
            }
        }
    }
    
    // --- イベントリスナーの登録 ---
    // 入力が変わるたびにプレビューを走らせる
    const monitorIds = ['beer-select', 'beer-size', 'beer-count', 'preset-abv', 'custom-abv', 'custom-amount'];
    monitorIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.oninput = updateBeerKcalPreview;
            el.onchange = updateBeerKcalPreview;
        }
    });

    // カスタムタブのタイプ切り替えも監視
    document.querySelectorAll('input[name="customType"]').forEach(radio => {
        radio.onchange = updateBeerKcalPreview;
    });

    // スタイル選択時にプレースホルダーを更新
    const styleSel = document.getElementById('beer-select');
    if (styleSel && abvInput) {
        styleSel.onchange = () => {
    updateBeerKcalPreview(); // 既存の処理
    
    // 追加: プレースホルダー更新
    const spec = STYLE_SPECS[styleSel.value];
    if (spec && abvInput) abvInput.placeholder = spec.abv;
    };
        // 初期プレースホルダー設定
        const initialSpec = STYLE_SPECS[styleSel.value];
        if (initialSpec) abvInput.placeholder = initialSpec.abv;
    }

    const delBtn = document.getElementById('btn-delete-beer');
    if (delBtn) {
        if (log) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
        else { delBtn.classList.add('hidden'); delBtn.classList.remove('flex'); }
    }
    
    const saveBtn = document.getElementById('btn-save-beer');
    if (saveBtn) {
        saveBtn.textContent = log ? 'Update Drink' : 'Log Drink';
    }

    // 初回プレビュー実行
    updateBeerKcalPreview();

    toggleModal('beer-modal', true);
};


// ★ 引数に existingLog = null を追加します
export const getBeerFormData = (existingLog = null) => {
    const dateVal = document.getElementById('beer-date').value;

    // 未来日付チェック
    if (dateVal && dayjs(dateVal).isAfter(dayjs(), 'day')) {
        showMessage('未来の日付は選択できません', 'error');
        throw new Error('Future date selected');
    }

    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    const rating = parseInt(document.getElementById('beer-rating').value) || 0;
    const memo = document.getElementById('beer-memo').value;
    const untappdCheck = document.getElementById('untappd-check');
    const useUntappd = untappdCheck ? untappdCheck.checked : false;

    const now = dayjs();
    const inputDate = dateVal ? dayjs(dateVal) : now;
    let ts;

    if (existingLog) {
        // 【編集モード】
        // 元のログの日時を取得
        const originalDate = dayjs(existingLog.timestamp);

        // ユーザーが日付(YYYY-MM-DD)を変更していないかチェック
        const isSameDate = inputDate.format('YYYY-MM-DD') === originalDate.format('YYYY-MM-DD');

        if (isSameDate) {
            // 日付が変わっていないなら、元の時間（時:分:秒）を完全に維持する
            ts = existingLog.timestamp;
        } else {
            // 日付を変更した場合、元の「時間」だけを新しい日付に移植する
            // 例: 5/1 23:15 のログを 5/2 に変更 → 5/2 23:15 になる
            ts = inputDate
                .hour(originalDate.hour())
                .minute(originalDate.minute())
                .second(originalDate.second())
                .valueOf();
        }
    } else {
        // 【新規作成モード】
        // 1. 現在の仮想日付（深夜なら前日）を取得
        const vToday = getVirtualDate();

        // 2. フォームの日付が「現在の仮想日付」と同じなら、今まさに記録しているとみなして「現在時刻」を使う
        //    (例: 実時刻 AM2:00 で フォームが昨日日付の場合 → AM2:00 として記録)
        if (dateVal === vToday) {
            ts = Date.now();
        } else {
            // それ以外（過去の日付を意図的に選んだ場合など）は昼12:00とする
            ts = inputDate.startOf('day').add(12, 'hour').valueOf();
        }
    }
    
    const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
    
    const styleSel = document.getElementById('beer-select');
    const style = styleSel.options[styleSel.selectedIndex]?.value || '国産ピルスナー';
    
    const sizeSel = document.getElementById('beer-size');
    const size = sizeSel.options[sizeSel.selectedIndex]?.value || '350';
    
    let count = parseInt(document.getElementById('beer-count').value) || 1;
    if (count <= 0) count = 1; 
    
    const presetAbvInput = document.getElementById('preset-abv');
    const userAbv = presetAbvInput ? parseFloat(presetAbvInput.value) : NaN;

    let customAbv = Math.abs(parseFloat(document.getElementById('custom-abv').value) || 5.0);
    if (customAbv > 100) customAbv = 100;

    let customMl = Math.abs(parseInt(document.getElementById('custom-amount').value) || 350);
    if (customMl <= 0) customMl = 350;

    // --- 糖質タイプ/数値の特定 ---
    let type = 'sweet';
    let carb = 3.0;

    if (isCustom) {
        const typeEl = document.querySelector('input[name="customType"]:checked');
        type = typeEl ? typeEl.value : 'sweet';
        carb = (type === 'dry') ? 0.0 : 3.0;
    } else {
        const spec = STYLE_SPECS[style] || { carb: 3.5 };
        carb = spec.carb;
        type = (carb <= 0.5) ? 'dry' : 'sweet';
    }

    return {
        timestamp: ts,
        brewery, brand, rating, memo,
        style, size, count,
        isCustom,
        userAbv,
        abv: customAbv,
        ml: customMl,
        carb: carb,
        type: type,
        useUntappd
    };
};

/**
 * ビールモーダルの入力内容から推定カロリーをリアルタイム表示する
 */

export const updateBeerKcalPreview = () => {
    const previewEl = document.getElementById('beer-kcal-preview');
    if (!previewEl) return;

    try {
        const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
        const count = parseInt(document.getElementById('beer-count').value) || 1;

        // ▼▼▼ 修正点1: ここでまとめて宣言（const sizeMl... の行は削除しました） ▼▼▼
        let abv, carb, sizeMl;

        if (isCustom) {
            // カスタムタブ: custom-amount から取得
            sizeMl = parseInt(document.getElementById('custom-amount').value) || 350;
            
            abv = parseFloat(document.getElementById('custom-abv').value) || 5.0;
            const typeEl = document.querySelector('input[name="customType"]:checked');
            const type = typeEl ? typeEl.value : 'sweet';
            carb = (type === 'dry') ? 0.0 : 3.0;
        } else {
            // プリセットタブ: beer-size から取得
            sizeMl = parseInt(document.getElementById('beer-size').value) || 0;
            
            const styleKey = document.getElementById('beer-select').value;
            const spec = STYLE_SPECS[styleKey] || { abv: 5.0, carb: 3.5 };
            const userAbvInput = document.getElementById('preset-abv').value;
            abv = (userAbvInput !== "") ? parseFloat(userAbvInput) : spec.abv;
            carb = spec.carb;
        }

        // カロリー計算
        const kcal = Math.abs(Calc.calculateBeerDebit(sizeMl, abv, carb, count));
        previewEl.innerHTML = `${Math.round(kcal)} <span class="text-[10px] font-bold ml-1 text-gray-400">kcal</span>`;
    } catch (e) {
        console.error(e); // エラーが見えるようにログに出力
    }
};

/**
 * 3. 本数調整（ボタン用）修正版
 */
export const adjustBeerCount = (delta) => {

    // ★追加: ダイヤルを回すような「コリッ」とした感触
    Feedback.uiDial();

    const el = document.getElementById('beer-count');
    if (!el) return;

    let val = parseInt(el.value);
    if (isNaN(val)) val = 1;

    // 1未満にはならないように制限
    val = Math.max(1, val + delta);
    el.value = val;

    // ★ここが重要：数値を書き換えたら手動でプレビューを更新する
    if (typeof updateBeerKcalPreview === 'function') {
        updateBeerKcalPreview();
    }

    // 元のコードにあった振動フィードバックも維持
     // ★修正：Feedbackが存在するかチェックしてから、tap() を呼ぶ
    if (typeof Feedback !== 'undefined') {
        if (Feedback.tap) Feedback.tap(); // 音を鳴らす
        if (Feedback.haptic) Feedback.haptic.light(); // 振動させる
    }
};

export const switchBeerInputTab = (mode) => {
    const preset = document.getElementById('beer-input-preset');
    const custom = document.getElementById('beer-input-custom');
    const btnPreset = document.getElementById('tab-beer-preset');
    const btnCustom = document.getElementById('tab-beer-custom');
    
    const activeClasses = ['bg-indigo-600', 'text-white', 'shadow-sm'];
    const inactiveClasses = ['text-gray-500', 'hover:bg-base-200', 'dark:hover:bg-base-800'];

    if (mode === 'preset') {
        preset.classList.remove('hidden'); custom.classList.add('hidden');
        btnPreset.classList.remove(...inactiveClasses); btnPreset.classList.add(...activeClasses);
        btnCustom.classList.remove(...activeClasses); btnCustom.classList.add(...inactiveClasses);
    } else {
        preset.classList.add('hidden'); custom.classList.remove('hidden');
        btnPreset.classList.remove(...activeClasses); btnPreset.classList.add(...inactiveClasses);
        btnCustom.classList.remove(...inactiveClasses); btnCustom.classList.add(...activeClasses);
    }
    updateBeerKcalPreview();
};

export const resetBeerForm = (keepDate = false) => {
    if (!keepDate) {
        document.getElementById('beer-date').value = getVirtualDate();
    }
    
    const idField = document.getElementById('editing-log-id');
    if(idField) idField.value = '';
    
    document.getElementById('beer-count').value = 1;
    document.getElementById('beer-brewery').value = '';
    document.getElementById('beer-brand').value = '';
    document.getElementById('beer-rating').value = '0';
    document.getElementById('beer-memo').value = '';
    
    // ★ 度数補正フィールドもリセット
    const presetAbv = document.getElementById('preset-abv');
    if(presetAbv) presetAbv.value = '';
    
    const untappdCheck = document.getElementById('untappd-check');
    if(untappdCheck) untappdCheck.checked = false;
    
    switchBeerInputTab('preset');
};

export const searchUntappd = () => {
    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    if (!brand) { 
        showMessage('検索するにはビール名を入力してください', 'error'); 
        return; 
    }
    const query = encodeURIComponent(`${brewery} ${brand}`.trim());
    window.open(`https://untappd.com/search?q=${query}`, '_blank');
};

export const updateBeerSelectOptions = () => {
    const styleSel = document.getElementById('beer-select');
    const sizeSel = document.getElementById('beer-size');
    
    if (styleSel && styleSel.children.length === 0) {
        const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
        const styles = Object.keys(source || {});
        
        styles.forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key;
            styleSel.appendChild(opt);
        });
        if (APP.DEFAULTS.MODE1) styleSel.value = APP.DEFAULTS.MODE1;
    }

    if (sizeSel && sizeSel.children.length === 0) {
        Object.entries(SIZE_DATA).forEach(([key, val]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = val.label;
            sizeSel.appendChild(opt);
        });
        sizeSel.value = '350'; 
    }
};

export const updateInputSuggestions = async () => {
    try {
        // DBからビール記録だけを取得（非同期）
        const logs = await db.logs.where('type').equals('beer').toArray();
        
        // 重複を除外してリスト化
        // Setを使うことで、同じ銘柄が何度あっても1つにまとめられます
        const breweries = [...new Set(logs.map(l => l.brewery).filter(b => b))].sort();
        const brands = [...new Set(logs.map(l => l.brand || l.name).filter(b => b))].sort();

        // datalistの中身を更新するヘルパー関数
        const updateList = (id, items) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = ''; // クリア
            
            // 最大50件程度に制限（多すぎると重くなるため）
            // 最近使った順にソートするロジックを入れても良いですが、まずは辞書順で
            items.slice(0, 100).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                el.appendChild(opt);
            });
        };

        updateList('brewery-list', breweries);
        updateList('brand-list', brands);
        
    } catch (e) {
        console.error("Failed to update suggestions:", e);
    }
};




