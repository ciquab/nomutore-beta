import { EXERCISE } from '../constants.js';
import { getVirtualDate } from '../logic.js';
import { showMessage, Feedback } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * 運動入力フォームの初期化と表示
 */
export const openManualInput = (dateStr = null, log = null) => {
    const idField = document.getElementById('editing-exercise-id');
    const minField = document.getElementById('manual-minutes');
    const dateField = document.getElementById('manual-date');
    const bonusCheck = document.getElementById('manual-apply-bonus');
    const saveBtn = document.getElementById('btn-save-exercise'); 
    const deleteBtn = document.getElementById('btn-delete-exercise');

    // 1. 日付の決定
    let targetDate = log ? dayjs(log.timestamp).format('YYYY-MM-DD') 
                    : (dateStr || getVirtualDate());
    if(dateField) dateField.value = targetDate;

    // 2. 運動リストの生成（空の場合のみ）
    initExerciseOptions();

    const typeSel = document.getElementById('exercise-select');

    if (log) {
        // 【編集モード】
        if(idField) idField.value = log.id;
        if(minField) minField.value = log.rawMinutes || log.minutes || 30;
        if (typeSel && log.exerciseKey) typeSel.value = log.exerciseKey;
        if (saveBtn) saveBtn.textContent = 'Update Workout';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        
        if (bonusCheck) {
            const hasBonus = (log.applyBonus !== undefined) ? log.applyBonus : (log.memo && log.memo.includes('Bonus'));
            bonusCheck.checked = !!hasBonus;
        }
    } else {
        // 【新規作成モード】
        if(idField) idField.value = '';
        if(minField) minField.value = '';
        if (saveBtn) saveBtn.textContent = 'Log Workout';
        if (typeSel) typeSel.value = localStorage.getItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE) || APP.DEFAULTS.DEFAULT_RECORD_EXERCISE;
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (bonusCheck) bonusCheck.checked = true;
    }

    toggleModal('exercise-modal', true);
};

/**
 * 運動セレクトボックスの選択肢を生成（内部ヘルパー）
 */
const initExerciseOptions = () => {
    const typeSel = document.getElementById('exercise-select');
    if (!typeSel || typeSel.children.length > 0) return;

    typeSel.innerHTML = '';
    Object.keys(EXERCISE).forEach(k => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = EXERCISE[k].label; 
        typeSel.appendChild(o);
    });
};

/**
 * 運動入力フォームからデータを収集・バリデーションする
 * (service.js にあった DOM取得ロジックの引っ越し先)
 */
export const getExerciseFormData = () => {
    // 1. DOMから値をかき集める
    const idVal = document.getElementById('editing-exercise-id')?.value;
    const date = document.getElementById('manual-date')?.value;
    const minutes = parseInt(document.getElementById('manual-minutes')?.value || '0', 10);
    const key = document.getElementById('exercise-select')?.value;
    const applyBonus = document.getElementById('manual-apply-bonus')?.checked ?? true;

    // 2. バリデーション (UI層で弾くべき不備)
    if (!date || isNaN(minutes) || minutes <= 0) {
        throw new Error('日付と時間を正しく入力してください');
    }

    // 3. タイムスタンプの計算 (Logicとして整える)
    const now = dayjs();
    const inputDate = dayjs(date);
    const timestamp = inputDate.isSame(now, 'day')
        ? Date.now()
        : inputDate.startOf('day').add(12, 'hour').valueOf();

    // 4. クリーンなデータオブジェクトを返す
    return {
        exerciseKey: key,
        minutes: minutes,
        date: date,
        timestamp: timestamp,
        applyBonus: applyBonus,
        id: idVal ? parseInt(idVal) : null
    };
};