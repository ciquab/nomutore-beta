import { EXERCISE } from '../constants.js';
import { db } from '../store.js';
import { StateManager } from './state.js';
import { DOM, toggleModal, escapeHtml, showMessage, Feedback } from './dom.js';
import { Share } from './share.js';
import { openBeerModal } from './beerForm.js';
import { openManualInput } from './exerciseForm.js';
import { openCheckModal } from './checkForm.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

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
    const closeModalFunc = (silent = false) => {
        // 引数が true でない時だけ音を鳴らす
        if(!silent && typeof Feedback !== 'undefined') Feedback.uiSwitch();

        const bg = document.getElementById(`${modalId}-bg`);
        const content = document.getElementById(`${modalId}-content`);
        if(bg) bg.classList.add('opacity-0');
        if(content) content.classList.add('translate-y-full', 'sm:translate-y-10', 'opacity-0');
        
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

    // --- 編集ボタンの修正 ---
    document.getElementById('btn-detail-edit').onclick = () => {
        // ここでの音（uiSwitch）を削除
        closeModalFunc(true); // 音なしで閉じる
        const event = new CustomEvent('request-edit-log', { detail: { id: log.id } });
        document.dispatchEvent(event);
    };

    // --- 削除ボタンの修正 ---
    document.getElementById('btn-detail-delete').onclick = () => {
        // ここでの音（uiSwitch）を削除
        // 確認ダイアログを出し、OKならイベントを飛ばす
        if(confirm('このログを削除しますか？')) {
            const event = new CustomEvent('request-delete-log', { detail: { id: log.id } });
            document.dispatchEvent(event);
            closeModalFunc(true); // 削除音が index.js 側で鳴るので、こちらは音なしで閉じる
        }
    };
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

