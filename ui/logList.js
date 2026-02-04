import { db } from '../store.js';
import { DOM, escapeHtml, Feedback, AudioEngine } from './dom.js';
import { EXERCISE, CALORIES, STYLE_METADATA } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 状態管理
let currentLimit = 20; // 最初に表示する件数
const LIMIT_STEP = 20; // 追加で読み込む件数

export const toggleEditMode = () => {
    const isEdit = !StateManager.isEditMode;
    StateManager.setIsEditMode(isEdit);
    
    // UI反映
    updateLogListView(false); // 再描画してチェックボックスを表示
    
    // Select Allボタンの表示制御
    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        if (isEdit) selectAllBtn.classList.remove('hidden');
        else selectAllBtn.classList.add('hidden');
    }
    
    updateBulkActionUI();
};

export const toggleSelectAll = () => {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    // 全てチェック済みなら解除、そうでなければ全選択
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateBulkActionUI();
};

// 選択状態に応じてアクションバー（削除ボタン等）の表示を更新
export const updateBulkCount = () => {
    updateBulkActionUI();
};

const updateBulkActionUI = () => {
    const count = document.querySelectorAll('.log-checkbox:checked').length;
    
    // 編集モードツールバー（Select Allなど）の制御
    const toolbar = document.getElementById('edit-toolbar'); // HTMLに存在すれば
    if (toolbar) toolbar.classList.toggle('hidden', !StateManager.isEditMode);
    
    // 一括削除ボタンエリア
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.innerHTML = `<i class="ph-bold ph-trash"></i> Delete (${count})`;
        // ボタンの表示/非表示
        if(StateManager.isEditMode) {
             deleteBtn.classList.remove('translate-y-20', 'opacity-0');
        } else {
             deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }
    }
    
    // 既存のツールバー内カウント更新（もしあれば）
    const countLabel = document.getElementById('bulk-selected-count');
    if (countLabel) countLabel.textContent = count;
};

// 選択されたログを一括削除
export const deleteSelectedLogs = async () => {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (!confirm(`合計 ${checkboxes.length} 件の記録を削除しますか？`)) return;

    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
    
   try {
        // --- ★ここを追加！ブラウザの権限があるこの瞬間に鳴らす ---
        if (typeof AudioEngine !== 'undefined') AudioEngine.resume();
        if (typeof Feedback !== 'undefined' && Feedback.delete) {
            Feedback.delete(); // 「シュッ」という音
        }
        // -----------------------------------------------------

        await Service.bulkDeleteLogs(ids);
        
        StateManager.setIsEditMode(false);
        updateBulkActionUI();
        await updateLogListView(false); 
    } catch (e) {
        console.error(e);
        alert('記録の削除に失敗しました。');
    }
};


// リスト描画のメイン関数 (Phase 2 Optimized)
export const updateLogListView = async (isLoadMore = false) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (isLoadMore) {
        currentLimit += LIMIT_STEP;
    } else {
        // ★修正点1: 読み込み直し（タブ切り替え時など）はリセット
        // これがないと、他のタブから戻った時にリストが長くなりすぎている場合があります
        currentLimit = 20; 
    }

    // データ取得
    const { allLogs } = await Service.getAppDataSnapshot();
    
    // 全期間のログを日付順（新しい順）に並べ替え
    const sortedLogs = allLogs.sort((a, b) => b.timestamp - a.timestamp);
    
    const totalCount = sortedLogs.length;
    const logs = sortedLogs.slice(0, currentLimit);

    // ★修正点2: 高速化のための DocumentFragment 作成
    // メモリ上でDOMを構築し、最後に一度だけ画面に描画します（再描画コストの削減）
    const fragment = document.createDocumentFragment();

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    let currentDateStr = '';

    logs.forEach((log, index) => {
        // 日付のみ表示
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        // Sticky Header Logic (デザイン維持)
        if (dateStr !== currentDateStr) {
            const header = document.createElement('li');
            header.className = "sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1";
            header.innerHTML = `<span>${dateStr}</span>`;
            
            // ★ fragmentに追加
            fragment.appendChild(header);
            currentDateStr = dateStr;
        }

        const li = document.createElement('li');
        li.className = "log-item relative group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 mb-3 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer group";
        
        // アニメーション用遅延
        li.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;
        
        let iconSizeClass = "w-12 h-12 text-xl";
        let colorClass = 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500';
        let iconDef = 'ph-duotone ph-beer-bottle';
        let mainText = '';
        let subText = '';
        let rightContent = '';

        if (log.type === 'exercise') {
            const ex = EXERCISE[log.exerciseKey];
            iconDef = ex ? ex.icon : 'ph-duotone ph-sneaker-move';
            colorClass = 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
            mainText = log.name; 
            subText = `<span class="font-bold text-gray-600 dark:text-gray-300">${log.minutes} min</span> · -${Math.round(log.kcal)} kcal`;
            rightContent = `<span class="text-sm font-black text-indigo-500">+${Math.round(log.kcal)}</span>`;
        } else if (log.type === 'beer') {
            const size = log.size || 350;
            const count = log.count || 1;

            // ★修正: スタイル定義からアイコンクラスを取得
            const styleMeta = STYLE_METADATA[log.style];
            iconDef = styleMeta ? styleMeta.icon : 'ph-duotone ph-beer-bottle';
            
            if (log.brand) {
                mainText = log.brewery ? `<span class="text-[10px] opacity-60 block leading-tight mb-0.5 font-bold uppercase tracking-wide">${escapeHtml(log.brewery)}</span>${escapeHtml(log.brand)}` : escapeHtml(log.brand);
            } else {
                mainText = escapeHtml(log.name); 
            }

            const styleInfo = log.style ? ` · ${log.style}` : ''; 
            const totalMl = size * count;
            subText = `${count} cans <span class="opacity-60">(${totalMl}ml)</span>${styleInfo}`;
            
            if(log.rating > 0) {
                rightContent = `<div class="flex items-center bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-lg"><span class="text-xs font-bold text-yellow-600 dark:text-yellow-400">★${log.rating}</span></div>`;
            }
        }

        // ★修正: DOM.renderIconを通してHTMLタグ化
        const iconHtml = DOM.renderIcon(iconDef, 'text-2xl');

        const checkboxHtml = StateManager.isEditMode ? `
            <div class="mr-2">
                <input type="checkbox" class="log-checkbox checkbox checkbox-sm checkbox-primary rounded-md" data-id="${log.id}">
            </div>
        ` : '';

        li.innerHTML = `
            ${checkboxHtml}
            <div class="${iconSizeClass} rounded-full ${colorClass} flex items-center justify-center shrink-0 shadow-inner">
                ${iconHtml}
            </div>

            <div class="flex-1 min-w-0 cursor-pointer" onclick="UI.openLogDetail(${log.id})">
                <div class="flex justify-between items-start">
                    <div class="text-base font-bold text-gray-900 dark:text-gray-50 leading-snug">${mainText}</div>
                    <div class="ml-2 flex-shrink-0">${rightContent}</div>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-medium opacity-90">${subText}</div>
                
                ${log.memo ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5 rounded-lg inline-block max-w-full"><i class="ph-bold ph-note-pencil mr-1 opacity-70"></i>${escapeHtml(log.memo)}</div>` : ''}
            </div>
        `;
        
        // ★ fragmentに追加
        fragment.appendChild(li);
    });

    // ★修正点3: 最後にまとめて描画 (innerHTMLクリア -> append)
    // これにより、リスト書き換えによる「ガタつき」や「リフロー（再計算）」が1回だけで済みます
    listEl.innerHTML = '';
    listEl.appendChild(fragment);

    // 「Load More」ボタンの表示制御
    if (loadMoreBtn) {
        if (totalCount > currentLimit) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `Load More (${totalCount - currentLimit} remaining)`;
            loadMoreBtn.onclick = () => updateLogListView(true);
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
    
    // イベントリスナー再設定
    document.querySelectorAll('.log-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkCount);
    });
};

// モジュール外から呼べるように割り当て
updateLogListView.updateBulkCount = updateBulkCount;

// ダミー関数（互換性維持）

export const setFetchLogsHandler = (fn) => {};

